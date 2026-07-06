/* FOCUS — ГОЛОСОВОЙ ВЫЗОВ ПО ИМЕНИ АССИСТЕНТА
   =========================================================================
   Когда включено (кнопка-микрофон на главной), приложение слушает микрофон.
   Услышал имя ассистента (напр. «Пятница») → откликается и слушает команду.
   Работает только пока приложение открыто (ограничение веба — фон недоступен).
   ========================================================================= */
(function () {
  'use strict';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  const FocusVoice = {
    supported: !!SR,
    active: false,          // включён ли режим прослушивания
    _recog: null,
    _restarting: false,
    _onWake: null,          // колбэк: услышали имя → (command) => {...}
    _name: '',

    /** Имя ассистента для распознавания (в нижнем регистре). */
    setName(name) { this._name = (name || '').toLowerCase().trim(); },

    /** Проверка: содержит ли текст имя ассистента (гибко). */
    _hasWake(text) {
      if (!this._name) return false;
      const t = (text || '').toLowerCase();
      // берём корень имени (первые 4-5 букв) — распознавание неточное
      const root = this._name.slice(0, Math.max(4, this._name.length - 1));
      return t.includes(this._name) || t.includes(root);
    },

    /** Извлечь команду после имени (что сказал после «Пятница ...»). */
    _extractCommand(text) {
      const t = (text || '').toLowerCase();
      const idx = t.indexOf(this._name);
      if (idx >= 0) return text.slice(idx + this._name.length).trim().replace(/^[,.\s]+/, '');
      return '';
    },

    /** Включить прослушивание. onWake(command) вызовется когда услышим имя. */
    async start(onWake) {
      if (!this.supported || this.active) return false;
      // запросить доступ к микрофону
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(t => t.stop()); // сразу освобождаем, нужен был только запрос прав
        }
      } catch (e) { return false; }

      this._onWake = onWake;
      this.active = true;
      this._listen();
      return true;
    },

    /** Выключить прослушивание. */
    stop() {
      this.active = false;
      if (this._recog) { try { this._recog.stop(); } catch (e) {} this._recog = null; }
    },

    _listen() {
      if (!this.active) return;
      const recog = new SR();
      recog.lang = 'ru-RU';
      recog.interimResults = true;
      recog.continuous = true;    // постоянное прослушивание
      recog.maxAlternatives = 1;
      this._recog = recog;

      recog.onresult = (e) => {
        let txt = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) txt += e.results[i][0].transcript;
        }
        if (!txt) return;
        if (this._hasWake(txt)) {
          const cmd = this._extractCommand(txt);
          try { if (this._onWake) this._onWake(cmd); } catch (er) {}
        }
      };

      recog.onend = () => {
        // авто-перезапуск пока активен (браузер сам останавливает через ~минуту)
        this._recog = null;
        if (this.active && !this._restarting) {
          this._restarting = true;
          setTimeout(() => { this._restarting = false; this._listen(); }, 400);
        }
      };

      recog.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          this.active = false;
          if (this._onError) this._onError('mic-denied');
        }
        // прочие ошибки — onend перезапустит
      };

      try { recog.start(); } catch (er) { /* уже запущен */ }
    }
  };

  window.FocusVoice = FocusVoice;
})();
