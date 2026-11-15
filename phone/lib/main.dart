import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'core/session.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('ru');
  final session = SessionController();
  await session.bootstrap();
  runApp(
    ChangeNotifierProvider.value(
      value: session,
      child: const IstochnikApp(),
    ),
  );
}
