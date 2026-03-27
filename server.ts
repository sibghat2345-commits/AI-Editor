import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { exec } from 'child_process';
import util from 'util';
import { createClient } from '@supabase/supabase-js';

const execPromise = util.promisify(exec);

// --- Supabase Setup (Optional Free Tier) ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

if (supabase) {
  console.log('Supabase client initialized for free-tier storage/DB.');
} else {
  console.log('Supabase credentials not found. Running in full local mode.');
}

// Set FFmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const app = express();
const PORT = 3000;

// --- Production Configuration ---
const isProduction = process.env.NODE_ENV === 'production';

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Middleware
app.use(express.json());
app.use('/api/', limiter);

// Logging Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

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

// --- Local AI Model Implementations (Free & Open Source) ---

/**
 * Hybrid NLP Parser: Converts user prompts into structured video editing commands.
 * Uses a combination of regex and keyword matching for zero-cost, local execution.
 */
const parseAICommandLocally = (prompt: string): any[] => {
  const commands: any[] = [];
  const p = prompt.toLowerCase();

  // Trim detection: "cut from 5s to 10s", "trim first 5 seconds"
  const trimMatch = p.match(/trim (?:the )?(?:first )?(\d+)\s*s/i) || p.match(/cut (?:the )?(?:first )?(\d+)\s*s/i);
  if (trimMatch) {
    commands.push({ action: 'trim', params: { start: 0, duration: parseInt(trimMatch[1]) } });
  }

  // Filter detection
  const filters = ['grayscale', 'sepia', 'vivid', 'cinematic', 'blur', 'sharpen', 'vignette'];
  filters.forEach(f => {
    if (p.includes(f)) {
      commands.push({ action: 'filter', params: { type: f } });
    }
  });

  // Speed detection: "2x speed", "slow motion"
  if (p.includes('2x') || p.includes('double speed')) {
    commands.push({ action: 'speed', params: { factor: 2 } });
  } else if (p.includes('slow motion') || p.includes('half speed')) {
    commands.push({ action: 'speed', params: { factor: 0.5 } });
  }

  // Crop/Reels detection
  if (p.includes('reel') || p.includes('tiktok') || p.includes('9:16') || p.includes('vertical')) {
    commands.push({ action: 'crop', params: { ratio: '9:16' } });
  }

  // Audio enhancement
  if (p.includes('audio') || p.includes('voice') || p.includes('denoise') || p.includes('normalize')) {
    commands.push({ action: 'enhance_audio', params: { normalize: true, denoise: true } });
  }

  return commands;
};

/**
 * Local Whisper STT (Placeholder for CLI integration)
 */
const transcribeLocally = async (audioPath: string): Promise<string> => {
  logger.info(`Running local Whisper on ${audioPath}`);
  // In a real setup, this would call: whisper audioPath --model base --output_format txt
  // For now, we return a placeholder.
  return "Transcribed text from local Whisper model.";
};

/**
 * Local Coqui TTS (Placeholder for CLI integration)
 */
const generateSpeechLocally = async (text: string, outputPath: string): Promise<void> => {
  logger.info(`Running local Coqui TTS for: ${text}`);
  // In a real setup, this would call: tts --text "text" --model_name "tts_models/en/ljspeech/vits" --out_path outputPath
  // For now, we copy a silent or placeholder audio if it exists, or just log.
  fs.writeFileSync(outputPath, Buffer.from([])); // Dummy file
};

/**
 * Local Wav2Lip (Placeholder for CLI integration)
 */
const runLipSyncLocally = async (videoPath: string, audioPath: string, outputPath: string): Promise<void> => {
  logger.info(`Running local Wav2Lip for ${videoPath} and ${audioPath}`);
  // In a real setup, this would call: python inference.py --checkpoint_path wav2lip.pth --face videoPath --audio audioPath --outfile outputPath
  // For now, we just copy the input video to output as a placeholder.
  fs.copyFileSync(videoPath, outputPath);
};

// Caching
const aiCache = new Map<string, any>();

// --- Auto Cleanup of Temporary Files ---
const CLEANUP_INTERVAL = 60 * 60 * 1000; // Every hour
const MAX_FILE_AGE = 24 * 60 * 60 * 1000; // 24 hours

const cleanupFiles = (dir: string) => {
  if (!fs.existsSync(dir)) return;
  fs.readdir(dir, (err, files) => {
    if (err) return logger.error(`Cleanup error in ${dir}:`, err);
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(dir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (now - stats.mtimeMs > MAX_FILE_AGE) {
          fs.unlink(filePath, err => {
            if (err) logger.error(`Failed to delete ${filePath}:`, err);
            else logger.info(`Deleted old file: ${filePath}`);
          });
        }
      });
    });
  });
};

setInterval(() => {
  cleanupFiles(uploadDir);
  cleanupFiles(outputDir);
  cleanupFiles(avatarDir);
}, CLEANUP_INTERVAL);

// --- Logger ---
const logger = {
  info: (msg: string, ...args: any[]) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args)
};

// --- Job tracking ---
interface Job {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  result?: any;
  error?: string;
  type: string;
  createdAt: string;
}
const jobs = new Map<string, Job>();

// Optimized FFmpeg Helper
const runFFmpeg = (inputPath: string, outputPath: string, options: any) => {
  return new Promise((resolve, reject) => {
    logger.info(`Starting FFmpeg job for ${inputPath} -> ${outputPath}`);
    
    let ff = ffmpeg(inputPath)
      .outputOptions([
        '-preset fast',      // Faster for dev, 'slow' for prod
        '-crf 20',           // Balanced quality/size
        '-movflags +faststart',
        '-pix_fmt yuv420p',
        '-threads 0'
      ]);

    // Audio Enhancement
    let audioFilters = [];
    if (options.enhanceVoice) {
      // Basic voice enhancement: highpass/lowpass + noise reduction
      audioFilters.push('highpass=f=150', 'lowpass=f=4000', 'afftdn');
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

    // Video Filters
    if (options.filters) {
      const filters = options.filters.map((f: any) => {
        if (f.type === 'grayscale') return 'colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3';
        if (f.type === 'noise_reduction') return 'hqdn3d=1.5:1.5:6:6';
        if (f.type === 'vignette') return 'vignette=PI/4';
        if (f.type === 'brightness') return `eq=brightness=${f.value || 0}`;
        if (f.type === 'contrast') return `eq=contrast=${f.value || 1}`;
        if (f.type === 'saturation') return `eq=saturation=${f.value || 1}`;
        if (f.type === 'sepia') return 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131';
        if (f.type === 'sharpen') return 'unsharp=3:3:1.5:3:3:0.5';
        if (f.type === 'blur') return 'boxblur=10:1';
        if (f.type === 'cinematic') return 'curves=preset=vintage,format=yuv420p';
        if (f.type === 'vivid') return 'eq=contrast=1.2:saturation=1.3:brightness=0.02';
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
        if (job) jobs.set(options.jobId, { ...job, progress: Math.min(99, progress.percent || 0) });
      }
    })
    .on('end', () => {
      logger.info(`FFmpeg job completed: ${options.jobId}`);
      resolve(outputPath);
    })
    .on('error', (err) => {
      logger.error(`FFmpeg job failed: ${options.jobId}`, err);
      reject(err);
    })
    .save(outputPath);
  });
};

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(), 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
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
  const { prompt } = req.body;
  
  if (aiCache.has(prompt)) {
    return res.json(aiCache.get(prompt));
  }

  try {
    const commands = parseAICommandLocally(prompt);
    const interpretation = commands.length > 0 
      ? `I've analyzed your request and will apply: ${commands.map((c: any) => c.action.replace('_', ' ')).join(', ')}.`
      : "I've analyzed your request but couldn't find specific editing actions. Try commands like 'trim first 5s' or 'apply cinematic filter'.";
      
    const response = { commands, interpretation };
    aiCache.set(prompt, response);
    res.json(response);
  } catch (error) {
    logger.error('Local Parse Error:', error);
    res.status(500).json({ error: 'Failed to parse command locally' });
  }
});

app.post('/api/process', async (req, res) => {
  const { inputId, commands } = req.body;
  const jobId = uuidv4();
  const inputPath = path.join(uploadDir, inputId);
  const outputId = `${uuidv4()}.mp4`;
  const outputPath = path.join(outputDir, outputId);

  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ error: 'Input file not found' });
  }

  jobs.set(jobId, { 
    id: jobId, 
    status: 'processing', 
    progress: 0, 
    type: 'video_edit',
    createdAt: new Date().toISOString()
  });

  // Process commands into runFFmpeg options
  const options: any = { jobId, filters: [], enhanceVoice: false, normalizeAudio: true };
  commands.forEach((cmd: any) => {
    switch (cmd.action) {
      case 'trim': options.trim = cmd.params; break;
      case 'speed': options.speed = cmd.params.factor; break;
      case 'filter': options.filters.push(cmd.params); break;
      case 'crop': options.crop = true; break;
      case 'noise_reduction':
        options.filters.push({ type: 'noise_reduction' });
        options.enhanceVoice = true;
        break;
      case 'enhance_audio': options.normalizeAudio = true; break;
      case 'color_correct':
        options.filters.push({ type: 'brightness', value: cmd.params?.brightness || 0.02 });
        options.filters.push({ type: 'contrast', value: cmd.params?.contrast || 1.05 });
        options.filters.push({ type: 'saturation', value: cmd.params?.saturation || 1.1 });
        break;
    }
  });

  runFFmpeg(inputPath, outputPath, options)
    .then(() => {
      const job = jobs.get(jobId);
      if (job) jobs.set(jobId, { ...job, status: 'completed', progress: 100, result: { url: `/outputs/${outputId}`, id: outputId } });
    })
    .catch((err) => {
      const job = jobs.get(jobId);
      if (job) jobs.set(jobId, { ...job, status: 'failed', progress: 0, error: err.message });
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
  // Local rule-based script generation
  const script = {
    title: `Viral ${topic} Short`,
    scenes: [
      { time: "0:00", visual: "Hook: Fast-paced intro", text: `Did you know this about ${topic}?` },
      { time: "0:05", visual: "Main content: Key fact", text: "Here is the most interesting part." },
      { time: "0:12", visual: "Call to action", text: `Follow for more ${topic} content!` }
    ]
  };
  res.json(script);
});

app.post('/api/ai/monetize', async (req, res) => {
  const { projectData } = req.body;
  // Local rule-based monetization pack
  res.json({
    titles: ["Mind-Blowing Facts", "You Won't Believe This", "The Secret to Success"],
    description: "Check out this amazing video! #viral #trending #videoediting",
    tags: ["viral", "video", "edit", "ai", "vinci"]
  });
});

app.post('/api/ai/generate-avatar', async (req, res) => {
  const { prompt, text } = req.body;
  try {
    // 1. Use a local placeholder image or a free stock avatar image
    const imageId = uuidv4();
    const imagePath = path.join(avatarDir, `${imageId}.png`);
    // For now, we'll use a placeholder image if it doesn't exist
    // In a real setup, we'd use a local Stable Diffusion model
    fs.writeFileSync(imagePath, Buffer.from([])); // Dummy

    // 2. Local TTS
    const audioId = uuidv4();
    const audioPath = path.join(avatarDir, `${audioId}.wav`);
    await generateSpeechLocally(text, audioPath);

    // 3. Local Lip Sync (Wav2Lip)
    const outputId = `avatar-${uuidv4()}.mp4`;
    const outputPath = path.join(outputDir, outputId);
    // Placeholder for lip sync
    await runLipSyncLocally(imagePath, audioPath, outputPath);

    res.json({
      imageUrl: `/avatars/${imageId}.png`,
      audioUrl: `/avatars/${audioId}.wav`,
      videoUrl: `/outputs/${outputId}`
    });
  } catch (error) {
    logger.error('Local Avatar Error:', error);
    res.status(500).json({ error: 'Failed to generate local AI avatar' });
  }
});

app.post('/api/ai/generate-reels', async (req, res) => {
  const { inputId } = req.body;
  const jobId = uuidv4();
  const inputPath = path.join(uploadDir, inputId);
  const outputId = `reel-${uuidv4()}.mp4`;
  const outputPath = path.join(outputDir, outputId);

  jobs.set(jobId, { 
    id: jobId, 
    status: 'processing', 
    progress: 0, 
    type: 'reels', 
    createdAt: new Date().toISOString() 
  });

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
      const job = jobs.get(jobId);
      if (job) jobs.set(jobId, { ...job, status: 'completed', progress: 100, result: { url: `/outputs/${outputId}`, id: outputId } });
    })
    .catch((err) => {
      console.error('Reels Error:', err);
      const job = jobs.get(jobId);
      if (job) jobs.set(jobId, { ...job, status: 'failed', progress: 0, error: err.message });
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
