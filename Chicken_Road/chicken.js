// --- CONFIGURACIÓN E INICIALIZACIÓN ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Elementos UI
const startScreen = document.getElementById('start-screen');
const resultScreen = document.getElementById('result-screen');
const uiCredits = document.getElementById('ui-credits');
const uiBet = document.getElementById('ui-bet');
const uiUsername = document.getElementById('ui-username');
const betInput = document.getElementById('bet-input');
const chipBtns = document.querySelectorAll('.chip-btn');

// 1. Intenta leer de los params normales (?token=...)
const urlParams = new URLSearchParams(window.location.search);
let token = urlParams.get('token');

// 2. Si no hay, intenta leer del HASH (#token=...)
if (!token && window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    token = hashParams.get('token');
}

// 3. Si aun no hay, intenta del localStorage (por si acaso)
if (!token) {
    token = localStorage.getItem('token');
}

// --- DEBUG ---
if (!token) {
    alert("ERROR FINAL: El token no se encontró ni en URL, ni Hash, ni Storage.");
} else {
    console.log("Token recuperado:", token.substring(0, 10) + "...");
}

const socket = io(`https://trifobetbackend.onrender.com`, {
    auth: { token },
    transports: ['polling', 'websocket'],
    reconnectionAttempts: 5
});

// --- DEBUGGING: ERRORES DE SOCKET ---
socket.on('connect_error', (err) => {
    console.error("DEBUG: Socket Connect Error", err);
    alert("Error de conexión con el Servidor: " + err.message);
});

// Estado del Juego
let gameState = 'MENU'; // MENU, PLAYING, GAMEOVER, WIN, LOSE
let credits = 0; // Se carga del backend
let currentBet = 0;
let level = 1;
let animationId;
let username = "Cargando...";

// Grid System
const GRID = 20;
const COLS = canvas.width / GRID;
const ROWS = canvas.height / GRID;

// Entidades
let player = { x: 10, y: 18, facing: 'left' };
let cars = [];
let particles = [];

// --- ASSETS IMÁGENES ---
const carImages = {
    leftToRight: [
        'public/img/auto1--=.png',
        'public/img/auto4--=.png',
        'public/img/auto5--=.png',
        'public/img/auto6--=.png'
    ],
    rightToLeft: [
        'public/img/auto2=--.png',
        'public/img/auto3=--.png'
    ]
};
const playerImageSrc = 'public/img/chicken.png';
const loadedImages = {};

function preloadImages() {
    [...carImages.leftToRight, ...carImages.rightToLeft].forEach(src => {
        const img = new Image();
        img.src = src;
        loadedImages[src] = img;
    });
    const pImg = new Image();
    pImg.src = playerImageSrc;
    loadedImages[playerImageSrc] = pImg;
}
preloadImages();

// --- AUDIO ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

const sounds = {
    click: () => playTone(800, 'square', 0.05),
    start: () => { playTone(400, 'sine', 0.1); setTimeout(() => playTone(600, 'sine', 0.1), 100); setTimeout(() => playTone(800, 'square', 0.3), 200); },
    jump: () => playTone(300, 'triangle', 0.05, -100),
    die: () => { playTone(150, 'sawtooth', 0.3, -50); setTimeout(() => playTone(100, 'sawtooth', 0.4), 100); },
    win: () => {
        [0, 100, 200, 300, 400].forEach((delay, i) => {
            setTimeout(() => playTone(500 + (i * 100), 'square', 0.1), delay);
        });
    }
};

function playTone(freq, type, duration, slide = 0) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (slide !== 0) {
        osc.frequency.linearRampToValueAtTime(freq + slide, audioCtx.currentTime + duration);
    }
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

// --- SOCKET EVENTS ---
const joinGame = () => {
    console.log('Conectado a Chicken Road - Enviando joinChickenGame');
    socket.emit('joinChickenGame');
};

if (socket.connected) {
    console.log('Socket ya conectado');
    joinGame();
}

socket.on('connect', () => {
    console.log('Socket conectado (evento)');
    joinGame();
});

// ← ESTE ES EL CAMBIO CLAVE: Escuchar chickenGameState
socket.on('chickenGameState', (data) => {
    console.log('🐔 Frontend recibió chickenGameState:', data);
    credits = data.balance;
    username = data.username || 'Jugador';
    updateUI();
});

socket.on('chickenBetAccepted', (data) => {
    if (data.success) {
        credits = data.newBalance; // Saldo restante tras apostar
        updateUI();
        
        // Iniciar juego visualmente
        sounds.start();
        gameState = 'PLAYING';
        startScreen.classList.add('hidden');
        resultScreen.classList.add('hidden');
        initLevel();
        loop();
    }
});

socket.on('chickenGameFinished', (data) => {
    credits = data.newBalance; // Saldo actualizado (con ganancias si hubo)
    updateUI();
    
    // Mostrar resultado visual
    if (data.won) {
        showWinScreen(data.winnings);
    } else {
        showLoseScreen();
    }
});

socket.on('chickenError', (err) => {
    alert('Error: ' + err.message);
});

function updateUI() {
    uiCredits.innerText = Math.floor(credits);
    uiUsername.innerText = username;
    document.getElementById('start-credits').innerText = Math.floor(credits);
    document.getElementById('display-username').innerText = username;
    // Asegúrate de que el bet también se actualice si es necesario
    uiBet.innerText = currentBet;
}

// --- LÓGICA DEL JUEGO ---

function selectBet(amount) {
    if (gameState !== 'MENU') return;
    sounds.click();
    betInput.value = amount;
    chipBtns.forEach(btn => {
        btn.classList.remove('selected');
        if (parseInt(btn.innerText) === amount) btn.classList.add('selected');
    });
}

function initLevel() {
    player = { x: Math.floor(COLS / 2), y: ROWS - 2, facing: 'left' };
    cars = [];
    particles = [];
    
    // Configuración de carriles
    const lanes = [
        { y: 16, speed: 2, dir: 1, type: 'sedan' },
        { y: 15, speed: 3, dir: -1, type: 'sport' },
        { y: 14, speed: 1.5, dir: 1, type: 'limo' },
        { y: 13, speed: 3.5, dir: -1, type: 'sport' },
        { y: 11, speed: 2.5, dir: 1, type: 'sedan' },
        { y: 10, speed: 1.5, dir: -1, type: 'limo' },
        { y: 7, speed: 3, dir: 1, type: 'sport' },
        { y: 6, speed: 2, dir: -1, type: 'sedan' },
        { y: 5, speed: 3.5, dir: 1, type: 'sport' },
        { y: 4, speed: 1.8, dir: -1, type: 'limo' },
        { y: 3, speed: 2.5, dir: 1, type: 'sedan' }
    ];

    lanes.forEach(lane => {
        let speedMultiplier = 1 + (level * 0.1);
        let numCars = 2 + Math.floor(Math.random() * 2);
        let slotSize = canvas.width / numCars;

        for (let i = 0; i < numCars; i++) {
            let imgSrc = (lane.dir === 1) 
                ? carImages.leftToRight[Math.floor(Math.random() * carImages.leftToRight.length)]
                : carImages.rightToLeft[Math.floor(Math.random() * carImages.rightToLeft.length)];

            let fixedWidth = GRID * 1.8;
            let fixedHeight = GRID * 0.85;
            let margin = 20;
            let maxOffset = slotSize - fixedWidth - margin;
            let randomOffset = Math.random() * Math.max(0, maxOffset);
            let startX = (i * slotSize) + randomOffset;

            cars.push({
                x: startX,
                y: lane.y * GRID + (GRID * 0.075),
                w: fixedWidth,
                h: fixedHeight,
                speed: (lane.speed * speedMultiplier) * 0.5,
                dir: lane.dir,
                color: lane.type === 'limo' ? '#fff' : (lane.type === 'sport' ? '#ff0055' : '#00aaff'),
                img: loadedImages[imgSrc]
            });
        }
    });
}

function startGame() {
    let betAmount = parseInt(betInput.value);
    if (isNaN(betAmount) || betAmount < 1) {
        alert("Por favor ingresa una apuesta válida (mínimo 1).");
        return;
    }
    if (credits < betAmount) {
        alert("¡Sin créditos suficientes!");
        return;
    }

    currentBet = betAmount;
    uiBet.innerText = currentBet;
    
    // EMITIR APUESTA AL BACKEND
    socket.emit('placeChickenBet', { amount: currentBet });
}

function resetToMenu() {
    gameState = 'MENU';
    startScreen.classList.remove('hidden');
    resultScreen.classList.add('hidden');
    cancelAnimationFrame(animationId);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    initLevel();
    draw();
}

function handleInput(action) {
    if (gameState !== 'PLAYING') return;
    let prevY = player.y;

    if (action === 'up') player.y--;
    if (action === 'down') player.y++;
    if (action === 'left') { player.x--; player.facing = 'left'; }
    if (action === 'right') { player.x++; player.facing = 'right'; }

    if (player.x < 0) player.x = 0;
    if (player.x >= COLS) player.x = COLS - 1;
    if (player.y > ROWS - 1) player.y = ROWS - 1;

    if (player.y !== prevY) sounds.jump();

    if (player.y < 2) {
        handleWin();
    }
}

function checkCollisions() {
    let px = player.x * GRID;
    let py = player.y * GRID;
    let pw = GRID * 0.8;
    let ph = GRID * 0.8;
    let offsetX = GRID * 0.1;
    let offsetY = GRID * 0.1;

    for (let car of cars) {
        if (px + offsetX < car.x + car.w &&
            px + offsetX + pw > car.x &&
            py + offsetY < car.y + car.h &&
            py + offsetY + ph > car.y) {
            handleLoss();
            return;
        }
    }
}

function handleWin() {
    if (gameState === 'WIN') return; // Evitar doble envío
    gameState = 'WIN';
    sounds.win();
    level++;
    
    // Efecto partículas
    for (let i = 0; i < 50; i++) {
        createParticle(canvas.width / 2, canvas.height / 2, '#FFD700');
    }
    
    // NOTIFICAR AL BACKEND
    socket.emit('chickenGameResult', { bet: currentBet, won: true });
}

function handleLoss() {
    if (gameState === 'LOSE') return;
    gameState = 'LOSE';
    sounds.die();
    
    // NOTIFICAR AL BACKEND
    socket.emit('chickenGameResult', { bet: currentBet, won: false });
}

function showWinScreen(winnings) {
    document.getElementById('result-title').innerText = "¡GANASTE!";
    document.getElementById('result-title').className = "result-title win-text";
    document.getElementById('result-message').innerText = `+${winnings} CRÉDITOS`;
    setTimeout(() => resultScreen.classList.remove('hidden'), 500);
}

function showLoseScreen() {
    document.getElementById('result-title').innerText = "CRASH!";
    document.getElementById('result-title').className = "result-title lose-text";
    document.getElementById('result-message').innerText = `PERDISTE ${currentBet} CRÉDITOS`;
    setTimeout(() => resultScreen.classList.remove('hidden'), 500);
}

function createParticle(x, y, color) {
    particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1.0,
        color: color
    });
}

function update() {
    if (gameState !== 'PLAYING' && gameState !== 'WIN') return;
    cars.forEach(car => {
        car.x += car.speed * car.dir;
        if (car.dir === 1 && car.x > canvas.width) car.x = -car.w;
        if (car.dir === -1 && car.x < -car.w) car.x = canvas.width;
    });
    particles.forEach((p, index) => {
        p.x += p.vx; p.y += p.vy; p.life -= 0.02;
        if (p.life <= 0) particles.splice(index, 1);
    });
    if (gameState === 'PLAYING') checkCollisions();
}

function draw() {
    // Fondo
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Zonas Seguras
    ctx.fillStyle = '#220000';
    ctx.fillRect(0, (ROWS - 2) * GRID, canvas.width, GRID * 2);
    ctx.fillRect(0, 0, canvas.width, GRID * 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 8 * GRID, canvas.width, GRID * 2);
    // Líneas
    ctx.strokeStyle = '#444';
    ctx.setLineDash([10, 10]);
    for (let i = 2; i < ROWS - 2; i++) {
        if (i === 8 || i === 9) continue;
        ctx.beginPath(); ctx.moveTo(0, i * GRID); ctx.lineTo(canvas.width, i * GRID); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Meta
    ctx.fillStyle = `rgba(255, 215, 0, ${0.2 + Math.random() * 0.1})`;
    ctx.fillRect(0, 0, canvas.width, GRID * 2);
    ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    for (let i = 0; i < COLS; i += 4) ctx.fillText('WIN', i * GRID + 10, GRID + 5);
    
    // Autos
    cars.forEach(car => {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(car.x + 2, car.y + 10, car.w, car.h - 10);
        if (car.img) ctx.drawImage(car.img, car.x, car.y, car.w, car.h);
        else { ctx.fillStyle = car.color; ctx.fillRect(car.x, car.y, car.w, car.h); }
    });

    // Player
    let px = player.x * GRID; let py = player.y * GRID;
    if (loadedImages[playerImageSrc]) {
        ctx.save();
        if (player.facing === 'right') {
            ctx.translate(px + GRID, py); ctx.scale(-1, 1);
            ctx.drawImage(loadedImages[playerImageSrc], 0, 0, GRID, GRID);
        } else {
            ctx.drawImage(loadedImages[playerImageSrc], px, py, GRID, GRID);
        }
        ctx.restore();
    } else {
        // Fallback
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px + GRID/2, py + GRID/2, GRID/2 - 2, 0, Math.PI*2); ctx.fill();
    }

    // Partículas
    particles.forEach(p => {
        ctx.fillStyle = p.color; ctx.globalAlpha = p.life;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1.0;
    });
}

function loop() {
    update();
    draw();
    animationId = requestAnimationFrame(loop);
}

window.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowUp') handleInput('up');
    if (e.key === 'ArrowDown') handleInput('down');
    if (e.key === 'ArrowLeft') handleInput('left');
    if (e.key === 'ArrowRight') handleInput('right');
});

// Init
initLevel();
draw();