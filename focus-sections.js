/* FOCUS — РЕЕСТР РАЗДЕЛОВ (единый источник для ИИ-ассистента)
   =========================================================================
   Каждый раздел: name, aliases, screen, fill(data), summary().
   summary() отдаёт ИИ РЕАЛЬНОЕ наполнение раздела (упражнения, программы,
   привычки, желания) — чтобы ассистент ЗНАЛ что внутри и заполнял грамотно.
   ========================================================================= */
(function () {
  'use strict';

  function today() { return new Date().toISOString().slice(0, 10); }
  function readJSON(key, def) { try { return JSON.parse(localStorage.getItem(key)) || def; } catch (e) { return def; } }
  function writeJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function markDone(section) { try { if (window.FocusRewards) FocusRewards.mark(section.group, section.reward); } catch (e) {} }
  function splitItems(data) {
    var s = String(data || '').trim();
    // если есть разделители | или переносы — по ним
    if (/[|\n]/.test(s)) {
      return s.split(/\s*\|\s*|\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    }
    // "1. X 2. Y" или "1) X 2) Y" или "1 X 2 Y 3 Z" — по номерам пунктов
    if (/(^|\s)\d+[.)\s]/.test(s) && (s.match(/(^|\s)\d+[.)\s]/g) || []).length >= 2) {
      return s.split(/(?:^|\s)\d+[.)]\s*|(?:^|\s)(?=\d\s)\d\s+/).map(function (x) { return x.trim(); }).filter(Boolean);
    }
    return [s].filter(Boolean);
  }
  function cap(s) { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  var SECTIONS = {

    workout: {
      name: 'Зарядка', group: 'body', reward: 'workout',
      aliases: ['зарядк', 'размин', 'упражнени утренн'],
      screen: 'fokus_workout.html',
      fill: function (data) {
        var d = today();
        try { localStorage.setItem('focus_workout_note_' + d, cap(data) || 'Зарядка выполнена'); } catch (e) {}
        // ПОСТАВИТЬ ГАЛОЧКИ: свои упражнения, а если их нет — дефолтные id 1-6 (как в разделе Зарядка)
        try {
          var ex = readJSON('focus_workout_exercises', []);
          var ids = (ex && ex.length) ? ex.map(function (e) { return e.id; }) : [1, 2, 3, 4, 5, 6];
          var checks = readJSON('focus_workout_checks_' + d, {});
          ids.forEach(function (id) { checks[id] = Date.now(); });
          writeJSON('focus_workout_checks_' + d, checks);
          // завершённый день зарядки (для прогресса)
          try {
            var days = readJSON('focus_workout_days', []);
            if (days.indexOf(d) === -1) { days.push(d); writeJSON('focus_workout_days', days); }
          } catch (e) {}
        } catch (e) {}
        markDone(this);
        return 'Отметил зарядку: ' + (cap(data) || 'выполнена');
      },
      summary: function () {
        var d = today();
        var ex = readJSON('focus_workout_exercises', []);
        var ids = (ex && ex.length) ? ex.map(function (e) { return e.id; }) : [1, 2, 3, 4, 5, 6];
        var checks = readJSON('focus_workout_checks_' + d, {});
        var doneCount = ids.filter(function (id) { return checks[id]; }).length;
        var status = doneCount >= ids.length ? 'СЕГОДНЯ ВЫПОЛНЕНА (все отмечены)' : (doneCount > 0 ? ('сегодня частично: ' + doneCount + '/' + ids.length) : 'СЕГОДНЯ НЕ отмечена');
        var list = (ex && ex.length) ? (' Упражнения: ' + ex.map(function (e) { return e.name; }).join(', ') + '.') : '';
        return 'Зарядка — ' + status + '.' + list;
      }
    },
    training: {
      name: 'Тренировка', group: 'body', reward: 'training',
      aliases: ['тренировк', 'тренинг', 'качал', 'зал', 'программ трениров', 'план трениров'],
      screen: 'fokus_training.html',
      fill: function (data) {
        var programs = readJSON('focus_trainings', []);
        var dl = String(data || '').toLowerCase().trim();
        // нет ни одной тренировки — просим создать (универсально, без хардкода названий)
        if (!programs.length) {
          return '__NEEDCREATE__У тебя пока нет ни одной тренировки. Сначала создай её в разделе «Тренировки» — потом отмечу по плану.';
        }
        var prog = programs.filter(function (p) { return p.name; }).find(function (p) {
          var pn = p.name.toLowerCase();
          return dl && (dl.indexOf(pn.split(' ')[0]) !== -1 || pn.indexOf(dl.split(' ')[0]) !== -1);
        });
        if (!prog && programs.length === 1 && !dl) prog = programs[0]; // подставляем одну ТОЛЬКО если юзер не назвал конкретную
        if (!prog) {
          var names = programs.map(function (p) { return p.name; }).filter(Boolean).join(', ');
          return '__NEEDCREATE__Не нашёл такую тренировку. У тебя есть: ' + names + '. Какую отметить? Если нужна новая — создай в разделе «Тренировки».';
        }
        prog.lastDate = new Date().toLocaleDateString('ru-RU');
        // ОТМЕЧАЕМ упражнения программы выполненными (план/факт) — ИИ как слуга закрывает всю тренировку
        if (Array.isArray(prog.exercises)) {
          prog.exercises.forEach(function (ex) {
            ex.checked = true;
            // если факт по подходам не заполнен — переносим план в факт
            if (Array.isArray(ex.sets)) ex.sets.forEach(function (s) { if (s.reps != null && s.factReps == null) s.factReps = s.reps; if (s.weight != null && s.factWeight == null) s.factWeight = s.weight; });
          });
        }
        writeJSON('focus_trainings', programs);
        var arch = readJSON('focus_training_archive', []);
        arch.push({ date: today(), note: prog.name, done: true });
        writeJSON('focus_training_archive', arch);
        markDone(this);
        return 'Отметил тренировку ' + prog.name.toLowerCase() + ' — засчитано ✓';
      },
      summary: function () {
        var tr = readJSON('focus_trainings', []);
        if (!tr.length) return null;
        return 'Программы тренировок юзера: ' + tr.map(function (t) {
          var exs = (t.exercises || []).map(function (e) { return e.name; }).filter(Boolean);
          return '«' + (t.name || 'без имени') + '»' + (exs.length ? ' (' + exs.slice(0, 8).join(', ') + ')' : '');
        }).join('; ');
      }
    },
    nutrition: {
      name: 'Питание', group: 'body', reward: 'nutrition',
      aliases: ['поел', 'съел', 'питани', 'еда', 'завтрак', 'обед', 'ужин', 'перекус'],
      screen: 'fokus_nutrition.html',
      fill: function (data) {
        markDone(SECTIONS.nutrition);   // отмечаем в Прогрессе (раньше не отмечалось!)
        var d = today();
        var nt = readJSON('focus_nutrition_today', {});
        if (nt.date !== d) nt = { date: d, meals: { breakfast: [], lunch: [], dinner: [], snack: [] } };
        if (!nt.meals) nt.meals = { breakfast: [], lunch: [], dinner: [], snack: [] };
        var dl = String(data || '').toLowerCase();
        var meal = 'snack';
        if (dl.indexOf('завтрак') !== -1) meal = 'breakfast';
        else if (dl.indexOf('обед') !== -1) meal = 'lunch';
        else if (dl.indexOf('ужин') !== -1) meal = 'dinner';
        splitItems(data).forEach(function (txt) { nt.meals[meal].push({ name: cap(txt), cal: 0, prot: 0, fat: 0, carb: 0, id: Date.now() + Math.random() }); });
        writeJSON('focus_nutrition_today', nt);
        var fin = readJSON('focus_nutrition_finished', []);
        if (fin.indexOf(d) === -1) { fin.push(d); writeJSON('focus_nutrition_finished', fin); }
        return 'Записал в питание: ' + cap(data);
      },
      summary: function () {
        var nt = readJSON('focus_nutrition_today', {});
        if (!nt.meals || nt.date !== today()) return null;
        var all = [].concat(nt.meals.breakfast || [], nt.meals.lunch || [], nt.meals.dinner || [], nt.meals.snack || []).map(function (m) { return m.name; });
        return all.length ? 'Сегодня поел: ' + all.join(', ') : null;
      }
    },
    medications: {
      name: 'Лекарства', group: 'body', reward: 'medications',
      aliases: ['лекарств', 'таблетк', 'принял препарат', 'выпил лекарств'],
      screen: 'fokus_medications.html',
      fill: function (data) {
        markDone(SECTIONS.medications);   // отмечаем в Прогрессе (раньше не отмечалось!)
        var meds = readJSON('focus_medications', []);
        if (!meds.length) return '__NEEDCREATE__У тебя пока нет лекарств в списке. Сначала добавь их в разделе «Лекарства» — потом отмечу приём.';
        if (!data) return null;
        var dl = String(data).toLowerCase();
        var med = meds.find(function (m) { return dl.indexOf((m.name || '').toLowerCase()) !== -1; });
        if (!med) {
          var names = meds.map(function (m) { return m.name; }).filter(Boolean).join(', ');
          return '__NEEDCREATE__Не нашёл такое лекарство. У тебя есть: ' + names + '. Новое добавь в разделе «Лекарства».';
        }
        var key = 'focus_med_taken_' + today();
        /* ФОРМАТ КАК В РАЗДЕЛЕ: taken = { medId: [метки времени приёма] }.
           Раньше писался массив id — раздел «Лекарства» такой формат не понимал,
           и приём, отмеченный через ИИ, в разделе НЕ появлялся (галочки не было). */
        var taken = readJSON(key, {});
        if (!Array.isArray(taken[med.id])) taken[med.id] = [];
        taken[med.id].push(Date.now());
        writeJSON(key, taken);
        return 'Отметил приём лекарства: ' + med.name;
      },
      summary: function () {
        var meds = readJSON('focus_medications', []);
        if (!meds.length) return null;
        return 'Лекарства юзера: ' + meds.map(function (m) { return m.name + (m.time ? ' (' + m.time + ')' : ''); }).filter(Boolean).join(', ');
      }
    },
    supplements: {
      name: 'БАДы и спортпит', group: 'body', reward: 'supplements',
      aliases: ['бад', 'витамин', 'протеин', 'креатин', 'добавк', 'спортпит'],
      screen: 'fokus_supplements.html',
      fill: function (data) {
        markDone(SECTIONS.supplements);   // отмечаем в Прогрессе (раньше не отмечалось!)
        var supps = readJSON('focus_supplements', []);
        if (!supps.length) return '__NEEDCREATE__У тебя пока нет БАДов/спортпита в списке. Сначала добавь их в разделе «БАДы и спортпит».';
        if (!data) return null;
        var dl = String(data).toLowerCase();
        var s = supps.find(function (x) { return dl.indexOf((x.name || '').toLowerCase()) !== -1; });
        if (!s) {
          var names = supps.map(function (x) { return x.name; }).filter(Boolean).join(', ');
          return '__NEEDCREATE__Не нашёл такую добавку. У тебя есть: ' + names + '. Новую добавь в разделе «БАДы и спортпит».';
        }
        var key = 'focus_supp_taken_' + today();
        /* ФОРМАТ КАК В РАЗДЕЛЕ: { id: [метки времени] } — а не массив id.
           Иначе приём БАДа через ИИ в разделе не отображался. */
        var taken = readJSON(key, {});
        if (!Array.isArray(taken[s.id])) taken[s.id] = [];
        taken[s.id].push(Date.now());
        writeJSON(key, taken);
        return 'Отметил приём: ' + s.name;
      },
      summary: function () {
        var supps = readJSON('focus_supplements', []);
        if (!supps.length) return null;
        return 'БАДы/спортпит юзера: ' + supps.map(function (s) { return s.name; }).filter(Boolean).join(', ');
      }
    },

    sleep: {
      name: 'Сон', group: 'energy', reward: 'sleep',
      aliases: ['спал', 'сон', 'выспал', 'проснул', 'лёг'],
      screen: 'fokus_sleep.html',
      fill: function (data) {
        markDone(SECTIONS.sleep);   // отмечаем в Прогрессе (раньше не отмечалось!)
        var d = today();
        var hours = parseFloat(String(data || '').replace(',', '.')) || 8;
        var entries = readJSON('focus_sleep_entries', []);
        entries = entries.filter(function (e) { return e.date !== d; });
        entries.push({ date: d, hours: hours, quality: 3, note: 'Записал ассистент' });
        writeJSON('focus_sleep_entries', entries);
        return 'Записал сон: ' + hours + ' ч';
      },
      summary: function () {
        var e = readJSON('focus_sleep_entries', []);
        if (!e.length) return null;
        var last = e[e.length - 1];
        return 'Последний сон юзера: ' + last.hours + ' ч';
      }
    },
    breathing: {
      name: 'Дыхание', group: 'energy', reward: 'breathing',
      aliases: ['дыхани', 'дыхательн', 'подышал'],
      screen: 'fokus_breathing.html',
      fill: function (data) {
        var d = today();
        var log = readJSON('focus_breathing_log', []);
        log.push({ id: Date.now(), tech: cap(data) || 'Дыхательная практика', min: 5, cycles: 0, date: d });
        writeJSON('focus_breathing_log', log);
        markDone(this);
        return 'Отметил дыхательную практику';
      },
      summary: function () {
        var log = readJSON('focus_breathing_log', []);
        if (!log.length) return null;
        return 'Дыхательных практик записано: ' + log.length;
      }
    },
    rest: {
      name: 'Отдых и детокс', group: 'energy', reward: 'detox',
      aliases: ['отдых', 'детокс', 'релакс'],
      screen: 'fokus_rest.html',
            summary: function () {
        var r = readJSON('focus_rest_today', null);
        if (!r) return null;
        return 'Отдых сегодня: ' + (r.text || r.type || 'отмечен') + '.';
      },
fill: function (data) {
        markDone(SECTIONS.rest);   // отмечаем в Прогрессе (раньше не отмечалось!)
        var log = readJSON('focus_detox_log', []);
        var mins = parseInt(String(data || '').match(/\d+/)) || 30;
        log.push({ id: Date.now(), date: today(), minutes: mins });
        writeJSON('focus_detox_log', log);
        return 'Отметил отдых: ' + mins + ' мин';
      }
    },

    braindump: {
      name: 'Разгрузка мозга', group: 'mental', reward: 'braindump',
      aliases: ['разгрузк', 'мысл', 'висяк', 'выгруз', 'braindump', 'дела из головы'],
      screen: 'fokus_braindump.html',
      fill: function (data) {
        markDone(SECTIONS.braindump);   // отмечаем в Прогрессе (раньше не отмечалось!)
        var bd = readJSON('focus_braindump', null);
        if (!bd || typeof bd !== 'object') bd = { inbox: [], now: [], plan: [], drop: [] };
        bd.inbox = bd.inbox || [];
        var items = splitItems(data);
        // номер ДОЛЖЕН быть целым — кнопки на странице ищут дела через parseInt.
        // Раньше ИИ ставил дробный номер (Date.now() + Math.random()) → дело не находилось,
        // и кнопки «в план» / «отпустить» на нём не работали.
        var _n = Date.now();
        (items.length ? items : ['Задача']).forEach(function (txt, i) {
          bd.inbox.push({ id: _n + i, text: cap(txt), done: false });
        });
        writeJSON('focus_braindump', bd);
        return 'Добавил в разгрузку мозга: ' + (items.map(cap).join(', ') || 'задачу');
      },
      summary: function () {
        var bd = readJSON('focus_braindump', null);
        if (!bd) return null;
        // номера всех дел, уже уехавших в архив — их ИИ видеть НЕ должен
        var archived = {};
        (bd.doneLog || []).forEach(function(x){ archived[String(x.id)] = true; });
        function line(arr, label) {
          var act = (arr || []).filter(function(x){ return !x.done && !archived[String(x.id)]; });
          if (!act.length) return null;
          // ВАЖНО: отдаём ИИ НОМЕРА дел — чтобы он отмечал существующее по номеру,
          // а не создавал новое «на всякий случай».
          return label + ': ' + act.slice(0, 12).map(function (x) {
            return '[#' + x.id + '] ' + x.text + (x.deadline ? ' (срок ' + x.deadline + ')' : '');
          }).join('; ');
        }
        var parts = [
          line(bd.inbox, 'ВХОДЯЩИЕ (не разобрано)'),
          line(bd.now, 'СДЕЛАТЬ СЕЙЧАС'),
          line(bd.plan, 'ЗАПЛАНИРОВАНО')
        ].filter(Boolean);
        if (!parts.length) return null;
        return 'Разгрузка мозга (АКТИВНЫЕ ДЕЛА С НОМЕРАМИ) — ' + parts.join('. ') + '.';
      },
      /** Отметить дело выполненным. Принимает НОМЕР (#id) или текст (ищем по словам).
          НИКОГДА не создаёт новое дело — если не нашли, честно говорим. */
      complete: function (data) {
        var bd = readJSON('focus_braindump', null);
        if (!bd) return 'В разгрузке мозга пусто.';
        var q = String(data == null ? '' : data).trim();

        var target = null, col = null;
        var cols = ['now', 'plan', 'inbox'];

        // 0) ТОЧНОЕ совпадение с номером дела — любой длины.
        //    ИИ по контракту присылает номер из справки. Новые дела имеют длинный номер,
        //    но у старых он мог быть коротким — и тогда отметка молча не срабатывала:
        //    ассистент отвечал «отметил», а дело оставалось активным.
        cols.forEach(function (c) {
          (bd[c] || []).forEach(function (it) {
            if (!target && String(it.id) === q) { target = it; col = c; }
          });
        });

        // 1) номер внутри текста (#1784017712488) — самый точный путь
        var idm = target ? null : q.match(/#?(\d{6,})/);
        var wantId = idm ? parseInt(idm[1], 10) : null;
        if (wantId) {
          cols.forEach(function (c) {
            (bd[c] || []).forEach(function (it) { if (!target && it.id === wantId) { target = it; col = c; } });
          });
        }

        // 2) по словам: берём дело с наибольшим совпадением значимых слов
        if (!target) {
          var words = q.toLowerCase().replace(/[^\wа-яё\s]/gi, ' ').split(/\s+/)
                       .filter(function (w) { return w.length > 3; });
          var best = 0;
          cols.forEach(function (c) {
            (bd[c] || []).forEach(function (it) {
              if (it.done) return;
              var t = String(it.text || '').toLowerCase();
              var hits = words.filter(function (w) { return t.indexOf(w) !== -1; }).length;
              if (hits > best) { best = hits; target = it; col = c; }
            });
          });
          if (best === 0) target = null;
        }

        if (!target) return 'Не нашёл такое дело в разгрузке мозга — ничего не менял. Уточни, какое именно?';

        target.done = true;
        target.doneAt = Date.now();
        bd.doneLog = bd.doneLog || [];
        bd.doneLog.push({ id: target.id, text: target.text, at: target.doneAt, from: col });
        writeJSON('focus_braindump', bd);
        return 'Отметил выполненным: ' + target.text;
      }
    },
    mood: {
      name: 'Настроение', group: 'mental', reward: 'mood',
      aliases: ['настроени', 'чувству', 'эмоци', 'самочувстви'],
      screen: 'fokus_mood.html',
      fill: function (data) {
        markDone(SECTIONS.mood);   // отмечаем в Прогрессе (раньше не отмечалось!)
        var entries = readJSON('focus_mood_entries', []);
        entries.push({ id: Date.now(), date: today(), t: Date.now(), mood: cap(data) || 'нормальное', note: '', tags: [], chat: [] });
        writeJSON('focus_mood_entries', entries);
        return 'Записал настроение: ' + (cap(data) || 'отмечено');
      },
      summary: function () {
        var e = readJSON('focus_mood_entries', []);
        if (!e.length) return null;
        return 'Последнее настроение юзера: ' + (e[e.length - 1].mood || '—');
      }
    },

    relationships: {
      name: 'Отношения', group: 'relationships', reward: 'relationships',
      aliases: ['отношени', 'друг', 'долг', 'позвонить', 'встретил'],
      screen: 'fokus_relationships.html',
      fill: function (data) {
        markDone(SECTIONS.relationships);   // отмечаем в Прогрессе (раньше не отмечалось!)
        return 'Для раздела «Отношения» открой его — там удобнее добавить контакт/задачу. Могу поставить напоминание.';
      },
      summary: function () {
        var r = readJSON('focus_relationships', []);
        if (!r.length) return null;
        return 'Люди в разделе отношений: ' + r.map(function (x) { return x.name; }).filter(Boolean).slice(0, 8).join(', ');
      }
    },

    gratitude: {
      name: 'Благодарность', group: 'faith', reward: 'gratitude',
      aliases: ['благодар', 'спасибо за', 'признател'],
      screen: 'fokus_gratitude.html',
      fill: function (data) {
        var d = today();
        var grats = readJSON('faith_gratitudes', []);
        var items = splitItems(data).map(cap);
        if (!items.length) items = ['За день'];
        var todayEntry = grats.find(function (e) { return e.date === d; });
        if (todayEntry) { todayEntry.items = (todayEntry.items || []).concat(items); }
        else { grats.push({ id: Date.now(), date: d, dateLabel: new Date().toLocaleDateString('ru-RU'), items: items }); }
        writeJSON('faith_gratitudes', grats);
        markDone(this);
        return 'Записал благодарност' + (items.length > 1 ? 'и (' + items.length + '): ' : 'ь: ') + items.join(', ');
      },
      summary: function () {
        var g = readJSON('faith_gratitudes', []);
        var t = g.find(function (e) { return e.date === today(); });
        if (!t || !t.items || !t.items.length) return null;
        return 'Сегодня уже благодарен за: ' + t.items.join(', ');
      }
    },
    faith_habits: {
      name: 'Духовные привычки', group: 'faith', reward: 'habit',
      aliases: ['привычк', 'молитв', 'храм', 'ритуал', 'практик духовн', 'помолил', 'намаз'],
      screen: 'fokus_faith_habits.html',
      fill: function (data) {
        var habits = readJSON('faith_habits', []);
        if (!data) return null;
        var dl = String(data).toLowerCase();
        var h = habits.find(function (x) { return dl.indexOf((x.name || '').toLowerCase()) !== -1 || (x.name || '').toLowerCase().indexOf(dl.split(' ')[0]) !== -1; });
        var d = today();
        if (h) {
          h.done = h.done || [];
          if (h.done.indexOf(d) === -1) h.done.push(d);
          writeJSON('faith_habits', habits);
          try { var days = readJSON('focus_habit_reward', []); if (days.indexOf(d) === -1) { days.push(d); writeJSON('focus_habit_reward', days); } } catch (e) {}
          markDone(this);
          return 'Отметил духовную привычку: ' + h.name;
        }
        habits.push({ id: Date.now(), name: cap(data), done: [d] });
        writeJSON('faith_habits', habits);
        markDone(this);
        return 'Добавил духовную привычку: ' + cap(data);
      },
      summary: function () {
        var h = readJSON('faith_habits', []);
        if (!h.length) return null;
        return 'Духовные привычки юзера: ' + h.map(function (x) { return x.name; }).filter(Boolean).join(', ');
      }
    },
    /* ФИНАНСЫ — ИИ может записать трату/доход по команде («потратил 500 на еду») */
    finance: {
      name: 'Финансы', group: 'reward', reward: 'habit',
      aliases: ['финанс', 'деньг', 'потратил', 'трата', 'доход', 'заработал', 'купил за', 'расход', 'бюджет'],
      screen: 'fokus_finance.html',
      fill: function (data) {
        markDone(SECTIONS.finance);
        var txs = readJSON('focus_fin_txs', []);
        var str = String(data || '');
        // сумма
        var am = str.match(/(\d[\d\s]*)\s*(?:р|руб|₽)?/i);
        var amount = am ? parseInt(am[1].replace(/\s/g, ''), 10) : 0;
        if (!amount) return 'Не понял сумму — скажи, например: «потратил 500 на продукты».';
        var isIncome = /доход|заработ|получил|зарплат|пришл/i.test(str);
        var desc = str.replace(/(\d[\d\s]*)\s*(?:р|руб|₽)?/i, '').replace(/^(на|за|потратил|доход|заработал)\s*/i, '').trim();
        txs.push({
          id: Date.now(), type: isIncome ? 'income' : 'expense',
          amount: amount, cat: desc || 'разное', family: false,
          desc: desc || '', date: new Date().toISOString().slice(0, 10)
        });
        writeJSON('focus_fin_txs', txs);
        return (isIncome ? 'Записал доход ' : 'Записал трату ') + amount + '₽' + (desc ? ' — ' + desc : '');
      },
      summary: function () {
        var txs = readJSON('focus_fin_txs', []);
        if (!txs.length) return null;
        var today = new Date().toISOString().slice(0, 10);
        var sp = 0, inc = 0;
        txs.forEach(function (t) {
          if (t.date === today) { if (t.type === 'income') inc += (t.amount || 0); else sp += (t.amount || 0); }
        });
        return 'Финансы сегодня: потрачено ' + sp + '₽, доход ' + inc + '₽ (всего записей: ' + txs.length + ').';
      }
    },

    /* ИСТОЧНИКИ ЭНЕРГИИ — что наполняет/забирает силы */
    energy_sources: {
      name: 'Источники энергии', group: 'energy', reward: 'habit',
      aliases: ['энерги', 'источник', 'наполня', 'заряжа', 'выматыва', 'силы', 'ресурс'],
      screen: 'fokus_energy_sources.html',
      fill: function (data) {
        markDone(SECTIONS.energy_sources);
        var list = readJSON('focus_energy_sources', []);
        String(data || '').split(/[,;\n]+/).forEach(function (t) {
          t = t.trim();
          if (!t) return;
          var minus = /вымат|забира|минус|устал|тян/i.test(t);
          list.push({ id: Date.now() + Math.random(), text: t, type: minus ? 'drain' : 'source', at: Date.now() });
        });
        writeJSON('focus_energy_sources', list);
        return 'Записал в источники энергии.';
      },
      summary: function () {
        var list = readJSON('focus_energy_sources', []);
        if (!list.length) return null;
        var src = list.filter(function (x) { return x.type !== 'drain'; }).slice(-5).map(function (x) { return x.text; });
        var dr = list.filter(function (x) { return x.type === 'drain'; }).slice(-5).map(function (x) { return x.text; });
        var p = [];
        if (src.length) p.push('наполняет: ' + src.join(', '));
        if (dr.length) p.push('забирает силы: ' + dr.join(', '));
        return 'Энергия юзера — ' + p.join('; ') + '.';
      }
    },

    wishmap: {
      name: 'Карта желаний', group: 'faith', reward: 'wish',
      aliases: ['желани', 'мечт', 'карта желани', 'цел мечт', 'хочу'],
      screen: 'fokus_wishmap.html',
      fill: function (data) {
        if (!data) return null;
        var cards = readJSON('faith_wishCards', []);
        var card = cards[0];
        if (!card) { card = { id: Date.now(), name: 'Мои желания', wishes: [] }; cards.push(card); }
        card.wishes = card.wishes || [];
        splitItems(data).forEach(function (txt) { card.wishes.push({ id: Date.now() + Math.random(), label: cap(txt), icon: '✨', imageData: null }); });
        writeJSON('faith_wishCards', cards);
        markDone(this);
        return 'Добавил в карту желаний: ' + splitItems(data).map(cap).join(', ');
      },
      summary: function () {
        var cards = readJSON('faith_wishCards', []);
        var all = [].concat.apply([], cards.map(function (c) { return (c.wishes || []).map(function (w) { return w.label; }); }));
        if (!all.length) return null;
        return 'Желания юзера: ' + all.slice(0, 8).join(', ');
      }
    }
  };

  function detect(text) {
    var t = (text || '').toLowerCase();
    for (var id in SECTIONS) {
      var s = SECTIONS[id];
      if (s.aliases && s.aliases.some(function (a) { return t.indexOf(a) !== -1; })) return id;
    }
    return null;
  }

  function listForPrompt() {
    return Object.keys(SECTIONS).map(function (id) { return id + ' (' + SECTIONS[id].name + ')'; }).join(', ');
  }

  function userContext() {
    var parts = [];
    for (var id in SECTIONS) {
      if (SECTIONS[id].summary) {
        try { var s = SECTIONS[id].summary(); if (s) parts.push(s); } catch (e) {}
      }
    }
    return parts.join('. ');
  }

  /* ЦЕНТРАЛЬНЫЙ хук: после заполнения раздела ОТМЕЧАЕМ АКТИВНОСТЬ В ПРОГРЕССЕ.
     Раньше данные писались в раздел, но прогресс (focus_activity_days) об этом НЕ узнавал —
     поэтому «ИИ заполнил тренировку», а в Прогрессе пусто и стрик не растёт.
     Теперь любое заполнение (и руками, и через ИИ) отражается в прогрессе и даёт монеты за стрик. */
  function markProgress(id) {
    try {
      var s = SECTIONS[id];
      if (s && s.group && window.FocusRewards && window.FocusRewards.mark) {
        window.FocusRewards.mark(s.group, s.reward || id);
      }
    } catch (e) {}
  }

  function fill(id, data, ctx) {
    var s = SECTIONS[id];
    if (!s || !s.fill) return null;
    try {
      var r = s.fill(data, ctx || {});
      markProgress(id);   // ← синхронизируем прогресс
      return r;
    } catch (e) { return null; }
  }

  /** Отметить дело выполненным в разделе (если раздел это поддерживает). */
  function complete(id, data) {
    var s = SECTIONS[id];
    if (!s || !s.complete) return null;
    try {
      var r = s.complete(data);
      markProgress(id);   // выполнение дела тоже = активность в прогрессе
      return r;
    } catch (e) { return null; }
  }

  /** Нормализуем название колонки: понимает и русские слова, и английские id. */
  function normCol(c) {
    var s = String(c || '').toLowerCase().trim();
    if (/план|plan|запланир/.test(s)) return 'plan';
    if (/сейчас|сегодн|now|делаю|в работ/.test(s)) return 'now';
    if (/отпуст|drop|мусор|удал/.test(s)) return 'drop';
    return 'inbox';
  }

  /**
   * УНИВЕРСАЛЬНОЕ действие для дел: создать ИЛИ перенести дело в нужную колонку и поставить срок.
   * Работает для разделов со списками дел (сейчас — «Разгрузка мозга»); для остальных
   * разделов мягко откатывается на обычное заполнение, чтобы ничего не ломать.
   *   section  — id раздела ('braindump' по умолчанию)
   *   text     — текст дела
   *   column   — 'plan' | 'now' | 'inbox' | 'drop' (или по-русски: «план», «сейчас»)
   *   deadline — 'YYYY-MM-DD' или null
   */
  function planTask(section, text, column, deadline) {
    var id = String(section || 'braindump').toLowerCase();
    var txt = String(text || '').trim();
    if (!txt) return null;
    var col = normCol(column);
    var dl = deadline ? String(deadline) : null;

    // разделы со списком дел и колонками
    if (id === 'braindump') {
      var bd = readJSON('focus_braindump', null);
      if (!bd || typeof bd !== 'object') bd = { inbox: [], now: [], plan: [], drop: [] };
      ['inbox', 'now', 'plan', 'drop'].forEach(function (k) { bd[k] = bd[k] || []; });

      // ищем такое же дело в любой колонке — тогда ПЕРЕНОСИМ, а не плодим дубль
      var low = txt.toLowerCase(), found = null, fromCol = null;
      ['inbox', 'now', 'plan', 'drop'].forEach(function (k) {
        if (found) return;
        for (var i = 0; i < bd[k].length; i++) {
          var t = String(bd[k][i].text || '').toLowerCase();
          if (t === low || t.indexOf(low) !== -1 || low.indexOf(t) !== -1) {
            found = bd[k].splice(i, 1)[0]; fromCol = k; return;
          }
        }
      });

      var item = found || { id: Date.now() + Math.floor(Math.random() * 1000), text: cap(txt), done: false };
      item.done = false;
      if (dl) item.deadline = dl;
      else if (!('deadline' in item)) item.deadline = null;
      bd[col].push(item);
      writeJSON('focus_braindump', bd);
      markProgress('braindump');

      var COLRU = { plan: 'Запланировано', now: 'Сейчас', inbox: 'Входящие', drop: 'Отпущено' };
      var msg = (found ? 'Перенёс «' : 'Добавил «') + item.text + '» в «' + COLRU[col] + '»';
      if (dl) {
        var d = new Date(dl + 'T00:00:00');
        msg += isNaN(d.getTime()) ? '' : (' — срок ' + d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }));
      }
      return msg;
    }

    // остальные разделы: колонок нет — просто записываем в раздел (ничего не ломаем)
    var r = fill(id, txt);
    if (r && dl) r += ' (срок ' + dl + ')';
    return r;
  }

  /** УНИВЕРСАЛЬНОЕ СОЗДАНИЕ. ИИ может создать сущность в ЛЮБОМ разделе, где это может юзер:
      упражнение зарядки, программу тренировок, лекарство, БАД, задачу, желание, копилку,
      источник энергии. Раньше ИИ умел только тренировки — остальное просил делать руками. */
  function createEntity(section, payload) {
    var sec = String(section || '').toLowerCase();
    var p = payload || {};
    var name = String(p.name || p.data || '').trim();

    // ── ЛЕКАРСТВА и БАДЫ ──
    if (sec === 'medications' || sec === 'supplements') {
      if (!name) return null;
      var key = sec === 'medications' ? 'focus_medications' : 'focus_supplements';
      var arr = readJSON(key, []);
      if (!Array.isArray(arr)) arr = [];
      if (arr.some(function (x) { return String(x.name || '').toLowerCase() === name.toLowerCase(); })) {
        return '«' + cap(name) + '» уже есть в списке';
      }
      var perDay = parseInt(p.perDay || p.timesPerDay || p.count, 10) || 1;
      var times = Array.isArray(p.times) && p.times.length ? p.times : null;
      if (!times) {                       // расставляем приёмы по дню, юзер потом поправит
        times = [];
        if (perDay <= 1) times = ['09:00'];
        else { var st = 9, en = 21, step = (en - st) / (perDay - 1);
               for (var i = 0; i < perDay; i++) times.push(String(Math.min(23, Math.round(st + step * i))).padStart(2, '0') + ':00'); }
      }
      var FREQ = { 1: 'once', 2: 'twice', 3: 'thrice' };
      arr.push({ id: Date.now(), name: cap(name), dosage: String(p.dosage || '').trim(),
                 time: times[0], times: times, freq: FREQ[times.length] || 'once' });
      writeJSON(key, arr);
      markProgress(sec);
      return (sec === 'medications' ? 'Добавил лекарство «' : 'Добавил БАД «') + cap(name) + '» — ' +
             times.length + ' приём(а) в день: ' + times.join(', ');
    }

    // ── УПРАЖНЕНИЕ ЗАРЯДКИ ──
    if (sec === 'workout') {
      var list = splitItems(name);
      if (!list.length) return null;
      var ex = readJSON('focus_workout_exercises', []);
      if (!Array.isArray(ex)) ex = [];
      var added = [];
      list.forEach(function (raw, i) {
        var m = raw.match(/(\d+)\s*[xх*]\s*(\d+)/i);
        var sets = m ? parseInt(m[1], 10) : (parseInt(p.sets, 10) || 3);
        var reps = m ? parseInt(m[2], 10) : (parseInt(p.reps, 10) || 10);
        var nm = raw.replace(/(\d+)\s*[xх*]\s*(\d+)/i, '').trim();
        if (!nm) return;
        ex.push({ id: Date.now() + i, name: cap(nm), sets: sets, reps: reps || '—' });
        added.push(cap(nm));
      });
      if (!added.length) return null;
      writeJSON('focus_workout_exercises', ex);
      markProgress('workout');
      return 'Добавил в зарядку: ' + added.join(', ');
    }

    // ── ПРОГРАММА ТРЕНИРОВОК ──
    // ── ПРОГРАММА ТРЕНИРОВОК (на срок, с частотой в неделю) ──
    if (sec === 'program' || sec === 'workout_program') {
      return createProgram(name, p.days || p.periodDays, p.perWeek || p.timesPerWeek, p.exercises || p.items || []);
    }

    if (sec === 'training') return createTraining(name, p.exercises || p.items || []);

    // ── ФИНАНСЫ: копилка ИЛИ разовая трата/доход — это разные вещи ──
    if (sec === 'finance' || sec === 'piggy') {
      if (!name) return null;
      var ftxt = (name + ' ' + String(p.type || '')).toLowerCase();
      var wantPiggy = (sec === 'piggy') || (p.target != null && p.target !== '') ||
                      /копилк|накоп|отложить|коплю|цель на|на мечту/.test(ftxt);
      var wantTx = /потрат|трат|расход|доход|заработ|получил|купил|зарплат|пришл|оплатил/.test(ftxt);

      // трата/доход → обычная запись транзакции (НЕ копилка)
      if (!wantPiggy && (wantTx || (p.amount != null && p.amount !== ''))) {
        var amt = (p.amount != null && p.amount !== '') ? (' ' + p.amount) : '';
        return fill('finance', name + amt);
      }
      // непонятно — просим уточнить одним коротким вопросом
      if (!wantPiggy && !wantTx) return 'Уточни, пожалуйста: создать копилку или записать трату?';

      var pig = readJSON('focus_fin_piggies', []);
      if (!Array.isArray(pig)) pig = [];
      var tgtRaw = (p.target != null && p.target !== '') ? p.target : name;   // сумму берём из цели, не из траты
      var target = parseInt(String(tgtRaw).replace(/\D/g, ''), 10) || 0;
      var pigName = cap(String(name).replace(/копилк[а-я]*|накоп[а-я]*|отлож[а-я]*|цель|хочу/gi, '').replace(/\d[\d\s]*/g, '').trim() || name);
      pig.push({ id: Date.now() + '' + Math.floor(Math.random() * 1000), name: pigName, target: target,
                 saved: 0, emoji: p.emoji || '🐷', deadline: p.deadline || null, created: new Date().toISOString() });
      writeJSON('focus_fin_piggies', pig);
      markProgress('finance');
      return 'Создал копилку «' + pigName + '»' + (target ? ' — цель ' + target + ' ₽' : '');
    }

    // ── ЗАДАЧА (дела) ──
    if (sec === 'braindump') return planTask('braindump', name, p.column || 'inbox', p.deadline || null);

    // ── остальные разделы: обычное заполнение (желания, благодарность, питание и т.д.) ──
    return fill(sec, name);
  }


  /** СОЗДАТЬ ПРОГРАММУ ТРЕНИРОВОК (не разовую тренировку!).
      Программа = срок в днях + сколько раз в неделю + набор занятий.
      Раньше ИИ этого НЕ УМЕЛ: на просьбу «программа на 30 дней, 5 раз в неделю»
      он создавал ОДНУ разовую тренировку — совсем не то, что просили. */
  function createProgram(name, days, perWeek, exercises) {
    var nm = String(name || '').trim();
    if (!nm) return null;
    var periodDays = parseInt(days, 10) || 30;
    var times = parseInt(perWeek, 10) || 3;
    if (times < 1) times = 1;
    if (times > 7) times = 7;

    var programs = readJSON('focus_workout_programs', []);
    if (!Array.isArray(programs)) programs = [];
    if (programs.some(function (x) { return x && String(x.name || '').toLowerCase() === nm.toLowerCase(); })) {
      return 'Программа «' + cap(nm) + '» уже есть';
    }

    // разбираем упражнения: «отжимания 3х50» / {name,sets,reps,weight}
    var listRaw = Array.isArray(exercises) ? exercises : splitItems(exercises || '');
    var exList = [];
    listRaw.forEach(function (item) {
      var exName = '', setsN = 3, reps = 10, weight = null;
      if (item && typeof item === 'object') {
        exName = String(item.name || '').trim();
        setsN = parseInt(item.sets, 10) || 3;
        reps = parseInt(item.reps, 10) || 10;
        weight = (item.weight != null && item.weight !== '') ? parseFloat(item.weight) : null;
      } else {
        var t = String(item || '').trim();
        var m = t.match(/(\d+)\s*[xх*]\s*(\d+)/i);
        if (m) { setsN = parseInt(m[1], 10); reps = parseInt(m[2], 10); }
        var w = t.match(/(\d+(?:[.,]\d+)?)\s*(?:кг|kg)/i);
        if (w) weight = parseFloat(String(w[1]).replace(',', '.'));
        exName = t.replace(/(\d+)\s*[xх*]\s*(\d+)/i, '').replace(/(\d+(?:[.,]\d+)?)\s*(?:кг|kg)/i, '')
                  .replace(/\b(подход[а-я]*|повтор[а-я]*|по)\b/gi, '').trim();
      }
      if (exName) exList.push({ name: cap(exName), sets: setsN, reps: reps, weight: weight });
    });
    if (!exList.length) exList.push({ name: 'Упражнение', sets: 3, reps: 10, weight: null });

    // занятия на весь срок: сколько недель × раз в неделю
    var weeks = Math.max(1, Math.round(periodDays / 7));
    var total = Math.max(1, weeks * times);
    if (total > 60) total = 60;
    var workouts = [];
    for (var i = 0; i < total; i++) {
      workouts.push({ label: 'Занятие ' + (i + 1), exercises: exList.map(function (e) { return { name: e.name, sets: e.sets, reps: e.reps, weight: e.weight }; }) });
    }

    programs.push({
      id: Date.now(), name: cap(nm), perWeek: times, periodDays: periodDays,
      workouts: workouts, created: today(), sessions: [], cursor: 0, price: 0
    });
    writeJSON('focus_workout_programs', programs);
    markProgress('training');
    return 'Создал программу «' + cap(nm) + '»: ' + periodDays + ' дней, ' + times + ' раз в неделю, ' +
           total + ' занятий. Упражнения: ' + exList.map(function (e) { return e.name + ' ' + e.sets + '×' + e.reps; }).join(', ');
  }

  /** СОЗДАТЬ программу тренировок с нуля (раньше ИИ этого не умел — только отмечать готовые).
      exercises: массив строк («жим лёжа 3х10 60кг») или объектов {name,sets,reps,weight}. */
  function createTraining(name, exercises) {
    var nm = String(name || '').trim();
    if (!nm) return null;
    var programs = readJSON('focus_trainings', []);
    if (!Array.isArray(programs)) programs = [];
    // если программа с таким именем уже есть — дополняем её, а не плодим копию
    var prog = programs.filter(function (p) { return p && p.name; })
                       .find(function (p) { return p.name.toLowerCase() === nm.toLowerCase(); });
    var created = false;
    if (!prog) { prog = { id: Date.now(), name: cap(nm), lastDate: null, exercises: [] }; programs.push(prog); created = true; }
    prog.exercises = prog.exercises || [];

    var listRaw = Array.isArray(exercises) ? exercises : splitItems(exercises || '');
    var added = [];
    listRaw.forEach(function (item, i) {
      var exName = '', setsN = 3, reps = 10, weight = null;
      if (item && typeof item === 'object') {
        exName = String(item.name || '').trim();
        setsN = parseInt(item.sets, 10) || 3;
        reps = parseInt(item.reps, 10) || 10;
        weight = (item.weight != null && item.weight !== '') ? parseFloat(item.weight) : null;
      } else {
        var s = String(item || '').trim();
        // разбираем «жим лёжа 3х10 60кг» / «приседания 4x12»
        var m = s.match(/(\d+)\s*[xх*]\s*(\d+)/i);
        if (m) { setsN = parseInt(m[1], 10); reps = parseInt(m[2], 10); }
        var w = s.match(/(\d+(?:[.,]\d+)?)\s*(?:кг|kg)/i);
        if (w) weight = parseFloat(String(w[1]).replace(',', '.'));
        exName = s.replace(/(\d+)\s*[xх*]\s*(\d+)/i, '').replace(/(\d+(?:[.,]\d+)?)\s*(?:кг|kg)/i, '').trim();
      }
      if (!exName) return;
      var sets = [];
      for (var k = 0; k < Math.max(1, setsN); k++) sets.push({ weight: weight, reps: reps });
      prog.exercises.push({ id: Date.now() + i, name: cap(exName), checked: false, sets: sets });
      added.push(cap(exName));
    });

    writeJSON('focus_trainings', programs);
    markProgress('training');
    if (!added.length) return (created ? 'Создал тренировку «' : 'Нашёл тренировку «') + prog.name + '». Скажи, какие упражнения добавить.';
    return (created ? 'Создал тренировку «' : 'Дополнил тренировку «') + prog.name + '»: ' + added.join(', ');
  }

  /** СНЯТЬ отметку (галочку) — обратное действие к «выполнено». */
  function uncheck(id, data) {
    var sec = String(id || '').toLowerCase();
    var d = today();
    try {
      if (sec === 'workout') {
        writeJSON('focus_workout_checks_' + d, {});
        var days = readJSON('focus_workout_days', []);
        writeJSON('focus_workout_days', days.filter(function (x) { return x !== d; }));
        return 'Снял отметку с зарядки за сегодня';
      }
      if (sec === 'training') {
        var programs = readJSON('focus_trainings', []);
        var dl = String(data || '').toLowerCase().trim();
        var prog = programs.find(function (p) { return p && p.name && (!dl || p.name.toLowerCase().indexOf(dl.split(' ')[0]) !== -1); });
        if (!prog) return null;
        (prog.exercises || []).forEach(function (ex) { ex.checked = false; });
        writeJSON('focus_trainings', programs);
        return 'Снял отметки с тренировки «' + prog.name + '»';
      }
      if (sec === 'braindump') {
        var bd = readJSON('focus_braindump', null);
        if (!bd) return null;
        var low = String(data || '').toLowerCase();
        var hit = null;
        ['now', 'plan', 'inbox'].forEach(function (col) {
          (bd[col] || []).forEach(function (it) {
            if (!hit && it.done && String(it.text || '').toLowerCase().indexOf(low) !== -1) { it.done = false; hit = it; }
          });
        });
        if (!hit) return null;
        writeJSON('focus_braindump', bd);
        return 'Вернул в работу: ' + hit.text;
      }
    } catch (e) {}
    return null;
  }

  /** ЗАВЕРШИТЬ ДЕНЬ — фиксируем день и отдаём сводку сделанного (ничего не приписываем). */
  function endDay() {
    var d = today();
    try { localStorage.setItem('focus_day_closed_' + d, '1'); } catch (e) {}
    var done = [];
    Object.keys(SECTIONS).forEach(function (k) {
      try {
        var s = SECTIONS[k];
        if (!s || !s.summary) return;
        var txt = s.summary();
        if (txt && /ВЫПОЛНЕН|отмеч|засчитан|принято|сегодня:/i.test(txt) && !/НЕ отмечена|НЕ выполнен/i.test(txt)) {
          done.push(s.name);
        }
      } catch (e) {}
    });
    return done.length
      ? ('День завершён. Сегодня закрыто: ' + done.join(', ') + '. Отдыхай — завтра продолжим.')
      : 'День завершён. Сегодня отметок не было — начнём заново завтра.';
  }

  window.FocusSections = { SECTIONS: SECTIONS, detect: detect, listForPrompt: listForPrompt, userContext: userContext, fill: fill, complete: complete, planTask: planTask, createTraining: createTraining, createProgram: createProgram, create: createEntity, uncheck: uncheck, endDay: endDay, today: today };
})();
