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
            if (isWeChat()) {
                browserInfo.textContent = '微信浏览器 - TTS 功能受限，将显示文本';
            } else {
                browserInfo.textContent = '支持完整语音功能';
            }
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

// Check if running in WeChat
function isWeChat() {
    return /MicroMessenger/i.test(navigator.userAgent);
}

// Speak text using Web Speech Synthesis API (works in most browsers)
async function speakText(text) {
    return new Promise((resolve) => {
        // Check if in WeChat
        if (isWeChat()) {
            console.log('WeChat browser detected - Web Speech Synthesis may not work');
            // Display the text for user to read
            showAITextPopup(text);
            // Auto close after reading time
            setTimeout(resolve, Math.max(text.length * 50, 3000));
            return;
        }
        
        if (!('speechSynthesis' in window)) {
            console.error('Web Speech Synthesis not supported');
            showAITextPopup(text);
            setTimeout(resolve, Math.max(text.length * 50, 3000));
            return;
        }

        console.log('Starting Web Speech Synthesis...');
        
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
                console.log('Speech started');
            };
            
            utterance.onend = () => {
                console.log('Speech completed');
                if (!hasResolved) {
                    hasResolved = true;
                    resolve();
                }
            };
            
            utterance.onerror = (e) => {
                console.error('Speech error:', e);
                if (!hasResolved) {
                    hasResolved = true;
                    // Show text as fallback
                    showAITextPopup(text);
                    setTimeout(resolve, Math.max(text.length * 50, 3000));
                }
            };
            
            // Timeout safety - ensure we don't hang forever
            const timeoutDuration = Math.max(text.length * 100, 5000); // At least 5 seconds
            setTimeout(() => {
                if (!hasResolved) {
                    console.log('Speech timeout, forcing completion');
                    hasResolved = true;
                    window.speechSynthesis.cancel();
                    resolve();
                }
            }, timeoutDuration);
            
            try {
                window.speechSynthesis.speak(utterance);
                console.log('Speech queued successfully');
            } catch (error) {
                console.error('Error queuing speech:', error);
                if (!hasResolved) {
                    hasResolved = true;
                    showAITextPopup(text);
                    setTimeout(resolve, Math.max(text.length * 50, 3000));
                }
            }
        }, 250); // Longer delay for mobile/WeChat compatibility
    });
}

// Show AI text in a popup (for WeChat where TTS doesn't work)
function showAITextPopup(text) {
    // Remove existing popup if any
    const existingPopup = document.getElementById('ttsPopup');
    if (existingPopup) {
        existingPopup.remove();
    }
    
    // Create popup
    const popup = document.createElement('div');
    popup.id = 'ttsPopup';
    popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 20px 30px;
        border-radius: 10px;
        max-width: 80%;
        z-index: 10000;
        font-size: 18px;
        line-height: 1.6;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;
    popup.innerHTML = `
        <div style="margin-bottom: 10px; font-weight: bold; color: #4CAF50;">🤖 AI 回复：</div>
        <div>${text}</div>
        <div style="margin-top: 10px; font-size: 12px; color: #888; text-align: center;">
            (微信浏览器暂不支持语音播放，请阅读文本)
        </div>
    `;
    
    document.body.appendChild(popup);
    
    // Auto remove after reading time
    setTimeout(() => {
        popup.style.transition = 'opacity 0.5s';
        popup.style.opacity = '0';
        setTimeout(() => popup.remove(), 500);
    }, Math.max(text.length * 80, 4000));
    
    console.log('Showing AI text popup for WeChat');
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
