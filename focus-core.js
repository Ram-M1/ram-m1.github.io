/* FOCUS — общее ядро логики (FocusCore)
   Подключать на каждом экране после focus-storage.js:
   <script src="focus-storage.js"></script>
   <script src="focus-core.js"></script>

   Содержит:
   - применение сохранённой темы при загрузке страницы
   - универсальную систему искр (логотип / кристалл Оракула / что угодно)
   - единый атмосферный движок (Tron / Predator / Mortal Kombat / Matrix / Original)
   - временную панель переключения тем для тестирования (легко убрать одной строкой)

   Чинишь баг или добавляешь эффект — один раз здесь, работает на всех экранах.
*/

const FocusCore = {

    // ========== УТИЛИТЫ ФОРМАТИРОВАНИЯ ==========
    // Единое место для форматов — чтобы каждый экран не изобретал своё.

    /** Русское склонение: FocusCore.plural(5, 'день','дня','дней') → 'дней' */
    plural(n, one, few, many) {
        const mod10 = n % 10, mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return one;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
        return many;
    },

    /** "5 дней", "1 день", "3 дня" */
    daysText(n) {
        return n + ' ' + this.plural(n, 'день', 'дня', 'дней');
    },

    /** Формат монет с разделителем тысяч: 12500 → "12 500" */
    formatCoins(n) {
        return (n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    },

    /** Дата окончания подписки в читаемом виде: "до 25 июля" */
    formatDateShort(isoString) {
        if (!isoString) return '';
        const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
        const d = new Date(isoString);
        return 'до ' + d.getDate() + ' ' + months[d.getMonth()];
    },

    /** Крутая анимация F-coin: вращающиеся золотые монеты вылетают фонтаном
     *  из центра экрана и летят к балансу. Универсально для всех экранов.
     *  Использование: FocusCore.coinBurst({ amount: 100, reason: 'Пополнение' });
     *  targetSelector — куда летят монеты (по умолчанию верх экрана). */
    coinBurst(config) {
        const amount = config.amount || 0;
        const reason = config.reason || '';
        const count = Math.min(Math.max(Math.round(amount), 8), 24);

        const rootStyle = getComputedStyle(document.documentElement);
        const accent = rootStyle.getPropertyValue('--accent').trim() || '#FFD966';
        const accentLight = rootStyle.getPropertyValue('--accent-light').trim() || '#FFE9A8';
        const accentDark = rootStyle.getPropertyValue('--accent-dark').trim() || '#C9952E';

        // Контейнер монет вкладываем В РАМКУ телефона (не в body),
        // чтобы анимация не вылетала за пределы экрана. overflow:hidden обрежет лишнее.
        const phone = document.querySelector('.phone') || document.body;
        const phoneRect = phone.getBoundingClientRect();
        const phoneW = phoneRect.width, phoneH = phoneRect.height;

        // Точка назначения — карточка баланса (координаты ОТНОСИТЕЛЬНО рамки телефона)
        let targetX = phoneW / 2, targetY = 70;
        const target = document.querySelector(config.targetSelector || '.balance-value, .balance-coins, .balance-block');
        if (target) {
            const r = target.getBoundingClientRect();
            targetX = r.left - phoneRect.left + r.width / 2;
            targetY = r.top - phoneRect.top + r.height / 2;
        }

        const startX = phoneW / 2;
        const startY = phoneH / 2;
        let originX = startX, originY = startY;
        // Если передан элемент-источник (кнопка) — монеты вылетают из него
        if (config.sourceEl) {
            const sr = config.sourceEl.getBoundingClientRect();
            originX = sr.left - phoneRect.left + sr.width / 2;
            originY = sr.top - phoneRect.top + sr.height / 2;
        }

        // Контейнер для монет — absolute внутри .phone, обрезается рамкой
        const layer = document.createElement('div');
        layer.style.cssText = 'position:absolute; inset:0; z-index:2000; pointer-events:none; overflow:hidden; border-radius:52px;';
        phone.appendChild(layer);

        // SVG-монета с буквой F (data-uri, окрашенная под тему)
        function coinSVG(rot) {
            return `<svg width="34" height="34" viewBox="0 0 40 40" style="transform:scaleX(${rot});">
                <defs>
                    <radialGradient id="cg" cx="38%" cy="32%" r="70%">
                        <stop offset="0%" stop-color="${accentLight}"/>
                        <stop offset="55%" stop-color="${accent}"/>
                        <stop offset="100%" stop-color="${accentDark}"/>
                    </radialGradient>
                </defs>
                <circle cx="20" cy="20" r="18" fill="url(#cg)" stroke="${accentDark}" stroke-width="1.5"/>
                <circle cx="20" cy="20" r="14" fill="none" stroke="${accentDark}" stroke-width="1" opacity="0.5"/>
                <path d="M15 12h10M15 12v16M15 20h7" stroke="${accentDark}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            </svg>`;
        }

        const coins = [];
        for (let i = 0; i < count; i++) {
            const el = document.createElement('div');
            el.style.cssText = `position:absolute; left:${originX}px; top:${originY}px; will-change:transform,opacity; filter:drop-shadow(0 0 6px rgba(255,200,80,0.6));`;
            el.innerHTML = coinSVG(1);
            layer.appendChild(el);
            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
            const power = 7 + Math.random() * 7;
            coins.push({
                el,
                x: 0, y: 0,
                vx: Math.cos(angle) * power,
                vy: Math.sin(angle) * power - 9,   // подброс вверх
                rot: Math.random() * 360,
                vrot: (Math.random() - 0.5) * 40,
                phase: 'burst',
                delay: Math.random() * 6,
                life: 0
            });
        }

        // Всплывающая надпись "+N F-coins" — тоже внутри рамки телефона
        const note = document.createElement('div');
        note.style.cssText = `position:absolute; left:50%; top:38%; transform:translate(-50%,-50%) scale(0.6); z-index:2001;
            background:rgba(0,0,0,0.88); border:1.5px solid ${accent}; border-radius:22px; padding:12px 26px;
            color:${accent}; font-weight:800; font-size:17px; text-align:center; pointer-events:none;
            box-shadow:0 0 30px rgba(255,200,80,0.4); opacity:0; transition:all 0.4s cubic-bezier(.2,1.4,.4,1); font-family:inherit; white-space:nowrap;`;
        note.innerHTML = `+${this.formatCoins(amount)} F-coins` + (reason ? `<br><span style="font-size:11px;font-weight:600;opacity:0.85;">${reason}</span>` : '');
        layer.appendChild(note);
        requestAnimationFrame(() => { note.style.opacity = '1'; note.style.transform = 'translate(-50%,-50%) scale(1)'; });

        try {
            const actx = new (window.AudioContext || window.webkitAudioContext)();
            [880, 1100, 1320].forEach((freq, i) => {
                const osc = actx.createOscillator(), g = actx.createGain();
                osc.connect(g); g.connect(actx.destination);
                osc.frequency.value = freq; osc.type = 'triangle';
                g.gain.setValueAtTime(0.0001, actx.currentTime + i * 0.08);
                g.gain.exponentialRampToValueAtTime(0.12, actx.currentTime + i * 0.08 + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + i * 0.08 + 0.3);
                osc.start(actx.currentTime + i * 0.08);
                osc.stop(actx.currentTime + i * 0.08 + 0.3);
            });
        } catch (e) {}

        const gravity = 0.45;
        const floorY = phoneH - originY - 30;
        let frame = 0;

        const animate = () => {
            frame++;
            if (frame > 150) { layer.remove(); return; }
            let alive = false;
            coins.forEach((c) => {
                if (c.delay > 0) { c.delay--; alive = true; return; }
                c.life++;
                c.rot += c.vrot;

                if (c.phase === 'burst') {
                    c.vy += gravity;
                    c.x += c.vx;
                    c.y += c.vy;
                    if (c.y > floorY) { c.y = floorY; c.vy *= -0.5; c.vx *= 0.7; }
                    // через ~45 кадров — переход к полёту на баланс
                    if (c.life > 45) { c.phase = 'fly'; c.flyT = 0; c.sx = c.x; c.sy = c.y; }
                    alive = true;
                } else if (c.phase === 'fly') {
                    c.flyT += 0.045;
                    const t = c.flyT < 1 ? c.flyT : 1;
                    const ease = 1 - Math.pow(1 - t, 3);
                    const destX = targetX - originX;
                    const destY = targetY - originY;
                    c.x = c.sx + (destX - c.sx) * ease;
                    c.y = c.sy + (destY - c.sy) * ease;
                    const scale = 1 - t * 0.55;
                    c.el.style.opacity = t > 0.85 ? (1 - (t - 0.85) / 0.15) : 1;
                    c.el.firstChild.style.transform = `scaleX(${Math.cos(c.rot * Math.PI / 180)}) scale(${scale})`;
                    if (t >= 1) { c.el.remove(); c.done = true; }
                    else alive = true;
                }
                if (!c.done) {
                    c.el.style.transform = `translate(${c.x}px, ${c.y}px)`;
                    if (c.phase === 'burst') c.el.firstChild.style.transform = `scaleX(${Math.cos(c.rot * Math.PI / 180)})`;
                }
            });

            if (alive) requestAnimationFrame(animate);
            else layer.remove();
        };
        requestAnimationFrame(animate);

        // Страховка от зависания: гарантированно убрать слой через 2.5с
        setTimeout(() => { if (layer && layer.parentNode) layer.remove(); }, 2500);

        setTimeout(() => {
            note.style.opacity = '0';
            note.style.transform = 'translate(-50%,-90%) scale(0.85)';
            setTimeout(() => note.remove(), 400);
        }, 1500);
    },

    /**
     * Подбадривающая полноэкранная анимация за выполнение значимого действия.
     * Разлетается ОТ нажатой кнопки по всему экрану. Задорно, эффектно, ~1.4с.
     * Использование:
     *   FocusCore.celebrate({ fromEl: кнопка });   // салют от кнопки
     *   FocusCore.celebrate({ big: true });          // усиленный (за марафон/большое достижение)
     *   FocusCore.celebrate({ text: 'Своя фраза' }); // своя надпись
     */
    celebrate(config) {
        config = config || {};
        const phrases = ['Огонь','Красава','Так держать','Бомба','Мощь','Зверь','Вот это да','На кураже','Чемпион','Жара','Вперёд','Гордость','Сила','Ты машина','Респект','Красиво','Не остановить'];
        const emojis = ['🔥','💪','⚡','💥','🚀','🦁','🌟','😎','🏆','👑'];
        const text = config.text || phrases[Math.floor(Math.random() * phrases.length)];
        const emo = config.emoji || emojis[Math.floor(Math.random() * emojis.length)];
        const big = !!config.big;

        const accent = (getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()) || '#FFD966';
        const accent2 = (getComputedStyle(document.documentElement).getPropertyValue('--accent-2').trim()) || '#7C8CFF';
        const palette = [accent, accent2, '#FF6B5C', '#78DC96'];

        // точка старта — центр нажатой кнопки, иначе центр экрана
        let ox = window.innerWidth / 2, oy = window.innerHeight / 2;
        if (config.fromEl && config.fromEl.getBoundingClientRect) {
            const r = config.fromEl.getBoundingClientRect();
            ox = r.left + r.width / 2;
            oy = r.top + r.height / 2;
        }

        // полноэкранный оверлей ПОВЕРХ ВСЕГО
        const ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;overflow:hidden;';
        document.body.appendChild(ov);

        // кольцо-удар
        const ring = document.createElement('div');
        ring.style.cssText = `position:absolute;left:${ox}px;top:${oy}px;width:30px;height:30px;border-radius:50%;border:3px solid ${accent};transform:translate(-50%,-50%) scale(0);`;
        ov.appendChild(ring);
        ring.animate([
            { transform:'translate(-50%,-50%) scale(0)', opacity:1 },
            { transform:`translate(-50%,-50%) scale(${big?22:16})`, opacity:0 }
        ], { duration: 780, easing:'cubic-bezier(.15,.7,.4,1)' });

        // мягкая вспышка-волна
        const wave = document.createElement('div');
        wave.style.cssText = `position:absolute;left:${ox}px;top:${oy}px;width:50px;height:50px;border-radius:50%;background:radial-gradient(circle, ${accent}55, ${accent2}22 55%, transparent 70%);transform:translate(-50%,-50%) scale(0);`;
        ov.appendChild(wave);
        wave.animate([
            { transform:'translate(-50%,-50%) scale(0)', opacity:1 },
            { transform:`translate(-50%,-50%) scale(${big?30:22})`, opacity:0 }
        ], { duration: 880, easing:'cubic-bezier(.22,.61,.36,1)' });

        // частицы разлетаются от кнопки во все стороны
        const N = big ? 38 : 26;
        for (let i = 0; i < N; i++) {
            const p = document.createElement('div');
            const size = 7 + Math.random() * 10;
            const col = palette[Math.floor(Math.random() * palette.length)];
            const isStar = Math.random() > 0.5;
            p.style.cssText = `position:absolute;left:${ox}px;top:${oy}px;width:${size}px;height:${size}px;${isStar?'':'border-radius:50%;'}background:${col};box-shadow:0 0 10px ${col};`;
            if (isStar) p.style.clipPath = 'polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)';
            ov.appendChild(p);
            const ang = (i / N) * Math.PI * 2 + Math.random() * 0.5;
            const dist = (big ? 160 : 120) + Math.random() * (big ? 220 : 170);
            const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
            const rot = Math.random() * 540 - 270;
            p.animate([
                { transform:'translate(-50%,-50%) scale(0.3) rotate(0deg)', opacity:1 },
                { transform:`translate(calc(-50% + ${dx*0.55}px), calc(-50% + ${dy*0.55}px)) scale(1.15) rotate(${rot*0.5}deg)`, opacity:1, offset:0.45 },
                { transform:`translate(calc(-50% + ${dx}px), calc(-50% + ${dy+45}px)) scale(0.2) rotate(${rot}deg)`, opacity:0 }
            ], { duration: 1150 + Math.random() * 250, easing:'cubic-bezier(.16,.74,.44,1)' });
        }

        // эмодзи + фраза взлетают от кнопки вверх
        const wrap = document.createElement('div');
        wrap.style.cssText = `position:absolute;left:${ox}px;top:${oy}px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;white-space:nowrap;`;
        const em = document.createElement('div');
        em.innerText = emo; em.style.cssText = `font-size:${big?52:42}px;line-height:1;`;
        const tx = document.createElement('div');
        tx.innerText = text;
        tx.style.cssText = `font-family:-apple-system,system-ui,sans-serif;font-size:${big?38:32}px;font-weight:900;letter-spacing:1px;background:linear-gradient(135deg, ${accent}, #fff 55%, ${accent2});-webkit-background-clip:text;background-clip:text;color:transparent;`;
        wrap.appendChild(em); wrap.appendChild(tx);
        ov.appendChild(wrap);
        wrap.animate([
            { transform:'translate(-50%,-50%) scale(0.3)', opacity:0 },
            { transform:'translate(-50%,-120%) scale(1.12)', opacity:1, offset:0.32 },
            { transform:'translate(-50%,-160%) scale(1)', opacity:1, offset:0.72 },
            { transform:'translate(-50%,-200%) scale(1.04)', opacity:0 }
        ], { duration: big ? 1700 : 1450, easing:'cubic-bezier(.34,1.4,.64,1)' });

        if (navigator.vibrate) { try { navigator.vibrate(big ? [20,40,20] : 18); } catch(e){} }
        setTimeout(() => ov.remove(), big ? 1800 : 1500);
    },


    applyStoredTheme() {
        const theme = FocusStorage.getTheme();
        const root = document.getElementById('htmlRoot') || document.documentElement;
        root.setAttribute('data-theme', theme);
    },

    renderTempThemeSwitcher() {
        const themes = [
            { id: 'original', color: '#FFD966' },
            { id: 'tron', color: '#FF3B2E' },
            { id: 'predator', color: '#FF7A1A' },
            { id: 'mk', color: '#FF1A2E' },
            { id: 'matrix', color: '#00FF41' }
        ];
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed; top:30px; left:50%; transform:translateX(-200px); z-index:300; display:flex; gap:5px; background:rgba(0,0,0,0.6); padding:5px; border-radius:20px;';
        themes.forEach(t => {
            const dot = document.createElement('div');
            dot.style.cssText = `width:18px;height:18px;border-radius:50%;background:${t.color};cursor:pointer;border:1px solid #fff;`;
            dot.addEventListener('click', () => {
                document.getElementById('htmlRoot').setAttribute('data-theme', t.id);
                FocusStorage.setTheme(t.id);
            });
            wrap.appendChild(dot);
        });
        document.body.appendChild(wrap);
    },

    initParticleSystem(config) {
        const cosmicCanvas = document.getElementById(config.canvasId || 'cosmicCanvas');
        if (!cosmicCanvas) return;
        const ctx = cosmicCanvas.getContext('2d');
        cosmicCanvas.width = 375;
        cosmicCanvas.height = 700;

        let particles = [];
        let isLoopRunning = false;
        const states = config.triggers.map(t => ({ ...t, isSpawning: false, holdTimer: null, suppressTap: false }));

        function spawnFrom(el) {
            const r = el.getBoundingClientRect();
            const c = cosmicCanvas.getBoundingClientRect();
            const cx = r.left - c.left + r.width / 2;
            const cy = r.top - c.top + r.height / 2;
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 4;
            const rootStyle = getComputedStyle(document.documentElement);
            const colors = [
                rootStyle.getPropertyValue('--accent').trim(),
                rootStyle.getPropertyValue('--accent-light').trim(),
                '#FFFFFF',
                rootStyle.getPropertyValue('--accent-dark').trim()
            ];
            particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                life: 1, size: 1 + Math.random() * 2.5,
                color: colors[Math.floor(Math.random() * colors.length)]
            });
        }

        function loop() {
            ctx.clearRect(0, 0, cosmicCanvas.width, cosmicCanvas.height);
            let anySpawning = false;
            states.forEach(s => {
                if (s.isSpawning) { anySpawning = true; for (let i = 0; i < 4; i++) spawnFrom(s.el); }
            });
            particles.forEach(p => {
                p.x += p.vx; p.y += p.vy; p.life -= 0.012;
                ctx.globalAlpha = Math.max(p.life, 0);
                ctx.fillStyle = p.color;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 8; ctx.shadowColor = p.color;
            });
            ctx.globalAlpha = 1; ctx.shadowBlur = 0;
            particles = particles.filter(p => p.life > 0);
            if (anySpawning || particles.length > 0) {
                requestAnimationFrame(loop);
            } else {
                isLoopRunning = false;
                cosmicCanvas.classList.remove('show');
            }
        }
        function ensureLoop() {
            cosmicCanvas.classList.add('show');
            if (!isLoopRunning) { isLoopRunning = true; loop(); }
        }

        states.forEach(s => {
            if (!s.el) return;
            s.el.addEventListener('pointerdown', () => {
                s.holdTimer = setTimeout(() => {
                    s.isSpawning = true;
                    s.suppressTap = true;
                    if (s.shakeClass) s.el.classList.add('cosmic-active');
                    ensureLoop();
                }, 220);
            });
            const endHandler = () => {
                clearTimeout(s.holdTimer);
                if (s.isSpawning) {
                    s.isSpawning = false;
                    if (s.shakeClass) s.el.classList.remove('cosmic-active');
                    setTimeout(() => { s.suppressTap = false; }, 50);
                }
            };
            s.el.addEventListener('pointerup', endHandler);
            s.el.addEventListener('pointerleave', endHandler);
            s.el.addEventListener('pointercancel', endHandler);
            if (s.onTap) {
                s.el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (s.suppressTap) { s.suppressTap = false; return; }
                    s.onTap();
                });
            }
        });
    },

    initAtmosphere(canvasId) {
        const ac = document.getElementById(canvasId || 'atmosCanvas');
        if (!ac) return;
        const actx = ac.getContext('2d');
        ac.width = 375;
        ac.height = 700;

        let tronPulses = [], mkEmbers = [], mkDrips = [], mkFlash = 0, mkBolt = null, matrixDrops = null, matrixColumns = 0;
        let predatorRadarAngle = 0, predatorScanY = 0, predatorT = 0;
        let predatorBlips = [{ a: 1.2, r: 0.7 }, { a: 3.8, r: 0.5 }], predatorReticle = null;
        const matrixChars = 'アイウエオカキクケコサシスセソ0123456789ABCDEF'.split('');
        let lastTheme = null, lastTrigger = 0, washT = 0;

        function currentTheme() {
            const root = document.getElementById('htmlRoot') || document.documentElement;
            return root.getAttribute('data-theme') || 'original';
        }
        function cssColor(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
        function cssColorRgb(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

        function drawFullScreenWash() {
            washT += 0.008;
            const accRgb = cssColorRgb('--accent-rgb'), acc2Rgb = cssColorRgb('--accent-2-rgb');
            const x = ac.width * (0.5 + Math.sin(washT) * 0.5);
            const y = ac.height * (0.5 + Math.cos(washT * 0.7) * 0.5);
            const grad = actx.createRadialGradient(x, y, 0, ac.width / 2, ac.height / 2, Math.max(ac.width, ac.height) * 0.9);
            grad.addColorStop(0, 'rgba(' + accRgb + ',0.05)');
            grad.addColorStop(0.5, 'rgba(' + acc2Rgb + ',0.035)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            actx.fillStyle = grad;
            actx.fillRect(0, 0, ac.width, ac.height);
        }

        function drawTron() {
            if (Math.random() > 0.93) {
                const vertical = Math.random() > 0.5;
                tronPulses.push({
                    vertical, pos: Math.floor(Math.random() * (vertical ? ac.width : ac.height)),
                    t: -40, speed: 3 + Math.random() * 2,
                    color: Math.random() > 0.5 ? cssColor('--accent') : cssColor('--accent-2'), len: 60
                });
            }
            tronPulses.forEach(p => {
                p.t += p.speed;
                const grad = p.vertical
                    ? actx.createLinearGradient(p.pos, p.t - p.len, p.pos, p.t)
                    : actx.createLinearGradient(p.t - p.len, p.pos, p.t, p.pos);
                grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, p.color);
                actx.strokeStyle = grad; actx.lineWidth = 2; actx.shadowBlur = 8; actx.shadowColor = p.color;
                actx.beginPath();
                if (p.vertical) { actx.moveTo(p.pos, p.t - p.len); actx.lineTo(p.pos, p.t); }
                else { actx.moveTo(p.t - p.len, p.pos); actx.lineTo(p.t, p.pos); }
                actx.stroke();
            });
            actx.shadowBlur = 0;
            tronPulses = tronPulses.filter(p => p.t < Math.max(ac.width, ac.height) + 40);
        }

        function drawPredator() {
            predatorT += 0.01;
            for (let i = 0; i < 5; i++) {
                const x = ac.width / 2 + Math.sin(predatorT + i * 2) * ac.width * 0.35;
                const y = ac.height / 2 + Math.cos(predatorT * 0.7 + i * 1.7) * ac.height * 0.4;
                const r = 60 + Math.sin(predatorT * 2 + i) * 20;
                const grad = actx.createRadialGradient(x, y, 0, x, y, r);
                grad.addColorStop(0, 'rgba(' + cssColorRgb('--accent-rgb') + ',0.05)');
                grad.addColorStop(1, 'rgba(' + cssColorRgb('--accent-rgb') + ',0)');
                actx.fillStyle = grad;
                actx.fillRect(0, 0, ac.width, ac.height);
            }
            predatorScanY += 1.8;
            if (predatorScanY > ac.height + 20) predatorScanY = -20;
            const acc2 = cssColorRgb('--accent-2-rgb');
            const lineGrad = actx.createLinearGradient(0, predatorScanY - 15, 0, predatorScanY + 15);
            lineGrad.addColorStop(0, 'rgba(' + acc2 + ',0)');
            lineGrad.addColorStop(0.5, 'rgba(' + acc2 + ',0.35)');
            lineGrad.addColorStop(1, 'rgba(' + acc2 + ',0)');
            actx.fillStyle = lineGrad;
            actx.fillRect(0, predatorScanY - 15, ac.width, 30);
            actx.strokeStyle = 'rgba(' + acc2 + ',0.5)'; actx.lineWidth = 1;
            actx.beginPath(); actx.moveTo(0, predatorScanY); actx.lineTo(ac.width, predatorScanY); actx.stroke();

            const rcx = ac.width - 46, rcy = 64, rr = 34;
            actx.save();
            actx.strokeStyle = 'rgba(' + acc2 + ',0.4)'; actx.lineWidth = 1;
            actx.beginPath(); actx.arc(rcx, rcy, rr, 0, Math.PI * 2); actx.stroke();
            actx.beginPath(); actx.arc(rcx, rcy, rr * 0.6, 0, Math.PI * 2); actx.stroke();
            actx.beginPath(); actx.moveTo(rcx - rr, rcy); actx.lineTo(rcx + rr, rcy); actx.stroke();
            actx.beginPath(); actx.moveTo(rcx, rcy - rr); actx.lineTo(rcx, rcy + rr); actx.stroke();
            predatorRadarAngle += 0.05;
            const sweepGrad = actx.createLinearGradient(rcx, rcy, rcx + Math.cos(predatorRadarAngle) * rr, rcy + Math.sin(predatorRadarAngle) * rr);
            sweepGrad.addColorStop(0, 'rgba(' + acc2 + ',0.6)');
            sweepGrad.addColorStop(1, 'rgba(' + acc2 + ',0)');
            actx.strokeStyle = sweepGrad; actx.lineWidth = 2;
            actx.beginPath();
            actx.moveTo(rcx, rcy);
            actx.lineTo(rcx + Math.cos(predatorRadarAngle) * rr, rcy + Math.sin(predatorRadarAngle) * rr);
            actx.stroke();
            predatorBlips.forEach(b => {
                const bx = rcx + Math.cos(b.a) * rr * b.r, by = rcy + Math.sin(b.a) * rr * b.r;
                const diff = Math.abs(((predatorRadarAngle % (Math.PI * 2)) - b.a + Math.PI * 3) % (Math.PI * 2) - Math.PI);
                const blipAlpha = diff < 0.5 ? 1 - diff / 0.5 : 0;
                if (blipAlpha > 0) {
                    actx.fillStyle = 'rgba(' + acc2 + ',' + blipAlpha + ')';
                    actx.beginPath(); actx.arc(bx, by, 2, 0, Math.PI * 2); actx.fill();
                }
            });
            actx.restore();

            if (Math.random() > 0.992 && !predatorReticle) {
                predatorReticle = { x: 40 + Math.random() * (ac.width - 80), y: 90 + Math.random() * (ac.height - 220), life: 1 };
            }
            if (predatorReticle) {
                predatorReticle.life -= 0.012;
                if (predatorReticle.life <= 0) { predatorReticle = null; }
                else {
                    const a = Math.min(predatorReticle.life > 0.85 ? (1 - predatorReticle.life) / 0.15 : 1, 1) * Math.min(predatorReticle.life / 0.15, 1);
                    const size = 22 + (1 - Math.min(predatorReticle.life, 1)) * 6;
                    actx.save();
                    actx.globalAlpha = a;
                    actx.strokeStyle = cssColor('--accent'); actx.lineWidth = 1.3;
                    actx.beginPath(); actx.arc(predatorReticle.x, predatorReticle.y, size, 0, Math.PI * 2); actx.stroke();
                    actx.beginPath(); actx.moveTo(predatorReticle.x - size - 6, predatorReticle.y); actx.lineTo(predatorReticle.x - size + 4, predatorReticle.y); actx.stroke();
                    actx.beginPath(); actx.moveTo(predatorReticle.x + size - 4, predatorReticle.y); actx.lineTo(predatorReticle.x + size + 6, predatorReticle.y); actx.stroke();
                    actx.beginPath(); actx.moveTo(predatorReticle.x, predatorReticle.y - size - 6); actx.lineTo(predatorReticle.x, predatorReticle.y - size + 4); actx.stroke();
                    actx.beginPath(); actx.moveTo(predatorReticle.x, predatorReticle.y + size - 4); actx.lineTo(predatorReticle.x, predatorReticle.y + size + 6); actx.stroke();
                    actx.font = '8px monospace';
                    actx.fillStyle = cssColor('--accent');
                    actx.fillText('LOCKED', predatorReticle.x - 16, predatorReticle.y + size + 14);
                    actx.restore();
                }
            }
        }

        function drawMK() {
            const phoneEl = document.querySelector('.phone');
            if (Math.random() > 0.4) {
                mkEmbers.push({
                    x: Math.random() * ac.width, y: ac.height + 10,
                    vx: (Math.random() - 0.5) * 0.6, vy: -0.6 - Math.random() * 1.2,
                    size: 1 + Math.random() * 2, life: 1, decay: 0.004 + Math.random() * 0.006,
                    color: Math.random() > 0.5 ? cssColor('--accent') : cssColor('--accent-2')
                });
            }
            mkEmbers.forEach(e => {
                e.x += e.vx; e.y += e.vy; e.life -= e.decay;
                const fade = Math.max(e.life, 0);
                actx.globalAlpha = fade; actx.fillStyle = e.color;
                actx.shadowBlur = 6; actx.shadowColor = e.color;
                actx.beginPath(); actx.arc(e.x, e.y, e.size, 0, Math.PI * 2); actx.fill();
            });
            actx.globalAlpha = 1; actx.shadowBlur = 0;
            mkEmbers = mkEmbers.filter(e => e.life > 0 && e.y > -10);

            if (Math.random() > 0.96) mkDrips.push({ x: 20 + Math.random() * (ac.width - 40), y: -10, len: 8 + Math.random() * 10, speed: 1.2 + Math.random() * 1.5, life: 1 });
            mkDrips.forEach(d => {
                d.y += d.speed; d.life -= 0.004;
                const fade = Math.max(d.life, 0);
                actx.globalAlpha = fade;
                const grad = actx.createLinearGradient(d.x, d.y - d.len, d.x, d.y);
                grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, cssColor('--accent'));
                actx.strokeStyle = grad; actx.lineWidth = 2;
                actx.beginPath(); actx.moveTo(d.x, d.y - d.len); actx.lineTo(d.x, d.y); actx.stroke();
                actx.fillStyle = cssColor('--accent');
                actx.beginPath(); actx.arc(d.x, d.y, 1.4, 0, Math.PI * 2); actx.fill();
            });
            actx.globalAlpha = 1;
            mkDrips = mkDrips.filter(d => d.life > 0 && d.y < ac.height + 10);

            if (Date.now() - lastTrigger > 6000 && Math.random() > 0.5) {
                lastTrigger = Date.now();
                mkFlash = 1;
                const startX = 30 + Math.random() * (ac.width - 60);
                const points = [{ x: startX, y: -5 }];
                let x = startX;
                for (let i = 1; i <= 9; i++) {
                    const y = (ac.height / 9) * i;
                    x += (Math.random() - 0.5) * 50;
                    x = Math.max(10, Math.min(ac.width - 10, x));
                    points.push({ x, y });
                }
                mkBolt = { points, life: 1 };
                if (phoneEl) { phoneEl.classList.add('mk-shake'); setTimeout(() => phoneEl.classList.remove('mk-shake'), 280); }
            }
            if (mkBolt) {
                mkBolt.life -= 0.05;
                if (mkBolt.life <= 0) { mkBolt = null; }
                else {
                    actx.save();
                    actx.globalAlpha = Math.min(mkBolt.life * 2, 1);
                    actx.strokeStyle = '#7CD9FF'; actx.shadowBlur = 14; actx.shadowColor = '#3AB8FF'; actx.lineWidth = 2;
                    actx.beginPath(); mkBolt.points.forEach((p, i) => { i === 0 ? actx.moveTo(p.x, p.y) : actx.lineTo(p.x, p.y); }); actx.stroke();
                    actx.strokeStyle = '#FFFFFF'; actx.lineWidth = 0.8; actx.shadowBlur = 4;
                    actx.beginPath(); mkBolt.points.forEach((p, i) => { i === 0 ? actx.moveTo(p.x, p.y) : actx.lineTo(p.x, p.y); }); actx.stroke();
                    actx.restore();
                }
            }
            if (mkFlash > 0) {
                actx.fillStyle = 'rgba(124,217,255,' + (mkFlash * 0.16) + ')';
                actx.fillRect(0, 0, ac.width, ac.height);
                mkFlash -= 0.08;
            }
        }

        function drawMatrix() {
            if (!matrixDrops) {
                matrixColumns = Math.floor(ac.width / 13);
                matrixDrops = Array(matrixColumns).fill(0).map(() => Math.random() * -30);
            }
            actx.fillStyle = 'rgba(0,0,0,0.08)';
            actx.fillRect(0, 0, ac.width, ac.height);
            actx.font = '13px monospace';
            for (let i = 0; i < matrixColumns; i++) {
                const text = matrixChars[Math.floor(Math.random() * matrixChars.length)];
                const y = matrixDrops[i] * 13;
                const isHead = Math.random() > 0.92;
                actx.fillStyle = isHead ? '#cfffd9' : 'rgba(' + cssColorRgb('--accent-rgb') + ',0.55)';
                actx.fillText(text, i * 13, y);
                if (y > ac.height && Math.random() > 0.975) matrixDrops[i] = 0;
                matrixDrops[i]++;
            }
        }

        function loop() {
            const theme = currentTheme();
            if (theme !== lastTheme) {
                actx.clearRect(0, 0, ac.width, ac.height);
                tronPulses = []; mkEmbers = []; mkDrips = []; mkBolt = null; matrixDrops = null; predatorReticle = null;
                lastTheme = theme;
            }
            if (theme !== 'matrix') actx.clearRect(0, 0, ac.width, ac.height);
            drawFullScreenWash();
            if (theme === 'tron') drawTron();
            else if (theme === 'predator') drawPredator();
            else if (theme === 'mk') drawMK();
            else if (theme === 'matrix') drawMatrix();
            requestAnimationFrame(loop);
        }
        loop();
    }
};
