import * as THREE from 'three';
import { Player } from './player.js';
import { AISeeker } from './aiSeeker.js';
import { Environment } from './environment.js';
import { GameManager } from './gameManager.js';

class HorseHeadFarms {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.player = null;
        this.aiSeeker = null;
        this.environment = null;
        this.gameManager = null;
        this.room = null;
        this.controls = null;
        this.masterVolume = 1;
        this.selectedModel = 'default';
        this.playerModels = new Map();
        
        this.clock = new THREE.Clock();
        this.lastTime = 0;
        this.isInitialized = false;
        
        this.otherPlayers = new Map();
        this.performanceStats = {
            fps: 0,
            frameCount: 0,
            lastFpsUpdate: 0
        };
        
        this.init();
    }
    
    async init() {
        try {
            this.setupScene();
            this.setupRenderer();
            this.setupCamera();
            
            // Initialize WebSim room
            this.room = new WebsimSocket();
            await this.room.initialize();
            
            // Create game components
            this.environment = new Environment(this.scene);
            this.player = new Player(this.scene, this.camera, this.renderer, this.room);
            this.aiSeeker = new AISeeker(this.scene, this.environment);
            this.gameManager = new GameManager(this.room, this.player, this.aiSeeker, this.environment);
            
            // Setup component interactions
            this.player.setCollisionObjects(this.environment.getCollisionObjects());
            this.player.setHideSpots(this.environment.getHidingSpots());
            this.aiSeeker.setObstacles(this.environment.getCollisionObjects());
            
            // Setup network event handlers
            this.setupNetworking();
            
            this.isInitialized = true;
            
            // Start render loop
            this.animate();
            
            // Hide loading screen after everything is set up
            setTimeout(() => {
                const loadingScreen = document.getElementById('loadingScreen');
                if (loadingScreen) {
                    loadingScreen.classList.add('hidden');
                }
            }, 2000);
            
        } catch (error) {
            console.error('Failed to initialize game:', error);
            this.showErrorMessage('Failed to initialize game. Please refresh and try again.');
        }
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000011);
    }
    
    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('gameCanvas'),
            antialias: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }
    
    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 2, 0);
    }
    
    setupNetworking() {
        // Handle other player updates
        this.room.subscribePresence((presence) => {
            this.updateOtherPlayers(presence);
        });
        
        // Handle network events
        this.room.onmessage = (event) => {
            this.handleNetworkEvent(event.data);
        };
        
        // Setup settings panel
        this.setupSettings();
        
        // Setup model selection
        this.setupModelSelection();
    }
    
    setupSettings() {
        const settingsBtn = document.getElementById('settingsBtn');
        const closeSettings = document.getElementById('closeSettings');
        const settings = document.getElementById('settings');
        const menu = document.getElementById('menu');
        
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                menu.classList.add('hidden');
                settings.classList.remove('hidden');
            });
        }
        
        if (closeSettings) {
            closeSettings.addEventListener('click', () => {
                settings.classList.add('hidden');
                menu.classList.remove('hidden');
            });
        }
        
        // Handle settings changes
        const fogToggle = document.getElementById('toggleFog');
        const volumeSlider = document.getElementById('volumeSlider');
        const gfxQuality = document.getElementById('gfxQuality');
        
        if (fogToggle) {
            fogToggle.addEventListener('change', (e) => {
                if (this.scene.fog) {
                    this.scene.fog.density = e.target.checked ? 0.02 : 0;
                }
            });
        }
        
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                if (window.audioContext && window.audioContext.destination) {
                    // Adjust master volume if possible
                    this.masterVolume = parseFloat(e.target.value);
                }
            });
        }
        
        if (gfxQuality) {
            gfxQuality.addEventListener('change', (e) => {
                this.adjustGraphicsQuality(e.target.value);
            });
        }
        
        // ESC key to toggle settings
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Escape') {
                if (!settings.classList.contains('hidden')) {
                    settings.classList.add('hidden');
                    this.controls?.lock();
                } else if (!menu.classList.contains('hidden')) {
                    menu.classList.add('hidden');
                    settings.classList.remove('hidden');
                    this.controls?.unlock();
                }
            }
        });
    }
    
    setupModelSelection() {
        const selectModelBtn = document.getElementById('selectModelBtn');
        const modelSelection = document.getElementById('modelSelection');
        const confirmModel = document.getElementById('confirmModel');
        const menu = document.getElementById('menu');
        
        if (selectModelBtn) {
            selectModelBtn.addEventListener('click', () => {
                menu.classList.add('hidden');
                modelSelection.classList.remove('hidden');
            });
        }
        
        // Handle model option selection
        const modelOptions = document.querySelectorAll('.model-option');
        modelOptions.forEach(option => {
            option.addEventListener('click', () => {
                modelOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                this.selectedModel = option.dataset.model;
                confirmModel.disabled = false;
            });
        });
        
        if (confirmModel) {
            confirmModel.addEventListener('click', () => {
                this.loadPlayerModel(this.selectedModel);
                modelSelection.classList.add('hidden');
                menu.classList.remove('hidden');
            });
        }
        
        // Load available models
        this.loadAvailableModels();
    }
    
    async loadAvailableModels() {
        const modelPaths = {
            'default': null, // Use default capsule
            'pomni': './Pomni Doll.fbx',
            'model1': './3f01df0c82bd_A_highly_detailed_3D_model_o_0_glb (1).glb',
            'model2': './e79b2b8fef38_A_highly_exaggerated_3D_mode_0_glb.glb',
            'model3': './fdc9900004aa_A_highly_exaggerated_3D_mode_0_glb (1).glb',
            'model4': './ee5a8cec8d0e_A_highly_exaggerated_3D_mode_0_glb.glb',
            'model5': './0832f25b4a0a_A_highly_exaggerated_3D_mode_0_glb.glb'
        };
        
        for (const [key, path] of Object.entries(modelPaths)) {
            if (path) {
                try {
                    const model = await this.loadPlayerModelFile(path);
                    if (model) {
                        this.playerModels.set(key, model);
                    }
                } catch (error) {
                    console.warn(`Failed to load model ${key}:`, error);
                }
            }
        }
    }
    
    async loadPlayerModelFile(path) {
        return new Promise((resolve, reject) => {
            const loader = path.endsWith('.fbx') ? 
                new THREE.FBXLoader() : 
                new THREE.GLTFLoader();
                
            loader.load(
                path,
                (result) => {
                    const model = path.endsWith('.fbx') ? result : result.scene;
                    
                    // Scale and prepare model
                    model.scale.set(0.01, 0.01, 0.01);
                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });
                    
                    resolve(model.clone());
                },
                (progress) => {
                    console.log('Loading model progress:', (progress.loaded / progress.total * 100) + '%');
                },
                (error) => {
                    console.error('Error loading model:', error);
                    resolve(null);
                }
            );
        });
    }
    
    loadPlayerModel(modelKey) {
        if (this.player && this.player.visual) {
            this.scene.remove(this.player.visual);
        }
        
        if (modelKey === 'default' || !this.playerModels.has(modelKey)) {
            // Use default capsule
            this.createDefaultPlayerModel();
        } else {
            // Use selected 3D model
            const model = this.playerModels.get(modelKey).clone();
            this.player.visual = model;
            this.scene.add(model);
        }
        
        // Update network presence with selected model
        if (this.room) {
            this.room.updatePresence({
                selectedModel: modelKey
            });
        }
    }
    
    createDefaultPlayerModel() {
        const group = new THREE.Group();
        
        // Player body
        const bodyGeometry = new THREE.CapsuleGeometry(0.3, 1.5, 4, 8);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x00ff00 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.75;
        body.castShadow = true;
        group.add(body);
        
        // Player head
        const headGeometry = new THREE.SphereGeometry(0.25, 8, 8);
        const headMaterial = new THREE.MeshLambertMaterial({ color: 0xffddbb });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.6;
        head.castShadow = true;
        group.add(head);
        
        this.player.visual = group;
        this.scene.add(group);
    }
    
    adjustGraphicsQuality(quality) {
        switch (quality) {
            case 'low':
                this.renderer.setPixelRatio(1);
                this.renderer.shadowMap.type = THREE.BasicShadowMap;
                if (this.scene.fog) this.scene.fog.density = 0.04;
                break;
            case 'medium':
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
                this.renderer.shadowMap.type = THREE.PCFShadowMap;
                if (this.scene.fog) this.scene.fog.density = 0.02;
                break;
            case 'high':
                this.renderer.setPixelRatio(window.devicePixelRatio);
                this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                if (this.scene.fog) this.scene.fog.density = 0.02;
                break;
        }
    }
    
    updateOtherPlayers(presence) {
        if (!this.isInitialized) return;
        
        // Update visual representations of other players
        for (const [playerId, playerData] of Object.entries(presence)) {
            if (playerId === this.room.clientId) continue; // Skip self
            
            try {
                if (!this.otherPlayers.has(playerId)) {
                    // Create new player visual
                    this.createOtherPlayerVisual(playerId, playerData);
                } else {
                    // Update existing player
                    this.updateOtherPlayerVisual(playerId, playerData);
                }
            } catch (error) {
                console.error('Error updating player visual:', playerId, error);
            }
        }
        
        // Remove disconnected players
        for (const [playerId, playerVisual] of this.otherPlayers) {
            if (!presence[playerId]) {
                try {
                    this.scene.remove(playerVisual);
                    this.otherPlayers.delete(playerId);
                } catch (error) {
                    console.error('Error removing player visual:', playerId, error);
                }
            }
        }
    }
    
    createOtherPlayerVisual(playerId, playerData) {
        if (!playerData.position) return;
        
        let group;
        
        // Check if player has a selected model
        if (playerData.selectedModel && playerData.selectedModel !== 'default' && this.playerModels.has(playerData.selectedModel)) {
            group = this.playerModels.get(playerData.selectedModel).clone();
        } else {
            // Create default player visual
            group = new THREE.Group();
            
            // Player body
            const bodyGeometry = new THREE.CapsuleGeometry(0.3, 1.5, 4, 8);
            const bodyMaterial = new THREE.MeshLambertMaterial({ 
                color: playerData.role === 'seeker' ? 0xff0000 : 0x00ff00 
            });
            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            body.position.y = 0.75;
            body.castShadow = true;
            group.add(body);
            
            // Player head
            const headGeometry = new THREE.SphereGeometry(0.25, 8, 8);
            const headMaterial = new THREE.MeshLambertMaterial({ 
                color: 0xffddbb 
            });
            const head = new THREE.Mesh(headGeometry, headMaterial);
            head.position.y = 1.6;
            head.castShadow = true;
            group.add(head);
        }
        
        // Name tag
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        context.font = '24px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.fillText(this.room.peers[playerId]?.username || 'Player', 128, 40);
        
        const texture = new THREE.CanvasTexture(canvas);
        const nameTagMaterial = new THREE.SpriteMaterial({ map: texture });
        const nameTag = new THREE.Sprite(nameTagMaterial);
        nameTag.position.y = 2.5;
        nameTag.scale.set(2, 0.5, 1);
        group.add(nameTag);
        
        // Position the player
        group.position.set(
            playerData.position.x,
            playerData.position.y,
            playerData.position.z
        );
        
        if (playerData.rotation && playerData.rotation.y !== undefined) {
            group.rotation.y = playerData.rotation.y;
        }
        
        this.scene.add(group);
        this.otherPlayers.set(playerId, group);
    }
    
    updateOtherPlayerVisual(playerId, playerData) {
        const playerVisual = this.otherPlayers.get(playerId);
        if (!playerVisual || !playerData.position) return;
        
        // Smooth interpolation to new position
        const targetPosition = new THREE.Vector3(
            playerData.position.x,
            playerData.position.y,
            playerData.position.z
        );
        
        playerVisual.position.lerp(targetPosition, 0.1);
        
        if (playerData.rotation && playerData.rotation.y !== undefined) {
            playerVisual.rotation.y = playerData.rotation.y;
        }
        
        // Update player color based on role
        const body = playerVisual.children[0];
        if (body && body.material) {
            const color = playerData.role === 'seeker' ? 0xff0000 : 
                         playerData.role === 'hider' ? 0x00ff00 : 0xaaaaaa;
            body.material.color.setHex(color);
        }
        
        // Hide/show based on hiding state
        if (playerData.isHiding && playerData.role === 'hider') {
            playerVisual.visible = false;
        } else {
            playerVisual.visible = true;
        }
        
        // Add fear effects
        if (playerData.fear > 50) {
            const shakeAmount = (playerData.fear - 50) / 50 * 0.1;
            playerVisual.position.x += (Math.random() - 0.5) * shakeAmount;
            playerVisual.position.z += (Math.random() - 0.5) * shakeAmount;
        }
    }
    
    handleNetworkEvent(data) {
        switch (data.type) {
            case 'playerCaught':
                this.handlePlayerCaught(data);
                break;
            case 'scream':
                this.playScreamSound(data.position);
                break;
            case 'footstep':
                this.playFootstepSound(data.position, data.volume);
                break;
        }
    }
    
    handlePlayerCaught(data) {
        // Visual effect for player being caught
        if (data.position) {
            this.createCatchEffect(data.position);
        }
        
        // Play scary sound
        this.playScreamSound(data.position);
    }
    
    createCatchEffect(position) {
        // Create a blood splatter effect
        const particleCount = 50;
        const particles = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            positions[i3] = position.x + (Math.random() - 0.5) * 2;
            positions[i3 + 1] = position.y + Math.random() * 2;
            positions[i3 + 2] = position.z + (Math.random() - 0.5) * 2;
            
            colors[i3] = 0.8 + Math.random() * 0.2;     // Red
            colors[i3 + 1] = Math.random() * 0.2;       // Green
            colors[i3 + 2] = Math.random() * 0.2;       // Blue
        }
        
        particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const material = new THREE.PointsMaterial({
            size: 0.1,
            vertexColors: true,
            transparent: true,
            opacity: 0.8
        });
        
        const effect = new THREE.Points(particles, material);
        this.scene.add(effect);
        
        // Animate and remove
        let opacity = 0.8;
        const animate = () => {
            opacity -= 0.02;
            material.opacity = opacity;
            
            if (opacity <= 0) {
                this.scene.remove(effect);
            } else {
                requestAnimationFrame(animate);
            }
        };
        animate();
    }
    
    playScreamSound(position) {
        if (!window.audioContext) return;
        
        // Generate scream sound
        const audioContext = window.audioContext;
        const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 1.5, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            const t = i / audioContext.sampleRate;
            data[i] = Math.sin(t * 800 + Math.sin(t * 100) * 50) * Math.exp(-t * 2) * 0.5;
        }
        
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        
        source.buffer = buffer;
        
        // 3D positioning
        if (position && this.player) {
            const distance = this.player.getPosition().distanceTo(
                new THREE.Vector3(position.x, position.y, position.z)
            );
            gainNode.gain.value = Math.max(0, 1 - distance / 20);
        } else {
            gainNode.gain.value = 0.5;
        }
        
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        source.start();
    }
    
    playFootstepSound(position, volume = 0.1) {
        if (!window.audioContext || !position || !this.player) return;
        
        const distance = this.player.getPosition().distanceTo(
            new THREE.Vector3(position.x, position.y, position.z)
        );
        
        if (distance > 15) return; // Too far to hear
        
        const audioContext = window.audioContext;
        const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.2, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (buffer.length * 0.1));
        }
        
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        
        source.buffer = buffer;
        gainNode.gain.value = volume * Math.max(0, 1 - distance / 15);
        
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        source.start();
    }
    
    showErrorMessage(message) {
        const notification = document.getElementById('gameNotification');
        if (notification) {
            notification.textContent = message;
            notification.style.display = 'block';
            notification.style.background = 'rgba(255, 0, 0, 0.9)';
            
            setTimeout(() => {
                notification.style.display = 'none';
            }, 5000);
        }
    }
    
    showNotification(message, type = 'info') {
        const notification = document.getElementById('gameNotification');
        if (notification) {
            notification.textContent = message;
            notification.style.display = 'block';
            
            switch (type) {
                case 'success':
                    notification.style.background = 'rgba(0, 255, 0, 0.9)';
                    break;
                case 'warning':
                    notification.style.background = 'rgba(255, 255, 0, 0.9)';
                    break;
                case 'error':
                    notification.style.background = 'rgba(255, 0, 0, 0.9)';
                    break;
                default:
                    notification.style.background = 'rgba(0, 100, 255, 0.9)';
            }
            
            setTimeout(() => {
                notification.style.display = 'none';
            }, 3000);
        }
    }
    
    updatePerformanceStats() {
        this.performanceStats.frameCount++;
        const now = performance.now();
        
        if (now - this.performanceStats.lastFpsUpdate > 1000) {
            this.performanceStats.fps = this.performanceStats.frameCount;
            this.performanceStats.frameCount = 0;
            this.performanceStats.lastFpsUpdate = now;
            
            // Adjust quality based on performance
            if (this.performanceStats.fps < 30) {
                this.optimizePerformance();
            }
        }
    }
    
    optimizePerformance() {
        // Reduce shadow quality
        if (this.renderer.shadowMap.type !== THREE.BasicShadowMap) {
            this.renderer.shadowMap.type = THREE.BasicShadowMap;
            console.log('Optimized: Reduced shadow quality');
        }
        
        // Reduce render distance for fog
        if (this.scene.fog && this.scene.fog.density < 0.04) {
            this.scene.fog.density = 0.04;
            console.log('Optimized: Increased fog density');
        }
    }

    animate() {
        if (!this.isInitialized) return;
        
        requestAnimationFrame(() => this.animate());
        
        try {
            const deltaTime = Math.min(this.clock.getDelta(), 0.1); // Cap delta time
            const currentTime = this.clock.getElapsedTime();
            
            // Update performance stats
            this.updatePerformanceStats();
            
            // Update game components
            if (this.player) {
                this.player.update(deltaTime, this.gameManager?.getGameState());
            }
            
            if (this.environment) {
                this.environment.update(deltaTime);
            }
            
            if (this.gameManager) {
                this.gameManager.update(deltaTime);
            }
            
            // Update other player interpolation
            this.updateOtherPlayerInterpolation(deltaTime);
            
            // Update UI
            this.updateUI();
            
            // Render
            this.renderer.render(this.scene, this.camera);
            
            this.lastTime = currentTime;
            
        } catch (error) {
            console.error('Error in animation loop:', error);
        }
    }
    
    updateUI() {
        try {
            // Update status bars
            if (this.player) {
                const healthBar = document.getElementById('healthBar');
                const staminaBar = document.getElementById('staminaBar');
                const fearBar = document.getElementById('fearBar');
                
                if (healthBar) healthBar.style.width = `${this.player.health || 100}%`;
                if (staminaBar) staminaBar.style.width = `${this.player.stamina || 100}%`;
                if (fearBar) fearBar.style.width = `${this.player.fear || 0}%`;
            }
        } catch (error) {
            console.error('Error updating UI:', error);
        }
    }
    
    updateOtherPlayerInterpolation(deltaTime) {
        // Smooth interpolation for other players
        for (const [playerId, playerVisual] of this.otherPlayers) {
            const presence = this.room.presence[playerId];
            if (!presence || !presence.position) continue;
            
            const targetPosition = new THREE.Vector3(
                presence.position.x,
                presence.position.y,
                presence.position.z
            );
            
            // Smooth movement
            playerVisual.position.lerp(targetPosition, deltaTime * 5);
        }
    }
}

// Start the game when page loads
window.addEventListener('load', () => {
    new HorseHeadFarms();
});

// Handle audio context on user interaction
document.addEventListener('click', () => {
    if (!window.audioContext) {
        window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (window.audioContext.state === 'suspended') {
        window.audioContext.resume();
    }
}, { once: true });