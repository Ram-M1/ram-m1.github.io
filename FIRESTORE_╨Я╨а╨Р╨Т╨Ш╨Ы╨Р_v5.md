# 🔒 Правила Firestore v5 (ФИНАЛ — + полный бэкап данных)

## Как обновить
Firebase Console → Firestore → Rules → вставь код (БЕЗ тройных кавычек), Publish.
Начинай с rules_version!

## Код:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;

      match /tasks/{taskId} {
        allow read, write: if request.auth != null;
      }
      match /chatList/{chatId} {
        allow read, write: if request.auth != null;
      }
      match /contacts/{contactId} {
        allow read, write: if request.auth != null;
      }
      match /backup/{docId} {
        allow read, write: if request.auth != null;
      }
    }

    match /pairing_codes/{code} {
      allow read, write: if request.auth != null;
    }

    match /chats/{chatId} {
      allow read, write: if request.auth != null;
      match /messages/{messageId} {
        allow read, write: if request.auth != null;
      }
    }
  }
}

## Что нового в v5
- Полный бэкап ВСЕХ данных разделов в облако (backup) ✅
- Данные не теряются при чистке кэша / смене телефона ✅
- Всё из v4 (чат, контакты, переводы, задания) ✅
