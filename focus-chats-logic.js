/* ═══════════════════════════════════════════════════════════════
   FOCUS — СПИСОК ДИАЛОГОВ. Переписан с нуля.

   ПРИНЦИП СКОРОСТИ (как в WhatsApp/Telegram):
   всё рисуется МГНОВЕННО из кэша, а обновление из облака идёт ФОНОМ.
   Пользователь никогда не ждёт сеть перед показом.

   ОДИН источник данных (облако), ОДИН рендер, ЖИВЫЕ подписки.
   Раньше было три конфликтующих хранилища — отсюда «диалоги пропадали».
   ═══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var CACHE_KEY = 'focus_chats_cache_v2';
  var listEl, toastEl;
  var chats = [];              // единый массив диалогов
  var currentTab = 'all';
  var currentNav = 'chats';
  var searchQuery = '';
  var searchTimer = null;
  var pins = [];
  var presenceSubs = {};       // живые подписки на статус собеседников

  // ─────────── УТИЛИТЫ ───────────
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  function toast(msg){
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function(){ toastEl.classList.remove('show'); }, 2600);
  }

  function timeLabel(ts){
    if (!ts) return '';
    var d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
    if (isNaN(d)) return '';
    var now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
    var yst = new Date(now); yst.setDate(now.getDate()-1);
    if (d.toDateString() === yst.toDateString()) return 'вчера';
    var diff = (now - d) / 86400000;
    if (diff < 7) return ['вс','пн','вт','ср','чт','пт','сб'][d.getDay()];
    return d.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit' });
  }

  function getPins(){ try { return JSON.parse(localStorage.getItem('focus_chat_pins')) || []; } catch(e){ return []; } }
  function savePins(){ try { localStorage.setItem('focus_chat_pins', JSON.stringify(pins)); } catch(e){} }

  // ─────────── АВАТАР (единый для всего FOCUS) ───────────
  function avatarHTML(chat){
    var online = chat._online && chat.type !== 'group';
    var cls = 'av' + (online ? ' online' : '');
    var inner;
    if (chat.avatar) {
      inner = '<img src="' + esc(chat.avatar) + '" alt="">';
    } else {
      var letter = (chat.name || '?').trim().charAt(0).toUpperCase() || '?';
      inner = '<div class="av-letter">' + esc(letter) + '</div>';
    }
    /* Аватар кликабельный: тап открывает карточку человека (как в WhatsApp).
       Раньше тап по аватару не делал ничего. Данные кладём в атрибуты — их читает
       общий обработчик ниже, чтобы не вешать слушатель на каждую строку. */
    var duid = (chat.type === 'group') ? '' : (chat.uid || chat.withUid || '');
    return '<div class="' + cls + '"' + (duid ? ' data-card-uid="' + esc(duid) + '" data-card-chat="' + esc(chat.chatId || '') + '" data-card-name="' + esc(chat.name || '') + '" style="cursor:pointer;"' : '') + '>' + inner + '<span class="dot"></span></div>';
  }

  // ─────────── ПОИСК ПО ПЕРЕПИСКЕ (по кэшу на устройстве) ───────────
  /* Ищем ВНУТРИ сообщений и по названиям файлов во всех чатах, которые уже загружены
     на телефоне. Мгновенно, без обращения к серверу. Это как поиск в Telegram по
     недавним чатам: находит слово в тексте или имя документа и ведёт прямо к сообщению. */
  function searchInMessages(query){
    var q = query.toLowerCase().trim();
    if (q.length < 2) return [];
    var results = [];
    var seen = 0;

    // имя чата по его id (чтобы показать, ГДЕ нашли)
    var nameById = {};
    chats.forEach(function(c){ nameById[c.chatId] = { name: c.name, avatar: c.avatar, uid: c.uid }; });

    // проходим по кэшу всех чатов
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key || key.indexOf('focus_chat_msgs_') !== 0) continue;
      var chatId = key.slice('focus_chat_msgs_'.length);
      var msgs;
      try { msgs = JSON.parse(localStorage.getItem(key)) || []; } catch(e){ continue; }

      var chatInfo = nameById[chatId] || { name: 'Чат', avatar: '', uid: '' };

      msgs.forEach(function(m){
        var hit = null, kind = 'text';
        // поиск по тексту сообщения
        if (m.text && m.text.toLowerCase().indexOf(q) !== -1) { hit = m.text; kind = 'text'; }
        // поиск по названию файла
        else if (m.fileName && m.fileName.toLowerCase().indexOf(q) !== -1) { hit = m.fileName; kind = 'file'; }

        if (hit) {
          results.push({
            chatId: chatId,
            chatName: chatInfo.name,
            avatar: chatInfo.avatar,
            uid: chatInfo.uid,
            text: hit,
            kind: kind,
            at: m.at || 0
          });
          seen++;
        }
      });
      if (seen > 60) break;   // хватит, не тормозим
    }

    // свежие сверху
    results.sort(function(a,b){ return new Date(b.at) - new Date(a.at); });
    return results.slice(0, 40);
  }

  // подсветка найденного слова
  function highlight(text, query){
    var q = query.trim();
    if (!q) return esc(text);
    var idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return esc(text);
    // показываем кусок вокруг найденного
    var start = Math.max(0, idx - 20);
    var snippet = (start > 0 ? '…' : '') + text.slice(start, idx + q.length + 40);
    var pos = snippet.toLowerCase().indexOf(q.toLowerCase());
    if (pos === -1) return esc(snippet);
    return esc(snippet.slice(0, pos)) +
      '<span style="color:var(--accent);font-weight:600;">' + esc(snippet.slice(pos, pos + q.length)) + '</span>' +
      esc(snippet.slice(pos + q.length));
  }

  function renderSearchResults(query){
    // 1) чаты по имени
    var q = query.toLowerCase();
    var byName = chats.filter(function(c){ return (c.name||'').toLowerCase().indexOf(q) !== -1; });
    // 2) сообщения и файлы
    var inMsgs = searchInMessages(query);

    if (!byName.length && !inMsgs.length) {
      listEl.innerHTML = '<div class="empty"><div class="empty-ic">🔍</div>' +
        '<div class="empty-t">Ничего не найдено</div>' +
        '<div class="empty-s">Поиск идёт по чатам, которые ты открывал</div></div>';
      return;
    }

    var html = '';

    // ── чаты ──
    if (byName.length) {
      html += '<div style="padding:10px 16px 4px;font-size:12px;color:#6e6e7e;font-weight:600;text-transform:uppercase;">Чаты</div>';
      html += byName.map(function(c){
        return '<div class="chat-row" data-id="' + esc(c.chatId) + '" data-name="' + esc(c.name) + '" data-uid="' + esc(c.uid||'') + '">' +
          avatarHTML(c) +
          '<div class="chat-mid"><div class="chat-top"><span class="chat-name">' + esc(c.name) + '</span></div>' +
          '<div class="chat-bot"><span class="chat-last">' + esc(c.last || 'Открыть чат') + '</span></div></div></div>';
      }).join('');
    }

    // ── сообщения и файлы ──
    if (inMsgs.length) {
      html += '<div style="padding:14px 16px 4px;font-size:12px;color:#6e6e7e;font-weight:600;text-transform:uppercase;">Сообщения и файлы</div>';
      html += inMsgs.map(function(r){
        var icon = r.kind === 'file'
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:15px;height:15px;color:var(--accent);flex:0 0 auto;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg> '
          : '';
        return '<div class="chat-row" data-id="' + esc(r.chatId) + '" data-name="' + esc(r.chatName) + '" data-uid="' + esc(r.uid||'') + '">' +
          avatarHTML({ name:r.chatName, avatar:r.avatar, type:'user' }) +
          '<div class="chat-mid"><div class="chat-top"><span class="chat-name">' + esc(r.chatName) + '</span>' +
          '<span class="chat-time">' + timeLabel(r.at) + '</span></div>' +
          '<div class="chat-bot"><span class="chat-last" style="display:flex;align-items:center;gap:4px;">' + icon + highlight(r.text, query) + '</span></div></div></div>';
      }).join('');
    }

    listEl.innerHTML = html;
  }

  // ─────────── РЕНДЕР СПИСКА ───────────
  function render(){
    if (!listEl) return;

    // если идёт поиск — показываем результаты поиска (чаты + сообщения + файлы)
    if (searchQuery && searchQuery.trim().length >= 2) {
      renderSearchResults(searchQuery);
      return;
    }

    var filtered = chats.slice();
    if (currentTab === 'unread') filtered = filtered.filter(function(c){ return (c.unread||0) > 0; });
    else if (currentTab === 'groups') filtered = filtered.filter(function(c){ return c.type === 'group'; });

    // сортировка: закреплённые сверху, затем по времени
    filtered.sort(function(a,b){
      var pa = pins.indexOf(a.chatId) !== -1 ? 1 : 0;
      var pb = pins.indexOf(b.chatId) !== -1 ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));
    });

    // счётчик непрочитанных на вкладке
    var totalUnread = chats.reduce(function(s,c){ return s + (c.unread||0); }, 0);
    var badge = $('unreadBadge');
    if (badge) {
      if (totalUnread > 0) { badge.textContent = totalUnread > 99 ? '99+' : totalUnread; badge.style.display = ''; }
      else badge.style.display = 'none';
    }

    if (!filtered.length) {
      var msg = searchQuery ? ['🔍','Ничего не найдено','Попробуй другой запрос']
              : currentTab === 'unread' ? ['✅','Нет новых сообщений','Ты всё прочитал']
              : currentTab === 'groups' ? ['👥','Групп пока нет','Создай первую — кнопкой ✏️ внизу']
              : ['💬','Чатов пока нет','Найди человека по номеру — кнопкой + вверху'];
      listEl.innerHTML = '<div class="empty"><div class="empty-ic">' + msg[0] + '</div>' +
        '<div class="empty-t">' + msg[1] + '</div><div class="empty-s">' + msg[2] + '</div></div>';
      return;
    }

    var html = filtered.map(function(c){
      var pinned = pins.indexOf(c.chatId) !== -1;
      var isGroup = c.type === 'group';
      var last = c.last || (isGroup ? 'Группа создана' : 'Начни переписку');
      var badgeHtml = (c.unread||0) > 0 ? '<span class="chat-badge">' + (c.unread > 99 ? '99+' : c.unread) + '</span>' : '';
      var pinHtml = pinned ? '<span class="chat-pin"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 4v6l2 3v2H6v-2l2-3V4z"/></svg></span>' : '';
      var groupTag = isGroup ? '<span class="group-tag">группа</span>' : '';
      return '<div class="chat-row" data-id="' + esc(c.chatId) + '" data-name="' + esc(c.name) + '" data-uid="' + esc(c.uid||'') + '">' +
        avatarHTML(c) +
        '<div class="chat-mid">' +
          '<div class="chat-top"><span class="chat-name">' + esc(c.name) + '</span>' + groupTag +
            '<span class="chat-time">' + timeLabel(c.updatedAt) + '</span></div>' +
          '<div class="chat-bot"><span class="chat-last" data-status="' + esc(c.uid||'') + '">' + esc(last) + '</span>' +
            pinHtml + badgeHtml + '</div>' +
        '</div></div>';
    }).join('');

    listEl.innerHTML = html;

    // подписываемся на живой статус собеседников (точка «в сети» + обновляется сама)
    watchPresences(filtered);
  }

  // ─────────── ЖИВОЙ СТАТУС ───────────
  function watchPresences(list){
    if (!window.fbWatchPresence) return;
    var need = {};
    list.forEach(function(c){ if (c.uid && c.type !== 'group') need[c.uid] = true; });

    // отписываемся от тех, кого больше нет на экране
    Object.keys(presenceSubs).forEach(function(uid){
      if (!need[uid]) { try { presenceSubs[uid](); } catch(e){} delete presenceSubs[uid]; }
    });

    // подписываемся на новых
    Object.keys(need).forEach(function(uid){
      if (presenceSubs[uid]) return;
      presenceSubs[uid] = window.fbWatchPresence(uid, function(p){
        // обновляем точку «в сети» у нужного аватара, не перерисовывая весь список
        var chat = chats.find(function(c){ return c.uid === uid; });
        if (chat) chat._online = p.online;
        var row = listEl.querySelector('.chat-row[data-uid="' + cssEsc(uid) + '"]');
        if (row) {
          var av = row.querySelector('.av');
          if (av) { if (p.online) av.classList.add('online'); else av.classList.remove('online'); }
        }
      });
    });
  }
  function cssEsc(s){ return String(s).replace(/["\\]/g, '\\$&'); }

  // ─────────── ЗАГРУЗКА (кэш мгновенно → облако фоном) ───────────
  function loadFromCache(){
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (c && c.length) { chats = c; render(); return true; }
    } catch(e){}
    return false;
  }

  function saveCache(){
    try {
      // в кэш — без тяжёлых полных аватаров (лёгкие оставляем, они маленькие)
      localStorage.setItem(CACHE_KEY, JSON.stringify(chats.slice(0, 60)));
    } catch(e){
      try { localStorage.removeItem(CACHE_KEY); } catch(_){}
    }
  }

  function normalizeChat(c){
    return {
      chatId: c.chatId || c.id,
      uid: c.withUid || c.uid || '',
      name: c.withName || c.name || 'Пользователь',
      avatar: c.avatar || '',
      last: c.lastText || c.last || '',
      updatedAt: c.updatedAt || '',
      unread: c.unread || 0,
      type: c.type || 'user',
      isAdmin: !!c.isAdmin || c.withName === 'Администратор',
      _online: c._online || false,
      _lastSeen: c._lastSeen || 0,
      _live: c._live !== false          // false = за записью нет живого профиля
    };
  }

  // единый флаг «идёт загрузка» — чтобы две загрузки не перетирали друг друга
  var loading = false;

  /* ЕДИНАЯ загрузка из облака. Защищена от пустого ответа: если сервер вернул пусто
     (сессия ещё не поднялась или сбой сети), а у нас уже показаны чаты — НЕ стираем их.
     Именно голое `chats = []` вызывало «мигание»: чаты показывались из кэша, потом
     пустой ответ их стирал, потом они возвращались. */
  async function pullChats(reason){
    if (!window.fbGetChatList) return;
    if (loading) return;            // уже грузим — не запускаем второй раз параллельно
    loading = true;
    try {
      try { if (window.fbEnsureAdminContact) await window.fbEnsureAdminContact(); } catch(e){}

      var list = await window.fbGetChatList();

      // ПУСТО + у нас уже есть чаты → игнорируем (не мигаем)
      if ((!list || !list.length) && chats.length) { loading = false; return; }

      /* УБИРАЕМ ПРИЗРАКОВ: запись, за которой нет живого профиля И нет ни одного
         сообщения — это остаток от старого номера аккаунта. Именно они висели
         дублями («Анна» рядом с «Пользователь», «Администратор» рядом с именем).
         Записи с перепиской не трогаем — история важнее. */
      var fresh = (list || []).map(normalizeChat).filter(function(c){
        if (c.type === 'group' || c.isAdmin) return true;
        if (c._live) return true;
        return !!(c.last && String(c.last).trim());   // без профиля, но с перепиской — оставляем
      });

      // рисуем только если реально изменилось (иначе лишняя перерисовка = мелькание)
      var sigOld = chats.map(function(c){ return c.chatId + c.updatedAt + c.unread; }).sort().join('|');
      var sigNew = fresh.map(function(c){ return c.chatId + c.updatedAt + c.unread; }).sort().join('|');
      if (sigOld !== sigNew) { chats = fresh; render(); saveCache(); }
    } catch(e){}
    loading = false;
  }

  async function loadFromCloud(){ return pullChats('initial'); }

  // мягкое обновление (после отправки/прихода) — та же защищённая логика
  async function refreshSoft(){ return pullChats('soft'); }

  // обновление при ВОЗВРАТЕ на страницу (из диалога) — с повтором,
  // потому что Firebase-сессия поднимается не мгновенно
  function refreshOnReturn(){
    refreshSoft();
    setTimeout(refreshSoft, 600);    // сессия успела подняться
    setTimeout(refreshSoft, 1800);   // страховка
  }

  // ─────────── ОТКРЫТЬ ДИАЛОГ ───────────
  function openChat(chatId, name){
    // МГНОВЕННЫЙ переход — диалог сам загрузит свою историю из своего кэша
    location.href = 'fokus_chat.html?chatId=' + encodeURIComponent(chatId) + '&name=' + encodeURIComponent(name || '');
  }

  // ─────────── ПОИСК ЛЮДЕЙ ───────────
  function openSearchPeople(){
    showSheet(
      '<div class="sheet-grip"></div>' +
      '<div class="sheet-title">Найти человека</div>' +
      '<div class="sheet-sub">Введи номер телефона или имя — если человек есть в FOCUS, откроется чат.</div>' +
      '<input class="sheet-input" id="findInput" placeholder="Номер или имя" autocomplete="off">' +
      '<button class="btn" id="findBtn">Найти</button>' +
      '<div id="findResults" style="margin-top:14px;"></div>'
    );
    var inp = $('findInput'), btn = $('findBtn');
    setTimeout(function(){ try { inp.focus(); } catch(e){} }, 300);
    async function doFind(){
      var q = (inp.value || '').trim();
      if (q.length < 2) { toast('Введи минимум 2 символа'); return; }
      btn.disabled = true; btn.textContent = 'Ищу...';
      var box = $('findResults');
      box.innerHTML = '<div class="skel" style="padding:8px 0;"><div class="skel-av"></div><div class="skel-l"><div class="skel-l1"></div><div class="skel-l2"></div></div></div>';
      try {
        var looksPhone = /[\d]{5,}/.test(q.replace(/\D/g,''));
        var matches = [];
        if (looksPhone && window.fbFindUserByPhone) {
          var r = await window.fbFindUserByPhone(q);
          if (r.ok) matches = [r.user];
          else if (window.fbFindUsersByName) { var r2 = await window.fbFindUsersByName(q); if (r2.ok) matches = r2.users; }
        } else if (window.fbFindUsersByName) {
          var r3 = await window.fbFindUsersByName(q);
          if (r3.ok) matches = r3.users;
        }
        if (!matches.length) { box.innerHTML = '<div class="empty" style="padding:24px;"><div class="empty-s">Никого не найдено</div></div>'; }
        else box.innerHTML = matches.map(renderFoundUser).join('');
      } catch(e) { box.innerHTML = '<div class="empty" style="padding:24px;"><div class="empty-s">Ошибка поиска</div></div>'; }
      btn.disabled = false; btn.textContent = 'Найти';
    }
    btn.addEventListener('click', doFind);
    inp.addEventListener('keydown', function(e){ if (e.key === 'Enter') doFind(); });
  }

  function foundAvatar(u){
    if (u.avatar) return '<div class="av"><img src="' + esc(u.avatar) + '"></div>';
    var l = (u.name||'?').trim().charAt(0).toUpperCase() || '?';
    return '<div class="av"><div class="av-letter">' + esc(l) + '</div></div>';
  }
  function renderFoundUser(u){
    return '<div class="res-row">' + foundAvatar(u) +
      '<div class="res-mid"><div class="res-name">' + esc(u.name) + '</div>' +
      (u.phone ? '<div class="res-phone">' + esc(u.phone) + '</div>' : '') + '</div>' +
      '<button class="res-btn add" data-add="' + esc(u.uid) + '" data-addname="' + esc(u.name) + '" data-addphone="' + esc(u.phone||'') + '" title="В контакты">+</button>' +
      '<button class="res-btn" data-write="' + esc(u.uid) + '" data-wname="' + esc(u.name) + '">Написать</button>' +
      '</div>';
  }

  // ─────────── КОНТАКТЫ ───────────
  async function openContacts(){
    showSheet('<div class="sheet-grip"></div><div class="sheet-title">Контакты</div>' +
      '<button class="btn" id="addContactBtn" style="margin-bottom:14px;">+ Найти человека</button>' +
      '<div id="contactsList"><div class="skel" style="padding:8px 0;"><div class="skel-av"></div><div class="skel-l"><div class="skel-l1"></div><div class="skel-l2"></div></div></div></div>');
    $('addContactBtn').addEventListener('click', openSearchPeople);
    var box = $('contactsList');
    try {
      var cts = window.fbGetContacts ? await window.fbGetContacts() : [];
      if (!cts || !cts.length) { box.innerHTML = '<div class="empty" style="padding:30px;"><div class="empty-ic">👤</div><div class="empty-s">Пока нет контактов</div></div>'; return; }
      box.innerHTML = cts.map(function(c){
        return '<div class="res-row">' + foundAvatar({ name:c.name, avatar:c.avatar }) +
          '<div class="res-mid"><div class="res-name">' + esc(c.name||'Пользователь') + '</div>' +
          (c.phone ? '<div class="res-phone">' + esc(c.phone) + '</div>' : '') + '</div>' +
          '<button class="res-btn" data-write="' + esc(c.uid) + '" data-wname="' + esc(c.name||'') + '">Написать</button></div>';
      }).join('');
    } catch(e) { box.innerHTML = '<div class="empty" style="padding:30px;"><div class="empty-s">Не удалось загрузить</div></div>'; }
  }

  // ─────────── СОЗДАТЬ ГРУППУ ───────────
  var groupSelected = {};
  async function openCreateGroup(){
    groupSelected = {};
    showSheet('<div class="sheet-grip"></div><div class="sheet-title">Новая группа</div>' +
      '<input class="sheet-input" id="groupName" placeholder="Название группы" autocomplete="off">' +
      '<div class="sheet-sub" style="margin:4px 0 10px;">Выбери участников из контактов:</div>' +
      '<div id="groupMembers"><div class="skel" style="padding:8px 0;"><div class="skel-av"></div><div class="skel-l"><div class="skel-l1"></div><div class="skel-l2"></div></div></div></div>' +
      '<button class="btn" id="createGroupBtn" style="margin-top:14px;">Создать группу</button>');
    var box = $('groupMembers');
    try {
      var cts = window.fbGetContacts ? await window.fbGetContacts() : [];
      if (!cts || !cts.length) { box.innerHTML = '<div class="empty" style="padding:20px;"><div class="empty-s">Сначала добавь контакты</div></div>'; }
      else box.innerHTML = cts.map(function(c){
        return '<div class="mem-row" data-uid="' + esc(c.uid) + '" data-name="' + esc(c.name||'') + '">' +
          '<div class="mem-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg></div>' +
          foundAvatar({ name:c.name, avatar:c.avatar }) +
          '<div class="res-mid"><div class="res-name">' + esc(c.name||'Пользователь') + '</div></div></div>';
      }).join('');
    } catch(e){ box.innerHTML = '<div class="empty" style="padding:20px;"><div class="empty-s">Ошибка</div></div>'; }

    $('createGroupBtn').addEventListener('click', async function(){
      var name = ($('groupName').value || '').trim();
      if (!name) { toast('Введи название группы'); return; }
      var uids = Object.keys(groupSelected);
      if (!uids.length) { toast('Выбери хотя бы одного участника'); return; }
      var b = this; b.disabled = true; b.textContent = 'Создаю...';
      try {
        var r = window.fbCreateGroup ? await window.fbCreateGroup(name, '', '', uids) : { ok:false };
        if (r.ok) { closeSheet(); toast('Группа создана'); setTimeout(refreshSoft, 800); }
        else { toast(r.error || 'Не удалось создать'); b.disabled = false; b.textContent = 'Создать группу'; }
      } catch(e){ toast('Ошибка'); b.disabled = false; b.textContent = 'Создать группу'; }
    });
  }

  // ─────────── МЕНЮ ДИАЛОГА (долгое нажатие) ───────────
  function openChatMenu(chatId, name){
    var pinned = pins.indexOf(chatId) !== -1;
    showSheet('<div class="sheet-grip"></div><div class="sheet-title" style="margin-bottom:14px;">' + esc(name) + '</div>' +
      '<div class="menu-item" data-act="open"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Открыть чат</div>' +
      '<div class="menu-item" data-act="pin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4v6l2 3v2H6v-2l2-3V4z"/></svg>' + (pinned ? 'Открепить' : 'Закрепить наверху') + '</div>' +
      '<div class="menu-item danger" data-act="delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Удалить чат</div>');
    $('sheet').addEventListener('click', function(e){
      var item = e.target.closest('.menu-item'); if (!item) return;
      var act = item.dataset.act;
      if (act === 'open') { closeSheet(); openChat(chatId, name); }
      else if (act === 'pin') {
        if (pinned) pins = pins.filter(function(x){ return x !== chatId; });
        else pins.push(chatId);
        savePins(); closeSheet(); render();
      }
      else if (act === 'delete') {
        chats = chats.filter(function(c){ return c.chatId !== chatId; });
        saveCache(); closeSheet(); render();
        if (window.fbHideChat) window.fbHideChat(chatId).catch(function(){});
        toast('Чат удалён');
      }
    });
  }

  // ─────────── МОДАЛКА ───────────
  function showSheet(html){
    $('sheet').innerHTML = html;
    $('modal').classList.add('show');
  }
  function closeSheet(){ $('modal').classList.remove('show'); }

  // ─────────── НАВИГАЦИЯ ───────────
  function switchNav(nav){
    currentNav = nav;
    document.querySelectorAll('.nav-item').forEach(function(n){
      n.classList.toggle('active', n.dataset.nav === nav);
    });
    if (nav === 'contacts') openContacts();
  }

  // ─────────── ИНИЦИАЛИЗАЦИЯ ───────────
  function init(){
    listEl = $('list');
    toastEl = $('toast');
    pins = getPins();

    // 1) МГНОВЕННО из кэша
    var hadCache = loadFromCache();

    // 2) ФОНОМ из облака
    if (window.FB_AUTH_READY) loadFromCloud();
    else {
      window.addEventListener('fb-auth-ready', loadFromCloud);
      // подстраховка: если события нет, всё равно попробуем
      setTimeout(function(){ if (!chats.length || !hadCache) loadFromCloud(); }, 2000);
    }

    // ── обработчики ──
    $('searchToggle').addEventListener('click', function(){
      var w = $('searchWrap');
      if (w.style.display === 'none') { w.style.display = ''; $('searchInput').focus(); }
      else { w.style.display = 'none'; searchQuery = ''; $('searchInput').value = ''; render(); }
    });

    $('searchInput').addEventListener('input', function(e){
      searchQuery = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(render, 150);
    });

    $('newBtn').addEventListener('click', openSearchPeople);
    $('fab').addEventListener('click', openCreateGroup);

    // вкладки
    $('tabs').addEventListener('click', function(e){
      var t = e.target.closest('.tab'); if (!t) return;
      currentTab = t.dataset.tab;
      document.querySelectorAll('.tab').forEach(function(x){ x.classList.toggle('active', x === t); });
      render();
    });

    // навигация
    document.querySelector('.nav').addEventListener('click', function(e){
      var n = e.target.closest('.nav-item'); if (!n || !n.dataset.nav) return;
      if (n.dataset.nav === 'home') return;  // уходит по onclick
      switchNav(n.dataset.nav);
    });

    // модалка: закрытие по фону
    $('modal').addEventListener('click', function(e){ if (e.target === $('modal')) closeSheet(); });

    // клики внутри списка + внутри модалок (делегирование — работает и после перерисовки)
    document.body.addEventListener('click', async function(e){
      // открыть диалог
      var row = e.target.closest('.chat-row');
      if (row && !e.target.closest('[data-add]') && !e.target.closest('[data-write]')) {
        openChat(row.dataset.id, row.dataset.name);
        return;
      }
      // добавить в контакты
      var add = e.target.closest('[data-add]');
      if (add) {
        e.stopPropagation();
        var r = window.fbAddContact ? await window.fbAddContact(add.dataset.add, add.dataset.addname||'', add.dataset.addphone||'') : { ok:false };
        if (r.ok) { add.classList.add('added'); add.textContent = '✓'; toast('Добавлен в контакты'); }
        else toast('Не удалось добавить');
        return;
      }
      // написать (открыть/создать чат)
      var wr = e.target.closest('[data-write]');
      if (wr) {
        e.stopPropagation();
        wr.textContent = '...';
        var peerUid = wr.dataset.write, peerName = wr.dataset.wname || 'Пользователь';
        var open = window.fbOpenChat ? await window.fbOpenChat(peerUid, peerName) : { ok:false };
        if (open.ok || open.chatId) {
          // СРАЗУ добавляем чат в наш список (если его там ещё нет) — тогда при возврате
          // из диалога он гарантированно виден, даже если сервер чуть задержался.
          if (!chats.some(function(c){ return c.chatId === open.chatId; })) {
            chats.unshift(normalizeChat({
              chatId: open.chatId, withUid: peerUid, withName: peerName,
              updatedAt: new Date().toISOString(), type: 'user'
            }));
            saveCache();
          }
          closeSheet();
          openChat(open.chatId, peerName);
        }
        else { toast('Не удалось открыть чат'); wr.textContent = 'Написать'; }
        return;
      }
    });

    // долгое нажатие на диалог → меню
    var pressTimer = null;
    listEl.addEventListener('touchstart', function(e){
      var row = e.target.closest('.chat-row'); if (!row) return;
      pressTimer = setTimeout(function(){
        if (navigator.vibrate) try { navigator.vibrate(15); } catch(e){}
        openChatMenu(row.dataset.id, row.dataset.name);
      }, 500);
    }, { passive:true });
    listEl.addEventListener('touchend', function(){ clearTimeout(pressTimer); });
    listEl.addEventListener('touchmove', function(){ clearTimeout(pressTimer); });
    // ПКМ на компе
    listEl.addEventListener('contextmenu', function(e){
      var row = e.target.closest('.chat-row'); if (!row) return;
      e.preventDefault();
      openChatMenu(row.dataset.id, row.dataset.name);
    });

    // выбор участников группы
    document.body.addEventListener('click', function(e){
      var mem = e.target.closest('.mem-row'); if (!mem) return;
      var uid = mem.dataset.uid;
      if (groupSelected[uid]) { delete groupSelected[uid]; mem.classList.remove('sel'); }
      else { groupSelected[uid] = mem.dataset.name || ''; mem.classList.add('sel'); }
    });

    // ── ОБНОВЛЕНИЕ ПРИ ВОЗВРАТЕ на экран (пришёл из диалога — счётчики свежие) ──
    document.addEventListener('visibilitychange', function(){ if (!document.hidden) refreshOnReturn(); });
    window.addEventListener('pageshow', function(){ refreshOnReturn(); });

    // лёгкий фоновый пуллинг, пока экран открыт (раз в 15 сек — дёшево, список живой)
    setInterval(function(){ if (!document.hidden) refreshSoft(); }, 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();


/* ═══ ТАП ПО АВАТАРУ В СПИСКЕ → КАРТОЧКА ЧЕЛОВЕКА ═══
   Один слушатель на весь список вместо слушателя на каждую строку — меньше памяти
   и не нужно перевешивать обработчики после каждой перерисовки. */
document.addEventListener('click', function(e){
  var av = e.target && e.target.closest ? e.target.closest('[data-card-uid]') : null;
  if (!av) return;
  e.preventDefault();
  e.stopPropagation();          // не открываем сам чат — только карточку
  try {
    if (window.FocusUserCard) {
      window.FocusUserCard.open(av.dataset.cardUid, {
        name: av.dataset.cardName || '',
        chatId: av.dataset.cardChat || null
      });
    }
  } catch(err){}
}, true);

/* ═══════════════════════════════════════════════════════════════
   РАЗДЕЛ «КОНТАКТЫ»
   Раньше кнопка «Контакты» внизу не имела ОБРАБОТЧИКА — нажатие не делало ничего.
   Контакт при добавлении честно сохранялся в базу, но на экране его было негде
   увидеть: список показывает только чаты, а контакты лежат отдельно.
   Отсюда и «контакты пропали» — они были, но невидимые.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var contactsLoaded = false;

  function esc2(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function el(id){ return document.getElementById(id); }

  function setNav(which){
    document.querySelectorAll('.nav-item').forEach(function(n){
      if (!n.dataset.nav) return;
      n.classList.toggle('active', n.dataset.nav === which);
    });
  }

  function showChats(){
    setNav('chats');
    if (el('list')) el('list').style.display = '';
    if (el('contactsList')) el('contactsList').style.display = 'none';
    if (el('tabs')) el('tabs').style.display = '';
    if (el('fab')) el('fab').style.display = '';
    if (el('topTitle')) el('topTitle').innerText = 'Чаты';
  }

  function showContacts(){
    setNav('contacts');
    if (el('list')) el('list').style.display = 'none';
    if (el('contactsList')) el('contactsList').style.display = '';
    if (el('tabs')) el('tabs').style.display = 'none';
    if (el('fab')) el('fab').style.display = 'none';
    if (el('topTitle')) el('topTitle').innerText = 'Контакты';
    renderContacts();
  }

  async function renderContacts(){
    var box = el('contactsList');
    if (!box) return;
    if (!contactsLoaded) {
      box.innerHTML = '<div style="padding:22px;text-align:center;color:#8e8e9e;font-size:12.5px;">Загружаю контакты…</div>';
    }

    var list = [];
    try { list = (window.fbGetContacts ? await window.fbGetContacts() : []) || []; } catch(e){ list = []; }
    contactsLoaded = true;

    if (!list.length) {
      box.innerHTML =
        '<div style="padding:34px 24px;text-align:center;">' +
          '<div style="font-size:34px;margin-bottom:10px;">👥</div>' +
          '<div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:6px;">Контактов пока нет</div>' +
          '<div style="font-size:12.5px;color:#8e8e9e;line-height:1.5;margin-bottom:16px;">Найди человека по имени или телефону — и он появится здесь.</div>' +
          '<div id="ctAddBtn" style="display:inline-block;padding:11px 20px;border-radius:13px;background:linear-gradient(135deg,#FFD966,#7C8CFF);color:#0a0a0f;font-weight:700;font-size:13px;cursor:pointer;">Добавить контакт</div>' +
        '</div>';
      var ab = el('ctAddBtn');
      if (ab) ab.addEventListener('click', function(){ var n = el('newBtn'); if (n) n.click(); });
      return;
    }

    // свежие имя/фото/статус — одним запросом на всех
    var profs = {};
    try {
      var uids = list.map(function(c){ return c.uid; }).filter(Boolean);
      if (uids.length && window.fbGetProfilesBatch) profs = await window.fbGetProfilesBatch(uids) || {};
    } catch(e){}

    list.sort(function(a,b){
      var an = ((profs[a.uid] && profs[a.uid].name) || a.name || '').toLowerCase();
      var bn = ((profs[b.uid] && profs[b.uid].name) || b.name || '').toLowerCase();
      return an.localeCompare(bn);
    });

    box.innerHTML = list.map(function(c){
      var p = profs[c.uid] || {};
      /* ИМЯ ВСЕГДА ИЗ ВИЗИТКИ. Заглушка «Пользователь» больше не показывается,
         если у человека есть настоящее имя в профиле. */
      var nm = p.name || (c.name && c.name !== 'Пользователь' ? c.name : '') || 'Пользователь';
      var online = !!p.online;
      var av = p.avatar
        ? '<img src="' + esc2(p.avatar) + '" alt="">'
        : '<div class="av-letter">' + esc2((nm.trim().charAt(0) || '?').toUpperCase()) + '</div>';
      // те же классы, что у строки чата — вид один в один
      return '<div class="chat-row" data-ct-uid="' + esc2(c.uid) + '" data-ct-name="' + esc2(nm) + '">' +
               '<div class="av' + (online ? ' online' : '') + '">' + av + '<span class="dot"></span></div>' +
               '<div class="chat-mid">' +
                 '<div class="chat-top"><div class="chat-name">' + esc2(nm) + '</div></div>' +
                 '<div class="chat-bot"><div class="chat-last">' + (online ? 'в сети' : 'не в сети') + '</div></div>' +
               '</div>' +
             '</div>';
    }).join('');

    box.querySelectorAll('[data-ct-uid]').forEach(function(row){
      row.addEventListener('click', function(){
        var uid = this.dataset.ctUid, nm = this.dataset.ctName;
        if (window.FocusUserCard) window.FocusUserCard.open(uid, { name: nm });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    document.querySelectorAll('.nav-item').forEach(function(n){
      var nav = n.dataset.nav;
      if (nav === 'contacts') n.addEventListener('click', showContacts);
      if (nav === 'chats') n.addEventListener('click', showChats);
    });
    // после добавления контакта список обновляем
    window.addEventListener('focus-contact-added', function(){ contactsLoaded = false; renderContacts(); });
  });

  window.FocusContacts = { show: showContacts, refresh: renderContacts };
})();
