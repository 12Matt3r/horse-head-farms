import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { threeToCannon, ShapeType } from 'three-to-cannon'; // Helper for Trimesh

export class Environment {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world; // CANNON.World instance
        this.loader = new GLTFLoader();
        
        this.envMaterial = new CANNON.Material("environmentMaterial");
        // Contact materials involving "environmentMaterial" are now defined in main.js
        // to centralize contact material management.

        this.collisionObjects = []; // This might store CANNON.Body references if needed elsewhere, or become obsolete.
        this.hidingSpots = [];
        this.spawnPoints = [];
        this.dynamicHideZones = []; // For dynamic hiding opportunities
        
        this.setupLighting();
        this.setupFog();
        this.setupSky();
        this.loadEnvironment();
        this.setupAmbientAudio();
    }
    
    setupLighting() {
        try {
            // Moonlight (dim and eerie)
            const moonlight = new THREE.DirectionalLight(0x9999ff, 0.3);
            moonlight.position.set(50, 100, 50);
            moonlight.castShadow = true;
            moonlight.shadow.mapSize.width = 1024; // Reduced for performance
            moonlight.shadow.mapSize.height = 1024;
            moonlight.shadow.camera.near = 0.5;
            moonlight.shadow.camera.far = 200; // Reduced range
            moonlight.shadow.camera.left = -50;
            moonlight.shadow.camera.right = 50;
            moonlight.shadow.camera.top = 50;
            moonlight.shadow.camera.bottom = -50;
            this.scene.add(moonlight);
            
            // Ambient light (very dim)
            const ambientLight = new THREE.AmbientLight(0x404040, 0.15);
            this.scene.add(ambientLight);
            
            // Flickering campfire light
            this.campfireLight = new THREE.PointLight(0xff4400, 1, 20);
            this.campfireLight.position.set(0, 3, 0);
            this.campfireLight.castShadow = true;
            this.campfireLight.shadow.mapSize.width = 512;
            this.campfireLight.shadow.mapSize.height = 512;
            this.scene.add(this.campfireLight);
            
            // Scattered cabin lights
            this.createCabinLights();
        } catch (error) {
            console.error('Error setting up lighting:', error);
            // Fallback lighting
            const basicLight = new THREE.AmbientLight(0x404040, 0.5);
            this.scene.add(basicLight);
        }
    }
    
    createCabinLights() {
        const cabinPositions = [
            new THREE.Vector3(15, 3, 10),
            new THREE.Vector3(-12, 3, 8),
            new THREE.Vector3(8, 3, -15),
            new THREE.Vector3(-10, 3, -12)
        ];
        
        this.cabinLights = [];
        
        for (const position of cabinPositions) {
            // Flickering window light
            const light = new THREE.PointLight(0xffaa00, 0.5, 10);
            light.position.copy(position);
            this.scene.add(light);
            this.cabinLights.push(light);
            
            // Add window glow effect
            const glowGeometry = new THREE.PlaneGeometry(2, 1.5);
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: 0xffaa00,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
            });
            const glow = new THREE.Mesh(glowGeometry, glowMaterial);
            glow.position.copy(position);
            glow.position.y -= 0.5;
            this.scene.add(glow);
        }
    }
    
    setupFog() {
        // Dense, creepy fog
        this.scene.fog = new THREE.FogExp2(0x000011, 0.02);
    }
    
    setupSky() {
        // Dark night sky with stars
        const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
        const skyMaterial = new THREE.MeshBasicMaterial({
            color: 0x000011,
            side: THREE.BackSide
        });
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(sky);
        
        // Add stars
        this.createStars();
        
        // Add moon
        this.createMoon();
    }
    
    createStars() {
        const starGeometry = new THREE.BufferGeometry();
        const starMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 2,
            sizeAttenuation: false
        });
        
        const starVertices = [];
        for (let i = 0; i < 1000; i++) {
            const x = (Math.random() - 0.5) * 1000;
            const y = Math.random() * 200 + 50;
            const z = (Math.random() - 0.5) * 1000;
            starVertices.push(x, y, z);
        }
        
        starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
        const stars = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(stars);
    }
    
    createMoon() {
        const moonGeometry = new THREE.SphereGeometry(20, 32, 32);
        const moonMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffcc,
            transparent: true,
            opacity: 0.8
        });
        const moon = new THREE.Mesh(moonGeometry, moonMaterial);
        moon.position.set(200, 150, 100);
        this.scene.add(moon);
    }
    
    async loadEnvironment() {
        try {
            // Try to load campground model first
            console.log('Loading environment models...');
            const campground = await this.loadModel('./Campground.glb');
            if (campground) {
                console.log('Campground model loaded successfully');
                this.setupCampgroundColliders(campground);
                this.setupCampgroundHidingSpots();
            } else {
                console.log('Campground failed, creating procedural environment');
                this.createProceduralEnvironment();
            }
            
            // Always load nuketown alongside the main environment
            console.log('Loading nuketown as secondary environment...');
            const nuketown = await this.loadModel('./nuketown.glb');
            if (nuketown) {
                console.log('Nuketown model loaded successfully');
                // Position nuketown to the side of the main map
                nuketown.position.set(100, 0, 0);
                nuketown.scale.set(0.5, 0.5, 0.5);
                this.setupNuketownColliders(nuketown);
                this.setupNuketownHidingSpots();
            }
        } catch (error) {
            console.error('Failed to load environment models:', error);
            this.createProceduralEnvironment();
        }
        
        // Always add some basic terrain with proper collision
        this.createTerrain();
        this.createWater();
        this.createVegetation();
        
        console.log('Environment setup complete');
    }
    
    async loadModel(path) {
        return new Promise((resolve, reject) => {
            this.loader.load(
                path,
                (gltf) => {
                    const model = gltf.scene;
                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                            
                            // Make surfaces darker/more ominous
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(mat => {
                                        if (mat.color) mat.color.multiplyScalar(0.3);
                                    });
                                } else {
                                    if (child.material.color) {
                                        child.material.color.multiplyScalar(0.3);
                                    }
                                }
                            }
                        }
                    });
                    
                    this.scene.add(model);
                    resolve(model);
                },
                (progress) => {
                    console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
                },
                (error) => {
                    console.error('Error loading model:', error);
                    resolve(null);
                }
            );
        });
    }
    
    createProceduralEnvironment() {
        // Create basic camp structures
        this.createCabins();
        this.createCampfire();
        this.createTrees();
        this.createRocks();
        this.createPicnicTables();
        this.createBridges();
    }
    
    createCabins() {
        const cabinPositions = [
            new THREE.Vector3(15, 0, 10),
            new THREE.Vector3(-12, 0, 8),
            new THREE.Vector3(8, 0, -15),
            new THREE.Vector3(-10, 0, -12)
        ];
        
        for (const position of cabinPositions) {
            const cabinVisual = this.createCabin(); // This creates the THREE.Group for the cabin
            cabinVisual.position.copy(position);
            this.scene.add(cabinVisual);
            
            // Create CANNON.Body for the cabin
            // Assuming the visual cabin's main structure (walls) is BoxGeometry(8, 4, 6)
            // and its origin is at the base center of the walls.
            const wallHalfExtents = new CANNON.Vec3(8 / 2, 4 / 2, 6 / 2);
            const cabinShape = new CANNON.Box(wallHalfExtents);
            const cabinBody = new CANNON.Body({
                mass: 0, // Static
                material: this.envMaterial,
                shape: cabinShape,
                // Position the physics body. cabinVisual.position is at the base.
                // The CANNON.Box is centered at its position. So, Y should be base + height/2.
                position: new CANNON.Vec3(position.x, position.y + (4/2) , position.z)
            });
            this.world.addBody(cabinBody);
            // this.collisionObjects.push(cabinBody); // Optionally store if needed elsewhere

            // Add hiding spots around cabin
            this.hidingSpots.push(
                position.clone().add(new THREE.Vector3(3, 0, 3)),
                position.clone().add(new THREE.Vector3(-3, 0, 3)),
                position.clone().add(new THREE.Vector3(3, 0, -3)),
                position.clone().add(new THREE.Vector3(-3, 0, -3))
            );
        }
    }
    
    createCabin() {
        const group = new THREE.Group();
        
        // Main structure
        const wallGeometry = new THREE.BoxGeometry(8, 4, 6);
        const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 });
        const walls = new THREE.Mesh(wallGeometry, wallMaterial);
        walls.position.y = 2;
        walls.castShadow = true;
        walls.receiveShadow = true;
        group.add(walls);
        
        // Roof
        const roofGeometry = new THREE.ConeGeometry(6, 2, 4);
        const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x2d1810 });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.y = 5;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        group.add(roof);
        
        // Door
        const doorGeometry = new THREE.BoxGeometry(1.5, 3, 0.2);
        const doorMaterial = new THREE.MeshLambertMaterial({ color: 0x3d2817 });
        const door = new THREE.Mesh(doorGeometry, doorMaterial);
        door.position.set(0, 1.5, 3.1);
        group.add(door);
        
        // Windows
        const windowGeometry = new THREE.BoxGeometry(1.5, 1.5, 0.1);
        const windowMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffaa00, 
            transparent: true, 
            opacity: 0.3 
        });
        
        const window1 = new THREE.Mesh(windowGeometry, windowMaterial);
        window1.position.set(-2, 2, 3.05);
        group.add(window1);
        
        const window2 = new THREE.Mesh(windowGeometry, windowMaterial);
        window2.position.set(2, 2, 3.05);
        group.add(window2);
        
        return group;
    }
    
    createCampfire() {
        const group = new THREE.Group();
        
        // Fire pit
        const pitGeometry = new THREE.CylinderGeometry(2, 2.5, 0.5, 8);
        const pitMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const pit = new THREE.Mesh(pitGeometry, pitMaterial);
        pit.position.y = 0.25;
        pit.receiveShadow = true;
        group.add(pit);
        
        // Logs
        for (let i = 0; i < 6; i++) {
            const logGeometry = new THREE.CylinderGeometry(0.1, 0.15, 2);
            const logMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 });
            const log = new THREE.Mesh(logGeometry, logMaterial);
            
            const angle = (i / 6) * Math.PI * 2;
            log.position.set(
                Math.cos(angle) * 1.5,
                0.6,
                Math.sin(angle) * 1.5
            );
            log.rotation.z = angle + Math.PI / 2;
            log.castShadow = true;
            group.add(log);
        }
        
        // Animated fire effect
        this.createFireEffect(group);
        
        this.scene.add(group);
        
        // Add collision
        this.collisionObjects.push({
            position: new THREE.Vector3(0, 0, 0),
            radius: 2.5,
            type: 'campfire'
        });
    }
    
    createFireEffect(parent) {
        // Create particle system for fire
        const fireGeometry = new THREE.BufferGeometry();
        const firePositions = [];
        const fireColors = [];
        
        for (let i = 0; i < 100; i++) {
            firePositions.push(
                (Math.random() - 0.5) * 2,
                Math.random() * 3 + 1,
                (Math.random() - 0.5) * 2
            );
            
            // Fire colors (red to yellow)
            const intensity = Math.random();
            fireColors.push(1, intensity, 0);
        }
        
        fireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(firePositions, 3));
        fireGeometry.setAttribute('color', new THREE.Float32BufferAttribute(fireColors, 3));
        
        const fireMaterial = new THREE.PointsMaterial({
            size: 0.3,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });
        
        const fire = new THREE.Points(fireGeometry, fireMaterial);
        parent.add(fire);
        
        // Animate fire
        this.animateFire(fire);
    }
    
    animateFire(fire) {
        const animate = () => {
            const positions = fire.geometry.attributes.position.array;
            const colors = fire.geometry.attributes.color.array;
            
            for (let i = 0; i < positions.length; i += 3) {
                // Move particles upward
                positions[i + 1] += 0.02;
                
                // Reset particles that get too high
                if (positions[i + 1] > 4) {
                    positions[i] = (Math.random() - 0.5) * 1.5;
                    positions[i + 1] = 1;
                    positions[i + 2] = (Math.random() - 0.5) * 1.5;
                }
                
                // Flicker colors
                const colorIndex = i;
                colors[colorIndex + 1] = 0.5 + Math.random() * 0.5; // Yellow component
            }
            
            fire.geometry.attributes.position.needsUpdate = true;
            fire.geometry.attributes.color.needsUpdate = true;
            
            requestAnimationFrame(animate);
        };
        animate();
    }
    
    createTrees() {
        for (let i = 0; i < 50; i++) {
            const tree = this.createTree();
            tree.position.set(
                (Math.random() - 0.5) * 100,
                0,
                (Math.random() - 0.5) * 100
            );
            
            // Don't place trees too close to center
            if (treeVisual.position.length() < 20) continue;
            
            treeVisual.rotation.y = Math.random() * Math.PI * 2;
            this.scene.add(treeVisual);
            
            // Create CANNON.Body for the tree trunk
            // Visual trunk is CylinderGeometry(0.3, 0.5, 6)
            const trunkRadiusTop = 0.3;
            const trunkRadiusBottom = 0.5;
            const trunkHeight = 6;
            const trunkSegments = 8; // Default segments for cylinder
            const trunkShape = new CANNON.Cylinder(trunkRadiusTop, trunkRadiusBottom, trunkHeight, trunkSegments);
            
            // The visual trunk mesh is positioned at y=3 within its group.
            // The group (treeVisual) is positioned on the terrain.
            // So, the world position of the trunk's center needs to be calculated.
            const trunkBody = new CANNON.Body({
                mass: 0, // Static
                material: this.envMaterial,
                shape: trunkShape,
                // Position: treeVisual.position is base of tree. Trunk center is treeVisual.position.y + trunkHeight/2.
                position: new CANNON.Vec3(treeVisual.position.x, treeVisual.position.y + trunkHeight / 2, treeVisual.position.z)
            });
            // Cylinder's main axis is Y in Cannon. If THREE.Cylinder is oriented differently, need to adjust quaternion.
            // Assuming THREE.Cylinder is also Y-up by default.
            this.world.addBody(trunkBody);
            // this.collisionObjects.push(trunkBody);

            // Trees are good hiding spots
            this.hidingSpots.push(treeVisual.position.clone());
        }
    }
    
    createTree() {
        const group = new THREE.Group();
        
        // Trunk
        const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 6);
        const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3728 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = 3;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        group.add(trunk);
        
        // Leaves
        const leavesGeometry = new THREE.SphereGeometry(3, 8, 6);
        const leavesMaterial = new THREE.MeshLambertMaterial({ color: 0x1a4a1a });
        const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leaves.position.y = 7;
        leaves.castShadow = true;
        leaves.receiveShadow = true;
        group.add(leaves);
        
        return group;
    }
    
    createRocks() {
        for (let i = 0; i < 30; i++) {
            const rock = this.createRock();
            rock.position.set(
                (Math.random() - 0.5) * 80,
                Math.random() * 0.5,
                (Math.random() - 0.5) * 80
            );
            rock.rotation.set(
                Math.random() * 0.5,
                Math.random() * Math.PI * 2,
                Math.random() * 0.5
            );
            this.scene.add(rock);
            
            // Add collision
            const rockRadius = rockVisual.geometry.parameters.radius || (size / 2); // Approx from Dodecahedron
            const rockShape = new CANNON.Sphere(rockRadius);
            const rockBody = new CANNON.Body({
                mass: 0, // Static
                material: this.envMaterial,
                shape: rockShape,
                position: new CANNON.Vec3(rockVisual.position.x, rockVisual.position.y + rockRadius, rockVisual.position.z) // Assuming visual position is at base
            });
            this.world.addBody(rockBody);
            // this.collisionObjects.push(rockBody);
            
            // Rocks can be hiding spots
            if (Math.random() < 0.3) {
                this.hidingSpots.push(rock.position.clone());
            }
        }
    }
    
    createRock() {
        const size = 0.5 + Math.random() * 1.5;
        const geometry = new THREE.DodecahedronGeometry(size);
        const material = new THREE.MeshLambertMaterial({ color: 0x555555 });
        const rock = new THREE.Mesh(geometry, material);
        rock.castShadow = true;
        rock.receiveShadow = true;
        return rock;
    }
    
    createPicnicTables() {
        const tablePositions = [
            new THREE.Vector3(5, 0, 5),
            new THREE.Vector3(-8, 0, 12),
            new THREE.Vector3(12, 0, -8)
        ];
        
        for (const position of tablePositions) {
            const table = this.createPicnicTable();
            table.position.copy(position);
            table.rotation.y = Math.random() * Math.PI * 2;
            this.scene.add(table);
            
            // Refined collider for the tabletop
            // Visual tabletop: BoxGeometry(4, 0.1, 1.5), its center is at y=1.0 within the 'table' group.
            // The 'table' group itself is placed at 'position' (which has y=0).
            const tabletopHalfExtents = new CANNON.Vec3(4 / 2, 0.1 / 2, 1.5 / 2);
            const tabletopShape = new CANNON.Box(tabletopHalfExtents);

            // The tabletop's visual center is at 'position.y + 1.0'.
            // We need to apply the table group's rotation to the physics body.
            const worldQuaternion = new CANNON.Quaternion();
            worldQuaternion.setFromEuler(0, table.rotation.y, 0); // Assuming table group only rotates on Y

            const tabletopBody = new CANNON.Body({
                mass: 0, // Static
                material: this.envMaterial,
                shape: tabletopShape,
                position: new CANNON.Vec3(position.x, position.y + 1.0, position.z),
                quaternion: worldQuaternion
            });
            this.world.addBody(tabletopBody);

            // Note: Benches could also have separate, thinner colliders if needed for gameplay (e.g., hiding under them).
            // For now, only the tabletop is a primary collider.
            // this.collisionObjects.push(tableBody);
            
            // Under tables are hiding spots
            this.hidingSpots.push(position.clone());
        }
    }
    
    createPicnicTable() {
        const group = new THREE.Group();
        
        // Table top
        const topGeometry = new THREE.BoxGeometry(4, 0.1, 1.5);
        const woodMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
        const top = new THREE.Mesh(topGeometry, woodMaterial);
        top.position.y = 1;
        top.castShadow = true;
        top.receiveShadow = true;
        group.add(top);
        
        // Legs
        const legGeometry = new THREE.BoxGeometry(0.1, 1, 0.1);
        for (let i = 0; i < 4; i++) {
            const leg = new THREE.Mesh(legGeometry, woodMaterial);
            leg.position.set(
                (i % 2) * 3.8 - 1.9,
                0.5,
                Math.floor(i / 2) * 1.2 - 0.6
            );
            leg.castShadow = true;
            group.add(leg);
        }
        
        // Benches
        const benchGeometry = new THREE.BoxGeometry(4, 0.1, 0.4);
        for (let i = 0; i < 2; i++) {
            const bench = new THREE.Mesh(benchGeometry, woodMaterial);
            bench.position.set(0, 0.5, (i * 2 - 1) * 1.2);
            bench.castShadow = true;
            bench.receiveShadow = true;
            group.add(bench);
        }
        
        return group;
    }
    
    createBridges() {
        // Create a few wooden bridges over water areas
        const bridgePositions = [
            { start: new THREE.Vector3(-20, 1, 0), end: new THREE.Vector3(-15, 1, 0) },
            { start: new THREE.Vector3(15, 1, 20), end: new THREE.Vector3(20, 1, 20) }
        ];
        
        for (const bridge of bridgePositions) {
            const bridgeObject = this.createBridge(bridge.start, bridge.end);
            this.scene.add(bridgeObject);
        }
    }
    
    createBridge(start, end) {
        const group = new THREE.Group();
        const length = start.distanceTo(end);
        const center = start.clone().add(end).multiplyScalar(0.5); // Midpoint of the bridge
        const direction = new THREE.Vector3().subVectors(end, start).normalize();
        const angle = Math.atan2(direction.x, direction.z); // Angle for Y rotation

        // Bridge deck visual
        const deckWidth = 2; // Visual width
        const deckThickness = 0.2; // Visual thickness
        const deckGeometry = new THREE.BoxGeometry(length, deckThickness, deckWidth);
        const woodMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
        const deckVisual = new THREE.Mesh(deckGeometry, woodMaterial);
        deckVisual.position.copy(center);
        deckVisual.rotation.y = angle; // Align with start-end direction
        deckVisual.castShadow = true;
        deckVisual.receiveShadow = true;
        group.add(deckVisual);

        // Create CANNON.Body for the bridge deck
        const deckShape = new CANNON.Box(new CANNON.Vec3(length / 2, deckThickness / 2, deckWidth / 2));
        const deckBody = new CANNON.Body({
            mass: 0, // Static
            material: this.envMaterial,
            shape: deckShape,
            position: new CANNON.Vec3(center.x, center.y, center.z),
            quaternion: new CANNON.Quaternion().setFromEuler(0, angle, 0)
        });
        this.world.addBody(deckBody);

        // Railings visuals (physics for these might be overkill unless important for gameplay)
        const railHeight = 1;
        const railThickness = 0.1;
        const railGeometry = new THREE.BoxGeometry(length, railHeight, railThickness);
        const rail1 = new THREE.Mesh(railGeometry, woodMaterial);
        rail1.position.copy(center);
        rail1.position.y += 0.6;
        rail1.position.z += 1;
        group.add(rail1);
        
        const rail2 = new THREE.Mesh(railGeometry, woodMaterial);
        rail2.position.copy(center);
        rail2.position.y += 0.6;
        rail2.position.z -= 1;
        group.add(rail2);
        
        return group;
    }
    
    createTerrain() {
        // Create basic ground plane with proper collision
        const groundGeometry = new THREE.PlaneGeometry(400, 400, 100, 100);
        const groundMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x2d4a2d,
            transparent: true,
            opacity: 0.8
        });
        
        // Add some vertex displacement for terrain variation
        const positions = groundGeometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            const y = Math.random() * 0.5 - 0.25;
            positions.setY(i, y);
        }
        positions.needsUpdate = true;
        groundGeometry.computeVertexNormals();
        
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        // Add ground to collision objects - old way, will be replaced by Cannon body
        // this.collisionObjects.push({
        //     position: new THREE.Vector3(0, 0, 0),
        //     radius: 200,
        //     type: 'ground',
        //     isGround: true
        // });

        // Create CANNON.Body for the terrain
        const terrainSize = 400;
        const heightfieldData = [];
        const numSegments = 100; // Match PlaneGeometry segments

        for (let i = 0; i <= numSegments; i++) {
            heightfieldData.push([]);
            for (let j = 0; j <= numSegments; j++) {
                // Recreate the Y displacement logic from visual terrain
                // This needs to be deterministic or use the actual visual geometry if possible
                // For now, a simple random displacement, but ideally, this matches the visual.
                const x = (j / numSegments - 0.5) * terrainSize;
                const z = (i / numSegments - 0.5) * terrainSize;
                // Use a consistent noise function if possible, instead of Math.random here for reproducibility
                const y = Math.cos(x * 0.1) * Math.sin(z * 0.1) * 2; // Example noise
                heightfieldData[i].push(y);
            }
        }

        const heightfieldShape = new CANNON.Heightfield(heightfieldData, {
            elementSize: terrainSize / numSegments
        });

        const terrainBody = new CANNON.Body({
            mass: 0, // Static
            material: this.envMaterial, // Or a specific ground material
        });
        terrainBody.addShape(heightfieldShape);
        terrainBody.position.set(-terrainSize / 2, 0, -terrainSize / 2); // Adjust position to align heightfield with plane
        // terrainBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Heightfields are typically XZ oriented by default
        this.world.addBody(terrainBody);
        // Note: The main ground plane from main.js might conflict or be redundant.
        // This assumes environment.js is responsible for its own detailed terrain.
    }
    
    createWater() {
        // Create a small lake
        const waterGeometry = new THREE.PlaneGeometry(30, 20);
        const waterMaterial = new THREE.MeshBasicMaterial({
            color: 0x001133,
            transparent: true,
            opacity: 0.7
        });
        
        const water = new THREE.Mesh(waterGeometry, waterMaterial);
        water.rotation.x = -Math.PI / 2;
        water.position.set(-25, 0.1, 15);
        this.scene.add(water);
        
        // Animate water
        this.animateWater(water);
    }
    
    animateWater(water) {
        const animate = () => {
            water.material.opacity = 0.6 + Math.sin(Date.now() * 0.001) * 0.1;
            requestAnimationFrame(animate);
        };
        animate();
    }
    
    createVegetation() {
        // Add some bushes and grass
        for (let i = 0; i < 100; i++) {
            const bush = this.createBush();
            bush.position.set(
                (Math.random() - 0.5) * 90,
                0,
                (Math.random() - 0.5) * 90
            );
            this.scene.add(bush);
            
            // Some bushes are hiding spots
            if (Math.random() < 0.2) {
                // this.hidingSpots.push(bush.position.clone()); // Keep for original logic if needed
                this.dynamicHideZones.push({
                    type: 'sphere',
                    center: bush.position.clone(),
                    radius: bush.geometry.parameters.radius * 1.5, // A bit larger than visual for easier entry
                    stealthBonus: 15
                });
            }
        }
        // Add a couple of predefined box zones for testing
        this.dynamicHideZones.push({
            type: 'box',
            min: new THREE.Vector3(-5, 0, -5),
            max: new THREE.Vector3(-2, 2, -2),
            stealthBonus: 20
        });
        this.dynamicHideZones.push({
            type: 'sphere',
            center: new THREE.Vector3(10, 1, 10),
            radius: 3,
            stealthBonus: 25
        });
    }
    
    createBush() {
        const bushGeometry = new THREE.SphereGeometry(0.5 + Math.random() * 0.5, 6, 4);
        const bushMaterial = new THREE.MeshLambertMaterial({ 
            color: new THREE.Color().setHSL(0.25, 0.8, 0.15 + Math.random() * 0.1)
        });
        const bush = new THREE.Mesh(bushGeometry, bushMaterial);
        bush.position.y = bush.geometry.parameters.radius * 0.5;
        bush.castShadow = true;
        bush.receiveShadow = true;
        return bush;
    }
    
    setupAmbientAudio() {
        // Setup ambient forest sounds
        if (!window.audioContext) {
            window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        this.createAmbientSounds();
        this.playAmbientLoop();
    }
    
    createAmbientSounds() {
        // Wind sound
        const audioContext = window.audioContext;
        const windBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 10, audioContext.sampleRate);
        const windData = windBuffer.getChannelData(0);
        
        for (let i = 0; i < windBuffer.length; i++) {
            windData[i] = (Math.random() * 2 - 1) * 0.1 * Math.sin(i * 0.001);
        }
        
        this.windBuffer = windBuffer;
        
        // Owl sounds
        const owlBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
        const owlData = owlBuffer.getChannelData(0);
        
        for (let i = 0; i < owlBuffer.length; i++) {
            const t = i / audioContext.sampleRate;
            owlData[i] = Math.sin(t * 300 + Math.sin(t * 5) * 20) * Math.exp(-t) * 0.3;
        }
        
        this.owlBuffer = owlBuffer;
    }
    
    playAmbientLoop() {
        // Play wind sound continuously
        if (window.audioContext && this.windBuffer) {
            const playWind = () => {
                const source = window.audioContext.createBufferSource();
                const gainNode = window.audioContext.createGain();
                
                source.buffer = this.windBuffer;
                gainNode.gain.value = 0.05;
                
                source.connect(gainNode);
                gainNode.connect(window.audioContext.destination);
                source.start();
                
                source.onended = () => {
                    setTimeout(playWind, 1000);
                };
            };
            playWind();
        }
        
        // Play owl sounds randomly
        const playOwl = () => {
            if (window.audioContext && this.owlBuffer && Math.random() < 0.3) {
                const source = window.audioContext.createBufferSource();
                const gainNode = window.audioContext.createGain();
                
                source.buffer = this.owlBuffer;
                gainNode.gain.value = 0.1;
                
                source.connect(gainNode);
                gainNode.connect(window.audioContext.destination);
                source.start();
            }
            
            setTimeout(playOwl, 10000 + Math.random() * 20000);
        };
        setTimeout(playOwl, 5000);
    }
    
    update(deltaTime) {
        try {
            // Update flickering lights
            if (this.campfireLight) {
                this.campfireLight.intensity = 0.8 + Math.sin(Date.now() * 0.01) * 0.3;
            }
            
            if (this.cabinLights) {
                for (const light of this.cabinLights) {
                    light.intensity = 0.4 + Math.random() * 0.2;
                }
            }
        } catch (error) {
            console.error('Error updating environment:', error);
        }
    }
    
    setupCampgroundColliders(model) {
        model.traverse((child) => {
            if (child.isMesh) {
                // Example: Only create colliders for meshes explicitly named or tagged for collision,
                // or filter by other properties (e.g., visibility, size).
                // For this example, let's assume any mesh not part of a "detail" group or very small should collide.
                if (child.name.toLowerCase().includes("collision") ||
                    (!child.name.toLowerCase().includes("detail") && child.geometry.boundingSphere && child.geometry.boundingSphere.radius > 0.5)) {

                    const cannonShape = threeToCannon(child, { type: ShapeType.BOX });

                    if (cannonShape) {
                        const body = new CANNON.Body({
                            mass: 0, // Static
                            shape: cannonShape,
                            material: this.envMaterial
                        });

                        // Apply world position and quaternion from the Three.js mesh
                        child.getWorldPosition(body.position);
                        child.getWorldQuaternion(body.quaternion);

                        this.world.addBody(body);
                        // console.log(`Added collider for: ${child.name || 'unnamed_mesh'} at ${body.position.x},${body.position.y},${body.position.z}`);
                    }
                }
            }
        });
        // Old collisionObjects logic is removed.
    }
    
    setupNuketownColliders(model) {
        // Nuketown model might be scaled and positioned. Ensure child transformations are world-relative.
        model.traverse((child) => {
            if (child.isMesh) {
                 // Filter which meshes become colliders. Example:
                if (child.name.toLowerCase().includes("collision") ||
                   (child.geometry && child.geometry.boundingSphere && child.geometry.boundingSphere.radius > 0.2)) { // Nuketown might have smaller relevant parts due to its scale.

                    // Using BOX approximation. For more complex shapes, MESH (Trimesh) could be used but is more costly.
                    const cannonShape = threeToCannon(child, { type: ShapeType.BOX });

                    if (cannonShape) {
                        const body = new CANNON.Body({
                            mass: 0, // Static
                            shape: cannonShape,
                            material: this.envMaterial
                        });

                        // Get world transforms from the Three.js mesh
                        child.getWorldPosition(body.position);
                        child.getWorldQuaternion(body.quaternion);

                        this.world.addBody(body);
                        // console.log(`Added Nuketown collider for: ${child.name || 'unnamed_mesh'} at ${body.position.x},${body.position.y},${body.position.z}`);
                    }
                }
            }
        });
        // Old collisionObjects logic is removed.
    }
    
    setupCampgroundHidingSpots() {
        // Predefined hiding spots for campground
        this.hidingSpots = [
            new THREE.Vector3(10, 0, 15),
            new THREE.Vector3(-12, 0, 8),
            new THREE.Vector3(8, 0, -15),
            new THREE.Vector3(-15, 0, -10),
            new THREE.Vector3(20, 0, 5),
            new THREE.Vector3(-8, 0, 20),
            new THREE.Vector3(15, 0, -20),
            new THREE.Vector3(-20, 0, 15)
        ];
    }
    
    setupNuketownHidingSpots() {
        // Predefined hiding spots for nuketown (offset by nuketown position)
        const nuketownOffset = new THREE.Vector3(100, 0, 0);
        const baseHidingSpots = [
            new THREE.Vector3(15, 0, 15),
            new THREE.Vector3(-15, 0, 15),
            new THREE.Vector3(15, 0, -15),
            new THREE.Vector3(-15, 0, -15),
            new THREE.Vector3(0, 0, 20),
            new THREE.Vector3(0, 0, -20),
            new THREE.Vector3(20, 0, 0),
            new THREE.Vector3(-20, 0, 0)
        ];
        
        for (const spot of baseHidingSpots) {
            this.hidingSpots.push(spot.clone().add(nuketownOffset));
        }
    }
    
    getCollisionObjects() {
        // This method should now return CANNON.Body instances if it's still used.
        // Or, it could be deprecated if AI directly queries the physics world.
        // For now, returning the array which might be populated with Cannon bodies or become empty.
        return this.collisionObjects;
    }
    
    getHidingSpots() {
        return this.hidingSpots;
    }

    getDynamicHideZones() {
        return this.dynamicHideZones;
    }
    
    getRandomSpawnPoint() {
        if (this.spawnPoints.length > 0) {
            return this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
        }
        
        // Fallback random spawn
        return new THREE.Vector3(
            (Math.random() - 0.5) * 30,
            2,
            (Math.random() - 0.5) * 30
        );
    }
}