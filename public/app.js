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

// Check if browser supports MediaRecorder
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('您的浏览器不支持录音功能，请使用Chrome、Firefox或Edge浏览器。');
}

// Initialize
async function init() {
    try {
        // Request microphone permission
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); // Stop immediately, we'll start recording when user clicks
        
        recordBtn.addEventListener('click', startRecording);
        stopBtn.addEventListener('click', stopRecording);
        
        updateStatus('准备就绪 - Ready');
    } catch (error) {
        console.error('Error accessing microphone:', error);
        updateStatus('无法访问麦克风 - Cannot access microphone');
        alert('请允许访问麦克风权限');
    }
}

// Start recording
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus'
        });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await processAudio(audioBlob);
            
            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        isRecording = true;
        
        recordBtn.classList.add('recording');
        recordBtn.disabled = true;
        stopBtn.disabled = false;
        updateStatus('正在录音... - Recording...');
    } catch (error) {
        console.error('Error starting recording:', error);
        updateStatus('录音失败 - Recording failed');
        alert('无法开始录音，请检查麦克风权限');
    }
}

// Stop recording
function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        recordBtn.classList.remove('recording');
        recordBtn.disabled = false;
        stopBtn.disabled = true;
        updateStatus('处理中... - Processing...');
    }
}

// Process audio: transcribe -> chat -> speak
async function processAudio(audioBlob) {
    showLoading(true);
    
    try {
        // Step 1: Transcribe audio to text
        updateStatus('正在转写语音... - Transcribing...');
        const transcription = await transcribeAudio(audioBlob);
        
        if (!transcription || !transcription.text) {
            throw new Error('转录失败 - Transcription failed');
        }
        
        const userText = transcription.text.trim();
        if (!userText) {
            throw new Error('未检测到语音内容 - No speech detected');
        }
        
        // Add user message to conversation
        addMessageToConversation('user', userText);
        conversationHistory.push({
            role: 'user',
            content: userText
        });
        
        // Step 2: Get response from AI
        updateStatus('正在生成回复... - Generating response...');
        const aiResponse = await getAIResponse();
        
        if (!aiResponse || !aiResponse.choices || !aiResponse.choices[0]) {
            throw new Error('AI回复失败 - AI response failed');
        }
        
        const assistantText = aiResponse.choices[0].message.content.trim();
        
        // Add assistant message to conversation
        addMessageToConversation('assistant', assistantText);
        conversationHistory.push({
            role: 'assistant',
            content: assistantText
        });
        
        // Step 3: Speak the response
        updateStatus('正在朗读回复... - Speaking response...');
        await speakText(assistantText);
        
        updateStatus('完成！可以继续录音 - Done! You can continue recording');
    } catch (error) {
        console.error('Error processing audio:', error);
        updateStatus('处理失败 - Processing failed: ' + error.message);
        alert('处理失败：' + error.message);
    } finally {
        showLoading(false);
    }
}

// Transcribe audio using API
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
    
    return await response.json();
}

// Get AI response using API
async function getAIResponse() {
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            messages: conversationHistory
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Chat failed');
    }
    
    return await response.json();
}

// Speak text using backend TTS API (more reliable on mobile devices)
function speakText(text) {
    return new Promise((resolve, reject) => {
        // Use backend TTS API for better mobile compatibility
        fetch('/api/tts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: text })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('TTS request failed');
            }
            return response.blob();
        })
        .then(audioBlob => {
            // Create audio element and play
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                resolve();
            };
            
            audio.onerror = (error) => {
                console.error('Audio playback error:', error);
                URL.revokeObjectURL(audioUrl);
                resolve(); // Don't fail the whole process
            };
            
            // Play audio
            audio.play().catch(error => {
                console.error('Error playing audio:', error);
                URL.revokeObjectURL(audioUrl);
                resolve(); // Don't fail if play fails
            });
        })
        .catch(error => {
            console.error('TTS API error:', error);
            // Fallback to Web Speech Synthesis if backend fails
            fallbackToWebSpeech(text).then(resolve).catch(() => resolve());
        });
    });
}

// Fallback to Web Speech Synthesis API (for desktop browsers)
function fallbackToWebSpeech(text) {
    return new Promise((resolve, reject) => {
        if (!('speechSynthesis' in window)) {
            resolve();
            return;
        }
        
        window.speechSynthesis.cancel();
        
        setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = 0.9;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            
            let resolved = false;
            
            utterance.onend = () => {
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            };
            
            utterance.onerror = () => {
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            };
            
            try {
                window.speechSynthesis.speak(utterance);
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        resolve();
                    }
                }, Math.max(text.length * 100, 5000));
            } catch (error) {
                resolve();
            }
        }, 100);
    });
}

// Add message to conversation display
function addMessageToConversation(role, text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const header = document.createElement('div');
    header.className = 'message-header';
    header.textContent = role === 'user' ? '👤 你 (You)' : '🤖 AI老师 (AI Teacher)';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    if (role === 'assistant') {
        content.classList.add('english');
    }
    content.textContent = text;
    
    messageDiv.appendChild(header);
    messageDiv.appendChild(content);
    
    // Add play button for assistant messages (works on all devices)
    if (role === 'assistant') {
        const playButton = document.createElement('button');
        playButton.className = 'play-btn';
        playButton.innerHTML = '🔊 播放声音';
        playButton.title = '点击播放这段文字';
        playButton.onclick = () => {
            playButton.disabled = true;
            playButton.innerHTML = '⏸️ 播放中...';
            speakText(text).then(() => {
                playButton.disabled = false;
                playButton.innerHTML = '🔊 播放声音';
            });
        };
        messageDiv.appendChild(playButton);
    }
    
    // Remove welcome message if it exists
    const welcomeMsg = conversationArea.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }
    
    conversationArea.appendChild(messageDiv);
    conversationArea.scrollTop = conversationArea.scrollHeight;
}

// Update status message
function updateStatus(message) {
    status.textContent = message;
}

// Show/hide loading indicator
function showLoading(show) {
    loading.style.display = show ? 'block' : 'none';
}

// Load version info - version is embedded in HTML, no API call needed
function loadVersion() {
    // Version is already embedded in HTML, no need to fetch from API
    // This avoids 404 errors and makes the app more reliable
    const versionInfo = document.getElementById('versionInfo');
    if (versionInfo && !versionInfo.textContent || versionInfo.textContent === '版本加载中...') {
        // If somehow the version wasn't set, it's already in HTML
        // Just ensure it's displayed
        console.log('Version loaded from HTML');
    }
}

// Initialize when page loads
init();
loadVersion();

