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
  function parseWhen(text) {
    const t = (text || '').toLowerCase();
    const now = new Date();
    let target = new Date(now);

    // «через N минут/часов»
    let m = t.match(/через\s+(\d+)\s*(минут|час)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (m[2].startsWith('минут')) target.setMinutes(target.getMinutes() + n);
      else target.setHours(target.getHours() + n);
      return target;
    }
    // «завтра»
    const tomorrow = t.includes('завтра');
    if (tomorrow) target.setDate(target.getDate() + 1);
    // явное время «в 18:00» / «в 9»
    m = t.match(/в\s+(\d{1,2})[:.]?(\d{2})?/);
    if (m) {
      target.setHours(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 0, 0, 0);
      if (!tomorrow && target <= now) target.setDate(target.getDate() + 1);
      return target;
    }
    // словесные части суток
    if (t.includes('утром')) { target.setHours(8, 0, 0, 0); }
    else if (t.includes('днём') || t.includes('днем') || t.includes('обед')) { target.setHours(13, 0, 0, 0); }
    else if (t.includes('вечером')) { target.setHours(19, 0, 0, 0); }
    else if (t.includes('ночью')) { target.setHours(22, 0, 0, 0); }
    else return null; // время не распознано
    if (!tomorrow && target <= now) target.setDate(target.getDate() + 1);
    return target;
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
      var base = (window.FOCUS_AI_PROXY || '').replace(/\/+$/, '');
      if (email && base) {
        fetch(base + '/reminders/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, text: item.text, at: item.at })
        }).catch(function(){});
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

  window.FocusReminders = { schedule, parseWhen, active, remove, ensurePermission };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
