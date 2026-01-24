const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

// Volcengine TTS credentials (env override with safe defaults)
const VOLC_APP_ID = process.env.VOLC_APP_ID || '5546444154';
const VOLC_TTS_TOKEN = process.env.VOLC_TTS_TOKEN || 'bGXkynVHCnU4tngd4UOPfloKpCnnOgs-';

// Simple UUID v4 generator (no need for uuid package)
function generateUUID() {
  return crypto.randomUUID();
}

const app = express();
const PORT = process.env.PORT || 3000;
const AI_BUILDER_BASE_URL = 'https://space.ai-builders.com/backend';
const INSTRUCTOR_TOKEN = process.env.INSTRUCTOR_TOKEN || null;

// In-memory user store and sessions (demo only)
const users = [
  { id: 'u-instructor-1', username: 'instructor', password: 'teach123', role: 'instructor' },
  { id: 'u-student-1', username: 'student', password: 'learn123', role: 'student' }
];
const sessions = new Map(); // token -> { userId, username, role, createdAt }

// In-memory lessons store (simple demo; replace with DB in production)
const lessons = new Map();

// Middleware
app.use(cors());
app.use(express.json());

// Attach user session from Bearer token (if present)
app.use((req, _res, next) => {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.replace('Bearer ', '').trim();
    const session = sessions.get(token);
    if (session) {
      req.user = session;
    }
  }
  next();
});

// Simple auth guards
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

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

// Auth: login
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = users.find(u => u.username === String(username).trim());
    if (!user || user.password !== String(password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateUUID();
    const session = {
      token,
      userId: user.id,
      username: user.username,
      role: user.role,
      createdAt: new Date().toISOString()
    };
    sessions.set(token, session);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Auth: current user
app.get('/api/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.userId,
      username: req.user.username,
      role: req.user.role
    }
  });
});

// Auth: logout
app.post('/api/logout', requireAuth, (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.replace('Bearer ', '').trim();
    sessions.delete(token);
  }
  res.json({ success: true });
});

// Transcribe audio endpoint
app.post('/api/transcribe', requireAuth, upload.single('audio'), async (req, res) => {
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

// List lessons
app.get('/api/lessons', requireAuth, (req, res) => {
  const data = Array.from(lessons.values()).map(({ id, title, createdAt }) => ({
    id,
    title,
    createdAt
  }));
  res.json({ lessons: data });
});

// Lesson detail
app.get('/api/lessons/:id', requireAuth, (req, res) => {
  const lesson = lessons.get(req.params.id);
  if (!lesson) {
    return res.status(404).json({ error: 'Lesson not found' });
  }
  res.json(lesson);
});

// Create lesson (Instructor)
app.post('/api/lessons', requireRole('instructor'), (req, res) => {
  try {
    const { title, article, dialogue, instructor_token } = req.body || {};

    if (!title || !article || !dialogue) {
      return res.status(400).json({ error: 'Title, article, and dialogue are required' });
    }

    if (INSTRUCTOR_TOKEN && instructor_token !== INSTRUCTOR_TOKEN) {
      return res.status(401).json({ error: 'Invalid instructor token' });
    }

    const id = generateUUID();
    const lesson = {
      id,
      title: String(title).trim(),
      article: String(article).trim(),
      dialogue: String(dialogue).trim(),
      createdAt: new Date().toISOString()
    };
    lessons.set(id, lesson);
    res.json({ lesson });
  } catch (error) {
    console.error('Create lesson error:', error);
    res.status(500).json({ error: 'Failed to create lesson' });
  }
});

// Update lesson (Instructor)
app.put('/api/lessons/:id', requireRole('instructor'), (req, res) => {
  try {
    const { title, article, dialogue, instructor_token } = req.body || {};
    const lesson = lessons.get(req.params.id);
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    if (!title || !article || !dialogue) {
      return res.status(400).json({ error: 'Title, article, and dialogue are required' });
    }
    if (INSTRUCTOR_TOKEN && instructor_token !== INSTRUCTOR_TOKEN) {
      return res.status(401).json({ error: 'Invalid instructor token' });
    }

    lesson.title = String(title).trim();
    lesson.article = String(article).trim();
    lesson.dialogue = String(dialogue).trim();
    lesson.updatedAt = new Date().toISOString();
    lessons.set(lesson.id, lesson);
    res.json({ lesson });
  } catch (error) {
    console.error('Update lesson error:', error);
    res.status(500).json({ error: 'Failed to update lesson' });
  }
});

// Delete lesson (Instructor)
app.delete('/api/lessons/:id', requireRole('instructor'), (req, res) => {
  try {
    const { instructor_token } = req.body || {};
    const lesson = lessons.get(req.params.id);
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    if (INSTRUCTOR_TOKEN && instructor_token !== INSTRUCTOR_TOKEN) {
      return res.status(401).json({ error: 'Invalid instructor token' });
    }
    lessons.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete lesson error:', error);
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
});

// Chat completion endpoint
app.post('/api/chat', requireAuth, async (req, res) => {
  try {
    const { message, history, lessonId, lessonContext, lessonArticle, lessonDialogue, mode = 'student', turn = 0, maxTurns = 5, firstTurn = false } = req.body;

    if (!message && !firstTurn) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const token = process.env.AI_BUILDER_TOKEN;
    if (!token) {
      return res.status(500).json({ error: 'AI_BUILDER_TOKEN not configured' });
    }

    // Build lesson context (from stored or passed)
    let resolvedLesson = null;
    if (lessonId && lessons.has(lessonId)) {
      resolvedLesson = lessons.get(lessonId);
    } else if (lessonContext || lessonArticle || lessonDialogue) {
      resolvedLesson = {
        id: 'ad-hoc',
        title: 'Custom Lesson',
        article: lessonArticle || lessonContext || '',
        dialogue: lessonDialogue || ''
      };
    }

    const currentTurn = Number(turn) || 0;
    const maxAllowedTurns = Math.max(1, Math.min(Number(maxTurns) || 5, 10));

    // Build messages array - ensure we have a proper array
    let messages = [];

    const lessonSystem = resolvedLesson
      ? `You are an encouraging English teacher for middle school students.
You are guiding a lesson with a reference article and a 5-turn sample dialogue.
Lesson Title: ${resolvedLesson.title}
Article (use as knowledge boundary, keep within this content):
${resolvedLesson.article || ''}

Sample Dialogue (5 turns) between Student A and Student B:
${resolvedLesson.dialogue || ''}

Speaking role:
- You act as Student B in the dialogue. The user is Student A.
- Keep conversation close to the sample dialogue and article; small variations are fine.
- Do not introduce facts outside the article.

Flow control:
- Maximum ${maxAllowedTurns} student replies for this lesson. Current student reply count: ${currentTurn}.
- If the student goes off-topic, gently steer back to the article and the sample dialogue.
- When first_turn=true, start with a warm, concise greeting and the first line aligned with the sample dialogue.

Tone and style:
- Short sentences, natural, friendly, supportive (avoid robotic phrasing).
- Always respond in English only.
- Encourage speaking, ask simple follow-ups tied to the article/dialogue.`
      : `You are a friendly English teacher helping middle school students practice English speaking and listening.

Rules:
- ONLY respond in English - never use Chinese or any other language.
- Use simple vocabulary and short sentences.
- Keep responses encouraging, clear, and appropriate for middle school level.
- Focus on practical conversation topics.
- If the student speaks Chinese, gently remind them to speak English.`;

    // System message (single)
    messages.push({
      role: 'system',
      content: lessonSystem
    });

    // Add history if provided (exclude any prior system)
    if (Array.isArray(history) && history.length > 0) {
      messages = messages.concat(history.filter(msg => msg.role !== 'system'));
    }

    // If first turn and lesson, ask model to lead
    if (firstTurn && resolvedLesson) {
      messages.push({
        role: 'user',
        content: `Start the lesson with a short, friendly question based strictly on the lesson content. Keep it concise.`
      });
    } else {
      // Add current user message
      messages.push({
        role: 'user',
        content: message
      });
    }

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
app.post('/api/tts', requireAuth, async (req, res) => {
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
      // ONLY SERVICE: Volcengine (ByteDance) TTS with Anna voice
      {
        name: '🔥 Volcengine (Anna BV040_streaming)',
        fn: async () => {
          const ttsUrl = 'https://openspeech.bytedance.com/api/v1/tts';
          const requestId = generateUUID();
          
          console.log('📤 Volcengine TTS Request:');
          console.log('   Voice: BV040_streaming (Anna)');
          console.log('   Text length:', limitedText.length);
          console.log('   Request ID:', requestId);
          
          const response = await axios.post(ttsUrl, {
            app: {
              appid: VOLC_APP_ID,
              token: VOLC_TTS_TOKEN,
              cluster: 'volcano_tts'
            },
            user: {
              uid: 'english-app-user'
            },
            audio: {
              voice_type: 'BV040_streaming', // Anna - 亲切女声
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
              'Accept': 'application/json',
              'Authorization': `Bearer;${VOLC_TTS_TOKEN}`
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
          const dataStr = typeof error.response.data === 'string'
            ? error.response.data
            : JSON.stringify(error.response.data);
          console.error(`   Response: ${dataStr.substring(0, 500)}`);
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
      details: lastError?.response?.data || lastError?.message || 'All TTS services are unavailable.',
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

