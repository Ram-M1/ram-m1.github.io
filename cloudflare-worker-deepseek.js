export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Только POST' }), {
        status: 405, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
    if (!env.DEEPSEEK_KEY) {
      return new Response(JSON.stringify({ error: 'Ключ не настроен' }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
    try {
      const body = await request.json();
      const messages = body.messages;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return new Response(JSON.stringify({ error: 'Нужен массив messages' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
      const maxTokens = Math.min(body.max_tokens || 600, 1200);
      const dsResponse = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + env.DEEPSEEK_KEY,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: messages,
          max_tokens: maxTokens,
          temperature: 0.7,
        }),
      });
      if (!dsResponse.ok) {
        const errText = await dsResponse.text();
        return new Response(JSON.stringify({
          error: 'DeepSeek ' + dsResponse.status, detail: errText.slice(0, 200)
        }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const data = await dsResponse.json();
      const reply = data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content : '';
      return new Response(JSON.stringify({ ok: true, reply: reply }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Ошибка: ' + e.message }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
  }
};
