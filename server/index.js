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

const TILE = { 
    GRASS: 0, FIXED_WALL: 1, DESTRUCTIBLE: 2, BOMB: 3, 
    ITEM_BOMB: 4, ITEM_FLAME: 5, ITEM_SPEED: 6 
};

const SPAWN_POINTS = [{ x: 1, y: 1 }, { x: 13, y: 1 }, { x: 1, y: 11 }, { x: 13, y: 11 }];
let gameState = { map: [], players: {} };

function initializeMap() {
    gameState.map = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
        gameState.map[y] = [];
        for (let x = 0; x < MAP_WIDTH; x++) {
            if (x === 0 || x === 14 || y === 0 || y === 12 || (x % 2 === 0 && y % 2 === 0)) {
                gameState.map[y][x] = TILE.FIXED_WALL;
            } else {
                const isSpawn = SPAWN_POINTS.some(p => Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1);
                gameState.map[y][x] = (!isSpawn && Math.random() < 0.6) ? TILE.DESTRUCTIBLE : TILE.GRASS;
            }
        }
    }
}
initializeMap();

function sendStats(socketId) {
    const p = gameState.players[socketId];
    if (p) {
        io.to(socketId).emit('statsUpdate', { bombs: p.maxBombs, range: p.range, speed: p.speedLevel });
    }
}

function handleExplosion(bx, by, socketId) {
    if (gameState.map[by][bx] !== TILE.BOMB) return;

    const owner = gameState.players[socketId];
    if (owner) {
        owner.currentBombs = Math.max(0, owner.currentBombs - 1);
        sendStats(socketId);
    }

    const affected = [{ x: bx, y: by }];
    gameState.map[by][bx] = TILE.GRASS;
    io.emit('tileUpdate', { x: bx, y: by, type: TILE.GRASS });

    const dirs = [{x:0,y:1}, {x:0,y:-1}, {x:1,y:0}, {x:-1,y:0}];
    dirs.forEach(d => {
        for (let i = 1; i <= (owner ? owner.range : 1); i++) {
            let tx = bx + d.x * i, ty = by + d.y * i;
            if (tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT) break;
            let t = gameState.map[ty][tx];
            if (t === TILE.FIXED_WALL) break;
            affected.push({ x: tx, y: ty });
            if (t === TILE.BOMB) { handleExplosion(tx, ty, socketId); break; }
            if (t === TILE.DESTRUCTIBLE) {
                const rand = Math.random();
                if (rand < 0.3) {
                    const itemRand = Math.random();
                    gameState.map[ty][tx] = itemRand < 0.33 ? TILE.ITEM_SPEED : (itemRand < 0.66 ? TILE.ITEM_FLAME : TILE.ITEM_BOMB);
                } else gameState.map[ty][tx] = TILE.GRASS;
                io.emit('tileUpdate', { x: tx, y: ty, type: gameState.map[ty][tx] });
                break;
            }
            if (t >= 4) { gameState.map[ty][tx] = TILE.GRASS; io.emit('tileUpdate', { x: tx, y: ty, type: TILE.GRASS }); }
        }
    });

    io.emit('bombExploded', { affectedTiles: affected });

    // MECÂNICA DE MORTE: Verifica se algum jogador foi atingido
    Object.values(gameState.players).forEach(p => {
        if (affected.some(tile => tile.x === p.x && tile.y === p.y)) {
            io.emit('playerKilled', p.id);
            delete gameState.players[p.id];
        }
    });
}

io.on('connection', (socket) => {
    socket.on('requestMap', () => {
        if (Object.keys(gameState.players).length === 0) initializeMap(); // Reinicia mapa se for o primeiro
        const spawn = SPAWN_POINTS[Object.keys(gameState.players).length % 4];
        gameState.players[socket.id] = {
            id: socket.id, x: spawn.x, y: spawn.y,
            currentBombs: 0, maxBombs: 1, range: 1, moveDuration: 200, speedLevel: 1
        };
        socket.emit('mapInit', { grid: gameState.map, existingPlayers: gameState.players });
        socket.broadcast.emit('newPlayer', gameState.players[socket.id]);
        sendStats(socket.id);
    });

    socket.on('playerMovement', (data) => {
        const p = gameState.players[socket.id];
        if (!p) return;
        let nx = p.x, ny = p.y;
        if(data.direction === 'up') ny--; else if(data.direction === 'down') ny++;
        else if(data.direction === 'left') nx--; else if(data.direction === 'right') nx++;

        if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT && 
           (gameState.map[ny][nx] === TILE.GRASS || gameState.map[ny][nx] >= 4)) {
            p.x = nx; p.y = ny;
            if (gameState.map[ny][nx] >= 4) {
                const item = gameState.map[ny][nx];
                if (item === TILE.ITEM_BOMB) p.maxBombs++;
                else if (item === TILE.ITEM_FLAME) p.range++;
                else if (item === TILE.ITEM_SPEED) { p.speedLevel++; p.moveDuration = Math.max(100, p.moveDuration - 25); }
                gameState.map[ny][nx] = TILE.GRASS;
                io.emit('tileUpdate', { x: nx, y: ny, type: TILE.GRASS });
                sendStats(socket.id);
            }
            io.emit('playerMoved', { id: socket.id, x: p.x, y: p.y, direction: data.direction, duration: p.moveDuration });
        } else {
            socket.emit('playerMoved', { id: socket.id, x: p.x, y: p.y, direction: data.direction, duration: 0 });
        }
    });

    socket.on('placeBomb', () => {
        const p = gameState.players[socket.id];
        if (p && p.currentBombs < p.maxBombs && gameState.map[p.y][p.x] === TILE.GRASS) {
            const bx = p.x, by = p.y;
            gameState.map[by][bx] = TILE.BOMB;
            p.currentBombs++;
            io.emit('tileUpdate', { x: bx, y: by, type: TILE.BOMB });
            setTimeout(() => handleExplosion(bx, by, socket.id), 3000);
        }
    });

    socket.on('disconnect', () => {
        delete gameState.players[socket.id];
        io.emit('removePlayer', socket.id);
    });
});

app.use(express.static(path.join(__dirname, '..', 'client')));
server.listen(PORT, () => console.log(`Servidor Bombinho rodando!`));