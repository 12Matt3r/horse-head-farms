export class GameManager {
    constructor(room, player, aiSeeker, environment) {
        this.room = room;
        this.player = player;
        this.aiSeeker = aiSeeker;
        this.environment = environment;
        
        this.gameState = {
            phase: 'lobby',
            timer: 0,
            maxTime: 300,
            hideTime: 60,
            players: {},
            hiders: [],
            seekers: [],
            survivors: [],
            roundNumber: 1,
            winningTeam: null,
            winnersList: []
        };
        
        this.isHost = false;
        this.lastUpdateTime = Date.now();
        this.errorCount = 0;
        this.maxErrors = 10;
        
        this.setupEventListeners();
        this.setupUI();
    }
    
    setupEventListeners() {
        // Network events
        this.room.onmessage = (event) => {
            this.handleNetworkEvent(event.data);
        };
        
        this.room.subscribeRoomState((roomState) => {
            if (roomState.gameState) {
                this.gameState = { ...this.gameState, ...roomState.gameState };
                this.updateUI();
            }
        });
        
        this.room.subscribePresence((presence) => {
            this.updatePlayerList(presence);
        });
        
        // UI events
        document.getElementById('joinGameBtn')?.addEventListener('click', () => {
            this.joinGame();
        });
        
        document.getElementById('restartBtn')?.addEventListener('click', () => {
            // location.reload(); // Old behavior
            this.requestRestartGame(); // New behavior
        });
    }
    
    setupUI() {
        this.updateUI();
        setInterval(() => this.updateTimer(), 1000);
    }
    
    async joinGame() {
        try {
            await this.room.initialize();
            
            const menu = document.getElementById('menu');
            const ui = document.getElementById('ui');
            const crosshair = document.getElementById('crosshair');
            const instructions = document.getElementById('instructions');
            const loadingScreen = document.getElementById('loadingScreen');
            
            if (menu) menu.classList.add('hidden');
            if (ui) ui.style.display = 'block';
            if (crosshair) crosshair.classList.remove('hidden');
            if (instructions) instructions.classList.remove('hidden');
            if (loadingScreen) loadingScreen.classList.add('hidden');
            
            // Check if we're the first player (host)
            const playerCount = Object.keys(this.room.peers).length;
            if (playerCount === 1) {
                this.isHost = true;
                this.startLobby();
            }
            
            // Update player presence
            this.player.room = this.room;
            this.room.updatePresence({
                role: 'waiting',
                state: 'lobby',
                position: this.player.getPosition(),
                isAlive: true
            });
            
        } catch (error) {
            console.error('Failed to join game:', error);
            this.showNotification('Failed to join game. Please try again.', 'error');
        }
    }
    
    handleNetworkEvent(data) {
        try {
            switch (data.type) {
                case 'connected':
                    this.addChatMessage(`${data.username} joined the game`, 'system');
                    this.showNotification(`${data.username} joined!`, 'success');
                    break;
                    
                case 'disconnected':
                    this.addChatMessage(`${data.username} left the game`, 'system');
                    break;
                    
                case 'chat':
                    this.addChatMessage(`${data.username}: ${data.message}`, 'chat');
                    break;
                    
                case 'gameStart':
                    this.startGame();
                    this.showNotification('Game Starting!', 'info');
                    break;
                    
                case 'phaseChange':
                    this.changePhase(data.phase);
                    break;
                    
                case 'playerCaught':
                    this.handlePlayerCaught(data);
                    break;
                    
                case 'gameEnd':
                    this.endGame(data.winners);
                    break;
            }
        } catch (error) {
            console.error('Error handling network event:', error);
            this.errorCount++;
            
            if (this.errorCount > this.maxErrors) {
                this.showNotification('Too many network errors. Please refresh.', 'error');
            }
        }
    }
    
    startLobby() {
        this.gameState.phase = 'lobby';
        this.gameState.timer = 0;
        
        if (this.isHost) {
            this.room.updateRoomState({
                gameState: this.gameState
            });
            
            // Auto-start when enough players join
            this.checkAutoStart();
        }
    }
    
    checkAutoStart() {
        const playerCount = Object.keys(this.room.peers).length;
        if (playerCount >= 2) {
            setTimeout(() => {
                if (Object.keys(this.room.peers).length >= 2) {
                    this.startGame();
                }
            }, 10000); // 10 seconds to let more players join
        }
    }
    
    startGame() {
        if (!this.isHost) return;
        
        this.gameState.phase = 'hiding';
        this.gameState.timer = this.gameState.hideTime;
        this.gameState.roundNumber = (this.gameState.roundNumber || 0) + 1;
        
        // Assign roles
        this.assignRoles();
        
        // Position players
        this.positionPlayers();
        
        // Update game state
        this.room.updateRoomState({
            gameState: this.gameState
        });
        
        this.room.send({
            type: 'gameStart',
            gameState: this.gameState
        });
        
        // Start hide phase timer
        setTimeout(() => {
            this.startSeekingPhase();
        }, this.gameState.hideTime * 1000);
    }
    
    assignRoles() {
        const players = Object.keys(this.room.peers);
        const hiderCount = Math.max(1, players.length - 1);
        
        // Shuffle players
        const shuffled = [...players].sort(() => Math.random() - 0.5);
        
        this.gameState.hiders = shuffled.slice(0, hiderCount);
        this.gameState.seekers = shuffled.slice(hiderCount);
        this.gameState.survivors = [...this.gameState.hiders];
        
        // Update individual player roles
        for (const playerId of players) {
            const role = this.gameState.hiders.includes(playerId) ? 'hider' : 'seeker';
            this.room.requestPresenceUpdate(playerId, {
                role: role,
                isSeeker: role === 'seeker'
            });
        }
    }
    
    positionPlayers() {
        // Position hiders randomly around the map
        const hidePositions = this.environment.getHidingSpots();
        
        for (let i = 0; i < this.gameState.hiders.length; i++) {
            const playerId = this.gameState.hiders[i];
            const position = hidePositions[i % hidePositions.length];
            
            this.room.requestPresenceUpdate(playerId, {
                spawnPosition: position
            });
        }
        
        // Position seekers at the center (initially locked)
        const centerPosition = new THREE.Vector3(0, 2, 0);
        for (const playerId of this.gameState.seekers) {
            this.room.requestPresenceUpdate(playerId, {
                spawnPosition: centerPosition,
                isLocked: true
            });
        }
    }
    
    startSeekingPhase() {
        if (!this.isHost) return;
        
        this.gameState.phase = 'seeking';
        this.gameState.timer = this.gameState.maxTime;
        
        // Release seekers
        for (const playerId of this.gameState.seekers) {
            this.room.requestPresenceUpdate(playerId, {
                isLocked: false
            });
        }
        
        // Start AI seeker if no human seekers
        if (this.gameState.seekers.length === 0) {
            this.aiSeeker.state = 'patrolling';
        }
        
        this.room.updateRoomState({
            gameState: this.gameState
        });
        
        this.room.send({
            type: 'phaseChange',
            phase: 'seeking',
            gameState: this.gameState
        });
        
        // Start seeking phase timer
        // setTimeout(() => { // This will be handled by checkWinConditions based on timer
        //     this.endGame(this.gameState.survivors);
        // }, this.gameState.maxTime * 1000);
    }
    
    handlePlayerCaught(data) {
        const playerId = data.playerId;
        
        // Remove from survivors
        this.gameState.survivors = this.gameState.survivors.filter(id => id !== playerId);
        
        this.addChatMessage(`Player was caught!`, 'system');
        
        // Check win condition
        if (this.gameState.survivors.length === 0 && this.gameState.phase === 'seeking') {
            this.endGame('seekers'); // Pass string 'seekers'
        }
        
        if (this.isHost) {
            this.room.updateRoomState({
                gameState: this.gameState
            });
        }
    }
    
    endGame(winningTeam) { // winningTeam is "seekers" or "hiders"
        if (this.gameState.phase === 'ended') return; // Prevent multiple calls
        if (!this.isHost) {
            console.log("Client received endGame call, but only host can end game.");
            // Clients will receive the 'ended' phase via gameStateUpdate
            return;
        }
        
        console.log(`Game Ending. Winning Team: ${winningTeam}`);
        this.gameState.phase = 'ended';
        this.gameState.winningTeam = winningTeam;

        let winnersListNames = [];
        if (winningTeam === 'hiders') {
            winnersListNames = this.gameState.survivors.map(id => this.room.peers[id]?.username || `Player ${id.substring(0,4)}`);
        } else if (winningTeam === 'seekers') {
            winnersListNames = this.gameState.seekers.map(id => this.room.peers[id]?.username || `Player ${id.substring(0,4)}`);
             if (winnersListNames.length === 0 && this.aiSeeker) { // Check if AI was the only seeker
                winnersListNames.push("The Horse Head Demon");
            }
        }
        this.gameState.winnersList = winnersListNames;

        const gameStateUpdate = {
            type: 'gameStateUpdate',
            gameState: this.gameState
        };
        this.room.send(gameStateUpdate); // Inform all clients of the final game state
        this.room.updateRoomState(this.gameState); // Host updates authoritative room state
        
        this.showGameResults(winningTeam, winnersListNames);
        
        // Auto-restart lobby after delay
        setTimeout(() => {
            if (this.isHost) this.restartGame(); // Host initiates restart
        }, 15000);
    }
    
    showGameResults(winningTeam, winnersList) {
        const endScreen = document.getElementById('endScreen');
        const endTitle = document.getElementById('endTitle');
        const endMessage = document.getElementById('endMessage'); // Assuming this element exists or will be added
        const winnersListContainer = document.getElementById('winnersListContainer'); // Assuming this exists

        if (!endScreen || !endTitle || !endMessage || !winnersListContainer) {
            console.error("End screen UI elements not found!");
            return;
        }

        if (winningTeam === 'hiders') {
            endTitle.textContent = "Hiders Win!";
            endMessage.textContent = "You survived the night!";
        } else if (winningTeam === 'seekers') {
            endTitle.textContent = "Seekers Win!";
            endMessage.textContent = this.gameState.survivors.length === 0 ? "All hiders have been caught!" : "The hiders couldn't last the night!";
        } else {
            endTitle.textContent = "Game Over";
            endMessage.textContent = "The round has concluded.";
        }

        winnersListContainer.innerHTML = '<h3>Winners:</h3>';
        if (winnersList && winnersList.length > 0) {
            const ul = document.createElement('ul');
            winnersList.forEach(name => {
                const li = document.createElement('li');
                li.textContent = name;
                ul.appendChild(li);
            });
            winnersListContainer.appendChild(ul);
        } else {
            winnersListContainer.innerHTML += '<p>No specific winners listed.</p>';
        }
        
        endScreen.classList.remove('hidden');
        // CSS should handle fade-in via class change
    }

    requestRestartGame() {
        if (this.isHost) {
            this.restartGame();
        } else {
            // Clients can request host to restart, or button is disabled for non-hosts
            this.room.send({ type: 'requestRestart' });
            this.showNotification("Requesting host to restart the game...", "info");
        }
    }

    restartGame() {
        if (!this.isHost && this.gameState.phase !== 'ended') { // Allow host to restart from lobby too
            console.warn("Only host can restart the game.");
            return;
        }
        console.log("Restarting game / Returning to lobby...");

        this.gameState.phase = 'lobby';
        this.gameState.timer = 0;
        this.gameState.hiders = [];
        this.gameState.seekers = [];
        this.gameState.survivors = [];
        this.gameState.winningTeam = null;
        this.gameState.winnersList = [];
        // Consider if roundNumber should reset or persist for multiple rounds
        // this.gameState.roundNumber = 1;

        // Reset player states (like isAlive, role) for all presences
        // This should ideally be handled by players resetting themselves upon receiving new lobby state
        // For now, host will clear roles in room state, players should adapt.
        const currentPresences = this.room.presence;
        for(const playerId in currentPresences){
            this.room.requestPresenceUpdate(playerId, {role: 'waiting', isSeeker: false, isLocked: false});
        }


        const endScreen = document.getElementById('endScreen');
        if (endScreen) endScreen.classList.add('hidden');
        
        const menu = document.getElementById('menu'); // Assuming 'menu' is the lobby screen
        if (menu) menu.classList.remove('hidden');

        // Player positions should be reset when new game starts (in positionPlayers)
        // If player has a respawn method:
        // this.player.respawn();
        // this.aiSeeker.setPosition(new THREE.Vector3(0, 2, 0)); // Reset AI too
        // this.aiSeeker.state = 'idle';

        this.startLobby(); // This will send updates and check for auto-start if host
    }
    
    changePhase(newPhase) {
        this.gameState.phase = newPhase;
        this.updateUI();
        
        // Handle phase-specific logic
        switch (newPhase) {
            case 'hiding':
                this.addChatMessage('Hiding phase started! Find a good hiding spot!', 'system');
                break;
            case 'seeking':
                this.addChatMessage('Seeking phase started! Run and hide!', 'system');
                break;
            case 'ended':
                this.addChatMessage('Game ended!', 'system');
                break;
        }
    }
    
    updatePlayerList(presence) {
        let playerListContent = document.getElementById('playerListContent');
        if (!playerListContent) {
            // Create player list if it doesn't exist
            this.createPlayerListUI();
            playerListContent = document.getElementById('playerListContent'); // Re-fetch after creation
            if (!playerListContent) return; // Still not found, abort
        }
        
        playerListContent.innerHTML = ''; // Clear previous list
        
        for (const [playerId, playerData] of Object.entries(presence)) {
            const peer = this.room.peers[playerId];
            if (!peer || !peer.username) continue; // Skip if peer data or username is missing
            
            const playerDiv = document.createElement('div');
            playerDiv.classList.add('player-list-item');

            const usernameSpan = document.createElement('span');
            usernameSpan.classList.add('username');
            
            const role = playerData.role || 'waiting';
            const roleClass = `role-${role}`; // e.g., role-hider, role-seeker
            usernameSpan.classList.add(roleClass);
            usernameSpan.textContent = peer.username;

            const roleSpan = document.createElement('small');
            roleSpan.classList.add('role-text');
            roleSpan.textContent = ` (${role})`;

            playerDiv.appendChild(usernameSpan);
            playerDiv.appendChild(roleSpan);
            
            playerListContent.appendChild(playerDiv);
        }
        
        // Update player count
        const playerCountElement = document.getElementById('playerCount');
        if (playerCountElement) {
            playerCountElement.textContent = Object.keys(presence).length;
        }
    }
    
    createPlayerListUI() {
        // Create a simple player list UI if it doesn't exist
        const ui = document.getElementById('ui');
        if (ui && !document.getElementById('playerListContent')) {
            const playerList = document.createElement('div');
            playerList.id = 'playerListContent';
            playerList.classList.add('player-list-container'); // Apply the new class
            // Remove direct styling:
            // playerList.style.background = 'rgba(0, 0, 0, 0.7)';
            // playerList.style.padding = '10px';
            // playerList.style.borderRadius = '4px';
            // playerList.style.border = '1px solid #ff0000';
            // playerList.style.marginTop = '10px';
            ui.appendChild(playerList);
        }
    }
    
    updateUI() {
        const gamePhase = document.getElementById('gamePhase');
        const timer = document.getElementById('timer');
        const playerCount = document.getElementById('playerCount');
        const playerRole = document.getElementById('playerRole');
        
        if (gamePhase) gamePhase.textContent = this.gameState.phase;
        if (timer) timer.textContent = this.formatTime(this.gameState.timer);
        if (playerCount) playerCount.textContent = Object.keys(this.room.presence).length;
        
        // Update player role
        const myPresence = this.room.presence[this.room.clientId];
        if (myPresence && myPresence.role && playerRole) {
            playerRole.textContent = myPresence.role;
            playerRole.className = `role-${myPresence.role}`;
        }
    }
    
    updateTimer() {
        if (this.gameState.phase === 'hiding' || this.gameState.phase === 'seeking') {
            if (this.isHost) {
                this.gameState.timer = Math.max(0, this.gameState.timer - 1);
                this.room.updateRoomState({
                    gameState: this.gameState
                });
            }
        }
        
        this.updateUI();
    }
    
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    addChatMessage(message, type = 'chat') {
        try {
            const chatMessages = document.getElementById('chatMessages');
            if (!chatMessages) return;
            
            const messageDiv = document.createElement('div');
            messageDiv.style.margin = '2px 0';
            messageDiv.style.wordWrap = 'break-word';
            
            if (type === 'system') {
                messageDiv.style.color = '#ffff00';
                messageDiv.style.fontStyle = 'italic';
            }
            
            messageDiv.textContent = message;
            chatMessages.appendChild(messageDiv);
            
            // Auto-scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            // Limit chat history
            while (chatMessages.children.length > 50) {
                chatMessages.removeChild(chatMessages.firstChild);
            }
        } catch (error) {
            console.error('Error adding chat message:', error);
        }
    }
    
    showNotification(message, type = 'info') {
        // Call the main app's notification system
        if (window.gameApp && window.gameApp.showNotification) {
            window.gameApp.showNotification(message, type);
        }
    }
    
    update(deltaTime) {
        try {
            // Update AI seeker if active
            if (this.gameState.phase === 'seeking') {
                const players = this.getActivePlayers();
                this.aiSeeker.update(deltaTime, players, this.gameState);
            }
            
            // Check win conditions
            this.checkWinConditions();
            
            // Update game timer display
            this.updateTimerDisplay();
            
        } catch (error) {
            console.error('Error in game manager update:', error);
        }
    }
    
    updateTimerDisplay() {
        const timerElement = document.getElementById('gameTimer');
        if (timerElement) {
            timerElement.textContent = this.formatTime(this.gameState.timer);
            
            // Add urgency styling for low time
            if (this.gameState.timer < 30 && this.gameState.phase === 'seeking') {
                timerElement.style.color = '#ff0000';
                timerElement.style.animation = 'blink 1s infinite';
            } else {
                timerElement.style.color = '#ffffff';
                timerElement.style.animation = 'none';
            }
        }
    }
    
    getActivePlayers() {
        const players = [];
        
        for (const [playerId, presence] of Object.entries(this.room.presence)) {
            if (presence.position && presence.isAlive) {
                players.push({
                    id: playerId,
                    position: new THREE.Vector3(
                        presence.position.x,
                        presence.position.y,
                        presence.position.z
                    ),
                    isHiding: presence.isHiding,
                    isRunning: presence.isRunning,
                    velocity: presence.velocity || new THREE.Vector3()
                });
            }
        }
        
        return players;
    }
    
    checkWinConditions() {
        if (this.gameState.phase !== 'seeking' || !this.isHost) return;
        
        // Check if time ran out
        if (this.gameState.timer <= 0) {
            this.endGame(this.gameState.survivors);
        }
        
        // Check if all hiders caught
        if (this.gameState.phase !== 'ended') { // Only check if game hasn't already ended
            if (this.gameState.timer <= 0 && this.gameState.phase === 'seeking') { // Time ran out in seeking phase
                if (this.gameState.survivors.length > 0) {
                    this.endGame('hiders');
                } else {
                    this.endGame('seekers');
                }
            } else if (this.gameState.survivors.length === 0 && this.gameState.phase === 'seeking') { // All hiders caught
                this.endGame('seekers');
            }
        }
    }
    
    getGameState() {
        return this.gameState;
    }
}