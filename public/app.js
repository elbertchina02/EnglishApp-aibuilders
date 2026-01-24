// Conversation history (system prompt now built server-side)
let conversationHistory = [];

// DOM elements
const recordBtn = document.getElementById('recordBtn');
const status = document.getElementById('status');
const loading = document.getElementById('loading');
const conversationArea = document.getElementById('conversationArea');
const lessonSelect = document.getElementById('lessonSelect');
const startLessonBtn = document.getElementById('startLessonBtn');
const roleSwitch = document.getElementById('roleSwitch');
const studentPanel = document.getElementById('studentPanel');
const instructorPanel = document.getElementById('instructorPanel');
const lessonTitleInput = document.getElementById('lessonTitleInput');
const lessonArticleInput = document.getElementById('lessonArticleInput');
const lessonDialogueInput = document.getElementById('lessonDialogueInput');
const saveLessonBtn = document.getElementById('saveLessonBtn');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const authStatus = document.getElementById('authStatus');

// MediaRecorder and related variables
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let audioUnlocked = false;
let ttsAudioElement = null;
let lessonCache = {};
let selectedLessonId = 'free';
let maxTurns = 5;
let studentTurns = 0;
let currentRole = 'student';
let authToken = localStorage.getItem('authToken') || '';
let currentUser = null;

// Check if WeChat - single definition for the entire app
window.isWeChat = window.isWeChat || function() {
    return /MicroMessenger/i.test(navigator.userAgent);
};

// Auth helpers
function setAuthSession(token, user) {
    authToken = token || '';
    currentUser = user || null;
    if (authToken) {
        localStorage.setItem('authToken', authToken);
        window.__AUTH_TOKEN = authToken; // for wechatTts.js
    } else {
        localStorage.removeItem('authToken');
        window.__AUTH_TOKEN = '';
    }
    updateAuthUI();
}

function clearAuthSession(message) {
    authToken = '';
    currentUser = null;
    localStorage.removeItem('authToken');
    window.__AUTH_TOKEN = '';
    conversationHistory = [];
    studentTurns = 0;
    selectedLessonId = 'free';
    resetConversationArea();
    updateAuthUI();
    if (message) {
        updateStatus(message);
    }
}

function updateAuthUI() {
    if (authStatus) {
        if (currentUser) {
            authStatus.textContent = `已登录：${currentUser.username} (${currentUser.role})`;
        } else {
            authStatus.textContent = '未登录';
        }
    }
    if (loginBtn) loginBtn.disabled = !!currentUser;
    if (logoutBtn) logoutBtn.disabled = !currentUser;
    if (usernameInput) usernameInput.disabled = !!currentUser;
    if (passwordInput) passwordInput.disabled = !!currentUser;

    // Role and panel visibility based on user role
    if (currentUser) {
        switchRole(currentUser.role, { force: true });
    } else {
        document.querySelectorAll('.role-btn').forEach(b => b.classList.toggle('active', b.dataset.role === 'student'));
        studentPanel.style.display = '';
        instructorPanel.style.display = 'none';
        recordBtn.disabled = true;
        updateStatus('请先登录后再开始练习');
    }
}

function ensureAuth() {
    if (!currentUser) {
        alert('请先登录');
        return false;
    }
    return true;
}

async function restoreSession() {
    if (!authToken) return;
    try {
        const res = await fetch('/api/me', {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        if (!res.ok) {
            throw new Error('Session invalid');
        }
        const data = await res.json();
        setAuthSession(authToken, data.user);
    } catch (e) {
        clearAuthSession();
    }
}

function handleSessionExpired() {
    clearAuthSession('登录已失效，请重新登录');
    alert('登录已失效，请重新登录');
}

async function login() {
    const username = usernameInput?.value?.trim();
    const password = passwordInput?.value || '';
    if (!username || !password) {
        alert('请输入用户名和密码');
        return;
    }
    try {
        loginBtn.disabled = true;
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || '登录失败');
        }
        const data = await res.json();
        setAuthSession(data.token, data.user);
        updateStatus('登录成功');
        await refreshLessons();
    } catch (e) {
        alert(e.message || '登录失败');
    } finally {
        loginBtn.disabled = false;
    }
}

async function logout() {
    try {
        if (authToken) {
            await fetch('/api/logout', {
                method: 'POST',
                headers: { Authorization: `Bearer ${authToken}` }
            }).catch(() => {});
        }
    } finally {
        clearAuthSession('已退出，请重新登录');
    }
}

async function apiFetch(url, options = {}) {
    const opts = { ...options };
    opts.headers = { ...(options.headers || {}) };
    if (authToken) {
        opts.headers.Authorization = `Bearer ${authToken}`;
    }
    const res = await fetch(url, opts);
    if (res.status === 401) {
        handleSessionExpired();
        throw new Error('Unauthorized');
    }
    if (res.status === 403) {
        alert('当前账号无此操作权限');
        throw new Error('Forbidden');
    }
    return res;
}

function switchRole(role, { force = false } = {}) {
    if (!force) {
        if (!currentUser) {
            alert('请先登录');
            return;
        }
        if (currentUser.role === 'student' && role === 'instructor') {
            alert('学生账号无法进入教师模式');
            return;
        }
    }

    currentRole = role;
    document.querySelectorAll('.role-btn').forEach(b => b.classList.toggle('active', b.dataset.role === role));
    if (role === 'student') {
        studentPanel.style.display = '';
        instructorPanel.style.display = 'none';
        recordBtn.disabled = !currentUser || currentUser.role !== 'student';
        updateStatus(currentUser ? '学生模式：选择课时或自由练习。' : '请先登录后再练习');
    } else {
        studentPanel.style.display = 'none';
        instructorPanel.style.display = '';
        recordBtn.disabled = true;
        updateStatus('教师模式：创建或编辑课时');
    }
    resetConversationArea();
}

// Check if browser supports MediaRecorder
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('您的浏览器不支持录音功能，请使用Chrome、Firefox或Edge浏览器。');
}

// Unlock audio for iOS and WeChat (for Web Speech Synthesis)
function unlockAudio() {
    console.log('Attempting to unlock audio for speech synthesis...');
    
    // Function to unlock
    const unlock = () => {
        if (audioUnlocked) return;
        
        console.log('Audio unlock triggered');
        audioUnlocked = true;
        
        // Try to initialize speechSynthesis
        if ('speechSynthesis' in window) {
            // Load voices (this helps initialize the speech synthesis engine)
            const voices = window.speechSynthesis.getVoices();
            console.log('Speech synthesis voices loaded:', voices.length);
            
            // Speak a very short silent phrase to unlock
            const utterance = new SpeechSynthesisUtterance('');
            utterance.volume = 0;
            utterance.rate = 10;
            window.speechSynthesis.speak(utterance);
            console.log('Speech synthesis unlocked');
        }
    };
    
    // Try to unlock on various events
    document.addEventListener('touchstart', unlock, { once: true });
    document.addEventListener('touchend', unlock, { once: true });
    document.addEventListener('click', unlock, { once: true });
    
    // WeChat specific unlock
    if (typeof WeixinJSBridge !== 'undefined') {
        console.log('WeChat detected, using WeixinJSBridge');
        WeixinJSBridge.invoke('getNetworkType', {}, unlock);
    } else {
        document.addEventListener('WeixinJSBridgeReady', () => {
            console.log('WeixinJSBridge ready');
            WeixinJSBridge.invoke('getNetworkType', {}, unlock);
        }, false);
    }
    
    // Also try to load voices when they change
    if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = () => {
            const voices = window.speechSynthesis.getVoices();
            console.log('Voices changed, total voices:', voices.length);
        };
    }
}

// Initialize
async function init() {
    try {
        updateAuthUI();
        await restoreSession();

        // Show browser info
        const browserInfo = document.getElementById('browserInfo');
        if (browserInfo) {
            if (window.isWeChat()) {
                browserInfo.textContent = '微信浏览器 - 使用后端 TTS';
            } else {
                browserInfo.textContent = '支持完整语音功能';
            }
        }

        if (currentUser) {
            await refreshLessons();
        } else {
            updateStatus('请先登录后再开始练习');
        }
        attachRoleSwitch();

        // Note: Don't initialize AudioContext here - wait for user gesture
        console.log('App initialized, AudioContext will be created on first user interaction');
        
        // Get the audio element
        ttsAudioElement = document.getElementById('ttsAudio');
        if (!ttsAudioElement) {
            // Create audio element if it doesn't exist
            ttsAudioElement = document.createElement('audio');
            ttsAudioElement.id = 'ttsAudio';
            ttsAudioElement.preload = 'auto';
            ttsAudioElement.style.display = 'none';
            document.body.appendChild(ttsAudioElement);
        }
        
        // Unlock audio for iOS/WeChat
        unlockAudio();
        
        // Request microphone permission
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Create MediaRecorder
        mediaRecorder = new MediaRecorder(stream);
        
        // Handle data available event
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        // Handle stop event
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            audioChunks = [];
            
            // Process the audio
            await processAudio(audioBlob);
        };
        
        updateStatus('准备就绪，点击"开始"按钮开始');
    } catch (error) {
        console.error('Initialization error:', error);
        updateStatus('初始化失败: ' + error.message);
        alert('无法访问麦克风，请确保已授予麦克风权限。');
    }
}

// Start recording
async function startRecording() {
    if (!ensureAuth()) return;
    if (currentUser?.role !== 'student') {
        alert('仅学生账号可录音练习');
        return;
    }
    if (!mediaRecorder) {
        alert('录音功能未初始化，请刷新页面重试。');
        return;
    }

    if (currentRole !== 'student') {
        alert('当前是教师模式，切换到学生模式后再开始录音。');
        return;
    }

    if (studentTurns >= maxTurns && selectedLessonId !== 'free') {
        updateStatus('本节课已完成 5 轮对话，切换新课时继续。');
        return;
    }
    
    // Initialize audio for mobile on first interaction
    if (typeof window.initAudioForMobile === 'function') {
        try {
            await window.initAudioForMobile();
        } catch (e) {
            console.log('Audio initialization warning:', e);
        }
    }
    
    audioChunks = [];
    mediaRecorder.start();
    isRecording = true;
    
    setRecordingUI(true);
    updateStatus('🎤 正在录音...');
}

// Stop recording
function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        setRecordingUI(false);
        updateStatus('处理中...');
    }
}

// Detect if text contains Chinese characters
function containsChinese(text) {
    return /[\u4e00-\u9fa5]/.test(text);
}

// Process audio
async function processAudio(audioBlob) {
    try {
        showLoading(true);
        updateStatus('正在转换语音...');
        
        // Transcribe audio
        const transcription = await transcribeAudio(audioBlob);
        console.log('Transcription:', transcription);
        
        // Check if user spoke Chinese
        if (containsChinese(transcription)) {
            updateStatus('⚠️ 请使用英文练习！');
            addMessage('system', '⚠️ Please speak in English! This is English practice. 请用英文说话！');
            showLoading(false);
            setTimeout(() => {
                updateStatus('准备就绪，点击"开始录音"用英文继续对话');
            }, 2000);
            return;
        }
        
        // Add user message to conversation
        addMessage('user', transcription);
        studentTurns += 1;
        
        updateStatus('正在生成回复...');
        
        // Get AI response (history will be sent automatically)
        const response = await getChatResponse(transcription, { firstTurn: false });
        const aiMessage = response.choices[0].message.content;
        console.log('AI Response:', aiMessage);
        
        // Add messages to history after successful response
        conversationHistory.push({
            role: 'user',
            content: transcription
        });
        conversationHistory.push({
            role: 'assistant',
            content: aiMessage
        });
        
        // Add AI message to conversation display
        addMessage('assistant', aiMessage);
        
        updateStatus('正在播放语音...');
        
        // Speak the response
        await speakText(aiMessage);
        
        updateStatus(studentTurns >= maxTurns && selectedLessonId !== 'free'
            ? '本节课 5 轮已满，选择新课时或自由模式继续。'
            : '准备就绪，点击"开始"继续对话');
        showLoading(false);
        
    } catch (error) {
        console.error('Processing error:', error);
        updateStatus('处理失败: ' + error.message);
        showLoading(false);
        alert('处理失败，请重试。错误: ' + error.message);
    }
}

// Transcribe audio using AI Builders API
async function transcribeAudio(audioBlob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    
    const response = await apiFetch('/api/transcribe', {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Transcription failed');
    }
    
    const data = await response.json();
    return data.text;
}

// Get chat response using AI Builders API
async function getChatResponse(message, { firstTurn = false } = {}) {
    // Filter out system message from history when sending to backend
    const historyToSend = conversationHistory.filter(msg => msg.role !== 'system');
    
    console.log('Sending chat request, history length:', historyToSend.length);
    
    const response = await apiFetch('/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: message,
            history: historyToSend,
            lessonId: selectedLessonId === 'free' ? null : selectedLessonId,
            lessonArticle: selectedLessonId === 'free' ? null : (lessonCache[selectedLessonId]?.article || null),
            lessonDialogue: selectedLessonId === 'free' ? null : (lessonCache[selectedLessonId]?.dialogue || null),
            mode: currentRole,
            turn: studentTurns,
            maxTurns,
            firstTurn
        })
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Chat failed' }));
        console.error('Chat error:', error);
        throw new Error(error.error || 'Chat failed');
    }
    
    return await response.json();
}

// Speak text - ALWAYS use backend TTS (Volcengine only)
async function speakText(text) {
    // Always try backend TTS first (Volcengine Lawrence)
    if (typeof window.speakWithBackendTTS === 'function') {
        try {
            console.log('\n🎵 ========================================');
            console.log('🔄 Using Backend TTS (Volcengine Lawrence)...');
            console.log('📍 Voice: BV138_24k_streaming');
            console.log('========================================\n');
            await window.speakWithBackendTTS(text);
            console.log('\n✅ Volcengine TTS completed successfully\n');
            return;
        } catch (error) {
            console.error('\n❌ Volcengine TTS failed:', error);
            console.log('🔄 Falling back to Web Speech Synthesis as last resort...\n');
            // Fall through to Web Speech Synthesis fallback
        }
    }
    
    // Final fallback to Web Speech Synthesis (only if Volcengine fails)
    return new Promise((resolve) => {
        if (!('speechSynthesis' in window)) {
            console.log('❌ No TTS available, showing text instead');
            alert('AI: ' + text.substring(0, 200) + (text.length > 200 ? '...' : ''));
            resolve();
            return;
        }

        console.log('⚠️ Using Web Speech Synthesis fallback (Volcengine failed)...');
        
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();
        
        // Wait a bit for cancellation to complete
        setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = 0.9;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            
            let hasResolved = false;
            
            utterance.onstart = () => {
                console.log('Web Speech started');
            };
            
            utterance.onend = () => {
                console.log('Web Speech completed');
                if (!hasResolved) {
                    hasResolved = true;
                    resolve();
                }
            };
            
            utterance.onerror = (e) => {
                console.error('Web Speech error:', e);
                if (!hasResolved) {
                    hasResolved = true;
                    resolve();
                }
            };
            
            // Timeout safety
            const timeoutDuration = Math.max(text.length * 100, 5000);
            setTimeout(() => {
                if (!hasResolved) {
                    console.log('Speech timeout');
                    hasResolved = true;
                    window.speechSynthesis.cancel();
                    resolve();
                }
            }, timeoutDuration);
            
            try {
                window.speechSynthesis.speak(utterance);
            } catch (error) {
                console.error('Error queuing speech:', error);
                if (!hasResolved) {
                    hasResolved = true;
                    resolve();
                }
            }
        }, 250);
    });
}

// Show AI text in a popup (for WeChat where TTS doesn't work)
function showAITextPopup(text) {
    console.log('showAITextPopup called with text:', text);
    
    // Remove existing popup if any
    const existingPopup = document.getElementById('ttsPopup');
    if (existingPopup) {
        console.log('Removing existing popup');
        existingPopup.remove();
    }
    
    // Create popup overlay
    const overlay = document.createElement('div');
    overlay.id = 'ttsOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 9999;
        display: flex;
        justify-content: center;
        align-items: center;
    `;
    
    // Create popup
    const popup = document.createElement('div');
    popup.id = 'ttsPopup';
    popup.style.cssText = `
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 25px 30px;
        border-radius: 15px;
        max-width: 85%;
        min-width: 250px;
        z-index: 10000;
        font-size: 18px;
        line-height: 1.8;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        animation: popupSlideIn 0.3s ease-out;
    `;
    
    popup.innerHTML = `
        <style>
            @keyframes popupSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px) scale(0.9);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }
        </style>
        <div style="margin-bottom: 15px; font-weight: bold; font-size: 20px; text-align: center;">
            🤖 AI 回复
        </div>
        <div style="background: rgba(255, 255, 255, 0.2); padding: 15px; border-radius: 10px; margin-bottom: 15px;">
            ${text}
        </div>
        <div style="font-size: 13px; color: rgba(255, 255, 255, 0.8); text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.3); padding-top: 10px;">
            💡 微信浏览器不支持语音播放<br>请阅读上方文本内容
        </div>
        <button onclick="this.parentElement.parentElement.remove()" style="
            width: 100%;
            margin-top: 15px;
            padding: 12px;
            background: rgba(255, 255, 255, 0.3);
            border: none;
            border-radius: 8px;
            color: white;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
        ">关闭</button>
    `;
    
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
    
    console.log('Popup displayed successfully');
    
    // Auto remove after reading time (but keep it longer for user to read)
    const displayTime = Math.max(text.length * 100, 8000); // At least 8 seconds
    setTimeout(() => {
        if (overlay.parentElement) {
            overlay.style.transition = 'opacity 0.5s';
            overlay.style.opacity = '0';
            setTimeout(() => {
                if (overlay.parentElement) {
                    overlay.remove();
                    console.log('Popup auto-removed');
                }
            }, 500);
        }
    }, displayTime);
}

// Add message to conversation display
function addMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role === 'user' ? 'user-message' : 'ai-message'}`;
    
    const label = role === 'user' ? '你' : 'AI';
    const icon = role === 'user' ? '👤' : '🤖';
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-icon">${icon}</span>
            <strong>${label}:</strong>
        </div>
        <div class="message-content">${content}</div>
    `;
    
    conversationArea.appendChild(messageDiv);
    conversationArea.scrollTop = conversationArea.scrollHeight;
}

// Update status message
function updateStatus(message) {
    status.innerHTML = `<p>${message}</p>`;
}

// Show/hide loading indicator
function showLoading(show) {
    loading.style.display = show ? 'flex' : 'none';
}

// Recording UI helper
function setRecordingUI(active) {
    if (!recordBtn) return;
    if (active) {
        recordBtn.classList.add('recording');
        recordBtn.querySelector('.btn-icon').textContent = '⏹️';
        recordBtn.querySelector('.btn-text').textContent = '结束';
    } else {
        recordBtn.classList.remove('recording');
        recordBtn.querySelector('.btn-icon').textContent = '🎤';
        recordBtn.querySelector('.btn-text').textContent = '开始';
        recordBtn.disabled = false;
    }
}

function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

// Lesson helpers
async function refreshLessons() {
    if (!currentUser) {
        populateLessonSelect([]);
        return;
    }
    try {
        const res = await apiFetch('/api/lessons');
        if (!res.ok) {
            return;
        }
        const data = await res.json();
        populateLessonSelect(data.lessons || []);
    } catch (e) {
        console.log('lessons fetch error', e);
    }
}

function populateLessonSelect(lessons) {
    if (!lessonSelect) return;
    lessonSelect.innerHTML = `<option value="free">自由模式（不限制话题）</option>`;
    lessons.forEach((l) => {
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.textContent = l.title;
        lessonSelect.appendChild(opt);
    });
}

async function fetchLessonDetail(id) {
    if (!id || id === 'free') return null;
    try {
        const res = await apiFetch(`/api/lessons/${id}`);
        if (!res.ok) return null;
        const data = await res.json();
        lessonCache[id] = {
            article: data.article || '',
            dialogue: data.dialogue || ''
        };
        return data;
    } catch (e) {
        console.log('lesson detail error', e);
        return null;
    }
}

function resetConversationArea() {
    conversationArea.innerHTML = `
        <div class="welcome-message">
            <p>👋 欢迎！选择课时后开始练习，最多 5 轮对话。</p>
            <p class="english-text">Pick a lesson, then tap Start. 5 turns per lesson.</p>
        </div>
    `;
    conversationHistory = [];
    studentTurns = 0;
}

async function onLessonChange() {
    if (!ensureAuth()) return;
    selectedLessonId = lessonSelect?.value || 'free';
    studentTurns = 0;
    conversationHistory = [];
    resetConversationArea();
    updateStatus(selectedLessonId === 'free'
        ? '自由模式：话题不限。点击开始录音。'
        : '课时已选择，点击 AI 开场让机器人先说第一句。');
    if (selectedLessonId !== 'free') {
        await fetchLessonDetail(selectedLessonId);
    }
}

async function startLessonIntro() {
    if (!ensureAuth()) return;
    if (currentUser?.role !== 'student') {
        alert('仅学生账号可开始课时对话');
        return;
    }
    if (selectedLessonId === 'free') {
        alert('请选择一个课时再让 AI 开场，或直接自由练习。');
        return;
    }
    try {
        showLoading(true);
        const response = await getChatResponse('start lesson', { firstTurn: true });
        const aiMessage = response.choices[0].message.content;
        conversationHistory.push({ role: 'assistant', content: aiMessage });
        addMessage('assistant', aiMessage);
        await speakText(aiMessage);
        updateStatus('轮到你了，点击开始录音作答（最多 5 轮）。');
    } catch (e) {
        console.error(e);
        alert('AI 开场失败，请重试。');
    } finally {
        showLoading(false);
    }
}

async function saveLesson() {
    if (!ensureAuth()) return;
    if (currentUser?.role !== 'instructor') {
        alert('只有教师账号可以创建课时');
        return;
    }
    const title = lessonTitleInput?.value?.trim();
    const article = lessonArticleInput?.value?.trim();
    const dialogue = lessonDialogueInput?.value?.trim();
    if (!title || !article || !dialogue) {
        alert('请填写课时标题、文章与 5 回合对话');
        return;
    }
    try {
        saveLessonBtn.disabled = true;
        const res = await apiFetch('/api/lessons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, article, dialogue })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || '保存失败');
        }
        lessonTitleInput.value = '';
        lessonArticleInput.value = '';
        lessonDialogueInput.value = '';
        await refreshLessons();
        alert('课时已保存！在学生模式选择该课时开始练习。');
    } catch (e) {
        console.error(e);
        alert(e.message || '保存课时失败');
    } finally {
        saveLessonBtn.disabled = false;
    }
}

function attachRoleSwitch() {
    if (!roleSwitch) return;
    roleSwitch.addEventListener('click', (e) => {
        const btn = e.target.closest('.role-btn');
        if (!btn) return;
        const role = btn.dataset.role;
        if (!role || role === currentRole) return;
        switchRole(role);
    });
}

// Event listeners
recordBtn.addEventListener('click', toggleRecording);
// WeChat/iOS: make sure AudioContext init happens on a *touch* gesture (stricter than click)
recordBtn.addEventListener('touchstart', () => {
    if (typeof window.initAudioForMobile === 'function') {
        try {
            window.initAudioForMobile();
        } catch (e) {
            console.log('touchstart audio init warning:', e);
        }
    }
}, { passive: true });

lessonSelect?.addEventListener('change', onLessonChange);
startLessonBtn?.addEventListener('click', startLessonIntro);
saveLessonBtn?.addEventListener('click', saveLesson);
loginBtn?.addEventListener('click', login);
logoutBtn?.addEventListener('click', logout);

// Initialize when page loads
document.addEventListener('DOMContentLoaded', init);
