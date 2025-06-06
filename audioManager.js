class AudioManager {
    constructor() {
        this.audioContext = null;
        this.masterGainNode = null;
        this.isInitialized = false; // Flag to track initialization

        // Listener for first user interaction to initialize AudioContext
        this.boundInitAudio = this.initAudio.bind(this);
        document.addEventListener('click', this.boundInitAudio, { once: true });
        document.addEventListener('touchstart', this.boundInitAudio, { once: true });
    }

    initAudio() {
        if (this.isInitialized) return;

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGainNode = this.audioContext.createGain();
        this.masterGainNode.connect(this.audioContext.destination);
        this.isInitialized = true;
        console.log("AudioContext initialized and master gain node created.");

        // Remove event listeners after initialization
        document.removeEventListener('click', this.boundInitAudio);
        document.removeEventListener('touchstart', this.boundInitAudio);
    }

    getAudioContext() {
        if (!this.isInitialized) {
            console.warn("AudioContext not initialized. Call initAudio() first or wait for user interaction.");
        }
        return this.audioContext;
    }

    setMasterVolume(volume) {
        if (this.masterGainNode) {
            this.masterGainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
        } else {
            console.warn("Master gain node not available. AudioContext might not be initialized.");
        }
    }

    async loadSound(url) {
        if (!this.audioContext) {
            console.warn("AudioContext not initialized. Cannot load sound.");
            return null;
        }
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            return audioBuffer;
        } catch (error) {
            console.error(`Error loading sound from ${url}:`, error);
            return null;
        }
    }

    playSound(buffer, options = {}) {
        if (!this.audioContext || !buffer || !this.masterGainNode) {
            console.warn("Cannot play sound: AudioContext not initialized, buffer missing, or master gain not set up.");
            return null;
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;

        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = options.volume !== undefined ? options.volume : 1;

        source.loop = options.loop || false;

        // Connect source to its own gain node, then to master gain
        source.connect(gainNode);
        gainNode.connect(this.masterGainNode);

        source.start(0);
        return source;
    }

    // Method to resume AudioContext if it was suspended
    resumeContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                console.log("AudioContext resumed successfully.");
            }).catch(e => console.error("Error resuming AudioContext:", e));
        }
    }
}
