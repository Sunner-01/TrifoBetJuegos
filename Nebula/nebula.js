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
/* --- AUDIO SYSTEM --- */
class AudioSystem {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.3;
        this.master.connect(this.ctx.destination);
        this.engineOsc = null;
        this.engineLow = null;
        this.engineGain = null;
    }
    resume() {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => { });
    }
    startEngine() {
        this.resume();
        if (this.engineOsc) return;
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 100;
        this.engineLow = this.ctx.createOscillator();
        this.engineLow.type = 'sine';
        this.engineLow.frequency.value = 50;
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 600;
        this.engineOsc.connect(filter);
        this.engineLow.connect(filter);
        filter.connect(this.engineGain);
        this.engineGain.connect(this.master);
        this.engineOsc.start();
        this.engineLow.start();
        this.engineGain.gain.linearRampToValueAtTime(0.4, this.ctx.currentTime + 1);
    }
    updatePitch(mult) {
        if (!this.engineOsc) return;
        const now = this.ctx.currentTime;
        const pitch = 100 + (Math.log2(Math.max(1, mult)) * 180);
        this.engineOsc.frequency.setTargetAtTime(pitch, now, 0.1);
        this.engineLow.frequency.setTargetAtTime(50 + (mult * 8), now, 0.1);
    }
    stopEngine(crashed) {
        if (this.engineOsc) {
            try {
                const now = this.ctx.currentTime;
                this.engineGain.gain.cancelScheduledValues(now);
                this.engineGain.gain.linearRampToValueAtTime(0, now + 0.2);
                this.engineOsc.stop(now + 0.2);
                this.engineLow.stop(now + 0.2);
            } catch (e) { }
            this.engineOsc = null;
        }
        if (crashed) this.playCrash();
    }
    playCrash() {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(60, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.6);
    }
    playWin() {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(1200, this.ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }
}
/* --- RENDER SYSTEM --- */
class Renderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.width = 100;
        this.height = 100;
        this.scale = 1;
        this.stars = [];
        this.planets = [];
        this.nebulaClouds = [];
        this.particles = [];
        this.shipY = 0;
        this.shipImg = document.getElementById('shipImage');
        if (this.shipImg) {
            this.shipImg.onload = () => console.log("Nave cargada");
            this.shipImg.onerror = () => console.log("Error nave.png");
        }
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.initWorld();
    }
    resize() {
        this.scale = window.devicePixelRatio || 1;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width * this.scale;
        this.canvas.height = this.height * this.scale;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(this.scale, this.scale);
        if (this.shipY === 0) this.shipY = this.height - 100;
    }
    initWorld() {
        for (let i = 0; i < 150; i++) {
            this.stars.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                size: Math.random() * 1.5 + 0.5,
                alpha: Math.random() * 0.8 + 0.2,
                layer: Math.floor(Math.random() * 3) + 1
            });
        }
        for (let i = 0; i < 4; i++) {
            this.nebulaClouds.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                r: 200 + Math.random() * 300,
                color: i % 2 === 0 ? 'rgba(100, 0, 255, 0.05)' : 'rgba(0, 200, 255, 0.05)'
            });
        }
        const colors = [
            { main: '#cc5500', hasRing: true },
            { main: '#4466aa', hasRing: false },
            { main: '#88aa88', hasRing: false }
        ];
        for (let i = 0; i < 3; i++) {
            this.planets.push({
                x: Math.random() * this.width,
                y: Math.random() * (this.height * 0.6),
                r: 30 + Math.random() * 40,
                color: colors[i % colors.length],
                speed: 0.5 + Math.random() * 0.5
            });
        }
    }
    drawBackground() {
        const grad = this.ctx.createLinearGradient(0, 0, 0, this.height);
        grad.addColorStop(0, '#020205');
        grad.addColorStop(1, '#0a0a1a');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.nebulaClouds.forEach(c => {
            const g = this.ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
            g.addColorStop(0, c.color);
            g.addColorStop(1, 'transparent');
            this.ctx.fillStyle = g;
            this.ctx.beginPath();
            this.ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }
    drawStars(speedFactor) {
        this.ctx.fillStyle = '#fff';
        this.stars.forEach(s => {
            s.x -= s.layer * 0.5 * speedFactor;
            if (s.x < 0) s.x = this.width;
            if (s.y > this.height) s.y = Math.random() * this.height;
            this.ctx.globalAlpha = s.alpha;
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1;
    }
    drawPlanets(speedFactor) {
        this.planets.forEach(p => {
            p.x -= p.speed * speedFactor;
            if (p.x < -100) {
                p.x = this.width + 100 + Math.random() * 200;
                p.y = Math.random() * (this.height * 0.6);
            }
            const grad = this.ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.1, p.x, p.y, p.r);
            grad.addColorStop(0, p.color.main);
            grad.addColorStop(1, 'black');
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            this.ctx.fill();
            if (p.color.hasRing) {
                this.ctx.save();
                this.ctx.translate(p.x, p.y);
                this.ctx.rotate(-0.4);
                this.ctx.scale(1, 0.3);
                this.ctx.beginPath();
                this.ctx.arc(0, 0, p.r * 1.8, 0, Math.PI * 2);
                this.ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                this.ctx.lineWidth = 3;
                this.ctx.stroke();
                this.ctx.restore();
            }
        });
    }
    drawShip(x, y, isRunning) {
        if (!this.shipImg || !this.shipImg.complete || this.shipImg.naturalWidth === 0) {
            this.drawBackupShip(x, y, isRunning);
            return;
        }
        this.ctx.save();
        this.ctx.translate(x, y);
        const scale = this.width < 500 ? 0.6 : 0.9;
        const w = 180 * scale;
        const h = 100 * scale;
        if (isRunning) {
            const shakeX = (Math.random() - 0.5) * 5;
            const shakeY = (Math.random() - 0.5) * 3;
            this.ctx.translate(shakeX, shakeY);
            for (let i = 0; i < 4; i++) {
                this.particles.push({
                    x: x - w / 2 + 30,
                    y: y + (Math.random() * 20 - 10),
                    vx: -10 - Math.random() * 8,
                    vy: (Math.random() - 0.5) * 4,
                    life: 0.7 + Math.random() * 0.5,
                    color: Math.random() > 0.4 ? '#00ffff' : '#00aaff'
                });
            }
        } else {
            this.ctx.translate(0, Math.sin(Date.now() / 400) * 6);
        }
        this.ctx.drawImage(this.shipImg, -w / 2, -h / 2, w, h);
        if (isRunning) {
            this.ctx.globalAlpha = 0.4 + Math.random() * 0.3;
            this.ctx.shadowBlur = 40;
            this.ctx.shadowColor = '#00ffff';
            this.ctx.drawImage(this.shipImg, -w / 2, -h / 2, w, h);
            this.ctx.globalAlpha = 1;
            this.ctx.shadowBlur = 0;
        }
        this.ctx.restore();
    }
    drawBackupShip(x, y, isRunning) {
        this.ctx.save();
        this.ctx.translate(x, y);
        const scale = this.width < 500 ? 0.7 : 1;
        this.ctx.scale(scale, scale);
        if (isRunning) {
            this.ctx.translate((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
            this.ctx.rotate(-0.1);
            for (let i = 0; i < 2; i++) {
                this.particles.push({
                    x: x - 30 * scale,
                    y: y + (Math.random() * 10 - 5),
                    vx: -5 - Math.random() * 5,
                    vy: (Math.random() - 0.5),
                    life: 1,
                    color: Math.random() > 0.5 ? '#00ffff' : '#fff'
                });
            }
        } else {
            this.ctx.translate(0, Math.sin(Date.now() / 500) * 5);
        }
        this.ctx.fillStyle = '#333';
        this.ctx.beginPath();
        this.ctx.rect(-30, -10, 10, 20);
        this.ctx.fill();
        if (isRunning) {
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = '#00f0ff';
        }
        this.ctx.fillStyle = isRunning ? '#fff' : '#444';
        this.ctx.beginPath();
        this.ctx.arc(-30, 0, 5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        const grad = this.ctx.createLinearGradient(-20, 0, 40, 0);
        grad.addColorStop(0, '#222');
        grad.addColorStop(0.5, '#778899');
        grad.addColorStop(1, '#222');
        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.moveTo(-25, -12);
        this.ctx.lineTo(20, -8);
        this.ctx.lineTo(45, 0);
        this.ctx.lineTo(20, 8);
        this.ctx.lineTo(-25, 12);
        this.ctx.fill();
        this.ctx.fillStyle = 'rgba(0, 200, 255, 0.8)';
        this.ctx.beginPath();
        this.ctx.moveTo(0, -5);
        this.ctx.lineTo(20, -3);
        this.ctx.lineTo(20, 3);
        this.ctx.lineTo(0, 5);
        this.ctx.fill();
        this.ctx.restore();
    }
    render(state, progress) {
        if (!this.width || !this.height) return;
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.drawBackground();
        let speed = 0.5;
        if (state === 'RUNNING') speed = 4 + (progress * 5);
        if (state === 'CRASHED') speed = 0;
        this.drawStars(speed);
        this.drawPlanets(speed * 0.2);
        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.globalAlpha = 1;
        let startY = this.height - (this.height * 0.25);
        let targetY = startY;
        if (state === 'RUNNING') {
            const ceiling = this.height * 0.25;
            targetY = startY - (progress * (startY - ceiling));
        }
        this.shipY += (targetY - this.shipY) * 0.1;
        if (state !== 'CRASHED') {
            const shipX = this.width < 500 ? this.width * 0.5 : this.width * 0.3;
            this.drawShip(shipX, this.shipY, state === 'RUNNING');
        }
    }
}
/* --- GAME LOGIC --- */
class CrashGame {
    constructor() {
        this.balance = 0;
        this.bet = 2.00;
        this.activeBet = 0;
        this.state = 'IDLE';
        this.multiplier = 1.00;
        this.cashedOut = false;
        this.ui = {
            mult: document.getElementById('multDisplay'),
            status: document.getElementById('statusDisplay'),
            bal: document.getElementById('playerBalance'),
            balInput: document.getElementById('balanceDisplay'),
            input: document.getElementById('betInput'),
            btn: document.getElementById('mainBtn'),
            title: document.querySelector('.btn-title'),
            sub: document.querySelector('.btn-sub'),
            hist: document.getElementById('historyStrip'),
            playerName: document.getElementById('playerName')
        };
        this.audio = new AudioSystem();
        this.renderer = new Renderer('spaceCanvas');
        this.setupSocket();
        this.init();
    }
    setupSocket() {
        // 🔧 FIX: Función helper para unirse al juego
        const joinGame = () => {
            console.log('Conectado a Nebula Seguro - Enviando joinNebulaGame');
            socket.emit('joinNebulaGame');
        };
        // 🔧 FIX: Emitir inmediatamente si ya está conectado
        if (socket.connected) {
            console.log('Socket ya conectado, uniéndose inmediatamente');
            joinGame();
        }
        // 🔧 FIX: También emitir cuando se conecte (para conexiones lentas)
        socket.on('connect', () => {
            console.log('Socket conectado (evento)');
            joinGame();
        });
        socket.on('nebulaGameState', (state) => {
            this.balance = state.balance;
            this.ui.playerName.innerText = state.username;
            this.updateBalanceUI();
        });
        socket.on('nebulaBetAccepted', (data) => {
            if (data.success) {
                this.balance = data.newBalance;
                this.updateBalanceUI();
                this.activeBet = this.bet;
                this.setBtn('CANCEL');
                this.ui.status.innerText = 'Apuesta Confirmada';
            }
        });
        socket.on('nebulaBetCancelled', (data) => {
            if (data.success) {
                this.balance = data.newBalance;
                this.updateBalanceUI();
                this.activeBet = 0;
                this.setBtn('BET');
                this.ui.status.innerText = 'Apuesta Cancelada';
            }
        });
        socket.on('nebulaGameStarted', (data) => {
            this.startGameAnimation();
        });
        socket.on('nebulaGameCrashed', (data) => {
            this.crash(data.crashPoint);
        });
        socket.on('nebulaCashoutSuccess', (data) => {
            this.balance = data.newBalance;
            this.updateBalanceUI();
            
            this.ui.status.innerText = `¡Retiro en ${this.multiplier.toFixed(2)}x! Ganaste Bs ${data.winnings.toFixed(2)}`;
            this.ui.status.classList.add('active');
        });
        socket.on('nebulaError', (err) => {
            if (this.cashedOut && err.message.includes('Crash')) {
                // Ya estaba crasheado, el servidor nos avisa que llegamos tarde
            } else {
                alert("Error: " + err.message);
            }
        });
    }
    updateBalanceUI() {
        const txt = 'Bs ' + this.balance.toLocaleString('en-US', { minimumFractionDigits: 2 });
        this.ui.bal.innerText = txt;
        this.ui.balInput.innerText = txt;
    }
    init() {
        document.getElementById('mainBtn').addEventListener('click', () => this.handleBtn());
        this.enterIdle();
        this.loop();
    }
    handleBetInput(event) {
        let newValue = parseFloat(event.target.value);
        if (isNaN(newValue) || newValue < 1.00) newValue = 1.00;
        this.bet = parseFloat(newValue.toFixed(2));
    }
    
    modBet(val) {
        let v = this.bet;
        if (val === 0.5) v = Math.max(1, v / 2);
        else if (val === 2) v = v * 2;
        else v = Math.max(1, v + val);
        this.bet = parseFloat(v.toFixed(2));
        this.ui.input.value = this.bet.toFixed(2);
    }
    setBtn(state) {
        const btn = this.ui.btn;
        btn.className = 'launch-btn';
        btn.disabled = false;
        btn.style.filter = '';
        
        if (state === 'BET') {
            btn.classList.add('btn-bet');
            this.ui.title.innerText = 'APOSTAR';
            this.ui.sub.innerText = 'Próxima Ronda';
            this.ui.input.disabled = false;
        } else if (state === 'CANCEL') {
            btn.classList.add('btn-cancel');
            this.ui.title.innerText = 'CANCELAR';
            this.ui.sub.innerText = `Bs ${this.activeBet.toFixed(2)}`;
            this.ui.input.disabled = true;
        } else if (state === 'CASHOUT') {
            btn.classList.add('btn-cashout');
            this.ui.input.disabled = true;
        } else if (state === 'WAIT') {
            btn.classList.add('btn-wait');
            btn.disabled = true;
            this.ui.title.innerText = 'EN CURSO';
            this.ui.sub.innerText = 'Esperando...';
            this.ui.input.disabled = true;
        } else if (state === 'WON') {
            btn.classList.add('btn-cashout');
            btn.disabled = true;
            btn.style.filter = 'grayscale(0.5)';
            this.ui.title.innerText = 'GANADO';
            this.ui.sub.innerText = 'Bien hecho';
            this.ui.input.disabled = false;
        }
    }
    handleBtn() {
        this.audio.resume();
        if (this.state === 'IDLE') {
            if (this.activeBet === 0) {
                if (this.bet > this.balance) { alert("Saldo insuficiente"); return; }
                socket.emit('placeNebulaBet', { amount: this.bet });
            } else {
                socket.emit('cancelNebulaBet');
            }
        } else if (this.state === 'RUNNING') {
            if (this.activeBet > 0 && !this.cashedOut) {
                this.doCashout();
            }
        }
    }
    doCashout() {
        this.cashedOut = true;
        this.audio.playWin();
        this.setBtn('WON');
        
        const estimatedWin = this.activeBet * this.multiplier;
        this.ui.status.innerText = `Retirando... Ganancia: Bs ${estimatedWin.toFixed(2)}`;
        this.ui.status.classList.add('active');
        socket.emit('cashoutNebula', { multiplier: this.multiplier });
    }
    addHistory(val) {
        const el = document.createElement('div');
        el.className = 'pill';
        el.innerText = val.toFixed(2) + 'x';
        if (val < 2.0) el.classList.add('lose');
        else if (val > 10) el.classList.add('jackpot');
        else el.classList.add('win');
        this.ui.hist.prepend(el);
        if (this.ui.hist.children.length > 15) this.ui.hist.lastChild.remove();
    }
    enterIdle() {
        this.state = 'IDLE';
        this.multiplier = 1.00;
        this.cashedOut = false;
        this.ui.mult.innerText = '1.00x';
        this.ui.mult.classList.remove('crashed');
        this.ui.status.classList.add('active');
        this.ui.status.style.color = 'var(--hud-cyan)';
        this.activeBet = 0;
        this.setBtn('BET');
        let count = 5.0;
        const intervalTime = 100;
        this.ui.status.innerText = `Lanzamiento en ${count.toFixed(1)}s`;
        const timer = setInterval(() => {
            if (this.state !== 'IDLE') { clearInterval(timer); return; }
            count -= 0.1;
            if (count > 0.1) {
                this.ui.status.innerText = `Lanzamiento en ${count.toFixed(1)}s`;
            } else {
                this.ui.status.innerText = `¡LANZAMIENTO!`;
                clearInterval(timer);
                socket.emit('startNebulaGame');
            }
        }, intervalTime);
    }
    startGameAnimation() {
        this.state = 'RUNNING';
        this.startTime = Date.now();
        this.ui.status.classList.remove('active');
        this.audio.startEngine();
        if (this.activeBet > 0) this.setBtn('CASHOUT');
        else this.setBtn('WAIT');
    }
    crash(finalValue) {
        this.state = 'CRASHED';
        this.audio.stopEngine(true);
        
        this.multiplier = finalValue;
        this.ui.mult.innerText = this.multiplier.toFixed(2) + 'x';
        
        this.ui.mult.classList.add('crashed');
        this.ui.status.innerText = 'CRASHED';
        this.ui.status.classList.add('active');
        this.ui.status.style.color = 'var(--hud-red)';
        const shipX = this.renderer.width < 500 ? this.renderer.width * 0.5 : this.renderer.width * 0.3;
        for (let i = 0; i < 30; i++) {
            this.renderer.particles.push({
                x: shipX,
                y: this.renderer.shipY,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1.2,
                color: Math.random() > 0.5 ? '#ff0000' : '#ffaa00'
            });
        }
        this.addHistory(this.multiplier);
        this.setBtn('WAIT');
        setTimeout(() => this.enterIdle(), 4000);
    }
    loop() {
        requestAnimationFrame(() => this.loop());
        let progress = 0;
        if (this.state === 'RUNNING') {
            const t = (Date.now() - this.startTime) / 1000;
            this.multiplier = Math.pow(Math.E, 0.096 * t); 
            
            progress = Math.min(1, (this.multiplier - 1) / 8);
            this.ui.mult.innerText = this.multiplier.toFixed(2) + 'x';
            this.audio.updatePitch(this.multiplier);
            if (this.activeBet > 0 && !this.cashedOut) {
                const w = (this.activeBet * this.multiplier);
                this.ui.title.innerText = 'RETIRAR';
                this.ui.sub.innerText = `Bs ${w.toFixed(2)}`;
                this.ui.status.innerText = `Ganancia: Bs ${w.toFixed(2)}`;
                this.ui.status.style.color = 'var(--hud-gold)';
            } else if (this.activeBet === 0) {
                this.ui.status.innerText = 'Esperando Próxima Ronda';
            }
        }
        this.renderer.render(this.state, progress);
    }
}
window.onload = () => { window.game = new CrashGame(); };