/* FOCUS — ПОДТВЕРЖДЕНИЕ EMAIL ЧЕРЕЗ КОД (Resend + воркер)
   =========================================================================
   При регистрации: шлём красивое письмо с 6-значным кодом через наш воркер.
   Юзер вводит код в приложении → аккаунт подтверждён.
   Обходит ограничение Firebase на кастомизацию письма.
   ========================================================================= */
(function () {
  'use strict';

  const WORKER = (window.FOCUS_AI_PROXY || 'https://focus-ai.playing-life-rama.workers.dev');
  const CODE_KEY = 'focus_email_verify';   // { email, code, ts }

  const FocusEmailVerify = {
    /** Отправить письмо с кодом на email. Возвращает {ok} или {ok:false,error}. */
    async send(email) {
      if (!email) return { ok: false, error: 'Нет email' };
      // генерим код на стороне клиента тоже (воркер вернёт тот что отправил)
      try {
        const res = await fetch(WORKER + '/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: email })
        });
        const data = await res.json();
        if (data && data.ok && data.code) {
          // сохраняем код+email+время (код живёт 30 мин)
          try { localStorage.setItem(CODE_KEY, JSON.stringify({ email: email, code: String(data.code), ts: Date.now() })); } catch (e) {}
          return { ok: true };
        }
        return { ok: false, error: (data && data.error) || 'Не удалось отправить письмо' };
      } catch (e) {
        return { ok: false, error: 'Нет связи: ' + e.message };
      }
    },

    /** Проверить введённый код. */
    check(inputCode) {
      try {
        const saved = JSON.parse(localStorage.getItem(CODE_KEY) || 'null');
        if (!saved) return { ok: false, error: 'Сначала запроси код' };
        if (Date.now() - saved.ts > 30 * 60 * 1000) return { ok: false, error: 'Код истёк, запроси новый' };
        if (String(inputCode).trim() === saved.code) {
          // помечаем email подтверждённым
          try {
            localStorage.setItem('focus_email_verified', saved.email);
            localStorage.removeItem(CODE_KEY);
            if (window.FocusStorage) FocusStorage.saveUser({ emailVerified: true });
          } catch (e) {}
          return { ok: true };
        }
        return { ok: false, error: 'Неверный код' };
      } catch (e) { return { ok: false, error: 'Ошибка проверки' }; }
    },

    /** Подтверждён ли email. */
    isVerified(email) {
      try {
        const v = localStorage.getItem('focus_email_verified');
        return v && (!email || v === email);
      } catch (e) { return false; }
    }
  };

  window.FocusEmailVerify = FocusEmailVerify;
})();
