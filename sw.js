/* FOCUS — Service Worker
   Стратегия: "кэшируй то, что посетил" (runtime caching), а не статичный
   список файлов. Благодаря этому НЕ НУЖНО руками дописывать сюда каждый
   новый экран по мере разработки — кэш заполняется сам при первом заходе.

   Стратегия по типам файлов:
   - HTML-страницы: network-first (сначала пробуем сеть — чтобы видеть
     актуальную версию при разработке; если сети нет — берём из кэша)
   - CSS/JS/иконки/шрифты: cache-first (они меняются редко, экономим трафик
     и ускоряем загрузку — что особенно важно при слабом интернете)
*/

const CACHE_NAME = 'focus-cache-v245';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

function isStaticAsset(url) {
    return /\.(css|js|png|jpg|jpeg|svg|woff2?|ttf)$/.test(url);
}

self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Только GET-запросы кэшируем — POST/PUT и т.д. не трогаем
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Скрипты Firebase лежат на чужом домене (gstatic). Без сети они не грузились —
    // из-за этого приложение не могло восстановить сессию и выкидывало на регистрацию.
    // Кэшируем их: сначала сеть, при офлайне — из кэша.
    if (url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') !== -1) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response && response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => caches.open(CACHE_NAME).then((cache) => cache.match(request)))
        );
        return;
    }

    // Не кэшируем остальные чужие домены (например, вызовы AI API)
    if (url.origin !== location.origin) return;

    if (isStaticAsset(url.pathname)) {
        // CSS/JS/иконки — СНАЧАЛА СЕТЬ (всегда свежая версия), кэш только при офлайне.
        // Это важно чтобы обновления JS подхватывались без ручной чистки кэша.
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => caches.open(CACHE_NAME).then((cache) => cache.match(request)))
        );
    } else {
        // HTML-страницы — ТОЛЬКО СЕТЬ (никогда не отдаём старую закэшированную страницу).
        // Кэш используем лишь как аварийный офлайн-фолбэк.
        event.respondWith(
            fetch(request, { cache: 'no-store' })
                .then((response) => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => caches.open(CACHE_NAME).then((cache) => cache.match(request)))
        );
    }
});


/* ПОКАЗ ПУШЕЙ ОТ СЕРВЕРА (работает и когда приложение закрыто) */
self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
    const n = data.notification || data;
    const title = n.title || 'FOCUS ✦';
    const body = n.body || 'Напоминание';
    event.waitUntil(self.registration.showNotification(title, {
        body: body,
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        vibrate: [200, 100, 200],
        data: { url: (data.data && data.data.url) || n.url || './index.html' }
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || './index.html';
    event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        for (const c of list) { if ('focus' in c) return c.focus(); }
        return clients.openWindow(url);
    }));
});
