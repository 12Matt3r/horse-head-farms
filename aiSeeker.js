import * as THREE from 'three';

export class AISeeker {
    constructor(scene, environment, audioManager) {
        this.scene = scene;
        this.environment = environment;
        this.audioManager = audioManager; // Store AudioManager instance
        
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

        // Stuck detection
        this.stuckCheckTimer = 0;
        this.stuckCheckInterval = 2; // Seconds
        this.lastPositionForStuckCheck = new THREE.Vector3();
        this.stuckCounter = 0;
        
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
        this.breathBuffer = null;
        this.stepBuffer = null;
        this.catchBuffer = null;
        this.loadSounds(); // Method to load sounds
    }

    async loadSounds() {
        if (!this.audioManager) return;

        const audioContext = this.audioManager.getAudioContext();
        if (!audioContext) {
            console.warn("AISeeker: AudioContext not available for loading sounds.");
            return;
        }

        // Create Breathing Sound Buffer
        let bufferData = new Float32Array(audioContext.sampleRate * 2.5); // Longer breath
        for (let i = 0; i < bufferData.length; i++) {
            const t = i / audioContext.sampleRate;
            // Low-frequency oscillation with some noise
            bufferData[i] = (Math.sin(t * Math.PI * 0.4) + (Math.random() - 0.5) * 0.2) * 0.2 * Math.exp(-t * 0.2);
        }
        this.breathBuffer = audioContext.createBuffer(1, bufferData.length, audioContext.sampleRate);
        this.breathBuffer.copyToChannel(bufferData, 0);

        // Create Footstep Sound Buffer (heavier)
        bufferData = new Float32Array(audioContext.sampleRate * 0.4);
        for (let i = 0; i < bufferData.length; i++) {
            const t = i / audioContext.sampleRate;
            bufferData[i] = (Math.random() * 0.8 - 0.4) * Math.exp(-t * 15); // Louder and more thud
        }
        this.stepBuffer = audioContext.createBuffer(1, bufferData.length, audioContext.sampleRate);
        this.stepBuffer.copyToChannel(bufferData, 0);
        
        // Create Catch Sound Buffer
        bufferData = new Float32Array(audioContext.sampleRate * 1.2);
        for (let i = 0; i < bufferData.length; i++) {
            const t = i / audioContext.sampleRate;
            // Growl/roar like sound
            let envelope = Math.exp(-t * 2.5);
            let mainFreq = 80 + Math.sin(t * 10) * 20; // Vibrato
            let noise = (Math.random() - 0.5) * 0.3;
            bufferData[i] = (Math.sin(t * mainFreq) * 0.4 + noise) * envelope;
        }
        this.catchBuffer = audioContext.createBuffer(1, bufferData.length, audioContext.sampleRate);
        this.catchBuffer.copyToChannel(bufferData, 0);
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
        // General Review: Add a check for gameState
        if (!gameState || gameState.phase !== 'seeking') {
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

            // Stuck detection logic
            this.stuckCheckTimer += deltaTime;
            if (this.stuckCheckTimer >= this.stuckCheckInterval) {
                if (this.position.distanceToSquared(this.lastPositionForStuckCheck) < 0.1) { // Moved less than ~0.3 units (sqrt(0.1))
                    this.stuckCounter++;
                    if (this.stuckCounter >= 2) { // Stuck for two intervals
                        console.log("AI Seeker might be stuck, attempting recovery.");
                        // Example: Turn to a random direction
                        const randomAngle = (Math.random() - 0.5) * Math.PI; // Random angle between -90 and +90 deg
                        this.rotation += randomAngle;
                        // Or, could try to move backward slightly for one frame by inverting velocity briefly
                        // this.velocity.multiplyScalar(-0.5);
                        // Ensure this temporary change in velocity is used in the next movement calculation
                        // or directly adjust position for a small step back.
                        // For simplicity, a random turn is often a good first step.
                        this.stuckCounter = 0; // Reset counter
                    }
                } else {
                    this.stuckCounter = 0; // Reset if moved significantly
                }
                this.lastPositionForStuckCheck.copy(this.position);
                this.stuckCheckTimer = 0;
            }
            
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
            // Ensure player object and its properties are valid
            if (!player ||
                typeof player.isAlive !== 'boolean' ||
                typeof player.isHiding !== 'boolean' ||
                !player.position) {
                // console.warn('AISeeker.getVisiblePlayers: Invalid player object or missing properties', player);
                continue;
            }
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
            // Ensure player object and its properties are valid
            if (!player ||
                typeof player.isAlive !== 'boolean' ||
                !player.position) {
                // console.warn('AISeeker.getAudiblePlayers: Invalid player object or missing properties', player);
                continue;
            }
            if (!player.isAlive) continue;
            
            const distance = this.position.distanceTo(player.position);
            
            // Players make noise when running or moving quickly
            let noiseLevel = 0;
            // Check if player.isRunning and player.velocity exist and are of expected types
            if (typeof player.isRunning === 'boolean' && player.isRunning) {
                noiseLevel = 1;
            } else if (player.velocity && typeof player.velocity.length === 'function' && player.velocity.length() > 0.1) {
                noiseLevel = 0.5;
            }
            
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
        
        // General Review: Ensure target.position exists
        if (!target.position) {
            // console.warn('AISeeker.chase: Target has no position', target);
            this.state = 'patrolling'; // Or some other fallback
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
            // Ensure target.position still exists before cloning for lastKnownPosition
            if (target.position) {
                this.lastKnownPosition = target.position.clone();
            }
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
        const baseMoveDirection = direction.clone(); // Original desired direction
        let chosenDirection = baseMoveDirection.clone();
        let bestDistance = 0; // Store the distance of the chosen clear path
        let directPathClear = false;

        const feelerAngles = [-Math.PI / 6, 0, Math.PI / 6]; // -30, 0, +30 degrees
        const feelerDistanceThreshold = 2.5; // How far the feelers check
        let currentSpeed = speed; // Use a modifiable speed

        // Check direct path first (center feeler)
        this.raycaster.set(this.position, baseMoveDirection);
        let intersections = this.raycaster.intersectObjects(this.obstacles, false); // Non-recursive for performance

        if (intersections.length === 0 || intersections[0].distance > feelerDistanceThreshold) {
            directPathClear = true;
            bestDistance = intersections.length > 0 ? intersections[0].distance : Infinity;
            chosenDirection = baseMoveDirection;
        }

        if (!directPathClear) {
            let foundClearPath = false;
            // Initialize bestDistance to a very small number if direct path is blocked
            bestDistance = -1;

            for (let i = 0; i < feelerAngles.length; i++) {
                const angle = feelerAngles[i];
                // Skip direct path (angle === 0) if it was already checked and found blocked.
                // Or rather, ensure we always consider it but update chosenDirection only if it's better.
                const currentFeelerDirection = baseMoveDirection.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
                this.raycaster.set(this.position, currentFeelerDirection);
                intersections = this.raycaster.intersectObjects(this.obstacles, false);

                const distance = intersections.length > 0 ? intersections[0].distance : Infinity;

                if (distance > bestDistance) { // If this path is better (clearer or less blocked)
                    bestDistance = distance;
                    chosenDirection = currentFeelerDirection;
                    if (distance > feelerDistanceThreshold) {
                        foundClearPath = true; // Mark if we found a path considered "clear enough"
                    }
                }
            }

            // If no path is "clear enough" (above threshold), we've chosen the least blocked one.
            // Now, adjust speed based on how blocked the chosen path is.
            if (!foundClearPath) {
                if (bestDistance < 1.0) { // If the best it can do is still very close to an obstacle
                    currentSpeed *= 0.2; // Drastically reduce speed
                } else if (bestDistance < feelerDistanceThreshold) { // If path is somewhat blocked but not critically
                    currentSpeed *= 0.5; // Reduce speed moderately
                }
            }
        }

        // Update velocity based on the chosenDirection and potentially modified speed
        this.velocity.x = chosenDirection.x * currentSpeed;
        this.velocity.z = chosenDirection.z * currentSpeed;
        
        // Apply movement
        this.position.x += this.velocity.x * deltaTime;
        this.position.z += this.velocity.z * deltaTime;
        
        // Update rotation to face movement direction
        if (this.velocity.lengthSq() > 0.001) { // Use lengthSq for minor perf gain
            this.rotation = Math.atan2(this.velocity.x, this.velocity.z);
        }
        
        // Keep on ground - this might need adjustment if terrain has varying height
        // For now, assuming obstacles define navigable space and AI stays at its current y.
        // this.position.y = 2; // Or ensure it's set based on environment data if available
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
        if (this.audioManager && this.breathBuffer) {
            this.audioManager.playSound(this.breathBuffer, { volume: 0.15, loop: true }); // Loop breathing
        }
    }
    
    playFootstep() {
        if (this.audioManager && this.stepBuffer) {
            this.audioManager.playSound(this.stepBuffer, { volume: 0.3 });
        }
    }
    
    catchPlayer(player) {
        try {
            // Player caught!
            if (player && typeof player.takeDamage === 'function') { // Added check
                player.takeDamage(100); // Instant kill
            } else {
                console.warn('AISeeker.catchPlayer: Attempted to catch player, but player object or takeDamage method is invalid:', player);
            }
            
            // Broadcast catch event
            if (this.room) { // Added check
                this.room.send({
                    type: 'playerCaught',
                    playerId: player && player.id ? player.id : 'unknown', // Check player for id
                    position: player && player.position ? player.position : this.position // Check player for position
                });
            } else {
                console.warn('AISeeker.catchPlayer: this.room is not available to send playerCaught message.');
            }
            
            // Play catch sound effect
            this.playCatchSound();
            
        } catch (error) {
            console.error('Error catching player:', error);
        }
    }
    
    playCatchSound() {
        if (this.audioManager && this.catchBuffer) {
            this.audioManager.playSound(this.catchBuffer, { volume: 0.7 });
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