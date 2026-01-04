const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const https = require('https');
const fs = require('fs');
require('dotenv').config();

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
        content: 'You are a friendly English teacher helping middle school students practice English speaking and listening. Keep your responses encouraging, clear, and appropriate for middle school level. Use simple vocabulary and short sentences. Always respond in English.'
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

// Text-to-Speech endpoint using Google TTS API (no external dependencies)
app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Limit text length to prevent abuse
    if (text.length > 1000) {
      return res.status(400).json({ error: 'Text too long (max 1000 characters)' });
    }

    // Try multiple TTS services in order
    const ttsServices = [
      // Service 1: Google TTS with tw-ob client
      async () => {
        const encodedText = encodeURIComponent(text);
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=en&client=tw-ob`;
        return await axios.get(ttsUrl, {
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://translate.google.com/'
          },
          timeout: 10000
        });
      },
      // Service 2: Google TTS with gtx client
      async () => {
        const encodedText = encodeURIComponent(text);
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=en&client=gtx`;
        return await axios.get(ttsUrl, {
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: 10000
        });
      }
    ];

    let lastError = null;
    
    // Try each service in order
    for (let i = 0; i < ttsServices.length; i++) {
      try {
        console.log(`Trying TTS service ${i + 1}...`);
        const response = await ttsServices[i]();
        
        // Check if we got valid audio data
        if (response.data && response.data.length > 0) {
          console.log(`TTS service ${i + 1} succeeded, audio length: ${response.data.length}`);
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Cache-Control', 'no-cache');
          return res.send(Buffer.from(response.data));
        }
      } catch (error) {
        console.error(`TTS service ${i + 1} failed:`, error.message);
        lastError = error;
        // Continue to next service
      }
    }

    // All services failed
    console.error('All TTS services failed. Last error:', lastError?.message);
    res.status(500).json({
      error: 'TTS generation failed',
      details: 'All TTS services are unavailable. Please use browser fallback.',
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

