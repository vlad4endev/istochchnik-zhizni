import 'package:material_ui/material_ui.dart';

import '../reader_controller.dart';
import 'reader_palette.dart';

/// Переключатель в стиле макета: янтарная дорожка и круглая ручка.
class ReaderSwitch extends StatelessWidget {
  const ReaderSwitch({super.key, required this.value, required this.onChanged, required this.palette, required this.label});

  final bool value;
  final ValueChanged<bool>? onChanged;
  final ReaderPalette palette;
  final String label;

  @override
  Widget build(BuildContext context) {
    final enabled = onChanged != null;
    return Semantics(
      toggled: value,
      enabled: enabled,
      label: label,
      excludeSemantics: true,
      onTap: enabled ? () => onChanged!(!value) : null,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: enabled ? () => onChanged!(!value) : null,
        child: SizedBox(
          width: 56,
          height: 44,
          child: Center(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 160),
              width: 48,
              height: 28,
              padding: const EdgeInsets.all(3),
              alignment: value ? Alignment.centerRight : Alignment.centerLeft,
              decoration: BoxDecoration(
                color: !enabled ? palette.track.withValues(alpha: 0.5) : (value ? palette.accent : palette.track),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: value ? palette.onAccent : palette.secondary.withValues(alpha: enabled ? 1 : 0.5),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Кнопка «−» / «+» для сдвига тональности и каподастра.
class StepperButton extends StatelessWidget {
  const StepperButton({super.key, required this.symbol, required this.label, required this.onPressed, required this.palette, this.size = 46});

  final String symbol;
  final String label;
  final VoidCallback? onPressed;
  final ReaderPalette palette;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      enabled: onPressed != null,
      label: label,
      excludeSemantics: true,
      child: Opacity(
        opacity: onPressed == null ? 0.35 : 1,
        child: Material(
          color: palette.surface,
          borderRadius: BorderRadius.circular(14),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onPressed,
            child: SizedBox(
              width: size,
              height: size,
              child: Center(child: Text(symbol, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w500, color: palette.text, height: 1))),
            ),
          ),
        ),
      ),
    );
  }
}

Future<void> showReaderSettings(BuildContext context, ReaderController controller) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.6),
    builder: (_) => ListenableBuilder(
      listenable: controller,
      builder: (context, _) => ReaderSettingsSheet(controller: controller),
    ),
  );
}

/// Выбор тональности одним нажатием вместо десяти «+».
Future<void> showKeyPicker(BuildContext context, ReaderController c) async {
  final palette = ReaderPalette.of(c.settings.theme);
  final keys = c.keyChoices();
  if (keys.isEmpty) return;
  await showDialog<void>(
    context: context,
    builder: (context) => Dialog(
      backgroundColor: palette.sheet,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24), side: BorderSide(color: palette.border)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Тональность', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: palette.text)),
            const SizedBox(height: 4),
            Text('Оригинал: ${c.declaredKey}', style: TextStyle(fontSize: 13, color: palette.muted)),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final key in keys)
                  _KeyChip(
                    label: key,
                    selected: key == c.soundingKey,
                    original: key == c.declaredKey,
                    palette: palette,
                    onTap: () {
                      c.setSoundingKey(key);
                      Navigator.pop(context);
                    },
                  ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}

class _KeyChip extends StatelessWidget {
  const _KeyChip({required this.label, required this.selected, required this.original, required this.palette, required this.onTap});

  final String label;
  final bool selected;
  final bool original;
  final ReaderPalette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: original ? '$label, оригинал' : label,
      excludeSemantics: true,
      child: Material(
        color: selected ? palette.accent : palette.surface,
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minWidth: 62, minHeight: 48),
            padding: const EdgeInsets.symmetric(horizontal: 12),
            alignment: Alignment.center,
            decoration: original && !selected
                ? BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: palette.accent.withValues(alpha: 0.6)))
                : null,
            child: Text(
              label,
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: selected ? palette.onAccent : palette.text),
            ),
          ),
        ),
      ),
    );
  }
}

class ReaderSettingsSheet extends StatelessWidget {
  const ReaderSettingsSheet({super.key, required this.controller});

  final ReaderController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final s = c.settings;
    final p = ReaderPalette.of(s.theme);
    final height = MediaQuery.sizeOf(context).height;
    final hasChords = c.hasChords;
    final capoActive = c.capo > 0;

    return Container(
      constraints: BoxConstraints(maxHeight: height * 0.92),
      decoration: BoxDecoration(
        color: p.sheet,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        border: Border(top: BorderSide(color: p.border)),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(color: p.secondary.withValues(alpha: 0.35), borderRadius: BorderRadius.circular(2)),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(2, 12, 0, 10),
                child: Row(
                  children: [
                    Expanded(
                      child: Semantics(
                        header: true,
                        child: Text('Настройки песни', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: p.text)),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Закрыть',
                      onPressed: () => Navigator.pop(context),
                      icon: Icon(Icons.close_rounded, color: p.muted),
                    ),
                  ],
                ),
              ),
              _Card(
                palette: p,
                child: _SwitchRow(
                  palette: p,
                  icon: Icons.visibility_outlined,
                  title: 'Показывать аккорды',
                  subtitle: hasChords ? null : 'В этой песне нет аккордов',
                  value: s.showChords && hasChords,
                  onChanged: hasChords ? c.setShowChords : null,
                ),
              ),
              if (hasChords) ...[
                const SizedBox(height: 10),
                _Card(
                  palette: p,
                  child: _KeySection(controller: c, palette: p),
                ),
                const SizedBox(height: 10),
                _Card(
                  palette: p,
                  child: _Stepper(
                    palette: p,
                    title: 'КАПОДАСТР',
                    value: '${c.capo}',
                    caption: capoActive ? 'лад ${c.capo}' : 'без каподастра',
                    minusLabel: 'Каподастр ниже',
                    plusLabel: 'Каподастр выше',
                    onMinus: c.capo > 0 ? () => c.changeCapo(-1) : null,
                    onPlus: c.capo < 11 ? () => c.changeCapo(1) : null,
                  ),
                ),
              ],
              const SizedBox(height: 10),
              _Card(
                palette: p,
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          _Label('РАЗМЕР ШРИФТА', p),
                          const Spacer(),
                          Text('${s.fontSize.round()} pt', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: p.accent)),
                        ],
                      ),
                      SliderTheme(
                        data: SliderTheme.of(context).copyWith(
                          trackHeight: 6,
                          activeTrackColor: p.accent,
                          inactiveTrackColor: p.track,
                          thumbColor: p.isDark ? p.text : p.accent,
                          overlayColor: p.accent.withValues(alpha: 0.18),
                          thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 11),
                          trackShape: const RoundedRectSliderTrackShape(),
                          tickMarkShape: SliderTickMarkShape.noTickMark,
                        ),
                        child: Slider(
                          value: s.fontSize,
                          min: ReaderSettings.minFont,
                          max: ReaderSettings.maxFont,
                          divisions: (ReaderSettings.maxFont - ReaderSettings.minFont).round(),
                          label: '${s.fontSize.round()}',
                          semanticFormatterCallback: (v) => '${v.round()} пунктов',
                          onChanged: (v) => c.setFontSize(v, persist: false),
                          onChangeEnd: (v) => c.setFontSize(v),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 10),
              _Card(
                palette: p,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Label('ТЕМА ЭКРАНА', p),
                      const SizedBox(height: 10),
                      _ThemePicker(controller: c, palette: p),
                    ],
                  ),
                ),
              ),
              if (hasChords) ...[
                const SizedBox(height: 10),
                _Card(
                  palette: p,
                  child: _SwitchRow(
                    palette: p,
                    icon: Icons.tune_rounded,
                    title: 'Концертные аккорды',
                    subtitle: capoActive ? 'Показывать то, что звучит, а не то, что играть' : 'Нужны, когда включён каподастр',
                    value: s.concertChords,
                    onChanged: capoActive ? c.setConcert : null,
                  ),
                ),
              ],
              const SizedBox(height: 10),
              _Card(
                palette: p,
                child: _SwitchRow(
                  palette: p,
                  icon: Icons.light_mode_outlined,
                  title: 'Не гасить экран',
                  subtitle: 'Пока песня открыта',
                  value: s.keepAwake,
                  onChanged: c.setKeepAwake,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.palette, required this.child});
  final ReaderPalette palette;
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(color: palette.card, borderRadius: BorderRadius.circular(18), border: Border.all(color: palette.border)),
        child: child,
      );
}

class _Label extends StatelessWidget {
  const _Label(this.text, this.palette);
  final String text;
  final ReaderPalette palette;

  @override
  Widget build(BuildContext context) =>
      Text(text, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1.1, color: palette.muted));
}

class _SwitchRow extends StatelessWidget {
  const _SwitchRow({required this.palette, required this.icon, required this.title, required this.value, required this.onChanged, this.subtitle});

  final ReaderPalette palette;
  final IconData icon;
  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final enabled = onChanged != null;
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: enabled ? () => onChanged!(!value) : null,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
        child: Row(
          children: [
            Icon(icon, size: 22, color: palette.muted),
            const SizedBox(width: 12),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600, color: enabled ? palette.text : palette.muted),
                    ),
                    if (subtitle != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(subtitle!, style: TextStyle(fontSize: 12.5, height: 1.3, color: palette.muted)),
                      ),
                  ],
                ),
              ),
            ),
            ReaderSwitch(value: value, onChanged: onChanged, palette: palette, label: title),
          ],
        ),
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.palette,
    required this.title,
    required this.value,
    required this.caption,
    required this.minusLabel,
    required this.plusLabel,
    required this.onMinus,
    required this.onPlus,
    this.onValueTap,
    this.trailing,
  });

  final ReaderPalette palette;
  final String title;
  final String value;
  final String caption;
  final String minusLabel;
  final String plusLabel;
  final VoidCallback? onMinus;
  final VoidCallback? onPlus;
  final VoidCallback? onValueTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [_Label(title, palette), const Spacer(), ?trailing]),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              StepperButton(symbol: '−', label: minusLabel, onPressed: onMinus, palette: palette),
              Expanded(
                child: Semantics(
                  button: onValueTap != null,
                  label: '$title: $value, $caption',
                  excludeSemantics: true,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: onValueTap,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Column(
                        children: [
                          Text(value, style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: palette.accent, height: 1.2)),
                          Text(caption, textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: palette.muted)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              StepperButton(symbol: '+', label: plusLabel, onPressed: onPlus, palette: palette),
            ],
          ),
        ],
      ),
    );
  }
}

class _KeySection extends StatelessWidget {
  const _KeySection({required this.controller, required this.palette});
  final ReaderController controller;
  final ReaderPalette palette;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final key = c.soundingKey;
    final t = c.transpose;
    final shiftText = t == 0 ? '' : ' (${t > 0 ? '+' : ''}$t)';
    return _Stepper(
      palette: palette,
      title: 'ТОНАЛЬНОСТЬ',
      value: key ?? (t == 0 ? '0' : '${t > 0 ? '+' : ''}$t'),
      caption: key == null
          ? 'тональность не указана'
          : (t == 0 ? 'оригинал ${c.declaredKey}' : 'оригинал ${c.declaredKey}$shiftText · нажмите, чтобы выбрать'),
      minusLabel: 'На полтона ниже',
      plusLabel: 'На полтона выше',
      onMinus: t > -11 ? () => c.changeTranspose(-1) : null,
      onPlus: t < 11 ? () => c.changeTranspose(1) : null,
      onValueTap: key == null ? null : () => showKeyPicker(context, c),
      trailing: c.changed
          ? TextButton(
              style: TextButton.styleFrom(foregroundColor: palette.accent, minimumSize: const Size(44, 32), padding: const EdgeInsets.symmetric(horizontal: 8)),
              onPressed: c.resetSong,
              child: const Text('Сбросить', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
            )
          : null,
    );
  }
}

class _ThemePicker extends StatelessWidget {
  const _ThemePicker({required this.controller, required this.palette});
  final ReaderController controller;
  final ReaderPalette palette;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(color: palette.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: palette.border)),
      child: Row(
        children: [
          for (final theme in ReaderTheme.values)
            Expanded(
              child: Semantics(
                button: true,
                selected: controller.settings.theme == theme,
                label: 'Тема: ${theme.label}',
                excludeSemantics: true,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => controller.setTheme(theme),
                  child: Container(
                    height: 44,
                    alignment: Alignment.center,
                    decoration: controller.settings.theme == theme
                        ? BoxDecoration(color: palette.surface, borderRadius: BorderRadius.circular(11), border: Border.all(color: palette.accent.withValues(alpha: 0.5)))
                        : null,
                    child: Text(
                      theme.label,
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                        color: controller.settings.theme == theme ? palette.text : palette.muted,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
