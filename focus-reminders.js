/* FOCUS — НАПОМИНАНИЯ (уведомления по запросу пользователя)
   =========================================================================
   ИИ может поставить напоминание на ЛЮБУЮ задачу:
   «напомни про тренировку в 18:00», «напомни прочитать молитву вечером»,
   «напомни сходить в храм в воскресенье».
   Использует Web Notifications API + хранит запланированные напоминания.
   ========================================================================= */
(function () {
  'use strict';

  const KEY = 'focus_reminders';
  function readAll() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function writeAll(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }

  /** Запросить разрешение на уведомления (один раз). */
  async function ensurePermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try { const p = await Notification.requestPermission(); return p === 'granted'; } catch (e) { return false; }
  }

  /** Распарсить время из текста: «в 18:00», «через 2 часа», «вечером», «завтра в 9». */
  function parseWhen(when) {
  var w = String(when || '').toLowerCase().trim();
  if (!w) return null;
  var now = new Date();
  var d = new Date(now);

  // ── сдвиг по дням ──
  // ВАЖНО: «послезавтра» проверяем ПЕРВЫМ — иначе оно попадало под «завтра»
  // и напоминание вставало на сутки раньше.
  if (/послезавтра/.test(w))      d.setDate(d.getDate() + 2);
  else if (/завтра/.test(w))      d.setDate(d.getDate() + 1);
  else if (/через\s+(\d+)\s*(дн|день|дня|дней)/.test(w)) {
    d.setDate(d.getDate() + parseInt(w.match(/через\s+(\d+)/)[1], 10));
  }

  // ── «через N минут / часов» ──
  var mm = w.match(/через\s+(\d+)\s*(мин|минут)/);
  if (mm) { var r = new Date(now); r.setMinutes(r.getMinutes() + parseInt(mm[1],10)); return r; }
  // "через час" / "через полчаса" (без числа)
  if (/через\s+час(?!\w)/.test(w) && !/через\s+\d/.test(w)) { var rh = new Date(now); rh.setHours(rh.getHours()+1); return rh; }
  if (/через\s+полчаса/.test(w)) { var rph = new Date(now); rph.setMinutes(rph.getMinutes()+30); return rph; }
  var hh = w.match(/через\s+(\d+)\s*(час|часа|часов)/);
  if (hh) { var r2 = new Date(now); r2.setHours(r2.getHours() + parseInt(hh[1],10)); return r2; }

  // ── точное время: «в 18:00», «18:00», «в 9 утра», «в 7 вечера» ──
  var t = w.match(/(\d{1,2})[:.](\d{2})/);          // 18:00 / 18.00 (со словом «в» и без)
  if (t) {
    var H = parseInt(t[1],10), M = parseInt(t[2],10);
    if (/вечера|вечером/.test(w) && H < 12) H += 12;
    d.setHours(H, M, 0, 0);
    if (d <= now && !/завтра|послезавтра|через/.test(w)) d.setDate(d.getDate() + 1);  // время прошло → на завтра
    return d;
  }
  var t2 = w.match(/(?:^|\s)(\d{1,2})\s*(утра|дня|вечера|ночи)?(?:\s|$)/);   // «в 9 утра», «в 19»
  if (t2) {
    var H2 = parseInt(t2[1],10);
    if (/вечера|ночи/.test(w) && H2 < 12) H2 += 12;
    if (/дня/.test(w) && H2 < 12) H2 += 12;
    if (H2 >= 0 && H2 <= 23) {
      d.setHours(H2, 0, 0, 0);
      if (d <= now && !/завтра|послезавтра|через/.test(w)) d.setDate(d.getDate() + 1);
      return d;
    }
  }

  // ── словесное время ──
  if (/утром/.test(w))   { d.setHours(9, 0, 0, 0);  if (d <= now) d.setDate(d.getDate()+1); return d; }
  if (/днём|днем/.test(w)){ d.setHours(14, 0, 0, 0); if (d <= now) d.setDate(d.getDate()+1); return d; }
  if (/вечером/.test(w)) { d.setHours(19, 0, 0, 0); if (d <= now) d.setDate(d.getDate()+1); return d; }
  if (/ночью/.test(w))   { d.setHours(22, 0, 0, 0); if (d <= now) d.setDate(d.getDate()+1); return d; }

  // ── «завтра» / «послезавтра» БЕЗ времени → ставим на утро (раньше просто не работало) ──
  if (/завтра|послезавтра/.test(w)) { d.setHours(10, 0, 0, 0); return d; }

  return null;
}

  /** Поставить напоминание. text — о чём, when — Date или строка со временем. */
  async function schedule(text, when) {
    const at = (when instanceof Date) ? when : parseWhen(when);
    if (!at) return { ok: false, error: 'Не понял когда напомнить. Уточни время.' };
    const granted = await ensurePermission();
    const item = { id: Date.now(), text: text || 'Напоминание', at: at.toISOString(), fired: false, notify: granted };
    const list = readAll(); list.push(item); writeAll(list);
    armTimer(item);

    // ДУБЛИРУЕМ НА СЕРВЕР → придёт ПИСЬМО, даже если приложение закрыто.
    // (Таймер в браузере живёт только пока приложение открыто — этого мало.)
    try {
      var u = window.FocusStorage ? FocusStorage.getUser() : null;
      var email = u && u.email;
      var uid = null;
      try { uid = (window.fbCurrentUser && window.fbCurrentUser()) || null; } catch(e){}
      var base = (window.FOCUS_AI_PROXY || '').replace(/\/+$/, '');
      if (email && base) {
        fetch(base + '/reminders/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, uid: uid, text: item.text, at: item.at })
        }).then(function(r){ return r.json(); })
          .then(function(d){ console.log('[FOCUS] напоминание на сервере:', d.ok ? 'принято ✓' : ('ОШИБКА: ' + (d.error||'?'))); })
          .catch(function(e){ console.log('[FOCUS] напоминание НЕ ушло на сервер:', e.message); });
      } else {
        console.log('[FOCUS] напоминание НЕ ушло на сервер: нет email в профиле');
      }
    } catch(e){}

    const timeStr = at.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    return { ok: true, at: at, text: item.text, when: timeStr, notify: granted };
  }

  /** Завести таймер для одного напоминания (если в пределах суток — точный setTimeout). */
  function armTimer(item) {
    const delay = new Date(item.at).getTime() - Date.now();
    if (delay < 0 || delay > 24 * 3600 * 1000) return; // дальние проверяются при загрузке
    setTimeout(() => fire(item), delay);
  }

  /** Показать уведомление НАДЁЖНО.
      В Chrome на Android и в установленном PWA `new Notification()` запрещён
      («Illegal constructor») — показывать можно только через служебный воркер.
      Плюс всегда даём видимую плашку внутри приложения, чтобы юзер точно увидел. */
  function notify(title, body, tag) {
    var shown = false;
    try {
      if (('Notification' in window) && Notification.permission === 'granted' &&
          navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(function (reg) {
          try {
            reg.showNotification(title, {
              body: body, tag: tag, icon: 'icon-192.png', badge: 'icon-192.png',
              vibrate: [200, 100, 200], requireInteraction: false
            });
          } catch (e) {}
        }).catch(function () {});
        shown = true;
      }
    } catch (e) {}
    // запасной путь для десктопных браузеров
    if (!shown) {
      try {
        if (('Notification' in window) && Notification.permission === 'granted') {
          new Notification(title, { body: body, tag: tag });
        }
      } catch (e) {}
    }
    banner(body);
  }

  /** Видимая плашка в самом приложении (не зависит от внешних функций). */
  function banner(text) {
    try {
      if (!document.body) return;
      var d = document.createElement('div');
      d.textContent = '⏰ ' + text;
      d.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:99999;' +
        'background:rgba(10,10,15,0.96);color:#FFD966;border:1px solid rgba(255,217,102,0.5);' +
        'border-radius:14px;padding:12px 18px;font-size:14px;font-weight:600;max-width:86%;' +
        'box-shadow:0 10px 30px rgba(0,0,0,0.5);font-family:inherit;text-align:center;';
      document.body.appendChild(d);
      setTimeout(function () { d.style.transition = 'opacity .4s'; d.style.opacity = '0'; }, 6000);
      setTimeout(function () { if (d.parentNode) d.remove(); }, 6600);
    } catch (e) {}
  }

  function fire(item) {
    const list = readAll();
    const rec = list.find(r => r.id === item.id);
    if (!rec || rec.fired) return;
    rec.fired = true; writeAll(list);
    notify('FOCUS ✦', rec.text, 'focus-' + rec.id);
  }

  /** При загрузке: перезавести таймеры, ПОКАЗАТЬ пропущенные (раньше они молча съедались). */
  function boot() {
    const list = readAll();
    const now = Date.now();
    let changed = false;
    const missed = [];
    list.forEach(item => {
      if (item.fired) return;
      const at = new Date(item.at).getTime();
      if (at <= now) {
        item.fired = true; changed = true;
        // показываем только свежие пропуски (за сутки), чтобы не сыпать старьём
        if (now - at < 24 * 3600 * 1000) missed.push(item);
      } else armTimer(item);
    });
    if (changed) writeAll(list);
    missed.forEach(function (m, i) {
      setTimeout(function () { notify('FOCUS ✦ пропущено', m.text, 'focus-miss-' + m.id); }, 800 + i * 900);
    });
  }

  /** Список активных напоминаний (для показа юзеру). */
  function active() { return readAll().filter(r => !r.fired); }
  function remove(id) { writeAll(readAll().filter(r => r.id !== id)); }

  /** Подстраховка: браузер может «придушить» setTimeout (фоновая вкладка, экономия батареи).
      Поэтому раз в 20 секунд сами проверяем, не наступило ли время. */
  function tick() {
    try {
      const list = readAll();
      const now = Date.now();
      let changed = false;
      list.forEach(function (item) {
        if (item.fired) return;
        if (new Date(item.at).getTime() <= now) {
          item.fired = true; changed = true;
          notify('FOCUS ✦', item.text, 'focus-' + item.id);
        }
      });
      if (changed) writeAll(list);
    } catch (e) {}
  }

  window.FocusReminders = { schedule, parseWhen, parse: parseWhen, active, list: active, remove, cancel: remove, ensurePermission, notify };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setInterval(tick, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
})();
