import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Video, 
  Download, 
  Loader2, 
  Play, 
  Settings2,
  Clock,
  Maximize2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Image,
  Film,
  Upload,
  X,
  History,
  Trash2,
  PanelLeftOpen,
  PanelLeftClose,
  Clipboard
} from 'lucide-react';
import HistorySidebar from './components/HistorySidebar';

// Particle background component
const ParticleBackground = () => {
  const particles = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 15}s`,
    duration: `${15 + Math.random() * 10}s`,
    size: `${2 + Math.random() * 4}px`,
  }));

  return (
    <div className="particles">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="particle"
          style={{
            left: particle.left,
            animationDelay: particle.delay,
            animationDuration: particle.duration,
            width: particle.size,
            height: particle.size,
          }}
        />
      ))}
    </div>
  );
};

// Size options for video
const sizeOptions = [
  { value: '1280x720', label: '720p Landscape', icon: '🖥️' },
  { value: '720x1280', label: '720p Portrait', icon: '📱' },
  { value: '1920x1080', label: '1080p Landscape', icon: '🎬' },
  { value: '1080x1920', label: '1080p Portrait', icon: '📲' },
];

// Duration options
const durationOptions = [
  { value: '4', label: '4 seconds' },
  { value: '8', label: '8 seconds' },
  { value: '10', label: '10 seconds' },
  { value: '15', label: '15 seconds' },
];

// Image size options
const imageSizeOptions = [
  { value: 'auto', label: 'Auto (Recommended)', icon: '✨' },
  { value: '1024x1024', label: 'Square (1024×1024)', icon: '⬜' },
  { value: '1536x1024', label: 'Landscape (1536×1024)', icon: '🖥️' },
  { value: '1024x1536', label: 'Portrait (1024×1536)', icon: '📱' },
];

// Generation mode options
const modeOptions = [
  { value: 'video', label: 'Video', icon: Film, model: 'Sora 2' },
  { value: 'image', label: 'Image', icon: Image, model: 'GPT Image 1.5' },
];

function App() {
  const [prompt, setPrompt] = useState('');
  const [generationMode, setGenerationMode] = useState('video'); // 'video' or 'image'
  const [size, setSize] = useState('720x1280');
  const [imageSize, setImageSize] = useState('auto');
  const [seconds, setSeconds] = useState('4');
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoData, setVideoData] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, generating, polling, completed, error
  const [showSettings, setShowSettings] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [groundingImages, setGroundingImages] = useState([]);
  const [refinePrompt, setRefinePrompt] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [pasteNotification, setPasteNotification] = useState(false);

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);

  // Poll for video status
  useEffect(() => {
    let interval;
    if (status === 'polling' && videoData?.id) {
      interval = setInterval(async () => {
        try {
          const response = await fetch(`/api/video-status/${videoData.id}`);
          const data = await response.json();
          
          console.log('Poll response:', data);
          setPollCount(prev => prev + 1);
          
          if (data.status === 'succeeded' || data.status === 'completed') {
            // Merge with existing data to preserve the ID
            setVideoData(prev => ({ ...prev, ...data }));
            setStatus('completed');
            clearInterval(interval);

            // Auto-save video to history
            try {
              await fetch('/api/save-generation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'video',
                  prompt: prompt,
                  settings: { size, seconds },
                }),
              });
              fetchHistory();
            } catch (saveErr) {
              console.error('Failed to save video to history:', saveErr);
            }
          } else if (data.status === 'failed') {
            const errorMsg = data.error?.message || data.error || 'Video generation failed';
            setError(errorMsg);
            setStatus('error');
            clearInterval(interval);
          } else {
            // Update progress if available
            if (data.progress !== undefined) {
              setVideoData(prev => ({ ...prev, progress: data.progress }));
            }
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 3000); // Poll every 3 seconds
    }
    return () => clearInterval(interval);
  }, [status, videoData?.id]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setVideoData(null);
    setImageData(null);
    setStatus('generating');
    setPollCount(0);
    setRefinePrompt('');

    try {
      if (generationMode === 'image') {
        // Image generation with GPT Image 1
        const response = await fetch('/api/generate-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: prompt.trim(),
            size: imageSize,
            inputImages: groundingImages.length > 0 ? groundingImages : undefined,
          }),
        });

        let data;
        const responseText = await response.text();
        
        try {
          data = responseText ? JSON.parse(responseText) : {};
        } catch (parseError) {
          console.error('Failed to parse response:', responseText);
          throw new Error(`Invalid response from server: ${responseText.substring(0, 100)}`);
        }

        if (!response.ok) {
          throw new Error(data.error || data.details || 'Failed to generate image');
        }

        console.log('Image API Response:', data);
        setImageData(data);
        setStatus('completed');
        // Refresh history after successful image generation
        fetchHistory();
      } else {
        // Video generation with Sora 2
        const response = await fetch('/api/generate-video', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: prompt.trim(),
            size,
            seconds,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || data.details || 'Failed to generate video');
        }

        console.log('Video API Response:', JSON.stringify(data, null, 2));
        setVideoData(data);
        
        // Check if video is ready or needs polling
        const hasVideo = data.url || data.video_url || data.output?.url || 
                         data.result?.url || data.generations?.[0]?.url ||
                         data.video_base64 || data.data || data.output?.data;
        
        if (data.status === 'succeeded' || data.status === 'completed' || hasVideo) {
          setStatus('completed');
        } else {
          setStatus('polling');
        }
      }
    } catch (err) {
      setError(err.message);
      setStatus('error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    try {
      let blob;
      
      // Check if we have base64 video data
      const base64Data = videoData?.video_base64 || videoData?.data || videoData?.output?.data;
      
      if (base64Data) {
        // Handle base64 encoded video
        const response = await fetch(`/api/save-video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoData: base64Data })
        });
        if (!response.ok) throw new Error('Failed to process video');
        blob = await response.blob();
      } else if (videoData?.id && (videoData.status === 'completed' || videoData.status === 'succeeded')) {
        // Use our video content proxy endpoint
        const response = await fetch(`/api/video-content/${videoData.id}`);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to download: ${errorText}`);
        }
        blob = await response.blob();
      } else {
        const videoUrl = getVideoUrl();
        if (videoUrl) {
          // Try to fetch the URL
          const response = await fetch(videoUrl);
          if (!response.ok) {
            // Try through proxy
            const proxyResponse = await fetch(`/api/download-video?url=${encodeURIComponent(videoUrl)}`);
            if (!proxyResponse.ok) throw new Error('Failed to download video');
            blob = await proxyResponse.blob();
          } else {
            blob = await response.blob();
          }
        } else {
          console.error('VideoData structure:', videoData);
          setError(`No video available. Status: ${videoData?.status}. Response keys: ${videoData ? Object.keys(videoData).join(', ') : 'none'}`);
          return;
        }
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sora-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      setError(`Failed to download video: ${err.message}`);
    }
  };

  const handleDownloadImage = () => {
    try {
      const base64Data = imageData?.data || imageData?.b64_json;
      if (!base64Data) {
        setError('No image data available for download');
        return;
      }

      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `flux-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      setError(`Failed to download image: ${err.message}`);
    }
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setGroundingImages((prev) => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  const removeGroundingImage = (index) => {
    setGroundingImages((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAllGroundingImages = () => {
    setGroundingImages([]);
  };

  // Handle paste event on textarea — add clipboard images to grounding images
  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();

    // Auto-switch to image mode since grounding images are image-mode only
    if (generationMode !== 'image') {
      setGenerationMode('image');
    }

    imageItems.forEach((item) => {
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = () => {
        setGroundingImages((prev) => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });

    // Show paste notification
    setPasteNotification(true);
    setTimeout(() => setPasteNotification(false), 2000);
  }, [generationMode]);

  // Fetch history from server
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch('/api/generations?limit=50');
      if (response.ok) {
        const data = await response.json();
        setHistoryItems(data.generations || []);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Load history on mount and when sidebar opens
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleDeleteHistoryItem = async (id, e) => {
    e.stopPropagation();
    try {
      const response = await fetch(`/api/generations/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setHistoryItems(prev => prev.filter(item => item.id !== id));
        if (selectedHistoryItem?.id === id) {
          setSelectedHistoryItem(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const handleSelectHistoryItem = async (item) => {
    try {
      const response = await fetch(`/api/generations/${item.id}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedHistoryItem(data);
        setPrompt(data.prompt || '');
        setGenerationMode(data.type || 'image');

        if (data.type === 'image' && data.result?.mediaUrl) {
          setImageData({ url: data.result.mediaUrl, revised_prompt: data.result.revisedPrompt });
          setVideoData(null);
          setStatus('completed');
        } else if (data.type === 'video' && data.result?.mediaUrl) {
          setVideoData({ url: data.result.mediaUrl, status: 'completed' });
          setImageData(null);
          setStatus('completed');
        }

        if (data.settings) {
          if (data.settings.imageSize) setImageSize(data.settings.imageSize);
          if (data.settings.size) setSize(data.settings.size);
          if (data.settings.seconds) setSeconds(data.settings.seconds);
        }
      }
    } catch (err) {
      console.error('Failed to load history item:', err);
    }
  };

  const handleRefine = async () => {
    if (!refinePrompt.trim() || !imageData?.data) return;
    
    setIsRefining(true);
    setError(null);
    
    try {
      const response = await fetch('/api/refine-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: refinePrompt.trim(),
          previousImage: imageData.data,
          size: imageSize,
        }),
      });
      
      let data;
      const responseText = await response.text();
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        throw new Error(`Invalid response: ${responseText.substring(0, 100)}`);
      }
      
      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to refine image');
      }
      
      console.log('Refine API Response:', data);
      setImageData(data);
      setRefinePrompt('');
      // Refresh history after successful refinement
      fetchHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRefining(false);
    }
  };

  const getImageUrl = () => {
    const base64Data = imageData?.data || imageData?.b64_json;
    if (base64Data) {
      return `data:image/png;base64,${base64Data}`;
    }
    return imageData?.url || null;
  };

  const getVideoUrl = () => {
    if (!videoData) return null;
    
    console.log('Finding video URL in:', videoData);
    
    // If video content is available through our proxy endpoint
    if (videoData._videoContentAvailable && videoData.id) {
      return `/api/video-content/${videoData.id}`;
    }
    
    // Check various possible response structures
    const url = videoData?.url || 
                videoData?.video_url || 
                videoData?.output?.url ||
                videoData?.result?.url ||
                videoData?.generations?.[0]?.url ||
                videoData?.videos?.[0]?.url ||
                videoData?.output?.video_url ||
                videoData?.result?.video_url ||
                videoData?.content?.url ||
                videoData?.video?.url;
    
    if (url) {
      console.log('Found video URL:', url);
      return url;
    }
    
    // Handle base64 data URL
    const base64 = videoData?.video_base64 || 
                   videoData?.data || 
                   videoData?.output?.data ||
                   videoData?.video?.data ||
                   videoData?.content?.data ||
                   videoData?.b64_json;
    if (base64) {
      return `data:video/mp4;base64,${base64}`;
    }
    
    // Last resort: try the content endpoint if we have an ID and status is completed
    if (videoData.id && (videoData.status === 'completed' || videoData.status === 'succeeded')) {
      return `/api/video-content/${videoData.id}`;
    }
    
    return null;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white relative">
      <ParticleBackground />

      {/* History Sidebar */}
      <HistorySidebar
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        items={historyItems}
        loading={historyLoading}
        onSelect={handleSelectHistoryItem}
        onDelete={handleDeleteHistoryItem}
        onRefresh={fetchHistory}
        selectedId={selectedHistoryItem?.id}
      />

      {/* Sidebar overlay */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setShowHistory(false)}
          />
        )}
      </AnimatePresence>
      
      {/* Header */}
      <header className="relative z-10 py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <motion.div 
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <button
              onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchHistory(); }}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title={showHistory ? 'Close history' : 'Open history'}
            >
              {showHistory ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
            </button>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
              <Play className="w-5 h-5 text-white fill-white" />
            </div>
            <h1 className="text-2xl font-bold gradient-text">Let's Sora</h1>
          </motion.div>
          
          <motion.div 
            className="flex items-center gap-2 text-sm text-gray-400"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span>Powered by Azure OpenAI</span>
          </motion.div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4">
            <span className="gradient-text">Transform Ideas</span>
            <br />
            <span className="text-white">Into {generationMode === 'video' ? 'Videos' : 'Images'}</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            {generationMode === 'video' 
              ? 'Harness the power of Sora 2 to generate stunning videos from text descriptions.'
              : 'Create and refine images with GPT Image. Upload references or start from scratch.'}
            {' '}Just describe your vision, and watch it come to life.
          </p>
        </motion.div>

        {/* Input Section */}
        <motion.div 
          className="glass rounded-2xl p-6 sm:p-8 glow mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          {/* Mode Selector */}
          <div className="mb-6">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Generation Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              {modeOptions.map((mode) => {
                const IconComponent = mode.icon;
                return (
                  <button
                    key={mode.value}
                    onClick={() => setGenerationMode(mode.value)}
                    className={`flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      generationMode === mode.value
                        ? 'bg-gradient-to-r from-violet-500 to-pink-500 text-white shadow-lg shadow-violet-500/25'
                        : 'bg-black/30 text-gray-400 hover:bg-white/10 border border-white/10'
                    }`}
                    disabled={isGenerating || status === 'polling'}
                  >
                    <IconComponent className="w-5 h-5" />
                    <div className="text-left">
                      <div>{mode.label}</div>
                      <div className={`text-xs ${generationMode === mode.value ? 'text-white/70' : 'text-gray-500'}`}>
                        {mode.model}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prompt Input */}
          <div className="mb-6 relative">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
              <Sparkles className="w-4 h-4 text-violet-400" />
              Describe your {generationMode === 'video' ? 'video' : 'image'}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onPaste={handlePaste}
              placeholder={generationMode === 'video' 
                ? "A majestic eagle soaring through golden clouds at sunset, cinematic lighting, ultra realistic..."
                : "A cute baby polar bear playing in the snow, soft lighting, photorealistic... (paste images here!)"}
              className={`w-full h-32 bg-black/30 border rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 resize-none transition-all ${
                pasteNotification ? 'border-green-500/50 ring-2 ring-green-500/20' : 'border-white/10'
              }`}
              disabled={isGenerating || status === 'polling'}
            />
            <AnimatePresence>
              {pasteNotification && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute bottom-2 right-3 flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-md"
                >
                  <Clipboard className="w-3 h-3" />
                  Image pasted!
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Grounding Image Upload - Image Mode Only */}
          {generationMode === 'image' && (
            <div className="mb-6">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
                <Upload className="w-4 h-4 text-blue-400" />
                Reference Images (Optional)
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Upload one or more images as references. The AI will use them with high input fidelity to generate a new image. The first image gets the highest fidelity.
              </p>
              {groundingImages.length > 0 && (
                <div className="mb-3">
                  <div className="flex flex-wrap gap-3">
                    {groundingImages.map((img, index) => (
                      <div key={index} className="relative inline-block">
                        <img src={img} alt={`Reference ${index + 1}`} className="h-32 w-auto rounded-xl border border-white/10 object-cover" />
                        <button 
                          onClick={() => removeGroundingImage(index)} 
                          className="absolute top-1.5 right-1.5 p-1 bg-black/70 rounded-full hover:bg-red-500/80 transition-colors"
                          disabled={isGenerating || status === 'polling'}
                        >
                          <X className="w-3 h-3" />
                        </button>
                        {index === 0 && (
                          <span className="absolute bottom-1.5 left-1.5 text-[10px] bg-violet-500/80 text-white px-1.5 py-0.5 rounded-md">Primary</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <label className="inline-flex items-center gap-1.5 text-xs text-violet-400 cursor-pointer hover:text-violet-300 transition-colors">
                      <Upload className="w-3 h-3" />
                      Add more
                      <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" disabled={isGenerating || status === 'polling'} />
                    </label>
                    <button onClick={clearAllGroundingImages} className="text-xs text-red-400 hover:text-red-300 transition-colors" disabled={isGenerating || status === 'polling'}>
                      Clear all
                    </button>
                  </div>
                </div>
              )}
              {groundingImages.length === 0 && (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/20 rounded-xl cursor-pointer hover:border-violet-500/50 transition-colors bg-black/20">
                  <Upload className="w-8 h-8 text-gray-500 mb-2" />
                  <span className="text-sm text-gray-500">Click to upload reference images</span>
                  <span className="text-xs text-gray-600 mt-1">PNG, JPG, WEBP up to 50MB • Multiple files supported</span>
                  <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" disabled={isGenerating || status === 'polling'} />
                </label>
              )}
            </div>
          )}

          {/* Settings Toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-4 transition-colors"
          >
            <Settings2 className="w-4 h-4" />
            <span>{showSettings ? 'Hide' : 'Show'} Settings</span>
          </button>

          {/* Settings Panel */}
          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 pb-6 border-b border-white/10">
                  {/* Size Selection - Different for video vs image */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
                      <Maximize2 className="w-4 h-4 text-pink-400" />
                      {generationMode === 'video' ? 'Video Size' : 'Image Size'}
                    </label>
                    {generationMode === 'video' ? (
                      <div className="grid grid-cols-2 gap-2">
                        {sizeOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setSize(option.value)}
                            className={`px-3 py-2 rounded-lg text-sm transition-all ${
                              size === option.value
                                ? 'bg-gradient-to-r from-violet-500 to-pink-500 text-white'
                                : 'bg-black/30 text-gray-400 hover:bg-white/10'
                            }`}
                            disabled={isGenerating || status === 'polling'}
                          >
                            <span className="mr-1">{option.icon}</span>
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {imageSizeOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setImageSize(option.value)}
                            className={`px-3 py-2 rounded-lg text-sm transition-all text-left ${
                              imageSize === option.value
                                ? 'bg-gradient-to-r from-violet-500 to-pink-500 text-white'
                                : 'bg-black/30 text-gray-400 hover:bg-white/10'
                            }`}
                            disabled={isGenerating || status === 'polling'}
                          >
                            <span className="mr-2">{option.icon}</span>
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Duration Selection - Only for video */}
                  {generationMode === 'video' && (
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
                        <Clock className="w-4 h-4 text-amber-400" />
                        Duration
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {durationOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setSeconds(option.value)}
                            className={`px-3 py-2 rounded-lg text-sm transition-all ${
                              seconds === option.value
                                ? 'bg-gradient-to-r from-violet-500 to-pink-500 text-white'
                                : 'bg-black/30 text-gray-400 hover:bg-white/10'
                            }`}
                            disabled={isGenerating || status === 'polling'}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Info for image mode */}
                  {generationMode === 'image' && (
                    <div className="flex items-center">
                      <div className="p-4 bg-violet-500/10 rounded-xl border border-violet-500/20">
                        <p className="text-sm text-violet-300">
                          <span className="font-medium">Image API</span> with GPT Image supports multiple reference images with high input fidelity. Upload references and iterate!
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || status === 'polling' || !prompt.trim()}
            className="w-full py-4 rounded-xl font-semibold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-violet-600 via-pink-500 to-amber-500 hover:from-violet-500 hover:via-pink-400 hover:to-amber-400 text-white shadow-lg hover:shadow-violet-500/25"
          >
            {isGenerating ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating...
              </span>
            ) : status === 'polling' ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin" />
                Processing... (Check #{pollCount})
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                {generationMode === 'video' ? <Video className="w-5 h-5" /> : <Image className="w-5 h-5" />}
                Generate {generationMode === 'video' ? 'Video' : 'Image'}
              </span>
            )}
          </button>
        </motion.div>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-8 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-medium">Error</p>
                <p className="text-red-300/80 text-sm">{error}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Video Result */}
        <AnimatePresence>
          {status === 'completed' && videoData && generationMode === 'video' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="glass rounded-2xl p-6 sm:p-8 glow"
            >
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <h3 className="text-lg font-semibold text-white">Video Generated!</h3>
              </div>

              {/* Video Preview */}
              {getVideoUrl() && (
                <div className="mb-6 rounded-xl overflow-hidden bg-black">
                  <video
                    src={getVideoUrl()}
                    controls
                    className="w-full max-h-[500px] object-contain"
                    autoPlay
                    loop
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              )}

              {/* Download Button */}
              <button
                onClick={handleDownload}
                className="w-full py-3 rounded-xl font-medium transition-all bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download Video
              </button>

              {/* Video Info */}
              <div className="mt-4 pt-4 border-t border-white/10 text-sm text-gray-400">
                <p><span className="text-gray-500">Prompt:</span> {prompt}</p>
                <p className="mt-1"><span className="text-gray-500">Size:</span> {size} • <span className="text-gray-500">Duration:</span> {seconds}s</p>
              </div>

              {/* Debug: Raw Response */}
              <details className="mt-4 pt-4 border-t border-white/10">
                <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-300">Show API Response (Debug)</summary>
                <pre className="mt-2 p-3 bg-black/50 rounded-lg text-xs text-gray-400 overflow-auto max-h-48">
                  {JSON.stringify(videoData, null, 2)}
                </pre>
              </details>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Image Result */}
        <AnimatePresence>
          {status === 'completed' && imageData && generationMode === 'image' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="glass rounded-2xl p-6 sm:p-8 glow"
            >
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <h3 className="text-lg font-semibold text-white">Image Generated!</h3>
              </div>

              {/* Image Preview */}
              {getImageUrl() && (
                <div className="mb-6 rounded-xl overflow-hidden bg-black flex justify-center">
                  <img
                    src={getImageUrl()}
                    alt="Generated by GPT Image 1.5"
                    className="max-w-full max-h-[600px] object-contain"
                  />
                </div>
              )}

              {/* Download Button */}
              <button
                onClick={handleDownloadImage}
                className="w-full py-3 rounded-xl font-medium transition-all bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download Image
              </button>

              {/* Refine Section */}
              {imageData?.data && (
                <div className="mt-6 pt-6 border-t border-white/10">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
                    <RefreshCw className="w-4 h-4 text-violet-400" />
                    Refine this image
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    Describe changes to iterate on the generated image using multi-turn editing.
                  </p>
                  <textarea
                    value={refinePrompt}
                    onChange={(e) => setRefinePrompt(e.target.value)}
                    placeholder="Describe changes... e.g., 'Make it more colorful' or 'Add a sunset background'"
                    className="w-full h-20 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 resize-none transition-all"
                    disabled={isRefining}
                  />
                  <button
                    onClick={handleRefine}
                    disabled={isRefining || !refinePrompt.trim()}
                    className="mt-3 w-full py-3 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-violet-600 to-pink-500 hover:from-violet-500 hover:to-pink-400 text-white flex items-center justify-center gap-2"
                  >
                    {isRefining ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Refining...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Refine Image
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Image Info */}
              <div className="mt-4 pt-4 border-t border-white/10 text-sm text-gray-400">
                <p><span className="text-gray-500">Prompt:</span> {prompt}</p>
                <p className="mt-1"><span className="text-gray-500">Size:</span> {imageSize} • <span className="text-gray-500">Model:</span> Image API (GPT Image)</p>
                {imageData?.revised_prompt && (
                  <p className="mt-1"><span className="text-gray-500">Revised Prompt:</span> {imageData.revised_prompt}</p>
                )}
              </div>

              {/* Debug: Raw Response */}
              <details className="mt-4 pt-4 border-t border-white/10">
                <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-300">Show API Response (Debug)</summary>
                <pre className="mt-2 p-3 bg-black/50 rounded-lg text-xs text-gray-400 overflow-auto max-h-48">
                  {JSON.stringify({ ...imageData, data: imageData?.data ? '[base64 data]' : undefined }, null, 2)}
                </pre>
              </details>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status: Polling (Video only) */}
        <AnimatePresence>
          {status === 'polling' && generationMode === 'video' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="glass rounded-2xl p-8 text-center"
            >
              <div className="w-16 h-16 mx-auto mb-4 spinner"></div>
              <h3 className="text-xl font-semibold text-white mb-2">Creating Your Video</h3>
              <p className="text-gray-400 mb-4">
                Sora 2 is working its magic. This may take a few minutes...
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-violet-400">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>
                  {videoData?.progress !== undefined 
                    ? `Progress: ${Math.round(videoData.progress * 100)}%` 
                    : `Checking status... (Attempt #${pollCount})`}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-8 px-4 text-center text-gray-500 text-sm">
        <p>Built with ❤️ using Azure OpenAI Sora 2 & GPT Image 1.5 • EntraID Authentication</p>
      </footer>
    </div>
  );
}

export default App;
