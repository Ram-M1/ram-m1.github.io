/* ═══ ЗАГРУЗЧИК FIREBASE С ЗАПАСНЫМИ ИСТОЧНИКАМИ ═══
   ПРОБЛЕМА: библиотека грузилась ТОЛЬКО с серверов Google (gstatic.com).
   Если они недоступны — а в России их всё чаще режут — не появлялась НИ ОДНА
   функция приложения: ни регистрация, ни вход, ни поиск, ни контакты, ни чат.
   Экраны рисовались, а всё живое было мертво.

   РЕШЕНИЕ: пробуем источники по очереди и берём первый, который ответил.
   Если Google недоступен — приложение работает через запасные зеркала. */

const SOURCES = [
  {
    name: 'google',
    app: 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
    auth: 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js',
    store: 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js',
    msg: 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js'
  },
  {
    name: 'jsdelivr',
    app: 'https://cdn.jsdelivr.net/npm/firebase@10.12.2/app/+esm',
    auth: 'https://cdn.jsdelivr.net/npm/firebase@10.12.2/auth/+esm',
    store: 'https://cdn.jsdelivr.net/npm/firebase@10.12.2/firestore/+esm',
    msg: 'https://cdn.jsdelivr.net/npm/firebase@10.12.2/messaging/+esm'
  },
  {
    name: 'esm.sh',
    app: 'https://esm.sh/firebase@10.12.2/app',
    auth: 'https://esm.sh/firebase@10.12.2/auth',
    store: 'https://esm.sh/firebase@10.12.2/firestore',
    msg: 'https://esm.sh/firebase@10.12.2/messaging'
  }
];

/** Пробуем источник целиком: если хоть одна часть не загрузилась — берём следующий. */
async function loadFrom(src) {
  const [app, auth, store] = await Promise.all([
    import(/* @vite-ignore */ src.app),
    import(/* @vite-ignore */ src.auth),
    import(/* @vite-ignore */ src.store)
  ]);
  return { app, auth, store, source: src };
}

let loaded = null, usedName = '';
for (const src of SOURCES) {
  try {
    loaded = await loadFrom(src);
    usedName = src.name;
    break;
  } catch (e) {
    // источник недоступен — молча пробуем следующий
  }
}

if (!loaded) {
  // ни один источник не ответил — сообщаем понятно, а не «белым экраном»
  try {
    window.FOCUS_FB_FAILED = true;
    console.error('[FOCUS] Библиотека Firebase не загрузилась ни с одного источника');
  } catch (e) {}
  throw new Error('Firebase недоступен');
}

try {
  window.FOCUS_FB_SOURCE = usedName;      // видно в проверке, откуда загрузилось
  window.FOCUS_FB_SOURCES = SOURCES.map(s => s.name);
} catch (e) {}

const A = loaded.app, U = loaded.auth, S = loaded.store;

// ── приложение ──
export const initializeApp = A.initializeApp;

// ── вход ──
export const getAuth = U.getAuth;
export const createUserWithEmailAndPassword = U.createUserWithEmailAndPassword;
export const signInWithEmailAndPassword = U.signInWithEmailAndPassword;
export const signOut = U.signOut;
export const onAuthStateChanged = U.onAuthStateChanged;
export const sendEmailVerification = U.sendEmailVerification;
export const reload = U.reload;
export const signInWithCustomToken = U.signInWithCustomToken;
export const setPersistence = U.setPersistence;
export const indexedDBLocalPersistence = U.indexedDBLocalPersistence;
export const browserLocalPersistence = U.browserLocalPersistence;

// ── база ──
export const getFirestore = S.getFirestore;
export const doc = S.doc;
export const setDoc = S.setDoc;
export const getDoc = S.getDoc;
export const updateDoc = S.updateDoc;
export const collection = S.collection;
export const getDocs = S.getDocs;
export const query = S.query;
export const where = S.where;
export const addDoc = S.addDoc;
export const onSnapshot = S.onSnapshot;
export const orderBy = S.orderBy;
export const serverTimestamp = S.serverTimestamp;
export const limit = S.limit;
export const startAfter = S.startAfter;
export const deleteDoc = S.deleteDoc;
export const arrayUnion = S.arrayUnion;

/* ── ОФЛАЙН-РЕЖИМ ──
   Firestore умеет держать локальную копию данных: чтение идёт мгновенно, без
   похода в сеть, а записи копятся и уходят сами, когда связь появится.
   Раньше эти функции не экспортировались, поэтому режим было невозможно включить —
   каждое чтение ждало сервер, отсюда паузы на экранах.
   Названия отличаются между версиями библиотеки, поэтому берём что есть. */
export const initializeFirestore = S.initializeFirestore;
export const persistentLocalCache = S.persistentLocalCache;
export const persistentMultipleTabManager = S.persistentMultipleTabManager;
export const enableIndexedDbPersistence = S.enableIndexedDbPersistence;

/** Уведомления грузим по требованию — они нужны не на каждом экране. */
export async function loadMessaging() {
  for (const src of SOURCES) {
    try { return await import(/* @vite-ignore */ src.msg); } catch (e) {}
  }
  return null;
}
