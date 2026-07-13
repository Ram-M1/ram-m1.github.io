/* ФОНОВЫЕ УВЕДОМЛЕНИЯ (приходят, даже когда приложение ЗАКРЫТО)

   Это отдельный сервис-воркер для push-сообщений (как в MAX и WhatsApp).
   Работает на Android и на iPhone (iOS 16.4+, при условии что приложение
   установлено на экран «Домой» — иначе iOS фоновые уведомления не разрешает).
*/
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyASAdRxYNELOEwCQyAKPSecLBIHrqNoap4",
  authDomain: "focus-21230.firebaseapp.com",
  projectId: "focus-21230",
  storageBucket: "focus-21230.firebasestorage.app",
  messagingSenderId: "510337267182",
  appId: "1:510337267182:web:934b4f2f816e58e594caff"
});

const messaging = firebase.messaging();

// приложение закрыто / свёрнуто — показываем уведомление
messaging.onBackgroundMessage(function (payload) {
  const n = payload.notification || {};
  const d = payload.data || {};
  self.registration.showNotification(n.title || 'FOCUS', {
    body: n.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || 'focus',
    data: { url: d.url || '/' },
    vibrate: [100, 50, 100]
  });
});

// клик по уведомлению — открываем приложение (или переводим в уже открытое)
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
