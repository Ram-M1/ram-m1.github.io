/* ═══ СВЯЗКА ТРЕНИРОВКИ ФОКУСА С РЕАЛЬНЫМИ ДЕЛАМИ ═══

   Раньше таймер был просто секундомером: отсидел 45 минут — и всё, результата не
   видно. Теперь сессия привязывается к настоящей задаче, и на выходе не «45 минут
   фокуса», а закрытое дело.

   Откуда берутся задачи:
     • разгрузка мозга — корзины «сейчас» и «план» (focus_braindump);
     • шаги бизнес-целей — невыполненные шаги (focus_biz_goals);
     • своя задача, вписанная руками.

   Что происходит после сессии:
     • ЗАВЕРШИЛ  → задача уходит в «Завершённые», и галочка ставится В ИСТОЧНИКЕ
                   (дело в разгрузке мозга / шаг цели). Если задача есть и в цели,
                   и в недельном плане — отмечается в обоих местах.
     • НЕ ДОДЕЛАЛ → просим комментарий, задача уходит в «В процессе» и хранит его.
                   Там же копится, сколько времени вложено и сколько подходов.

   Весь доступ к источникам — только через этот модуль. Экран таймера не лезет
   в чужие хранилища напрямую, поэтому при переезде данных в облако менять
   придётся только здесь.
*/
(function () {
  if (typeof window === 'undefined') return;
  if (window.FocusTasks) return;

  var BD_KEY   = 'focus_braindump';
  var GOAL_KEY = 'focus_biz_goals';
  var WEEK_KEY = 'focus_biz_week';
  var TODO_KEY = 'focus_focus_todo';    // «В процессе»
  var DONE_KEY = 'focus_focus_done';    // «Завершённые»

  function read(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) {
      try { if (window.FocusErrors) window.FocusErrors.report('фокус: сохранение задач', e, key); } catch (e2) {}
      return false;
    }
  }

  /* ---------- ЧТО МОЖНО ВЗЯТЬ В ФОКУС ---------- */

  /** Дела из разгрузки мозга: корзины «сейчас» и «план», кроме уже выполненных. */
  function fromBraindump() {
    var d = read(BD_KEY, null);
    if (!d) return [];
    var out = [];
    ['now', 'plan'].forEach(function (bucket) {
      (d[bucket] || []).forEach(function (item) {
        if (!item || item.done) return;
        var text = String(item.text || '').trim();
        if (!text) return;
        out.push({
          key: 'bd:' + bucket + ':' + item.id,
          text: text,
          source: 'braindump',
          sourceLabel: bucket === 'now' ? 'Разгрузка мозга · сейчас' : 'Разгрузка мозга · план',
          ref: { bucket: bucket, id: item.id }
        });
      });
    });
    return out;
  }

  /** Шаги бизнес-целей. Берём именно ШАГИ, а не цели: «запустить продукт» за одну
      сессию не сделать, а «написать текст лендинга» — вполне. */
  function fromGoals() {
    var goals = read(GOAL_KEY, []);
    if (!Array.isArray(goals)) return [];
    var out = [];
    goals.forEach(function (g) {
      (g.steps || []).forEach(function (s) {
        if (!s || s.done) return;
        var text = String(s.text || '').trim();
        if (!text) return;
        out.push({
          key: 'goal:' + g.id + ':' + s.id,
          text: text,
          source: 'goal',
          sourceLabel: 'Цель · ' + String(g.title || '').slice(0, 40),
          ref: { goalId: g.id, stepId: s.id }
        });
      });
    });
    return out;
  }

  /** Всё, что можно взять в фокус, одним списком. */
  function available() {
    return fromBraindump().concat(fromGoals());
  }

  /* ---------- ОТМЕТКА В ИСТОЧНИКЕ ---------- */

  /** Ставит галочку там, откуда задача пришла. Возвращает список затронутых мест. */
  function markSourceDone(task) {
    var marked = [];
    if (!task || !task.ref) return marked;
    try {
      if (task.source === 'braindump') {
        var d = read(BD_KEY, null);
        if (d && d[task.ref.bucket]) {
          d[task.ref.bucket].forEach(function (i) {
            if (i && i.id === task.ref.id) { i.done = true; marked.push('разгрузка мозга'); }
          });
          write(BD_KEY, d);
        }
      } else if (task.source === 'goal') {
        var goals = read(GOAL_KEY, []);
        goals.forEach(function (g) {
          if (g.id !== task.ref.goalId) return;
          (g.steps || []).forEach(function (s) {
            if (s && s.id === task.ref.stepId) { s.done = true; marked.push('цель'); }
          });
        });
        write(GOAL_KEY, goals);

        /* Тот же шаг мог быть перенесён в недельный план — отмечаем и там,
           иначе он останется висеть невыполненным в другом месте. */
        var week = read(WEEK_KEY, {});
        var touched = false;
        Object.keys(week || {}).forEach(function (day) {
          (week[day] || []).forEach(function (it) {
            if (it && (it.stepRef === task.ref.stepId || it.text === task.text) && !it.done) {
              it.done = true; touched = true;
            }
          });
        });
        if (touched) { write(WEEK_KEY, week); marked.push('недельный план'); }
      }
    } catch (e) {
      try { if (window.FocusErrors) window.FocusErrors.report('фокус: отметка в источнике', e); } catch (e2) {}
    }
    return marked;
  }

  /* ---------- ДОДЕЛАТЬ / ЗАВЕРШЁННЫЕ ---------- */

  function todoList() { var l = read(TODO_KEY, []); return Array.isArray(l) ? l : []; }
  function doneList() { var l = read(DONE_KEY, []); return Array.isArray(l) ? l : []; }

  /** Сессия закончилась, дело НЕ доделано: сохраняем с комментарием.
      Комментарий — главное: в следующий раз человек прочитает его, вспомнит
      контекст и продолжит с места, а не начнёт заново. */
  function parkUnfinished(task, comment, seconds) {
    var list = todoList();
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].key === task.key) { idx = i; break; }
    var rec = idx >= 0 ? list[idx] : {
      key: task.key, text: task.text, source: task.source,
      sourceLabel: task.sourceLabel, ref: task.ref,
      seconds: 0, rounds: 0, createdAt: new Date().toISOString()
    };
    rec.comment = String(comment || '').slice(0, 500);
    rec.seconds = (rec.seconds || 0) + (parseInt(seconds, 10) || 0);
    rec.rounds  = (rec.rounds || 0) + 1;
    rec.updatedAt = new Date().toISOString();
    if (idx >= 0) list[idx] = rec; else list.push(rec);
    write(TODO_KEY, list.slice(-100));
    return rec;
  }

  /** Сессия закончилась, дело СДЕЛАНО: в завершённые, галочка в источник,
      и убираем из «В процессе», если оно там висело. */
  function complete(task, seconds) {
    var parked = todoList().filter(function (t) { return t.key === task.key; })[0];
    var total = (parked ? parked.seconds || 0 : 0) + (parseInt(seconds, 10) || 0);
    var rounds = (parked ? parked.rounds || 0 : 0) + 1;

    var marked = markSourceDone(task);

    var done = doneList();
    done.push({
      key: task.key, text: task.text, source: task.source,
      sourceLabel: task.sourceLabel, seconds: total, rounds: rounds,
      markedIn: marked, at: new Date().toISOString()
    });
    write(DONE_KEY, done.slice(-200));

    write(TODO_KEY, todoList().filter(function (t) { return t.key !== task.key; }));
    return { seconds: total, rounds: rounds, markedIn: marked };
  }

  /** Убрать из «В процессе» без завершения (человек передумал). */
  function dropUnfinished(key) {
    write(TODO_KEY, todoList().filter(function (t) { return t.key !== key; }));
  }

  /** Источник задачи мог быть удалён, пока она висела в «В процессе».
      Тогда не ломаемся, а честно помечаем — иначе получится задача-сирота. */
  function sourceAlive(task) {
    if (!task || !task.ref) return true;
    try {
      if (task.source === 'braindump') {
        var d = read(BD_KEY, null);
        if (!d) return false;
        return (d[task.ref.bucket] || []).some(function (i) { return i && i.id === task.ref.id; });
      }
      if (task.source === 'goal') {
        var goals = read(GOAL_KEY, []);
        return goals.some(function (g) {
          return g.id === task.ref.goalId && (g.steps || []).some(function (s) { return s && s.id === task.ref.stepId; });
        });
      }
    } catch (e) {}
    return true;
  }

  /** Своя задача, вписанная руками: источника нет, отмечать нечего. */
  function custom(text) {
    return {
      key: 'own:' + Date.now(),
      text: String(text || '').trim(),
      source: 'own',
      sourceLabel: 'Своя задача',
      ref: null
    };
  }

  function fmtTime(sec) {
    sec = parseInt(sec, 10) || 0;
    var h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    if (h && m) return h + ' ч ' + m + ' мин';
    if (h) return h + ' ч';
    return (m || 1) + ' мин';
  }

  window.FocusTasks = {
    available: available,
    fromBraindump: fromBraindump,
    fromGoals: fromGoals,
    todoList: todoList,
    doneList: doneList,
    parkUnfinished: parkUnfinished,
    complete: complete,
    dropUnfinished: dropUnfinished,
    sourceAlive: sourceAlive,
    custom: custom,
    fmtTime: fmtTime
  };
})();
