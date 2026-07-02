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
  signOut, onAuthStateChanged, sendEmailVerification, reload
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, arrayUnion,
  addDoc, onSnapshot, orderBy, serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
    // отправляем письмо подтверждения
    try { await sendEmailVerification(cred.user); } catch(e){}
    // выходим — пускаем только после подтверждения почты
    await signOut(auth);
    return { ok: true, needVerify: true, email: email };
  } catch (e) {
    return { ok: false, error: ruError(e.code) };
  }
};

// вход — проверяет подтверждение почты, но СОХРАНЯЕТ сессию (не разлогинивает)
window.fbLogin = async function(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    // проверяем подтверждение почты (только чтобы не пускать совсем неподтверждённых)
    if (!cred.user.emailVerified) {
      try { await sendEmailVerification(cred.user); } catch(e){}
      await signOut(auth);
      return { ok: false, needVerify: true, email: email, error: 'Подтвердите почту — письмо отправлено на ' + email };
    }
    // почта подтверждена — сессия СОХРАНЯЕТСЯ (Firebase помнит, повторный вход не нужен)
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
  try { await signOut(auth); return { ok: true }; }
  catch (e) { return { ok: false, error: ruError(e.code) }; }
};

// текущий пользователь — храним актуальное значение через слушатель сессии
let _currentUser = null;
onAuthStateChanged(auth, (user) => {
  _currentUser = user;
  if (user) {
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
      // синкаем в фоне, не блокируя загрузку страницы
      setTimeout(() => {
        window.fbSaveUserData({
          name: d.name || '', age: d.age || '', city: d.city || '', phone: d.phone || '',
          avatar: d.avatar || null,
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
window.fbSaveUserData = async function(data) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  try {
    await setDoc(doc(db, 'users', user.uid), data, { merge: true });
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
    return snap.exists() ? snap.data() : null;
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
window.fbCreatePairCode = async function() {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  // короткий читаемый код
  const code = 'F' + Math.random().toString(36).slice(2, 7).toUpperCase();
  try {
    await setDoc(doc(db, 'pairing_codes', code), {
      parentUid: user.uid,
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
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  code = (code || '').trim().toUpperCase();
  if (!code) return { ok: false, error: 'Введите код' };
  try {
    const codeSnap = await getDoc(doc(db, 'pairing_codes', code));
    if (!codeSnap.exists()) return { ok: false, error: 'Код не найден' };
    const parentUid = codeSnap.data().parentUid;
    if (parentUid === user.uid) return { ok: false, error: 'Нельзя привязать себя' };
    // ребёнок → запоминает родителя (в облаке И локально)
    await setDoc(doc(db, 'users', user.uid), { parentUid: parentUid }, { merge: true });
    if (window.FocusStorage) window.FocusStorage.saveUser({ parentUid: parentUid });
    // родитель → добавляет ребёнка в список
    await setDoc(doc(db, 'users', parentUid), { children: arrayUnion(user.uid) }, { merge: true });
    // помечаем код использованным
    await setDoc(doc(db, 'pairing_codes', code), { used: true, childUid: user.uid }, { merge: true });
    // геопозицию шлём в фоне, НЕ блокируя привязку (не ждём разрешения гео)
    setTimeout(() => {
      if (navigator.geolocation && window.fbSaveLocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => { window.fbSaveLocation(pos.coords.latitude, pos.coords.longitude); },
          () => {}, { enableHighAccuracy: false, timeout: 8000 }
        );
      }
    }, 500);
    return { ok: true, parentUid };
  } catch (e) {
    return { ok: false, error: e.message };
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
      await _transferCoins(user.uid, childUid, award);
      return { ok: true, awarded: award };
    } else {
      await setDoc(taskRef, { status: 'active', pendingAward: 0, photo: null }, { merge: true });
      return { ok: true, awarded: 0, rejected: true };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
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
  if (!amount || amount <= 0) return;
  try {
    const fromSnap = await getDoc(doc(db, 'users', fromUid));
    if (fromSnap.exists()) {
      const fromCoins = fromSnap.data().coins || 0;
      await setDoc(doc(db, 'users', fromUid), { coins: Math.max(0, fromCoins - amount) }, { merge: true });
    }
    const toSnap = await getDoc(doc(db, 'users', toUid));
    if (toSnap.exists()) {
      const toCoins = toSnap.data().coins || 0;
      await setDoc(doc(db, 'users', toUid), { coins: toCoins + amount }, { merge: true });
    }
  } catch (e) {}
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
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  const norm = _normPhone(phone);
  if (norm.length < 10) return { ok: false, error: 'Введи полный номер (10 цифр)' };
  try {
    // берём всех юзеров и сравниваем по нормализованному телефону
    // (телефоны в базе могут быть в разном формате: 8917..., +7917..., 917...)
    const snap = await getDocs(collection(db, 'users'));
    let found = null;
    snap.forEach(d => {
      if (d.id === user.uid) return;
      const p = _normPhone(d.data().phone);
      if (p && p === norm) found = { uid: d.id, ...d.data() };
    });
    if (!found) return { ok: false, error: 'Пользователь с таким номером не найден в FOCUS' };
    return { ok: true, user: { uid: found.uid, name: found.name || 'Пользователь', phone: found.phone } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

// ID общего чата двух пользователей (детерминированный — одинаковый с обеих сторон)
function _chatId(uid1, uid2) {
  return [uid1, uid2].sort().join('__');
}

// Открыть/создать чат с пользователем. Возвращает { ok, chatId }
window.fbOpenChat = async function(otherUid, otherName) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  try {
    const chatId = _chatId(user.uid, otherUid);
    const myName = (window.FocusStorage && window.FocusStorage.getUser().name) || 'Я';
    // записываем метаданные чата в документы обоих участников
    await setDoc(doc(db, 'chats', chatId), {
      participants: [user.uid, otherUid],
      updatedAt: new Date().toISOString()
    }, { merge: true });
    // список чатов у меня
    await setDoc(doc(db, 'users', user.uid, 'chatList', chatId), {
      chatId, withUid: otherUid, withName: otherName || 'Пользователь', updatedAt: new Date().toISOString()
    }, { merge: true });
    // список чатов у собеседника
    await setDoc(doc(db, 'users', otherUid, 'chatList', chatId), {
      chatId, withUid: user.uid, withName: myName, updatedAt: new Date().toISOString()
    }, { merge: true });
    return { ok: true, chatId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

// Отправить сообщение (текст и/или вложение: фото/файл/перевод F-coin)
// opts: { text, kind: 'text'|'photo'|'file'|'coins', data, fileName, amount }
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
    if (kind === 'photo') msg.data = opts.data;              // base64 сжатого фото
    if (kind === 'file') { msg.data = opts.data; msg.fileName = opts.fileName || 'файл'; msg.fileSize = opts.fileSize || ''; }
    if (kind === 'coins') msg.amount = opts.amount || 0;     // перевод F-coin
    await addDoc(collection(db, 'chats', chatId, 'messages'), msg);
    // текст превью для списка чатов
    let preview = opts.text || '';
    if (kind === 'photo') preview = '📷 Фото';
    if (kind === 'file') preview = '📎 ' + (opts.fileName || 'Файл');
    if (kind === 'coins') preview = '💰 Перевод ' + (opts.amount||0) + ' F-coin';
    const chatSnap = await getDoc(doc(db, 'chats', chatId));
    if (chatSnap.exists()) {
      const parts = chatSnap.data().participants || [];
      for (const uid of parts) {
        await setDoc(doc(db, 'users', uid, 'chatList', chatId), {
          lastText: preview.slice(0, 60), updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

// Перевод F-coin другому пользователю (в чате)
window.fbTransferCoinsInChat = async function(chatId, toUid, amount) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false, error: 'Не авторизован' };
  amount = parseInt(amount) || 0;
  if (amount <= 0) return { ok: false, error: 'Неверная сумма' };
  try {
    // проверяем баланс отправителя
    const meSnap = await getDoc(doc(db, 'users', user.uid));
    const myCoins = (meSnap.exists() && meSnap.data().coins) || 0;
    if (myCoins < amount) return { ok: false, error: 'Недостаточно F-coin (есть ' + myCoins + ')' };
    // переток
    await _transferCoins(user.uid, toUid, amount);
    // сообщение-квитанция в чат
    await window.fbSendMessage(chatId, { kind: 'coins', amount, text: '' });
    return { ok: true, newBalance: myCoins - amount };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

// Добавить пользователя в контакты
window.fbAddContact = async function(contactUid, name, phone) {
  const user = _currentUser || auth.currentUser;
  if (!user) return { ok: false };
  try {
    await setDoc(doc(db, 'users', user.uid, 'contacts', contactUid), {
      uid: contactUid, name: name || 'Контакт', phone: phone || '', addedAt: new Date().toISOString()
    }, { merge: true });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
};

// Получить список контактов
window.fbGetContacts = async function() {
  const user = _currentUser || auth.currentUser;
  if (!user) return [];
  try {
    const snap = await getDocs(collection(db, 'users', user.uid, 'contacts'));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    return list;
  } catch (e) { return []; }
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
    for (const c of chatList) {
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
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('ts', 'asc'), limit(200));
    return onSnapshot(q, (snap) => {
      const msgs = [];
      snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
      callback(msgs);
    }, () => {});
  } catch (e) {
    return function(){};
  }
};

// Получить список чатов пользователя
window.fbGetChatList = async function() {
  const user = _currentUser || auth.currentUser;
  if (!user) return [];
  try {
    const snap = await getDocs(collection(db, 'users', user.uid, 'chatList'));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    list.sort((a,b) => (b.updatedAt||'').localeCompare(a.updatedAt||''));
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
if (!window.fbAskAI) window.fbAskAI = async function(messages, maxTokens) {
  try {
    const res = await fetch(window.FOCUS_AI_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, max_tokens: maxTokens || 600 })
    });
    // если воркер вернул не-200 — показываем статус
    if (!res.ok) {
      let detail = '';
      try { const errData = await res.json(); detail = errData.error || errData.detail || ''; } catch(e){}
      return { ok: false, error: 'Воркер вернул ' + res.status + (detail ? ': ' + detail : '') };
    }
    const data = await res.json();
    if (data.ok && data.reply) return { ok: true, reply: data.reply };
    return { ok: false, error: data.error || data.detail || 'Пустой ответ ИИ' };
  } catch (e) {
    return { ok: false, error: 'Нет связи с воркером: ' + e.message + ' (проверь адрес воркера и что он развёрнут)' };
  }
};

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
window.fbAskAIVision = async function(messages, imageDataUrl, maxTokens) {
  try {
    const res = await fetch(window.FOCUS_AI_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, image: imageDataUrl, max_tokens: maxTokens || 700 })
    });
    const data = await res.json();
    if (data.ok && data.reply) return { ok: true, reply: data.reply };
    return { ok: false, error: data.error || 'Пустой ответ', detail: data.detail, hint: data.hint };
  } catch (e) {
    return { ok: false, error: 'Нет связи с ИИ: ' + e.message };
  }
};

// ========== БЭКАП ДАННЫХ РАЗДЕЛОВ (безопасный, ручной вызов) ==========
const _SYNC_SKIP = ['focus_realchats_cache','focus_geo_sent','_fb_synced','_fb_restored','focus_selected_child','focus_controlled_children'];
const _SYNC_SKIP_PREFIX = ['focus_chat_msgs_'];

function _collectLocalData(){
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('focus_')) continue;
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
  }, 30000);
  // бэкап при уходе со страницы (закрытие/переход) — чтобы точно не потерять
  window.addEventListener('pagehide', () => {
    const user = _currentUser || auth.currentUser;
    if (user && window.fbBackupAllData) window.fbBackupAllData();
  });
})();

// сигнал готовности
window.FB_AUTH_READY = true;
window.dispatchEvent(new Event('fb-auth-ready'));
console.log('🔥 Firebase Auth готов');
