const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');

const ROWS = 20;
const COLS = 10;
const BLOCK_SIZE = 30; // 300 / 10 and 600 / 20
const NEXT_BLOCK_SIZE = 20;

// Tetromino definitions
const SHAPES = [
    [], // Empty for 1-based index if needed, but we'll use 0-indexed shapes
    [[1, 1, 1, 1]], // I
    [[1, 1], [1, 1]], // O
    [[0, 1, 0], [1, 1, 1]], // T
    [[1, 0, 0], [1, 1, 1]], // J
    [[0, 0, 1], [1, 1, 1]], // L
    [[0, 1, 1], [1, 1, 0]], // S
    [[1, 1, 0], [0, 1, 1]]  // Z
];

const COLORS = [
    'transparent',
    '#00f3ff', // I - Cyan
    '#ffe600', // O - Yellow
    '#ff00ea', // T - Purple
    '#0033ff', // J - Blue
    '#ff6600', // L - Orange
    '#00ff00', // S - Green
    '#ff0000'  // Z - Red
];

let board = [];
let score = 0;
let lines = 0;
let currentPiece;
let nextPiece;
let holdPiece = null;
let canHold = true;
let isPaused = false;
let isGameOver = false;
let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let reqAnimationId;

function createBoard() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function drawBlock(ctx, x, y, colorId, size = BLOCK_SIZE, offsetX = 0, offsetY = 0) {
    if (colorId === 0) return;
    const color = COLORS[colorId];
    ctx.fillStyle = color;
    ctx.fillRect(offsetX + x * size, offsetY + y * size, size, size);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(offsetX + x * size, offsetY + y * size, size, size);
    
    // Neon inner glow effect
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(offsetX + x * size + 2, offsetY + y * size + 2, size - 4, size - 4);
}

function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    for(let r = 0; r < ROWS; r++) {
        for(let c = 0; c < COLS; c++) {
            ctx.strokeRect(c * BLOCK_SIZE, r * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
            drawBlock(ctx, c, r, board[r][c]);
        }
    }
}

class Piece {
    constructor(shapeId) {
        this.shapeId = shapeId;
        this.shape = SHAPES[shapeId];
        this.colorId = shapeId;
        this.x = Math.floor(COLS / 2) - Math.floor(this.shape[0].length / 2);
        this.y = 0;
    }

    draw() {
        for (let r = 0; r < this.shape.length; r++) {
            for (let c = 0; c < this.shape[r].length; c++) {
                if (this.shape[r][c]) {
                    drawBlock(ctx, this.x + c, this.y + r, this.colorId);
                }
            }
        }
    }

    move(dx, dy) {
        if (!this.collide(dx, dy, this.shape)) {
            this.x += dx;
            this.y += dy;
            return true;
        }
        return false;
    }

    rotate() {
        const rotatedShape = this.shape[0].map((val, index) => 
            this.shape.map(row => row[index]).reverse()
        );
        
        // Wall kick implementation (basic)
        let offset = 0;
        if (this.collide(0, 0, rotatedShape)) {
            if (!this.collide(1, 0, rotatedShape)) offset = 1;
            else if (!this.collide(-1, 0, rotatedShape)) offset = -1;
            else if (!this.collide(2, 0, rotatedShape)) offset = 2; // For I piece
            else if (!this.collide(-2, 0, rotatedShape)) offset = -2;
            else return; // Cannot rotate
        }
        
        this.x += offset;
        this.shape = rotatedShape;
    }

    collide(dx, dy, shape) {
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;
                let newX = this.x + c + dx;
                let newY = this.y + r + dy;
                
                if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
                if (newY < 0) continue; // Allow piece to rotate above board
                if (board[newY][newX] !== 0) return true;
            }
        }
        return false;
    }

    lock() {
        for (let r = 0; r < this.shape.length; r++) {
            for (let c = 0; c < this.shape[r].length; c++) {
                if (this.shape[r][c]) {
                    if (this.y + r < 0) {
                        gameOver();
                        return;
                    }
                    board[this.y + r][this.x + c] = this.colorId;
                }
            }
        }
        clearLines();
        spawnPiece();
    }
}

function drawMiniPiece(piece, context, canvasElem) {
    context.clearRect(0, 0, canvasElem.width, canvasElem.height);
    if (!piece) return;
    
    const shape = SHAPES[piece.shapeId];
    const width = shape[0].length * NEXT_BLOCK_SIZE;
    const height = shape.length * NEXT_BLOCK_SIZE;
    const offsetX = (canvasElem.width - width) / 2;
    const offsetY = (canvasElem.height - height) / 2;

    for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c]) {
                drawBlock(context, c, r, piece.colorId, NEXT_BLOCK_SIZE, offsetX, offsetY);
            }
        }
    }
}

function spawnPiece() {
    if (!nextPiece) {
        nextPiece = new Piece(Math.floor(Math.random() * 7) + 1);
    }
    currentPiece = nextPiece;
    nextPiece = new Piece(Math.floor(Math.random() * 7) + 1);
    drawMiniPiece(nextPiece, nextCtx, nextCanvas);
    canHold = true;
    
    if (currentPiece.collide(0, 0, currentPiece.shape)) {
        gameOver();
    }
}

function clearLines() {
    let linesCleared = 0;
    outer: for (let r = ROWS - 1; r >= 0; r--) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c] === 0) continue outer;
        }
        const row = board.splice(r, 1)[0].fill(0);
        board.unshift(row);
        r++;
        linesCleared++;
    }

    if (linesCleared > 0) {
        lines += linesCleared;
        score += [0, 40, 100, 300, 1200][linesCleared] * (Math.floor(lines / 10) + 1);
        dropInterval = Math.max(100, 1000 - (Math.floor(lines / 10) * 100));
        updateScore();
    }
}

function updateScore() {
    document.getElementById('score').innerText = score;
    document.getElementById('lines').innerText = lines;
    document.getElementById('speed').innerText = (dropInterval / 1000).toFixed(1) + 's';
}

function hold() {
    if (!canHold) return;
    if (holdPiece) {
        const temp = holdPiece.shapeId;
        holdPiece = new Piece(currentPiece.shapeId);
        currentPiece = new Piece(temp);
    } else {
        holdPiece = new Piece(currentPiece.shapeId);
        spawnPiece();
    }
    canHold = false;
    drawMiniPiece(holdPiece, holdCtx, holdCanvas);
}

function drop() {
    if (!currentPiece.move(0, 1)) {
        currentPiece.lock();
    }
    dropCounter = 0;
}

function hardDrop() {
    while (currentPiece.move(0, 1)) {}
    currentPiece.lock();
    dropCounter = 0;
}

function update(time = 0) {
    if (isPaused || isGameOver) return;

    const deltaTime = time - lastTime;
    lastTime = time;
    dropCounter += deltaTime;

    if (dropCounter > dropInterval) {
        drop();
    }

    drawBoard();
    currentPiece.draw();
    
    reqAnimationId = requestAnimationFrame(update);
}

function togglePause() {
    if (isGameOver) return;
    isPaused = !isPaused;
    document.getElementById('pause-overlay').classList.toggle('hidden', !isPaused);
    if (!isPaused) {
        lastTime = performance.now();
        update(lastTime);
    } else {
        cancelAnimationFrame(reqAnimationId);
    }
}

function gameOver() {
    isGameOver = true;
    cancelAnimationFrame(reqAnimationId);
    document.getElementById('game-over-overlay').classList.remove('hidden');
}

function resetGame() {
    createBoard();
    score = 0;
    lines = 0;
    dropInterval = 1000;
    isGameOver = false;
    isPaused = false;
    holdPiece = null;
    canHold = true;
    updateScore();
    document.getElementById('game-over-overlay').classList.add('hidden');
    document.getElementById('pause-overlay').classList.add('hidden');
    drawMiniPiece(null, holdCtx, holdCanvas);
    spawnPiece();
    lastTime = performance.now();
    update(lastTime);
}

document.addEventListener('keydown', event => {
    if (isGameOver) return;

    if (event.code === 'KeyP' || event.code === 'Escape') {
        togglePause();
        return;
    }

    if (isPaused) return;

    switch (event.code) {
        case 'ArrowLeft':
            currentPiece.move(-1, 0);
            break;
        case 'ArrowRight':
            currentPiece.move(1, 0);
            break;
        case 'ArrowDown':
            drop();
            break;
        case 'ArrowUp':
            currentPiece.rotate();
            break;
        case 'Space':
            hardDrop();
            break;
        case 'KeyC':
            hold();
            break;
    }
    
    // Redraw immediately for snappy controls
    if (!isPaused) {
        drawBoard();
        currentPiece.draw();
    }
});

document.getElementById('restart-btn').addEventListener('click', resetGame);

// Init
resetGame();
