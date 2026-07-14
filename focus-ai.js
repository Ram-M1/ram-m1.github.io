/**
 * FOCUS — автономный ИИ-модуль. ЕДИНСТВЕННЫЙ источник ИИ-вызовов.
 *
 * ПОЧЕМУ ЭТОТ ФАЙЛ ГЛАВНЫЙ:
 * раньше те же функции были ОБЪЯВЛЕНЫ ДВАЖДЫ — здесь и в firebase-auth-helper.js.
 * Побеждала случайная версия (зависело от порядка загрузки), и из-за этого:
 *   • лимит ответа обрезался до 700 токенов — приветствие (просит 1200) и разбор
 *     анализов (800) ОБРЫВАЛИСЬ на полуслове;
 *   • терялся авто-повтор при пустом ответе модели (DeepSeek иногда отдаёт пусто).
 * Теперь функции живут ТОЛЬКО здесь. Файл — обычный скрипт (не модуль),
 * поэтому грузится всегда и работает даже если Firebase не поднялся.
 */
(function(){
  window.FOCUS_AI_PROXY = 'https://focus-ai.playing-life-rama.workers.dev';

  var TIMEOUT_MS = 25000;   // воркер Cloudflare живёт до 30с — даём запас
  var MAX_TOKENS_CEIL = 4000;

  /** Общий запрос к воркеру с таймаутом */
  async function call(body, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(function(){ controller.abort(); }, timeoutMs || TIMEOUT_MS);
    try {
      const res = await fetch(window.FOCUS_AI_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) {
        let detail = '';
        try { const e = await res.json(); detail = e.error || e.detail || ''; } catch(_){}
        return { ok: false, error: 'Воркер вернул ' + res.status + (detail ? ': ' + detail : '') };
      }
      return { ok: true, data: await res.json() };
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') return { ok: false, error: 'ИИ долго думал (таймаут). Попробуй короче вопрос.' };
      return { ok: false, error: 'Нет связи с ИИ: ' + e.message };
    }
  }

  /** Показывает в консоли, сколько промпта пришло ИЗ КЭША (в 50 раз дешевле).
      Так видно, что экономия реальная: hitRate должен быть 70-95% после первого запроса. */
  function logCache(u) {
    if (!u) return;
    try {
      console.log('[FOCUS ИИ] из кэша: ' + u.cached + ' токенов (' + u.hitRate + '%), ' +
                  'по полной цене: ' + u.fresh + ', ответ: ' + u.output);
    } catch(e){}
  }

  /** Сколько токенов реально просим (без прежнего жёсткого обрезания до 700) */
  function tokens(n, def) {
    var v = parseInt(n, 10) || def || 600;
    return Math.min(v, MAX_TOKENS_CEIL);
  }

  /* ========== ТЕКСТОВЫЙ ЗАПРОС ========== */
  window.fbAskAI = async function(messages, maxTokens) {
    const body = { messages: messages, max_tokens: tokens(maxTokens, 600) };
    let r = await call(body);
    if (!r.ok) return { ok: false, error: r.error };

    let data = r.data;
    if (data.ok && data.reply && String(data.reply).trim()) {
      logCache(data.usage);
      return { ok: true, reply: data.reply };
    }

    // ОДИН авто-повтор: модель иногда возвращает пустоту — раньше юзер просто видел ошибку
    r = await call(body);
    if (!r.ok) return { ok: false, error: r.error };
    data = r.data;
    if (data.ok && data.reply && String(data.reply).trim()) {
      return { ok: true, reply: data.reply };
    }
    return { ok: false, error: data.error || data.detail || 'Пустой ответ ИИ' };
  };

  /* ========== СТРОГИЙ JSON (команды ассистента) ==========
     Модель обязана вернуть {reply, actions:[...]} — так команды не теряются. */
  window.fbAskAIJson = async function(messages, maxTokens) {
    const body = { messages: messages, max_tokens: tokens(maxTokens, 900), json: true };
    let r = await call(body);
    if (!r.ok) return { ok: false, error: r.error };

    let data = r.data;
    if (data.ok && data.reply && String(data.reply).trim()) {
      logCache(data.usage);
      return { ok: true, reply: data.reply };
    }
    // авто-повтор при пустоте
    r = await call(body);
    if (!r.ok) return { ok: false, error: r.error };
    data = r.data;
    if (data.ok && data.reply) return { ok: true, reply: data.reply };
    return { ok: false, error: data.error || 'Пустой ответ ИИ' };
  };

  /* ========== ЗАПРОС С КАРТИНКОЙ ==========
     Модель не умеет «видеть» через API — воркер честно вернёт visionUnsupported,
     и раздел анализов перейдёт на распознавание текста прямо на телефоне. */
  window.fbAskAIVision = async function(messages, imageDataUrl, maxTokens) {
    const r = await call({ messages: messages, image: imageDataUrl, max_tokens: tokens(maxTokens, 700) });
    if (!r.ok) return { ok: false, error: r.error };
    const data = r.data;
    if (data.ok && data.reply) {
      return { ok: true, reply: data.reply, visionUnsupported: !!data.visionUnsupported };
    }
    return { ok: false, error: data.error || 'Пустой ответ', detail: data.detail, hint: data.hint };
  };

  console.log('[FOCUS] ИИ-модуль загружен (единственный источник)');
})();
