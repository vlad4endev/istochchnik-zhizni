import 'package:flutter_localizations/flutter_localizations.dart' hide GlobalMaterialLocalizations;
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import 'core/nav.dart';
import 'core/session.dart';
import 'core/theme.dart';
import 'features/auth/login_page.dart';
import 'features/auth/pending_page.dart';
import 'features/shell/shell_page.dart';

class IstochnikApp extends StatelessWidget {
  const IstochnikApp({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    return MaterialApp(
      navigatorKey: navigatorKey,
      title: 'Источник жизни',
      theme: churchTheme(brightness: Brightness.light),
      darkTheme: churchTheme(brightness: Brightness.dark),
      themeMode: session.themeMode,
      locale: const Locale('ru'),
      supportedLocales: const [Locale('ru')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ],
      home: !session.ready
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : session.user == null
              ? const LoginPage()
              : session.user!.isActive
                  ? const ShellPage()
                  : const PendingPage(),
    );
  }
}
