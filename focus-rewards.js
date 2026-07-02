/* ============================================================
   FOCUS — ЦЕНТРАЛИЗОВАННАЯ СИСТЕМА НАГРАД (стрики + монеты)
   Всё в ОДНОМ месте. Чтобы поменять правила наград (разовые/стрики/
   вехи/размер) — правится ТОЛЬКО этот файл, не каждый экран.

   Экран вызывает: FocusRewards.mark(sphere, action, { sourceEl })
   — система сама решает, начислять ли монеты (по стрик-вехам),
   обновляет стрики и проигрывает анимацию.
   ============================================================ */
(function () {
  if (typeof window.FocusRewards !== 'undefined') return;

  // ---- ключи хранилища ----
  var ACTIVITY_KEY = 'focus_activity_days';   // { 'sphere': ['2026-01-01', ...], '_all': [...] }
  var MILESTONE_KEY = 'focus_streak_milestones'; // { 'sphere': [3,7,...] уже выданные вехи }

  // ---- НАСТРОЙКА НАГРАД (меняется здесь и нигде больше) ----
  // Вехи стрика, за которые даём монеты, и сколько монет за каждую.
  var MILESTONES = [
    { days: 3,   coins: 3 },
    { days: 7,   coins: 7 },
    { days: 14,  coins: 15 },
    { days: 30,  coins: 40 },
    { days: 60,  coins: 80 },
    { days: 100, coins: 150 }
  ];
  // режим: 'streak' (монеты только за вехи стрика) | 'daily' (монета за каждый день)
  var MODE = 'streak';

  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function load(key, def) { try { return JSON.parse(localStorage.getItem(key)) || def; } catch (e) { return def; } }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  // подсчёт текущего стрика по набору дат (строк ISO)
  function calcStreak(days) {
    if (!days || !days.length) return 0;
    var set = {};
    days.forEach(function (d) { set[d] = true; });
    var streak = 0;
    var d = new Date();
    if (!set[d.toISOString().slice(0, 10)]) d.setDate(d.getDate() - 1); // нет сегодня — считаем со вчера
    while (set[d.toISOString().slice(0, 10)]) { streak++; d.setDate(d.getDate() - 1); }
    return streak;
  }

  var FocusRewards = {
    // Отметить активность. Возвращает { firstToday, streak, coinsAwarded, milestone }
    mark: function (sphere, action, opts) {
      opts = opts || {};
      var today = todayISO();
      var activity = load(ACTIVITY_KEY, {});
      if (!activity[sphere]) activity[sphere] = [];
      if (!activity._all) activity._all = [];

      var firstTodayInSphere = activity[sphere].indexOf(today) === -1;
      if (firstTodayInSphere) activity[sphere].push(today);
      if (activity._all.indexOf(today) === -1) activity._all.push(today);
      save(ACTIVITY_KEY, activity);

      // лог в общий профиль (для статистики/обратной совместимости)
      try { if (window.FocusStorage && FocusStorage.addActivity) FocusStorage.addActivity(sphere, action); } catch (e) {}

      var streak = calcStreak(activity[sphere]);
      var coinsAwarded = 0;
      var hitMilestone = null;

      if (MODE === 'daily') {
        if (firstTodayInSphere) { coinsAwarded = 1; }
      } else {
        // streak-режим: при достижении новой вехи выдаём монеты один раз
        if (firstTodayInSphere) {
          var given = load(MILESTONE_KEY, {});
          if (!given[sphere]) given[sphere] = [];
          for (var i = 0; i < MILESTONES.length; i++) {
            var m = MILESTONES[i];
            if (streak >= m.days && given[sphere].indexOf(m.days) === -1) {
              given[sphere].push(m.days);
              coinsAwarded += m.coins;
              hitMilestone = m.days;
            }
          }
          save(MILESTONE_KEY, given);
        }
      }

      if (coinsAwarded > 0) {
        try { if (window.FocusStorage && FocusStorage.addCoins) FocusStorage.addCoins(coinsAwarded); } catch (e) {}
        this.coinBurst({
          amount: coinsAwarded,
          reason: hitMilestone ? ('Стрик ' + hitMilestone + ' дней!') : (opts.reason || ''),
          sourceEl: opts.sourceEl
        });
      }

      return { firstToday: firstTodayInSphere, streak: streak, coinsAwarded: coinsAwarded, milestone: hitMilestone };
    },

    getStreak: function (sphere) {
      var activity = load(ACTIVITY_KEY, {});
      return calcStreak(activity[sphere || '_all'] || []);
    },
    getAllStreak: function () { return this.getStreak('_all'); },

    // следующая веха для прогресс-подсказок в UI
    nextMilestone: function (sphere) {
      var s = this.getStreak(sphere);
      for (var i = 0; i < MILESTONES.length; i++) if (MILESTONES[i].days > s) return MILESTONES[i];
      return null;
    },

    // ---------- АНИМАЦИЯ МОНЕТ (исправленная, без зависаний) ----------
    coinBurst: function (config) {
      config = config || {};
      var amount = config.amount || 1;
      var reason = config.reason || '';
      var count = Math.min(Math.max(Math.round(amount), 8), 20);

      var rootStyle = getComputedStyle(document.documentElement);
      var accent = (rootStyle.getPropertyValue('--accent') || '#FFD966').trim();
      var accentLight = (rootStyle.getPropertyValue('--accent-light') || '#FFE9A8').trim();
      var accentDark = (rootStyle.getPropertyValue('--accent-dark') || '#C9952E').trim();

      var phone = document.querySelector('.phone') || document.body;
      var phoneRect = phone.getBoundingClientRect();
      var phoneW = phoneRect.width, phoneH = phoneRect.height;

      var originX = phoneW / 2, originY = phoneH / 2;
      if (config.sourceEl) {
        try {
          var sr = config.sourceEl.getBoundingClientRect();
          originX = sr.left - phoneRect.left + sr.width / 2;
          originY = sr.top - phoneRect.top + sr.height / 2;
        } catch (e) {}
      }

      var layer = document.createElement('div');
      layer.style.cssText = 'position:absolute; inset:0; z-index:2000; pointer-events:none; overflow:hidden; border-radius:52px;';
      phone.appendChild(layer);

      function coinSVG() {
        return '<svg width="30" height="30" viewBox="0 0 40 40">' +
          '<defs><radialGradient id="cgr" cx="38%" cy="32%" r="70%">' +
          '<stop offset="0%" stop-color="' + accentLight + '"/>' +
          '<stop offset="55%" stop-color="' + accent + '"/>' +
          '<stop offset="100%" stop-color="' + accentDark + '"/></radialGradient></defs>' +
          '<circle cx="20" cy="20" r="18" fill="url(#cgr)" stroke="' + accentDark + '" stroke-width="1.5"/>' +
          '<circle cx="20" cy="20" r="14" fill="none" stroke="' + accentDark + '" stroke-width="1" opacity="0.5"/>' +
          '<path d="M15 12h10M15 12v16M15 20h7" stroke="' + accentDark + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
          '</svg>';
      }

      var coins = [];
      for (var i = 0; i < count; i++) {
        var el = document.createElement('div');
        el.style.cssText = 'position:absolute; left:' + originX + 'px; top:' + originY + 'px; will-change:transform,opacity; filter:drop-shadow(0 0 5px rgba(255,200,80,0.55));';
        el.innerHTML = coinSVG();
        layer.appendChild(el);
        var angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        var power = 6 + Math.random() * 6;
        coins.push({
          el: el, x: 0, y: 0,
          vx: Math.cos(angle) * power,
          vy: Math.sin(angle) * power - 8,
          rot: Math.random() * 360, vrot: (Math.random() - 0.5) * 30,
          delay: Math.floor(Math.random() * 5)
        });
      }

      // надпись
      var note = document.createElement('div');
      note.style.cssText = 'position:absolute; left:50%; top:40%; transform:translate(-50%,-50%) scale(0.6); z-index:2001;' +
        'background:rgba(0,0,0,0.88); border:1.5px solid ' + accent + '; border-radius:22px; padding:11px 24px;' +
        'color:' + accent + '; font-weight:800; font-size:16px; text-align:center; pointer-events:none;' +
        'box-shadow:0 0 30px rgba(255,200,80,0.4); opacity:0; transition:all 0.4s cubic-bezier(.2,1.4,.4,1); font-family:inherit; white-space:nowrap;';
      note.innerHTML = '+' + amount + ' F-coin' + (reason ? '<br><span style="font-size:11px;font-weight:600;opacity:0.85;">' + reason + '</span>' : '');
      layer.appendChild(note);
      requestAnimationFrame(function () { note.style.opacity = '1'; note.style.transform = 'translate(-50%,-50%) scale(1)'; });

      var gravity = 0.4;
      var floorY = phoneH - originY - 24;
      var frame = 0;
      var MAX_FRAMES = 110; // жёсткий предел — гарантия что всё уберётся

      function animate() {
        frame++;
        // фейд монет с 60-го кадра
        var fade = frame > 60 ? Math.max(0, 1 - (frame - 60) / 35) : 1;
        coins.forEach(function (c) {
          if (c.delay > 0) { c.delay--; return; }
          c.vy += gravity;
          c.x += c.vx; c.y += c.vy;
          c.rot += c.vrot;
          if (c.y > floorY) { c.y = floorY; c.vy *= -0.45; c.vx *= 0.7; }
          c.el.style.opacity = fade;
          c.el.style.transform = 'translate(' + c.x + 'px,' + c.y + 'px) rotate(' + c.rot + 'deg)';
        });
        // надпись исчезает к концу
        if (frame > 70) {
          var nf = Math.max(0, 1 - (frame - 70) / 30);
          note.style.opacity = nf;
          note.style.transform = 'translate(-50%,-50%) scale(' + (1 + (1 - nf) * 0.3) + ') translateY(' + (-(1 - nf) * 30) + 'px)';
        }
        if (frame < MAX_FRAMES) {
          requestAnimationFrame(animate);
        } else {
          layer.remove(); // гарантированная очистка — ничего не зависнет
        }
      }
      requestAnimationFrame(animate);
    }
  };

  window.FocusRewards = FocusRewards;
})();
