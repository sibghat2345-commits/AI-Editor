# 🎬 VINCI AI Video Editor (100% Local & Private)

A high-performance, AI-powered video editing platform built with **zero dependencies on paid APIs**. VINCI is designed to run entirely on your local hardware, giving you complete control, privacy, and ownership of your creative process.

## 🎯 Core Principles
- **Zero API Keys:** No Gemini, OpenAI, or ElevenLabs. All AI is 100% local.
- **Privacy First:** Your media and data never leave your machine.
- **Hardware Accelerated:** Automatically detects NVIDIA/AMD/Intel GPUs for blazing fast exports.
- **Plug-and-Play:** Run one script and start editing.

## 🧠 AI Stack (100% Local)
- **Local LLM:** Integrated with [Ollama](https://ollama.com) (Llama 3) for smart analysis and metadata generation.
- **Speech-to-Text:** [OpenAI Whisper](https://github.com/openai/whisper) (Local).
- **Text-to-Speech:** [Coqui TTS](https://github.com/coqui-ai/TTS) (Offline).
- **Lip Sync:** [Wav2Lip](https://github.com/Rudrabha/Wav2Lip) (Self-hosted).
- **Video Processing:** [FFmpeg](https://ffmpeg.org/) (Hardware Accelerated).

## 🚀 One-Click Setup

### 1. Prerequisites
- **Node.js 20+**
- **Python 3.10+**
- **Ollama** (Optional but recommended: [Download here](https://ollama.com))

### 2. Run the Setup Script
Open your terminal and run:

**Windows:**
```batch
setup.bat
```

**Linux / Mac:**
```bash
chmod +x setup.sh
./setup.sh
```

This script will automatically:
1. Check for **FFmpeg**.
2. Install **Whisper** and **Coqui TTS**.
3. Set up a Python virtual environment.
4. Install all Node.js dependencies.

### 3. Start Editing
```bash
npm run dev
```
Visit `http://localhost:3000` to start your first project.

## 🐳 Docker Deployment (Zero-Config)
If you prefer Docker, just run:
```bash
docker-compose up --build -d
```

## 🏗️ Hardware Acceleration
VINCI automatically detects your hardware and uses the best encoder:
- **NVIDIA:** `h264_nvenc`
- **AMD:** `h264_amf`
- **Intel:** `h264_qsv`
- **Fallback:** `libx264` (Software)

## 🔐 Privacy & Security
- **No External Calls:** All processing happens on your CPU/GPU.
- **Auto-Cleanup:** Temporary files are deleted after 24 hours.
- **Local Storage:** All uploads and exports are stored in the `uploads/` and `outputs/` folders.

## 📄 License
MIT License. Free to use, modify, and distribute.
