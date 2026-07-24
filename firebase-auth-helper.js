/* FOCUS — помощник аутентификации Firebase
   Подключать как модуль ПОСЛЕ firebase-config.js:
   <script type="module" src="firebase-auth-helper.js"></script>

   Даёт глобальные функции (через window), которые можно звать из обычных скриптов:
   - window.fbRegister(email, password) → Promise<{ok, error}>
   - window.fbLogin(email, password) → Promise<{ok, error}>
   - window.fbLogout() → Promise
   - window.fbCurrentUser() → user | null
   - window.fbSaveUserData(data) → Promise (сохранить профиль в Firestore)
   - window.fbLoadUserData() → Promise<data|null> (загрузить профиль)
*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendEmailVerification, reload,
  signInWithCustomToken, setPersistence, indexedDBLocalPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, arrayUnion,
  addDoc, onSnapshot, orderBy, serverTimestamp, limit, startAfter, deleteDoc} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const auth = getAuth(app);

/* ПОСТОЯННАЯ СЕССИЯ: зашёл один раз — остаёшься. Переживает закрытие приложения,
   перезапуск телефона и т.д. (IndexedDB, с запасным вариантом на localStorage). */
try {
  setPersistence(auth, indexedDBLocalPersistence).catch(function(){
    try { setPersistence(auth, browserLocalPersistence); } catch(e){}
  });
} catch(e){}

/* ===== ВХОД ПО ПОЧТЕ И КОДУ (без пароля) =====
   Код генерит и проверяет СЕРВЕР (воркер). Он же выдаёт ключ входа.
   На телефоне код не хранится — подобрать или подставить его нельзя. */
window.fbSendCode = async function(email, mode) {
  try {
    const base = (window.FOCUS_AI_PROXY || '').replace(/\/+$/, '');
    // mode='login' → сервер откажет незнакомой почте («Пожалуйста, пройдите регистрацию»)
    const r = await fetch(base + '/auth/send-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: String(email || '').trim().toLowerCase(), mode: mode || '' })
    });
    const d = await r.json();
    return d.ok ? { ok: true } : { ok: false, error: d.error || 'Не удалось отправить код' };
  } catch (e) { return { ok: false, error: 'Нет связи с сервером' }; }
};

window.fbVerifyCode = async function(email, code) {
  const em = String(email || '').trim().toLowerCase();
  const cd = String(code || '').trim();

  // 1) КОД → КЛЮЧ (через наш сервер). Если не отвечает — понятная подсказка.
  let token = '';
  try {
    const base = (window.FOCUS_AI_PROXY || '').replace(/\/+$/, '');
    const r = await fetch(base + '/auth/verify-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: em, code: cd })
    });
    const d = await r.json();
    if (!d.ok || !d.token) return { ok: false, error: d.error || 'Неверный код' };
    token = d.token;
  } catch (e) {
    return { ok: false, error: 'Сервер не отвечает. Проверь интернет и попробуй снова' };
  }

  // 2) КЛЮЧ → ВХОД (напрямую в Firebase). Здесь и падал network-request-failed:
  //    браузер не мог достучаться до серверов Google (частая причина — VPN или
  //    блокировка). Даём ДВЕ попытки и человеческую подсказку вместо сырой ошибки.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const cred = await signInWithCustomToken(auth, token);
      return { ok: true, uid: cred.user.uid, email: em };
    } catch (e) {
      const msg = String(e && e.message || '');
      const netFail = /network-request-failed|network error|Failed to fetch/i.test(msg);
      if (netFail && attempt < 2) {
        await new Promise(function(res){ setTimeout(res, 1200); });   // подождём и повторим
        continue;
      }
      if (netFail) {
        return { ok: false, error: 'Firebase недоступен. Если включён VPN — отключи его и попробуй снова. Либо смени сеть (например, мобильный интернет).' };
      }
      return { ok: false, error: 'Ошибка входа: ' + msg };
    }
  }
};
const db = getFirestore(app);

// перевод ошибок Firebase на русский
function ruError(code) {
  const map = {
    'auth/email-already-in-use': 'Этот email уже зарегистрирован',
    'auth/invalid-email': 'Некорректный email',
    'auth/weak-password': 'Пароль слишком простой (минимум 6 символов)',
    'auth/user-not-found': 'Пользователь не найден',
    'auth/wrong-password': 'Неверный пароль',
    'auth/invalid-credential': 'Неверный email или пароль',
    'auth/too-many-requests': 'Слишком много попыток, попробуйте позже',
    'auth/network-request-failed': 'Нет соединения с интернетом'
  };
  return map[code] || ('Ошибка: ' + code);
}

// регистрация — создаёт аккаунт, шлёт письмо подтверждения, НЕ пускает до подтверждения
window.fbRegister = async function(email, password) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // отправляем и Firebase-письмо (на всякий), но основное подтверждение — по КОДУ (Resend)
    try { await sendEmailVerification(cred.user); } catch(e){}
    // НЕ выходим из аккаунта: юзер остаётся авторизован, чтобы ввод кода записал
    // флаг emailVerified прямо в Firestore (иначе флаг некому сохранить → вход не пустит).
    return { ok: true, needVerify: true, email: email, uid: cred.user.uid };
  } catch (e) {
    return { ok: false, error: ruError(e.code) };
  }
};

// вход — проверяет подтверждение почты, но СОХРАНЯЕТ сессию (не разлогинивает)
window.fbLogin = async function(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    // ОБНОВЛЯЕМ статус с сервера (Firebase-верификация по ссылке)
    try { await cred.user.reload(); } catch(e){}
    let verified = (auth.currentUser && auth.currentUser.emailVerified) || cred.user.emailVerified;
    // ТАКЖЕ принимаем подтверждение ПО КОДУ (Resend) — оно ставит флаг emailVerified в Firestore.
    // Без этого юзер, подтвердивший кодом, не сможет войти (Firebase-флаг остаётся false).
    if (!verified) {
      try {
        const s = await getDoc(doc(db, 'users', cred.user.uid));
        if (s.exists() && (s.data().emailVerified === true || s.data().verified === true)) verified = true;
      } catch(e){}
    }
    // владелец-админ по email — всегда пускаем
    if (!verified && email && email.toLowerCase() === 'moorsalimov@mail.ru') verified = true;
    // локальный флаг подтверждения (юзер подтвердил кодом на этом устройстве)
    if (!verified) {
      try { var lu = window.FocusStorage && FocusStorage.getUser(); if (lu && lu.emailVerified && (lu.email||'').toLowerCase() === email.toLowerCase()) verified = true; } catch(e){}
    }
    if (!verified) {
      try { await sendEmailVerification(cred.user); } catch(e){}
      await signOut(auth);
      return { ok: false, needVerify: true, email: email, error: 'Подтвердите почту — письмо отправлено на ' + email };
    }
    return { ok: true, uid: cred.user.uid };
  } catch (e) {
    return { ok: false, error: ruError(e.code) };
  }
};

// повторно отправить письмо подтверждения (вход по паролю → письмо → выход)
window.fbResendVerification = async function(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    if (cred.user.emailVerified) {
      await signOut(auth);
      return { ok: true, alreadyVerified: true };
    }
    await sendEmailVerification(cred.user);
    await signOut(auth);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: ruError(e.code) };
  }
};

// выход
window.fbLogout = async function() {
  // убираем якорь входа — при явном выходе юзер должен попасть на регистрацию
  try { localStorage.removeItem('focus_login_anchor'); } catch(e){}
  try { await signOut(auth); return { ok: true }; }
  catch (e) { return { ok: false, error: ruError(e.code) }; }
};

// текущий пользователь — храним актуальное значение через слушатель сессии
let _currentUser = null;
/* ═══ ПРОФИЛЬ ОБЯЗАН ДОЕХАТЬ ДО ОБЛАКА ═══
   Раньше анкета уходила в облако ТОЛЬКО если ровно в ту секунду была сессия.
   Сессии нет (страница только открылась, воркер притормозил) → сохранение молча
   пропускалось, повтора не было. При следующем входе облако пустое → человека
   выкидывало заполнять анкету заново.
   Теперь: ставим пометку-долг и досылаем профиль САМИ, как только появится сессия. */
window.FOCUS_PROFILE_DEBT = 'focus_profile_cloud_pending';
window.fbMarkProfileDebt = function(){
  try { localStorage.setItem(window.FOCUS_PROFILE_DEBT, '1'); } catch(e){}
};

function _localProfile(){
  try { return JSON.parse(localStorage.getItem('focus_user') || 'null') || null; } catch(e){ return null; }
}
function _profileReady(u){ return !!(u && u.name && u.assistantName && u.birthDate); }

/** Досылает локальный профиль в облако, если там пусто/неполно или висит долг.
    Работает в фоне и ничего не блокирует. */
window.fbEnsureProfileInCloud = async function(){
  try {
    const user = _currentUser || auth.currentUser;
    if (!user) return { ok:false, reason:'no-session' };
    const d = _localProfile();
    if (!_profileReady(d)) return { ok:false, reason:'local-incomplete' };
    let debt = false;
    try { debt = localStorage.getItem(window.FOCUS_PROFILE_DEBT) === '1'; } catch(e){}
    const snap = await getDoc(doc(db, 'users', user.uid));
    const c = snap.exists() ? (snap.data() || {}) : {};
    const cloudReady = !!(c.name && c.assistantName && c.birthDate);
    if (cloudReady && !debt) return { ok:true, reason:'already' };
    await setDoc(doc(db, 'users', user.uid), {
      email: d.email || '', name: d.name || '', fullName: d.fullName || d.name || '',
      firstName: d.firstName || '', birthDate: d.birthDate || '', age: d.age || '',
      gender: d.gender || '', city: d.city || '', phone: d.phone || '',
      assistantName: d.assistantName || '', assistantVoice: d.assistantVoice || '',
      lifeGoal: d.lifeGoal || null, profileCompleted: true,
      flags: Object.assign({}, d.flags || {}, { profileCompleted: true }),
      updatedAt: new Date().toISOString()
    }, { merge: true });
    try { localStorage.removeItem(window.FOCUS_PROFILE_DEBT); } catch(e){}
    return { ok:true, reason:'uploaded' };
  } catch(e){ return { ok:false, reason:'error' }; }
};

/** БЫСТРОЕ ожидание сессии (опрос каждые 150 мс, обычно 300-500 мс).
    Нужен гарду на главной: нельзя решать «анкеты нет», пока Firebase
    ещё поднимает сессию — иначе выкинет в анкету человека с готовым профилем. */
window.fbWaitSession = function(maxMs){
  return new Promise(function(resolve){
    const now = _currentUser || auth.currentUser;
    if (now) return resolve(now);
    let waited = 0; const step = 150, cap = maxMs || 3000;
    const iv = setInterval(function(){
      const cur = _currentUser || auth.currentUser;
      if (cur) { clearInterval(iv); resolve(cur); return; }
      waited += step;
      if (waited >= cap) { clearInterval(iv); resolve(null); }
    }, step);
  });
};

onAuthStateChanged(auth, (user) => {
  _currentUser = user;
  if (user) {
    // 0. ДОЛГ ПО ПРОФИЛЮ: сессия появилась — молча досылаем профиль в облако,
    //    если он там не осел. Бесконечные попытки, юзер ничего не замечает.
    try { setTimeout(function(){ window.fbEnsureProfileInCloud().catch(function(){}); }, 400); } catch(e){}
    // 1. ВОССТАНОВЛЕНИЕ: при входе подтягиваем данные из облака (только то, чего локально нет)
    if (!sessionStorage.getItem('_fb_restored')) {
      sessionStorage.setItem('_fb_restored', '1');
      if (window.fbRestoreAllData) {
        window.fbRestoreAllData().then(r => {
          if (r && r.restored > 0) {
            // данные вернулись из облака — обновим экран
            window.dispatchEvent(new Event('focus-data-restored'));
          }
          // после восстановления — бэкапим текущее состояние
          setTimeout(() => { if (window.fbBackupAllData) window.fbBackupAllData(); }, 3000);
        });
      }
    } else {
      // не первый раз за сессию — просто бэкап в фоне
      setTimeout(() => { if (window.fbBackupAllData) window.fbBackupAllData(); }, 6000);
    }
  }
  // синкаем профиль в облако
  if (user && window.FocusStorage && typeof window.FocusStorage.getUser === 'function') {
    const lastSync = parseInt(sessionStorage.getItem('_fb_synced') || '0');
    if (Date.now() - lastSync < 5*60*1000) return;
    sessionStorage.setItem('_fb_synced', String(Date.now()));
    try {
      const d = window.FocusStorage.getUser();
      // ЗАЩИТА: не заливаем в облако НЕПОЛНЫЙ профиль. Если анкета ещё не заполнена
      // (нет имени/ассистента/даты) — синк пропускаем, иначе можно затереть облако пустотой.
      const profileReady = d && d.name && d.assistantName && d.birthDate;
      if (!profileReady) return;
      // синкаем в фоне, не блокируя загрузку страницы.
      // ВАЖНО: раньше здесь НЕ было birthDate/assistantName/fullName/gender/lifeGoal —
      // синк заливал в облако неполный профиль, гард потом не видел assistantName/birthDate
      // и выкидывал заполнившего анкету обратно в анкету. Теперь шлём ВЕСЬ профиль.
      setTimeout(() => {
        window.fbSaveUserData({
          name: d.name || '', fullName: d.fullName || d.name || '', firstName: d.firstName || '',
          birthDate: d.birthDate || '', age: d.age || '', gender: d.gender || '',
          city: d.city || '', phone: d.phone || '',
          assistantName: d.assistantName || '', assistantVoice: d.assistantVoice || '',
          lifeGoal: d.lifeGoal || '', avatar: d.avatar || null,
          coins: d.coins || 0, subscription: d.subscription || null,
          subscriptionUntil: d.subscriptionUntil || null, theme: d.theme || 'original',
          activity: d.activity || {}, weekStats: d.weekStats || {},
          referral: d.referral || {}, flags: d.flags || {},
          updatedAt: new Date().toISOString()
        }).catch(() => {});
      }, 3000);
    } catch(e){}
  }
});
window.fbCurrentUser = function() { return _currentUser || auth.currentUser; };

// сохранить данные профиля пользователя в Firestore
/** Приводим имя к виду для поиска */
function _nameLower(n) { return String(n || '').trim().toLowerCase(); }
function _nameTokens(n) {
  return _nameLower(n).split(/\s+/).filter(function(w){ return w.length > 1; }).slice(0, 6);
}


/* ═══ ДЕНЬГИ: ВСЁ СЧИТАЕТ СЕРВЕР ═══
   Телефон только просит и показывает результат. Сам он баланс менять не может. */

function _api() { return (window.FOCUS_AI_PROXY || '').replace(/\/+$/, ''); }

/** Синхронизировать баланс с облаком (единственный источник правды) */
function _syncBalance(d) {
  try {
    if (!window.FocusStorage) return;
    if (typeof d.coins === 'number') FocusStorage.saveUser({ coins: d.coins });
    if (typeof d.coinsBought === 'number' && FocusStorage.setBoughtCoins) FocusStorage.setBoughtCoins(d.coinsBought);
  } catch(e){}
}

/** ПОТРАТИТЬ монеты (ИИ, Оракул). Только купленные — заработанные идут на подписку. */
window.fbSpendCoins = async function(amount, reason) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  try {
    const r = await fetch(_api() + '/coins/spend', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: user.uid, amount: amount, reason: reason || 'ai' })
    });
    const d = await r.json();
    if (d.ok) _syncBalance(d);
    return d;
  } catch (e) { return { ok: false, error: 'Нет связи' }; }
};

/** НАЧИСЛИТЬ заработанные монеты (план заданий / родитель ребёнку) */
window.fbAwardCoins = async function(amount, key, toUid) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  try {
    const body = { uid: toUid || user.uid, amount: amount, key: key || '' };
    if (toUid && toUid !== user.uid) body.from = user.uid;    // родитель платит своими
    const r = await fetch(_api() + '/coins/award', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const d = await r.json();
    if (d.ok && (!toUid || toUid === user.uid)) _syncBalance(d);
    return d;
  } catch (e) { return { ok: false, error: 'Нет связи' }; }
};

/** ПОДТВЕРДИТЬ ОПЛАТУ — сервер проверит платёж в ЮKassa и начислит сам */
window.fbConfirmPayment = async function(paymentId) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  try {
    const r = await fetch(_api() + '/payment/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId: paymentId, uid: user.uid })
    });
    const d = await r.json();
    if (d.ok) _syncBalance(d);
    return d;
  } catch (e) { return { ok: false, error: 'Нет связи' }; }
};


/* РАЗОВЫЙ ПЕРЕНОС купленных монет в облако (у старых юзеров они были только на телефоне).
   Выполняется один раз за установку; сервер примет, только если в облаке ещё пусто. */
window.fbMigrateBoughtCoins = async function() {
  const user = _currentUser || auth.currentUser;
  if (!user) return;
  try {
    if (localStorage.getItem('focus_bought_migrated')) return;
    let bought = 0;
    try { bought = parseInt(localStorage.getItem('focus_coins_bought')) || 0; } catch(e){}
    if (bought <= 0) { localStorage.setItem('focus_bought_migrated', '1'); return; }

    const r = await fetch(_api() + '/coins/migrate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: user.uid, bought: bought })
    });
    const d = await r.json();
    if (d.ok) {
      localStorage.setItem('focus_bought_migrated', '1');
      if (typeof d.coinsBought === 'number') { try { FocusStorage.setBoughtCoins(d.coinsBought); } catch(e){} }
    }
  } catch(e){}
};

// запускаем один раз после входа
setTimeout(function(){ if (window.fbMigrateBoughtCoins) window.fbMigrateBoughtCoins(); }, 4000);

window.fbSaveUserData = async function(data) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  try {
    // СЛУЖЕБНЫЕ ПОЛЯ ДЛЯ ПОИСКА.
    // Раньше поиск скачивал ВСЮ базу юзеров и перебирал вручную (1000 юзеров = 1000 чтений).
    // Теперь при каждом сохранении профиля пишем нормализованные поля — и поиск находит
    // человека ТОЧЕЧНЫМ запросом за 1 чтение. Пишем только если поле реально пришло,
    // чтобы частичное сохранение (например, только монет) ничего не затёрло.
    const payload = Object.assign({}, data);

    /* 🔒 ДЕНЕЖНЫЕ ПОЛЯ ТЕЛЕФОН НЕ ПИШЕТ — НИКОГДА.
       Раньше монеты и подписку записывал сам телефон. Значит любой, кто откроет консоль,
       мог выписать себе 999999 монет и подписку Про бесплатно.
       Теперь их меняет ТОЛЬКО сервер (после проверки оплаты в ЮKassa либо по правилам наград),
       а телефон эти поля просто ЧИТАЕТ из облака. */
    delete payload.coins;
    delete payload.coinsBought;
    delete payload.subscription;
    delete payload.subscriptionUntil;
    delete payload.role;

    if (typeof data.phone === 'string' && data.phone) payload.phoneNorm = _normPhone(data.phone);
    if (typeof data.name === 'string' && data.name) {
      payload.nameLower  = _nameLower(data.name);
      payload.nameTokens = _nameTokens(data.name);
    }
    if (typeof data.email === 'string' && data.email) payload.emailLower = data.email.toLowerCase();

    await setDoc(doc(db, 'users', user.uid), payload, { merge: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

// загрузить данные профиля из Firestore
window.fbLoadUserData = async function() {
  const user = _currentUser || auth.currentUser;
  if (!user) return null;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const main = snap.exists() ? snap.data() : {};
    // ТАКЖЕ читаем бэкап разделов, досланный при закрытии приложения (fbFlushNow),
    // и сливаем его поверх extraData — чтобы свежие данные не терялись на новом устройстве.
    try {
      const bSnap = await getDoc(doc(db, 'users', user.uid, 'backup', 'sections'));
      if (bSnap.exists()) {
        const bd = bSnap.data();
        const backupData = bd && bd.data ? bd.data : null;
        const backupTime = bd && bd.updatedAt ? bd.updatedAt : null;
        const mainTime = main && main.updatedAt ? main.updatedAt : null;
        if (backupData && typeof backupData === 'object') {
          main.extraData = main.extraData || {};
          // если бэкап новее основного синка — его значения приоритетнее (это последние правки перед закрытием)
          const backupNewer = backupTime && (!mainTime || new Date(backupTime) >= new Date(mainTime));
          Object.keys(backupData).forEach(function(k){
            if (backupData[k] == null) return;
            if (backupNewer || main.extraData[k] == null) main.extraData[k] = backupData[k];
          });
        }
      }
    } catch (e) { /* бэкапа нет — не страшно */ }
    return (snap.exists() || (main.extraData && Object.keys(main.extraData).length)) ? main : null;
  } catch (e) {
    return null;
  }
};

// следить за состоянием входа
window.fbOnAuthChange = function(callback) {
  onAuthStateChanged(auth, callback);
};

// ========== ПРИВЯЗКА РОДИТЕЛЬ ↔ РЕБЁНОК (по коду) ==========

// Родитель: создать код привязки. Код сохраняется в pairing_codes/{code} → uid родителя
window.fbCreatePairCode = async function(kind) {
  /* Код привязки. ТИП ('coach' | 'parent') теперь хранится в коде — раньше его не было,
     поэтому нельзя было отличить клиента коуча от ребёнка, и правила для коуча не работали. */
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  const code = 'F' + Math.random().toString(36).slice(2, 7).toUpperCase();
  try {
    await setDoc(doc(db, 'pairing_codes', code), {
      ownerUid: user.uid,
      parentUid: user.uid,            // для обратной совместимости
      kind: kind === 'coach' ? 'coach' : 'parent',
      createdAt: new Date().toISOString(),
      used: false
    });
    return { ok: true, code };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

// Ребёнок: ввести код → связать аккаунты.
// В документе ребёнка пишем parentUid, в документе родителя добавляем childUid в массив children
window.fbLinkByCode = async function(code) {
  /* Привязка к коучу/родителю — теперь через СЕРВЕР.
     Раньше клиент сам писал в документ наставника (children[]) — правила это запрещают,
     из-за чего связь могла не установиться. Сервер ставит нужное поле (coachUid ИЛИ
     parentUid по типу кода) и добавляет клиента в список наставника. */
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  code = (code || '').trim().toUpperCase();
  if (!code) return { ok: false, error: 'Введите код' };
  try {
    const base = (window.FOCUS_AI_PROXY || '').replace(/\/+$/, '');
    const r = await fetch(base + '/pair/link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientUid: user.uid, code: code })
    });
    const d = await r.json();
    if (!d.ok) return { ok: false, error: d.error || 'Не удалось привязать' };

    // запоминаем локально нужное поле
    if (window.FocusStorage) {
      var patch = {};
      if (d.kind === 'coach') patch.coachUid = d.ownerUid; else patch.parentUid = d.ownerUid;
      window.FocusStorage.saveUser(patch);
    }

    // если это привязка ребёнка к родителю — шлём геопозицию (в фоне, не блокируя)
    if (d.kind !== 'coach') {
      setTimeout(function(){
        if (navigator.geolocation && window.fbSaveLocation) {
          navigator.geolocation.getCurrentPosition(
            function(pos){ window.fbSaveLocation(pos.coords.latitude, pos.coords.longitude); },
            function(){}, { enableHighAccuracy: false, timeout: 8000 }
          );
        }
      }, 500);
    }

    return { ok: true, ownerUid: d.ownerUid, parentUid: d.ownerUid, kind: d.kind };
  } catch (e) {
    return { ok: false, error: 'Нет связи. Попробуй снова' };
  }
};

// Родитель: получить данные всех своих детей (для отслеживания активности)
window.fbGetChildren = async function() {
  const user = _currentUser || auth.currentUser;
  if (!user) return [];
  try {
    const meSnap = await getDoc(doc(db, 'users', user.uid));
    if (!meSnap.exists()) return [];
    const childUids = meSnap.data().children || [];
    const children = [];
    for (const uid of childUids) {
      const cSnap = await getDoc(doc(db, 'users', uid));
      if (cSnap.exists()) children.push({ uid, ...cSnap.data() });
    }
    return children;
  } catch (e) {
    return [];
  }
};

// Родитель: отправить задание ребёнку (с наградой и типом проверки)
window.fbSendChildTask = async function(childUid, task) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  try {
    const taskId = 'task_' + Date.now();
    await setDoc(doc(db, 'users', childUid, 'tasks', taskId), {
      text: task.text || '',
      sphere: task.sphere || '',
      reward: task.reward || 0,           // F-coin за выполнение
      verify: task.verify || 'auto',      // 'auto' | 'confirm' | 'photo'
      streakDays: task.streakDays || 0,   // 0 = разовое; N = нужно N дней подряд
      streakBonus: task.streakBonus || 0, // бонус за стрик
      repeat: task.repeat || 'once',      // 'once' | 'daily'
      from: user.uid,
      fromName: task.fromName || 'Родитель',
      status: 'active',                   // active | pending | done
      progress: 0,                        // для стриков — дней подряд
      photo: null,
      lastDone: null,
      createdAt: new Date().toISOString()
    });
    return { ok: true, taskId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

// Ребёнок: получить свои задания (только активные/в ожидании)
window.fbGetChildTasks = async function() {
  const user = _currentUser || auth.currentUser;
  if (!user) return [];
  try {
    const snap = await getDocs(collection(db, 'users', user.uid, 'tasks'));
    const tasks = [];
    snap.forEach(d => { const t = { id: d.id, ...d.data() }; if (t.status !== 'deleted') tasks.push(t); });
    return tasks;
  } catch (e) {
    return [];
  }
};

// Ребёнок: отметить выполнение. Возвращает { ok, awarded, pending, streakComplete }
window.fbMarkTaskDone = async function(taskId, photoData) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  try {
    const taskRef = doc(db, 'users', user.uid, 'tasks', taskId);
    const snap = await getDoc(taskRef);
    if (!snap.exists()) return { ok: false, error: 'Задание не найдено' };
    const task = snap.data();
    const today = new Date().toISOString().slice(0,10);
    if (task.lastDone === today) return { ok: false, error: 'Уже отмечено сегодня' };

    // прогресс стрика
    let progress = task.progress || 0;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    if (task.lastDone === yesterday || !task.lastDone) progress += 1;
    else progress = 1; // стрик сорван — заново
    const streakTarget = task.streakDays || 0;
    const streakComplete = streakTarget > 0 && progress >= streakTarget;

    if (task.verify === 'auto') {
      let award = task.reward || 0;
      if (streakComplete) award += (task.streakBonus || 0);
      await setDoc(taskRef, {
        status: (task.repeat === 'daily' && !streakComplete) ? 'active' : 'done',
        progress, lastDone: today
      }, { merge: true });
      await _transferCoins(task.from, user.uid, award);
      return { ok: true, awarded: award, streakComplete };
    } else {
      await setDoc(taskRef, {
        status: 'pending', progress, lastDone: today,
        photo: photoData || null,
        pendingAward: (task.reward || 0) + (streakComplete ? (task.streakBonus || 0) : 0)
      }, { merge: true });
      return { ok: true, awarded: 0, pending: true };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

// Родитель: получить задания конкретного ребёнка
window.fbGetTasksForChild = async function(childUid) {
  const user = _currentUser || auth.currentUser;
  if (!user) return [];
  try {
    const snap = await getDocs(collection(db, 'users', childUid, 'tasks'));
    const tasks = [];
    snap.forEach(d => { const t = { id: d.id, ...d.data() }; if (t.status !== 'deleted') tasks.push(t); });
    return tasks;
  } catch (e) {
    return [];
  }
};

// Родитель: подтвердить/отклонить выполнение → начислить награду
window.fbConfirmTask = async function(childUid, taskId, approved) {
  /* Коуч/родитель подтверждает выполнение. Награда идёт через СЕРВЕР
     (раньше через _transferCoins, писавший в чужой документ → монеты не доходили). */
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  try {
    const taskRef = doc(db, 'users', childUid, 'tasks', taskId);
    const snap = await getDoc(taskRef);
    if (!snap.exists()) return { ok: false, error: 'Задание не найдено' };
    const task = snap.data();
    if (approved) {
      const award = task.pendingAward || task.reward || 0;
      await setDoc(taskRef, {
        status: (task.repeat === 'daily') ? 'active' : 'done', pendingAward: 0
      }, { merge: true });
      // начисление — через сервер
      if (award > 0) {
        try {
          const base = (window.FOCUS_AI_PROXY || '').replace(/\/+$/, '');
          await fetch(base + '/task/reward', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ownerUid: user.uid, clientUid: childUid, amount: award })
          });
        } catch(e){}
      }
      return { ok: true, awarded: award };
    } else {
      await setDoc(taskRef, { status: 'active', pendingAward: 0, lastDone: '' }, { merge: true });
      return { ok: true, rejected: true };
    }
  } catch (e) { return { ok: false, error: e.message }; }
};
// Родитель: удалить задание
window.fbDeleteChildTask = async function(childUid, taskId) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false };
  try {
    await setDoc(doc(db, 'users', childUid, 'tasks', taskId), { status: 'deleted' }, { merge: true });
    return { ok: true };
  } catch (e) { return { ok: false }; }
};

// Внутреннее: переток F-coin родитель → ребёнок
async function _transferCoins(fromUid, toUid, amount) {
  /* Раньше телефон писал монеты В ЧУЖОЙ документ — правила это запрещают,
     поэтому родительские награды МОЛЧА не доходили (у родителя списывалось,
     ребёнку не приходило). Теперь перевод делает сервер. */
  try {
    const r = await fetch((window.FOCUS_AI_PROXY || '').replace(/\/+$/, '') + '/coins/award', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: toUid, from: fromUid, amount: amount })
    });
    return await r.json();
  } catch (e) { return { ok: false, error: e.message }; }
}

// Ребёнок: сохранить свою геопозицию в облако (вызывается при заходе в приложение)
window.fbSaveLocation = async function(lat, lng) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false };
  try {
    await setDoc(doc(db, 'users', user.uid), {
      location: { lat, lng, at: new Date().toISOString() }
    }, { merge: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

// Родитель: получить последнюю геопозицию конкретного ребёнка
window.fbGetChildLocation = async function(childUid) {
  const user = _currentUser || auth.currentUser;
  if (!user) return null;
  try {
    const snap = await getDoc(doc(db, 'users', childUid));
    if (snap.exists() && snap.data().location) return snap.data().location;
    return null;
  } catch (e) {
    return null;
  }
};

// ========== ЧАТ (реальный обмен сообщениями через Firestore) ==========

// Найти пользователя по номеру телефона (для начала чата)
// Нормализация телефона к единому виду (последние 10 цифр — российский номер)
function _normPhone(phone) {
  let digits = (phone || '').replace(/\D/g, ''); // только цифры
  // убираем ведущую 7 или 8 для РФ-номеров (11 цифр → 10)
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
    digits = digits.slice(1);
  }
  return digits; // 10 цифр (например 9179630777)
}

window.fbFindUserByPhone = async function(phone) {
  /* ПОИСК ПО НОМЕРУ — через сервер, ТОЧЕЧНЫМ запросом (1 чтение).
     Раньше телефон скачивал ВСЮ коллекцию users и перебирал её сам:
     при 1000 юзеров — 1000 чтений на каждый поиск, при 10 000 — приложение вставало колом.
     Ответ функции НЕ изменился — интерфейс работает как прежде. */
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  const norm = _normPhone(phone);
  if (norm.length < 10) return { ok: false, error: 'Введи полный номер (10 цифр)' };
  try {
    const base = (window.FOCUS_AI_PROXY || '').replace(/\/+$/, '');
    const r = await fetch(base + '/users/find', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: user.uid, mode: 'phone', q: phone })
    });
    const d = await r.json();
    if (!d.ok) return { ok: false, error: d.error || 'Не найден' };
    return { ok: true, user: d.user };
  } catch (e) {
    return { ok: false, error: 'Нет связи. Попробуй ещё раз' };
  }
};

// ID общего чата двух пользователей (детерминированный — одинаковый с обеих сторон)
function _chatId(uid1, uid2) {
  return [uid1, uid2].sort().join('__');
}

// Открыть/создать чат с пользователем. Возвращает { ok, chatId }
window.fbOpenChat = async function(otherUid, otherName) {
  // БЫСТРО: то, что можно, пишем сами (правила это разрешают) и сразу открываем чат.
  // Запись собеседнику делает сервер — в ФОНЕ, интерфейс её не ждёт.
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  const chatId = _chatId(user.uid, otherUid);
  try {
    await Promise.all([
      // сам чат (я в участниках — правила разрешают)
      setDoc(doc(db, 'chats', chatId), {
        participants: [user.uid, otherUid],
        updatedAt: new Date().toISOString()
      }, { merge: true }),
      // мой список чатов
      setDoc(doc(db, 'users', user.uid, 'chatList', chatId), {
        chatId, withUid: otherUid, withName: otherName || 'Пользователь',
        updatedAt: new Date().toISOString()
      }, { merge: true })
    ]);

    // собеседнику — на сервере, в фоне (не задерживаем открытие чата)
    try {
      const base = (window.FOCUS_AI_PROXY || '').replace(/\/+$/, '');
      fetch(base + '/chat/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, otherUid: otherUid })
      }).catch(function(){});
    } catch(e){}

    return { ok: true, chatId };
  } catch (e) { return { ok: false, error: e.message }; }
};

/* ДОБАВИТЬ В КОНТАКТЫ — человек остаётся в списке, даже без переписки.
   ЕДИНСТВЕННАЯ версия (раньше их было две, и старая — медленная — затирала эту).
   Принимает (uid, имя, телефон): телефон нужен, он показывается в карточке контакта. */
window.fbAddContact = async function(otherUid, otherName, otherPhone) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false };
  if (!otherUid || otherUid === user.uid) return { ok: false, error: 'Некорректный контакт' };
  try {
    // мгновенно добавляем СЕБЕ (правила это разрешают) — кнопка отвечает сразу, без ожидания сети
    await setDoc(doc(db, 'users', user.uid, 'contacts', otherUid), {
      uid: otherUid,
      name: otherName || 'Пользователь',
      phone: otherPhone || '',
      addedAt: new Date().toISOString()
    }, { merge: true });

    // взаимное добавление + уточнение имени/телефона — на сервере, в ФОНЕ (интерфейс не ждёт)
    try {
      const base = (window.FOCUS_AI_PROXY || '').replace(/\/+$/, '');
      fetch(base + '/contacts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, otherUid: otherUid })
      }).catch(function(){});
    } catch(e){}

    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
};

/* СПИСОК КОНТАКТОВ */
window.fbGetContacts = async function() {
  const user = _currentUser || auth.currentUser;
  if (!user) return [];
  try {
    const snap = await getDocs(collection(db, 'users', user.uid, 'contacts'));
    const out = [];
    snap.forEach(d => out.push(Object.assign({ id: d.id }, d.data())));
    return out;
  } catch (e) { return []; }
};

/* ОНЛАЙН-СТАТУС (как в WhatsApp): отмечаем себя «в сети», читаем статус собеседника */
let _lastTouch = 0;
const _TOUCH_EVERY = 4 * 60 * 1000;   // раз в 4 минуты (было — каждую минуту)

/* ОТМЕТКА «Я В СЕТИ».
   Раньше телефон писал в базу КАЖДУЮ МИНУТУ, даже когда приложение свёрнуто:
   при 1000 юзеров это 120 000 записей в сутки — деньги и разряд батареи.
   Теперь:
     • пишем раз в 4 минуты, и ТОЛЬКО когда приложение открыто на экране;
     • при сворачивании честно отмечаем «вышел», при возврате — «зашёл»;
     • состояние хранит публичная визитка (имя + статус), а не весь профиль. */
window.fbTouchOnline = async function(force, online) {
  const user = _currentUser || auth.currentUser;
  if (!user) return;
  if (typeof document !== 'undefined' && document.hidden && !force) return;   // свёрнуто — не тревожим сеть

  const now = Date.now();
  if (!force && (now - _lastTouch) < _TOUCH_EVERY) return;
  _lastTouch = now;

  try {
    let name = '', avatar = '';
    try {
      var lu = (window.FocusStorage && window.FocusStorage.getUser()) || {};
      name = lu.name || '';
      avatar = lu.avatarSmall || '';   // лёгкая версия для списка (см. профиль)
    } catch(e){}
    var payload = { name: name, online: online === false ? false : true, lastSeen: now };
    if (avatar) payload.avatar = avatar;   // ЕДИНЫЙ аватар FOCUS — виден везде
    await setDoc(doc(db, 'publicProfiles', user.uid), payload, { merge: true });
  } catch(e){}
};

/* Загрузить визитки нескольких людей РАЗОМ (для списка диалогов).
   Одним махом тянем имя+аватар+статус всех собеседников — список рисуется мгновенно. */
window.fbGetProfilesBatch = async function(uids) {
  var out = {};
  if (!uids || !uids.length) return out;
  try {
    await Promise.all(uids.slice(0, 40).map(async function(uid){
      try {
        var d = await getDoc(doc(db, 'publicProfiles', uid));
        if (d.exists()) {
          var f = d.data();
          out[uid] = { name: f.name || '', avatar: f.avatar || '', online: f.online, lastSeen: f.lastSeen || 0 };
        }
      } catch(e){}
    }));
  } catch(e){}
  return out;
};

/* ЖИВОЙ СТАТУС собеседника — подписка, а не опрос.
   Раньше телефон КАЖДЫЕ 30 СЕКУНД дёргал базу и спрашивал «он в сети?».
   Теперь база сама сообщает об изменении — мгновенно и без лишних чтений. */
window.fbWatchPresence = function(uid, callback) {
  if (!uid || !callback) return function(){};
  try {
    return onSnapshot(doc(db, 'publicProfiles', uid), function(d){
      if (!d.exists()) { callback({ online: false, text: '' }); return; }
      callback(_presenceText(d.data()));
    }, function(){});
  } catch (e) { return function(){}; }
};

/** Превращаем данные визитки в человеческий текст */
function _presenceText(p) {
  const ls = (p && p.lastSeen) || 0;
  if (!ls) return { online: false, text: '' };
  const diff = Date.now() - ls;
  // «в сети» = приложение открыто И отметка свежая (с запасом на редкие записи)
  if (p.online !== false && diff < 6 * 60 * 1000) return { online: true, text: 'в сети' };
  const m = Math.floor(diff / 60000);
  if (m < 1) return { online: false, text: 'был(а) только что' };
  if (m < 60) return { online: false, text: 'был(а) ' + m + ' мин назад' };
  const h = Math.floor(m / 60);
  if (h < 24) return { online: false, text: 'был(а) ' + h + ' ч назад' };
  const dd = Math.floor(h / 24);
  return { online: false, text: 'был(а) ' + dd + ' дн назад' };
}

/** Статус человека: {online:true} или {online:false, text:'был(а) 5 минут назад'} */
window.fbGetPresence = async function(uid) {
  try {
    const d = await getDoc(doc(db, 'publicProfiles', uid));
    if (!d.exists()) return { online: false, text: '' };
    return _presenceText(d.data());
  } catch (e) { return { online: false, text: '' }; }
};

// отмечаемся «в сети» пока приложение открыто
/* Раньше: запись в базу каждые 60 секунд — всегда, даже в фоне.
   Теперь: раз в 4 минуты и только пока приложение на экране.
   При сворачивании/возврате — честная отметка «вышел / зашёл». */
setInterval(function(){ if (window.fbTouchOnline) window.fbTouchOnline(); }, 60000);   // проверка; сама запись — не чаще 4 мин
setTimeout(function(){ if (window.fbTouchOnline) window.fbTouchOnline(true, true); }, 1500);

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', function(){
    if (!window.fbTouchOnline) return;
    if (document.hidden) window.fbTouchOnline(true, false);   // свернул — «вышел»
    else window.fbTouchOnline(true, true);                    // вернулся — «в сети»
  });
  window.addEventListener('pagehide', function(){
    if (window.fbTouchOnline) window.fbTouchOnline(true, false);
  });
}

// ===== АДМИН / РАЗРАБОТЧИК =====
window.ADMIN_EMAIL = 'moorsalimov@mail.ru';

// поиск юзеров по ИМЕНИ (частичное совпадение, до 10 результатов)
window.fbFindUsersByName = async function(query) {
  /* ПОИСК ПО ИМЕНИ — через сервер, по индексу. Ответ тот же, что раньше. */
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  const q = (query || '').trim();
  if (q.length < 2) return { ok: false, error: 'Введи минимум 2 буквы' };
  try {
    const base = (window.FOCUS_AI_PROXY || '').replace(/\/+$/, '');
    const r = await fetch(base + '/users/find', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: user.uid, mode: 'name', q: q })
    });
    const d = await r.json();
    if (!d.ok) return { ok: false, error: d.error || 'Никого не найдено' };
    return { ok: true, users: d.users || [] };
  } catch (e) {
    return { ok: false, error: 'Нет связи. Попробуй ещё раз' };
  }
};

window.fbFindAdminUid = async function() {
  /* 🔴 БЫЛО: ПОЛНЫЙ обход коллекции users — и это срабатывало ПРИ КАЖДОМ СТАРТЕ приложения
     (создание контакта с админом). То есть каждый запуск скачивал всю базу юзеров.
     СТАЛО: точечный запрос на сервере + результат запоминается навсегда
     (uid админа не меняется) — обращение происходит ОДИН раз за всю жизнь установки. */
  try {
    const cached = localStorage.getItem('focus_admin_uid');
    if (cached) return cached;

    const base = (window.FOCUS_AI_PROXY || '').replace(/\/+$/, '');
    const r = await fetch(base + '/users/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: window.ADMIN_EMAIL })
    });
    const d = await r.json();
    if (!d.ok || !d.uid) return null;
    try { localStorage.setItem('focus_admin_uid', d.uid); } catch(e){}
    return d.uid;
  } catch (e) { return null; }
};

window.fbEnsureAdminContact = async function() {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false };
  if (user.email && user.email.toLowerCase() === window.ADMIN_EMAIL) return { ok: true, isAdmin: true };
  try {
    const adminUid = await window.fbFindAdminUid();
    if (!adminUid) return { ok: false, error: 'admin-not-registered' };
    const chatId = _chatId(user.uid, adminUid);
    const existing = await getDoc(doc(db, 'users', user.uid, 'chatList', chatId));
    if (existing.exists()) return { ok: true, chatId, already: true };
    await setDoc(doc(db, 'chats', chatId), { participants: [user.uid, adminUid], updatedAt: new Date().toISOString(), admin: true }, { merge: true });
    await setDoc(doc(db, 'users', user.uid, 'chatList', chatId), { chatId, withUid: adminUid, withName: 'Администратор', isAdmin: true, updatedAt: new Date().toISOString() }, { merge: true });
    const myName = (window.FocusStorage && window.FocusStorage.getUser().name) || 'Пользователь';
    await setDoc(doc(db, 'users', adminUid, 'chatList', chatId), { chatId, withUid: user.uid, withName: myName, updatedAt: new Date().toISOString() }, { merge: true });
    await addDoc(collection(db, 'chats', chatId, 'messages'), { from: adminUid, text: 'Привет! Я создатель приложения. Пиши сюда идеи, вопросы, что не так — читаю лично.', kind: 'text', createdAt: new Date().toISOString(), fromAdmin: true });
    return { ok: true, chatId, seeded: true };
  } catch (e) { return { ok: false, error: e.message }; }
};

// АДМИН: получить полные данные любого юзера (для просмотра/восстановления)
window.fbGetUserFullData = async function(uid) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  if (!(user.email && user.email.toLowerCase() === window.ADMIN_EMAIL)) return { ok: false, error: 'Только для админа' };
  if (!uid) return { ok: false, error: 'Не указан пользователь' };
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return { ok: false, error: 'Пользователь не найден' };
    const data = snap.data();
    let backup = null;
    try { const b = await getDoc(doc(db, 'users', uid, 'backup', 'sections')); if (b.exists()) backup = b.data(); } catch(e){}
    return { ok: true, uid: uid, profile: data, backup: backup };
  } catch (e) { return { ok: false, error: e.message }; }
};

// АДМИН: восстановить данные юзеру на ТЕКУЩЕМ устройстве (записать в localStorage)
// использовать осторожно — только когда сам админ хочет посмотреть/перенести
window.fbRestoreUserToLocal = function(fullData) {
  try {
    if (!fullData || !fullData.profile) return { ok: false };
    var p = fullData.profile;
    if (window.FocusStorage) window.FocusStorage.applyCloudData(p);
    return { ok: true };
  } catch(e) { return { ok: false, error: e.message }; }
};

window.fbGetAdminInbox = async function() {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  if (!(user.email && user.email.toLowerCase() === window.ADMIN_EMAIL)) return { ok: false, error: 'Только для админа' };
  try {
    const listSnap = await getDocs(collection(db, 'users', user.uid, 'chatList'));
    const threads = [];
    for (const d of listSnap.docs) {
      const meta = d.data();
      const msgsSnap = await getDocs(collection(db, 'chats', meta.chatId, 'messages'));
      const msgs = [];
      msgsSnap.forEach(m => { const x = m.data(); if (!x.fromAdmin) msgs.push({ text: x.text || '', at: x.createdAt || '' }); });
      if (msgs.length) threads.push({ chatId: meta.chatId, name: meta.withName || 'Пользователь', messages: msgs });
    }
    return { ok: true, threads };
  } catch (e) { return { ok: false, error: e.message }; }
};

// Отправить сообщение (текст и/или вложение: фото/файл/перевод F-coin)
// opts: { text, kind: 'text'|'photo'|'file'|'coins', data, fileName, amount }

/* ПОДГРУЗКА ПОЛНОГО ФОТО/ФАЙЛА — только когда юзер реально тапнул по нему.
   Результат запоминается в памяти: повторный тап не тянет из сети заново. */
const _mediaCache = new Map();
window.fbGetMedia = async function(chatId, mediaId) {
  if (!chatId || !mediaId) return { ok: false };
  const key = chatId + '/' + mediaId;
  if (_mediaCache.has(key)) return { ok: true, data: _mediaCache.get(key), cached: true };
  try {
    const d = await getDoc(doc(db, 'chats', chatId, 'media', mediaId));
    if (!d.exists()) return { ok: false, error: 'Файл не найден' };
    const data = d.data().data || '';
    if (_mediaCache.size > 20) _mediaCache.clear();   // не разрастаемся в памяти
    _mediaCache.set(key, data);
    return { ok: true, data: data };
  } catch (e) { return { ok: false, error: e.message }; }
};

window.fbSendMessage = async function(chatId, opts) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false };
  // обратная совместимость: если передали строку — это текст
  if (typeof opts === 'string') opts = { text: opts, kind: 'text' };
  const kind = opts.kind || 'text';
  if (kind === 'text' && (!opts.text || !opts.text.trim())) return { ok: false };
  try {
    const msg = {
      from: user.uid,
      kind,
      text: (opts.text || '').trim(),
      at: new Date().toISOString(),
      ts: serverTimestamp()
    };
    /* ═══ ТЯЖЁЛОЕ СОДЕРЖИМОЕ — В ОТДЕЛЬНЫЙ ДОКУМЕНТ ═══
       Раньше фото и файлы лежали ПРЯМО ВНУТРИ сообщения. Из-за этого при каждом открытии
       чата телефон скачивал ВСЕ фото целиком — даже те, что юзер не смотрит. 50 сообщений
       с фото = десятки мегабайт на ровном месте: чат «грузился и тупил».
       Теперь: само фото уходит в отдельный документ, а в сообщении остаётся только
       КРОШЕЧНАЯ миниатюра (несколько КБ) — она видна сразу. Полное фото подгружается
       ТОЛЬКО когда юзер по нему тапнул. */
    if (kind === 'photo' || kind === 'file') {
      let mediaId = null;
      try {
        const mref = await addDoc(collection(db, 'chats', chatId, 'media'), {
          data: opts.data,
          kind: kind,
          fileName: opts.fileName || '',
          from: user.uid,
          at: new Date().toISOString()
        });
        mediaId = mref.id;
      } catch (e) {
        mediaId = null;   // правила ещё не обновлены — работаем по-старому, ничего не ломаем
      }

      if (mediaId) {
        msg.mediaId = mediaId;
        msg.thumb = opts.thumb || '';                       // мини-превью прямо в сообщении
      } else {
        msg.data = opts.data;                              // ЗАПАСНОЙ ПУТЬ: как раньше
      }
      if (kind === 'file') {
        msg.fileName = opts.fileName || 'файл';
        msg.fileSize = opts.fileSize || '';
      }
    }
    if (kind === 'coins') msg.amount = opts.amount || 0;     // перевод F-coin
    /* ПРОГРАММА ТРЕНИРОВОК прямо в чат: раньше код приходилось копировать руками
       и слать через сторонний мессенджер. Теперь улетает сообщением, получатель
       жмёт «Добавить себе» — оплата и импорт происходят внутри приложения. */
    if (kind === 'program') {
      msg.progCode  = opts.progCode || '';
      msg.progName  = opts.progName || 'Программа';
      msg.progPrice = parseInt(opts.progPrice, 10) || 0;
    }
    await addDoc(collection(db, 'chats', chatId, 'messages'), msg);
    // текст превью для списка чатов
    let preview = opts.text || '';
    if (kind === 'photo') preview = '📷 Фото';
    if (kind === 'file') preview = '📎 ' + (opts.fileName || 'Файл');
    if (kind === 'coins') preview = '💰 Перевод ' + (opts.amount||0) + ' F-coin';
    if (kind === 'program') preview = '🏋️ Программа: ' + (opts.progName || '');
    // Превью в СВОЁМ списке чатов обновляем сами...
    try {
      await setDoc(doc(db, 'users', user.uid, 'chatList', chatId), {
        lastText: preview.slice(0, 60), updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch(e){}

    // ...а собеседнику — через СЕРВЕР (в чужой документ клиенту писать нельзя,
    // раньше именно это роняло отправку целиком: «сообщение не отправилось»).
    try {
      const base = (window.FOCUS_AI_PROXY || '').replace(/\/+$/, '');
      fetch(base + '/chat/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, chatId: chatId, preview: preview.slice(0, 60) })
      }).catch(function(){});
    } catch(e){}

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

// Перевод F-coin другому пользователю (в чате)
window.fbTransferCoinsInChat = async function(chatId, toUid, amount) {
  /* ПЕРЕВОД МОНЕТ.
     Раньше это делал телефон: он пытался начислить монеты В ЧУЖОЙ документ, а правила это
     запрещают → у отправителя списывалось, получателю НЕ приходило. Монеты просто исчезали.
     Плюс проверялся общий баланс — можно было перевести ЗАРАБОТАННЫЕ монеты, чего нельзя.
     Теперь всё считает сервер: проверяет КУПЛЕННЫЕ монеты и переводит атомарно. */
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  amount = parseInt(amount) || 0;
  if (amount <= 0) return { ok: false, error: 'Неверная сумма' };

  try {
    const base = (window.FOCUS_AI_PROXY || '').replace(/\/+$/, '');
    const r = await fetch(base + '/coins/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: user.uid, toUid: toUid, amount: amount })
    });
    const d = await r.json();
    if (!d.ok) return { ok: false, error: d.error || 'Перевод не прошёл' };

    // синхронизируем баланс на телефоне с тем, что посчитал сервер
    try {
      if (window.FocusStorage) {
        FocusStorage.saveUser({ coins: d.myCoins });
        if (FocusStorage.setBoughtCoins) FocusStorage.setBoughtCoins(d.myBought);
      }
    } catch(e){}

    // квитанция в чат (не задерживаем ответ — уходит следом)
    window.fbSendMessage(chatId, { kind: 'coins', amount: amount, text: '' }).catch(function(){});

    return { ok: true, newBalance: d.myCoins };
  } catch (e) {
    return { ok: false, error: 'Нет связи. Перевод не выполнен' };
  }
};



// Глобальный поиск по чатам, сообщениям и файлам (как в WhatsApp)
window.fbSearchChats = async function(queryText) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { chats: [], messages: [] };
  const qq = (queryText || '').trim().toLowerCase();
  if (!qq) return { chats: [], messages: [] };
  try {
    const listSnap = await getDocs(collection(db, 'users', user.uid, 'chatList'));
    const chatList = [];
    listSnap.forEach(d => chatList.push({ id: d.id, ...d.data() }));
    // чаты по имени собеседника
    const matchedChats = chatList.filter(c => (c.withName || '').toLowerCase().includes(qq));
    // сообщения и файлы во всех чатах (ограничиваем для скорости)
    const matchedMessages = [];
    // ограничиваем: ищем по 20 последним чатам (раньше обходились ВСЕ чаты подряд —
    // при 100 чатах это 100 запросов и секунды ожидания)
    for (const c of chatList.slice(0, 20)) {
      try {
        // берём только последние 50 сообщений чата (не все — для скорости)
        const msgSnap = await getDocs(query(collection(db, 'chats', c.chatId, 'messages'), orderBy('ts', 'desc'), limit(50)));
        msgSnap.forEach(m => {
          const data = m.data();
          const text = (data.text || '').toLowerCase();
          const fileName = (data.fileName || '').toLowerCase();
          if (text.includes(qq) || fileName.includes(qq)) {
            matchedMessages.push({
              chatId: c.chatId, withName: c.withName || 'Пользователь',
              text: data.text || '', kind: data.kind || 'text',
              fileName: data.fileName || '', at: data.at || '', from: data.from
            });
          }
        });
      } catch(e){}
    }
    matchedMessages.sort((a,b) => (b.at||'').localeCompare(a.at||''));
    return { chats: matchedChats, messages: matchedMessages };
  } catch (e) {
    return { chats: [], messages: [] };
  }
};

// Подписаться на сообщения чата (реалтайм). Возвращает функцию отписки.
window.fbListenMessages = function(chatId, callback) {
  try {
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('ts', 'desc'), limit(50));   // свежие 50, старые — по прокрутке вверх
    return onSnapshot(q, (snap) => {
      const msgs = [];
      snap.forEach(d => msgs.push(Object.assign({ id: d.id, _ts: d.data().ts }, d.data())));
      msgs.reverse();          // из «свежие сверху» → в нормальный порядок (старые → новые)
      callback(msgs);
    }, () => {});
  } catch (e) {
    return function(){};
  }
};

// Получить список чатов пользователя

/* ПОДГРУЗКА СТАРОЙ ПЕРЕПИСКИ (прокрутка вверх, как в WhatsApp).
   Раньше грузились только последние 200 сообщений и всё — дальше история была недоступна.
   Теперь: свежие 50 сразу, а при прокрутке вверх подтягиваем следующие порции. */
window.fbLoadOlderMessages = async function(chatId, beforeTs, count) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, messages: [] };
  try {
    let q;
    if (beforeTs) {
      q = query(collection(db, 'chats', chatId, 'messages'),
                orderBy('ts', 'desc'), startAfter(beforeTs), limit(count || 50));
    } else {
      q = query(collection(db, 'chats', chatId, 'messages'),
                orderBy('ts', 'desc'), limit(count || 50));
    }
    const snap = await getDocs(q);
    const out = [];
    snap.forEach(d => out.push(Object.assign({ id: d.id, _ts: d.data().ts }, d.data())));
    out.reverse();   // от старых к новым
    return { ok: true, messages: out, hasMore: out.length === (count || 50) };
  } catch (e) {
    return { ok: false, messages: [], error: e.message };
  }
};


/* Убрать чат из своего списка (у собеседника остаётся). Как «удалить чат» в мессенджерах. */
window.fbHideChat = async function(chatId) {
  const user = _currentUser || auth.currentUser;
  if (!user || !chatId) return { ok: false };
  try {
    await deleteDoc(doc(db, 'users', user.uid, 'chatList', chatId));
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
};

window.fbGetChatList = async function() {
  const user = _currentUser || auth.currentUser;
  if (!user) return [];
  try {
    const snap = await getDocs(collection(db, 'users', user.uid, 'chatList'));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    list.sort((a,b) => (b.updatedAt||'').localeCompare(a.updatedAt||''));

    /* Подтягиваем СВЕЖИЙ аватар и статус собеседников из визиток — РАЗОМ.
       Так в списке диалогов у каждого актуальное фото и «в сети», и всё это
       грузится одним махом, а не по одному запросу на чат. */
    try {
      var peers = list.filter(function(c){ return c.type !== 'group' && c.withUid; })
                      .map(function(c){ return c.withUid; });
      if (peers.length && window.fbGetProfilesBatch) {
        var profs = await window.fbGetProfilesBatch(peers);
        list.forEach(function(c){
          var p = profs[c.withUid];
          if (p) {
            if (p.avatar) c.avatar = p.avatar;
            if (p.name) c.withName = p.name;
            c._online = p.online;
            c._lastSeen = p.lastSeen;
          }
        });
      }
    } catch(e){}

    return list;
  } catch (e) {
    return [];
  }
};

// ========== ИИ (DeepSeek через прокси Cloudflare) ==========

// Адрес твоего прокси-воркера (ключ спрятан на стороне Cloudflare)
window.FOCUS_AI_PROXY = 'https://focus-ai.playing-life-rama.workers.dev';

// Универсальный вызов ИИ. messages — массив [{role, content}]
// Возвращает { ok, reply } или { ok:false, error }

// ИИ-подсказки ответов в чате: возвращает массив из 3 вариантов
window.fbAiSuggestReplies = async function(chatId) {
  try {
    // берём последние сообщения чата для контекста
    const snap = await getDocs(query(collection(db, 'chats', chatId, 'messages'), orderBy('ts', 'desc'), limit(6)));
    const recent = [];
    snap.forEach(d => { const m = d.data(); recent.unshift(m.text || (m.kind==='photo'?'[фото]':m.kind==='file'?'[файл]':'')); });
    const context = recent.filter(Boolean).join('\n');
    const prompt = [
      { role: 'system', content: 'Ты помощник в мессенджере. На основе переписки предложи РОВНО 3 коротких варианта ответа от лица пользователя. Каждый с новой строки, без нумерации, без кавычек, естественным разговорным языком на русском.' },
      { role: 'user', content: 'Переписка:\n' + context + '\n\nПредложи 3 варианта ответа:' }
    ];
    const res = await window.fbAskAI(prompt, 200);
    if (res.ok) {
      const variants = res.reply.split('\n').map(s => s.replace(/^[\d\-\.\)\s]+/, '').trim()).filter(Boolean).slice(0, 3);
      return variants.length ? variants : ['Хорошо', 'Понял, спасибо', 'Давай обсудим позже'];
    }
    return ['Хорошо', 'Понял', 'Давай позже'];
  } catch (e) {
    return ['Хорошо', 'Понял', 'Давай позже'];
  }
};

// Вызов ИИ с картинкой (vision) — для разбора фото анализов, еды и т.п.
// imageDataUrl — base64 data:image/...; prompt — текстовый вопрос

/* СТРОГИЙ JSON-ОТВЕТ: модель обязана вернуть {reply, actions:[...]}.
   Так команды ассистента (заполнить раздел, отметить выполненным, поставить напоминание)
   перестают зависеть от того, «вспомнит» ли модель написать тег в свободном тексте. */

/* ПУТЬ B: друг купил подписку → пригласившему начисляем СТОЛЬКО ЖЕ F-coin.
   Начисляем в ОБЛАКЕ (не на телефоне) — иначе можно было бы накрутить локально. */

/* ПРИВЯЗКА ПРИГЛАШЕНИЯ: новый юзер пришёл по ссылке друга (?ref=FOCUS-XXXX).
   Находим владельца кода и записываем связь: кто кого пригласил.
   Без этого рефералы не работали вообще. */

/* Друг стал АКТИВНЫМ (подтвердил почту + заполнил анкету) → засчитываем пригласившему. */



/* РЕФЕРАЛЫ — все начисления идут ЧЕРЕЗ СЕРВЕР.
   Раньше монеты и счётчики писались прямо с телефона в чужой документ —
   это дыра: любой мог накрутить себе монеты из консоли браузера.
   Теперь клиент только просит, а решает и пишет воркер (сервисный ключ). */
async function _refCall(path, body) {
  try {
    const user = _currentUser || auth.currentUser;
    if (!user) return { ok: false };
    const base = (window.FOCUS_AI_PROXY || '').replace(/\/+$/, '');
    const r = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ uid: user.uid }, body || {}))
    });
    return await r.json();
  } catch (e) { return { ok: false, error: e.message }; }
}

/** Привязать пригласившего по коду (после регистрации по ссылке друга) */
window.fbLinkReferral = function(refCode) { return _refCall('/referral/link', { code: refCode }); };

/** Друг заполнил анкету → он «активный», пригласившему +1 */
window.fbMarkReferralActive = function() { return _refCall('/referral/active', {}); };

/** Друг купил подписку → пригласившему столько же F-coin (путь B) */
window.fbCreditReferrer = function(amountRub, planName) { return _refCall('/referral/paid', { amount: amountRub, plan: planName }); };


/* ФОНОВЫЕ УВЕДОМЛЕНИЯ (как в MAX): приходят даже когда приложение закрыто.
   Бесплатно и без лимитов (Firebase Cloud Messaging).
   На iPhone работает только если приложение установлено на экран «Домой» (iOS 16.4+). */
window.FOCUS_VAPID_KEY = 'BJ2Yd24OcbMLCHoJURcHtSvAKcpBR8UGLW9ig1R0oYRkT9VhKlvGnLQzbwMWHAHwVCwTWa6gV1znKLBwJ29Vl38';   // Firebase → Cloud Messaging → Web Push certificates

window.fbEnablePush = async function() {
  try {
    const user = _currentUser || auth.currentUser;
    if (!user) return { ok: false, error: 'Сначала войди' };
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      return { ok: false, error: 'Устройство не поддерживает уведомления' };
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, error: 'Уведомления не разрешены' };

    // Модуль уведомлений подгружаем ТОЛЬКО здесь, по нажатию кнопки.
    // Раньше он подключался вверху файла — и если браузер его не тянул,
    // ломался ВЕСЬ файл авторизации, и в приложение было не зайти.
    let getMessaging, getToken, onMessage;
    try {
      const m = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js");
      getMessaging = m.getMessaging; getToken = m.getToken; onMessage = m.onMessage;
    } catch (e) {
      return { ok: false, error: 'Уведомления не поддерживаются этим браузером' };
    }

    const reg = await navigator.serviceWorker.register('firebase-messaging-sw.js');
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: window.FOCUS_VAPID_KEY,
      serviceWorkerRegistration: reg
    });
    if (!token) return { ok: false, error: 'Не удалось получить токен' };

    // сохраняем токен устройства — воркер будет слать на него уведомления
    await setDoc(doc(db, 'users', user.uid), { pushToken: token, pushAt: new Date().toISOString() }, { merge: true });

    // если приложение открыто — показываем уведомление сами
    onMessage(messaging, function(payload) {
      const n = payload.notification || {};
      // через служебный воркер — new Notification() запрещён в Android/PWA
      try {
        if (window.FocusReminders && FocusReminders.notify) { FocusReminders.notify(n.title || 'FOCUS ✦', n.body || '', 'fcm'); return; }
        navigator.serviceWorker.ready.then(function(r){ r.showNotification(n.title || 'FOCUS ✦', { body: n.body || '', icon: 'icon-192.png' }); });
      } catch(e){}
    });

    return { ok: true, token: token };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

/** Включены ли уведомления */
window.fbPushEnabled = function() {
  return ('Notification' in window) && Notification.permission === 'granted';
};



// ========== БЭКАП ДАННЫХ РАЗДЕЛОВ (безопасный, ручной вызов) ==========
const _SYNC_SKIP = ['focus_realchats_cache','focus_geo_sent','_fb_synced','_fb_restored','focus_selected_child','focus_controlled_children'];
const _SYNC_SKIP_PREFIX = ['focus_chat_msgs_'];

function _collectLocalData(){
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || (!k.startsWith('focus_') && !k.startsWith('faith_'))) continue;
      if (_SYNC_SKIP.includes(k)) continue;
      if (_SYNC_SKIP_PREFIX.some(p => k.startsWith(p))) continue;
      out[k] = localStorage.getItem(k);
    }
  } catch(e){}
  return out;
}

// Сохранить данные разделов в облако (дебаунс). Вызывается вручную, не перехватом.
let _fullSyncTimer = null;
window.fbBackupAllData = function(){
  const user = _currentUser || auth.currentUser;
  if (!user) return;
  clearTimeout(_fullSyncTimer);
  _fullSyncTimer = setTimeout(async () => {
    try {
      const data = _collectLocalData();
      if (Object.keys(data).length === 0) return; // нечего бэкапить — не трогаем облако
      await setDoc(doc(db, 'users', user.uid, 'backup', 'sections'), {
        data: data, updatedAt: new Date().toISOString()
      });
    } catch(e){}
  }, 4000);
};

// Загрузить данные разделов из облака ТОЛЬКО если локально совсем пусто (новое устройство)
window.fbRestoreAllData = async function(){
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok:false };
  try {
    const snap = await getDoc(doc(db, 'users', user.uid, 'backup', 'sections'));
    if (!snap.exists()) return { ok:true, restored:0 };
    const cloud = snap.data().data || {};
    let restored = 0;
    Object.keys(cloud).forEach(k => {
      const localVal = localStorage.getItem(k);
      // ТОЛЬКО если локально пусто И облачное значение непустое — восстанавливаем
      if (localVal === null && cloud[k] && cloud[k] !== 'null' && cloud[k] !== '{}' && cloud[k] !== '[]') {
        try { localStorage.setItem(k, cloud[k]); restored++; } catch(e){}
      }
    });
    return { ok:true, restored };
  } catch(e){ return { ok:false, error:e.message }; }
};

// Периодический автобэкап — каждые 30 сек проверяет изменения и сохраняет в облако
(function(){
  if (typeof window === 'undefined') return;
  let _lastBackupHash = '';
  setInterval(() => {
    const user = _currentUser || auth.currentUser;
    if (!user || !window.fbBackupAllData) return;
    // простой хеш данных — бэкапим только если что-то изменилось
    try {
      const data = _collectLocalData();
      const hash = Object.keys(data).length + ':' + JSON.stringify(data).length;
      if (hash !== _lastBackupHash) {
        _lastBackupHash = hash;
        window.fbBackupAllData();
      }
    } catch(e){}
  }, 90000);   // было 30 сек — телефон дёргался каждые полминуты впустую
  // МГНОВЕННЫЙ сброс в облако — БЕЗ задержки (в отличие от fbBackupAllData c debounce).
  // Нужен на сворачивание/закрытие: там таймеры не успевают выполниться.
  window.fbFlushNow = function(){
    try {
      const user = _currentUser || auth.currentUser;
      if (!user) return;
      const data = _collectLocalData();
      if (Object.keys(data).length === 0) return; // нечего сохранять
      // setDoc сразу, без setTimeout — успеет уйти до выгрузки страницы
      setDoc(doc(db, 'users', user.uid, 'backup', 'sections'), {
        data: data, updatedAt: new Date().toISOString()
      }).catch(() => {});
    } catch(e){}
  };
  // Сворачивание приложения (главный сигнал на мобилке) — сбрасываем немедленно
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') window.fbFlushNow();
  });
  // бэкап при уходе со страницы (закрытие/переход) — мгновенно, чтобы точно не потерять
  window.addEventListener('pagehide', () => { window.fbFlushNow(); });
})();

// ========== ГРУППЫ (чаты на несколько человек, всё в облаке) ==========

// Создать группу. Возвращает { ok, groupId }
window.fbCreateGroup = async function(name, description, avatar, memberUids) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  try {
    const groupId = 'g_' + user.uid.slice(0,6) + '_' + Date.now();
    const members = Array.from(new Set([user.uid, ...(memberUids || [])]));
    // документ группы
    await setDoc(doc(db, 'chats', groupId), {
      type: 'group',
      name: name || 'Группа',
      description: description || '',
      avatar: avatar || '',
      owner: user.uid,
      admins: [user.uid],
      participants: members,
      createdAt: new Date().toISOString()
    });
    // Свой список чатов пишем сами...
    await setDoc(doc(db, 'users', user.uid, 'chatList', groupId), {
      chatId: groupId, type: 'group', withName: name || 'Группа',
      avatar: avatar || '', lastText: 'Группа создана',
      updatedAt: new Date().toISOString(), unread: 0
    });
    // ...а остальным участникам рассылает СЕРВЕР (в чужой документ клиенту писать нельзя —
    // раньше из-за этого группа просто НЕ появлялась у людей).
    try {
      const base = (window.FOCUS_AI_PROXY || '').replace(/\/+$/, '');
      await fetch(base + '/group/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, groupId: groupId, note: 'Группа создана' })
      });
    } catch(e){}
    return { ok: true, groupId };
  } catch (e) { return { ok: false, error: e.message }; }
};

// Получить данные группы
window.fbGetGroup = async function(groupId) {
  try {
    const snap = await getDoc(doc(db, 'chats', groupId));
    return snap.exists() ? { id: groupId, ...snap.data() } : null;
  } catch (e) { return null; }
};

// Обновить группу (название/описание/аватар) — только админ
window.fbUpdateGroup = async function(groupId, updates) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  try {
    const g = await getDoc(doc(db, 'chats', groupId));
    if (!g.exists()) return { ok: false, error: 'Группа не найдена' };
    const data = g.data();
    if (!(data.admins || []).includes(user.uid)) return { ok: false, error: 'Только админ может менять группу' };
    const allowed = {};
    if (updates.name != null) allowed.name = updates.name;
    if (updates.description != null) allowed.description = updates.description;
    if (updates.avatar != null) allowed.avatar = updates.avatar;
    await setDoc(doc(db, 'chats', groupId), allowed, { merge: true });
    // обновим название в chatList участников
    if (updates.name != null || updates.avatar != null) {
      for (const uid of (data.participants || [])) {
        await setDoc(doc(db, 'users', uid, 'chatList', groupId), {
          withName: updates.name != null ? updates.name : data.name,
          avatar: updates.avatar != null ? updates.avatar : (data.avatar||'')
        }, { merge: true }).catch(()=>{});
      }
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
};

// Добавить участника в группу
window.fbAddGroupMember = async function(groupId, newUid) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  try {
    const g = await getDoc(doc(db, 'chats', groupId));
    if (!g.exists()) return { ok: false, error: 'Группа не найдена' };
    const data = g.data();
    await setDoc(doc(db, 'chats', groupId), { participants: arrayUnion(newUid) }, { merge: true });
    // добавление в список чатов нового участника — через сервер
    try {
      const base = (window.FOCUS_AI_PROXY || '').replace(/\/+$/, '');
      await fetch(base + '/group/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, groupId: groupId, note: 'Вас добавили в группу' })
      });
    } catch(e){}
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
};

// Выйти из группы / удалить участника
window.fbLeaveGroup = async function(groupId, uid) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  const target = uid || user.uid;
  try {
    const g = await getDoc(doc(db, 'chats', groupId));
    if (!g.exists()) return { ok: false, error: 'Группа не найдена' };
    const data = g.data();
    const newParts = (data.participants || []).filter(u => u !== target);
    await setDoc(doc(db, 'chats', groupId), { participants: newParts }, { merge: true });
    // убираем из chatList
    try { await setDoc(doc(db, 'users', target, 'chatList', groupId), { removed: true }, { merge: true }); } catch(e){}
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
};

// ============ ОРАКУЛ: СПЕЦИАЛИСТЫ ============
// Специалист подаёт заявку (статус pending → админ модерирует)
window.fbRegisterSpecialist = async function(profile) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Нужен вход в аккаунт' };
  try {
    await setDoc(doc(db, 'specialists', user.uid), {
      uid: user.uid,
      name: profile.name || '',
      categories: profile.categories || [],
      description: profile.description || '',
      price_from: profile.price_from || 100,
      contact: profile.contact || '',
      rating: 0,
      orders_total: 0,
      status: 'pending',            // pending | approved | rejected
      createdAt: new Date().toISOString()
    }, { merge: true });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
};

// Каталог: только одобренные специалисты (для юзеров)
window.fbGetSpecialists = async function() {
  try {
    const snap = await getDocs(query(collection(db, 'specialists'), where('status', '==', 'approved')));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    return list;
  } catch (e) { return []; }
};

// Админ: все заявки на модерацию (pending)
window.fbGetPendingSpecialists = async function() {
  try {
    const snap = await getDocs(query(collection(db, 'specialists'), where('status', '==', 'pending')));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    return list;
  } catch (e) { return []; }
};

// Админ: одобрить/отклонить специалиста
window.fbModerateSpecialist = async function(specUid, approve) {
  try {
    await setDoc(doc(db, 'specialists', specUid), {
      status: approve ? 'approved' : 'rejected',
      moderatedAt: new Date().toISOString()
    }, { merge: true });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
};

// Мой статус специалиста (для экрана «стать специалистом»)
window.fbMySpecialistStatus = async function() {
  const user = _currentUser || auth.currentUser;
  if (!user) return null;
  try {
    const s = await getDoc(doc(db, 'specialists', user.uid));
    return s.exists() ? s.data() : null;
  } catch (e) { return null; }
};

// Заказать консультацию: открыть чат со специалистом + перевести монеты
window.fbOrderConsultation = async function(specUid, specName, price) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Нужен вход' };
  price = parseInt(price, 10) || 0;
  if (price <= 0) return { ok: false, error: 'Неверная цена' };
  try {
    // 1) открываем чат со специалистом
    let chatId = null;
    if (window.fbOpenChat) {
      const chat = await window.fbOpenChat(specUid);
      if (chat && chat.ok) chatId = chat.chatId;
    }
    // 2) ОПЛАТА ЧЕРЕЗ СЕРВЕР (как в чате). Раньше телефон сам писал монеты в свой
    //    и в ЧУЖОЙ документ специалиста — правила это блокируют, монеты терялись,
    //    и проверялся общий баланс (можно было платить заработанными). Теперь всё
    //    считает сервер: проверяет купленные монеты и переводит атомарно.
    const base = (window.FOCUS_AI_PROXY || '').replace(/\/+$/, '');
    const r = await fetch(base + '/coins/transfer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: user.uid, toUid: specUid, amount: price, reason: 'oracle' })
    });
    const d = await r.json();
    if (!d.ok) return { ok: false, error: d.error || 'Оплата не прошла' };
    // синхронизируем баланс с сервером
    try { if (window.FocusStorage) FocusStorage.saveUser({ coins: d.myCoins }); } catch(e){}
    // 3) фиксируем заказ у специалиста
    const orderId = 'ord_' + Date.now();
    try {
      await setDoc(doc(db, 'specialists', specUid, 'orders', orderId), {
        clientUid: user.uid, price: price, chatId: chatId,
        status: 'active', createdAt: new Date().toISOString()
      });
    } catch(e){}
    return { ok: true, chatId, orderId, newBalance: d.myCoins };
  } catch (e) { return { ok: false, error: e.message || 'Ошибка связи' }; }
};

// ============ АДМИН: РЕАЛЬНАЯ СТАТИСТИКА ============
window.fbAdminStats = async function() {
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    let total = 0, activeToday = 0, subscribers = 0, revenue = 0, boughtCoinsTotal = 0;
    const today = new Date().toISOString().slice(0, 10);
    usersSnap.forEach(d => {
      const u = d.data();
      total++;
      // активен сегодня (по последней активности)
      if (u.lastActive && String(u.lastActive).slice(0, 10) === today) activeToday++;
      // подписчики
      if (u.subscription && u.subscription.active) subscribers++;
      // выручка: сумма купленных монет (1 F ≈ 1 ₽ при покупке)
      const bought = u.coins_bought || u.boughtCoins || 0;
      boughtCoinsTotal += bought;
    });
    revenue = boughtCoinsTotal; // купленные монеты = выручка в рублях
    // специалисты
    let specialists = 0, pendingSpecs = 0;
    try {
      const specSnap = await getDocs(collection(db, 'specialists'));
      specSnap.forEach(d => { const s = d.data(); if (s.status === 'approved') specialists++; else if (s.status === 'pending') pendingSpecs++; });
    } catch (e) {}
    return { ok: true, total, activeToday, subscribers, revenue, specialists, pendingSpecs };
  } catch (e) { return { ok: false, error: e.message }; }
};

// проверка: текущий юзер — админ (по роли в Firestore)
window.fbIsAdmin = async function() {
  var ADMIN_EMAILS = ['moorsalimov@mail.ru', 'playing.life.rama@gmail.com'];
  const user = _currentUser || auth.currentUser;
  // проверяем по локальной почте тоже (админ мог войти client-bypass без Firebase-сессии),
  // но это лишь для UI-подсказок — реальный доступ в админку защищён отдельно кодом 467046.
  try {
    var lu = (window.FocusStorage && FocusStorage.getUser) ? FocusStorage.getUser() : null;
    if (lu && lu.email && ADMIN_EMAILS.indexOf(String(lu.email).toLowerCase()) !== -1) return true;
  } catch (e) {}
  if (!user) return false;
  if (user.email && ADMIN_EMAILS.indexOf(user.email.toLowerCase()) !== -1) return true;
  try {
    const s = await getDoc(doc(db, 'users', user.uid));
    return s.exists() && s.data().role === 'admin';
  } catch (e) { return false; }
};

// сигнал готовности
window.FB_AUTH_READY = true;
window.dispatchEvent(new Event('fb-auth-ready'));
console.log('🔥 Firebase Auth готов');
