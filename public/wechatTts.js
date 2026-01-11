// WeChat-compatible TTS using server-side API
// Based on successful implementation from Lovable

// Silence noisy console.log output unless explicitly enabled via ?debug=1
const __DEBUG_LOGS__ = window.__DEBUG_LOGS__ === true || window.location.search.includes('debug=1');
if (!__DEBUG_LOGS__ && typeof console !== 'undefined' && typeof console.log === 'function' && !console.__silenced) {
    console.__origLog = console.log.bind(console);
    console.log = () => {};
    console.__silenced = true;
}

let currentAudio = null;
let isSpeaking = false;
let audioContext = null;

// Use window scope to avoid conflicts with app.js
window.wechatTTS = window.wechatTTS || {};

const isIOS = () => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
};

const isIOSWeChat = () => {
    return isIOS() && window.isWeChat();
};

// Get or create AudioContext (lazy initialization)
const getAudioContext = () => {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('AudioContext created, state:', audioContext.state);
        } catch (e) {
            console.error('Failed to create AudioContext:', e);
        }
    }
    return audioContext;
};

// Resume AudioContext if suspended
const resumeAudioContext = async () => {
    try {
        const ctx = getAudioContext();
        if (!ctx) {
            console.log('No AudioContext available');
            return;
        }
        
        console.log('AudioContext state before resume:', ctx.state);
        
        if (ctx.state === 'suspended') {
            await ctx.resume();
            console.log('AudioContext resumed, new state:', ctx.state);
        } else if (ctx.state === 'running') {
            console.log('AudioContext already running');
        }
    } catch (e) {
        console.error('Failed to resume AudioContext:', e);
    }
};

// Play audio using AudioContext (better for iOS WeChat)
const playAudioWithContext = async (base64Audio) => {
    const ctx = getAudioContext();
    await resumeAudioContext();
    
    // Decode base64 to ArrayBuffer
    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Decode audio data
    const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
    
    // Create and play source
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    
    return new Promise((resolve, reject) => {
        source.onended = () => {
            isSpeaking = false;
            console.log('AudioContext playback ended');
            resolve();
        };
        
        try {
            source.start(0);
            isSpeaking = true;
            console.log('AudioContext playback started');
        } catch (e) {
            isSpeaking = false;
            reject(e);
        }
    });
};

// Play audio using Audio element with Blob URL
const playAudioWithElement = async (base64Audio) => {
    // Convert base64 to blob
    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'audio/mp3' });
    const audioUrl = URL.createObjectURL(blob);
    
    return new Promise((resolve, reject) => {
        // Prefer re-using the existing <audio id="ttsAudio"> element (more compatible in WeChat)
        const existing = document.getElementById('ttsAudio');
        currentAudio = existing || new Audio();
        
        // Set attributes for mobile compatibility
        currentAudio.setAttribute('playsinline', 'true');
        currentAudio.setAttribute('webkit-playsinline', 'true');
        currentAudio.preload = 'auto';
        currentAudio.muted = false;
        currentAudio.volume = 1;
        
        currentAudio.onplay = () => {
            isSpeaking = true;
            console.log('Audio element playback started');
        };
        
        currentAudio.onended = () => {
            isSpeaking = false;
            URL.revokeObjectURL(audioUrl);
            currentAudio = null;
            console.log('Audio element playback ended');
            resolve();
        };
        
        currentAudio.onerror = (e) => {
            isSpeaking = false;
            URL.revokeObjectURL(audioUrl);
            currentAudio = null;
            console.error('Audio playback error:', e);
            reject(new Error('Audio playback failed'));
        };
        
        currentAudio.src = audioUrl;
        currentAudio.load();
        
        currentAudio.play().catch((error) => {
            isSpeaking = false;
            URL.revokeObjectURL(audioUrl);
            currentAudio = null;
            console.error('Failed to play audio:', error);
            reject(error);
        });
    });
};

// Unlock iOS WeChat audio
const unlockIOSWeChatAudio = async () => {
    if (!isIOSWeChat()) return;
    
    console.log('Unlocking iOS WeChat audio...');
    
    // Use WeixinJSBridge to unlock audio
    const bridge = window.WeixinJSBridge;
    if (bridge && typeof bridge.invoke === 'function') {
        try {
            await new Promise((resolve) => {
                bridge.invoke('getNetworkType', {}, () => resolve());
            });
            console.log('WeixinJSBridge invoked');
        } catch (e) {
            console.log('WeixinJSBridge invoke failed:', e);
        }
    }
    
    // Kick the AudioContext with silent oscillator
    try {
        const ctx = getAudioContext();
        await resumeAudioContext();
        
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0; // Silent
        
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.05);
        
        console.log('Silent oscillator played');
    } catch (e) {
        console.log('Silent oscillator failed:', e);
    }
};

// Main TTS function
window.speakWithBackendTTS = async (text) => {
    // Stop any current playback
    stopTTS();
    
    try {
        console.log('Requesting TTS from backend...');
        
        const response = await fetch('/api/tts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: text })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `TTS request failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.audioContent) {
            throw new Error('No audio content received');
        }
        
        console.log('\n🎵 ========================================');
        console.log('✅ TTS SUCCESS!');
        console.log(`📢 Service Used: ${data.service || 'Unknown'}`);
        console.log(`📦 Audio Length: ${data.audioContent.length} bytes`);
        console.log(`🎧 Format: ${data.format || 'mp3'}`);
        console.log('========================================\n');
        
        // iOS WeChat: prefer Audio element first, then AudioContext
        if (isIOSWeChat()) {
            await unlockIOSWeChatAudio();
            try {
                await playAudioWithElement(data.audioContent);
                return;
            } catch (elementError) {
                console.log('Audio element failed on iOS WeChat, trying AudioContext:', elementError);
                await playAudioWithContext(data.audioContent);
                return;
            }
        }
        
        // Default: Try AudioContext first, fallback to Audio element
        try {
            await playAudioWithContext(data.audioContent);
        } catch (contextError) {
            console.log('AudioContext failed, trying Audio element:', contextError);
            await playAudioWithElement(data.audioContent);
        }
        
    } catch (error) {
        console.error('Backend TTS error:', error);
        throw error;
    }
};

// Stop TTS
const stopTTS = () => {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = '';
        currentAudio = null;
    }
    isSpeaking = false;
};

// Initialize audio on first user interaction
window.initAudioForMobile = async () => {
    if (window.__audio_initialized) {
        console.log('Audio already initialized');
        return;
    }
    
    try {
        console.log('Initializing audio for mobile...');
        
        // Create AudioContext on user gesture
        getAudioContext();
        
        // Try to resume it
        await resumeAudioContext();
        
        // WeChat iOS setup
        if (isIOSWeChat()) {
            if (!window.__wechat_audio_init) {
                window.__wechat_audio_init = true;
                
                const kick = async () => {
                    try {
                        await unlockIOSWeChatAudio();
                        console.log('WeChat iOS audio unlock attempted');
                    } catch (e) {
                        console.log('WeChat audio unlock error:', e);
                    }
                };
                
                document.addEventListener('touchstart', kick, { once: true, passive: true });
                document.addEventListener('click', kick, { once: true });
                
                document.addEventListener('WeixinJSBridgeReady', () => {
                    unlockIOSWeChatAudio().then(() => {
                        console.log('WeixinJSBridgeReady audio unlock attempted');
                    }).catch(e => {
                        console.log('WeixinJSBridge unlock error:', e);
                    });
                }, false);
            }
        }
        
        window.__audio_initialized = true;
        console.log('Audio context initialized for mobile');
    } catch (e) {
        console.log('Audio context init failed:', e);
    }
};

// Export for debugging
window.getIsTTSSpeaking = () => isSpeaking;

