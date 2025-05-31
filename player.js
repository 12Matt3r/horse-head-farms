import * as THREE from 'three';

export class Player {
    constructor(scene, camera, renderer, room) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.room = room;
        
        this.position = new THREE.Vector3(0, 2, 0);
        this.velocity = new THREE.Vector3();
        this.rotation = new THREE.Euler();
        this.moveDirection = new THREE.Vector3();
        
        // Player stats
        this.health = 100;
        this.stamina = 100;
        this.fear = 0;
        this.isAlive = true;
        this.isHiding = false;
        this.isRunning = false;
        this.isCrouching = false;
        
        // Movement parameters
        this.walkSpeed = 5;
        this.runSpeed = 8;
        this.crouchSpeed = 2;
        this.jumpForce = 8;
        this.gravity = 20;
        
        // Collision detection
        this.collisionObjects = [];
        this.hideSpots = [];
        this.raycaster = new THREE.Raycaster();
        this.groundCheckRay = new THREE.Raycaster();
        this.isGrounded = false;
        
        // Camera controls
        this.mouseSensitivity = 0.002;
        this.pitchObject = new THREE.Object3D();
        this.yawObject = new THREE.Object3D();
        this.yawObject.add(this.pitchObject);
        this.pitchObject.add(camera);
        
        // Sound effects
        this.setupAudio();
        
        // Create visual representation
        this.createVisual();
        
        // Setup controls
        this.setupControls();
    }
    
    createVisual() {
        const group = new THREE.Group();
        
        // Player body
        const bodyGeometry = new THREE.CapsuleGeometry(0.3, 1.5, 4, 8);
        const bodyMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x00ff00,
            transparent: true,
            opacity: 0.8
        });
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
        
        this.visual = group;
        this.scene.add(this.visual);
    }
    
    setupControls() {
        // Keyboard state
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            crouch: false,
            run: false,
            interact: false
        };
        
        // Event listeners
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
        
        // Lock pointer on click
        this.renderer.domElement.addEventListener('click', () => {
            this.renderer.domElement.requestPointerLock();
        });
        
        // Handle pointer lock change
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === this.renderer.domElement) {
                this.controls.enabled = true;
            } else {
                this.controls.enabled = false;
            }
        });
    }
    
    setupAudio() {
        if (!window.audioContext) {
            window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        this.createFootstepSounds();
        this.createJumpSound();
        this.createLandSound();
    }
    
    createFootstepSounds() {
        const audioContext = window.audioContext;
        const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.2, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (buffer.length * 0.1));
        }
        
        this.footstepBuffer = buffer;
    }
    
    createJumpSound() {
        const audioContext = window.audioContext;
        const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.3, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            const t = i / audioContext.sampleRate;
            data[i] = Math.sin(t * 200) * Math.exp(-t * 10) * 0.5;
        }
        
        this.jumpBuffer = buffer;
    }
    
    createLandSound() {
        const audioContext = window.audioContext;
        const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.4, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            const t = i / audioContext.sampleRate;
            data[i] = Math.sin(t * 100) * Math.exp(-t * 5) * 0.8;
        }
        
        this.landBuffer = buffer;
    }
    
    playFootstep() {
        if (window.audioContext && this.footstepBuffer) {
            const source = window.audioContext.createBufferSource();
            const gainNode = window.audioContext.createGain();
            
            source.buffer = this.footstepBuffer;
            gainNode.gain.value = this.isRunning ? 0.4 : 0.2;
            
            source.connect(gainNode);
            gainNode.connect(window.audioContext.destination);
            source.start();
            
            // Broadcast footstep sound to other players
            if (this.room) {
                this.room.send({
                    type: 'footstep',
                    position: this.position,
                    volume: this.isRunning ? 0.4 : 0.2
                });
            }
        }
    }
    
    playJumpSound() {
        if (window.audioContext && this.jumpBuffer) {
            const source = window.audioContext.createBufferSource();
            const gainNode = window.audioContext.createGain();
            
            source.buffer = this.jumpBuffer;
            gainNode.gain.value = 0.3;
            
            source.connect(gainNode);
            gainNode.connect(window.audioContext.destination);
            source.start();
        }
    }
    
    playLandSound() {
        if (window.audioContext && this.landBuffer) {
            const source = window.audioContext.createBufferSource();
            const gainNode = window.audioContext.createGain();
            
            source.buffer = this.landBuffer;
            gainNode.gain.value = 0.4;
            
            source.connect(gainNode);
            gainNode.connect(window.audioContext.destination);
            source.start();
        }
    }
    
    onKeyDown(event) {
        switch (event.code) {
            case 'KeyW':
                this.keys.forward = true;
                break;
            case 'KeyS':
                this.keys.backward = true;
                break;
            case 'KeyA':
                this.keys.left = true;
                break;
            case 'KeyD':
                this.keys.right = true;
                break;
            case 'Space':
                this.keys.jump = true;
                if (this.isGrounded) this.jump();
                break;
            case 'KeyF':
                this.keys.crouch = !this.keys.crouch;
                this.toggleCrouch();
                break;
            case 'ShiftLeft':
                this.keys.run = true;
                break;
            case 'KeyE':
                this.keys.interact = true;
                this.interact();
                break;
        }
    }
    
    onKeyUp(event) {
        switch (event.code) {
            case 'KeyW':
                this.keys.forward = false;
                break;
            case 'KeyS':
                this.keys.backward = false;
                break;
            case 'KeyA':
                this.keys.left = false;
                break;
            case 'KeyD':
                this.keys.right = false;
                break;
            case 'Space':
                this.keys.jump = false;
                break;
            case 'ShiftLeft':
                this.keys.run = false;
                break;
            case 'KeyE':
                this.keys.interact = false;
                break;
        }
    }
    
    onMouseMove(event) {
        if (document.pointerLockElement === this.renderer.domElement) {
            this.yawObject.rotation.y -= event.movementX * this.mouseSensitivity;
            this.pitchObject.rotation.x -= event.movementY * this.mouseSensitivity;
            this.pitchObject.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitchObject.rotation.x));
        }
    }
    
    onMouseDown(event) {
        if (event.button === 0) { // Left click
            this.tryHide();
        } else if (event.button === 2) { // Right click
            this.tryClimb();
        }
    }
    
    onMouseUp(event) {
        // Handle mouse up events if needed
    }
    
    update(deltaTime, gameState) {
        if (!this.isAlive) return;
        
        try {
            // Update movement
            this.updateMovement(deltaTime);
            
            // Update stamina
            this.updateStamina(deltaTime);
            
            // Update fear level
            this.updateFear(deltaTime, gameState);
            
            // Update animations
            this.updateAnimations(deltaTime);
            
            // Update network presence
            this.updateNetworkPresence();
            
        } catch (error) {
            console.error('Error updating player:', error);
        }
    }
    
    updateMovement(deltaTime) {
        // Calculate move direction from input
        this.moveDirection.set(0, 0, 0);
        
        if (this.keys.forward) this.moveDirection.z -= 1;
        if (this.keys.backward) this.moveDirection.z += 1;
        if (this.keys.left) this.moveDirection.x -= 1;
        if (this.keys.right) this.moveDirection.x += 1;
        
        this.moveDirection.normalize();
        
        // Apply movement speed
        let speed = this.walkSpeed;
        if (this.keys.run && this.stamina > 0) {
            speed = this.runSpeed;
            this.isRunning = true;
        } else if (this.isCrouching) {
            speed = this.crouchSpeed;
            this.isRunning = false;
        } else {
            this.isRunning = false;
        }
        
        // Transform direction relative to camera
        const rotation = new THREE.Euler(0, this.yawObject.rotation.y, 0, 'YXZ');
        this.moveDirection.applyEuler(rotation);
        
        // Apply movement to velocity
        this.velocity.x = this.moveDirection.x * speed;
        this.velocity.z = this.moveDirection.z * speed;
        
        // Apply gravity
        if (!this.isGrounded) {
            this.velocity.y -= this.gravity * deltaTime;
        }
        
        // Check collisions and update position
        this.checkCollisions();
        
        // Update position
        this.position.add(this.velocity.clone().multiplyScalar(deltaTime));
        
        // Update visual and camera
        this.visual.position.copy(this.position);
        this.yawObject.position.copy(this.position);
        
        // Check if grounded
        this.checkGrounded();
        
        // Play footstep sounds
        if (this.isGrounded && (Math.abs(this.velocity.x) > 0.1 || Math.abs(this.velocity.z) > 0.1)) {
            if (!this.lastStepTime || Date.now() - this.lastStepTime > (this.isRunning ? 300 : 500)) {
                this.playFootstep();
                this.lastStepTime = Date.now();
            }
        }
    }
    
    checkCollisions() {
        for (const obj of this.collisionObjects) {
            if (obj.isGround) continue;
            
            const distance = this.position.distanceTo(obj.position);
            if (distance < obj.radius + 0.5) {
                // Calculate push direction
                const pushDir = this.position.clone().sub(obj.position).normalize();
                const pushDistance = (obj.radius + 0.5) - distance;
                
                // Push player away from object
                this.position.add(pushDir.multiplyScalar(pushDistance));
                
                // Zero out velocity in collision direction
                const dot = this.velocity.dot(pushDir);
                if (dot < 0) {
                    this.velocity.sub(pushDir.multiplyScalar(dot));
                }
            }
        }
    }
    
    checkGrounded() {
        this.groundCheckRay.ray.origin.copy(this.position);
        this.groundCheckRay.ray.direction.set(0, -1, 0);
        
        const intersects = this.groundCheckRay.intersectObjects(
            this.collisionObjects.filter(obj => obj.isGround).map(obj => obj.mesh)
        );
        
        if (intersects.length > 0 && intersects[0].distance <= 2) {
            if (!this.isGrounded) {
                this.playLandSound();
            }
            this.isGrounded = true;
            this.velocity.y = 0;
        } else {
            this.isGrounded = false;
        }
    }
    
    jump() {
        if (this.isGrounded && this.stamina > 20) {
            this.velocity.y = this.jumpForce;
            this.stamina -= 20;
            this.isGrounded = false;
            this.playJumpSound();
        }
    }
    
    toggleCrouch() {
        this.isCrouching = this.keys.crouch;
        
        // Adjust camera height
        const targetY = this.isCrouching ? 1 : 2;
        this.pitchObject.position.y = targetY;
        
        // Adjust collision height if needed
        // ...
    }
    
    tryHide() {
        if (this.isHiding) {
            this.unhide();
            return;
        }
        
        // Check if near a hiding spot
        for (const spot of this.hideSpots) {
            const distance = this.position.distanceTo(spot);
            if (distance < 2) {
                this.hide();
                return;
            }
        }
    }
    
    hide() {
        this.isHiding = true;
        if (this.visual) {
            this.visual.visible = false;
        }
    }
    
    unhide() {
        this.isHiding = false;
        if (this.visual) {
            this.visual.visible = true;
        }
    }
    
    tryClimb() {
        // Implement climbing mechanics
        // ...
    }
    
    interact() {
        // Implement interaction with objects
        // ...
    }
    
    updateStamina(deltaTime) {
        if (this.isRunning && this.stamina > 0) {
            this.stamina = Math.max(0, this.stamina - deltaTime * 20);
        } else if (!this.isRunning && this.stamina < 100) {
            this.stamina = Math.min(100, this.stamina + deltaTime * 10);
        }
    }
    
    updateFear(deltaTime, gameState) {
        if (!gameState) return;
        
        // Increase fear when near the seeker
        if (gameState.phase === 'seeking') {
            let nearestSeekerDistance = Infinity;
            
            // Check distance to AI seeker
            if (gameState.aiSeeker) {
                const distance = this.position.distanceTo(gameState.aiSeeker.position);
                nearestSeekerDistance = Math.min(nearestSeekerDistance, distance);
            }
            
            // Check distance to player seekers
            for (const seekerId of gameState.seekers) {
                const seeker = this.room.presence[seekerId];
                if (seeker && seeker.position) {
                    const distance = this.position.distanceTo(
                        new THREE.Vector3(seeker.position.x, seeker.position.y, seeker.position.z)
                    );
                    nearestSeekerDistance = Math.min(nearestSeekerDistance, distance);
                }
            }
            
            // Update fear based on distance
            if (nearestSeekerDistance < 20) {
                this.fear = Math.min(100, this.fear + deltaTime * (20 - nearestSeekerDistance));
            } else {
                this.fear = Math.max(0, this.fear - deltaTime * 5);
            }
        } else {
            // Gradually reduce fear outside seeking phase
            this.fear = Math.max(0, this.fear - deltaTime * 10);
        }
    }
    
    updateAnimations(deltaTime) {
        // Update any animations (head bob, etc)
        if (this.isGrounded && (Math.abs(this.velocity.x) > 0.1 || Math.abs(this.velocity.z) > 0.1)) {
            const bobSpeed = this.isRunning ? 15 : 10;
            const bobAmount = this.isRunning ? 0.15 : 0.1;
            
            const bobOffset = Math.sin(Date.now() * 0.01 * bobSpeed) * bobAmount;
            this.pitchObject.position.y += bobOffset;
        }
    }
    
    updateNetworkPresence() {
        if (this.room) {
            this.room.updatePresence({
                position: this.position,
                rotation: this.yawObject.rotation,
                isHiding: this.isHiding,
                isRunning: this.isRunning,
                isCrouching: this.isCrouching,
                health: this.health,
                stamina: this.stamina,
                fear: this.fear,
                isAlive: this.isAlive,
                velocity: this.velocity
            });
        }
    }
    
    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        
        if (this.health <= 0) {
            this.die();
        }
    }
    
    die() {
        this.isAlive = false;
        this.velocity.set(0, 0, 0);
        
        if (this.visual) {
            // Play death animation or effect
            this.visual.rotation.x = Math.PI / 2;
            this.visual.position.y = 0.5;
        }
    }
    
    setCollisionObjects(objects) {
        this.collisionObjects = objects;
    }
    
    setHideSpots(spots) {
        this.hideSpots = spots;
    }
    
    getPosition() {
        return this.position.clone();
    }
    
    getRotation() {
        return this.yawObject.rotation.y;
    }
}