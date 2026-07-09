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
        var ex = readJSON('focus_workout_exercises', []);
        if (!ex.length) return null;
        return 'Зарядка юзера (упражнения): ' + ex.map(function (e) { return e.name + (e.sets ? ' ' + e.sets + '×' + (e.reps || '') : ''); }).join(', ');
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
      fill: function (data) {
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
        var bd = readJSON('focus_braindump', null);
        if (!bd || typeof bd !== 'object') bd = { inbox: [], now: [], plan: [], drop: [] };
        bd.inbox = bd.inbox || [];
        var items = splitItems(data);
        (items.length ? items : ['Задача']).forEach(function (txt) { bd.inbox.push({ id: Date.now() + Math.random(), text: cap(txt) }); });
        writeJSON('focus_braindump', bd);
        return 'Добавил в разгрузку мозга: ' + (items.map(cap).join(', ') || 'задачу');
      },
      summary: function () {
        var bd = readJSON('focus_braindump', null);
        if (!bd || !bd.inbox || !bd.inbox.length) return null;
        return 'В разгрузке мозга (входящие): ' + bd.inbox.slice(0, 6).map(function (x) { return x.text; }).join(', ');
      }
    },
    mood: {
      name: 'Настроение', group: 'mental', reward: 'mood',
      aliases: ['настроени', 'чувству', 'эмоци', 'самочувстви'],
      screen: 'fokus_mood.html',
      fill: function (data) {
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

  window.FocusSections = { SECTIONS: SECTIONS, detect: detect, listForPrompt: listForPrompt, userContext: userContext, fill: fill, today: today };
})();
