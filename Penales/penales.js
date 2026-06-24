// --- TOKEN MANAGER (Copiar al inicio de todos los juegos) ---
const urlParams = new URLSearchParams(window.location.search);
let token = urlParams.get('token');

// Si no está en params, buscar en hash (para sobrevivir redirects)
if (!token && window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    token = hashParams.get('token');
}

// Si aun no está, buscar en localStorage (inyección de respaldo)
if (!token) {
    token = localStorage.getItem('token');
}

if (!token) {
    console.error("CRITICAL: No token found via URL, Hash, or Storage.");
    alert("Error: No se pudo autenticar el usuario.");
}
// ------------------------------------------------------------
// IP DEL SERVIDOR
const socket = io(`http://${window.location.hostname}:3000`, { 
  auth: { token },
  transports: ['polling', 'websocket'],
});

const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function initAudio() {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

const SFX = {
    playTone: (freq, type, duration, vol = 0.1) => {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    },
    click: () => SFX.playTone(800, 'square', 0.05, 0.05),
    bet: () => SFX.playTone(1200, 'sine', 0.1, 0.1),
    win: () => {
        [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
            setTimeout(() => SFX.playTone(f, 'triangle', 0.6, 0.1), i * 50);
        });
    },
    lose: () => {
        SFX.playTone(150, 'sawtooth', 0.4, 0.2);
        setTimeout(() => SFX.playTone(100, 'sawtooth', 0.4, 0.2), 200);
    },
    whistle: () => SFX.playTone(2000, 'sine', 0.1, 0.05)
};

let credits = 1000;
const BET_COST = 10;
const PRIZE_GOAL = 20;
const PRIZE_SAVE = 50;

let currentRole = 'shooter';
let isProcessing = false;
let history = [];
let totalWins = 0;
let totalLosses = 0;
let netProfit = 0;

const uiCredits = document.getElementById('credits-display');
const uiRole = document.getElementById('role-display');
const uiStatus = document.getElementById('status-text');
const uiMessage = document.getElementById('message-overlay');
const uiHistory = document.getElementById('history-track');
const uiTotalWins = document.getElementById('total-wins');
const uiTotalLosses = document.getElementById('total-losses');
const uiNetProfit = document.getElementById('net-profit');

const keeperGfx = document.getElementById('keeper-gfx');
const ballGfx = document.getElementById('ball-gfx');
const visualGrid = document.getElementById('visual-grid');
const inputGrid = document.getElementById('input-grid');

function goToRoleSelect() {
    initAudio();
    SFX.click();
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('role-screen').classList.remove('hidden');
}

function selectRole(role) {
    SFX.click();
    currentRole = role;
    document.getElementById('role-screen').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    resetBoard();
    updateUI();
}

function backToStart() {
    SFX.click();
    document.getElementById('game-container').classList.add('hidden');
    document.getElementById('role-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
}

function resetBoard() {
    ballGfx.style.transition = 'none';
    keeperGfx.style.transition = 'none';

    if (currentRole === 'shooter') {
        ballGfx.style.transform = 'translate(-50%, 0) scale(1.5)';
        ballGfx.style.bottom = '-20px';
        ballGfx.style.opacity = '1';
        ballGfx.classList.add('ready');

        keeperGfx.style.top = '50%';
        keeperGfx.style.left = '50%';
        keeperGfx.style.transform = 'translate(-50%, -50%)';
    } else {
        ballGfx.style.opacity = '0';

        keeperGfx.style.top = '50%';
        keeperGfx.style.left = '50%';
        keeperGfx.style.transform = 'translate(-50%, -50%)';
    }

    // LIMPIAR MENSAJE
    hideMessage();

    document.querySelectorAll('.grid-cell').forEach(c => {
        c.className = 'grid-cell';
        c.style.background = '';
    });
    document.querySelectorAll('.select-btn').forEach(b => b.classList.remove('selected'));

    isProcessing = false;
    uiStatus.innerText = currentRole === 'shooter' ? "ELIGE ZONA DE TIRO" : "ELIGE ZONA DE ATAJADA";
    updateButtons(true);
}

function updateButtons(enabled) {
    const btns = inputGrid.querySelectorAll('button');
    btns.forEach(b => b.disabled = !enabled);
}

function playTurn(playerChoiceIndex) {
    if (isProcessing) return;
    if (credits < BET_COST) {
        alert("Sin créditos. Reinicia la página para obtener más.");
        return;
    }

    isProcessing = true;
    initAudio();

    updateCredits(-BET_COST);
    SFX.bet();

    inputGrid.children[playerChoiceIndex].classList.add('selected');
    updateButtons(false);
    uiStatus.innerText = "PROCESANDO...";

    const cpuChoiceIndex = Math.floor(Math.random() * 9);

    setTimeout(() => {
        performAnimations(playerChoiceIndex, cpuChoiceIndex);
    }, 500);
}

function performAnimations(playerIdx, cpuIdx) {
    ballGfx.style.transition = 'all 0.5s cubic-bezier(0.25, 1, 0.5, 1)';
    keeperGfx.style.transition = 'all 0.5s cubic-bezier(0.25, 1, 0.5, 1)';

    const getCoordinates = (idx) => {
        const row = Math.floor(idx / 3);
        const col = idx % 3;
        return {
            x: 15 + (col * 35),
            y: 15 + (row * 35)
        };
    };

    let shooterTarget, keeperTarget;

    if (currentRole === 'shooter') {
        shooterTarget = getCoordinates(playerIdx);
        keeperTarget = getCoordinates(cpuIdx);
    } else {
        keeperTarget = getCoordinates(playerIdx);
        shooterTarget = getCoordinates(cpuIdx);
    }

    keeperGfx.style.left = keeperTarget.x + '%';
    keeperGfx.style.top = keeperTarget.y + '%';
    keeperGfx.style.transform = 'translate(-50%, -50%) scale(1.2)';

    ballGfx.style.opacity = '1';
    ballGfx.style.left = shooterTarget.x + '%';
    ballGfx.style.bottom = (100 - shooterTarget.y) + '%';
    ballGfx.style.transform = 'translate(-50%, 50%) scale(0.6)';

    SFX.whistle();

    setTimeout(() => {
        resolveRound(playerIdx, cpuIdx);
    }, 600);
}

function resolveRound(playerIdx, cpuIdx) {
    let win = false;
    let prize = 0;
    const isMatch = (playerIdx === cpuIdx);

    if (currentRole === 'shooter') {
        win = !isMatch;
        if (win) {
            prize = PRIZE_GOAL;
            showFeedback("¡GOL!", true);
            updateCredits(prize);
            updateStats(prize, 0);
        } else {
            showFeedback("ATAJADO", false);
            updateStats(0, BET_COST);
        }
    } else {
        win = isMatch;
        if (win) {
            prize = PRIZE_SAVE;
            showFeedback("¡ATAJADA!", true);
            updateCredits(prize);
            updateStats(prize, 0);
        } else {
            showFeedback("GOL EN CONTRA", false);
            updateStats(0, BET_COST);
        }
    }

    const visualCells = visualGrid.children;
    visualCells[cpuIdx].style.background = "rgba(255,255,255,0.2)";

    addToHistory(win);

    setTimeout(() => {
        resetBoard();
    }, 2000);
}

function showFeedback(text, isWin) {
    uiMessage.innerText = text;
    uiMessage.className = isWin ? 'win-msg show' : 'lose-msg show';

    if (isWin) {
        SFX.win();
    } else {
        SFX.lose();
    }
}

function hideMessage() {
    uiMessage.classList.remove('show', 'win-msg', 'lose-msg');
}

function updateCredits(amount) {
    const start = credits;
    credits += amount;
    const end = credits;

    uiCredits.innerText = end;

    uiCredits.style.color = amount > 0 ? 'var(--win-green)' : 'var(--lose-red)';
    uiCredits.style.transform = 'scale(1.3)';

    setTimeout(() => {
        uiCredits.style.color = 'var(--neon-blue)';
        uiCredits.style.transform = 'scale(1)';
    }, 500);
}

function updateUI() {
    uiRole.innerText = "ROL: " + (currentRole === 'shooter' ? "TIRADOR" : "ARQUERO");
}

function addToHistory(isWin) {
    history.push(isWin);
    if (history.length > 5) history.shift();

    uiHistory.innerHTML = '';
    history.forEach(res => {
        const dot = document.createElement('div');
        dot.className = `dot ${res ? 'win' : 'lose'}`;
        uiHistory.appendChild(dot);
    });
}

function updateStats(wonAmount, lostAmount) {
    totalWins += wonAmount;
    totalLosses += lostAmount;
    netProfit = totalWins - totalLosses;

    uiTotalWins.textContent = `${totalWins}`;
    uiTotalLosses.textContent = `${totalLosses}`;
    uiNetProfit.textContent = `${netProfit >= 0 ? '+' : ''}${netProfit}`;

    // Color del neto
    if (netProfit > 0) {
        uiNetProfit.className = 'stat-value positive';
    } else if (netProfit < 0) {
        uiNetProfit.className = 'stat-value negative';
    } else {
        uiNetProfit.className = 'stat-value neutral';
    }
}

ballGfx.classList.add('ready');