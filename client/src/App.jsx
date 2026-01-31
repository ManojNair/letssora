import React, { useState, useEffect } from 'react';
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
  Film
} from 'lucide-react';

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
  { value: '1024x1024', label: 'Square (1024×1024)', icon: '⬜' },
  { value: '1792x1024', label: 'Landscape (1792×1024)', icon: '🖥️' },
  { value: '1024x1792', label: 'Portrait (1024×1792)', icon: '📱' },
];

// Generation mode options
const modeOptions = [
  { value: 'video', label: 'Video', icon: Film, model: 'Sora 2' },
  { value: 'image', label: 'Image', icon: Image, model: 'Flux 2 Pro' },
];

function App() {
  const [prompt, setPrompt] = useState('');
  const [generationMode, setGenerationMode] = useState('video'); // 'video' or 'image'
  const [size, setSize] = useState('720x1280');
  const [imageSize, setImageSize] = useState('1024x1024');
  const [seconds, setSeconds] = useState('4');
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoData, setVideoData] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, generating, polling, completed, error
  const [showSettings, setShowSettings] = useState(false);
  const [pollCount, setPollCount] = useState(0);

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

    try {
      if (generationMode === 'image') {
        // Image generation with Flux 2 Pro
        const response = await fetch('/api/generate-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: prompt.trim(),
            size: imageSize,
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
      
      {/* Header */}
      <header className="relative z-10 py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <motion.div 
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
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
              : 'Create beautiful images with Flux 2 Pro from your imagination.'}
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
          <div className="mb-6">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
              <Sparkles className="w-4 h-4 text-violet-400" />
              Describe your {generationMode === 'video' ? 'video' : 'image'}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={generationMode === 'video' 
                ? "A majestic eagle soaring through golden clouds at sunset, cinematic lighting, ultra realistic..."
                : "A cute baby polar bear playing in the snow, soft lighting, photorealistic..."}
              className="w-full h-32 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 resize-none transition-all"
              disabled={isGenerating || status === 'polling'}
            />
          </div>

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
                          <span className="font-medium">Flux 2 Pro</span> generates high-quality images instantly. No waiting required!
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
                    alt="Generated by Flux 2 Pro"
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

              {/* Image Info */}
              <div className="mt-4 pt-4 border-t border-white/10 text-sm text-gray-400">
                <p><span className="text-gray-500">Prompt:</span> {prompt}</p>
                <p className="mt-1"><span className="text-gray-500">Size:</span> {imageSize} • <span className="text-gray-500">Model:</span> Flux 2 Pro</p>
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
        <p>Built with ❤️ using Azure OpenAI Sora 2 & Flux 2 Pro • EntraID Authentication</p>
      </footer>
    </div>
  );
}

export default App;
