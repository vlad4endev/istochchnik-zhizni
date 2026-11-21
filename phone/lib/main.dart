import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'core/call_alerts.dart';
import 'core/firebase_config.dart';
import 'core/push.dart';
import 'core/session.dart';
import 'features/schedule/data/schedule_repository.dart';
import 'features/service/data/plan_repository.dart';
import 'features/songbook/data/songbook_repository.dart';
import 'features/studio/data/studio_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('ru');
  if (pushSupported) {
    FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
    try {
      await FlutterCallkitIncoming.onBackgroundMessage(callKitBackgroundHandler);
    } catch (_) {}
  }
  final session = SessionController();
  session.beforeLogout.add(SongbookRepository.clearAll);
  session.beforeLogout.add(ScheduleRepository.clearAll);
  session.beforeLogout.add(PlanRepository.clearAll);
  session.beforeLogout.add(StudioRepository.clearAll);
  await session.bootstrap();
  unawaited(PushService.instance.start(session));
  runApp(
    ChangeNotifierProvider.value(
      value: session,
      child: const IstochnikApp(),
    ),
  );
}
