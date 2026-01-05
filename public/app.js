// Conversation history
let conversationHistory = [
    {
        role: 'system',
        content: 'You are a friendly English teacher helping middle school students practice English speaking and listening. Keep your responses encouraging, clear, and appropriate for middle school level. Use simple vocabulary and short sentences. Always respond in English.'
    }
];

// DOM elements
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const status = document.getElementById('status');
const loading = document.getElementById('loading');
const conversationArea = document.getElementById('conversationArea');

// MediaRecorder and related variables
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let audioUnlocked = false;
let ttsAudioElement = null;

// Check if WeChat - single definition for the entire app
window.isWeChat = window.isWeChat || function() {
    return /MicroMessenger/i.test(navigator.userAgent);
};

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
        // Show browser info
        const browserInfo = document.getElementById('browserInfo');
        if (browserInfo) {
            if (window.isWeChat()) {
                browserInfo.textContent = '微信浏览器 - 使用后端 TTS';
            } else {
                browserInfo.textContent = '支持完整语音功能';
            }
        }
        
        // Initialize audio for mobile/WeChat
        if (typeof window.initAudioForMobile === 'function') {
            await window.initAudioForMobile();
        }
        
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
        
        updateStatus('准备就绪，点击"开始录音"按钮开始');
    } catch (error) {
        console.error('Initialization error:', error);
        updateStatus('初始化失败: ' + error.message);
        alert('无法访问麦克风，请确保已授予麦克风权限。');
    }
}

// Start recording
function startRecording() {
    if (!mediaRecorder) {
        alert('录音功能未初始化，请刷新页面重试。');
        return;
    }
    
    audioChunks = [];
    mediaRecorder.start();
    isRecording = true;
    
    recordBtn.disabled = true;
    stopBtn.disabled = false;
    updateStatus('🎤 正在录音...');
}

// Stop recording
function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        recordBtn.disabled = false;
        stopBtn.disabled = true;
        updateStatus('处理中...');
    }
}

// Process audio
async function processAudio(audioBlob) {
    try {
        showLoading(true);
        updateStatus('正在转换语音...');
        
        // Transcribe audio
        const transcription = await transcribeAudio(audioBlob);
        console.log('Transcription:', transcription);
        
        // Add user message to conversation
        addMessage('user', transcription);
        
        updateStatus('正在生成回复...');
        
        // Get AI response (history will be sent automatically)
        const response = await getChatResponse(transcription);
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
        
        updateStatus('准备就绪，点击"开始录音"继续对话');
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
    
    const response = await fetch('/api/transcribe', {
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
async function getChatResponse(message) {
    // Filter out system message from history when sending to backend
    const historyToSend = conversationHistory.filter(msg => msg.role !== 'system');
    
    console.log('Sending chat request, history length:', historyToSend.length);
    
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: message,
            history: historyToSend
        })
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Chat failed' }));
        console.error('Chat error:', error);
        throw new Error(error.error || 'Chat failed');
    }
    
    return await response.json();
}

// Speak text - use backend TTS for better mobile/WeChat compatibility
async function speakText(text) {
    // Try backend TTS first (works in WeChat!)
    if (typeof window.speakWithBackendTTS === 'function') {
        try {
            console.log('Using backend TTS...');
            await window.speakWithBackendTTS(text);
            console.log('Backend TTS completed successfully');
            return;
        } catch (error) {
            console.error('Backend TTS failed:', error);
            // Fall through to Web Speech Synthesis
        }
    }
    
    // Fallback to Web Speech Synthesis
    return new Promise((resolve) => {
        if (!('speechSynthesis' in window)) {
            console.error('Web Speech Synthesis not supported');
            resolve();
            return;
        }

        console.log('Using Web Speech Synthesis fallback...');
        
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

// Event listeners
recordBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

// Initialize when page loads
document.addEventListener('DOMContentLoaded', init);
