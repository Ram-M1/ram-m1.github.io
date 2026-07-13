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
        var taken = readJSON(key, []);
        if (taken.indexOf(med.id) === -1) taken.push(med.id);
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
        var taken = readJSON(key, []);
        if (taken.indexOf(s.id) === -1) taken.push(s.id);
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
        function line(arr, label) {
          var act = (arr || []).filter(function(x){ return !x.done; });
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

        // 1) по номеру (#12 или просто 12) — самый точный путь
        var idm = q.match(/#?(\d{6,})/);
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

  function fill(id, data, ctx) {
    var s = SECTIONS[id];
    if (!s || !s.fill) return null;
    try { return s.fill(data, ctx || {}); } catch (e) { return null; }
  }

  /** Отметить дело выполненным в разделе (если раздел это поддерживает). */
  function complete(id, data) {
    var s = SECTIONS[id];
    if (!s || !s.complete) return null;
    try { return s.complete(data); } catch (e) { return null; }
  }

  window.FocusSections = { SECTIONS: SECTIONS, detect: detect, listForPrompt: listForPrompt, userContext: userContext, fill: fill, complete: complete, today: today };
})();
