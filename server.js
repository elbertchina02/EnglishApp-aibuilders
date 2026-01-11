const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

// Simple UUID v4 generator (no need for uuid package)
function generateUUID() {
  return crypto.randomUUID();
}

const app = express();
const PORT = process.env.PORT || 3000;
const AI_BUILDER_BASE_URL = 'https://space.ai-builders.com/backend';

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for audio file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// API routes (must be before static files)
// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Version endpoint - use /version instead of /api/version to avoid conflicts
app.get('/version', (req, res) => {
  try {
    const packageJson = require('./package.json');
    res.json({ 
      version: packageJson.version,
      name: packageJson.name
    });
  } catch (error) {
    console.error('Error reading package.json:', error);
    res.status(500).json({ 
      error: 'Failed to read version',
      version: 'unknown'
    });
  }
});

// Also support /api/version for backward compatibility
app.get('/api/version', (req, res) => {
  try {
    const packageJson = require('./package.json');
    res.json({ 
      version: packageJson.version,
      name: packageJson.name
    });
  } catch (error) {
    console.error('Error reading package.json:', error);
    res.status(500).json({ 
      error: 'Failed to read version',
      version: 'unknown'
    });
  }
});

// Transcribe audio endpoint
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const token = process.env.AI_BUILDER_TOKEN;
    if (!token) {
      return res.status(500).json({ error: 'AI_BUILDER_TOKEN not configured' });
    }

    // Create form data for the API
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('audio_file', req.file.buffer, {
      filename: req.file.originalname || 'audio.webm',
      contentType: req.file.mimetype || 'audio/webm'
    });
    formData.append('language', 'en'); // English for middle school students

    // Call AI Builders transcription API
    const response = await axios.post(
      `${AI_BUILDER_BASE_URL}/v1/audio/transcriptions`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${token}`
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Transcription error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Transcription failed',
      details: error.response?.data || error.message
    });
  }
});

// Chat completion endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const token = process.env.AI_BUILDER_TOKEN;
    if (!token) {
      return res.status(500).json({ error: 'AI_BUILDER_TOKEN not configured' });
    }

    // Build messages array - ensure we have a proper array
    let messages = [];
    
    // Add system message if not already in history
    const hasSystemMessage = Array.isArray(history) && history.some(msg => msg.role === 'system');
    if (!hasSystemMessage) {
      messages.push({
        role: 'system',
        content: `You are a friendly English teacher helping middle school students practice English speaking and listening. 

CRITICAL RULES:
1. ONLY respond in English - never use Chinese or any other language
2. If the student speaks Chinese, politely remind them: "Let's practice English! Please speak in English."
3. Keep responses encouraging, clear, and appropriate for middle school level
4. Use simple vocabulary and short sentences
5. Focus on practical conversation topics

Remember: This is English practice - all communication must be in English only!`
      });
    }
    
    // Add history if provided
    if (Array.isArray(history) && history.length > 0) {
      messages = messages.concat(history.filter(msg => msg.role !== 'system'));
    }
    
    // Add current message
    messages.push({
      role: 'user',
      content: message
    });

    console.log('Sending chat request with', messages.length, 'messages');

    // Call AI Builders chat completion API with deepseek model
    const response = await axios.post(
      `${AI_BUILDER_BASE_URL}/v1/chat/completions`,
      {
        model: 'deepseek',
        messages: messages,
        temperature: 0.7,
        max_tokens: 500
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Chat error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Chat completion failed',
      details: error.response?.data || error.message
    });
  }
});

// Text-to-Speech endpoint - Returns base64 audio for WeChat compatibility
app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Clean the text
    const cleanText = text
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/`/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\n+/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();

    // Limit text length (300 chars is safe for most TTS APIs)
    const limitedText = cleanText.substring(0, 300);

    if (!limitedText) {
      return res.status(400).json({ error: 'Text is empty after cleaning' });
    }

    // Use ONLY Volcengine TTS - No fallback services
    const ttsServices = [
      // ONLY SERVICE: Volcengine (ByteDance) TTS with Lawrence voice
      {
        name: '🔥 Volcengine (Lawrence BV138_24k_streaming)',
        fn: async () => {
          const ttsUrl = 'https://openspeech.bytedance.com/api/v1/tts';
          const requestId = generateUUID();
          
          console.log('📤 Volcengine TTS Request:');
          console.log('   Voice: BV138_24k_streaming (Lawrence)');
          console.log('   Text length:', limitedText.length);
          console.log('   Request ID:', requestId);
          
          const response = await axios.post(ttsUrl, {
            app: {
              appid: '8125700140',
              token: 'access_token',
              cluster: 'volcano_tts'
            },
            user: {
              uid: 'english-app-user'
            },
            audio: {
              voice_type: 'BV138_24k_streaming', // Lawrence - 情感女声 (24k高清版)
              encoding: 'mp3',
              speed_ratio: 1.0,
              volume_ratio: 1.0,
              pitch_ratio: 1.0
            },
            request: {
              reqid: requestId,
              text: limitedText,
              text_type: 'plain',
              operation: 'query'
            }
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer;poFHe9MHQ1WMBOPqY8XiuIFHv8qu1Duu'
            },
            timeout: 15000
          });
          
          console.log('📥 Volcengine Response Status:', response.status);
          console.log('📥 Volcengine Response Data Keys:', Object.keys(response.data || {}));
          
          // Volcengine returns JSON with base64 encoded audio
          if (response.data && response.data.data) {
            console.log('✅ Volcengine returned valid audio data');
            return { data: Buffer.from(response.data.data, 'base64') };
          }
          throw new Error('Invalid Volcengine TTS response - no data field');
        }
      }
    ];

    let lastError = null;
    
    // Try each service in order
    for (let i = 0; i < ttsServices.length; i++) {
      const service = ttsServices[i];
      try {
        console.log(`\n========================================`);
        console.log(`🎤 Trying TTS Service ${i + 1}: ${service.name}`);
        console.log(`========================================`);
        
        const response = await service.fn();
        
        // Check if we got valid audio data
        if (response.data && response.data.length > 0) {
          console.log(`\n✅ SUCCESS! ${service.name}`);
          console.log(`   Audio length: ${response.data.length} bytes`);
          console.log(`   Content-type: ${response.headers?.['content-type'] || 'audio/mpeg'}`);
          console.log(`========================================\n`);
          
          // Convert to base64 for better mobile/WeChat compatibility
          const base64Audio = Buffer.from(response.data).toString('base64');
          
          return res.json({
            success: true,
            audioContent: base64Audio,
            format: 'mp3',
            service: service.name // Send service name to client
          });
        } else {
          console.error(`❌ ${service.name} returned empty data`);
        }
      } catch (error) {
        console.error(`\n❌ FAILED: ${service.name}`);
        console.error(`   Error: ${error.message}`);
        console.error(`   Status: ${error.response?.status}`);
        console.error(`   Status Text: ${error.response?.statusText}`);
        if (error.response?.data) {
          console.error(`   Response: ${error.response.data.toString?.()?.substring(0, 200)}`);
        }
        console.error(`========================================\n`);
        lastError = error;
        // Continue to next service
      }
    }

    // All services failed
    console.error('All TTS services failed. Last error:', {
      message: lastError?.message,
      status: lastError?.response?.status,
      statusText: lastError?.response?.statusText
    });
    res.status(500).json({
      error: 'TTS generation failed',
      details: lastError?.message || 'All TTS services are unavailable.',
      fallback: true
    });

  } catch (error) {
    console.error('TTS endpoint error:', error);
    res.status(500).json({
      error: 'TTS failed',
      details: error.message,
      fallback: true
    });
  }
});

// Static files (must be after API routes)
app.use(express.static('public'));

// Serve the main page (fallback)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Make sure AI_BUILDER_TOKEN is set in your .env file`);
  console.log(`Version endpoint: http://localhost:${PORT}/api/version`);
});

