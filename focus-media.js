/* FOCUS — хранилище медиа (IndexedDB)

   ЗАЧЕМ: музыка и фото раньше клались в localStorage как base64.
   Лимит localStorage ~5 МБ (на iOS жёстко), base64 раздувает файл на +33%.
   Один трек 3-5 МБ → переполнение → сохранение падало (музыка не добавлялась на айфоне),
   а фото приходилось жать до 600px (мыло на весь экран).

   IndexedDB даёт сотни МБ и работает на ВСЕХ телефонах (iOS Safari, Android Chrome,
   Samsung Internet и т.д.). Здесь простая обёртка: put / get / del / keys.

   В localStorage теперь хранится только ССЫЛКА (id), а сами байты — в IndexedDB.
*/
(function () {
    var DB_NAME = 'focus_media';
    var STORE = 'files';
    var VERSION = 1;
    var _db = null;

    function open() {
        return new Promise(function (resolve, reject) {
            if (_db) return resolve(_db);
            if (!window.indexedDB) return reject(new Error('IndexedDB не поддерживается'));
            var req = indexedDB.open(DB_NAME, VERSION);
            req.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
            };
            req.onsuccess = function (e) { _db = e.target.result; resolve(_db); };
            req.onerror = function () { reject(req.error || new Error('Не удалось открыть хранилище')); };
        });
    }

    function tx(mode) {
        return open().then(function (db) {
            return db.transaction(STORE, mode).objectStore(STORE);
        });
    }

    var FocusMedia = {
        /** Сохранить файл (dataURL или Blob). Возвращает ключ. */
        put: function (key, value) {
            return tx('readwrite').then(function (store) {
                return new Promise(function (resolve, reject) {
                    var r = store.put(value, key);
                    r.onsuccess = function () { resolve(key); };
                    r.onerror = function () { reject(r.error); };
                });
            });
        },
        /** Получить файл по ключу (или null). */
        get: function (key) {
            return tx('readonly').then(function (store) {
                return new Promise(function (resolve, reject) {
                    var r = store.get(key);
                    r.onsuccess = function () { resolve(r.result != null ? r.result : null); };
                    r.onerror = function () { reject(r.error); };
                });
            }).catch(function () { return null; });
        },
        /** Удалить файл. */
        del: function (key) {
            return tx('readwrite').then(function (store) {
                return new Promise(function (resolve) {
                    var r = store.delete(key);
                    r.onsuccess = function () { resolve(true); };
                    r.onerror = function () { resolve(false); };
                });
            }).catch(function () { return false; });
        },
        /** Список ключей. */
        keys: function () {
            return tx('readonly').then(function (store) {
                return new Promise(function (resolve) {
                    var out = [];
                    var r = store.openKeyCursor ? store.openKeyCursor() : store.openCursor();
                    r.onsuccess = function (e) {
                        var c = e.target.result;
                        if (c) { out.push(c.key); c.continue(); } else resolve(out);
                    };
                    r.onerror = function () { resolve(out); };
                });
            }).catch(function () { return []; });
        },
        /** Уникальный ключ для нового файла. */
        newKey: function (prefix) {
            return (prefix || 'file') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        },
        /** Поддерживается ли (для запасного пути). */
        supported: function () { return !!window.indexedDB; }
    };

    window.FocusMedia = FocusMedia;
})();
