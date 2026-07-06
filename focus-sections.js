/* FOCUS — РЕЕСТР РАЗДЕЛОВ (единый источник для ИИ-ассистента)
   =========================================================================
   Здесь описан КАЖДЫЙ раздел приложения: как называется, куда пишет данные,
   как ИИ его заполняет и завершает. Добавить/изменить раздел = одна запись тут.
   ИИ читает этот реестр → знает все разделы → действует единообразно.

   Формат записи:
   id: {
     name:  человекочитаемое название (для ИИ и подтверждений),
     aliases: слова-триггеры по которым ИИ понимает что речь про этот раздел,
     screen: html-файл раздела (куда вести при необходимости),
     fill:  function(data, ctx) — заполняет раздел данными, возвращает текст-подтверждение,
     summary: function() — краткая сводка что уже есть (для контекста ИИ), необязательно
   }
   ========================================================================= */
(function () {
  'use strict';

  function today() { return new Date().toISOString().slice(0, 10); }
  function readJSON(key, def) { try { return JSON.parse(localStorage.getItem(key)) || def; } catch (e) { return def; } }
  function writeJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function markDone(section) { try { if (window.FocusRewards) FocusRewards.mark(section.group, section.reward); } catch (e) {} }

  const SECTIONS = {

    // ============ ФИЗИЧЕСКОЕ ТЕЛО ============
    workout: {
      name: 'Зарядка', group: 'body', reward: 'workout',
      aliases: ['зарядк', 'размин', 'упражнени утренн'],
      screen: 'fokus_workout.html',
      fill(data) {
        const d = today();
        try { localStorage.setItem('focus_workout_note_' + d, data || 'Зарядка выполнена'); } catch (e) {}
        markDone(this);
        return 'Отметил зарядку: ' + (data || 'выполнена');
      }
    },
    training: {
      name: 'Тренировка', group: 'body', reward: 'training',
      aliases: ['тренировк', 'тренинг', 'качал', 'зал', 'программ трениров', 'план трениров'],
      screen: 'fokus_training.html',
      fill(data) {
        const d = today();
        const arch = readJSON('focus_training_archive', []);
        arch.push({ date: d, note: data || 'Тренировка по плану завершена', done: true });
        writeJSON('focus_training_archive', arch);
        markDone(this);
        return 'Завершил тренировку: ' + (data || 'по плану');
      },
      summary() {
        const tr = readJSON('focus_trainings', []);
        if (!tr.length) return null;
        return 'Программы тренировок юзера: ' + tr.map(t => t.name || t.title).filter(Boolean).join(', ');
      }
    },
    nutrition: {
      name: 'Питание', group: 'body', reward: 'nutrition',
      aliases: ['поел', 'съел', 'питани', 'еда', 'завтрак', 'обед', 'ужин', 'перекус'],
      screen: 'fokus_nutrition.html',
      fill(data) {
        const d = today();
        let nt = readJSON('focus_nutrition_today', {});
        if (nt.date !== d) nt = { date: d, meals: { breakfast: [], lunch: [], dinner: [], snack: [] } };
        if (!nt.meals) nt.meals = { breakfast: [], lunch: [], dinner: [], snack: [] };
        nt.meals.snack.push({ name: data, cal: 0, prot: 0, fat: 0, carb: 0, id: Date.now() });
        writeJSON('focus_nutrition_today', nt);
        const fin = readJSON('focus_nutrition_finished', []);
        if (!fin.includes(d)) { fin.push(d); writeJSON('focus_nutrition_finished', fin); }
        return 'Записал в питание: ' + data;
      }
    },
    medications: {
      name: 'Лекарства', group: 'body', reward: 'medications',
      aliases: ['лекарств', 'таблетк', 'принял препарат', 'выпил лекарств'],
      screen: 'fokus_medications.html',
      // отметка привязана к id лекарства из списка юзера — наобум не ставим
      fill(data) { return null; }
    },
    supplements: {
      name: 'БАДы и спортпит', group: 'body', reward: 'supplements',
      aliases: ['бад', 'витамин', 'протеин', 'креатин', 'добавк', 'спортпит'],
      screen: 'fokus_supplements.html',
      fill(data) { return null; }
    },

    // ============ ЭНЕРГИЯ ============
    sleep: {
      name: 'Сон', group: 'energy', reward: 'sleep',
      aliases: ['спал', 'сон', 'выспал', 'проснул', 'лёг'],
      screen: 'fokus_sleep.html',
      fill(data) {
        const d = today();
        const hours = parseFloat(String(data || '').replace(',', '.')) || 8;
        let entries = readJSON('focus_sleep_entries', []);
        entries = entries.filter(e => e.date !== d);
        entries.push({ date: d, hours: hours, quality: 3, note: 'Записал ассистент' });
        writeJSON('focus_sleep_entries', entries);
        return 'Записал сон: ' + hours + ' ч';
      }
    },
    breathing: {
      name: 'Дыхание', group: 'energy', reward: 'breathing',
      aliases: ['дыхани', 'дыхательн', 'подышал'],
      screen: 'fokus_breathing.html',
      fill(data) {
        // формат раздела: { id, tech, min, cycles, date }
        const d = today();
        const log = readJSON('focus_breathing_log', []);
        log.push({ id: Date.now(), tech: data || 'Дыхательная практика', min: 5, cycles: 0, date: d });
        writeJSON('focus_breathing_log', log);
        markDone(this);
        return 'Отметил дыхательную практику';
      }
    },
    rest: {
      name: 'Отдых и детокс', group: 'energy', reward: 'detox',
      aliases: ['отдых', 'детокс', 'релакс'],
      screen: 'fokus_rest.html',
      fill(data) {
        // формат раздела: { id, date, minutes }
        const log = readJSON('focus_detox_log', []);
        const mins = parseInt(String(data || '').match(/\d+/)) || 30;
        log.push({ id: Date.now(), date: today(), minutes: mins });
        writeJSON('focus_detox_log', log);
        return 'Отметил отдых: ' + mins + ' мин';
      }
    },

    // ============ МЕНТАЛЬНОЕ ЗДОРОВЬЕ ============
    braindump: {
      name: 'Разгрузка мозга', group: 'mental', reward: 'braindump',
      aliases: ['разгрузк', 'мысл', 'висяк', 'выгруз', 'braindump', 'дела из головы'],
      screen: 'fokus_braindump.html',
      fill(data) {
        // формат раздела: { inbox:[], now:[], plan:[], drop:[] }, элемент {id, text}
        let bd = readJSON('focus_braindump', null);
        if (!bd || typeof bd !== 'object') bd = { inbox: [], now: [], plan: [], drop: [] };
        bd.inbox = bd.inbox || [];
        const items = String(data || 'Задача').split(/\s*\|\s*|\n|(?:^|\s)\d+[.)]\s*/).map(s => s.trim()).filter(Boolean);
        items.forEach(txt => bd.inbox.push({ id: Date.now() + Math.random(), text: txt }));
        writeJSON('focus_braindump', bd);
        return 'Добавил в разгрузку мозга: ' + items.join(', ');
      }
    },
    mood: {
      name: 'Настроение', group: 'mental', reward: 'mood',
      aliases: ['настроени', 'чувству', 'эмоци', 'самочувстви'],
      screen: 'fokus_mood.html',
      fill(data) {
        // формат раздела: { id, date, t, mood, note, tags:[], chat:[] }
        const entries = readJSON('focus_mood_entries', []);
        entries.push({ id: Date.now(), date: today(), t: Date.now(), mood: data || 'нормальное', note: '', tags: [], chat: [] });
        writeJSON('focus_mood_entries', entries);
        return 'Записал настроение: ' + (data || 'отмечено');
      }
    },

    // ============ ОТНОШЕНИЯ ============
    relationships: {
      name: 'Отношения', group: 'relationships', reward: 'relationships',
      aliases: ['отношени', 'друг', 'долг', 'позвонить', 'встретил'],
      screen: 'fokus_relationships.html',
      fill(data) {
        return 'Для раздела «Отношения» открой его — там удобнее добавить контакт/задачу.';
      }
    },

    // ============ ВЕРА И РИТУАЛЫ ============
    gratitude: {
      name: 'Благодарность', group: 'faith', reward: 'gratitude',
      aliases: ['благодар', 'спасибо за', 'признател'],
      screen: 'fokus_gratitude.html',
      fill(data) {
        const d = today();
        const grats = readJSON('faith_gratitudes', []);
        // данные могут быть несколькими пунктами через | или перенос строки или "1... 2... 3..."
        let items = String(data || 'За день')
          .split(/\s*\|\s*|\n|(?:^|\s)\d+[.)]\s*/)
          .map(s => s.trim())
          .filter(Boolean);
        if (!items.length) items = ['За день'];
        // сегодняшняя запись — дополняем, иначе новая
        let todayEntry = grats.find(e => e.date === d);
        if (todayEntry) {
          todayEntry.items = (todayEntry.items || []).concat(items);
        } else {
          grats.push({ id: Date.now(), date: d, dateLabel: new Date().toLocaleDateString('ru-RU'), items: items });
        }
        writeJSON('faith_gratitudes', grats);
        markDone(this);
        return 'Записал благодарност' + (items.length > 1 ? 'и (' + items.length + '): ' : 'ь: ') + items.join(', ');
      }
    },
    faith_habits: {
      name: 'Духовные привычки', group: 'faith', reward: 'habit',
      aliases: ['привычк', 'молитв', 'храм', 'ритуал', 'практик духовн'],
      screen: 'fokus_faith_habits.html',
      // сложная модель трекинга привычек — не заполняем наобум, а ведём в раздел
      fill(data) {
        return null; // ИИ вместо заполнения предложит напоминание или откроет раздел
      }
    },
    wishmap: {
      name: 'Карта желаний', group: 'faith', reward: 'wish',
      aliases: ['желани', 'мечт', 'карта желани', 'цел мечт'],
      screen: 'fokus_wishmap.html',
      fill(data) {
        return 'Карту желаний лучше заполнить визуально — открой раздел.';
      }
    }
  };

  /** Найти раздел по тексту команды пользователя (по aliases). */
  function detect(text) {
    const t = (text || '').toLowerCase();
    for (const id in SECTIONS) {
      const s = SECTIONS[id];
      if (s.aliases && s.aliases.some(a => t.includes(a))) return id;
    }
    return null;
  }

  /** Список всех разделов для системного промпта ИИ. */
  function listForPrompt() {
    return Object.keys(SECTIONS).map(id => id + ' (' + SECTIONS[id].name + ')').join(', ');
  }

  /** Контекст: что уже создал/имеет юзер (программы, данные) — для ИИ. */
  function userContext() {
    const parts = [];
    for (const id in SECTIONS) {
      if (SECTIONS[id].summary) {
        try { const s = SECTIONS[id].summary(); if (s) parts.push(s); } catch (e) {}
      }
    }
    return parts.join('. ');
  }

  /** Заполнить раздел: вызывается из applyFill по типу. */
  function fill(id, data, ctx) {
    const s = SECTIONS[id];
    if (!s || !s.fill) return null;
    try { return s.fill(data, ctx || {}); } catch (e) { return null; }
  }

  window.FocusSections = { SECTIONS, detect, listForPrompt, userContext, fill, today };
})();
