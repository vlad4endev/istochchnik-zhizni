import 'package:material_ui/material_ui.dart';

import '../../songbook/widgets/reader_palette.dart';
import '../../songbook/widgets/reader_settings_sheet.dart' show ReaderSwitch;
import '../bible_reader_controller.dart';
import '../bible_store.dart';
import '../models/bible_models.dart';
import 'bible_palette.dart';

Widget _handle(ReaderPalette p) => Center(
      child: Container(width: 40, height: 4, decoration: BoxDecoration(color: p.secondary.withValues(alpha: 0.35), borderRadius: BorderRadius.circular(2))),
    );

Widget _sheetShell(BuildContext context, ReaderPalette p, {required String title, required List<Widget> children}) {
  final height = MediaQuery.sizeOf(context).height;
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
        padding: EdgeInsets.fromLTRB(16, 10, 16, 20 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _handle(p),
            Padding(
              padding: const EdgeInsets.fromLTRB(2, 12, 0, 10),
              child: Row(
                children: [
                  Expanded(child: Semantics(header: true, child: Text(title, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: p.text)))),
                  IconButton(tooltip: 'Закрыть', onPressed: () => Navigator.pop(context), icon: Icon(Icons.close_rounded, color: p.muted)),
                ],
              ),
            ),
            ...children,
          ],
        ),
      ),
    ),
  );
}

Future<T?> _showSheet<T>(BuildContext context, WidgetBuilder builder) => showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.6),
      builder: builder,
    );

class _Block extends StatelessWidget {
  const _Block({required this.palette, required this.child});
  final ReaderPalette palette;
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(color: palette.card, borderRadius: BorderRadius.circular(18), border: Border.all(color: palette.border)),
        child: child,
      );
}

Widget _label(String text, ReaderPalette p) =>
    Text(text, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1.15, color: p.muted));

// ——— настройки чтения ———

Future<void> showBibleSettings(BuildContext context, BibleReaderController controller) => _showSheet<void>(
      context,
      (_) => ListenableBuilder(listenable: controller, builder: (context, _) => _SettingsSheet(controller: controller)),
    );

class _SettingsSheet extends StatelessWidget {
  const _SettingsSheet({required this.controller});
  final BibleReaderController controller;

  @override
  Widget build(BuildContext context) {
    final s = controller.settings;
    final p = biblePaletteFor(s.theme, Theme.of(context).brightness);
    return _sheetShell(context, p, title: 'Настройки чтения', children: [
      _Block(
        palette: p,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              _label('РАЗМЕР ШРИФТА', p),
              const Spacer(),
              Text('${s.fontSize.round()} pt', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: p.accent)),
            ]),
            SliderTheme(
              data: SliderTheme.of(context).copyWith(
                trackHeight: 6,
                activeTrackColor: p.accent,
                inactiveTrackColor: p.track,
                thumbColor: p.isDark ? p.text : p.accent,
                overlayColor: p.accent.withValues(alpha: 0.18),
                thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 11),
                tickMarkShape: SliderTickMarkShape.noTickMark,
              ),
              child: Slider(
                value: s.fontSize,
                min: BibleSettings.minFont,
                max: BibleSettings.maxFont,
                divisions: (BibleSettings.maxFont - BibleSettings.minFont).round(),
                label: '${s.fontSize.round()}',
                semanticFormatterCallback: (v) => '${v.round()} пунктов',
                onChanged: (v) => controller.updateSettings(s.copyWith(fontSize: v)),
              ),
            ),
          ],
        ),
      ),
      _Block(
        palette: p,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _label('ТЕМА ЭКРАНА', p),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final t in BibleTheme.values)
                  _ThemeChip(label: t.label, selected: s.theme == t, palette: p, onTap: () => controller.updateSettings(s.copyWith(theme: t))),
              ],
            ),
          ],
        ),
      ),
      _Block(
        palette: p,
        child: Column(
          children: [
            _SwitchRow(
              palette: p,
              icon: Icons.format_list_numbered_rounded,
              title: 'Номера стихов',
              value: s.showNumbers,
              onChanged: (v) => controller.updateSettings(s.copyWith(showNumbers: v)),
            ),
            Divider(height: 12, color: p.border),
            _SwitchRow(
              palette: p,
              icon: Icons.segment_rounded,
              title: 'Каждый стих с новой строки',
              subtitle: 'Удобно для изучения и чтения вслух',
              value: s.verseLines,
              onChanged: (v) => controller.updateSettings(s.copyWith(verseLines: v)),
            ),
          ],
        ),
      ),
    ]);
  }
}

class _ThemeChip extends StatelessWidget {
  const _ThemeChip({required this.label, required this.selected, required this.palette, required this.onTap});
  final String label;
  final bool selected;
  final ReaderPalette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        selected: selected,
        label: label,
        excludeSemantics: true,
        child: Material(
          color: selected ? palette.accent : palette.surface,
          borderRadius: BorderRadius.circular(14),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Container(
              constraints: const BoxConstraints(minHeight: 46),
              padding: const EdgeInsets.symmetric(horizontal: 14),
              alignment: Alignment.center,
              decoration: selected ? null : BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: palette.border)),
              child: Text(label, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: selected ? palette.onAccent : palette.text)),
            ),
          ),
        ),
      );
}

class _SwitchRow extends StatelessWidget {
  const _SwitchRow({required this.palette, required this.icon, required this.title, required this.value, required this.onChanged, this.subtitle});
  final ReaderPalette palette;
  final IconData icon;
  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Icon(icon, color: palette.muted, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: palette.text)),
                if (subtitle != null) Text(subtitle!, style: TextStyle(fontSize: 12.5, height: 1.35, color: palette.muted)),
              ],
            ),
          ),
          ReaderSwitch(value: value, onChanged: onChanged, palette: palette, label: title),
        ],
      );
}

// ——— заметка ———

/// Редактор заметки. Лист закрывается только после успешного сохранения:
/// при ошибке сети написанный текст остаётся, и можно нажать «Сохранить» ещё раз.
Future<void> showNoteEditor(
  BuildContext context, {
  required ReaderPalette palette,
  required String reference,
  required Future<void> Function(String body) onSave,
  String? quote,
  BibleNote? existing,
  Future<void> Function()? onDelete,
}) =>
    _showSheet<void>(
      context,
      (_) => _NoteSheet(palette: palette, reference: reference, quote: quote, existing: existing, onSave: onSave, onDelete: onDelete),
    );

class _NoteSheet extends StatefulWidget {
  const _NoteSheet({required this.palette, required this.reference, required this.onSave, this.quote, this.existing, this.onDelete});
  final ReaderPalette palette;
  final String reference;
  final String? quote;
  final BibleNote? existing;
  final Future<void> Function(String body) onSave;
  final Future<void> Function()? onDelete;

  @override
  State<_NoteSheet> createState() => _NoteSheetState();
}

class _NoteSheetState extends State<_NoteSheet> {
  late final TextEditingController _text = TextEditingController(text: widget.existing?.body ?? '');
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  bool get _canSave => !_busy && _text.text.trim().isNotEmpty;

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      if (mounted) Navigator.pop(context);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Не удалось сохранить — проверьте интернет и попробуйте снова. Текст не потерян.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.palette;
    final onDelete = widget.onDelete;
    return _sheetShell(context, p, title: widget.existing == null ? 'Новая заметка' : 'Заметка', children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(2, 0, 2, 10),
        child: Text(widget.reference, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: p.accent)),
      ),
      if (widget.quote != null && widget.quote!.isNotEmpty)
        Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          decoration: BoxDecoration(border: Border(left: BorderSide(color: p.accent, width: 3))),
          child: Text(widget.quote!, maxLines: 4, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, height: 1.45, color: p.secondary)),
        ),
      TextField(
        controller: _text,
        autofocus: true,
        minLines: 4,
        maxLines: 8,
        maxLength: 4000,
        textCapitalization: TextCapitalization.sentences,
        onChanged: (_) => setState(() {}),
        style: TextStyle(fontSize: 16, height: 1.45, color: p.text),
        cursorColor: p.accent,
        decoration: InputDecoration(
          hintText: 'Мысль, вопрос или молитва по этому месту',
          hintStyle: TextStyle(color: p.muted),
          filled: true,
          fillColor: p.card,
          counterStyle: TextStyle(color: p.muted),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: p.border)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: p.border)),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: p.accent, width: 1.6)),
        ),
      ),
      if (_error != null)
        Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 4),
          child: Semantics(
            liveRegion: true,
            child: Text(_error!, style: const TextStyle(fontSize: 13.5, height: 1.4, color: Color(0xFFE5677F))),
          ),
        ),
      const SizedBox(height: 8),
      Row(
        children: [
          if (onDelete != null) ...[
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _busy ? null : () => _run(onDelete),
                icon: const Icon(Icons.delete_outline_rounded),
                label: const Text('Удалить'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(0, 50),
                  foregroundColor: const Color(0xFFE5677F),
                  side: BorderSide(color: p.border),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
              ),
            ),
            const SizedBox(width: 10),
          ],
          Expanded(
            flex: 2,
            child: FilledButton(
              onPressed: _canSave ? () => _run(() => widget.onSave(_text.text.trim())) : null,
              style: FilledButton.styleFrom(
                minimumSize: const Size(0, 50),
                backgroundColor: p.accent,
                foregroundColor: p.onAccent,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              child: _busy
                  ? SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4, color: p.onAccent))
                  : const Text('Сохранить', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5)),
            ),
          ),
        ],
      ),
    ]);
  }
}

// ——— перевод ———

Future<BibleTranslation?> showTranslationPicker(
  BuildContext context, {
  required List<BibleTranslation> translations,
  required String current,
  required ReaderPalette palette,
}) =>
    _showSheet<BibleTranslation>(context, (context) {
      final p = palette;
      return _sheetShell(context, p, title: 'Перевод', children: [
        for (final t in translations)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _TranslationTile(translation: t, selected: t.code == current, palette: p, onTap: t.hasText ? () => Navigator.pop(context, t) : null),
          ),
      ]);
    });

class _TranslationTile extends StatelessWidget {
  const _TranslationTile({required this.translation, required this.selected, required this.palette, required this.onTap});
  final BibleTranslation translation;
  final bool selected;
  final ReaderPalette palette;
  final VoidCallback? onTap;

  String get _note {
    if (translation.licenseRequired) return 'Нужна лицензия — пока недоступен';
    if (translation.verseCount == 0) return 'Текст ещё не загружен на сервер';
    return [
      if (translation.year != null) translation.year!,
      if (translation.newTestamentOnly) 'только Новый Завет',
      if (translation.description.isNotEmpty) translation.description,
    ].join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final p = palette;
    final enabled = onTap != null;
    return Semantics(
      button: true,
      enabled: enabled,
      selected: selected,
      label: '${translation.title}. $_note',
      excludeSemantics: true,
      child: Opacity(
        opacity: enabled ? 1 : 0.5,
        child: Material(
          color: p.card,
          borderRadius: BorderRadius.circular(18),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Container(
              constraints: const BoxConstraints(minHeight: 64),
              padding: const EdgeInsets.fromLTRB(14, 10, 12, 10),
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), border: Border.all(color: selected ? p.accent : p.border, width: selected ? 1.6 : 1)),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(translation.title, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: p.text)),
                        if (_note.isNotEmpty) Text(_note, maxLines: 3, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, height: 1.35, color: p.muted)),
                      ],
                    ),
                  ),
                  if (selected) Icon(Icons.check_circle_rounded, color: p.accent),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
