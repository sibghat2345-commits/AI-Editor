# 🎬 VINCI AI Video Editor (Free & Open Source Edition)

A high-performance, AI-powered video editing platform built with **zero dependencies on paid APIs**. VINCI is designed to run entirely on local hardware or free-tier cloud infrastructure, giving you complete control and ownership of your creative process.

## 🎯 Core Principles
- **Zero Paid APIs:** No Gemini, OpenAI, or ElevenLabs. All AI is local or free-tier.
- **Privacy First:** Your media and data stay on your hardware or your private cloud.
- **Open Source:** Built using industry-standard open-source tools like FFmpeg, Whisper, and Coqui TTS.

## 🧠 AI Stack (Free & Local)
- **NLP / Prompt Parsing:** Hybrid rule-based parser (local) for instant, zero-cost command processing.
- **Speech-to-Text:** [OpenAI Whisper](https://github.com/openai/whisper) (Local Deployment).
- **Text-to-Speech:** [Coqui TTS](https://github.com/coqui-ai/TTS) (Offline/Local).
- **Lip Sync:** [Wav2Lip](https://github.com/Rudrabha/Wav2Lip) (Self-hosted).
- **Video Processing:** [FFmpeg](https://ffmpeg.org/) (Optimized for speed and quality).

## 🏗️ Technical Architecture
- **Frontend:** React + Vite + Tailwind CSS (Hosted on Vercel Free Tier).
- **Backend:** Node.js + Express (Dockerized Worker Server).
- **Database/Storage:** Supabase (Free Tier) for metadata and persistent storage.
- **Processing:** Heavy lifting (AI models + FFmpeg) runs on your local machine or a dedicated Docker worker.

## 🚀 Getting Started (Local Setup)

### 1. Prerequisites
- **Node.js 20+**
- **Docker & Docker Compose**
- **FFmpeg** (Installed locally)
- **Python 3.10+** (For local AI models)

### 2. Install AI Models
To enable full AI capabilities, install the following tools on your worker server:

```bash
# Install Whisper
pip install git+https://github.com/openai/whisper.git 

# Install Coqui TTS
pip install TTS

# Install Wav2Lip dependencies
# (Follow instructions at https://github.com/Rudrabha/Wav2Lip)
```

### 3. Run the Application
```bash
# Install dependencies
npm install

# Start the dev server (Frontend + Backend)
npm run dev
```

## 🐳 Docker Deployment
Run the entire stack with a single command:
```bash
docker-compose up --build
```

## 🗄️ Supabase Configuration (Optional)
To enable cloud sync and persistent storage, set the following in your `.env`:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## 🔐 Security & Optimization
- **Auto-Cleanup:** Temporary files in `uploads/`, `outputs/`, and `avatars/` are automatically deleted after 24 hours.
- **Rate Limiting:** Built-in protection against API abuse.
- **Caching:** AI command parsing is cached for instant responses to repeated prompts.

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
