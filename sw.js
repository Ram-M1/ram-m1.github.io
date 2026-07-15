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

const CACHE_NAME = 'focus-cache-v186';

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
