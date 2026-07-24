/* ═══ КАРТОЧКА ПОЛЬЗОВАТЕЛЯ (как в WhatsApp) ═══
   Раньше тап по аватару не делал НИЧЕГО. Теперь открывается визитка: большое фото,
   имя, статус, город — и действия: написать, перевести F-coin, добавить в контакты,
   добавить в группу, скрыть чат, пожаловаться.

   ВАЖНО: карточка рисуется ВНУТРИ рамки телефона (.phone или #phoneFrame), а не
   поверх всего окна — иначе на компе она вылезала бы за границы «телефона».
   Один модуль на оба экрана: и список чатов, и переписка. */
(function () {
    'use strict';

    function frameEl() {
        return document.getElementById('phoneFrame')
            || document.querySelector('.phone')
            || document.body;
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function toast(msg) {
        try {
            if (window.showToast) return window.showToast(msg);
            if (window.toast) return window.toast(msg);
        } catch (e) {}
        try {
            var t = document.createElement('div');
            t.textContent = msg;
            t.style.cssText = 'position:absolute;left:50%;bottom:80px;transform:translateX(-50%);z-index:100002;' +
                'background:rgba(12,12,18,0.96);color:#fff;border:1px solid rgba(255,255,255,0.14);' +
                'border-radius:12px;padding:10px 16px;font-size:12.5px;max-width:86%;text-align:center;';
            frameEl().appendChild(t);
            setTimeout(function () { if (t.parentNode) t.remove(); }, 2200);
        } catch (e) {}
    }

    function close() {
        var el = document.getElementById('fUserCard');
        if (!el) return;
        el.style.opacity = '0';
        setTimeout(function () { if (el.parentNode) el.remove(); }, 180);
    }

    /** Открыть карточку. uid — чей профиль, opts: {name, avatar, chatId, phone} */
    async function open(uid, opts) {
        opts = opts || {};
        if (!uid) { toast('Профиль недоступен'); return; }
        close();

        var host = frameEl();
        // рамке нужен относительный контекст, иначе карточка уедет за её пределы
        try {
            var pos = getComputedStyle(host).position;
            if (pos === 'static') host.style.position = 'relative';
        } catch (e) {}

        var wrap = document.createElement('div');
        wrap.id = 'fUserCard';
        wrap.style.cssText = 'position:absolute; inset:0; z-index:100001; display:flex;' +
            'align-items:flex-end; justify-content:center; background:rgba(0,0,0,0.55);' +
            'backdrop-filter:blur(3px); opacity:0; transition:opacity .18s; overflow:hidden;';
        wrap.innerHTML =
            '<div id="fUserCardBox" style="width:100%; max-height:92%; overflow-y:auto; background:linear-gradient(180deg,#14141c,#0d0d12);' +
            'border-radius:22px 22px 0 0; border-top:1px solid rgba(255,255,255,0.09);' +
            'padding:16px 18px 22px; transform:translateY(14px); transition:transform .2s;">' +
            '<div style="width:38px;height:4px;border-radius:2px;background:rgba(255,255,255,0.18);margin:0 auto 14px;"></div>' +
            '<div id="fUserCardBody"><div style="text-align:center;color:#8e8e9e;font-size:12.5px;padding:24px 0;">Загружаю…</div></div>' +
            '</div>';
        host.appendChild(wrap);
        requestAnimationFrame(function () {
            wrap.style.opacity = '1';
            var box = document.getElementById('fUserCardBox');
            if (box) box.style.transform = 'translateY(0)';
        });
        wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });

        // ── тянем свежие данные визитки ──
        var prof = { name: opts.name || '', avatar: opts.avatar || '' };
        try {
            if (window.fbGetProfilesBatch) {
                var batch = await window.fbGetProfilesBatch([uid]);
                if (batch && batch[uid]) prof = Object.assign(prof, batch[uid]);
            }
        } catch (e) {}
        var presence = { online: false, text: '' };
        try { if (window.fbGetPresence) presence = await window.fbGetPresence(uid); } catch (e) {}

        var name = prof.name || opts.name || 'Пользователь';
        var letter = name.trim().charAt(0).toUpperCase() || '?';
        var statusText = presence.online ? 'в сети' : (presence.text || 'был(а) недавно');
        var city = prof.city || '';

        var avatarHtml = prof.avatar
            ? '<img src="' + esc(prof.avatar) + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">'
            : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;' +
              'font-size:40px;font-weight:800;color:#0a0a0f;background:linear-gradient(135deg,#FFD966,#7C8CFF);">' + esc(letter) + '</div>';

        function actionBtn(id, icon, label, danger) {
            return '<div class="fuc-act" data-act="' + id + '" style="flex:1 1 30%; min-width:88px; padding:11px 6px; border-radius:13px;' +
                'background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.09); text-align:center; cursor:pointer;">' +
                '<div style="font-size:19px; line-height:1.1;">' + icon + '</div>' +
                '<div style="font-size:10.5px; margin-top:4px; color:' + (danger ? '#ff8080' : '#cfcfe0') + '; font-weight:600;">' + label + '</div></div>';
        }

        document.getElementById('fUserCardBody').innerHTML =
            '<div style="text-align:center;">' +
                '<div style="width:104px;height:104px;border-radius:50%;overflow:hidden;margin:0 auto 12px;' +
                'border:2px solid rgba(255,217,102,0.35); box-shadow:0 8px 26px rgba(0,0,0,0.45);">' + avatarHtml + '</div>' +
                '<div style="font-size:19px;font-weight:800;color:#fff;">' + esc(name) + '</div>' +
                '<div style="font-size:12px;margin-top:4px;color:' + (presence.online ? '#5fd68a' : '#8e8e9e') + ';">' +
                    (presence.online ? '● ' : '') + esc(statusText) + '</div>' +
                (city ? '<div style="font-size:12px;margin-top:3px;color:#8e8e9e;">📍 ' + esc(city) + '</div>' : '') +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;">' +
                actionBtn('write', '💬', 'Написать') +
                actionBtn('coins', '🪙', 'Перевести') +
                actionBtn('contact', '👤', 'В контакты') +
                actionBtn('group', '👥', 'В группу') +
                actionBtn('hide', '🗑', 'Удалить чат', true) +
                actionBtn('report', '🚫', 'Пожаловаться', true) +
            '</div>' +
            '<div id="fucClose" style="margin-top:16px;text-align:center;font-size:12.5px;color:#8e8e9e;cursor:pointer;padding:8px;">Закрыть</div>';

        document.getElementById('fucClose').addEventListener('click', close);

        wrap.querySelectorAll('.fuc-act').forEach(function (el) {
            el.addEventListener('click', async function () {
                var act = this.dataset.act;

                if (act === 'write') {
                    close();
                    if (opts.chatId) { location.href = 'fokus_chat.html?chatId=' + encodeURIComponent(opts.chatId); return; }
                    try {
                        var r = await window.fbOpenChat(uid, name);
                        if (r && r.ok) location.href = 'fokus_chat.html?chatId=' + encodeURIComponent(r.chatId);
                        else toast('Не удалось открыть чат');
                    } catch (e) { toast('Не удалось открыть чат'); }
                    return;
                }

                if (act === 'coins') {
                    close();
                    if (opts.chatId) {
                        // в переписке есть своё окно перевода — открываем его
                        try { if (window.openCoinModal) { window.openCoinModal(); return; } } catch (e) {}
                        location.href = 'fokus_chat.html?chatId=' + encodeURIComponent(opts.chatId) + '&coins=1';
                    } else {
                        toast('Открой переписку, чтобы перевести F-coin');
                    }
                    return;
                }

                if (act === 'contact') {
                    try {
                        var rc = await window.fbAddContact(uid, name, opts.phone || '');
                        toast(rc && rc.ok ? 'Добавлен в контакты ✅' : ((rc && rc.error) || 'Не вышло добавить'));
                    } catch (e) { toast('Не вышло добавить'); }
                    return;
                }

                if (act === 'group') {
                    close();
                    try { localStorage.setItem('focus_group_preselect', uid); } catch (e) {}
                    location.href = 'fokus_chats.html?newgroup=1';
                    return;
                }

                if (act === 'hide') {
                    if (!opts.chatId) { toast('Чат ещё не создан'); return; }
                    if (!confirm('Удалить этот чат из списка? Переписка сохранится у собеседника.')) return;
                    try {
                        var rh = await window.fbHideChat(opts.chatId);
                        if (rh && rh.ok !== false) { close(); location.href = 'fokus_chats.html'; }
                        else toast('Не вышло удалить');
                    } catch (e) { toast('Не вышло удалить'); }
                    return;
                }

                if (act === 'report') {
                    if (!confirm('Пожаловаться на этого пользователя? Мы проверим переписку по обращению.')) return;
                    try {
                        if (window.fbSendMessage && window.FOCUS_SUPPORT_CHAT) {
                            await window.fbSendMessage(window.FOCUS_SUPPORT_CHAT, { kind: 'text', text: 'Жалоба на пользователя ' + uid });
                        }
                    } catch (e) {}
                    toast('Жалоба отправлена. Спасибо');
                    close();
                    return;
                }
            });
        });
    }

    window.FocusUserCard = { open: open, close: close };
})();
