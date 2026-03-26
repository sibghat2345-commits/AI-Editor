import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import { GoogleGenAI, Modality } from '@google/genai';

// Set FFmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());

// Setup storage for uploads
const uploadDir = path.join(process.cwd(), 'uploads');
const outputDir = path.join(process.cwd(), 'outputs');
const avatarDir = path.join(process.cwd(), 'avatars');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage });

// AI Setup
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// Caching
const aiCache = new Map<string, any>();

// Job tracking
const jobs = new Map<string, { status: 'processing' | 'completed' | 'failed', progress: number, result?: any, error?: string }>();

// Optimized FFmpeg Helper
const runFFmpeg = (inputPath: string, outputPath: string, options: any) => {
  return new Promise((resolve, reject) => {
    let ff = ffmpeg(inputPath)
      .outputOptions([
        '-preset slow',      // Better compression/quality ratio for final output
        '-crf 18',           // Visually lossless
        '-movflags +faststart',
        '-pix_fmt yuv420p',  // Maximum compatibility
        '-threads 0'
      ]);

    // Audio Enhancement
    let audioFilters = [];
    if (options.enhanceVoice) {
      audioFilters.push('highpass=f=200', 'lowpass=f=3000', 'afftdn', 'arnndn=model=bd.rnnn');
    }
    if (options.normalizeAudio) {
      audioFilters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
    }
    if (audioFilters.length > 0) ff = ff.audioFilters(audioFilters);

    if (options.trim) {
      ff = ff.setStartTime(options.trim.start).setDuration(options.trim.duration);
    }

    if (options.crop) {
      // 9:16 crop for reels
      ff = ff.videoFilters('crop=ih*9/16:ih');
    }

    if (options.filters) {
      const filters = options.filters.map((f: any) => {
        if (f.type === 'grayscale') return 'colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3';
        if (f.type === 'noise_reduction') return 'hqdn3d=1.5:1.5:6:6';
        if (f.type === 'vignette') return 'vignette=PI/4';
        if (f.type === 'brightness') return `eq=brightness=${f.value || 0}`;
        if (f.type === 'contrast') return `eq=contrast=${f.value || 1}`;
        return null;
      }).filter(Boolean);
      
      if (filters.length > 0) ff = ff.videoFilters(filters);
    }

    if (options.speed) {
      ff = ff.videoFilters(`setpts=${1/options.speed}*PTS`).audioFilters(`atempo=${options.speed}`);
    }

    ff.on('progress', (progress) => {
      if (options.jobId) {
        const job = jobs.get(options.jobId);
        if (job) jobs.set(options.jobId, { ...job, progress: progress.percent || 0 });
      }
    })
    .on('end', () => resolve(outputPath))
    .on('error', (err) => reject(err))
    .save(outputPath);
  });
};

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/upload', upload.single('video'), (req: any, res) => {
  console.log('Upload request received');
  if (!req.file) {
    console.error('No file in request');
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  console.log('File uploaded successfully:', req.file.filename);
  res.json({ 
    id: req.file.filename,
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname,
    size: req.file.size,
    type: 'video' // Default to video for now
  });
});

app.post('/api/ai/parse-command', async (req, res) => {
  const { prompt, videoMetadata } = req.body;
  
  if (aiCache.has(prompt)) {
    return res.json(aiCache.get(prompt));
  }

  try {
    const systemInstruction = `
      You are a professional video editing assistant. Convert user prompts into a list of structured commands.
      Available actions: trim, crop, filter, speed, text, subtitle, color_correct, noise_reduction.
      Support multi-step commands in a single prompt.
      Output ONLY a JSON array of objects.
      Example: [{ "action": "trim", "params": { "start": 0, "duration": 5 } }, { "action": "filter", "params": { "type": "grayscale" } }]
      If the prompt is vague, infer the most likely professional edit.
    `;
    
    const result = await genAI.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { systemInstruction, responseMimeType: 'application/json' }
    });
    
    const commands = JSON.parse(result.text || '[]');
    const response = { commands, interpretation: `I will ${commands.map((c: any) => c.action).join(' and ')} your video.` };
    aiCache.set(prompt, response);
    res.json(response);
  } catch (error) {
    console.error('AI Error:', error);
    res.status(500).json({ error: 'Failed to parse AI command' });
  }
});

app.post('/api/process', async (req, res) => {
  const { inputId, commands } = req.body;
  const jobId = uuidv4();
  const inputPath = path.join(uploadDir, inputId);
  const outputId = `${uuidv4()}.mp4`;
  const outputPath = path.join(outputDir, outputId);

  jobs.set(jobId, { status: 'processing', progress: 0 });

  // Process commands into runFFmpeg options
  const options: any = { jobId, filters: [], enhanceVoice: false, normalizeAudio: true };
  commands.forEach((cmd: any) => {
    if (cmd.action === 'trim') options.trim = cmd.params;
    if (cmd.action === 'speed') options.speed = cmd.params.factor;
    if (cmd.action === 'filter') options.filters.push(cmd.params);
    if (cmd.action === 'crop') options.crop = true;
    if (cmd.action === 'noise_reduction') {
      options.filters.push({ type: 'noise_reduction' });
      options.enhanceVoice = true;
    }
    if (cmd.action === 'enhance_audio') options.normalizeAudio = true;
    if (cmd.action === 'color_correct') {
      options.filters.push({ type: 'brightness', value: 0.02 });
      options.filters.push({ type: 'contrast', value: 1.05 });
    }
  });

  runFFmpeg(inputPath, outputPath, options)
    .then(() => {
      jobs.set(jobId, { status: 'completed', progress: 100, result: { url: `/outputs/${outputId}`, id: outputId } });
    })
    .catch((err) => {
      console.error('FFmpeg Error:', err);
      jobs.set(jobId, { status: 'failed', progress: 0, error: err.message });
    });

  res.json({ jobId });
});

app.get('/api/job/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.post('/api/ai/generate-script', async (req, res) => {
  const { topic } = req.body;
  try {
    const prompt = `Generate a viral video script for a YouTube Short about: ${topic}. Include scenes, voiceover text, and visual descriptions. Return as JSON.`;
    
    const result = await genAI.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json' }
    });
    
    res.json(JSON.parse(result.text || '{}'));
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate script' });
  }
});

app.post('/api/ai/monetize', async (req, res) => {
  const { projectData } = req.body;
  try {
    const prompt = `Analyze this video project and generate 3 viral titles, a 500-word SEO description, and 20 trending tags. Project: ${JSON.stringify(projectData)}`;
    
    const result = await genAI.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json' }
    });
    
    res.json(JSON.parse(result.text || '{}'));
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate monetization pack' });
  }
});

app.post('/api/ai/generate-avatar', async (req, res) => {
  const { prompt, text } = req.body;
  try {
    // 1. Generate Avatar Image
    const imageResponse = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: `A professional 3D animated avatar for a video editor, ${prompt}. High quality, cinematic lighting.` }] }
    });

    let imageBase64 = '';
    for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) imageBase64 = part.inlineData.data;
    }

    const imageId = uuidv4();
    const imagePath = path.join(avatarDir, `${imageId}.png`);
    if (imageBase64) fs.writeFileSync(imagePath, Buffer.from(imageBase64, 'base64'));

    // 2. Generate Speech
    const speechResponse = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
      }
    });

    const audioBase64 = speechResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    const audioId = uuidv4();
    const audioPath = path.join(avatarDir, `${audioId}.wav`);
    if (audioBase64) fs.writeFileSync(audioPath, Buffer.from(audioBase64, 'base64'));

    res.json({
      imageUrl: `/avatars/${imageId}.png`,
      audioUrl: `/avatars/${audioId}.wav`
    });
  } catch (error) {
    console.error('Avatar Error:', error);
    res.status(500).json({ error: 'Failed to generate AI avatar' });
  }
});

app.post('/api/ai/generate-reels', async (req, res) => {
  const { inputId } = req.body;
  const jobId = uuidv4();
  const inputPath = path.join(uploadDir, inputId);
  const outputId = `reel-${uuidv4()}.mp4`;
  const outputPath = path.join(outputDir, outputId);

  jobs.set(jobId, { status: 'processing', progress: 0 });

  // Simulate highlight detection and crop
  // In a real app, we'd analyze frames or use a dedicated highlight API
  const options = {
    jobId,
    crop: true, // 9:16 crop
    trim: { start: 0, duration: 15 }, // Take first 15s as a "highlight" for now
    normalizeAudio: true,
    enhanceVoice: true
  };

  runFFmpeg(inputPath, outputPath, options)
    .then(() => {
      jobs.set(jobId, { status: 'completed', progress: 100, result: { url: `/outputs/${outputId}`, id: outputId } });
    })
    .catch((err) => {
      console.error('Reels Error:', err);
      jobs.set(jobId, { status: 'failed', progress: 0, error: err.message });
    });

  res.json({ jobId });
});

// Serve static files
app.use('/uploads', express.static(uploadDir));
app.use('/outputs', express.static(outputDir));
app.use('/avatars', express.static(avatarDir));

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Vinci AI Server running on http://localhost:${PORT}`);
  });
}

startServer();
