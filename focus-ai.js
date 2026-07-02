/**
 * FOCUS — автономный ИИ-модуль (НЕ зависит от Firebase)
 * Работает даже если Firebase SDK не загрузился.
 * Обычный скрипт (не модуль) — грузится всегда.
 */
(function(){
  window.FOCUS_AI_PROXY = 'https://focus-ai.playing-life-rama.workers.dev';

  // Основной вызов ИИ (текст)
  window.fbAskAI = async function(messages, maxTokens) {
    try {
      const res = await fetch(window.FOCUS_AI_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages, max_tokens: maxTokens || 600 })
      });
      if (!res.ok) {
        let detail = '';
        try { const e = await res.json(); detail = e.error || e.detail || ''; } catch(_){}
        return { ok: false, error: 'Воркер вернул ' + res.status + (detail ? ': ' + detail : '') };
      }
      const data = await res.json();
      if (data.ok && data.reply) return { ok: true, reply: data.reply };
      return { ok: false, error: data.error || data.detail || 'Пустой ответ ИИ' };
    } catch (e) {
      return { ok: false, error: 'Нет связи с воркером: ' + e.message };
    }
  };

  // Вызов ИИ с картинкой (vision)
  window.fbAskAIVision = async function(messages, imageDataUrl, maxTokens) {
    try {
      const res = await fetch(window.FOCUS_AI_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages, image: imageDataUrl, max_tokens: maxTokens || 700 })
      });
      const data = await res.json();
      if (data.ok && data.reply) return { ok: true, reply: data.reply };
      return { ok: false, error: data.error || 'Пустой ответ', detail: data.detail, hint: data.hint };
    } catch (e) {
      return { ok: false, error: 'Нет связи с ИИ: ' + e.message };
    }
  };

  console.log('[FOCUS] ИИ-модуль загружен (автономный)');
})();
