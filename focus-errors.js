/* ═══ СБОР ОШИБОК ═══
   В приложении около 140 мест, где сбой глушится молча: `catch(e){}`. Сама по себе
   такая защита нужна — она не даёт всему приложению упасть из-за мелочи. Но из-за
   неё серьёзные поломки становятся невидимыми: например, когда выгрузка в облако
   перестаёт работать, человек продолжает пользоваться приложением, данные копятся
   только на телефоне, и узнаёт он об этом лишь сменив устройство.

   Этот модуль делает поломки видимыми:
     • ловит необработанные ошибки страницы и отклонённые обещания;
     • даёт FocusErrors.report(...) для важных мест (облако, оплата, монеты, чат);
     • хранит последние записи на устройстве и отправляет их в облако,
       чтобы они были видны в админке.

   Правила: ничего не ломать и не тормозить. Любой сбой самого сборщика молча
   игнорируется, отправка идёт в фоне, при отсутствии сети — просто копится.
*/
(function () {
  if (typeof window === 'undefined') return;
  if (window.FocusErrors) return;

  var KEY = 'focus_error_log';
  var MAX_LOCAL = 40;          // больше и не нужно — это не архив, а последние сбои
  var _sending = false;
  var _recent = {};            // защита от повторов: одна и та же ошибка в цикле

  function nowIso() { try { return new Date().toISOString(); } catch (e) { return ''; } }

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { return []; }
  }

  function write(list) {
    try {
      var raw = window.__focusRawSet || localStorage.setItem.bind(localStorage);
      raw(KEY, JSON.stringify(list.slice(-MAX_LOCAL)));
    } catch (e) {}
  }

  function shortText(v) {
    try {
      if (v == null) return '';
      if (typeof v === 'string') return v.slice(0, 300);
      if (v.message) return String(v.message).slice(0, 300);
      return String(v).slice(0, 300);
    } catch (e) { return ''; }
  }

  /** Записать сбой. where — понятное место («облако: выгрузка»), err — ошибка. */
  function report(where, err, extra) {
    try {
      var text = shortText(err);
      var sig = where + '|' + text;
      var t = Date.now();
      if (_recent[sig] && t - _recent[sig] < 60000) return;   // тот же сбой минуту назад — не дублируем
      _recent[sig] = t;

      var uid = '';
      try { uid = (window.fbCurrentUser && window.fbCurrentUser() || {}).uid || ''; } catch (e) {}

      var rec = {
        at: nowIso(),
        where: String(where || '').slice(0, 80),
        text: text,
        page: (location.pathname || '').split('/').pop(),
        uid: uid,
        extra: extra ? shortText(extra) : ''
      };
      var list = read();
      list.push(rec);
      write(list);
      flush();
    } catch (e) {}
  }

  /** Отправить накопленное в облако (для админки). Молча, в фоне. */
  function flush() {
    try {
      if (_sending) return;
      var list = read();
      if (!list.length) return;
      if (!window.fbReportErrors) return;               // помощник ещё не загрузился — отправим позже
      _sending = true;
      window.fbReportErrors(list).then(function (ok) {
        _sending = false;
        if (ok) write([]);                              // ушло — очищаем локальное
      }).catch(function () { _sending = false; });
    } catch (e) { _sending = false; }
  }

  // необработанные ошибки страницы — то, от чего у человека белый экран
  try {
    window.addEventListener('error', function (e) {
      if (!e) return;
      report('страница', e.message || (e.error && e.error.message), (e.filename || '') + ':' + (e.lineno || ''));
    });
    window.addEventListener('unhandledrejection', function (e) {
      report('обещание', (e && e.reason && e.reason.message) || (e && e.reason));
    });
  } catch (e) {}

  // пробуем отправить накопленное при появлении связи и через минуту после старта
  try {
    window.addEventListener('online', flush);
    setTimeout(flush, 8000);
    setInterval(flush, 60000);
  } catch (e) {}

  window.FocusErrors = {
    report: report,
    flush: flush,
    list: read,
    clear: function () { write([]); }
  };
})();
