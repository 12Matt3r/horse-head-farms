export class NetworkManager {
    constructor() {
        this.room = null;
        this.clientId = null;
        this.isConnected = false;
        this.peers = {};
        
        this.eventCallbacks = {
            connected: [],
            disconnected: [],
            message: [],
            presenceUpdate: [],
            roomStateUpdate: []
        };
        
        this.messageQueue = [];
        this.isInitialized = false;
    }
    
    async initialize() {
        try {
            this.room = new WebsimSocket();
            await this.room.initialize();
            
            this.clientId = this.room.clientId;
            this.isConnected = true;
            this.isInitialized = true;
            
            this.setupEventHandlers();
            
            console.log('Network initialized successfully, client ID:', this.clientId);
            
            // Process any queued messages
            this.processMessageQueue();
            
            return true;
        } catch (error) {
            console.error('Failed to initialize network:', error);
            this.isConnected = false;
            this.isInitialized = false;
            return false;
        }
    }
    
    setupEventHandlers() {
        // Handle incoming messages
        this.room.onmessage = (event) => {
            const data = event.data;
            
            switch (data.type) {
                case 'connected':
                    this.handlePlayerConnected(data);
                    break;
                case 'disconnected':
                    this.handlePlayerDisconnected(data);
                    break;
                default:
                    this.triggerCallback('message', data);
                    break;
            }
        };
        
        // Handle presence updates
        this.room.subscribePresence((presence) => {
            this.triggerCallback('presenceUpdate', presence);
        });
        
        // Handle room state updates
        this.room.subscribeRoomState((roomState) => {
            this.triggerCallback('roomStateUpdate', roomState);
        });
        
        // Handle presence update requests
        this.room.subscribePresenceUpdateRequests((updateRequest, fromClientId) => {
            this.handlePresenceUpdateRequest(updateRequest, fromClientId);
        });
    }
    
    handlePlayerConnected(data) {
        console.log(`Player connected: ${data.username} (${data.clientId})`);
        this.triggerCallback('connected', data);
    }
    
    handlePlayerDisconnected(data) {
        console.log(`Player disconnected: ${data.username} (${data.clientId})`);
        this.triggerCallback('disconnected', data);
    }
    
    handlePresenceUpdateRequest(updateRequest, fromClientId) {
        // Handle requests from other players to update our presence
        // This is used for things like damage, catching players, etc.
        
        const currentPresence = this.room.presence[this.clientId] || {};
        
        switch (updateRequest.type) {
            case 'damage':
                this.applyDamage(updateRequest.amount, fromClientId);
                break;
            case 'catch':
                this.handleBeingCaught(fromClientId);
                break;
            case 'spawn':
                this.handleSpawnRequest(updateRequest, fromClientId);
                break;
            case 'roleAssignment':
                this.handleRoleAssignment(updateRequest, fromClientId);
                break;
            default:
                console.log('Unknown presence update request:', updateRequest);
                break;
        }
    }
    
    applyDamage(amount, fromClientId) {
        const currentPresence = this.room.presence[this.clientId] || {};
        const currentHealth = currentPresence.health || 100;
        const newHealth = Math.max(0, currentHealth - amount);
        
        this.updatePresence({
            health: newHealth,
            lastDamagedBy: fromClientId,
            lastDamageTime: Date.now()
        });
        
        if (newHealth <= 0) {
            this.updatePresence({
                isAlive: false,
                deathTime: Date.now()
            });
        }
    }
    
    handleBeingCaught(fromClientId) {
        const currentPresence = this.room.presence[this.clientId] || {};
        
        if (currentPresence.role === 'hider' && currentPresence.isAlive) {
            this.updatePresence({
                isAlive: false,
                caughtBy: fromClientId,
                caughtTime: Date.now(),
                role: 'spectator'
            });
            
            // Broadcast catch event
            this.sendMessage({
                type: 'playerCaught',
                caughtPlayer: this.clientId,
                caughtBy: fromClientId,
                position: currentPresence.position
            });
        }
    }
    
    handleSpawnRequest(updateRequest, fromClientId) {
        if (updateRequest.position) {
            this.updatePresence({
                position: updateRequest.position,
                spawnTime: Date.now(),
                isAlive: true
            });
        }
    }
    
    handleRoleAssignment(updateRequest, fromClientId) {
        if (updateRequest.role) {
            this.updatePresence({
                role: updateRequest.role,
                roleAssignedBy: fromClientId,
                roleAssignedTime: Date.now()
            });
        }
    }
    
    updatePresence(presenceData) {
        if (!this.isInitialized) {
            console.warn('Network not initialized, queueing presence update');
            return;
        }
        
        try {
            // Validate presence data
            if (!presenceData || typeof presenceData !== 'object') {
                console.warn('Invalid presence data:', presenceData);
                return;
            }
            
            this.room.updatePresence(presenceData);
        } catch (error) {
            console.error('Failed to update presence:', error);
        }
    }
    
    updateRoomState(roomStateData) {
        if (!this.isInitialized) {
            console.warn('Network not initialized, cannot update room state');
            return;
        }
        
        try {
            this.room.updateRoomState(roomStateData);
        } catch (error) {
            console.error('Failed to update room state:', error);
        }
    }
    
    sendMessage(messageData) {
        if (!this.isInitialized) {
            this.messageQueue.push(messageData);
            return;
        }
        
        try {
            // Validate message data
            if (!messageData || typeof messageData !== 'object') {
                console.warn('Invalid message data:', messageData);
                return;
            }
            
            this.room.send({
                ...messageData,
                timestamp: Date.now(),
                clientId: this.clientId
            });
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    }
    
    requestPresenceUpdate(targetClientId, updateData) {
        if (!this.isInitialized) {
            console.warn('Network not initialized, cannot request presence update');
            return;
        }
        
        try {
            this.room.requestPresenceUpdate(targetClientId, updateData);
        } catch (error) {
            console.error('Failed to request presence update:', error);
        }
    }
    
    processMessageQueue() {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.sendMessage(message);
        }
    }
    
    // Event subscription methods
    onConnected(callback) {
        this.addEventListener('connected', callback);
    }
    
    onDisconnected(callback) {
        this.addEventListener('disconnected', callback);
    }
    
    onMessage(callback) {
        this.addEventListener('message', callback);
    }
    
    onPresenceUpdate(callback) {
        this.addEventListener('presenceUpdate', callback);
    }
    
    onRoomStateUpdate(callback) {
        this.addEventListener('roomStateUpdate', callback);
    }
    
    addEventListener(event, callback) {
        if (this.eventCallbacks[event]) {
            this.eventCallbacks[event].push(callback);
        }
    }
    
    removeEventListener(event, callback) {
        if (this.eventCallbacks[event]) {
            const index = this.eventCallbacks[event].indexOf(callback);
            if (index > -1) {
                this.eventCallbacks[event].splice(index, 1);
            }
        }
    }
    
    triggerCallback(event, data) {
        if (this.eventCallbacks[event]) {
            this.eventCallbacks[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in ${event} callback:`, error);
                }
            });
        }
    }
    
    // Utility methods
    getClientId() {
        return this.clientId;
    }
    
    isHost() {
        if (!this.room || !this.room.peers) return false;
        
        const peerIds = Object.keys(this.room.peers);
        return peerIds.length > 0 && peerIds[0] === this.clientId;
    }
    
    getPlayerCount() {
        return this.room ? Object.keys(this.room.peers).length : 0;
    }
    
    getPlayerList() {
        if (!this.room || !this.room.peers) return [];
        
        return Object.entries(this.room.peers).map(([id, peer]) => ({
            id,
            username: peer.username,
            avatarUrl: peer.avatarUrl
        }));
    }
    
    getCurrentPresence() {
        return this.room ? this.room.presence : {};
    }
    
    getCurrentRoomState() {
        return this.room ? this.room.roomState : {};
    }
    
    getPlayerPresence(playerId) {
        return this.room && this.room.presence ? this.room.presence[playerId] : null;
    }
    
    // Cleanup
    disconnect() {
        if (this.room) {
            // WebsimSocket handles cleanup automatically
            this.room = null;
        }
        
        this.isConnected = false;
        this.isInitialized = false;
        this.clientId = null;
        this.peers = {};
        this.messageQueue = [];
    }
    
    // Game-specific helper methods
    assignPlayerRole(playerId, role) {
        this.requestPresenceUpdate(playerId, {
            type: 'roleAssignment',
            role: role
        });
    }
    
    catchPlayer(playerId) {
        this.requestPresenceUpdate(playerId, {
            type: 'catch'
        });
    }
    
    spawnPlayer(playerId, position) {
        this.requestPresenceUpdate(playerId, {
            type: 'spawn',
            position: position
        });
    }
    
    broadcastGameEvent(eventType, eventData) {
        this.sendMessage({
            type: eventType,
            ...eventData
        });
    }
    
    // Audio event helpers
    broadcastFootstep(position, volume = 0.1) {
        this.sendMessage({
            type: 'footstep',
            position: position,
            volume: volume
        });
    }
    
    broadcastScream(position) {
        this.sendMessage({
            type: 'scream',
            position: position
        });
    }
    
    // Chat helpers
    sendChatMessage(message) {
        this.sendMessage({
            type: 'chat',
            message: message,
            username: this.room?.peers[this.clientId]?.username || 'Anonymous'
        });
    }
}

// Export singleton instance
export const networkManager = new NetworkManager();