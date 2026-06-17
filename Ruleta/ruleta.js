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
const socket = io('http://localhost:3000', { 
  auth: { token },
  transports: ['polling', 'websocket'],
});

// --- Configuración Global ---
const numbers = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
    10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3
];

const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

let balance = 1000;
let currentBetTotal = 0;
let selectedChip = 10;
let bets = []; // { type: 'straight', target: 14, amount: 10, element: domElement }
let isSpinning = false;
let currentRotation = 0;
let history = [];

// Contexto de Audio
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// --- Inicialización del Tablero ---
function initGame() {
    const board = document.getElementById('board');

    // 1. Cero
    createCell(board, 0, 'cell-0 num-green', '0');

    // 2. Números 1-36
    for (let i = 1; i <= 36; i++) {
        const colorClass = redNumbers.includes(i) ? 'num-red' : 'num-black';

        const col = Math.ceil(i / 3) + 1; // +1 por el cero
        const row = 3 - ((i - 1) % 3); // 3, 2, 1

        const cell = createCell(board, i, `cell num-${i} ${colorClass}`, i);
        cell.style.gridColumn = col;
        cell.style.gridRow = row;
        cell.dataset.type = 'straight';
        cell.dataset.target = i;
    }

    // 3. Column Bets (2 to 1) - Columna 14 del grid
    const colBets = [
        { row: 1, label: '2 to 1', target: 3 },
        { row: 2, label: '2 to 1', target: 2 },
        { row: 3, label: '2 to 1', target: 1 }
    ];
    colBets.forEach(cb => {
        const cell = createCell(board, 'col' + cb.target, 'cell bet-2to1', cb.label);
        cell.style.gridColumn = 14;
        cell.style.gridRow = cb.row;
        cell.dataset.type = 'column';
        cell.dataset.target = cb.target;
    });

    // 4. Dozens
    createBetZone(board, '1st 12', 'bet-dozen bet-dozen-1', 'dozen', 1);
    createBetZone(board, '2nd 12', 'bet-dozen bet-dozen-2', 'dozen', 2);
    createBetZone(board, '3rd 12', 'bet-dozen bet-dozen-3', 'dozen', 3);

    // 5. Simple Bets
    createBetZone(board, '1-18', 'bet-simple bet-low', 'low', 0);
    createBetZone(board, 'EVEN', 'bet-simple bet-even', 'even', 0);
    createBetZone(board, '', 'bet-simple bet-red', 'color', 'red');
    createBetZone(board, '', 'bet-simple bet-black', 'color', 'black');
    createBetZone(board, 'ODD', 'bet-simple bet-odd', 'odd', 0);
    createBetZone(board, '19-36', 'bet-simple bet-high', 'high', 0);

    drawWheel();
    updateUI();
}

function createCell(parent, id, className, text) {
    const div = document.createElement('div');
    div.id = 'cell-' + id;
    div.className = 'cell ' + className;
    div.innerHTML = text;
    div.onclick = (e) => placeBet(e.target);
    parent.appendChild(div);
    return div;
}

function createBetZone(parent, text, className, type, target) {
    const div = document.createElement('div');
    div.className = 'cell ' + className;
    div.innerText = text;
    div.dataset.type = type;
    div.dataset.target = target;
    div.onclick = (e) => placeBet(e.target);
    parent.appendChild(div);
}

// --- Lógica Visual de la Rueda ---
function drawWheel() {
    const wheel = document.getElementById('wheel');
    const sliceAngle = 360 / 37;

    numbers.forEach((num, index) => {
        const numberDiv = document.createElement('div');
        numberDiv.style.position = 'absolute';
        numberDiv.style.height = '50%';
        numberDiv.style.width = '20px';
        numberDiv.style.left = 'calc(50% - 10px)';
        numberDiv.style.top = '0';
        numberDiv.style.transformOrigin = '50% 100%';
        numberDiv.style.transform = `rotate(${index * sliceAngle}deg)`;
        numberDiv.style.textAlign = 'center';
        numberDiv.style.paddingTop = '10px';
        numberDiv.style.fontFamily = 'Arial';
        numberDiv.style.fontWeight = 'bold';
        numberDiv.style.color = '#fff';
        numberDiv.style.textShadow = '0 0 2px #000';

        let color = 'green';
        if (redNumbers.includes(num)) color = '#C90404';
        else if (num !== 0) color = 'black';

        const content = document.createElement('span');
        content.innerText = num;
        content.style.display = 'block';
        content.style.transform = 'scaleY(1.5)';

        const colorDot = document.createElement('div');
        colorDot.style.width = '16px';
        colorDot.style.height = '40px';
        colorDot.style.background = color;
        colorDot.style.position = 'absolute';
        colorDot.style.top = '0';
        colorDot.style.left = '2px';
        colorDot.style.zIndex = '-1';
        colorDot.style.borderRadius = '2px 2px 10px 10px';

        numberDiv.appendChild(colorDot);
        numberDiv.appendChild(content);
        wheel.appendChild(numberDiv);
    });
}

// --- Gestión de Apuestas ---
function selectChip(val) {
    if (isSpinning) return;
    selectedChip = val;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
    document.querySelector(`.chip-${val}`).classList.add('selected');
    playSound(400, 'sine', 0.1);
}

function placeBet(element) {
    if (isSpinning) return;

    if (!element.classList.contains('cell')) {
        element = element.parentElement;
    }
    if (!element.classList.contains('cell')) return;

    if (balance < selectedChip) {
        alert("Saldo insuficiente");
        return;
    }

    const type = element.dataset.type;
    const target = element.dataset.target;

    bets.push({
        type: type,
        target: target,
        amount: selectedChip,
        elId: element.id
    });

    balance -= selectedChip;
    currentBetTotal += selectedChip;

    addChipVisual(element, selectedChip);
    playSound(600, 'triangle', 0.05);
    updateUI();
}

function addChipVisual(parent, amount) {
    const chip = document.createElement('div');
    chip.className = `chip-on-board chip-${amount}`;
    chip.innerText = amount;

    const randX = Math.random() * 10 - 5;
    const randY = Math.random() * 10 - 5;
    chip.style.transform = `translate(${randX}px, ${randY}px)`;

    parent.appendChild(chip);
}

function clearBets() {
    if (isSpinning) return;
    balance += currentBetTotal;
    currentBetTotal = 0;
    bets = [];
    document.querySelectorAll('.chip-on-board').forEach(el => el.remove());
    updateUI();
}

// --- Motor del Juego ---
function spin() {
    if (currentBetTotal === 0) {
        alert("Por favor, haz una apuesta primero.");
        return;
    }
    if (isSpinning) return;

    isSpinning = true;
    document.getElementById('spinBtn').disabled = true;
    document.querySelector('.message-box').style.display = 'none';

    document.querySelectorAll('.winning-cell').forEach(el => el.classList.remove('winning-cell'));

    const winningIndex = Math.floor(Math.random() * 37);
    const winningNumber = numbers[winningIndex];

    const sliceAngle = 360 / 37;
    const targetRotation = 360 - (winningIndex * sliceAngle);
    const extraSpins = 360 * 5;
    const totalRotation = currentRotation + extraSpins + targetRotation;

    const finalRotate = currentRotation + 1440 + (360 - (winningIndex * sliceAngle) - (currentRotation % 360));

    const wheel = document.getElementById('wheel');
    wheel.style.transform = `rotate(${finalRotate}deg)`;

    playSound(150, 'sawtooth', 0.1, 0.5);

    setTimeout(() => {
        finishSpin(winningNumber, finalRotate);
    }, 5000);
}

function finishSpin(number, finalRot) {
    isSpinning = false;
    currentRotation = finalRot;
    document.getElementById('spinBtn').disabled = false;

    playSound(800, 'sine', 0.2);

    const winningCell = document.getElementById(`cell-${number}`);
    if (winningCell) winningCell.classList.add('winning-cell');

    let totalWin = 0;

    bets.forEach(bet => {
        let won = false;
        let payout = 0;

        if (bet.type === 'straight') {
            if (parseInt(bet.target) === number) {
                won = true;
                payout = 35;
            }
        } else if (bet.type === 'color') {
            const isRed = redNumbers.includes(number);
            if (bet.target === 'red' && isRed) won = true;
            if (bet.target === 'black' && !isRed && number !== 0) won = true;
            payout = 1;
        } else if (bet.type === 'even') {
            if (number !== 0 && number % 2 === 0) won = true;
            payout = 1;
        } else if (bet.type === 'odd') {
            if (number !== 0 && number % 2 !== 0) won = true;
            payout = 1;
        } else if (bet.type === 'low') {
            if (number >= 1 && number <= 18) won = true;
            payout = 1;
        } else if (bet.type === 'high') {
            if (number >= 19 && number <= 36) won = true;
            payout = 1;
        } else if (bet.type === 'dozen') {
            if (bet.target == 1 && number >= 1 && number <= 12) won = true;
            if (bet.target == 2 && number >= 13 && number <= 24) won = true;
            if (bet.target == 3 && number >= 25 && number <= 36) won = true;
            payout = 2;
        } else if (bet.type === 'column') {
            if (number !== 0) {
                if (bet.target == 3 && number % 3 === 0) won = true;
                if (bet.target == 2 && number % 3 === 2) won = true;
                if (bet.target == 1 && number % 3 === 1) won = true;
            }
            payout = 2;
        }

        if (won) {
            totalWin += bet.amount + (bet.amount * payout);
        }
    });

    addToHistory(number);

    if (totalWin > 0) {
        balance += totalWin;
        showMsg("¡GANADOR!", `+ Bs${totalWin}`, true);
        playSound(1000, 'square', 0.2);
    } else {
        showMsg("NO HUBO SUERTE", `Perdido: Bs${currentBetTotal}`, false);
    }

    currentBetTotal = 0;
    bets = [];
    document.querySelectorAll('.chip-on-board').forEach(el => el.remove());
    updateUI();
}

// --- Utilidades ---
function updateUI() {
    document.getElementById('balanceDisplay').innerText = `Bs${balance}`;
    document.getElementById('betDisplay').innerText = `Bs${currentBetTotal}`;
}

function addToHistory(num) {
    let color = 'green';
    if (redNumbers.includes(num)) color = '#C90404';
    else if (num !== 0) color = 'black';

    history.unshift({ num, color });
    if (history.length > 10) history.pop();

    const container = document.getElementById('historyBar');
    while (container.children.length > 1) {
        container.removeChild(container.lastChild);
    }

    history.forEach(h => {
        const el = document.createElement('div');
        el.className = 'hist-num';
        el.innerText = h.num;
        el.style.backgroundColor = h.color;
        container.appendChild(el);
    });
}

function showMsg(title, text, isWin) {
    const box = document.getElementById('msgBox');
    document.getElementById('msgTitle').innerText = title;
    document.getElementById('msgTitle').style.color = isWin ? 'var(--gold)' : '#fff';
    document.getElementById('msgAmount').innerText = text;
    box.style.display = 'block';
}

function closeMsg() {
    document.getElementById('msgBox').style.display = 'none';
}

// Sintetizador de Sonido Simple (Sin archivos externos)
function playSound(freq, type, vol, duration = 0.1) {
    try {
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
    } catch (e) {
        console.log("Audio not supported or blocked");
    }
}

// Iniciar
initGame();