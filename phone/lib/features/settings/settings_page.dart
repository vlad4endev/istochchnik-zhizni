import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/session.dart';
import '../../core/theme.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  late final TextEditingController _origin;

  @override
  void initState() {
    super.initState();
    _origin = TextEditingController(text: context.read<SessionController>().apiOrigin);
  }

  @override
  void dispose() {
    _origin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    final user = session.user;
    return Scaffold(
      appBar: AppBar(title: const Text('Настройки')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (user != null) ...[
            Text(user.displayName, style: Theme.of(context).textTheme.titleLarge),
            Text(roleLabel(user.role)),
            if (user.phone != null) Text(user.phone!),
            const SizedBox(height: 16),
          ],
          Text('Оформление', style: Theme.of(context).textTheme.titleMedium),
          SegmentedButton<ThemeMode>(
            segments: const [
              ButtonSegment(value: ThemeMode.system, label: Text('Система')),
              ButtonSegment(value: ThemeMode.light, label: Text('Свет')),
              ButtonSegment(value: ThemeMode.dark, label: Text('Тьма')),
            ],
            selected: {session.themeMode},
            onSelectionChanged: (value) => session.setThemeMode(value.first),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _origin,
            decoration: const InputDecoration(
              labelText: 'Адрес сервера',
              helperText: 'Тот же адрес, что у сайта. Для локальной проверки можно указать IP компьютера.',
            ),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: () async {
              await session.setApiOrigin(_origin.text);
              if (!context.mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Адрес сохранён')));
            },
            child: const Text('Сохранить адрес'),
          ),
          const SizedBox(height: 24),
          OutlinedButton(
            onPressed: () => session.logout(),
            child: const Text('Выйти'),
          ),
        ],
      ),
    );
  }
}
