// script.js - Versión Final (Con delay en BUST)
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
const socket = io('http://localhost:3000', {
  auth: { token },
  transports: ['polling', 'websocket'],
  reconnectionAttempts: 5
});

// Referencias al DOM
const els = {
  username: document.getElementById('username-display'),
  balance: document.getElementById('balance-display'),
  bet: document.getElementById('bet-display'),
  message: document.getElementById('game-message'),
  dealerCards: document.getElementById('dealer-cards'),
  dealerScore: document.getElementById('dealer-score'),
  playerHandsContainer: document.getElementById('player-hands-container'),
  resultOverlay: document.getElementById('result-overlay'),
  gameActions: document.getElementById('game-actions'),
  insuranceActions: document.getElementById('insurance-actions'),
  newGameActions: document.getElementById('new-game-actions'),
  bettingControls: document.getElementById('betting-controls'),
  btnDeal: document.getElementById('btn-deal'),
  btnHit: document.getElementById('btn-hit'),
  btnStand: document.getElementById('btn-stand'),
  btnDouble: document.getElementById('btn-double'),
  btnSplit: document.getElementById('btn-split'),
  btnInsYes: document.getElementById('btn-ins-yes'),
  btnInsNo: document.getElementById('btn-ins-no'),
  btnNewGame: document.getElementById('btn-new-game'),
  btnClear: document.getElementById('btn-clear'),
};

// ESTADO LOCAL
let currentState = {
    dealerHand: [],
    playerHands: [[]],
    playerScores: [0],
    handStatus: [],
    handResults: [], 
    message: 'Conectando...',
    balance: 0,
    currentBet: 0,
    showInsurance: false,
    canDouble: false,
    canSplit: false,
    activeHandIndex: 0,
    username: 'Cargando...'
};

// Tracking para animaciones
let isAnimating = false;
let animationQueue = [];

// --- SISTEMA DE AUDIO ---
class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.enabled = true;
    }
    playTone(freq, type, duration, vol = 0.1) {
        if (!this.enabled) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }
    playChip() { this.playTone(1200, 'sine', 0.1, 0.05); }
    playCardSlide() { 
        if (!this.enabled) return;
        const bufferSize = this.ctx.sampleRate * 0.1;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
        noise.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    }
    playWin() {
        this.playTone(440, 'sine', 0.2, 0.1);
        setTimeout(() => this.playTone(554, 'sine', 0.4, 0.1), 100);
        setTimeout(() => this.playTone(659, 'sine', 0.6, 0.1), 200);
    }
    playLose() {
        this.playTone(300, 'triangle', 0.3, 0.1);
        setTimeout(() => this.playTone(200, 'triangle', 0.5, 0.1), 200);
    }
    playBlackjack() {
        [523, 659, 783, 1046].forEach((f, i) => setTimeout(() => this.playTone(f, 'square', 0.3, 0.1), i * 100));
    }
}

const audio = new SoundManager();

// --- SOCKET EVENTS ---
const joinGame = () => {
    console.log('Conectado a Blackjack - Enviando joinGame');
    socket.emit('joinGame');
};
if (socket.connected) {
    console.log('Socket ya conectado');
    joinGame();
}
socket.on('connect', () => {
    console.log('Socket conectado (evento)');
    joinGame();
});

socket.on('connect_error', (err) => {
    console.error('❌ Error de conexión:', err);
    els.message.textContent = 'Error de conexión: ' + err.message;
});

socket.on('gameState', (state) => {
    console.log('📦 Estado inicial:', state);
    updateLocalState(state);
    render();
});

socket.on('gameUpdate', (update) => {
    console.log('🔄 Actualización:', update);
    updateLocalState(update);
    render();
});

// --- LÓGICA DE ESTADO ---
function updateLocalState(newData) {
    // Merge state
    currentState = { ...currentState, ...newData };
    
    // Asegurar arrays
    if (!currentState.dealerHand) currentState.dealerHand = [];
    if (!currentState.playerHands) currentState.playerHands = [[]];
    if (!currentState.handResults) currentState.handResults = [];
    if (!currentState.handStatus) currentState.handStatus = [];
}

// --- RENDERIZADO ---
function render() {
    // 1. Textos básicos
    if (els.username) els.username.textContent = currentState.username;
    if (els.balance) els.balance.textContent = Math.floor(currentState.balance);
    if (els.bet) els.bet.textContent = currentState.currentBet;
    if (els.message) els.message.textContent = currentState.message;

    // 2. Reset visual si es un juego nuevo
    if (currentState.message === 'Haz tu apuesta' && currentState.playerHands[0].length === 0) {
        resetTableVisual();
    }

    // 3. Renderizar dealer
    renderDealer();

    // 4. Renderizar jugador
    renderPlayer();

    // 5. Botones
    updateButtons();

    // 6. Efectos especiales
    handleEffects();
}

function resetTableVisual() {
    els.dealerCards.innerHTML = '';
    els.dealerScore.textContent = '';
    els.dealerScore.className = 'score-bubble';
    
    els.playerHandsContainer.innerHTML = `
        <div class="hand-area split-hand active-hand" id="p-hand-0">
            <div class="active-indicator"></div>
            <div class="score-bubble" id="p-score-0">0</div>
            <div class="cards-container" id="p-cards-0"></div>
        </div>
    `;
}

function renderDealer() {
    const hideDealerCard = currentState.handStatus.some(s => s === 'playing') && currentState.dealerHand.length === 2;
    const currentCards = els.dealerCards.children.length;
    const expectedCards = currentState.dealerHand.length;

    // Agregar cartas nuevas con animación
    let newCardsAdded = false;
    if (expectedCards > currentCards) {
        for (let i = currentCards; i < expectedCards; i++) {
            const card = currentState.dealerHand[i];
            const isHidden = i === 1 && hideDealerCard;
            addCard(els.dealerCards, card, isHidden);
            audio.playCardSlide();
            newCardsAdded = true;
        }
    }

    // Revelar carta oculta si es necesario
    if (!hideDealerCard && currentCards === 2) {
        const hiddenCard = els.dealerCards.querySelector('.hidden');
        if (hiddenCard && currentState.dealerHand[1]) {
            revealDealerCard(hiddenCard, currentState.dealerHand[1]);
        }
    }

    // Actualizar score
    if (els.dealerScore) {
        const updateScore = () => {
            if (hideDealerCard && currentState.dealerHand.length > 0) {
                els.dealerScore.textContent = currentState.dealerHand[0].numericValue;
            } else {
                els.dealerScore.textContent = currentState.dealerScore || 0;
            }
            
            if (currentState.dealerScore > 0 || currentState.dealerHand.length > 0) {
                els.dealerScore.classList.add('visible');
            }
        };

        if (newCardsAdded) {
            setTimeout(updateScore, 600);
        } else {
            updateScore();
        }
    }
}

function renderPlayer() {
    // Sincronizar número de manos (para splits)
    while (els.playerHandsContainer.children.length < currentState.playerHands.length) {
        const i = els.playerHandsContainer.children.length;
        createSplitHand(i, currentState.playerHands[i][0] || {value: '?', suit: 'Spade', numericValue: 0});
    }

    const isPlaying = currentState.handStatus.some(s => s === 'playing');
    const gameFinished = currentState.handResults.length > 0 || currentState.message === 'Juego resuelto';

    // Renderizar cada mano
    for (let i = 0; i < currentState.playerHands.length; i++) {
        const hand = currentState.playerHands[i];
        const handEl = document.getElementById(`p-hand-${i}`);
        if (!handEl) continue;

        // Cartas
        const container = handEl.querySelector('.cards-container');
        const currentCards = container.children.length;
        
        let newCardsAdded = false;
        if (hand.length > currentCards) {
            for (let j = currentCards; j < hand.length; j++) {
                addCard(container, hand[j]);
                audio.playCardSlide();
                newCardsAdded = true;
            }
        }

        // Score o Resultado
        const scoreEl = document.getElementById(`p-score-${i}`);
        if (scoreEl) {
            const updatePlayerScore = () => {
                const result = currentState.handResults[i];
                const score = currentState.playerScores[i] || 0;
                
                if (gameFinished && result) {
                    // Lógica especial para BUST (TE PASASTE)
                    if (result === 'TE PASASTE' || result === 'BUST') {
                        // Si ya mostramos el texto final, mantenerlo
                        if (scoreEl.dataset.bustShown === 'true') {
                            scoreEl.textContent = result;
                            scoreEl.classList.add('buster');
                        } 
                        // Si aún no iniciamos el delay, iniciarlo
                        else if (!scoreEl.dataset.bustDelayStarted) {
                            scoreEl.textContent = score; // Mostrar número (ej: 22)
                            scoreEl.classList.add('buster');
                            scoreEl.dataset.bustDelayStarted = 'true';
                            
                            setTimeout(() => {
                                scoreEl.textContent = result; // Cambiar a texto
                                scoreEl.dataset.bustShown = 'true';
                            }, 1000); // 2 segundos de espera
                        } 
                        // Durante el delay, asegurar que se ve el número
                        else {
                            scoreEl.textContent = score;
                            scoreEl.classList.add('buster');
                        }
                    } else {
                        // Otros resultados
                        scoreEl.textContent = result;
                        scoreEl.classList.remove('winner', 'buster');
                        
                        if (result === 'GANAS' || result === 'BLACKJACK') {
                            scoreEl.classList.add('winner');
                        } else if (result === 'PIERDES') {
                            scoreEl.classList.add('buster');
                        }
                    }
                } else {
                    // Juego en progreso
                    scoreEl.textContent = score;
                    scoreEl.classList.remove('winner', 'buster');
                    // Limpiar flags si es una mano nueva
                    if (score === 0) {
                        delete scoreEl.dataset.bustDelayStarted;
                        delete scoreEl.dataset.bustShown;
                    }
                }
                
                if (score > 0 || result) {
                    scoreEl.classList.add('visible');
                }
            };

            if (newCardsAdded) {
                setTimeout(updatePlayerScore, 600);
            } else {
                updatePlayerScore();
            }
        }

        // Active hand
        handEl.classList.toggle('active-hand', i === currentState.activeHandIndex);
    }
}

function createSplitHand(newIndex, card) {
    const div = document.createElement('div');
    div.className = 'hand-area split-hand';
    div.id = `p-hand-${newIndex}`;
    div.innerHTML = `
        <div class="active-indicator"></div>
        <div class="score-bubble visible" id="p-score-${newIndex}">${card.numericValue || 0}</div>
        <div class="cards-container" id="p-cards-${newIndex}"></div>
    `;
    els.playerHandsContainer.appendChild(div);
    
    const container = div.querySelector('.cards-container');
    addCard(container, card);
    audio.playCardSlide();
}

function revealDealerCard(hiddenCardEl, card) {
    hiddenCardEl.className = `card ${card.isRed ? 'red' : 'black'}`;
    const suitHtml = getSuitHtml(card.suit);
    hiddenCardEl.innerHTML = `
        <div class="card-top"><span>${card.value}</span><span>${suitHtml}</span></div>
        <div class="card-center">${suitHtml}</div>
        <div class="card-bottom"><span>${card.value}</span><span>${suitHtml}</span></div>
    `;
    hiddenCardEl.style.transform = "rotateY(90deg)";
    setTimeout(() => hiddenCardEl.style.transform = "rotateY(0deg)", 100);
    audio.playCardSlide();
}

function getSuitHtml(suit) {
    const map = {
        'SPADE': '&spades;', 'SPA': '&spades;', 'Spade': '&spades;',
        'HEART': '&hearts;', 'HEA': '&hearts;', 'Heart': '&hearts;',
        'CLUB': '&clubs;', 'CLU': '&clubs;', 'Club': '&clubs;',
        'DIAMOND': '&diams;', 'DIA': '&diams;', 'Diamond': '&diams;',
        '♠': '&spades;', '♥': '&hearts;', '♣': '&clubs;', '♦': '&diams;'
    };
    return map[suit] || suit;
}

function addCard(container, card, isHidden = false) {
    const div = document.createElement('div');
    div.className = `card ${isHidden ? 'hidden' : ''} ${card.isRed ? 'red' : 'black'} dealing`;
    
    if (!isHidden) {
        const suitHtml = getSuitHtml(card.suit);
        div.innerHTML = `
            <div class="card-top"><span>${card.value}</span><span>${suitHtml}</span></div>
            <div class="card-center">${suitHtml}</div>
            <div class="card-bottom"><span>${card.value}</span><span>${suitHtml}</span></div>
        `;
    }
    container.appendChild(div);
    return div;
}

function updateButtons() {
    const isPlaying = currentState.handStatus.some(s => s === 'playing');
    const showInsurance = currentState.showInsurance;
    const gameFinished = currentState.handResults.length > 0 || currentState.message === 'Juego resuelto';
    
    // Verificamos si hay cartas repartidas
    const hasCards = currentState.playerHands[0].length > 0;

    // Acciones de juego
    if (els.gameActions) {
        els.gameActions.style.display = (isPlaying && !showInsurance) ? 'flex' : 'none';
    }

    // Seguro
    if (els.insuranceActions) {
        els.insuranceActions.style.display = showInsurance ? 'flex' : 'none';
    }
    
    // Nueva mano: solo cuando el juego terminó
    if (els.newGameActions) {
        els.newGameActions.style.display = gameFinished ? 'flex' : 'none';
    }

    // Apuestas: SOLO mostrar si NO hay cartas en la mesa
    if (els.bettingControls) {
        els.bettingControls.style.display = (!hasCards) ? 'flex' : 'none';
    }

    // Botones individuales
    if (els.btnDeal) els.btnDeal.disabled = currentState.currentBet === 0;
    if (els.btnDouble) els.btnDouble.disabled = !currentState.canDouble;
    if (els.btnSplit) els.btnSplit.disabled = !currentState.canSplit;
}

function handleEffects() {
    const msg = currentState.message || '';
    
    // Solo mostrar overlay para mensajes específicos y una sola vez
    if (msg.includes('BLACKJACK') && !els.resultOverlay.classList.contains('show')) {
        showOverlay('BLACKJACK');
        audio.playBlackjack();
    } else if (currentState.handResults.includes('GANAS') && !els.resultOverlay.classList.contains('show')) {
        showOverlay('¡GANAS!');
        audio.playWin();
    } else if (currentState.handResults.includes('BUST') && !els.resultOverlay.classList.contains('show')) {
        showOverlay('BUST');
        audio.playLose();
    }
}

function showOverlay(text) {
    if (els.resultOverlay) {
        els.resultOverlay.textContent = text;
        els.resultOverlay.classList.add('show');
        setTimeout(() => els.resultOverlay.classList.remove('show'), 2000);
    }
}

// --- EVENT LISTENERS ---
document.querySelectorAll('.chip').forEach(chip => {
    chip.onclick = () => {
        const amount = parseInt(chip.dataset.value);
        if (amount) {
            audio.playChip();
            socket.emit('addBet', { amount });
        }
    };
});

if (els.btnDeal) els.btnDeal.onclick = () => socket.emit('dealInitial');
if (els.btnClear) els.btnClear.onclick = () => socket.emit('clearBet');
if (els.btnHit) els.btnHit.onclick = () => socket.emit('hit');
if (els.btnStand) els.btnStand.onclick = () => socket.emit('stand');
if (els.btnDouble) els.btnDouble.onclick = () => socket.emit('double');
if (els.btnSplit) els.btnSplit.onclick = () => socket.emit('split');
if (els.btnNewGame) els.btnNewGame.onclick = () => socket.emit('resetGame');
if (els.btnInsYes) els.btnInsYes.onclick = () => socket.emit('takeInsurance', { wantsInsurance: true });
if (els.btnInsNo) els.btnInsNo.onclick = () => socket.emit('takeInsurance', { wantsInsurance: false });

console.log('✅ Cliente Blackjack v4.2 (Delay BUST) cargado correctamente');