/**
 * FOCUS — Прокси DeepSeek на Cloudflare Workers (текст + vision/фото)
 *
 * ОБНОВЛЕНИЕ: добавлена поддержка изображений (разбор фото/анализов).
 *
 * КАК ОБНОВИТЬ (воркер уже есть):
 * 1. dash.cloudflare.com → Workers & Pages → focus-ai → Edit code
 * 2. Ctrl+A → удали старый код → вставь ЭТОТ → Deploy
 * 3. Ключ DEEPSEEK_KEY уже настроен — менять НЕ надо
 *
 * Приложение шлёт:
 *   { messages:[...] }                              — текст
 *   { messages:[...], image:"data:image/..." }      — с картинкой (vision)
 */

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Только POST' }), {
        status: 405, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    if (!env.DEEPSEEK_KEY) {
      return new Response(JSON.stringify({ error: 'Ключ не настроен на сервере' }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    try {
      const body = await request.json();
      let messages = body.messages;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return new Response(JSON.stringify({ error: 'Нужен массив messages' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }

      const maxTokens = Math.min(body.max_tokens || 600, 1200);

      // Если пришла картинка — встраиваем в последнее user-сообщение (vision-формат)
      let model = 'deepseek-v4-flash';
      if (body.image && typeof body.image === 'string') {
        model = 'deepseek-vl2';
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'user') {
            const textPart = messages[i].content;
            messages[i] = {
              role: 'user',
              content: [
                { type: 'text', text: typeof textPart === 'string' ? textPart : 'Разбери изображение' },
                { type: 'image_url', image_url: { url: body.image } }
              ]
            };
            break;
          }
        }
      }

      const dsResponse = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + env.DEEPSEEK_KEY,
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          max_tokens: maxTokens,
          temperature: 0.7,
        }),
      });

      if (!dsResponse.ok) {
        const errText = await dsResponse.text();
        return new Response(JSON.stringify({
          error: 'DeepSeek API ' + dsResponse.status,
          detail: errText.slice(0, 300),
          hint: body.image ? 'Возможно vision через API недоступен — нужна другая модель' : ''
        }), {
          status: 502, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }

      const data = await dsResponse.json();
      const reply = data.choices?.[0]?.message?.content || '';

      return new Response(JSON.stringify({ ok: true, reply }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: 'Ошибка: ' + e.message }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
  }
};
