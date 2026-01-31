import express from 'express';
import cors from 'cors';
import { DefaultAzureCredential } from '@azure/identity';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Azure OpenAI configuration
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || 'https://letssoraprj-resource.openai.azure.com';
const AZURE_FOUNDRY_ENDPOINT = process.env.AZURE_FOUNDRY_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT || 'https://letssoraprj-resource.services.ai.azure.com';
const SORA_MODEL = process.env.SORA_MODEL_DEPLOYMENT || 'sora-2';
const FLUX_MODEL = process.env.FLUX_MODEL_DEPLOYMENT || 'flux-2-pro';

// Initialize Azure credential
const credential = new DefaultAzureCredential();

app.use(cors());
app.use(express.json());

// Helper function to get Azure AD token
async function getAzureToken() {
  const tokenResponse = await credential.getToken('https://cognitiveservices.azure.com/.default');
  return tokenResponse.token;
}

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
      image: FLUX_MODEL
    }
  });
});

// Generate image endpoint (Flux 2 Pro)
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, size = '1024x1024' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`Generating image with prompt: "${prompt}"`);
    console.log(`Image size: ${size}, Model: ${FLUX_MODEL}`);

    // Get Azure AD token
    const token = await getAzureToken();

    // Azure AI Foundry Flux API endpoint - using Black Forest Labs provider path
    // Per docs: https://github.com/microsoft-foundry/foundry-samples/blob/main/samples/python/black-forest-labs/flux/README.md
    const apiVersion = "preview";
    const apiUrl = `${AZURE_FOUNDRY_ENDPOINT}/providers/blackforestlabs/v1/flux-2-pro?api-version=${apiVersion}`;
    console.log(`Calling API: ${apiUrl}`);

    // Create abort controller with 3-minute timeout (image generation can take a while)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes

    // Call Azure Foundry Flux API with correct parameters
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        prompt,
        n: 1,
        width: parseInt(size.split('x')[0]),
        height: parseInt(size.split('x')[1]),
        output_format: 'png',
        model: FLUX_MODEL.toLowerCase()  // Model name must be lowercase per docs
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log(`Response status: ${response.status}`);
    const responseText = await response.text();
    console.log(`Response length: ${responseText.length} chars`);

    if (!response.ok) {
      console.error('Azure OpenAI Image Error:', responseText);
      return res.status(response.status).json({ 
        error: 'Failed to generate image', 
        details: responseText 
      });
    }

    // Parse JSON from text
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Raw response:', responseText.substring(0, 500));
      return res.status(500).json({ 
        error: 'Invalid JSON response from API', 
        details: responseText.substring(0, 200) 
      });
    }

    console.log('Image generation response received, keys:', Object.keys(data));

    res.json({
      status: 'completed',
      type: 'image',
      data: data.data?.[0]?.b64_json,
      revised_prompt: data.data?.[0]?.revised_prompt,
      _raw: data
    });
  } catch (error) {
    console.error('Error generating image:', error);
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

    // Get Azure AD token
    const token = await getAzureToken();

    // Call Azure OpenAI Sora API
    const response = await fetch(`${AZURE_OPENAI_ENDPOINT}/openai/v1/videos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
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
    const token = await getAzureToken();

    const response = await fetch(`${AZURE_OPENAI_ENDPOINT}/openai/v1/videos/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
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
            'Authorization': `Bearer ${token}`
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
    const token = await getAzureToken();

    const response = await fetch(`${AZURE_OPENAI_ENDPOINT}/openai/v1/videos/${id}/content`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
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
    
    // If unauthorized, try with Azure token
    if (response.status === 401 || response.status === 403) {
      console.log('Trying with Azure token...');
      const token = await getAzureToken();
      response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
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

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📍 Azure OpenAI Endpoint: ${AZURE_OPENAI_ENDPOINT}`);
  console.log(`📍 Azure Foundry Endpoint: ${AZURE_FOUNDRY_ENDPOINT}`);
  console.log(`🎬 Sora Model: ${SORA_MODEL}`);
  console.log(`🖼️  Flux Model: ${FLUX_MODEL}`);
});
