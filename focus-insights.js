/* ═══════════════════════════════════════════════════════════════
   FOCUS — ДВИЖОК ИНСАЙТОВ.

   Превращает сырые данные юзера в ОСМЫСЛЕННЫЕ наблюдения, чтобы ассистент
   был не тупым исполнителем, а живым советчиком:
     • видит ТРЕНДЫ (сон падает, настроение растёт, 3 дня без тренировок);
     • замечает СТРИКИ и провалы;
     • понимает, близок ли юзер к цели;
     • готовит краткую «сводку состояния» для ИИ.

   Работает полностью на устройстве, мгновенно, без сервера.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  function readJSON(key, def){ try { return JSON.parse(localStorage.getItem(key)) || def; } catch(e){ return def; } }
  function daysAgo(n){ var d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
  function todayStr(){ return new Date().toISOString().slice(0,10); }

  // среднее по числовому массиву
  function avg(arr){ if (!arr.length) return 0; return arr.reduce(function(a,b){ return a+b; },0) / arr.length; }

  /* ── СОН: тренд за неделю ── */
  function sleepInsight(){
    var e = readJSON('focus_sleep_entries', []);
    if (!e.length) return null;
    var recent = e.slice(-7).map(function(x){ return parseFloat(x.hours || x.value || 0); }).filter(function(x){ return x>0; });
    if (recent.length < 2) return null;
    var mean = avg(recent);
    var first = avg(recent.slice(0, Math.ceil(recent.length/2)));
    var last = avg(recent.slice(Math.ceil(recent.length/2)));
    var trend = last < first - 0.5 ? 'падает' : last > first + 0.5 ? 'растёт' : 'стабилен';
    return {
      key: 'сон',
      mean: Math.round(mean*10)/10,
      trend: trend,
      note: mean < 6 ? 'сон в среднем ' + (Math.round(mean*10)/10) + 'ч — мало, это бьёт по энергии и восстановлению'
          : trend === 'падает' ? 'сон стал короче за последние дни'
          : 'сон в норме (' + (Math.round(mean*10)/10) + 'ч)'
    };
  }

  /* ── НАСТРОЕНИЕ: динамика ── */
  function moodInsight(){
    var e = readJSON('focus_mood_entries', []);
    if (!e.length) return null;
    var recent = e.slice(-7);
    if (recent.length < 2) return null;
    // настроение может быть текстом — оцениваем по ключевым словам
    var scale = { 'отличное':5,'хорошее':4,'нормальное':3,'так себе':2,'плохое':1,'ужасное':1 };
    var scored = recent.map(function(x){
      var t = String(x.mood || x.value || x.text || '').toLowerCase();
      for (var k in scale) if (t.indexOf(k) !== -1) return scale[k];
      return 3;
    });
    var mean = avg(scored);
    var last = scored[scored.length-1];
    return {
      key: 'настроение',
      note: mean <= 2 ? 'настроение в последнее время подавленное — стоит обратить внимание на отдых и поддержку'
          : last >= 4 && mean >= 3.5 ? 'настроение на подъёме'
          : 'настроение ровное'
    };
  }

  /* ── АКТИВНОСТЬ: сколько дней без тренировки ── */
  function activityInsight(){
    var w = readJSON('focus_workout_log', []);
    if (!w.length) {
      // пробуем через weekStats
      return null;
    }
    var last = w[w.length-1];
    var lastDate = (last && (last.date || last.at) || '').slice(0,10);
    if (!lastDate) return null;
    var diff = Math.floor((new Date(todayStr()) - new Date(lastDate)) / 86400000);
    if (diff >= 3) return { key:'активность', note: diff + ' дн без тренировки — тело теряет тонус, пора вернуться' };
    if (diff === 0) return { key:'активность', note: 'сегодня уже была нагрузка — молодец' };
    return null;
  }

  /* ── ДЕЛА: разгрузка мозга, сколько висит ── */
  function tasksInsight(){
    var bd = readJSON('focus_braindump', {});
    var active = ((bd.inbox||[]).concat(bd.now||[], bd.plan||[])).filter(function(x){ return !x.done; });
    if (!active.length) return null;
    var overdue = active.filter(function(x){
      if (!x.deadline) return false;
      var d = new Date(x.deadline);
      return !isNaN(d) && d < new Date();
    });
    if (overdue.length) return { key:'дела', note: 'есть просроченные дела (' + overdue.length + ') — стоит разобрать или перенести' };
    if (active.length >= 5) return { key:'дела', note: active.length + ' активных дел накопилось — можно расставить приоритеты' };
    return null;
  }

  /* ── СТРИКИ: хорошие привычки подряд ── */
  function streakInsight(){
    var g = readJSON('faith_gratitudes', []);
    // считаем дни подряд с благодарностью
    if (!g.length) return null;
    var dates = {};
    g.forEach(function(x){ if (x.date) dates[x.date] = true; });
    var streak = 0;
    for (var i = 0; i < 30; i++) { if (dates[daysAgo(i)]) streak++; else if (i>0) break; }
    if (streak >= 3) return { key:'привычка', note: streak + ' дн подряд ведёшь благодарность — отличная привычка, так держать' };
    return null;
  }

  /* ── ГЛАВНОЕ: собрать все инсайты в сводку для ИИ ── */
  window.FocusInsights = {
    /** Массив осмысленных наблюдений */
    all: function(){
      var out = [];
      [sleepInsight, moodInsight, activityInsight, tasksInsight, streakInsight].forEach(function(fn){
        try { var r = fn(); if (r && r.note) out.push(r.note); } catch(e){}
      });
      return out;
    },

    /** Готовая строка для промпта ИИ (или пусто, если данных мало) */
    forAI: function(){
      var ins = this.all();
      if (!ins.length) return '';
      return 'НАБЛЮДЕНИЯ О ЮЗЕРЕ (используй, чтобы давать умные персональные советы, но не зачитывай списком без повода): ' + ins.join('; ') + '.';
    },

    /** Развёрнутые данные для глубокого разбора (Оракул за 300) */
    deep: function(){
      var u = {};
      try { u = (window.FocusStorage && FocusStorage.getUser()) || {}; } catch(e){}
      var sleep = readJSON('focus_sleep_entries', []);
      var mood = readJSON('focus_mood_entries', []);
      var grat = readJSON('faith_gratitudes', []);
      var bd = readJSON('focus_braindump', {});
      var wish = readJSON('focus_wishmap', []);
      var activeTasks = ((bd.inbox||[]).concat(bd.now||[], bd.plan||[])).filter(function(x){ return !x.done; });

      var parts = [];
      if (u.goal) parts.push('Главная цель: ' + u.goal);
      if (u.about) parts.push('О себе: ' + u.about);
      if (sleep_avg()) parts.push('Средний сон: ' + sleep_avg() + 'ч');
      if (mood.length) parts.push('Записей о настроении: ' + mood.length);
      if (grat.length) parts.push('Ведёт благодарность (' + grat.length + ' записей)');
      if (activeTasks.length) parts.push('Активных целей/дел: ' + activeTasks.length + ' (' + activeTasks.slice(0,5).map(function(x){ return x.text; }).join(', ') + ')');
      if (wish && wish.length) parts.push('Желания на карте желаний: ' + wish.slice(0,5).map(function(x){ return x.title || x.text || ''; }).filter(Boolean).join(', '));

      function sleep_avg(){
        var r = sleep.slice(-14).map(function(x){ return parseFloat(x.hours||x.value||0); }).filter(function(x){ return x>0; });
        return r.length ? Math.round(avg(r)*10)/10 : 0;
      }

      return {
        summary: parts.join('. '),
        insights: window.FocusInsights.all()
      };
    }
  };
})();
