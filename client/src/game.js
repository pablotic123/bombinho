const socket = io();
const TILE_SIZE = 64;

// --- CENA: MENU ---
class MenuScene extends Phaser.Scene {
    constructor() { super('MenuScene'); }
    preload() { this.load.spritesheet('tiles', 'assets/tiles.png', { frameWidth: 64, frameHeight: 64 }); }
    create() {
        this.add.rectangle(480, 416, 960, 832, 0x111111);
        this.add.text(480, 300, 'BOMBINHO', { fontSize: '80px', fontStyle: 'bold' }).setOrigin(0.5);
        const btn = this.add.text(480, 500, 'JOGAR', { fontSize: '40px', backgroundColor: '#0a0', padding: 20 })
            .setOrigin(0.5).setInteractive({ useHandCursor: true });
        btn.on('pointerdown', () => socket.emit('requestMap'));
        socket.once('mapInit', (data) => this.scene.start('GameScene', data));
    }
}

// --- CENA: GAME OVER ---
class GameOverScene extends Phaser.Scene {
    constructor() { super('GameOverScene'); }
    create() {
        this.add.rectangle(480, 416, 960, 832, 0x000000, 0.8);
        this.add.text(480, 300, 'GAME OVER', { fontSize: '80px', fill: '#f00' }).setOrigin(0.5);
        
        const retry = this.add.text(480, 450, 'TENTAR NOVAMENTE', { fontSize: '30px', backgroundColor: '#333', padding: 15 })
            .setOrigin(0.5).setInteractive({ useHandCursor: true });
        
        const exit = this.add.text(480, 550, 'SAIR', { fontSize: '30px', backgroundColor: '#333', padding: 15 })
            .setOrigin(0.5).setInteractive({ useHandCursor: true });

        retry.on('pointerdown', () => socket.emit('requestMap'));
        exit.on('pointerdown', () => window.location.reload());
        
        socket.once('mapInit', (data) => this.scene.start('GameScene', data));
    }
}

// --- CENA: JOGO ---
class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.players = {};
        this.isMoving = false;
        this.directionMap = { 'down': 0, 'right': 1, 'left': 2, 'up': 3 };
    }

    init(data) { this.grid = data.grid; this.existingPlayers = data.existingPlayers; }

    preload() {
        this.load.spritesheet('tiles', 'assets/tiles.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('player', 'assets/player.png', { frameWidth: 64, frameHeight: 64 });
    }

    create() {
        this.players = {};
        this.isMoving = false; // Reset trava de movimento

        // Mapa Fundo
        const grassMap = this.make.tilemap({ data: Array(13).fill().map(() => Array(15).fill(0)), tileWidth: 64, tileHeight: 64 });
        grassMap.createLayer(0, grassMap.addTilesetImage('tiles'), 0, 0);

        // Mapa Dinâmico
        this.map = this.make.tilemap({ data: this.grid, tileWidth: 64, tileHeight: 64 });
        this.layer = this.map.createLayer(0, this.map.addTilesetImage('tiles'), 0, 0).setDepth(1);
        this.layer.forEachTile(t => { if (t.index === 0) this.layer.removeTileAt(t.x, t.y); });

        // HUD
        const hudStyle = { font: 'bold 20px Arial', fill: '#fff', stroke: '#000', strokeThickness: 4 };
        this.uiB = this.add.text(20, 20, 'BOMBAS: 1', hudStyle).setDepth(100);
        this.uiR = this.add.text(180, 20, 'ALCANCE: 1', hudStyle).setDepth(100);
        this.uiS = this.add.text(360, 20, 'VELOCIDADE: 1', hudStyle).setDepth(100);

        Object.values(this.existingPlayers).forEach(p => this.addPlayer(p));
        this.cursors = this.input.keyboard.createCursorKeys();
        this.setupSocket();
    }

    setupSocket() {
        socket.off('playerMoved'); socket.off('tileUpdate'); socket.off('newPlayer');
        socket.off('removePlayer'); socket.off('bombExploded'); socket.off('statsUpdate');
        socket.off('playerKilled');

        socket.on('newPlayer', p => this.addPlayer(p));
        socket.on('playerMoved', d => {
            const s = this.players[d.id];
            if (!s) return;
            s.setFrame(this.directionMap[d.direction]);
            this.tweens.add({
                targets: s, x: d.x * 64 + 32, y: d.y * 64 + 32,
                duration: d.duration,
                onComplete: () => { if (d.id === socket.id) this.isMoving = false; }
            });
        });
        socket.on('tileUpdate', d => {
            if (d.type === 0) this.layer.removeTileAt(d.x, d.y);
            else this.layer.putTileAt(d.type, d.x, d.y);
        });
        socket.on('statsUpdate', d => {
            this.uiB.setText(`BOMBAS: ${d.bombs}`);
            this.uiR.setText(`ALCANCE: ${d.range}`);
            this.uiS.setText(`VELOCIDADE: ${d.speed}`);
        });
        socket.on('bombExploded', d => {
            d.affectedTiles.forEach(t => {
                const fire = this.add.rectangle(t.x * 64 + 32, t.y * 64 + 32, 60, 60, 0xff4500, 0.8).setDepth(5);
                this.tweens.add({ targets: fire, alpha: 0, scale: 0.2, duration: 400, onComplete: () => fire.destroy() });
            });
        });
        socket.on('playerKilled', id => {
            if (id === socket.id) this.scene.start('GameOverScene');
            else if (this.players[id]) { this.players[id].destroy(); delete this.players[id]; }
        });
        socket.on('removePlayer', id => { if (this.players[id]) { this.players[id].destroy(); delete this.players[id]; }});
    }

    addPlayer(info) {
        if (this.players[info.id]) return;
        const s = this.add.sprite(info.x * 64 + 32, info.y * 64 + 32, 'player', 0).setDepth(10);
        this.players[info.id] = s;
        if (info.id === socket.id) this.self = s;
    }

    update() {
        if (!this.self || this.isMoving) return;

        let dir = null;
        if (this.cursors.left.isDown) dir = 'left';
        else if (this.cursors.right.isDown) dir = 'right';
        else if (this.cursors.up.isDown) dir = 'up';
        else if (this.cursors.down.isDown) dir = 'down';

        if (dir) {
            this.isMoving = true; // Trava o envio de novos comandos até o tween terminar
            socket.emit('playerMovement', { direction: dir });
        }

        if (Phaser.Input.Keyboard.JustDown(this.cursors.space)) {
            socket.emit('placeBomb');
        }
    }
}

const config = { type: Phaser.AUTO, width: 960, height: 832, parent: 'game-container', scene: [MenuScene, GameScene, GameOverScene] };
new Phaser.Game(config);