/* FOCUS — подключение Firebase (проект focus-21230)
   Используется CDN-версия (модульная, v10) — грузится прямо в браузере без сборки.
   Подключать на каждом экране ПЕРЕД focus-storage.js:
   <script type="module" src="firebase-config.js"></script>

   Этот файл:
   - инициализирует Firebase
   - даёт глобальные window.fbAuth, window.fbDB, window.fbStorage для остальных скриптов
   - объявляет готовность через window.FB_READY (Promise)
*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyASAdRxYNELOEwCQyAKPSecLBIHrqNoap4",
  authDomain: "focus-21230.firebaseapp.com",
  projectId: "focus-21230",
  storageBucket: "focus-21230.firebasestorage.app",
  messagingSenderId: "510337267182",
  appId: "1:510337267182:web:934b4f2f816e58e594caff",
  measurementId: "G-GNBE6QH8YK"
};

const app = initializeApp(firebaseConfig);

// делаем доступными для всех остальных скриптов
window.fbApp = app;
window.fbAuth = getAuth(app);
window.fbDB = getFirestore(app);
window.fbStorage = getStorage(app);
window.FB_OK = true;

// сигнал что Firebase готов
window.dispatchEvent(new Event('firebase-ready'));
console.log('🔥 Firebase подключён: focus-21230');
