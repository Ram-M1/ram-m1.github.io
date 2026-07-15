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

  function fire(item) {
    const list = readAll();
    const rec = list.find(r => r.id === item.id);
    if (!rec || rec.fired) return;
    rec.fired = true; writeAll(list);
    if (('Notification' in window) && Notification.permission === 'granted') {
      try { new Notification('FOCUS ✦', { body: rec.text, tag: 'focus-' + rec.id }); } catch (e) {}
    }
    // если приложение открыто — покажем и внутренний тост
    try { if (window.focusToast) window.focusToast('⏰ ' + rec.text); } catch (e) {}
  }

  /** При загрузке: перезавести таймеры на ближайшие сутки, показать просроченные. */
  function boot() {
    const list = readAll();
    const now = Date.now();
    let changed = false;
    list.forEach(item => {
      if (item.fired) return;
      const at = new Date(item.at).getTime();
      if (at <= now) { item.fired = true; changed = true; } // просрочено — пометим
      else armTimer(item);
    });
    if (changed) writeAll(list);
  }

  /** Список активных напоминаний (для показа юзеру). */
  function active() { return readAll().filter(r => !r.fired); }
  function remove(id) { writeAll(readAll().filter(r => r.id !== id)); }

  window.FocusReminders = { schedule, parseWhen, parse: parseWhen, active, list: active, remove, cancel: remove, ensurePermission };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
