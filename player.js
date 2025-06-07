import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Player {
    constructor(scene, camera, renderer, room, audioManager, world) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.room = room;
        this.audioManager = audioManager; // Store AudioManager instance
        this.world = world; // Cannon.js world

        // this.position = new THREE.Vector3(0, 2, 0); // Replaced by Cannon body
        // this.velocity = new THREE.Vector3(); // Replaced by Cannon body
        this.rotation = new THREE.Euler(); // Used for movement direction calculation
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
        this.walkSpeed = 5; // Target speed
        this.runSpeed = 8;  // Target speed
        this.crouchSpeed = 2; // Target speed
        this.jumpForce = 350; // Adjusted for impulse
        // this.gravity = 20; // Handled by Cannon.js world gravity

        // Collision detection related
        // this.collisionObjects = []; // Will store Cannon.Body instances if needed for specific logic, world handles general collisions.
        this.hideSpots = [];
        // this.raycaster = new THREE.Raycaster(); // Replaced by Cannon raycasting
        // this.groundCheckRay = new THREE.Raycaster(); // Replaced by Cannon raycasting
        this.isGrounded = false;
        this.groundNormal = new CANNON.Vec3(0, 1, 0); // Assuming initially flat ground, or will be updated by checkGrounded
        this.maxWalkableSlopeAngle = Math.PI / 3.6; // Approx 50 degrees, (Math.PI / 4 is 45 deg)

        this.playerCollisionRadius = 0.4; // Radius of the physics body
        this.playerHeight = 1.8; // Approximate visual height
        // this.playerMass = 60; // Mass is set in createPhysicsBody

        // Physics body
        this.body = null;
        this.playerMaterial = null;
        this.bodyShapeType = 'Sphere'; // Default, will be updated in createPhysicsBody
        this.capsuleCylinderHeight = 0; // For capsule shape calculations
        this.lastYaw = 0; // For camera sway calculation

        // Camera controls
        this.mouseSensitivity = 0.002;
        this.pitchObject = new THREE.Object3D(); // Rotates around X for looking up/down
        this.yawObject = new THREE.Object3D();   // Rotates around Y for turning left/right
        this.yawObject.add(this.pitchObject);
        this.pitchObject.add(this.camera);
        this.scene.add(this.yawObject); // Add yawObject to scene so it can have a world position that follows the physics body.
        
        // Sound effects - will be loaded using AudioManager
        this.footstepBuffer = null;
        this.jumpBuffer = null;
        this.landBuffer = null;
        this.loadSounds(); // Method to load sounds
        
        // Create physics body
        this.createPhysicsBody(); // New method to encapsulate physics body creation

        // Create visual representation
        this.createVisual();
        
        // Setup controls
        this.setupControls();
    }

    createPhysicsBody() {
        this.playerMaterial = new CANNON.Material("playerMaterial"); // Changed material name

        const radius = this.playerCollisionRadius;
        const cylinderHeight = this.playerHeight - (2 * radius);

        let playerShape;
        if (cylinderHeight <= 0) {
            console.warn("Player capsuleCylinderHeight is zero or negative. Check playerHeight and playerCollisionRadius. Defaulting to sphere.");
            playerShape = new CANNON.Sphere(radius);
            this.bodyShapeType = 'Sphere';
            this.capsuleCylinderHeight = 0;
        } else {
            playerShape = new CANNON.Capsule(radius, cylinderHeight);
            this.bodyShapeType = 'Capsule';
            this.capsuleCylinderHeight = cylinderHeight;
        }

        this.body = new CANNON.Body({
            mass: 70, // Adjusted mass
            material: this.playerMaterial,
            shape: playerShape,
            position: new CANNON.Vec3(0, 5, 0)
        });

        this.body.linearDamping = 0.8; // Adjusted damping
        this.body.fixedRotation = true;
        this.body.allowSleep = false; // Ensure player body is always active

        this.world.addBody(this.body);
    }
    
    createVisual() {
        // Visual representation is a capsule. The physics body (Sphere) is centered at this.body.position.
        // The this.visual (THREE.Group) will have its position updated to match this.body.position.
        // All visual components are positioned relative to this.visual group.
        const group = new THREE.Group();
        
        // Visual Player Body (Capsule)
        // Visual radius 0.3, cylinder part height 1.0. Total visual height (1.0 + 2 * 0.3) = 1.6
        // Physics sphere (radius 0.4) is centered at this.body.position.
        // The visual capsule should also appear centered around this.body.position.
        const visualCapsuleRadius = 0.3;
        const visualCapsuleCylinderHeight = 1.0;
        const bodyGeom = new THREE.CapsuleGeometry(visualCapsuleRadius, visualCapsuleCylinderHeight, 4, 8);
        const bodyMat = new THREE.MeshLambertMaterial({
            color: 0x00ee00, // Brighter green
            transparent: true,
            opacity: 0.6 // Slightly more transparent
        });
        const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
        // The CapsuleGeometry is centered by default. So, its center aligns with the group's origin (which will be body.position).
        bodyMesh.position.y = 0;
        bodyMesh.castShadow = true;
        group.add(bodyMesh);

        // Visual Player Head (Sphere)
        const headGeom = new THREE.SphereGeometry(0.25, 8, 8); // Head radius 0.25
        const headMat = new THREE.MeshLambertMaterial({ color: 0xffddcc, opacity: 0.6, transparent: true });
        const headMesh = new THREE.Mesh(headGeom, headMat);
        // Position head on top of the visual capsule body.
        // Top of capsule's cylinder part is at y = visualCapsuleCylinderHeight / 2.
        // Top of capsule's upper sphere is at y = (visualCapsuleCylinderHeight / 2) + visualCapsuleRadius.
        // Center of head (radius 0.25) should be above that.
        headMesh.position.y = (visualCapsuleCylinderHeight / 2) + visualCapsuleRadius + (0.25 / 2);
        headMesh.castShadow = true;
        group.add(headMesh);
        
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
            if (document.pointerLockElement !== this.renderer.domElement) {
                 this.renderer.domElement.requestPointerLock();
            }
        });

        // Handle pointer lock change - this.controls is not used in this class for now
        // document.addEventListener('pointerlockchange', () => {
        //     if (document.pointerLockElement === this.renderer.domElement) {
        //         // e.g., this.controls.enabled = true; if using a PointerLockControls instance
        //     } else {
        //         // e.g., this.controls.enabled = false;
        //     }
        // });
    }

    async loadSounds() {
        if (!this.audioManager) return;
        const audioContext = this.audioManager.getAudioContext();
        if (!audioContext) {
            console.warn("Player: AudioContext not available for loading sounds.");
            return;
        }

        try {
            // Using generated sounds for now, ideally load from files:
            // this.footstepBuffer = await this.audioManager.loadSound('sounds/footstep.wav');
            // this.jumpBuffer = await this.audioManager.loadSound('sounds/jump.wav');
            // this.landBuffer = await this.audioManager.loadSound('sounds/land.wav');

            let bufferData = new Float32Array(audioContext.sampleRate * 0.2);
            for (let i = 0; i < bufferData.length; i++) {
                bufferData[i] = (Math.random() * 0.5 - 0.25) * Math.exp(-i / (bufferData.length * 0.2));
            }
            this.footstepBuffer = audioContext.createBuffer(1, bufferData.length, audioContext.sampleRate);
            this.footstepBuffer.copyToChannel(bufferData, 0);

            bufferData = new Float32Array(audioContext.sampleRate * 0.3);
            for (let i = 0; i < bufferData.length; i++) {
                const t = i / audioContext.sampleRate;
                bufferData[i] = Math.sin(t * 250 + Math.sin(t*50)*0.1) * Math.exp(-t * 15) * 0.3;
            }
            this.jumpBuffer = audioContext.createBuffer(1, bufferData.length, audioContext.sampleRate);
            this.jumpBuffer.copyToChannel(bufferData, 0);

            bufferData = new Float32Array(audioContext.sampleRate * 0.4);
            for (let i = 0; i < bufferData.length; i++) {
                const t = i / audioContext.sampleRate;
                bufferData[i] = (Math.random() * 0.6 - 0.3) * Math.exp(-t * 10) * 0.4; // More thud-like
            }
            this.landBuffer = audioContext.createBuffer(1, bufferData.length, audioContext.sampleRate);
            this.landBuffer.copyToChannel(bufferData, 0);

        } catch (error) {
            console.error("Error loading player sounds:", error);
        }
    }
    
    playFootstep() {
        if (this.audioManager && this.footstepBuffer && this.body) {
            const volume = this.isRunning ? 0.35 : 0.18;
            this.audioManager.playSound(this.footstepBuffer, { volume });
            
            // Broadcast footstep sound to other players
            if (this.room) {
                this.room.send({
                    type: 'footstep',
                    position: {x: this.body.position.x, y: this.body.position.y, z: this.body.position.z }, // Send CANNON body position
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
        if (!this.isAlive || !this.body) return; // Ensure physics body exists
        
        try {
            // Process inputs and update physics body's velocity
            this.updateMovement(deltaTime);
            
            // Check if player is grounded using Cannon.js raycast
            this.checkGrounded();
            
            // Synchronize the Three.js visual model (this.visual) with the Cannon.js physics body (this.body)
            // This should happen AFTER the physics world has been stepped in the main game loop.
            this.visual.position.copy(this.body.position);
            // this.visual.quaternion.copy(this.body.quaternion); // Only needed if fixedRotation = false

            // The this.yawObject (which holds the camera) needs to follow the player's body position.
            // The actual rotation of yawObject (left/right) and pitchObject (up/down) is handled by mouse input.
            this.yawObject.position.copy(this.body.position);
            // Adjust camera height based on player state (e.g. crouching) or offset from body center.
            // Base y-position for pitchObject is set in updateAnimations or toggleCrouch.
            
            // Update other player logic
            this.updateStamina(deltaTime);
            this.updateFear(deltaTime, gameState); // Uses this.body.position via getPosition()
            this.updateAnimations(deltaTime);      // Head bob, uses this.body.velocity
            this.updateNetworkPresence();          // Uses this.body.position
            
        } catch (error) {
            console.error('Error updating player:', error);
        }
    }
    
    updateMovement(deltaTime) {
        if (!this.body) return;

        this.moveDirection.set(0, 0, 0); // Reset move direction
        if (this.keys.forward) this.moveDirection.z -= 1;
        if (this.keys.backward) this.moveDirection.z += 1;
        if (this.keys.left) this.moveDirection.x -= 1;
        if (this.keys.right) this.moveDirection.x += 1;
        this.moveDirection.normalize(); // Ensure consistent speed, especially for diagonal movement

        let currentSpeed = this.walkSpeed;
        this.isRunning = this.keys.run && this.stamina > 0 && !this.isCrouching;

        if (this.isRunning) {
            currentSpeed = this.runSpeed;
        } else if (this.isCrouching) {
            currentSpeed = this.crouchSpeed;
        }

        // Transform moveDirection relative to the camera's current yaw (horizontal rotation)
        const euler = new THREE.Euler(0, this.yawObject.rotation.y, 0, 'YXZ');
        const worldMoveDirection = this.moveDirection.clone().applyEuler(euler);

        // Calculate the desired velocity in the X and Z axes
        const targetVelocityX = worldMoveDirection.x * currentSpeed;
        const targetVelocityZ = worldMoveDirection.z * currentSpeed;

        // Apply this velocity to the physics body.
        // Y-axis velocity is managed by gravity and jump impulses.
        // Using direct velocity assignment for responsiveness. Linear damping will handle slowdown.
        this.body.velocity.x = targetVelocityX;
        this.body.velocity.z = targetVelocityZ;

        // Footstep sounds based on horizontal velocity
        const horizontalVelocityMagnitude = Math.sqrt(this.body.velocity.x ** 2 + this.body.velocity.z ** 2);
        if (this.isGrounded && horizontalVelocityMagnitude > 0.1) {
            if (!this.lastStepTime || Date.now() - this.lastStepTime > (this.isRunning ? 300 : 500)) {
                this.playFootstep();
                this.lastStepTime = Date.now();
            }
        }
    }
    
    // checkCollisions() is removed as Cannon.js handles general collisions.
    
    checkGrounded() {
        if (!this.world || !this.body) {
            this.isGrounded = false;
            return;
        }

        const rayFrom = new CANNON.Vec3(this.body.position.x, this.body.position.y, this.body.position.z);

        let rayToDistance;
        if (this.bodyShapeType === 'Capsule') {
            // From capsule center, ray goes down by half cylinder height + radius + epsilon
            rayToDistance = (this.capsuleCylinderHeight / 2) + this.playerCollisionRadius + 0.15;
        } else { // Sphere
            rayToDistance = this.playerCollisionRadius + 0.15;
        }
        const rayTo = new CANNON.Vec3(this.body.position.x, this.body.position.y - rayToDistance, this.body.position.z);
        
        const result = new CANNON.RaycastResult();
        // No specific collisionFilterGroup/Mask for now, assuming all world objects are potential ground.
        this.world.raycastClosest(rayFrom, rayTo, {}, result);

        const previouslyGrounded = this.isGrounded;
        this.isGrounded = result.hasHit;

        if (this.isGrounded) {
            this.groundNormal.copy(result.hitNormalWorld);
            if (!previouslyGrounded) {
                this.playLandSound();
            }
        } else {
            this.groundNormal.set(0, 1, 0); // Reset to flat if not grounded
        }

        // If grounded and Y velocity is very small (e.g. due to solver jitter), clamp it to 0.
        // This helps stabilize the player on the ground.
        if (this.isGrounded && Math.abs(this.body.velocity.y) < 0.1) {
             this.body.velocity.y = 0;
        }
    }
    
    jump() {
        if (this.isGrounded && this.stamina > 20 && this.body) {
            // Apply an impulse directly upwards. this.jumpForce is now an impulse magnitude.
            const impulse = new CANNON.Vec3(0, this.jumpForce, 0);
            // Apply impulse at the body's center of mass (which is its position for a simple shape).
            this.body.applyImpulse(impulse, this.body.position);

            this.stamina -= 20;
            this.isGrounded = false; // Set immediately; checkGrounded will confirm based on physics state.
            this.playJumpSound();
        }
    }
    
    toggleCrouch() {
        this.isCrouching = this.keys.crouch; // This should be toggled in onKeyDown: this.keys.crouch = !this.keys.crouch;

        // Adjust camera height (Y position of the pitchObject, relative to the yawObject/body center).
        // this.body.position is the center of the capsule or sphere.
        let normalCamRelativeY;
        if (this.bodyShapeType === 'Capsule') {
            // Position camera near the top of the capsule.
            // Capsule center is origin. Top sphere center is at +cylinderHeight/2. Camera slightly below that.
            normalCamRelativeY = (this.capsuleCylinderHeight / 2) + (this.playerCollisionRadius * 0.4);
        } else { // Sphere
            normalCamRelativeY = this.playerCollisionRadius * 0.5; // Slightly above sphere center
        }
        const crouchCamRelativeY = normalCamRelativeY * 0.5; // Crouching reduces height by half

        this.targetPitchObjectY = this.isCrouching ? crouchCamRelativeY : normalCamRelativeY;
        // Directly set pitchObject's Y for now. updateAnimations will use this as a base.
        this.pitchObject.position.y = this.targetPitchObjectY;
        
        // TODO: Implement physics body shape change for crouching.
        // This is more complex: involves changing CANNON.Shape, possibly re-adding the body.
        // For now, only the camera height and speed are affected.
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
        if (!gameState || !this.body) return; // Ensure body exists
        
        const currentPosition = this.getPosition(); // Uses this.body.position

        if (gameState.phase === 'seeking') {
            let nearestSeekerDistance = Infinity;

            // Check distance to AI seeker
            if (gameState.aiSeeker && gameState.aiSeeker.position) {
                const distance = currentPosition.distanceTo(gameState.aiSeeker.position);
                nearestSeekerDistance = Math.min(nearestSeekerDistance, distance);
            }
            
            // Check distance to player seekers
            if (gameState.seekers && Array.isArray(gameState.seekers)) {
                for (const seekerId of gameState.seekers) {
                    const seeker = this.room && this.room.presence ? this.room.presence[seekerId] : undefined;
                    if (seeker && seeker.position) {
                        if (typeof seeker.position.x === 'number' &&
                            typeof seeker.position.y === 'number' &&
                            typeof seeker.position.z === 'number') {
                            const seekerPosition = new THREE.Vector3(seeker.position.x, seeker.position.y, seeker.position.z);
                            const distance = currentPosition.distanceTo(seekerPosition);
                            nearestSeekerDistance = Math.min(nearestSeekerDistance, distance);
                        }
                    }
                }
            }
            
            if (nearestSeekerDistance < 20) {
                this.fear = Math.min(100, this.fear + deltaTime * (20 - nearestSeekerDistance));
            } else {
                this.fear = Math.max(0, this.fear - deltaTime * 5);
            }
        } else {
            this.fear = Math.max(0, this.fear - deltaTime * 10);
        }
    }
    
    updateAnimations(deltaTime) {
        if (!this.body) return; // Ensure physics body exists

        // Calculate horizontal speed from the physics body's velocity
        const horizontalSpeed = Math.sqrt(this.body.velocity.x ** 2 + this.body.velocity.z ** 2);

        // Determine the base Y position for the camera (pitchObject) based on crouching state.
        // this.targetPitchObjectY is set by toggleCrouch() or initialized if undefined.
        if (this.targetPitchObjectY === undefined) { // Initialize if not set by toggleCrouch yet
            if (this.bodyShapeType === 'Capsule') {
                this.targetPitchObjectY = (this.capsuleCylinderHeight / 2) + (this.playerCollisionRadius * 0.4);
            } else {
                this.targetPitchObjectY = this.playerCollisionRadius * 0.5;
            }
        }
        const baseCamY = this.targetPitchObjectY;

        if (this.isGrounded && horizontalSpeed > 0.1) {
            const bobSpeed = this.isRunning ? 14 : 10;
            const bobAmount = this.isRunning ? 0.04 : 0.025;
            
            const bobOffset = Math.sin(Date.now() * 0.001 * bobSpeed * Math.PI * 2) * bobAmount;
            this.pitchObject.position.y = baseCamY + bobOffset;
        } else {
            this.pitchObject.position.y = baseCamY; // Set to base when not moving/grounded
        }

        // TODO: Implement camera sway based on horizontal velocity changes or turning.

        // Camera Sway based on horizontal velocity (strafe) and turning
        let currentYaw = this.yawObject.rotation.y;
        const deltaYaw = currentYaw - this.lastYaw;
        this.lastYaw = currentYaw;

        // Sway from strafing (roll)
        const targetRoll = -this.body.velocity.x * 0.005; // Velocity.x is local to world, not player. Needs to be relative to player's view.
        // To make it relative to player view, we need to project velocity onto player's right vector.
        const rightVector = new THREE.Vector3(1,0,0).applyQuaternion(this.yawObject.quaternion);
        const localVelocityX = new THREE.Vector3(this.body.velocity.x, 0, this.body.velocity.z).dot(rightVector);
        const strafeRoll = -localVelocityX * 0.01; // Adjust multiplier for sensitivity

        // Sway from turning (roll or slight positional offset)
        const turnRoll = deltaYaw * -0.5; // Adjust multiplier for sensitivity

        const totalTargetRoll = strafeRoll + turnRoll;
        this.camera.rotation.z = THREE.MathUtils.lerp(this.camera.rotation.z, totalTargetRoll, 0.15);

    }
    
    updateNetworkPresence() {
        if (this.room && this.body) {
            this.room.updatePresence({
                position: { x: this.body.position.x, y: this.body.position.y, z: this.body.position.z },
                rotation: { y: this.yawObject.rotation.y }, // Send Euler Y rotation for yaw
                // Optionally send velocity if server-side validation or other clients need it.
                // velocity: { x: this.body.velocity.x, y: this.body.velocity.y, z: this.body.velocity.z },
                isHiding: this.isHiding,
                isRunning: this.isRunning,
                isCrouching: this.isCrouching,
                health: this.health,
                stamina: this.stamina,
                fear: this.fear,
                isAlive: this.isAlive,
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
        if (this.body) {
            this.body.velocity.set(0, 0, 0); // Stop movement
            // Optionally, make the body static or change its collision properties
            // this.body.type = CANNON.Body.STATIC;
            // Or remove it if it shouldn't interact anymore:
            // this.world.removeBody(this.body);
        }
        
        if (this.visual && this.body) { // Ensure body exists for position reference
            // Simple death effect: make visual fall over (kinematically placed)
            this.visual.rotation.x = Math.PI / 2;
            // Adjust y so it appears on the ground, relative to where the physics body was.
            // If body.position was center of sphere (radius), then visual base is y - radius.
            this.visual.position.y = this.body.position.y - this.playerCollisionRadius;
        }
    }
    
    setCollisionObjects(objects) {
        // This method is largely superseded by adding static collision bodies to the CANNON.World.
        // If used, it would likely be for specific dynamic objects the player needs to know about explicitly,
        // beyond general world collision.
        // this.collisionObjects = objects; // Assuming objects are CANNON.Body instances.
        console.warn("Player.setCollisionObjects may need review with Cannon.js integration.");
    }
    
    setHideSpots(spots) {
        this.hideSpots = spots; // hideSpots are likely Vector3 positions, no change needed here.
    }
    
    getPosition() {
        if (this.body) {
            // Return a THREE.Vector3 for consistency with other game parts if they expect it.
            return new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z);
        }
        return new THREE.Vector3(0,0,0); // Fallback if body doesn't exist
    }
    
    getRotation() { // This refers to the Y-axis rotation (yaw) of the player's view.
        return this.yawObject.rotation.y;
    }
}