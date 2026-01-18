const MAP_WIDTH = 15;
const MAP_HEIGHT = 13;
const TILE_SIZE = 64; 
const socket = io(); 

class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.players = {};
        this.isMoving = false;
        // Mapeamento dos frames conforme a sua imagem vertical
        this.directionMap = {
            'down': 0,
            'right': 1,
            'left': 2,
            'up': 3
        };
    }
    
    init(data) {
        this.grid = data.grid;
        this.existingPlayers = data.existingPlayers;
    }

    preload() {
        if (!this.textures.exists('tiles')) {
            this.load.spritesheet('tiles', 'assets/tiles.png', { frameWidth: 64, frameHeight: 64 });
        }
        // Alterado para spritesheet para reconhecer os frames individuais
        this.load.spritesheet('player_sprite', 'assets/player.png', { frameWidth: 64, frameHeight: 64 });
    }

    create() {
        this.players = {};

        // 1. Chão de Grama Permanente (Layer 0)
        const grassData = Array(MAP_HEIGHT).fill().map(() => Array(MAP_WIDTH).fill(0));
        const grassMap = this.make.tilemap({ data: grassData, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
        const grassTileset = grassMap.addTilesetImage('tiles');
        grassMap.createLayer(0, grassTileset, 0, 0).setDepth(0);

        // 2. Objetos Dinâmicos (Layer 1)
        const map = this.make.tilemap({ data: this.grid, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
        const tileset = map.addTilesetImage('tiles'); 
        this.dynamicLayer = map.createLayer(0, tileset, 0, 0).setDepth(1);
        
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                if (this.grid[y][x] === 0) this.dynamicLayer.putTileAt(-1, x, y);
            }
        }

        for (const id in this.existingPlayers) this.addPlayer(this.existingPlayers[id]);
        this.cursors = this.input.keyboard.createCursorKeys();
        this.setupHUD();
        this.setupSocketEvents();
    }

    setupHUD() {
        const style = { font: 'bold 20px Arial', fill: '#ffffff', stroke: '#000', strokeThickness: 4 };
        this.bombText = this.add.text(20, 20, '💣: 1', style).setDepth(100);
        this.rangeText = this.add.text(120, 20, '🔥: 1', style).setDepth(100);
        this.speedText = this.add.text(220, 20, '👟: 1', style).setDepth(100);
    }

    setupSocketEvents() {
        socket.off('statsUpdate').on('statsUpdate', (data) => {
            this.bombText.setText(`💣: ${data.bombs}`);
            this.rangeText.setText(`🔥: ${data.range}`);
            this.speedText.setText(`👟: ${data.speed}`);
        });

        // Agora recebe a direção do servidor
        socket.off('playerMoved').on('playerMoved', (data) => this.moveSprite(data.id, data.x, data.y, data.direction, data.duration));
        
        socket.off('newPlayer').on('newPlayer', (info) => this.addPlayer(info));

        socket.off('tileUpdate').on('tileUpdate', (data) => {
            if (this.dynamicLayer) {
                const tileId = (data.type === 0) ? -1 : data.type;
                this.dynamicLayer.putTileAt(tileId, data.x, data.y);
            }
        });

        socket.off('bombExploded').on('bombExploded', (data) => {
            data.affectedTiles.forEach(tile => {
                const cx = tile.x * TILE_SIZE + 32, cy = tile.y * TILE_SIZE + 32;
                const fire = this.add.rectangle(cx, cy, 60, 60, 0xffa500, 0.8).setDepth(5);
                this.tweens.add({ targets: fire, alpha: 0, scale: 1.2, duration: 400, onComplete: () => fire.destroy() });
            });
        });

        socket.off('playerEliminated').on('playerEliminated', (id) => {
            if (id === socket.id) { alert("Você morreu!"); location.reload(); }
        });

        socket.off('removePlayer').on('removePlayer', (id) => {
            if (this.players[id]) { this.players[id].destroy(); delete this.players[id]; }
        });
    }

    addPlayer(info) {
        if (this.players[info.id]) return;
        // Inicia o sprite com o frame 0 (down)
        const sprite = this.add.sprite(info.x * TILE_SIZE + 32, info.y * TILE_SIZE + 32, 'player_sprite', 0).setDepth(10);
        this.players[info.id] = sprite;
        if (info.id === socket.id) this.self = sprite;
    }

    update() {
        if (!this.self || this.isMoving) return;
        if (Phaser.Input.Keyboard.JustDown(this.cursors.space)) socket.emit('placeBomb');

        let dir = null;
        if (this.cursors.left.isDown) dir = 'left';
        else if (this.cursors.right.isDown) dir = 'right';
        else if (this.cursors.up.isDown) dir = 'up';
        else if (this.cursors.down.isDown) dir = 'down';

        if (dir) { 
            this.isMoving = true; 
            socket.emit('playerMovement', { direction: dir }); 
        }
    }

    moveSprite(id, gx, gy, direction, dur) {
        const sprite = this.players[id];
        if (!sprite) return;

        // Atualiza o frame do sprite baseado na direção recebida
        if (direction && this.directionMap[direction] !== undefined) {
            sprite.setFrame(this.directionMap[direction]);
        }

        if (dur === 0) { 
            if (id === socket.id) this.isMoving = false; 
            return; 
        }

        this.tweens.add({
            targets: sprite, 
            x: gx * TILE_SIZE + 32, 
            y: gy * TILE_SIZE + 32,
            duration: dur, 
            ease: 'Linear', 
            onComplete: () => { if (id === socket.id) this.isMoving = false; }
        });
    }
}

const config = { type: Phaser.AUTO, width: MAP_WIDTH * TILE_SIZE, height: MAP_HEIGHT * TILE_SIZE, parent: 'game-container', scene: [GameScene] };
const game = new Phaser.Game(config);
socket.on('mapInit', (data) => { game.scene.start('GameScene', data); });