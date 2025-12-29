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

// Speak text using Web Speech Synthesis API
function speakText(text) {
    return new Promise((resolve, reject) => {
        if (!('speechSynthesis' in window)) {
            console.warn('Speech synthesis not supported');
            resolve();
            return;
        }
        
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.9; // Slightly slower for students
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        utterance.onend = () => {
            resolve();
        };
        
        utterance.onerror = (error) => {
            console.error('Speech synthesis error:', error);
            resolve(); // Don't fail the whole process if TTS fails
        };
        
        window.speechSynthesis.speak(utterance);
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

// Initialize when page loads
init();

