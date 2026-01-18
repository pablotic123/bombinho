const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server); 

const PORT = 3000;
const MAP_WIDTH = 15;
const MAP_HEIGHT = 13;
const TILE_SIZE = 64; 

const TILE = {
    GRASS: 0,        
    FIXED_WALL: 1,   
    DESTRUCTIBLE: 2, 
    BOMB: 3,         
    ITEM_BOMB: 4,  
    ITEM_FLAME: 5, 
    ITEM_SPEED: 6  
};

const SPAWN_POINTS = [
    { x: 1, y: 1 },
    { x: 13, y: 1 },
    { x: 1, y: 11 },
    { x: 13, y: 11 }
];

let gameState = {
    map: [],
    players: {},
    activeBombs: {}, 
    playerCount: 0
};

function initializeMap() {
    for (let y = 0; y < MAP_HEIGHT; y++) {
        gameState.map[y] = [];
        for (let x = 0; x < MAP_WIDTH; x++) {
            if (x === 0 || x === 14 || y === 0 || y === 12 || (x % 2 === 0 && y % 2 === 0)) {
                gameState.map[y][x] = TILE.FIXED_WALL;
            } else {
                const isSpawn = (x <= 2 && y <= 2) || (x >= 12 && y <= 2) || (x <= 2 && y >= 10) || (x >= 12 && y >= 10);
                gameState.map[y][x] = (!isSpawn && Math.random() < 0.6) ? TILE.DESTRUCTIBLE : TILE.GRASS;
            }
        }
    }
}

initializeMap();
app.use(express.static(path.join(__dirname, '..', 'client')));

io.on('connection', (socket) => {
    const spawn = SPAWN_POINTS[Object.keys(gameState.players).length % 4];
    
    gameState.players[socket.id] = {
        id: socket.id,
        x: spawn.x,
        y: spawn.y,
        bombs: 1,
        range: 1,
        speed: 1,
        moveDuration: 280,
        direction: 'down' // Direção inicial
    };

    socket.emit('mapInit', { grid: gameState.map, existingPlayers: gameState.players });
    socket.broadcast.emit('newPlayer', gameState.players[socket.id]);
    sendStatsUpdate(socket.id);

    socket.on('playerMovement', (data) => {
        const p = gameState.players[socket.id];
        if (!p) return;

        let nx = p.x, ny = p.y;
        if (data.direction === 'up') ny--;
        else if (data.direction === 'down') ny++;
        else if (data.direction === 'left') nx--;
        else if (data.direction === 'right') nx++;

        if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT && (gameState.map[ny][nx] === TILE.GRASS || gameState.map[ny][nx] >= 4)) {
            p.x = nx; 
            p.y = ny;
            p.direction = data.direction; // Atualiza direção no servidor

            io.emit('playerMoved', { 
                id: p.id, 
                x: p.x, 
                y: p.y, 
                direction: p.direction, 
                duration: p.moveDuration 
            });

            if (gameState.map[ny][nx] >= 4) {
                if (gameState.map[ny][nx] === TILE.ITEM_BOMB) p.bombs++;
                else if (gameState.map[ny][nx] === TILE.ITEM_FLAME) p.range++;
                else if (gameState.map[ny][nx] === TILE.ITEM_SPEED) {
                    p.speed++;
                    p.moveDuration = Math.max(p.moveDuration - 30, 150);
                }
                gameState.map[ny][nx] = TILE.GRASS;
                io.emit('tileUpdate', { x: nx, y: ny, type: TILE.GRASS });
                sendStatsUpdate(socket.id);
            }
        } else {
            socket.emit('playerMoved', { id: p.id, x: p.x, y: p.y, direction: p.direction, duration: 0 });
        }
    });

    socket.on('placeBomb', () => {
        const p = gameState.players[socket.id];
        if (p && p.bombs > 0 && gameState.map[p.y][p.x] === TILE.GRASS) {
            const bx = p.x, by = p.y;
            gameState.map[by][bx] = TILE.BOMB;
            p.bombs--;
            gameState.activeBombs[`${bx},${by}`] = socket.id;
            io.emit('tileUpdate', { x: bx, y: by, type: TILE.BOMB });
            sendStatsUpdate(socket.id);
            setTimeout(() => handleExplosion(bx, by), 3000);
        }
    });

    socket.on('disconnect', () => {
        delete gameState.players[socket.id];
        io.emit('removePlayer', socket.id);
    });
});

function handleExplosion(bx, by) {
    if (gameState.map[by][bx] !== TILE.BOMB) return;

    const ownerId = gameState.activeBombs[`${bx},${by}`];
    const player = gameState.players[ownerId];
    
    gameState.map[by][bx] = TILE.GRASS;
    delete gameState.activeBombs[`${bx},${by}`];
    io.emit('tileUpdate', { x: bx, y: by, type: TILE.GRASS });

    if (player) {
        player.bombs++;
        sendStatsUpdate(ownerId);
    }

    const range = player ? player.range : 1;
    const affected = [{ x: bx, y: by }];
    const dirs = [{x:0,y:1}, {x:0,y:-1}, {x:1,y:0}, {x:-1,y:0}];

    dirs.forEach(d => {
        for (let i = 1; i <= range; i++) {
            let tx = bx + d.x * i, ty = by + d.y * i;
            if (tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT) break;
            let t = gameState.map[ty][tx];
            if (t === TILE.FIXED_WALL) break;
            affected.push({ x: tx, y: ty });
            if (t === TILE.BOMB) { handleExplosion(tx, ty); break; }
            if (t === TILE.DESTRUCTIBLE) {
                const rand = Math.random();
                if (rand < 0.3) {
                    const item = Math.random();
                    gameState.map[ty][tx] = item < 0.3 ? TILE.ITEM_SPEED : (item < 0.6 ? TILE.ITEM_FLAME : TILE.ITEM_BOMB);
                } else gameState.map[ty][tx] = TILE.GRASS;
                io.emit('tileUpdate', { x: tx, y: ty, type: gameState.map[ty][tx] });
                break;
            }
        }
    });

    io.emit('bombExploded', { x: bx, y: by, affectedTiles: affected });
    Object.values(gameState.players).forEach(pl => {
        if (affected.some(t => t.x === pl.x && t.y === pl.y)) io.emit('playerEliminated', pl.id);
    });
}

function sendStatsUpdate(id) {
    const p = gameState.players[id];
    if (p) io.to(id).emit('statsUpdate', { bombs: p.bombs, range: p.range, speed: p.speed });
}

server.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));