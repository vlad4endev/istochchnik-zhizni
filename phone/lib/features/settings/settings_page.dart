import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';

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

  Future<void> _saveOrigin(SessionController session) async {
    final next = SessionController.normalizeOrigin(_origin.text);
    if (next == session.apiOrigin) {
      showMessage(context, 'Этот адрес уже используется');
      return;
    }
    if (!next.startsWith('https://') && !next.startsWith('http://')) {
      showMessage(context, 'Адрес должен начинаться с https://');
      return;
    }
    final signedIn = session.user != null;
    if (signedIn) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Сменить сервер?'),
          content: const Text('Вы выйдете из аккаунта и войдёте заново уже на новом сервере.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Отмена')),
            TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Сменить и выйти')),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
    }
    await session.setApiOrigin(next);
    if (!mounted) return;
    _origin.text = session.apiOrigin;
    if (signedIn) {
      Navigator.of(context).popUntil((route) => route.isFirst);
      return;
    }
    showMessage(context, 'Адрес сохранён');
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    return ChurchPage(
      title: 'Настройки',
      body: SheetList(
        children: [
          const SectionLabel('Тема оформления'),
          Row(
            children: [
              for (final (mode, label, icon) in const [
                (ThemeMode.system, 'Как в системе', Icons.brightness_auto_outlined),
                (ThemeMode.light, 'Светлая', Icons.light_mode_outlined),
                (ThemeMode.dark, 'Тёмная', Icons.dark_mode_outlined),
              ]) ...[
                if (mode != ThemeMode.system) const SizedBox(width: 10),
                Expanded(child: _ThemeTile(label: label, icon: icon, selected: session.themeMode == mode, onTap: () => session.setThemeMode(mode))),
              ],
            ],
          ),
          const SectionLabel('Сервер'),
          ChurchCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                LabeledField(
                  label: 'Адрес сервера',
                  controller: _origin,
                  keyboardType: TextInputType.url,
                  hint: 'https://app.church-tambov.ru',
                ),
                const SizedBox(height: 8),
                Text(
                  'Тот же адрес, что у сайта. Для локальной проверки можно указать IP компьютера.',
                  style: TextStyle(fontSize: 12.5, height: 1.4, color: context.palette.inkMuted),
                ),
                const SizedBox(height: Space.md),
                SecondaryButton(
                  label: 'Сохранить адрес',
                  icon: Icons.check_rounded,
                  onPressed: () => _saveOrigin(session),
                ),
              ],
            ),
          ),
          const SizedBox(height: Space.sm),
          ListGroup(
            children: [
              ListRow(
                leading: const IconTile(Icons.logout_rounded, tone: Tone.red),
                title: 'Выйти из аккаунта',
                titleColor: ChurchColors.danger,
                chevron: false,
                onTap: () async {
                  await session.logout();
                  if (context.mounted) Navigator.of(context).popUntil((route) => route.isFirst);
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ThemeTile extends StatelessWidget {
  const _ThemeTile({required this.label, required this.icon, required this.selected, required this.onTap});

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Semantics(
      button: true,
      selected: selected,
      label: 'Тема: $label',
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: Motion.normal,
          height: 86,
          decoration: BoxDecoration(
            gradient: selected ? wineGradient : null,
            color: selected ? null : palette.card,
            borderRadius: BorderRadius.circular(Radii.xl),
            border: selected ? null : Border.all(color: palette.hairline),
            boxShadow: selected ? null : palette.cardShadow,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: selected ? Colors.white : palette.inkMuted),
              const SizedBox(height: 6),
              Text(
                label,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: selected ? Colors.white : palette.ink),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
