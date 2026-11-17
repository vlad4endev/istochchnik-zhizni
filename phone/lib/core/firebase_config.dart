import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// Проект Firebase церкви (mychurch-29bce) — тот же, через который сервер
/// рассылает пуши текущему Android-приложению (web-react/android/app/google-services.json).
/// Это публичные идентификаторы клиента, не секрет: они есть в любом APK.
const FirebaseOptions churchFirebaseAndroid = FirebaseOptions(
  apiKey: 'AIzaSyBBRmpz20U18Nj7-y-j6G_N3a36-_y2iYQ',
  appId: '1:93057601077:android:dd3cc9999ce518472a2b7c',
  messagingSenderId: '93057601077',
  projectId: 'mychurch-29bce',
  storageBucket: 'mychurch-29bce.firebasestorage.app',
);

/// Пуши через FCM настроены только для Android. Для iPhone нужен
/// GoogleService-Info.plist и VoIP-ключи Apple, которых в репозитории нет.
bool get pushSupported => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

Future<bool> ensureFirebase() async {
  if (!pushSupported) return false;
  if (Firebase.apps.isNotEmpty) return true;
  try {
    await Firebase.initializeApp(options: churchFirebaseAndroid);
    return true;
  } catch (_) {
    return false;
  }
}
