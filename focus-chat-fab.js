/* ============================================================
   FOCUS — Плавающая кнопка чата (FAB)
   Подключается одной строкой на любом экране:
   <script src="focus-chat-fab.js"></script>
   - Сама плавно дрейфует по правой стороне
   - Перетаскивается пальцем куда угодно
   - Бейдж непрочитанных
   - Клик (без перетаскивания) → открывает чаты
   ============================================================ */
(function(){
    // не дублировать, если уже есть
    if (document.getElementById('focusChatFab')) return;

    // ===== стили =====
    var css = `
    #focusChatFab {
        position: fixed; right: 14px; top: 55%;
        width: 56px; height: 56px; border-radius: 50%;
        background: linear-gradient(135deg, var(--accent, #FFD966), var(--accent-2, #7C8CFF));
        box-shadow: 0 6px 22px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08);
        display: flex; align-items: center; justify-content: center;
        z-index: 9000; cursor: pointer; touch-action: none;
        transition: transform 0.18s ease, box-shadow 0.2s ease;
        animation: fabFloat 3.4s ease-in-out infinite;
    }
    #focusChatFab.dragging { animation: none; transition: none; box-shadow: 0 10px 30px rgba(0,0,0,0.6); transform: scale(1.08); }
    #focusChatFab:active { transform: scale(0.94); }
    #focusChatFab svg { width: 26px; height: 26px; color: #0a0a0f; }
    #focusChatFab .fab-badge {
        position: absolute; top: -3px; right: -3px; min-width: 20px; height: 20px;
        border-radius: 11px; background: #FF3B3B; color: #fff;
        font-size: 11px; font-weight: 700; display: none;
        align-items: center; justify-content: center; padding: 0 5px;
        border: 2px solid #0d0d12; font-family: -apple-system, sans-serif;
    }
    #focusChatFab .fab-badge.show { display: flex; }
    @keyframes fabFloat {
        0%, 100% { margin-top: 0; }
        50% { margin-top: -10px; }
    }
    @media (max-width: 600px) {
        #focusChatFab { right: 12px; width: 54px; height: 54px; }
    }`;
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // ===== кнопка =====
    var fab = document.createElement('div');
    fab.id = 'focusChatFab';
    fab.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/>' +
        '</svg>' +
        '<div class="fab-badge" id="fabBadge">0</div>';
    document.body.appendChild(fab);

    // ===== восстановить позицию (если двигали) =====
    try {
        var saved = JSON.parse(localStorage.getItem('focus_fab_pos'));
        if (saved && typeof saved.top === 'number') {
            fab.style.top = saved.top + 'px';
            fab.style.animation = 'none'; // если юзер задал позицию — не качаем
        }
    } catch(e){}

    // ===== бейдж непрочитанных =====
    function updateBadge(){
        var count = 0;
        try {
            var chats = JSON.parse(localStorage.getItem('focus_chats') || '[]');
            chats.forEach(function(c){ count += (c.unread || 0); });
        } catch(e){}
        var badge = document.getElementById('fabBadge');
        if (count > 0) { badge.textContent = count > 99 ? '99+' : count; badge.classList.add('show'); }
        else { badge.classList.remove('show'); }
    }
    updateBadge();
    window.addEventListener('focus', updateBadge);

    // ===== перетаскивание + клик =====
    var dragging = false, moved = false, startY = 0, startTop = 0;

    function onDown(e){
        dragging = true; moved = false;
        fab.classList.add('dragging');
        var y = e.touches ? e.touches[0].clientY : e.clientY;
        startY = y;
        startTop = fab.getBoundingClientRect().top;
        e.preventDefault();
    }
    function onMove(e){
        if (!dragging) return;
        var y = e.touches ? e.touches[0].clientY : e.clientY;
        var dy = y - startY;
        if (Math.abs(dy) > 4) moved = true;
        var newTop = startTop + dy;
        // ограничиваем по экрану
        var maxTop = window.innerHeight - fab.offsetHeight - 10;
        newTop = Math.max(10, Math.min(maxTop, newTop));
        fab.style.top = newTop + 'px';
        fab.style.animation = 'none';
        e.preventDefault();
    }
    function onUp(e){
        if (!dragging) return;
        dragging = false;
        fab.classList.remove('dragging');
        if (moved) {
            // сохранить позицию
            try { localStorage.setItem('focus_fab_pos', JSON.stringify({ top: fab.getBoundingClientRect().top })); } catch(e){}
        } else {
            // это был клик — открыть чаты
            location.href = 'fokus_chats.html';
        }
    }

    fab.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    fab.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
})();
