import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { exec, execSync } from 'child_process';
import util from 'util';
import { createClient } from '@supabase/supabase-js';

const execPromise = util.promisify(exec);

// --- Logger ---
const logger = {
  info: (msg: string, ...args: any[]) => {
    const log = `[INFO] ${new Date().toISOString()} - ${msg}`;
    console.log(log, ...args);
    // In a real app, we could write to a file or a logging service here
  },
  error: (msg: string, ...args: any[]) => {
    const log = `[ERROR] ${new Date().toISOString()} - ${msg}`;
    console.error(log, ...args);
  },
  warn: (msg: string, ...args: any[]) => {
    const log = `[WARN] ${new Date().toISOString()} - ${msg}`;
    console.warn(log, ...args);
  },
  debug: (msg: string, ...args: any[]) => {
    if (process.env.DEBUG) {
      const log = `[DEBUG] ${new Date().toISOString()} - ${msg}`;
      console.log(log, ...args);
    }
  }
};

// --- Local LLM Setup (Ollama Integration) ---
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';

/**
 * Calls a local LLM (Ollama) for text generation.
 * Fallback to rule-based logic if Ollama is not running.
 */
async function callLocalLLM(prompt: string, jsonMode = false): Promise<string> {
  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        format: jsonMode ? 'json' : undefined
      })
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
    const data = await response.json();
    return data.response;
  } catch (error) {
    logger.warn('Local LLM (Ollama) not available. Using rule-based fallback.');
    return ""; // Return empty to trigger fallback
  }
}

// --- Hardware Acceleration Detection ---
const getHardwareAccel = () => {
  try {
    const encoders = execSync('ffmpeg -encoders').toString();
    if (encoders.includes('h264_nvenc')) return 'h264_nvenc'; // NVIDIA
    if (encoders.includes('h264_amf')) return 'h264_amf'; // AMD
    if (encoders.includes('h264_qsv')) return 'h264_qsv'; // Intel
    if (encoders.includes('h264_v4l2m2m')) return 'h264_v4l2m2m'; // Raspberry Pi
    return 'libx264'; // Software fallback
  } catch (e) {
    return 'libx264';
  }
};

const HW_ENCODER = getHardwareAccel();

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
app.set('trust proxy', 1);
const PORT = 3000;

// --- Production Configuration ---
const isProduction = process.env.NODE_ENV === 'production';

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  validate: {
    trustProxy: false, // Suppress the trust proxy validation error
    xForwardedForHeader: false, // Suppress the X-Forwarded-For validation error
  },
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

  // Trim detection: "cut from 5s to 10s", "trim first 5 seconds", "remove first 5s"
  const trimMatch = p.match(/(?:trim|cut|remove|keep)\s+(?:the\s+)?(?:first\s+)?(\d+)\s*(?:s|sec|seconds)/i);
  if (trimMatch) {
    commands.push({ action: 'trim', params: { start: 0, duration: parseInt(trimMatch[1]) } });
  }

  // Range trim: "trim from 10 to 20", "cut between 5 and 15"
  const rangeMatch = p.match(/(?:trim|cut)\s+(?:from\s+)?(\d+)\s*(?:s|sec)?\s*(?:to|and|until)\s+(\d+)\s*(?:s|sec)?/i);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]);
    const end = parseInt(rangeMatch[2]);
    commands.push({ action: 'trim', params: { start, duration: end - start } });
  }

  // Filter detection
  const filterMap: Record<string, string> = {
    'grayscale': 'grayscale',
    'black and white': 'grayscale',
    'sepia': 'sepia',
    'vivid': 'vivid',
    'cinematic': 'cinematic',
    'blur': 'blur',
    'sharpen': 'sharpen',
    'vignette': 'vignette',
    'noir': 'grayscale',
    'vintage': 'cinematic',
    'brighten': 'brightness',
    'contrast': 'contrast',
    'saturation': 'saturation'
  };
  
  Object.keys(filterMap).forEach(key => {
    if (p.includes(key)) {
      commands.push({ action: 'filter', params: { type: filterMap[key] } });
    }
  });

  // Speed detection: "2x speed", "double speed", "slow motion", "half speed"
  if (p.includes('2x') || p.includes('double speed') || p.includes('faster')) {
    commands.push({ action: 'speed', params: { factor: 2 } });
  } else if (p.includes('slow motion') || p.includes('half speed') || p.includes('slower')) {
    commands.push({ action: 'speed', params: { factor: 0.5 } });
  }

  // Crop/Reels detection
  if (p.includes('reel') || p.includes('tiktok') || p.includes('9:16') || p.includes('vertical') || p.includes('shorts')) {
    commands.push({ action: 'crop', params: { ratio: '9:16' } });
  }

  // Audio enhancement
  if (p.includes('audio') || p.includes('voice') || p.includes('denoise') || p.includes('normalize') || p.includes('clean up sound')) {
    commands.push({ action: 'enhance_audio', params: { normalize: true, denoise: true } });
  }

  return commands;
};

/**
 * Local Whisper STT: Transcribes audio using Whisper CLI.
 */
const transcribeLocally = async (audioPath: string): Promise<string> => {
  logger.info(`Running local Whisper on ${audioPath}`);
  try {
    const outputDir = path.dirname(audioPath);
    await execPromise(`whisper "${audioPath}" --model base --output_format txt --output_dir "${outputDir}"`);
    const txtPath = audioPath.replace(path.extname(audioPath), '.txt');
    if (fs.existsSync(txtPath)) {
      return fs.readFileSync(txtPath, 'utf-8');
    }
    return "Transcription completed but no text file found.";
  } catch (error) {
    logger.error('Whisper Error:', error);
    return "Local transcription failed. Ensure Whisper is installed.";
  }
};

/**
 * Local Coqui TTS: Generates speech using Coqui TTS CLI.
 */
const generateSpeechLocally = async (text: string, outputPath: string): Promise<void> => {
  logger.info(`Running local Coqui TTS for: ${text}`);
  try {
    await execPromise(`tts --text "${text}" --model_name "tts_models/en/ljspeech/vits" --out_path "${outputPath}"`);
  } catch (error) {
    logger.error('Coqui TTS Error:', error);
    fs.writeFileSync(outputPath, Buffer.from([]));
  }
};

/**
 * Local Wav2Lip: Real lip-sync processing using Wav2Lip CLI.
 */
const runLipSyncLocally = async (videoPath: string, audioPath: string, outputPath: string): Promise<void> => {
  logger.info(`Running local Wav2Lip for ${videoPath} and ${audioPath}`);
  try {
    const wav2lipDir = process.env.WAV2LIP_DIR || '/app/Wav2Lip';
    const checkpoint = process.env.WAV2LIP_CHECKPOINT || 'checkpoints/wav2lip_gan.pth';
    await execPromise(`python3 ${wav2lipDir}/inference.py --checkpoint_path ${checkpoint} --face "${videoPath}" --audio "${audioPath}" --outfile "${outputPath}"`);
  } catch (error) {
    logger.error('Wav2Lip Error:', error);
    fs.copyFileSync(videoPath, outputPath);
  }
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
    
    let ff = ffmpeg(inputPath);

    // Collect all filters
    let videoFilters: string[] = [];
    let audioFilters: string[] = [];

    // Apply Presets
    if (options.preset === 'youtube') {
      ff = ff.size('1920x1080').aspect('16:9');
    } else if (options.preset === 'shorts') {
      ff = ff.size('1080x1920').aspect('9:16');
    }

    ff = ff.outputOptions([
        `-c:v ${HW_ENCODER}`,
        '-preset fast',
        '-crf 20',
        '-movflags +faststart',
        '-pix_fmt yuv420p',
        '-threads 0'
      ]);

    // Audio Enhancement
    if (options.enhanceVoice) {
      audioFilters.push('highpass=f=150', 'lowpass=f=4000', 'afftdn');
    }
    if (options.normalizeAudio) {
      audioFilters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
    }

    if (options.trim) {
      ff = ff.setStartTime(options.trim.start).setDuration(options.trim.duration);
    }

    if (options.crop) {
      videoFilters.push('crop=ih*9/16:ih');
    }

    // Video Filters
    if (options.filters) {
      options.filters.forEach((f: any) => {
        if (f.type === 'grayscale') videoFilters.push('colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3');
        if (f.type === 'noise_reduction') videoFilters.push('hqdn3d=1.5:1.5:6:6');
        if (f.type === 'vignette') videoFilters.push('vignette=PI/4');
        if (f.type === 'brightness') videoFilters.push(`eq=brightness=${f.value || 0.05}`);
        if (f.type === 'contrast') videoFilters.push(`eq=contrast=${f.value || 1.1}`);
        if (f.type === 'saturation') videoFilters.push(`eq=saturation=${f.value || 1.2}`);
        if (f.type === 'sepia') videoFilters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
        if (f.type === 'sharpen') videoFilters.push('unsharp=3:3:1.5:3:3:0.5');
        if (f.type === 'blur') videoFilters.push('boxblur=10:1');
        if (f.type === 'cinematic') videoFilters.push('curves=preset=vintage,format=yuv420p');
        if (f.type === 'vivid') videoFilters.push('eq=contrast=1.2:saturation=1.3:brightness=0.02');
      });
    }

    if (options.speed) {
      videoFilters.push(`setpts=${1/options.speed}*PTS`);
      audioFilters.push(`atempo=${options.speed}`);
    }

    if (videoFilters.length > 0) ff = ff.videoFilters(videoFilters);
    if (audioFilters.length > 0) ff = ff.audioFilters(audioFilters);

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

app.post('/api/upload', upload.single('video'), async (req: any, res) => {
  logger.info('Upload request received');
  if (!req.file) {
    logger.error('No file in request');
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const filePath = req.file.path;
  const fileName = req.file.filename;

  try {
    // 1. Deep Metadata Extraction using ffprobe
    const metadata = await new Promise<any>((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
    const audioStream = metadata.streams.find((s: any) => s.codec_type === 'audio');

    const fileInfo = {
      id: fileName,
      url: `/uploads/${fileName}`,
      name: req.file.originalname,
      size: req.file.size,
      type: 'video',
      metadata: {
        resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : 'unknown',
        fps: videoStream ? (() => {
          try {
            const [num, den] = videoStream.r_frame_rate.split('/');
            return (parseInt(num) / parseInt(den)).toFixed(2);
          } catch {
            return 'unknown';
          }
        })() : 'unknown',
        codec: videoStream ? videoStream.codec_name : 'unknown',
        duration: metadata.format.duration,
        audioCodec: audioStream ? audioStream.codec_name : 'none',
        bitrate: metadata.format.bit_rate
      }
    };

    logger.info(`File uploaded and analyzed: ${fileName}`, fileInfo.metadata);

    // 2. Smart Content Analysis (Background task using Local LLM)
    // We don't wait for this to respond to the user
    analyzeContentLocally(fileInfo).catch(err => logger.error('Local Analysis Error:', err));

    res.json(fileInfo);
  } catch (error) {
    logger.error('Upload/Analysis Error:', error);
    // Cleanup file if analysis fails critically
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: 'Failed to process uploaded file metadata' });
  }
});

/**
 * Uses local LLM or heuristics to analyze video context and suggest edits.
 */
async function analyzeContentLocally(fileInfo: any) {
  try {
    const prompt = `Analyze this video metadata and suggest 3 creative edits, 5 viral tags, and a 1-sentence summary.
    Resolution: ${fileInfo.metadata.resolution}
    Duration: ${fileInfo.metadata.duration}s
    Name: ${fileInfo.name}
    
    Return JSON format: { "suggestions": [], "tags": [], "summary": "" }`;

    const localResponse = await callLocalLLM(prompt, true);
    
    let analysis;
    if (localResponse) {
      analysis = JSON.parse(localResponse);
    } else {
      // Rule-based fallback if LLM is offline
      analysis = {
        suggestions: [
          "Add a cinematic color grade",
          "Trim the intro for better retention",
          "Enhance audio clarity"
        ],
        tags: ["video", "edit", "ai", "vinci", "creative"],
        summary: `A ${fileInfo.metadata.duration}s video titled "${fileInfo.name}".`
      };
    }

    contentAnalyses.set(fileInfo.id, analysis);
    logger.info(`Smart analysis completed for ${fileInfo.id}`);
  } catch (error) {
    logger.error('Local Analysis Error:', error);
  }
}

const contentAnalyses = new Map<string, any>();

app.get('/api/analysis/:id', (req, res) => {
  const analysis = contentAnalyses.get(req.params.id);
  if (!analysis) return res.status(404).json({ error: 'Analysis not found' });
  res.json(analysis);
});

app.post('/api/ai/parse-command', async (req, res) => {
  const { prompt } = req.body;
  
  if (aiCache.has(prompt)) {
    return res.json(aiCache.get(prompt));
  }

  try {
    // Try local LLM first for complex parsing
    const llmPrompt = `Convert this video editing request into a JSON array of commands. 
    Request: "${prompt}"
    Available actions: trim (start, duration), filter (type: grayscale, sepia, vivid, cinematic, blur, sharpen, vignette, brightness, contrast, saturation), speed (factor), crop (ratio: 9:16), enhance_audio (normalize: true).
    
    Return ONLY a JSON array like: [{"action": "trim", "params": {"start": 0, "duration": 10}}]`;

    const llmResponse = await callLocalLLM(llmPrompt, true);
    let commands = [];
    
    if (llmResponse) {
      try {
        commands = JSON.parse(llmResponse);
      } catch (e) {
        commands = parseAICommandLocally(prompt);
      }
    } else {
      commands = parseAICommandLocally(prompt);
    }

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
  try {
    const { inputId, commands, preset } = req.body;
    
    if (!inputId || !commands) {
      return res.status(400).json({ error: 'Missing inputId or commands' });
    }

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
    const options: any = { jobId, preset, filters: [], enhanceVoice: false, normalizeAudio: true };
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
          options.filters.push({ type: 'brightness', value: cmd.params?.brightness || 0.05 });
          options.filters.push({ type: 'contrast', value: cmd.params?.contrast || 1.1 });
          options.filters.push({ type: 'saturation', value: cmd.params?.saturation || 1.2 });
          break;
      }
    });

    // Run FFmpeg asynchronously
    runFFmpeg(inputPath, outputPath, options)
      .then(() => {
        const job = jobs.get(jobId);
        if (job) {
          jobs.set(jobId, { 
            ...job, 
            status: 'completed', 
            progress: 100, 
            result: { 
              url: `/outputs/${outputId}`, 
              id: outputId,
              downloadUrl: `/api/download/${outputId}` 
            } 
          });
          logger.info(`Job ${jobId} completed successfully.`);
        }
      })
      .catch((err) => {
        const job = jobs.get(jobId);
        if (job) {
          jobs.set(jobId, { ...job, status: 'failed', progress: 0, error: err.message });
          logger.error(`Job ${jobId} failed:`, err);
        }
      });

    res.json({ jobId });
  } catch (error) {
    logger.error('Process API Error:', error);
    res.status(500).json({ error: 'Internal server error during process initiation' });
  }
});

app.get('/api/download/:id', (req, res) => {
  const filePath = path.join(outputDir, req.params.id);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(filePath, `vinci-export-${req.params.id}`);
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

app.post('/api/ai/generate-reels', async (req, res) => {
  try {
    const { inputId } = req.body;
    if (!inputId) return res.status(400).json({ error: 'Missing inputId' });

    const inputPath = path.join(uploadDir, inputId);
    if (!fs.existsSync(inputPath)) return res.status(404).json({ error: 'Source video not found' });

    const jobId = uuidv4();
    const outputId = `reel-${uuidv4()}.mp4`;
    const outputPath = path.join(outputDir, outputId);

    jobs.set(jobId, { 
      id: jobId, 
      status: 'processing', 
      progress: 0, 
      type: 'reel_generation',
      createdAt: new Date().toISOString()
    });

    // AI Reel Logic: 
    // 1. Find highlights (placeholder logic: take first 15s)
    // 2. Crop to 9:16
    // 3. Add background music (optional)
    const options = {
      jobId,
      trim: { start: 0, duration: 15 },
      crop: true, // 9:16 crop
      filters: [{ type: 'vivid' }],
      normalizeAudio: true
    };

    runFFmpeg(inputPath, outputPath, options)
      .then(() => {
        const job = jobs.get(jobId);
        if (job) {
          jobs.set(jobId, { 
            ...job, 
            status: 'completed', 
            progress: 100, 
            result: { url: `/outputs/${outputId}`, id: outputId } 
          });
        }
      })
      .catch(err => {
        const job = jobs.get(jobId);
        if (job) jobs.set(jobId, { ...job, status: 'failed', error: err.message });
      });

    res.json({ jobId });
  } catch (error) {
    logger.error('Generate Reels Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/ai/generate-avatar', async (req, res) => {
  const { prompt, text } = req.body;
  try {
    // 1. Image Generation (Placeholder for local Stable Diffusion CLI)
    const imageId = uuidv4();
    const imagePath = path.join(avatarDir, `${imageId}.png`);
    
    // In a real setup: await execPromise(`python3 sd_inference.py --prompt "${prompt}" --output "${imagePath}"`);
    // For now, we use a default avatar if it exists, or a placeholder
    const defaultAvatar = path.join(process.cwd(), 'public', 'default-avatar.png');
    if (fs.existsSync(defaultAvatar)) {
      fs.copyFileSync(defaultAvatar, imagePath);
    } else {
      // Create a simple 1x1 pixel PNG placeholder if default doesn't exist
      const placeholder = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
      fs.writeFileSync(imagePath, placeholder);
    }

    // 2. Local TTS
    const audioId = uuidv4();
    const audioPath = path.join(avatarDir, `${audioId}.wav`);
    await generateSpeechLocally(text, audioPath);

    // 3. Local Lip Sync (Wav2Lip)
    const outputId = `avatar-${uuidv4()}.mp4`;
    const outputPath = path.join(outputDir, outputId);
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
