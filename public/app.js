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

// Unlock audio for iOS and WeChat
function unlockAudio() {
    console.log('Attempting to unlock audio...');
    
    // Function to unlock
    const unlock = () => {
        if (audioUnlocked) return;
        
        console.log('Audio unlock triggered');
        
        // Try to play a silent sound
        if (ttsAudioElement) {
            ttsAudioElement.src = 'data:audio/mpeg;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAA1N3aXRjaCBQbHVzIMKpIE5DSCBTb2Z0d2FyZQBUSVQyAAAABgAAAzIyMzUAVFNTRQAAAA8AAANMYXZmNTcuODMuMTAwAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
            ttsAudioElement.play().then(() => {
                console.log('Audio unlocked successfully');
                audioUnlocked = true;
            }).catch(e => {
                console.log('Audio unlock attempt:', e.message);
            });
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
}

// Initialize
async function init() {
    try {
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
        conversationHistory.push({
            role: 'user',
            content: transcription
        });
        
        updateStatus('正在生成回复...');
        
        // Get AI response
        const response = await getChatResponse(transcription);
        const aiMessage = response.choices[0].message.content;
        console.log('AI Response:', aiMessage);
        
        // Add AI message to conversation
        addMessage('assistant', aiMessage);
        conversationHistory.push({
            role: 'assistant',
            content: aiMessage
        });
        
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
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: message,
            history: conversationHistory
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Chat failed');
    }
    
    return await response.json();
}

// Speak text using backend TTS API with <audio> element (best mobile compatibility)
async function speakText(text) {
    return new Promise(async (resolve) => {
        try {
            console.log('Attempting backend TTS...');
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: text })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Backend TTS failed:', response.status, errorData);
                
                // Fallback to Web Speech Synthesis
                if (errorData.fallback || response.status >= 500) {
                    console.log('Using Web Speech Synthesis fallback...');
                    useFallbackTTS(text, resolve);
                    return;
                }
            }

            // Get audio blob
            const audioBlob = await response.blob();
            
            // Check if we got valid audio data
            if (audioBlob.size === 0) {
                console.error('Received empty audio blob, using fallback');
                useFallbackTTS(text, resolve);
                return;
            }

            console.log('Backend TTS succeeded, audio size:', audioBlob.size);
            
            // Use the dedicated audio element
            const audioUrl = URL.createObjectURL(audioBlob);
            
            if (!ttsAudioElement) {
                ttsAudioElement = document.getElementById('ttsAudio');
            }
            
            // Set up event listeners
            const onEnded = () => {
                console.log('Audio playback completed');
                URL.revokeObjectURL(audioUrl);
                ttsAudioElement.removeEventListener('ended', onEnded);
                ttsAudioElement.removeEventListener('error', onError);
                resolve();
            };
            
            const onError = (e) => {
                console.error('Audio playback error:', e);
                URL.revokeObjectURL(audioUrl);
                ttsAudioElement.removeEventListener('ended', onEnded);
                ttsAudioElement.removeEventListener('error', onError);
                
                // Try fallback
                console.log('Audio playback failed, trying fallback...');
                useFallbackTTS(text, resolve);
            };
            
            ttsAudioElement.addEventListener('ended', onEnded);
            ttsAudioElement.addEventListener('error', onError);
            
            // Set source and play
            ttsAudioElement.src = audioUrl;
            ttsAudioElement.load();
            
            try {
                await ttsAudioElement.play();
                console.log('Audio play started successfully');
            } catch (playError) {
                console.error('Audio play() failed:', playError);
                URL.revokeObjectURL(audioUrl);
                ttsAudioElement.removeEventListener('ended', onEnded);
                ttsAudioElement.removeEventListener('error', onError);
                
                console.log('Play failed, trying fallback...');
                useFallbackTTS(text, resolve);
            }

        } catch (error) {
            console.error('TTS error:', error);
            console.log('Exception caught, using fallback...');
            useFallbackTTS(text, resolve);
        }
    });
}

// Fallback TTS using Web Speech Synthesis API
function useFallbackTTS(text, resolve) {
    if ('speechSynthesis' in window) {
        console.log('Starting Web Speech Synthesis...');
        
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        utterance.onstart = () => {
            console.log('Web Speech Synthesis started');
        };
        
        utterance.onend = () => {
            console.log('Web Speech Synthesis completed');
            resolve();
        };
        
        utterance.onerror = (e) => {
            console.error('Web Speech Synthesis error:', e);
            resolve();
        };
        
        // Small delay to ensure it works on mobile
        setTimeout(() => {
            window.speechSynthesis.speak(utterance);
        }, 100);
    } else {
        console.error('No TTS available');
        resolve();
    }
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
