import * as THREE from 'three';

export class AISeeker {
    constructor(scene, environment) {
        this.scene = scene;
        this.environment = environment;
        
        this.position = new THREE.Vector3(0, 2, 0);
        this.rotation = 0;
        this.velocity = new THREE.Vector3();
        
        this.state = 'idle'; // idle, patrolling, chasing, searching
        this.target = null;
        this.lastKnownPosition = null;
        this.searchTime = 0;
        this.patrolPoints = [];
        this.currentPatrolIndex = 0;
        
        this.speed = 6;
        this.runSpeed = 10;
        this.viewDistance = 15;
        this.viewAngle = Math.PI / 3; // 60 degrees
        this.hearingDistance = 8;
        
        this.raycaster = new THREE.Raycaster();
        this.obstacles = [];
        
        // AI decision making
        this.lastDecisionTime = 0;
        this.decisionInterval = 1000; // Make decisions every second
        
        // Visual representation
        this.createVisual();
        this.setupPatrolPoints();
    }
    
    createVisual() {
        // Create a simple seeker model (creepy figure)
        const group = new THREE.Group();
        
        // Body
        const bodyGeometry = new THREE.CapsuleGeometry(0.3, 1.5, 4, 8);
        const bodyMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x333333,
            transparent: true,
            opacity: 0.8
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.75;
        group.add(body);
        
        // Head (horse head shape)
        const headGeometry = new THREE.BoxGeometry(0.4, 0.6, 0.8);
        const headMaterial = new THREE.MeshLambertMaterial({ color: 0x222222 });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.8;
        head.position.z = 0.2;
        group.add(head);
        
        // Eyes (glowing red)
        const eyeGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const eyeMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000,
            emissive: 0x440000
        });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.1, 1.9, 0.5);
        group.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.1, 1.9, 0.5);
        group.add(rightEye);
        
        // Add eerie glow
        const light = new THREE.PointLight(0xff0000, 0.5, 10);
        light.position.set(0, 1.8, 0.5);
        group.add(light);
        
        this.visual = group;
        this.scene.add(this.visual);
        
        // Sound effects
        this.setupAudio();
    }
    
    setupAudio() {
        if (!window.audioContext) {
            window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        this.createSeekerSounds();
    }
    
    createSeekerSounds() {
        // Heavy breathing sound
        const audioContext = window.audioContext;
        const breathBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
        const breathData = breathBuffer.getChannelData(0);
        
        for (let i = 0; i < breathBuffer.length; i++) {
            const t = i / audioContext.sampleRate;
            breathData[i] = Math.sin(t * Math.PI * 0.5) * 0.3 * Math.random();
        }
        
        this.breathBuffer = breathBuffer;
        
        // Footstep sound (heavier than player)
        const stepBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.3, audioContext.sampleRate);
        const stepData = stepBuffer.getChannelData(0);
        
        for (let i = 0; i < stepBuffer.length; i++) {
            stepData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (stepBuffer.length * 0.05)) * 0.8;
        }
        
        this.stepBuffer = stepBuffer;
    }
    
    setupPatrolPoints() {
        // Set up patrol points around the camp
        this.patrolPoints = [
            new THREE.Vector3(10, 2, 10),
            new THREE.Vector3(-10, 2, 10),
            new THREE.Vector3(-10, 2, -10),
            new THREE.Vector3(10, 2, -10),
            new THREE.Vector3(0, 2, 15),
            new THREE.Vector3(15, 2, 0),
            new THREE.Vector3(0, 2, -15),
            new THREE.Vector3(-15, 2, 0)
        ];
    }
    
    update(deltaTime, players, gameState) {
        if (gameState.phase !== 'seeking') {
            this.state = 'idle';
            return;
        }
        
        try {
            // Update AI decision making
            const now = Date.now();
            if (now - this.lastDecisionTime > this.decisionInterval) {
                this.makeDecision(players);
                this.lastDecisionTime = now;
            }
            
            // Update behavior based on state
            switch (this.state) {
                case 'patrolling':
                    this.patrol(deltaTime);
                    break;
                case 'chasing':
                    this.chase(deltaTime, this.target);
                    break;
                case 'searching':
                    this.search(deltaTime);
                    break;
                default:
                    this.idle(deltaTime);
                    break;
            }
            
            // Update visual position
            this.updateVisual();
            
            // Play audio effects
            this.updateAudio(deltaTime);
            
        } catch (error) {
            console.error('Error updating AI seeker:', error);
            this.state = 'idle';
        }
    }
    
    makeDecision(players) {
        // Reset target
        this.target = null;
        
        // Look for visible players
        const visiblePlayers = this.getVisiblePlayers(players);
        const audiblePlayers = this.getAudiblePlayers(players);
        
        if (visiblePlayers.length > 0) {
            // Chase the closest visible player
            this.target = this.getClosestPlayer(visiblePlayers);
            this.state = 'chasing';
            this.lastKnownPosition = this.target.position.clone();
        } else if (audiblePlayers.length > 0) {
            // Search near the closest audible player
            this.target = this.getClosestPlayer(audiblePlayers);
            this.lastKnownPosition = this.target.position.clone();
            this.state = 'searching';
            this.searchTime = 0;
        } else if (this.lastKnownPosition && this.state === 'searching') {
            // Continue searching for a bit
            this.searchTime += this.decisionInterval / 1000;
            if (this.searchTime > 10) { // Search for 10 seconds
                this.state = 'patrolling';
                this.lastKnownPosition = null;
            }
        } else {
            // Default to patrolling
            this.state = 'patrolling';
        }
    }
    
    getVisiblePlayers(players) {
        const visible = [];
        
        for (const player of players) {
            if (!player.isAlive || player.isHiding) continue;
            
            const distance = this.position.distanceTo(player.position);
            if (distance > this.viewDistance) continue;
            
            // Check if player is within view angle
            const direction = player.position.clone().sub(this.position).normalize();
            const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation);
            const angle = Math.acos(direction.dot(forward));
            
            if (angle > this.viewAngle / 2) continue;
            
            // Check line of sight
            this.raycaster.set(this.position, direction);
            const intersections = this.raycaster.intersectObjects(this.obstacles);
            
            if (intersections.length === 0 || intersections[0].distance > distance) {
                visible.push(player);
            }
        }
        
        return visible;
    }
    
    getAudiblePlayers(players) {
        const audible = [];
        
        for (const player of players) {
            if (!player.isAlive) continue;
            
            const distance = this.position.distanceTo(player.position);
            
            // Players make noise when running or moving quickly
            let noiseLevel = 0;
            if (player.isRunning) noiseLevel = 1;
            else if (player.velocity && player.velocity.length() > 0.1) noiseLevel = 0.5;
            
            if (distance < this.hearingDistance * noiseLevel) {
                audible.push(player);
            }
        }
        
        return audible;
    }
    
    getClosestPlayer(players) {
        let closest = null;
        let closestDistance = Infinity;
        
        for (const player of players) {
            const distance = this.position.distanceTo(player.position);
            if (distance < closestDistance) {
                closest = player;
                closestDistance = distance;
            }
        }
        
        return closest;
    }
    
    patrol(deltaTime) {
        if (this.patrolPoints.length === 0) return;
        
        const targetPoint = this.patrolPoints[this.currentPatrolIndex];
        const direction = targetPoint.clone().sub(this.position);
        const distance = direction.length();
        
        if (distance < 2) {
            // Reached patrol point, move to next
            this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
        } else {
            // Move towards patrol point
            direction.normalize();
            this.moveTowards(direction, this.speed, deltaTime);
        }
    }
    
    chase(deltaTime, target) {
        if (!target) {
            this.state = 'patrolling';
            return;
        }
        
        const direction = target.position.clone().sub(this.position);
        const distance = direction.length();
        
        if (distance < 1.5) {
            // Caught the player!
            this.catchPlayer(target);
        } else {
            direction.normalize();
            this.moveTowards(direction, this.runSpeed, deltaTime);
            this.lastKnownPosition = target.position.clone();
        }
    }
    
    search(deltaTime) {
        if (!this.lastKnownPosition) {
            this.state = 'patrolling';
            return;
        }
        
        // Move in a search pattern around the last known position
        const searchRadius = 5;
        const searchSpeed = this.speed * 0.7;
        
        // Simple circular search pattern
        const time = Date.now() * 0.001;
        const searchTarget = this.lastKnownPosition.clone();
        searchTarget.x += Math.cos(time) * searchRadius;
        searchTarget.z += Math.sin(time) * searchRadius;
        
        const direction = searchTarget.clone().sub(this.position);
        direction.normalize();
        this.moveTowards(direction, searchSpeed, deltaTime);
    }
    
    idle(deltaTime) {
        // Just stand still and occasionally look around
        const time = Date.now() * 0.001;
        this.rotation += Math.sin(time * 0.1) * deltaTime * 0.5;
    }
    
    moveTowards(direction, speed, deltaTime) {
        // Simple pathfinding - move towards target while avoiding obstacles
        this.velocity.x = direction.x * speed;
        this.velocity.z = direction.z * speed;
        
        // Check for obstacles in movement direction
        this.raycaster.set(this.position, direction);
        const intersections = this.raycaster.intersectObjects(this.obstacles);
        
        if (intersections.length > 0 && intersections[0].distance < 2) {
            // Obstacle detected, try to go around
            const avoidDirection = direction.clone();
            avoidDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
            this.velocity.x = avoidDirection.x * speed * 0.5;
            this.velocity.z = avoidDirection.z * speed * 0.5;
        }
        
        // Apply movement
        this.position.x += this.velocity.x * deltaTime;
        this.position.z += this.velocity.z * deltaTime;
        
        // Update rotation to face movement direction
        if (this.velocity.length() > 0.1) {
            this.rotation = Math.atan2(this.velocity.x, this.velocity.z);
        }
        
        // Keep on ground
        this.position.y = 2;
    }
    
    updateVisual() {
        if (this.visual) {
            this.visual.position.copy(this.position);
            this.visual.rotation.y = this.rotation;
        }
    }
    
    updateAudio(deltaTime) {
        // Play breathing sound
        if (!this.breathTimer || Date.now() - this.breathTimer > 3000) {
            this.playBreathing();
            this.breathTimer = Date.now();
        }
        
        // Play footsteps when moving
        if (this.velocity.length() > 0.1) {
            if (!this.stepTimer || Date.now() - this.stepTimer > 600) {
                this.playFootstep();
                this.stepTimer = Date.now();
            }
        }
    }
    
    playBreathing() {
        if (window.audioContext && this.breathBuffer) {
            const source = window.audioContext.createBufferSource();
            const gainNode = window.audioContext.createGain();
            
            source.buffer = this.breathBuffer;
            gainNode.gain.value = 0.2;
            
            source.connect(gainNode);
            gainNode.connect(window.audioContext.destination);
            source.start();
        }
    }
    
    playFootstep() {
        if (window.audioContext && this.stepBuffer) {
            const source = window.audioContext.createBufferSource();
            const gainNode = window.audioContext.createGain();
            
            source.buffer = this.stepBuffer;
            gainNode.gain.value = 0.4;
            
            source.connect(gainNode);
            gainNode.connect(window.audioContext.destination);
            source.start();
        }
    }
    
    catchPlayer(player) {
        try {
            // Player caught!
            if (player.takeDamage) {
                player.takeDamage(100); // Instant kill
            }
            
            // Broadcast catch event
            if (this.room) {
                this.room.send({
                    type: 'playerCaught',
                    playerId: player.id,
                    position: player.position
                });
            }
            
            // Play catch sound effect
            this.playCatchSound();
            
        } catch (error) {
            console.error('Error catching player:', error);
        }
    }
    
    playCatchSound() {
        // Generate a scary catch sound
        if (window.audioContext) {
            const audioContext = window.audioContext;
            const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 1, audioContext.sampleRate);
            const data = buffer.getChannelData(0);
            
            for (let i = 0; i < buffer.length; i++) {
                const t = i / audioContext.sampleRate;
                data[i] = Math.sin(t * 200 + Math.sin(t * 50) * 10) * Math.exp(-t * 2) * 0.5;
            }
            
            const source = audioContext.createBufferSource();
            const gainNode = audioContext.createGain();
            
            source.buffer = buffer;
            gainNode.gain.value = 0.6;
            
            source.connect(gainNode);
            gainNode.connect(audioContext.destination);
            source.start();
        }
    }
    
    setObstacles(obstacles) {
        this.obstacles = obstacles;
    }
    
    setPosition(position) {
        this.position.copy(position);
        this.updateVisual();
    }
    
    getPosition() {
        return this.position.clone();
    }
    
    destroy() {
        if (this.visual) {
            this.scene.remove(this.visual);
        }
    }
}