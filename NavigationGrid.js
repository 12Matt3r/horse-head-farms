import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const DEFAULT_MAX_SLOPE = Math.PI / 3.6; // Approx 50 degrees

export class GridNode {
    constructor(x, y, worldPosition, walkable = true, normal = new THREE.Vector3(0, 1, 0)) {
        this.x = x; // grid x index
        this.y = y; // grid y index (represents Z in world)
        this.worldPosition = worldPosition; // THREE.Vector3, center of the cell on the ground
        this.walkable = walkable;
        this.surfaceNormal = normal; // CANNON.Vec3, normal of the ground surface at this node

        // A* properties
        this.gCost = 0;
        this.hCost = 0;
        this.fCost = 0;
        this.parent = null;
    }
}

export class NavigationGrid {
    constructor(cellSize, widthCells, depthCells, worldMinX, worldMinZ, cannonWorld, maxSlopeAngle = DEFAULT_MAX_SLOPE) {
        this.cellSize = cellSize;
        this.widthCells = widthCells;
        this.depthCells = depthCells;
        this.worldMinX = worldMinX; // World coordinate of the grid's bottom-left X
        this.worldMinZ = worldMinZ; // World coordinate of the grid's bottom-left Z
        this.world = cannonWorld;
        this.maxSlopeAngle = maxSlopeAngle;
        this.grid = []; // 2D array of GridNodes: grid[x][y]

        console.log(`NavGrid: ${widthCells}x${depthCells} cells, cell size ${cellSize}`);
    }

    generateGrid(staticObstacleBodies = []) {
        console.log("NavGrid: Starting grid generation...");
        this.grid = [];
        const raycastHeight = 100; // Start raycasts high above

        for (let gx = 0; gx < this.widthCells; gx++) {
            this.grid[gx] = [];
            for (let gz = 0; gz < this.depthCells; gz++) {
                const worldX = this.worldMinX + gx * this.cellSize + this.cellSize / 2;
                const worldZ = this.worldMinZ + gz * this.cellSize + this.cellSize / 2;

                let worldY = 0; // Default Y if no ground hit (should be marked unwalkable)
                let walkable = false;
                let surfaceNormal = new CANNON.Vec3(0, 1, 0);

                const rayFrom = new CANNON.Vec3(worldX, raycastHeight, worldZ);
                const rayTo = new CANNON.Vec3(worldX, -raycastHeight, worldZ); // Raycast far down

                const result = new CANNON.RaycastResult();
                const raycastOptions = { collisionFilterMask: -1, skipBackfaces: true }; // Collide with all

                this.world.raycastClosest(rayFrom, rayTo, raycastOptions, result);

                if (result.hasHit) {
                    worldY = result.hitPointWorld.y;
                    surfaceNormal.copy(result.hitNormalWorld);
                    const slopeAngle = Math.acos(surfaceNormal.dot(new CANNON.Vec3(0, 1, 0)));
                    if (slopeAngle <= this.maxSlopeAngle) {
                        walkable = true;
                    } else {
                        // console.log(`NavGrid: Cell (${gx},${gz}) unwalkable due to slope ${slopeAngle.toFixed(2)} rad`);
                        walkable = false;
                    }
                } else {
                    // console.log(`NavGrid: Cell (${gx},${gz}) unwalkable, no ground hit.`);
                    walkable = false; // No ground, not walkable
                }

                const worldPos = new THREE.Vector3(worldX, worldY, worldZ);
                this.grid[gx][gz] = new GridNode(gx, gz, worldPos, walkable, surfaceNormal);
            }
        }
        console.log("NavGrid: Initial ground walkability pass complete.");

        // Mark cells occupied by static obstacles as unwalkable
        for (const body of staticObstacleBodies) {
            if (!body.shapes || body.shapes.length === 0) continue;

            // Use AABB of the body for broad check
            const aabb = new CANNON.AABB();
            body.computeAABB(); // Ensure AABB is up to date
            aabb.copy(body.aabb);


            // Convert AABB to grid cell range
            const minGx = Math.max(0, Math.floor((aabb.lowerBound.x - this.worldMinX) / this.cellSize));
            const maxGx = Math.min(this.widthCells - 1, Math.floor((aabb.upperBound.x - this.worldMinX) / this.cellSize));
            const minGz = Math.max(0, Math.floor((aabb.lowerBound.z - this.worldMinZ) / this.cellSize));
            const maxGz = Math.min(this.depthCells - 1, Math.floor((aabb.upperBound.z - this.worldMinZ) / this.cellSize));

            for (let gx = minGx; gx <= maxGx; gx++) {
                for (let gz = minGz; gz <= maxGz; gz++) {
                    const node = this.grid[gx][gz];
                    if (!node || !node.walkable) continue;

                    // More precise check: is node's worldPosition "inside" the body?
                    // This is complex for all shape types. A simpler check is if the node's world Y
                    // is within the vertical span of the obstacle at that XZ, and the obstacle isn't ground itself.
                    // For many game objects, their AABB projection onto the grid is sufficient.
                    // We primarily care if the *base* of the cell is blocked by something substantial.

                    // Simplistic check: if cell center is within AABB xz and node height is within AABB y range.
                    const nodeWorldPos = node.worldPosition;
                    if (nodeWorldPos.x >= aabb.lowerBound.x && nodeWorldPos.x <= aabb.upperBound.x &&
                        nodeWorldPos.z >= aabb.lowerBound.z && nodeWorldPos.z <= aabb.upperBound.z &&
                        nodeWorldPos.y >= aabb.lowerBound.y - 0.1 && nodeWorldPos.y <= aabb.upperBound.y + 0.1) { // Check if node Y is within object's Y range (+- tolerance)

                        // If the body is a Heightfield, don't mark its own cells unwalkable based on this AABB check,
                        // as slope pass already handled it.
                        if (body.type === CANNON.Body.STATIC && !(body.shapes[0] instanceof CANNON.Heightfield)) {
                             // console.log(`NavGrid: Cell (${gx},${gz}) unwalkable due to body ${body.id}`);
                            node.walkable = false;
                        }
                    }
                }
            }
        }
        console.log("NavGrid: Obstacle pass complete.");
    }

    getNode(x, y) {
        if (x >= 0 && x < this.widthCells && y >= 0 && y < this.depthCells) {
            return this.grid[x][y];
        }
        return null;
    }

    worldToGridCoordinates(worldPos) {
        if (!worldPos) return null;
        const gx = Math.floor((worldPos.x - this.worldMinX) / this.cellSize);
        const gz = Math.floor((worldPos.z - this.worldMinZ) / this.cellSize);
        if (gx >= 0 && gx < this.widthCells && gz >= 0 && gz < this.depthCells) {
            return { x: gx, y: gz }; // y in grid coords refers to depth (world Z)
        }
        return null;
    }

    gridToWorldCoordinates(gridX, gridY) {
        const worldX = this.worldMinX + gridX * this.cellSize + this.cellSize / 2;
        const worldZ = this.worldMinZ + gridY * this.cellSize + this.cellSize / 2;
        // Y position would typically be from the node's stored worldPosition.y
        const node = this.getNode(gridX, gridY);
        const worldY = node ? node.worldPosition.y : 0;
        return new THREE.Vector3(worldX, worldY, worldZ);
    }


    getNeighbors(node) {
        const neighbors = [];
        const x = node.x;
        const y = node.y;

        // Cardinal directions
        if (x > 0) neighbors.push(this.getNode(x - 1, y));
        if (x < this.widthCells - 1) neighbors.push(this.getNode(x + 1, y));
        if (y > 0) neighbors.push(this.getNode(x, y - 1));
        if (y < this.depthCells - 1) neighbors.push(this.getNode(x, y + 1));

        // Diagonal directions (optional, depends on desired movement)
        // if (x > 0 && y > 0) neighbors.push(this.getNode(x - 1, y - 1));
        // if (x < this.widthCells - 1 && y > 0) neighbors.push(this.getNode(x + 1, y - 1));
        // if (x > 0 && y < this.depthCells - 1) neighbors.push(this.getNode(x - 1, y + 1));
        // if (x < this.widthCells - 1 && y < this.depthCells - 1) neighbors.push(this.getNode(x + 1, y + 1));

        return neighbors.filter(neighbor => neighbor && neighbor.walkable);
    }

    // Helper to visualize the grid (for debugging)
    visualizeGrid(scene) {
        const materialWalkable = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, opacity: 0.2, transparent: true });
        const materialUnwalkable = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, opacity: 0.2, transparent: true });
        const geometry = new THREE.PlaneGeometry(this.cellSize, this.cellSize);

        for (let gx = 0; gx < this.widthCells; gx++) {
            for (let gz = 0; gz < this.depthCells; gz++) {
                const node = this.grid[gx][gz];
                if (node) {
                    const plane = new THREE.Mesh(geometry, node.walkable ? materialWalkable : materialUnwalkable);
                    plane.position.copy(node.worldPosition);
                    plane.rotation.x = -Math.PI / 2; // Align with XZ plane
                    scene.add(plane);
                }
            }
        }
    }
}
