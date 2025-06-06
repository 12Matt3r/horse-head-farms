import * as THREE from 'three';

export class Player {
    constructor(scene, camera, renderer, room, audioManager) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.room = room;
        this.audioManager = audioManager; // Store AudioManager instance
        
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
        // Player's visual representation is a capsule (body height ~1.5, radius 0.3).
        // this.position is intended to be at the base/center of the player for collision purposes.
        this.playerCollisionRadius = 0.5; // Effective radius for object collision.
        this.playerHeight = 1.8; // Approximate logical height, visual could be different.
        
        // Camera controls
        this.mouseSensitivity = 0.002;
        this.pitchObject = new THREE.Object3D();
        this.yawObject = new THREE.Object3D();
        this.yawObject.add(this.pitchObject);
        this.pitchObject.add(camera);
        
        // Sound effects - will be loaded using AudioManager
        this.footstepBuffer = null;
        this.jumpBuffer = null;
        this.landBuffer = null;
        this.loadSounds(); // Method to load sounds
        
        // Create visual representation
        this.createVisual();
        
        // Setup controls
        this.setupControls();
    }
    
    createVisual() {
        // Player's visual representation is a capsule (body visual radius 0.3, cylinder height 1.5).
        // this.position is the logical reference point for the player, often the center of the base of the collision shape.
        // The visual mesh components are positioned relative to this.position.
        // For example, if this.position is at the player's feet:
        // - The capsule body's center would be at y = capsule_radius + cylinder_half_height.
        // - The head would be on top of that.
        // Current visual setup: body.position.y = 0.75 and head.position.y = 1.6.
        // This implies this.position is NOT at the absolute feet of the player model if the model total height is around 1.8-2.0.
        // It's closer to the center of the capsule's cylindrical part.
        // This detail is important for how checkGrounded's raycast (from this.position) relates to the visual model.
        // For this review, we'll assume this.playerCollisionRadius and the ground check logic correctly use this.position
        // as the reference, and visual offsets are for visual purposes only.
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

    async loadSounds() {
        if (!this.audioManager) return;
        // Paths to actual sound files would be better, but generating for now
        // For footstep, jump, land sounds, it's often better to have short audio files.
        // Here, we'll keep generating them for simplicity in this step,
        // but ideally, these would be loaded via this.audioManager.loadSound('path/to/sound.wav')

        const audioContext = this.audioManager.getAudioContext();
        if (!audioContext) {
            console.warn("Player: AudioContext not available for loading sounds.");
            return;
        }

        // Create Footstep Sound Buffer
        let bufferData = new Float32Array(audioContext.sampleRate * 0.2);
        for (let i = 0; i < bufferData.length; i++) {
            bufferData[i] = (Math.random() * 0.5 - 0.25) * Math.exp(-i / (bufferData.length * 0.2));
        }
        this.footstepBuffer = audioContext.createBuffer(1, bufferData.length, audioContext.sampleRate);
        this.footstepBuffer.copyToChannel(bufferData, 0);

        // Create Jump Sound Buffer
        bufferData = new Float32Array(audioContext.sampleRate * 0.3);
        for (let i = 0; i < bufferData.length; i++) {
            const t = i / audioContext.sampleRate;
            bufferData[i] = Math.sin(t * 250 + Math.sin(t*50)*0.1) * Math.exp(-t * 15) * 0.3;
        }
        this.jumpBuffer = audioContext.createBuffer(1, bufferData.length, audioContext.sampleRate);
        this.jumpBuffer.copyToChannel(bufferData, 0);

        // Create Land Sound Buffer
        bufferData = new Float32Array(audioContext.sampleRate * 0.4);
        for (let i = 0; i < bufferData.length; i++) {
            const t = i / audioContext.sampleRate;
            bufferData[i] = (Math.random() * 0.6 - 0.3) * Math.exp(-t * 10) * 0.4; // More thud-like
        }
        this.landBuffer = audioContext.createBuffer(1, bufferData.length, audioContext.sampleRate);
        this.landBuffer.copyToChannel(bufferData, 0);
    }
    
    playFootstep() {
        if (this.audioManager && this.footstepBuffer) {
            const volume = this.isRunning ? 0.35 : 0.18;
            this.audioManager.playSound(this.footstepBuffer, { volume });
            
            // Broadcast footstep sound to other players
            if (this.room) {
                this.room.send({
                    type: 'footstep',
                    position: this.position,
                    volume: volume
                });
            }
        }
    }
    
    playJumpSound() {
        if (this.audioManager && this.jumpBuffer) {
            this.audioManager.playSound(this.jumpBuffer, { volume: 0.25 });
        }
    }
    
    playLandSound() {
        if (this.audioManager && this.landBuffer) {
            this.audioManager.playSound(this.landBuffer, { volume: 0.3 });
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
        // Iterate through all potential collision objects provided to the player
        for (const obj of this.collisionObjects) {
            // Skip objects marked as 'ground' for this type of collision handling
            // Ground collision is handled by checkGrounded
            if (obj.isGround) continue;

            // Assuming obj has a 'position' (THREE.Vector3) and 'radius' (number)
            if (!obj.position || typeof obj.radius === 'undefined') {
                // console.warn("Player.checkCollisions: Collision object missing position or radius", obj);
                continue;
            }

            // Calculate distance from player's logical center (this.position) to the object's center.
            // this.position is assumed to be the reference point for horizontal collisions.
            const distance = this.position.distanceTo(obj.position);

            // Use the class property for player's effective radius.
            const minDistance = obj.radius + this.playerCollisionRadius;

            if (distance < minDistance) {
                // Collision detected
                const pushDirection = this.position.clone().sub(obj.position).normalize();
                // Ensure pushDirection is not a zero vector (e.g., if positions are identical to an extreme precision)
                if (pushDirection.lengthSq() === 0) {
                    // Avoid division by zero or NaN issues if positions are exactly the same.
                    // Push in a random horizontal direction as a fallback.
                    pushDirection.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                }
                const overlap = minDistance - distance;

                // Push player away from object by the overlap amount.
                // This is a simple spring-like response. More advanced physics would handle this differently.
                this.position.add(pushDirection.multiplyScalar(overlap));

                // Dampen velocity component that is pushing into the object.
                // This helps prevent jittering and allows sliding along surfaces.
                const velocityComponentAlongPushDir = this.velocity.dot(pushDirection);
                if (velocityComponentAlongPushDir < 0) { // If velocity is directed into the object
                    this.velocity.sub(pushDirection.multiplyScalar(velocityComponentAlongPushDir));
                }
            }
        }
    }
    
    checkGrounded() {
        // Set raycaster origin. If this.position is at the base of the player (feet level),
        // a small upward offset for the ray origin prevents it starting inside the ground geometry.
        const rayOrigin = this.position.clone();
        rayOrigin.y += 0.1; // Small offset upwards from player's logical base position.

        this.groundCheckRay.ray.origin.copy(rayOrigin);
        this.groundCheckRay.ray.direction.set(0, -1, 0); // Cast downwards.

        // Filter for ground objects that have a mesh to intersect with.
        const groundMeshes = this.collisionObjects
            .filter(obj => obj && obj.isGround && obj.mesh) // Added obj null check for safety.
            .map(obj => obj.mesh);

        if (groundMeshes.length === 0) {
            this.isGrounded = false; // No ground meshes to check against.
            return;
        }
        
        const intersects = this.groundCheckRay.intersectObjects(groundMeshes, false); // Non-recursive check.

        // Define how far down to check for ground from the rayOrigin.
        // If player's feet are at this.position.y, and rayOrigin is at this.position.y + 0.1,
        // then an intersection distance of 0.1 means the feet are exactly on the ground.
        // A threshold slightly larger than this (e.g., 0.2) allows for small slopes or imperfections
        // without the player toggling between grounded and not_grounded state rapidly.
        const groundDetectionThreshold = 0.2; // (rayOrigin offset + minor penetration/slope allowance).

        if (intersects.length > 0 && intersects[0].distance <= groundDetectionThreshold) {
            if (!this.isGrounded) {
                // Player just landed.
                this.playLandSound();
                // Could also reset jump counts or trigger landing animations here.
            }
            this.isGrounded = true;
            this.velocity.y = 0; // Stop downward movement when grounded.

            // Optional: Snap player's base to the exact ground surface point.
            // This can provide a more 'stuck to ground' feel but might be jittery on complex surfaces
            // or if groundDetectionThreshold is too large. Use with caution.
            // Example: this.position.y = rayOrigin.y - intersects[0].distance;
            // (This assumes this.position.y is the very bottom of the player model).

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
            if (gameState.aiSeeker && gameState.aiSeeker.position) { // Added null check for aiSeeker and position
                const distance = this.position.distanceTo(gameState.aiSeeker.position);
                nearestSeekerDistance = Math.min(nearestSeekerDistance, distance);
            }
            
            // Check distance to player seekers
            if (gameState.seekers && Array.isArray(gameState.seekers)) { // Added check for seekers array
                for (const seekerId of gameState.seekers) {
                    const seeker = this.room && this.room.presence ? this.room.presence[seekerId] : undefined; // Added check for room and presence
                    if (seeker && seeker.position) {
                        // Ensure seeker.position has x, y, z before creating Vector3
                        if (typeof seeker.position.x === 'number' &&
                            typeof seeker.position.y === 'number' &&
                            typeof seeker.position.z === 'number') {
                            const seekerPosition = new THREE.Vector3(seeker.position.x, seeker.position.y, seeker.position.z);
                            const distance = this.position.distanceTo(seekerPosition);
                            nearestSeekerDistance = Math.min(nearestSeekerDistance, distance);
                        } else {
                            // console.warn('Player.updateFear: Seeker position is invalid', seekerId, seeker.position);
                        }
                    }
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