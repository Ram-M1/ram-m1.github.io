/**
 * FOCUS — движок нумерологии и астрологии
 * Число судьбы (по дате рождения + ФИО), знак зодиака (по дате).
 * Используется в профиле, "О себе", психологе, оракуле.
 */
(function(){

  // ===== ЗНАК ЗОДИАКА по дате рождения =====
  const ZODIAC = [
    { sign: 'Козерог',   emoji: '♑', from: [12,22], to: [1,19],  element: 'Земля',  trait: 'целеустремлённый, ответственный, терпеливый' },
    { sign: 'Водолей',   emoji: '♒', from: [1,20],  to: [2,18],  element: 'Воздух', trait: 'независимый, оригинальный, гуманный' },
    { sign: 'Рыбы',      emoji: '♓', from: [2,19],  to: [3,20],  element: 'Вода',   trait: 'чувствительный, творческий, интуитивный' },
    { sign: 'Овен',      emoji: '♈', from: [3,21],  to: [4,19],  element: 'Огонь',  trait: 'энергичный, смелый, лидер' },
    { sign: 'Телец',     emoji: '♉', from: [4,20],  to: [5,20],  element: 'Земля',  trait: 'надёжный, упорный, ценит стабильность' },
    { sign: 'Близнецы',  emoji: '♊', from: [5,21],  to: [6,20],  element: 'Воздух', trait: 'любознательный, общительный, гибкий' },
    { sign: 'Рак',       emoji: '♋', from: [6,21],  to: [7,22],  element: 'Вода',   trait: 'заботливый, эмоциональный, преданный' },
    { sign: 'Лев',       emoji: '♌', from: [7,23],  to: [8,22],  element: 'Огонь',  trait: 'уверенный, щедрый, харизматичный' },
    { sign: 'Дева',      emoji: '♍', from: [8,23],  to: [9,22],  element: 'Земля',  trait: 'аналитичный, практичный, внимательный к деталям' },
    { sign: 'Весы',      emoji: '♎', from: [9,23],  to: [10,22], element: 'Воздух', trait: 'дипломатичный, справедливый, ценит гармонию' },
    { sign: 'Скорпион',  emoji: '♏', from: [10,23], to: [11,21], element: 'Вода',   trait: 'страстный, проницательный, волевой' },
    { sign: 'Стрелец',   emoji: '♐', from: [11,22], to: [12,21], element: 'Огонь',  trait: 'оптимистичный, свободолюбивый, философ' }
  ];

  function getZodiac(birthDate){
    if (!birthDate) return null;
    const d = new Date(birthDate + 'T00:00:00');
    if (isNaN(d)) return null;
    const m = d.getMonth() + 1, day = d.getDate();
    for (const z of ZODIAC) {
      const [fm, fd] = z.from, [tm, td] = z.to;
      if (fm === tm) { if (m === fm && day >= fd && day <= td) return z; }
      else if (m === fm && day >= fd) return z;
      else if (m === tm && day <= td) return z;
      // Козерог переходит через год
      if (z.sign === 'Козерог' && ((m === 12 && day >= 22) || (m === 1 && day <= 19))) return z;
    }
    return ZODIAC[0];
  }

  // ===== ЧИСЛО СУДЬБЫ (нумерология по дате рождения) =====
  // Сумма всех цифр даты рождения, сведённая к одной цифре (кроме мастер-чисел 11, 22, 33)
  function reduceNum(n){
    while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
      n = String(n).split('').reduce((a, c) => a + parseInt(c), 0);
    }
    return n;
  }

  function getLifePathNumber(birthDate){
    if (!birthDate) return null;
    const digits = birthDate.replace(/\D/g, ''); // ГГГГММДД
    if (digits.length < 8) return null;
    let sum = digits.split('').reduce((a, c) => a + parseInt(c), 0);
    return reduceNum(sum);
  }

  // Значения числа судьбы
  const LIFE_PATH_MEANINGS = {
    1: { title: 'Лидер', desc: 'Ты рождён вести за собой. Независимость, воля, инициатива — твои сильные стороны. Тебе важно идти своим путём и не бояться быть первым.' },
    2: { title: 'Дипломат', desc: 'Ты чувствуешь людей и умеешь создавать гармонию. Партнёрство, интуиция, мягкая сила — вот твоя суть. Твой дар — объединять.' },
    3: { title: 'Творец', desc: 'В тебе живёт творческая искра и лёгкость. Самовыражение, общение, радость — твоё топливо. Мир ждёт твоих идей и вдохновения.' },
    4: { title: 'Строитель', desc: 'Ты фундамент, на который можно опереться. Порядок, труд, надёжность — твоя основа. Ты создаёшь прочное и долговечное.' },
    5: { title: 'Искатель', desc: 'Свобода и перемены — твоя стихия. Ты жаждешь опыта, движения, новизны. Твой путь — приключение и постоянный рост.' },
    6: { title: 'Хранитель', desc: 'Забота, любовь, ответственность за близких — твоя миссия. Ты создаёшь тепло и гармонию вокруг. Дом и семья — твоя сила.' },
    7: { title: 'Мыслитель', desc: 'Ты ищешь глубину и истину. Анализ, интуиция, духовность ведут тебя. Твой путь — познание себя и мира за пределами очевидного.' },
    8: { title: 'Магнат', desc: 'Сила, амбиции, материальный успех — твоя арена. Ты умеешь управлять и достигать больших целей. Баланс власти и мудрости — твой урок.' },
    9: { title: 'Мудрец', desc: 'Ты пришёл служить и вдохновлять. Сострадание, широта души, идеализм — твои дары. Твоя миссия больше, чем ты сам.' },
    11: { title: 'Провидец (мастер-число)', desc: 'Ты носитель высокой интуиции и вдохновения. Тонко чувствуешь мир, способен вести людей к свету. Большой потенциал требует внутренней опоры.' },
    22: { title: 'Мастер-строитель (мастер-число)', desc: 'Ты способен воплощать грандиозные замыслы в реальность. Соединяешь мечту и практику. Твой масштаб — менять мир вокруг.' },
    33: { title: 'Учитель (мастер-число)', desc: 'Высшая вибрация служения и любви. Ты здесь, чтобы исцелять и вдохновлять примером. Редкий дар безусловной отдачи.' }
  };

  // ===== ЧИСЛО ИМЕНИ (по ФИО, система Пифагора для кириллицы) =====
  const CYR_MAP = {
    'а':1,'и':1,'с':1,'ъ':1, 'б':2,'й':2,'т':2,'ы':2, 'в':3,'к':3,'у':3,'ь':3,
    'г':4,'л':4,'ф':4,'э':4, 'д':5,'м':5,'х':5,'ю':5, 'е':6,'н':6,'ц':6,'я':6,
    'ё':6,'о':7,'ч':7, 'ж':8,'п':8,'ш':8, 'з':9,'р':9,'щ':9
  };
  function getNameNumber(fullName){
    if (!fullName) return null;
    let sum = 0;
    for (const ch of fullName.toLowerCase()) {
      if (CYR_MAP[ch]) sum += CYR_MAP[ch];
    }
    if (sum === 0) return null;
    return reduceNum(sum);
  }

  // ===== ГЛАВНАЯ ФУНКЦИЯ — полный профиль =====
  window.FocusAstro = {
    getZodiac: getZodiac,
    getLifePathNumber: getLifePathNumber,
    getNameNumber: getNameNumber,
    lifePathMeaning: function(n){ return LIFE_PATH_MEANINGS[n] || null; },

    // полный расклад по данным пользователя
    fullReading: function(user){
      const birthDate = user.birthDate || '';
      const name = user.name || '';
      const zodiac = getZodiac(birthDate);
      const lifePath = getLifePathNumber(birthDate);
      const nameNum = getNameNumber(name);
      const lpMeaning = lifePath ? LIFE_PATH_MEANINGS[lifePath] : null;
      return {
        zodiac: zodiac,           // { sign, emoji, element, trait }
        lifePath: lifePath,       // число
        lifePathMeaning: lpMeaning, // { title, desc }
        nameNumber: nameNum
      };
    },

    // краткая строка для ИИ (контекст) — чтобы ИИ учитывал астро/нумерологию
    contextForAI: function(user){
      const r = this.fullReading(user);
      const parts = [];
      if (r.zodiac) parts.push('Знак зодиака: ' + r.zodiac.sign + ' (' + r.zodiac.element + ', ' + r.zodiac.trait + ')');
      if (r.lifePath && r.lifePathMeaning) parts.push('Число судьбы: ' + r.lifePath + ' — ' + r.lifePathMeaning.title + ' (' + r.lifePathMeaning.desc + ')');
      if (r.nameNumber) parts.push('Число имени: ' + r.nameNumber);
      return parts.length ? parts.join('. ') : '';
    }
  };

})();
