import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { DefaultAzureCredential } from '@azure/identity';
import OpenAI, { toFile } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Azure OpenAI configuration
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_FOUNDRY_ENDPOINT = process.env.AZURE_FOUNDRY_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT;
const SORA_MODEL = process.env.SORA_MODEL_DEPLOYMENT || 'sora-2';
const IMAGE_MODEL = process.env.IMAGE_MODEL_DEPLOYMENT || 'gpt-image-1.5';
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;

// Initialize Azure credential
const credential = new DefaultAzureCredential();

// Helper function to get Azure AD token
async function getAzureToken() {
  const tokenResponse = await credential.getToken('https://cognitiveservices.azure.com/.default');
  return tokenResponse.token;
}

// Create OpenAI client dynamically with fresh token
// async function getOpenAIClient() {
//   const token = await getAzureToken();
//   return new OpenAI({
//     baseURL: `${AZURE_OPENAI_ENDPOINT}/openai/v1/`,
//     apiKey: token
//   });
// }

// Create OpenAI client with API key
const openai = new OpenAI({
  baseURL: `${AZURE_OPENAI_ENDPOINT}/openai/v1/`,
  apiKey: await getAzureToken()
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    endpoints: {
      openai: AZURE_OPENAI_ENDPOINT,
      foundry: AZURE_FOUNDRY_ENDPOINT
    },
    models: {
      video: SORA_MODEL,
      image: IMAGE_MODEL
    }
  });
});

// Generate image endpoint (Image API)
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, size = 'auto', quality = 'auto', inputImage } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`Generating image with prompt: "${prompt}"`);
    console.log(`Image size: ${size}, Model: ${IMAGE_MODEL}, Has input image: ${!!inputImage}`);

    let result;

    if (inputImage) {
      // Use images.edit when a reference image is provided
      // Extract base64 data from data URL
      const base64Data = inputImage.startsWith('data:')
        ? inputImage.split(',')[1]
        : inputImage;
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const imageFile = await toFile(imageBuffer, 'reference.png', { type: 'image/png' });

      result = await openai.images.edit({
        model: IMAGE_MODEL,
        image: imageFile,
        prompt: prompt,
        ...(size !== 'auto' && { size }),
        quality,
      });
    } else {
      // Use images.generate for text-only prompts
      result = await openai.images.generate({
        model: IMAGE_MODEL,
        prompt: prompt,
        ...(size !== 'auto' && { size }),
        quality,
        n: 1,
      });
    }

    console.log('Image generation response received');

    res.json({
      status: 'completed',
      type: 'image',
      data: result.data?.[0]?.b64_json,
      revised_prompt: result.data?.[0]?.revised_prompt,
      _raw: result
    });
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Edit/refine image endpoint (Image API - images.edit)
app.post('/api/refine-image', async (req, res) => {
  try {
    const { prompt, previousImage, size = 'auto', quality = 'auto' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!previousImage) {
      return res.status(400).json({ error: 'Previous image data is required for refinement' });
    }

    console.log(`Refining image with prompt: "${prompt}"`);

    // Convert base64 to file for the edit API
    const base64Data = previousImage.startsWith('data:')
      ? previousImage.split(',')[1]
      : previousImage;
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const imageFile = await toFile(imageBuffer, 'source.png', { type: 'image/png' });

    const result = await openai.images.edit({
      model: IMAGE_MODEL,
      image: imageFile,
      prompt: prompt,
      ...(size !== 'auto' && { size }),
      quality,
    });

    console.log('Image refinement response received');

    res.json({
      status: 'completed',
      type: 'image',
      data: result.data?.[0]?.b64_json,
      revised_prompt: result.data?.[0]?.revised_prompt,
      _raw: result
    });
  } catch (error) {
    console.error('Error refining image:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Generate video endpoint
app.post('/api/generate-video', async (req, res) => {
  try {
    const { prompt, size = '720x1280', seconds = '4' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`Generating video with prompt: "${prompt}"`);

    // Call Azure OpenAI Sora API
    const response = await fetch(`${AZURE_OPENAI_ENDPOINT}/openai/v1/videos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_OPENAI_API_KEY
      },
      body: JSON.stringify({
        prompt,
        size,
        seconds,
        model: SORA_MODEL
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure OpenAI Error:', errorText);
      return res.status(response.status).json({ 
        error: 'Failed to generate video', 
        details: errorText 
      });
    }

    const data = await response.json();
    console.log('Video generation response:', JSON.stringify(data, null, 2));

    // Return full response with any nested data flattened for easier access
    res.json({
      ...data,
      _raw: data // Keep raw response for debugging
    });
  } catch (error) {
    console.error('Error generating video:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Check video status endpoint
app.get('/api/video-status/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await fetch(`${AZURE_OPENAI_ENDPOINT}/openai/v1/videos/${id}`, {
      method: 'GET',
      headers: {
        'api-key': AZURE_OPENAI_API_KEY
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ 
        error: 'Failed to get video status', 
        details: errorText 
      });
    }

    const data = await response.json();
    console.log('Video status response:', JSON.stringify(data, null, 2));
    
    // If completed, try to get the video content/generations
    if (data.status === 'completed' || data.status === 'succeeded') {
      // Try fetching generations/content endpoint
      try {
        const generationsResponse = await fetch(`${AZURE_OPENAI_ENDPOINT}/openai/v1/videos/${id}/content`, {
          method: 'GET',
          headers: {
            'api-key': AZURE_OPENAI_API_KEY
          }
        });
        
        if (generationsResponse.ok) {
          const contentType = generationsResponse.headers.get('content-type');
          
          if (contentType && contentType.includes('application/json')) {
            const generationsData = await generationsResponse.json();
            console.log('Video content response:', JSON.stringify(generationsData, null, 2));
            return res.json({ ...data, ...generationsData, _contentData: generationsData });
          } else {
            // It's the actual video binary - return a URL to our proxy endpoint
            console.log('Video content is binary, content-type:', contentType);
            return res.json({ 
              ...data, 
              video_url: `/api/video-content/${id}`,
              _videoContentAvailable: true 
            });
          }
        }
      } catch (contentErr) {
        console.log('Could not fetch content endpoint:', contentErr.message);
      }
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error checking video status:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Get video content directly
app.get('/api/video-content/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const response = await fetch(`${AZURE_OPENAI_ENDPOINT}/openai/v1/videos/${id}/content`, {
      method: 'GET',
      headers: {
        'api-key': AZURE_OPENAI_API_KEY
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ 
        error: 'Failed to get video content', 
        details: errorText 
      });
    }

    const contentType = response.headers.get('content-type') || 'video/mp4';
    const contentLength = response.headers.get('content-length');
    
    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Error getting video content:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Download video endpoint (proxy to avoid CORS issues)
app.get('/api/download-video', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'Video URL is required' });
    }

    console.log('Downloading video from:', url);

    // First try without auth (for SAS URLs or public URLs)
    let response = await fetch(url);
    
    // If unauthorized, try with API key
    if (response.status === 401 || response.status === 403) {
      console.log('Trying with API key...');
      response = await fetch(url, {
        headers: {
          'api-key': AZURE_OPENAI_API_KEY
        }
      });
    }

    if (!response.ok) {
      console.error('Download failed with status:', response.status);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      return res.status(response.status).json({ error: 'Failed to download video', details: errorText });
    }

    // Set appropriate headers for video download
    const contentType = response.headers.get('content-type') || 'video/mp4';
    const contentLength = response.headers.get('content-length');
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'attachment; filename="sora-generated-video.mp4"');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // Stream the response
    const buffer = await response.arrayBuffer();
    console.log('Video downloaded, size:', buffer.byteLength, 'bytes');
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Error downloading video:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Direct video content endpoint (for base64 or embedded video data)
app.post('/api/save-video', async (req, res) => {
  try {
    const { videoData, format = 'mp4' } = req.body;
    
    if (!videoData) {
      return res.status(400).json({ error: 'Video data is required' });
    }

    // Handle base64 encoded video
    const buffer = Buffer.from(videoData, 'base64');
    
    res.setHeader('Content-Type', `video/${format}`);
    res.setHeader('Content-Disposition', `attachment; filename="sora-generated-video.${format}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    console.error('Error saving video:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
  const fs = await import('fs');
  
  // Try multiple possible paths for client dist
  const possiblePaths = [
    path.join(__dirname, 'client', 'dist'),        // Flat structure: index.js and client/ at same level
    path.join(__dirname, '..', 'client', 'dist'),  // Nested: server/index.js with client/ at parent
    path.join(process.cwd(), 'client', 'dist'),    // From working directory
  ];
  
  let clientDistPath = possiblePaths[0];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      clientDistPath = p;
      console.log(`✅ Found client dist at: ${p}`);
      break;
    } else {
      console.log(`❌ Client dist not found at: ${p}`);
    }
  }
  
  app.use(express.static(clientDistPath));
  
  // Handle React routing - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📍 Azure OpenAI Endpoint: ${AZURE_OPENAI_ENDPOINT}`);
  console.log(`📍 Azure Foundry Endpoint: ${AZURE_FOUNDRY_ENDPOINT}`);
  console.log(`🎬 Sora Model: ${SORA_MODEL}`);
  console.log(`🖼️  Image Model: ${IMAGE_MODEL}`);
});

// Graceful shutdown for Azure Container Apps
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
