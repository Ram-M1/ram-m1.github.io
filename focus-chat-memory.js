/* FOCUS — ПАМЯТЬ ЧАТА С ИИ
   =========================================================================
   История диалога с ассистентом хранится 7 дней, затем уходит в архив.
   Всё синкается в облако (через focus-storage) — не теряется при перезагрузке,
   смене устройства, очистке кэша.
   Мини-чат и расширенный используют ОДНУ историю (window._focusChatHistory).
   ========================================================================= */
(function () {
  'use strict';

  const LIVE_KEY = 'focus_chat_history';    // активная история (последние 7 дней)
  const ARCH_KEY = 'focus_chat_archive';    // архив (старше 7 дней)
  const WEEK_MS = 7 * 24 * 3600 * 1000;

  function read(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; } }
  function write(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      // триггерим облачный синк
      if (window.FocusStorage && FocusStorage.saveUser) FocusStorage.saveUser({});
    } catch (e) {}
  }

  const FocusChatMemory = {
    /** Загрузить активную историю в window._focusChatHistory (вызывать при старте). */
    load() {
      this._rotate();
      window._focusChatHistory = read(LIVE_KEY);
      return window._focusChatHistory;
    },

    /** Добавить сообщение {role, content} и сохранить. */
    push(msg) {
      if (!window._focusChatHistory) window._focusChatHistory = read(LIVE_KEY);
      const item = Object.assign({ ts: Date.now() }, msg);
      window._focusChatHistory.push(item);
      write(LIVE_KEY, window._focusChatHistory);
      return item;
    },

    /** Синхронизировать текущий массив в хранилище (если правили напрямую). */
    save() {
      if (window._focusChatHistory) write(LIVE_KEY, window._focusChatHistory);
    },

    /** Перенести сообщения старше 7 дней в архив. */
    _rotate() {
      const now = Date.now();
      const live = read(LIVE_KEY);
      if (!live.length) return;
      const fresh = [], old = [];
      live.forEach(m => {
        if (m.ts && (now - m.ts) > WEEK_MS) old.push(m);
        else fresh.push(m);
      });
      if (old.length) {
        const arch = read(ARCH_KEY).concat(old);
        // архив не бесконечный — держим последние 500 сообщений
        write(ARCH_KEY, arch.slice(-500));
        write(LIVE_KEY, fresh);
        window._focusChatHistory = fresh;
      }
    },

    /** Последние N сообщений для контекста ИИ. */
    recent(n) {
      const h = window._focusChatHistory || read(LIVE_KEY);
      return h.slice(-(n || 10));
    },

    /** Весь архив (для просмотра истории юзером). */
    archive() { return read(ARCH_KEY); },

    /** Очистить всё (по запросу юзера). */
    clear() {
      write(LIVE_KEY, []);
      window._focusChatHistory = [];
    }
  };

  window.FocusChatMemory = FocusChatMemory;
  // авто-загрузка при старте
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => FocusChatMemory.load());
  else FocusChatMemory.load();
})();
