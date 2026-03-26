import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Scissors, 
  Type, Image as ImageIcon, Music, Wand2, 
  Download, Upload, Settings, MessageSquare,
  Trash2, Layers, Monitor, Smartphone, 
  Sparkles, Video, Mic, Volume2, Search,
  Plus, ChevronRight, ChevronLeft, X,
  CheckCircle2, AlertCircle, Loader2, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useDropzone } from 'react-dropzone';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface MediaAsset {
  id: string;
  url: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  duration?: number;
  thumbnail?: string;
}

interface TimelineClip {
  id: string;
  assetId: string;
  startTime: number; // Start time in the timeline
  duration: number;
  offset: number; // Start time within the asset
  track: number;
  type: 'video' | 'audio' | 'text';
  effects?: any[];
}

interface Project {
  id: string;
  name: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
  clips: TimelineClip[];
  assets: MediaAsset[];
}

// --- Components ---

const AIChatPanel = ({ onCommand, isProcessing }: { onCommand: (cmd: string) => void, isProcessing: boolean }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', text: string, type?: 'status' | 'suggestion' }[]>([
    { role: 'ai', text: "Hello! I'm your AI editing assistant. I can handle complex requests like 'Cut the first 10 seconds and make it cinematic'." }
  ]);

  const suggestions = [
    "Trim first 5 seconds",
    "Apply cinematic filter",
    "Enhance audio quality",
    "Make it 2x faster",
    "Auto-generate subtitles"
  ];

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isProcessing) return;
    
    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    onCommand(userMsg);
  };

  return (
    <div className="flex flex-col h-full bg-[#141414] border-l border-[#222] w-85 shadow-2xl">
      <div className="p-4 border-b border-[#222] flex items-center justify-between bg-gradient-to-r from-purple-900/10 to-transparent">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
          <h2 className="font-bold text-white tracking-tight">AI Editor</h2>
        </div>
        {isProcessing && <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />}
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
        {messages.map((msg, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={i} 
            className={cn(
              "p-3 rounded-2xl text-sm shadow-sm",
              msg.role === 'user' 
                ? "bg-purple-600 ml-auto text-white rounded-tr-none" 
                : "bg-[#222] text-gray-300 rounded-tl-none border border-[#333]"
            )}
          >
            {msg.text}
          </motion.div>
        ))}
        
        {messages.length < 3 && (
          <div className="pt-4">
            <p className="text-[10px] font-bold text-gray-600 uppercase mb-2 tracking-widest">Suggestions</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map(s => (
                <button 
                  key={s}
                  onClick={() => { setInput(s); }}
                  className="text-[10px] bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#333] px-2 py-1 rounded-full text-gray-400 hover:text-white transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 bg-[#1a1a1a] border-t border-[#222]">
        <div className="relative group">
          <input
            type="text"
            value={input}
            disabled={isProcessing}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isProcessing ? "AI is processing..." : "Command your edit..."}
            className="w-full bg-[#0f0f0f] border border-[#333] text-white text-sm rounded-xl py-3 px-4 pr-12 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all placeholder:text-gray-600"
          />
          <button 
            type="submit" 
            disabled={isProcessing}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-500 disabled:opacity-50 transition-all"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};

import { AutomationTools } from './AutomationTools';

const MediaLibrary = ({ assets, onUpload, onAddToTimeline }: { assets: MediaAsset[], onUpload: (files: File[]) => void, onAddToTimeline: (asset: MediaAsset) => void }) => {
  const [activeTab, setActiveTab] = useState<'media' | 'ai'>('media');
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onUpload,
    accept: { 'video/*': [], 'audio/*': [], 'image/*': [] }
  });

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a] border-r border-[#333] w-72">
      <div className="flex border-b border-[#333]">
        <button 
          onClick={() => setActiveTab('media')}
          className={cn("flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors", activeTab === 'media' ? "text-purple-500 border-b-2 border-purple-500" : "text-gray-500 hover:text-gray-300")}
        >
          Media
        </button>
        <button 
          onClick={() => setActiveTab('ai')}
          className={cn("flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors", activeTab === 'ai' ? "text-purple-500 border-b-2 border-purple-500" : "text-gray-500 hover:text-gray-300")}
        >
          AI Tools
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'media' ? (
          <div className="p-2">
            <div className="p-2 flex justify-between items-center mb-2">
              <h2 className="font-semibold text-white text-sm">Project Assets</h2>
              <button {...getRootProps()} className="p-1 hover:bg-[#333] rounded text-gray-400">
                <Plus className="w-4 h-4" />
                <input {...getInputProps()} />
              </button>
            </div>
            {assets.length === 0 ? (
              <div {...getRootProps()} className={cn(
                "h-40 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-gray-500 p-4 text-center cursor-pointer transition-colors",
                isDragActive ? "border-purple-500 bg-purple-500/10" : "border-[#333] hover:border-[#444]"
              )}>
                <Upload className="w-8 h-8 mb-2" />
                <p className="text-xs">Drag & drop media here</p>
                <input {...getInputProps()} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {assets.map(asset => (
                  <div key={asset.id} className="group relative aspect-video bg-[#2a2a2a] rounded overflow-hidden cursor-move border border-transparent hover:border-purple-500 shadow-lg">
                    {asset.type === 'video' ? (
                      <video src={asset.url} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="text-gray-600" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-2 transition-opacity">
                      <button 
                        onClick={() => onAddToTimeline(asset)}
                        className="bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add to Timeline
                      </button>
                      <span className="text-[10px] text-white truncate px-2">{asset.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <AutomationTools assets={assets} />
        )}
      </div>
    </div>
  );
};

const Timeline = ({ clips, currentTime, duration, onTimeChange, onClipSelect, selectedClipId }: { 
  clips: TimelineClip[], 
  currentTime: number, 
  duration: number,
  onTimeChange: (time: number) => void,
  onClipSelect: (id: string) => void,
  selectedClipId: string | null
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixelsPerSecond = 60; // Increased for better precision

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft;
    onTimeChange(Math.max(0, x / pixelsPerSecond));
  };

  return (
    <div className="h-72 bg-[#0d0d0d] border-t border-[#222] flex flex-col shadow-inner">
      {/* Toolbar */}
      <div className="h-12 border-b border-[#222] flex items-center px-4 justify-between bg-[#111]">
        <div className="flex items-center gap-3">
          <div className="flex bg-[#1a1a1a] rounded-lg p-1 border border-[#333]">
            <button className="p-1.5 hover:bg-[#333] rounded text-gray-400 transition-colors" title="Split Clip"><Scissors className="w-4 h-4" /></button>
            <button className="p-1.5 hover:bg-[#333] rounded text-gray-400 transition-colors" title="Delete Clip"><Trash2 className="w-4 h-4" /></button>
          </div>
          <div className="h-4 w-[1px] bg-[#333]" />
          <div className="flex items-center gap-2">
            <button className="p-1.5 hover:bg-[#333] rounded text-gray-400"><Layers className="w-4 h-4" /></button>
            <button className="p-1.5 hover:bg-[#333] rounded text-gray-400"><Music className="w-4 h-4" /></button>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#1a1a1a] px-3 py-1 rounded-full border border-[#333]">
            <span className="text-[10px] font-bold text-purple-500 uppercase">Current</span>
            <span className="text-xs font-mono text-white w-20 text-center">
              {new Date(currentTime * 1000).toISOString().substr(14, 7)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button className="p-1 hover:text-white text-gray-500"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-[10px] text-gray-600">100%</span>
            <button className="p-1 hover:text-white text-gray-500"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* Tracks Area */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative select-none scrollbar-hide"
        onClick={handleTimelineClick}
      >
        <div className="absolute top-0 left-0 h-full min-w-full" style={{ width: Math.max(duration * pixelsPerSecond, 1000) }}>
          {/* Time Rulers */}
          <div className="h-8 border-b border-[#1a1a1a] flex items-end bg-[#0d0d0d] sticky top-0 z-20">
            {Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 border-l border-[#222] h-3 relative" style={{ width: pixelsPerSecond }}>
                <span className="absolute -top-5 left-1 text-[9px] font-medium text-gray-600">{i}s</span>
                {i % 5 === 0 && <div className="absolute top-0 left-0 w-full h-full bg-purple-500/5" />}
              </div>
            ))}
          </div>

          {/* Tracks */}
          <div className="relative h-full pt-4 space-y-2 px-2">
            {[0, 1, 2].map(trackIndex => (
              <div key={trackIndex} className="h-16 bg-[#141414]/50 rounded-xl border border-[#1a1a1a] relative group">
                <div className="absolute -left-2 top-0 bottom-0 w-1 bg-purple-500/20 rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                {clips.filter(c => c.track === trackIndex).map(clip => (
                  <motion.div
                    layoutId={clip.id}
                    key={clip.id}
                    onClick={(e) => { e.stopPropagation(); onClipSelect(clip.id); }}
                    className={cn(
                      "absolute top-2 bottom-2 rounded-lg border flex flex-col justify-center px-3 overflow-hidden cursor-pointer transition-all",
                      selectedClipId === clip.id ? "timeline-clip-active" : "border-white/5",
                      clip.type === 'video' ? "bg-gradient-to-br from-blue-600/30 to-blue-900/30" : 
                      clip.type === 'audio' ? "bg-gradient-to-br from-green-600/30 to-green-900/30" : 
                      "bg-gradient-to-br from-orange-600/30 to-orange-900/30"
                    )}
                    style={{ 
                      left: clip.startTime * pixelsPerSecond, 
                      width: clip.duration * pixelsPerSecond 
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {clip.type === 'video' ? <Video className="w-3 h-3 text-blue-400" /> : <Music className="w-3 h-3 text-green-400" />}
                      <span className="text-[10px] font-bold text-white truncate uppercase tracking-tighter">{clip.id}</span>
                    </div>
                    <div className="mt-1 h-1 w-full bg-black/20 rounded-full overflow-hidden">
                      <div className="h-full bg-white/10" style={{ width: '100%' }} />
                    </div>
                  </motion.div>
                ))}
              </div>
            ))}
          </div>

          {/* Playhead */}
          <div 
            className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-30 pointer-events-none transition-all duration-75 ease-linear"
            style={{ left: currentTime * pixelsPerSecond }}
          >
            <div className="absolute -top-1 -left-[6px] w-3 h-4 bg-red-500 rounded-b-sm shadow-lg" />
            <div className="absolute top-0 bottom-0 left-0 w-10 bg-gradient-to-r from-red-500/10 to-transparent" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default function VinciEditor() {
  const [project, setProject] = useState<Project>({
    id: '1',
    name: 'Untitled Project',
    aspectRatio: '16:9',
    clips: [],
    assets: []
  });
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>(["Project created"]);
  
  const videoRef = useRef<HTMLVideoElement>(null);

  const addHistory = (action: string) => {
    setHistory(prev => [action, ...prev].slice(0, 10));
  };

  const pollJobStatus = async (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/job/${jobId}`);
        const job = await res.json();
        
        setProcessingProgress(job.progress);

        if (job.status === 'completed') {
          clearInterval(interval);
          setIsProcessing(false);
          setProcessingProgress(0);
          addHistory("AI Edit Complete");
          
          const processedAsset: MediaAsset = {
            id: job.result.id,
            url: job.result.url,
            name: `Vinci_${project.assets[0]?.name || 'video'}`,
            type: 'video'
          };
          
          setProject(prev => ({
            ...prev,
            assets: [processedAsset, ...prev.assets]
          }));
        } else if (job.status === 'failed') {
          clearInterval(interval);
          setIsProcessing(false);
          setProcessingProgress(0);
          alert(`Processing failed: ${job.error}`);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 1000);
  };

  const addAssetToTimeline = (asset: MediaAsset) => {
    const newClip: TimelineClip = {
      id: `clip-${Math.random().toString(36).substr(2, 9)}`,
      assetId: asset.id,
      startTime: project.clips.length > 0 ? Math.max(...project.clips.map(c => c.startTime + c.duration)) : 0,
      duration: 10, // Default 10s
      offset: 0,
      track: 0,
      type: asset.type === 'video' ? 'video' : asset.type === 'audio' ? 'audio' : 'text'
    };

    setProject(prev => ({
      ...prev,
      clips: [...prev.clips, newClip]
    }));
    addHistory(`Added ${asset.name} to timeline`);
  };

  const handleUpload = async (files: File[]) => {
    setIsProcessing(true);
    const formData = new FormData();
    formData.append('video', files[0]);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server responded with ${res.status}: ${text.substring(0, 100)}`);
      }

      const asset = await res.json();
      
      setProject(prev => {
        const newProject = {
          ...prev,
          assets: [asset, ...prev.assets]
        };
        // Auto-add first asset to timeline if empty
        if (prev.assets.length === 0 && prev.clips.length === 0) {
          const newClip: TimelineClip = {
            id: `clip-${Math.random().toString(36).substr(2, 9)}`,
            assetId: asset.id,
            startTime: 0,
            duration: 10,
            offset: 0,
            track: 0,
            type: 'video'
          };
          newProject.clips = [newClip];
        }
        return newProject;
      });
      addHistory(`Uploaded ${asset.name}`);
    } catch (err) {
      console.error('Upload failed:', err);
      alert(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAICommand = async (prompt: string) => {
    if (project.assets.length === 0) return;
    
    setIsProcessing(true);
    addHistory(`AI: ${prompt}`);
    try {
      const parseRes = await fetch('/api/ai/parse-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, videoMetadata: {} })
      });
      const { commands } = await parseRes.json();
      
      const processRes = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputId: project.assets[0].id, commands })
      });
      const { jobId } = await processRes.json();
      
      pollJobStatus(jobId);
    } catch (err) {
      console.error('AI Command failed:', err);
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-gray-300 font-sans overflow-hidden">
      {/* Top Navigation */}
      <header className="h-14 bg-[#1a1a1a] border-b border-[#333] flex items-center justify-between px-4 z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-purple-500">
            <Video className="w-6 h-6" />
            <h1 className="font-bold text-lg tracking-tight">VINCI</h1>
          </div>
          <div className="h-6 w-[1px] bg-[#333]" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{project.name}</span>
            <button className="p-1 hover:bg-[#333] rounded"><Settings className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-[#2a2a2a] rounded-lg p-1">
            <button 
              onClick={() => setProject(p => ({ ...p, aspectRatio: '16:9' }))}
              className={cn("p-1.5 rounded", project.aspectRatio === '16:9' ? "bg-[#333] text-white" : "text-gray-500")}
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setProject(p => ({ ...p, aspectRatio: '9:16' }))}
              className={cn("p-1.5 rounded", project.aspectRatio === '9:16' ? "bg-[#333] text-white" : "text-gray-500")}
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>
          <button className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold px-4 py-1.5 rounded-lg flex items-center gap-2 transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        <MediaLibrary assets={project.assets} onUpload={handleUpload} onAddToTimeline={addAssetToTimeline} />
        
        <div className="flex-1 flex flex-col bg-[#0f0f0f] relative">
          {/* Preview Area */}
          <div className="flex-1 flex items-center justify-center p-8">
            <div 
              className={cn(
                "bg-black shadow-2xl relative group overflow-hidden",
                project.aspectRatio === '16:9' ? "aspect-video w-full max-w-4xl" : "aspect-[9/16] h-full"
              )}
            >
              {project.assets.length > 0 ? (
                <video 
                  ref={videoRef}
                  src={project.assets[0].url} 
                  className="w-full h-full object-contain"
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-600">
                  <Video className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-sm">No media in preview</p>
                </div>
              )}

              {/* Preview Controls Overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center justify-center gap-6">
                  <button className="hover:text-white"><SkipBack className="w-5 h-5" /></button>
                  <button 
                    onClick={() => {
                      if (videoRef.current) {
                        if (isPlaying) videoRef.current.pause();
                        else videoRef.current.play();
                        setIsPlaying(!isPlaying);
                      }
                    }}
                    className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform"
                  >
                    {isPlaying ? <Pause className="fill-current" /> : <Play className="fill-current ml-1" />}
                  </button>
                  <button className="hover:text-white"><SkipForward className="w-5 h-5" /></button>
                </div>
              </div>

              {isProcessing && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-50">
                  <div className="relative w-24 h-24 mb-6">
                    <Loader2 className="w-full h-full text-purple-500 animate-spin opacity-20" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-bold text-white">{Math.round(processingProgress)}%</span>
                    </div>
                    <svg className="absolute inset-0 w-full h-full -rotate-90">
                      <circle
                        cx="48" cy="48" r="40"
                        fill="none" stroke="currentColor" strokeWidth="4"
                        className="text-purple-500 transition-all duration-300"
                        strokeDasharray={251.2}
                        strokeDashoffset={251.2 - (251.2 * processingProgress) / 100}
                      />
                    </svg>
                  </div>
                  <p className="text-purple-400 font-bold tracking-widest uppercase text-xs animate-pulse">AI Engine Processing</p>
                  <p className="text-gray-500 text-[10px] mt-2">Optimizing quality & applying filters...</p>
                </div>
              )}
            </div>
          </div>

          <Timeline 
            clips={project.clips} 
            currentTime={currentTime} 
            duration={Math.max(60, ...project.clips.map(c => c.startTime + c.duration), 0)} 
            onTimeChange={(t) => {
              setCurrentTime(t);
              if (videoRef.current) videoRef.current.currentTime = t;
            }}
            onClipSelect={setSelectedClipId}
            selectedClipId={selectedClipId}
          />
        </div>

        <AIChatPanel onCommand={handleAICommand} isProcessing={isProcessing} />

        {/* Properties & History Panel */}
        <div className="w-72 bg-[#111] border-l border-[#222] flex flex-col shadow-2xl">
          <div className="flex border-b border-[#222]">
            <button className="flex-1 py-3 text-[10px] font-bold uppercase tracking-widest text-purple-500 border-b-2 border-purple-500">Properties</button>
            <button className="flex-1 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-gray-300">History</button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-5 space-y-8">
            {/* History Section */}
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest flex items-center gap-2">
                <SkipBack className="w-3 h-3" /> Recent Actions
              </label>
              <div className="space-y-2">
                {history.map((h, i) => (
                  <div key={i} className="text-[11px] text-gray-400 flex items-center gap-2 p-2 bg-[#1a1a1a] rounded border border-[#222]">
                    <div className="w-1 h-1 rounded-full bg-purple-500" />
                    {h}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Transform</label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="text-[10px] text-gray-500">Scale</span>
                  <input type="number" defaultValue={100} className="w-full bg-[#0f0f0f] border border-[#222] rounded-lg p-2 text-xs text-white focus:border-purple-500/50" />
                </div>
                <div className="space-y-1.5">
                  <span className="text-[10px] text-gray-500">Opacity</span>
                  <input type="number" defaultValue={100} className="w-full bg-[#0f0f0f] border border-[#222] rounded-lg p-2 text-xs text-white focus:border-purple-500/50" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">AI Enhancements</label>
              <div className="space-y-2">
                <button className="w-full flex items-center justify-between p-3 bg-[#1a1a1a] hover:bg-[#222] rounded-xl text-xs border border-[#222] transition-colors group">
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-purple-400" />
                    <span>Voice Isolation</span>
                  </div>
                  <div className="w-8 h-4 bg-[#333] rounded-full relative">
                    <div className="absolute right-1 top-1 w-2 h-2 bg-purple-500 rounded-full" />
                  </div>
                </button>
                <button className="w-full flex items-center justify-between p-3 bg-[#1a1a1a] hover:bg-[#222] rounded-xl text-xs border border-[#222] transition-colors group">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    <span>4K Upscaling</span>
                  </div>
                  <div className="w-8 h-4 bg-[#333] rounded-full" />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Color Grading</label>
              <div className="grid grid-cols-2 gap-2">
                {['Cinematic', 'Noir', 'Teal & Orange', 'Vivid', 'Muted', 'Cyberpunk'].map(f => (
                  <button key={f} className="p-2 bg-[#1a1a1a] hover:bg-purple-600/20 hover:border-purple-500/50 rounded-lg text-[10px] border border-[#222] transition-all">
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <footer className="h-8 bg-[#1a1a1a] border-t border-[#333] flex items-center justify-between px-4 text-[10px] uppercase tracking-widest text-gray-500">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            System Ready
          </div>
          <div>CPU: 12%</div>
          <div>MEM: 1.2GB</div>
        </div>
        <div className="flex items-center gap-4">
          <button className="hover:text-gray-300">Shortcuts</button>
          <button className="hover:text-gray-300">Help</button>
          <div>v1.0.0-beta</div>
        </div>
      </footer>
    </div>
  );
}
