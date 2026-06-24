// --- CONFIGURACIÓN SOCKET.IO ---
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
const socket = io(`https://trifobetbackend.onrender.com`, { 
  auth: { token },
  transports: ['polling', 'websocket'],
});
// --- Módulo de Audio ---
const AudioManager = (() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;
    let isMuted = false;
    function init() {
        if (!audioCtx) {
            audioCtx = new AudioContext();
        }
        document.addEventListener('click', () => {
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
        }, { once: true });
    }
    function playSound(type) {
        if (isMuted || !audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        const now = audioCtx.currentTime;
        switch (type) {
            case 'click':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
                gainNode.gain.setValueAtTime(0.1, now);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
                break;
            case 'bounce':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(600, now);
                gainNode.gain.setValueAtTime(0.05, now);
                gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
                break;
            case 'win':
                osc.type = 'square';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.linearRampToValueAtTime(800, now + 0.2);
                gainNode.gain.setValueAtTime(0.1, now);
                gainNode.gain.linearRampToValueAtTime(0, now + 0.4);
                osc.start(now);
                osc.stop(now + 0.4);
                break;
            case 'loss':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.linearRampToValueAtTime(100, now + 0.3);
                gainNode.gain.setValueAtTime(0.05, now);
                gainNode.gain.linearRampToValueAtTime(0, now + 0.4);
                osc.start(now);
                osc.stop(now + 0.4);
                break;
        }
    }
    function toggleMute() {
        isMuted = !isMuted;
        const muteIcon = document.getElementById('muteIcon');
        muteIcon.textContent = isMuted ? '🔇' : '🔊';
    }
    return {
        init,
        playSound,
        toggleMute
    };
})();
// --- Módulo de UI ---
const UIManager = (() => {
    const balanceDisplay = document.getElementById('balanceDisplay');
    const betInput = document.getElementById('betInput');
    const playButton = document.getElementById('playButton');
    const lastResultContainer = document.getElementById('lastResultContainer');
    const lastResultText = document.getElementById('lastResultText');
    const floatingTextContainer = document.getElementById('floatingTextContainer');
    const muteBtn = document.getElementById('muteBtn');
    const playerDisplay = document.getElementById('playerDisplay');
    function updateBalance(balance) {
        balanceDisplay.textContent = `Bs${parseFloat(balance).toFixed(2)}`;
    }
    function updatePlayerName(name) {
        playerDisplay.textContent = name;
    }
    function updateBet(bet) {
        betInput.value = bet;
    }
    function setPlayButtonState(enabled) {
        // playButton.disabled = !enabled; // Eliminado para permitir múltiples bolas
        if (!enabled) {
            playButton.setAttribute('aria-disabled', 'true');
        } else {
            playButton.removeAttribute('aria-disabled');
        }
    }
    function showLastResult(amount, multiplier) {
        const isLoss = multiplier < 1;
        const sign = amount >= 0 ? '+' : '';
        const colorClass = isLoss ? 'loss' : 'money';
        lastResultText.className = `stat-value ${colorClass}`;
        lastResultText.textContent = `${sign}Bs${Math.abs(amount).toFixed(2)} (${multiplier}x)`;
        lastResultContainer.style.display = 'block';
        setTimeout(() => {
            lastResultContainer.style.display = 'none';
        }, 5000);
    }
    function showFloatingText(x, y, text, color) {
        const el = document.createElement('div');
        el.className = 'floating-text';
        el.textContent = text;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.color = color;
        floatingTextContainer.appendChild(el);
        setTimeout(() => {
            el.remove();
        }, 1000);
    }
    function initEventListeners() {
        muteBtn.addEventListener('click', AudioManager.toggleMute);
        document.getElementById('halveBetBtn').addEventListener('click', () => GameManager.adjustBet(0.5));
        document.getElementById('decreaseBetBtn').addEventListener('click', () => GameManager.adjustBet(-1));
        document.getElementById('increaseBetBtn').addEventListener('click', () => GameManager.adjustBet(1));
        document.getElementById('doubleBetBtn').addEventListener('click', () => GameManager.adjustBet(2));
        playButton.addEventListener('click', GameManager.requestBet);
    }
    return {
        updateBalance,
        updatePlayerName,
        updateBet,
        setPlayButtonState,
        showLastResult,
        showFloatingText,
        initEventListeners
    };
})();
// --- Módulo del Juego ---
const GameManager = (() => {
    const canvas = document.getElementById('plinkoCanvas');
    const ctx = canvas.getContext('2d');
    let balance = 0;
    let currentBet = 10;
    let isAnimating = false;
    let animationFrameId = null;
    const rows = 14;
    const gravity = 0.25;
    const multipliers = [1000, 100, 10, 5, 2, 1, 0.5, 0.2, 0.5, 1, 2, 5, 10, 100, 1000];
    let pins = [];
    let balls = [];
    let particles = [];
    let slots = [];
    // --- Clases del Juego ---
    class Pin {
        constructor(x, y, r) {
            this.x = x;
            this.y = y;
            this.r = r;
            this.glow = 0;
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 215, 0, ${1 + this.glow}`;
            ctx.fill();
            if (this.glow > 0) {
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#ffffff';
                ctx.fill();
                ctx.shadowBlur = 0;
                this.glow *= 0.9;
            } else {
                ctx.fillStyle = '#b8860b';
                ctx.fill();
            }
            ctx.closePath();
        }
    }
    class Slot {
        constructor(x, y, w, h, val) {
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
            this.val = val;
            this.color = getColorForMultiplier(val);
            this.active = 0;
        }
        draw() {
            ctx.fillStyle = this.active > 0 ? '#ffffff' : 'rgba(20, 20, 30, 0.5)';
            if (this.active > 0) this.active--;
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.color;
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(this.x, this.y, this.w, this.h, 5);
            ctx.stroke();
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff';
            let fontSize = this.val >= 100 ? this.w * 0.25 : this.w * 0.35;
            ctx.font = `bold ${fontSize}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let displayText = `${this.val}x`;
            ctx.fillText(displayText, this.x + this.w / 2, this.y + this.h / 2);
            if (this.val < 1) {
                ctx.font = `bold ${this.w * 0.15}px Arial`;
                ctx.fillStyle = '#ff4444';
                ctx.fillText('PÉRDIDA', this.x + this.w / 2, this.y + this.h - 10);
            }
        }
    }
    class Particle {
        constructor(x, y, color) {
            this.x = x;
            this.y = y;
            this.vx = (Math.random() - 0.5) * 6;
            this.vy = (Math.random() - 0.5) * 6;
            this.life = 1.0;
            this.color = color;
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.life -= 0.03;
        }
        draw() {
            ctx.globalAlpha = this.life;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }
    class Ball {
        constructor(x, y, path, result) {
            this.x = x;
            this.y = y;
            this.r = 7;
            this.vx = 0;
            this.vy = 0;
            this.active = true;
            this.path = path;
            this.pathIndex = 0;
            this.result = result;
            this.color = '#ff007a';
        }
        update() {
            if (!this.active) return;
            this.vy += gravity;
            this.x += this.vx;
            this.y += this.vy;
            for (let p of pins) {
                let dx = this.x - p.x;
                let dy = this.y - p.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < this.r + p.r) {
                    if (this.pathIndex < this.path.length) {
                        const direction = this.path[this.pathIndex];
                        const forceX = direction === 0 ? -2 : 2;
                        this.vx = forceX + (Math.random() - 0.5) * 0.5;
                        this.vy = -2;
                        const angle = Math.atan2(dy, dx);
                        this.x = p.x + Math.cos(angle) * (this.r + p.r + 1);
                        this.y = p.y + Math.sin(angle) * (this.r + p.r + 1);
                        this.pathIndex++;
                    } else {
                        let angle = Math.atan2(dy, dx);
                        this.vx = Math.cos(angle) * 3;
                        this.vy = Math.sin(angle) * 3;
                    }
                    p.glow = 1;
                    AudioManager.playSound('bounce');
                }
            }
            for (let s of slots) {
                if (this.y > s.y && this.x > s.x && this.x < s.x + s.w && this.active) {
                    this.finish(s);
                }
            }
            if (this.y > canvas.height + 50) this.active = false;
        }
        finish(slot) {
            this.active = false;
            slot.active = 10;
            const winAmount = this.result.payout;
            const netChange = winAmount - currentBet;
            
            balance = this.result.finalBalance;
            UIManager.updateBalance(balance);
            if (this.result.multiplier >= 1) {
                AudioManager.playSound('win');
            } else {
                AudioManager.playSound('loss');
            }
            createExplosion(this.x, this.y, slot.color);
            const isLoss = this.result.multiplier < 1;
            const textColor = isLoss ? '#ff4444' : '#00ff88';
            const sign = netChange >= 0 ? '+' : '';
            const resultText = isLoss ? 'PÉRDIDA' : 'GANANCIA';
            
            UIManager.showFloatingText(this.x, this.y - 30, `${resultText} ${sign}${Math.abs(netChange).toFixed(2)}`, textColor);
            UIManager.showLastResult(netChange, this.result.multiplier);
        }
        draw() {
            if (!this.active) return;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            let grad = ctx.createRadialGradient(this.x - 2, this.y - 2, 0, this.x, this.y, this.r);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.3, this.color);
            grad.addColorStop(1, '#990044');
            ctx.fillStyle = grad;
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.color;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.closePath();
        }
    }
    function getColorForMultiplier(val) {
        if (val >= 100) return '#ff0044';
        if (val >= 10) return '#ff007a';
        if (val >= 2) return '#ffaa00';
        if (val === 1) return '#00ff88';
        return '#ff4444';
    }
    function createExplosion(x, y, color) {
        for (let i = 0; i < 15; i++) {
            particles.push(new Particle(x, y, color));
        }
    }
    function resizeGame() {
        const container = document.getElementById('game-container');
        if (!container) return;
        
        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight - document.querySelector('.ui-panel').offsetHeight;
        initBoard();
    }
    function initBoard() {
        pins = [];
        slots = [];
        const padTop = 50;
        const padBottom = 80;
        const availableHeight = canvas.height - padTop - padBottom;
        
        let actualRows;
        if (canvas.width <= 400) {
            actualRows = 8;
        } else if (canvas.width <= 600) {
            actualRows = 12;
        } else {
            actualRows = rows;
        }
        
        const spacing = Math.min(availableHeight / actualRows, canvas.width / (actualRows + 2));
        const pinRadius = 3;
        for (let r = 0; r < actualRows; r++) {
            let cols = r + 3;
            let rowWidth = (cols - 1) * spacing;
            let startX = (canvas.width - rowWidth) / 2;
            for (let c = 0; c < cols; c++) {
                let px = startX + c * spacing;
                let py = padTop + r * spacing;
                pins.push(new Pin(px, py, pinRadius));
            }
        }
        let totalSlots = actualRows + 1;
        let bottomRowWidth = totalSlots * spacing;
        let startSlotX = (canvas.width - bottomRowWidth) / 2;
        let slotY = padTop + actualRows * spacing + 10;
        for (let i = 0; i < totalSlots; i++) {
            let val = multipliers[i] !== undefined ? multipliers[i] : 1;
            let sx = startSlotX + i * spacing;
            slots.push(new Slot(sx, slotY, spacing - 4, 40, val));
        }
    }
    function drawBoard() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        slots.forEach(s => s.draw());
        pins.forEach(p => p.draw());
    }
    function animate() {
        if (!isAnimating && balls.length === 0 && particles.length === 0) return;
        
        drawBoard();
        for (let i = balls.length - 1; i >= 0; i--) {
            balls[i].update();
            balls[i].draw();
            if (!balls[i].active) balls.splice(i, 1);
        }
        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update();
            particles[i].draw();
            if (particles[i].life <= 0) particles.splice(i, 1);
        }
        animationFrameId = requestAnimationFrame(animate);
    }
    function startContinuousRender() {
        function render() {
            if (balls.length === 0 && particles.length === 0) {
                drawBoard();
            }
            requestAnimationFrame(render);
        }
        render();
    }
    function adjustBet(factor) {
        AudioManager.playSound('click');
        if (factor === 1) {
            currentBet += 1;
        } else if (factor === -1) {
            if (currentBet > 1) currentBet -= 1;
        } else if (factor === 2) {
            currentBet *= 2;
        } else if (factor === 0.5) {
            currentBet = Math.max(1, Math.floor(currentBet / 2));
        }
        UIManager.updateBet(currentBet);
    }
    function requestBet() {
        if (balance < currentBet) {
            alert(`Saldo insuficiente para apostar Bs${currentBet.toFixed(2)}`);
            return;
        }
        
        AudioManager.playSound('click');
        socket.emit('placeBet', { betAmount: currentBet });
    }

    function dropBall(result) {
        balance -= currentBet;
        UIManager.updateBalance(balance);
        
        let startX = canvas.width / 2 + (Math.random() - 0.5) * 4;
        balls.push(new Ball(startX, 20, result.path, result));
        
        if (!isAnimating) {
            isAnimating = true;
            animate();
        }
    }

    function setupSocket() {
        const joinGame = () => {
            console.log('Conectado a Plinko - Enviando joinPlinko');
            socket.emit('joinPlinko');
        };

        if (socket.connected) {
            console.log('Socket ya conectado');
            joinGame();
        }

        socket.on('connect', () => {
            console.log('Socket conectado (evento)');
            joinGame();
        });

        socket.on('plinkoInit', (data) => {
            balance = data.balance;
            UIManager.updateBalance(balance);
            UIManager.updatePlayerName(data.username);
        });
        socket.on('plinkoResult', (result) => {
            dropBall(result);
        });
        socket.on('plinkoError', (err) => {
            alert("Error: " + err.message);
            UIManager.setPlayButtonState(true);
        });
    }

    function init() {
        AudioManager.init();
        UIManager.initEventListeners();
        setupSocket();
        resizeGame();
        window.addEventListener('resize', resizeGame);
        
        startContinuousRender();
    }

    return {
        init,
        adjustBet,
        requestBet,
        get currentBet() { return currentBet; },
        get balance() { return balance; }
    };
})();
document.addEventListener('DOMContentLoaded', () => {
    GameManager.init();
});