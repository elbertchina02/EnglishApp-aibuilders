# Changelog - English Practice App

## v1.4.2 - Lawrence Voice (2026-01-07)

### 🎵 Voice Change

#### Switched to Lawrence - More Natural Emotion
- ❌ Removed: Ariana (BV503_24k_streaming) - sounded too robotic
- ✅ Added: **Lawrence (BV138_24k_streaming)** - emotional female voice
- ✅ Removed storytelling emotion (not needed - Lawrence has natural emotion)

### 🎯 Why Lawrence?
- More natural and human-like
- Built-in emotional expression
- Warmer, more approachable tone
- Better for teaching middle school students
- Doesn't sound like a robot!

### 🔊 Features
- 24k high-definition audio quality
- Natural emotional delivery
- Clear pronunciation
- Engaging and friendly

---

## v1.4.1 - HD Voice Upgrade (2026-01-07)

### 🎵 Voice Quality Improvements

#### 1. 24k High-Definition Audio
- ✅ Upgraded: BV503_streaming → **BV503_24k_streaming**
- ✅ Clearer pronunciation
- ✅ Richer audio details
- ✅ Professional sound quality

#### 2. Storytelling Emotion
- ✅ Added: `emotion: 'storytelling'`
- ✅ More engaging and vivid delivery
- ✅ Natural storytelling tone
- ✅ Better learning experience

### 🎯 Impact
- Students will hear clearer, more engaging voice
- Like listening to a teacher telling a story
- Enhanced motivation for English practice

---

## v1.4.0 - English Only Mode (2026-01-07)

### 🎯 Major Features

#### 1. English Only Mode
- ✅ Automatic Chinese detection
- ✅ Friendly reminder when user speaks Chinese
- ✅ System message: "Please speak in English!"
- ✅ Prevents Chinese input from being processed

#### 2. Voice Upgrade
- ✅ Changed to Ariana voice (BV503_streaming)
- ✅ 活力女声 - More energetic and engaging
- ✅ Better suited for middle school students

#### 3. Enhanced System Prompt
- ✅ Explicit English-only instruction
- ✅ Reminds AI to prompt students to use English
- ✅ Focus on practical conversation

### 🎨 UI Improvements
- ✅ Added system message styling (orange warning style)
- ✅ Clear visual distinction between message types

### 🔧 Technical Changes
- Updated TTS voice: BV001_streaming → BV503_streaming
- Added `containsChinese()` function for language detection
- Enhanced system prompt with English-only rules
- Added system message CSS styling

---

## v1.3.9 - Console Error Fix (2026-01-07)

### 🐛 Bug Fixes
- ✅ Fixed console 500 errors for non-WeChat browsers
- ✅ Smart TTS strategy: only try backend TTS in WeChat
- ✅ Non-WeChat browsers use Web Speech directly

### ⚡ Performance
- Faster response time for non-WeChat browsers
- Eliminated unnecessary backend TTS requests

---

## v1.3.8 - Volcengine TTS Integration (2026-01-07)

### 🎉 Major Features
- ✅ Integrated Volcengine (ByteDance) TTS
- ✅ Enterprise-grade reliability
- ✅ High-quality voice synthesis

### 🔧 Technical
- Added Volcengine TTS as primary service
- Fallback to TikTok TTS and Google TTS
- UUID support for request tracking

---

## v1.3.7 - Smart TTS Strategy (2026-01-07)

### 🔧 Improvements
- Smart browser detection
- WeChat: Backend TTS with retry logic
- Non-WeChat: Web Speech Synthesis preferred

---

## v1.3.6 - TikTok TTS (2026-01-07)

### 🔧 Features
- Added TikTok TTS API
- Multiple TTS service fallbacks

---

## Earlier Versions

### v1.3.0-1.3.5
- Basic TTS implementations
- Various fixes and improvements

### v1.2.0
- WeChat TTS compatibility
- Audio playback improvements

### v1.1.0
- Chat functionality
- Conversation history

### v1.0.0
- Initial release
- Basic speech recognition
- AI chat integration

