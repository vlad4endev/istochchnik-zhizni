import 'dart:io';

import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../../ui/widgets.dart';
import 'data/attachment_picker.dart';

/// Итог одной проверки выбора вложения: что вернулось и за сколько.
class PickProbe {
  const PickProbe({required this.name, required this.outcome, required this.elapsed});
  final String name;
  final String outcome;
  final Duration elapsed;

  String get line => '$name — $outcome (${elapsed.inMilliseconds} мс)';
}

/// Запускает [call], не роняя экран, и описывает результат словами.
Future<PickProbe> probePicker(String name, Future<Object?> Function() call) async {
  final watch = Stopwatch()..start();
  String outcome;
  try {
    final result = await call();
    final count = result is List ? result.length : (result == null ? 0 : 1);
    outcome = count > 0 ? 'выбрано файлов: $count' : 'окно закрылось, ничего не выбрано';
  } on PickerException catch (e) {
    outcome = 'ошибка: ${e.message}';
  } catch (e) {
    outcome = 'сбой: ${e.runtimeType}: $e';
  }
  return PickProbe(name: name, outcome: outcome, elapsed: watch.elapsed);
}

/// Самопроверка вложений: человек нажимает кнопку, приложение пробует способ выбора и показывает итог.
/// Нужна, когда окно выбора на конкретном телефоне не открывается, а причину иначе не увидеть.
class AttachmentDiagnosticsPage extends StatefulWidget {
  const AttachmentDiagnosticsPage({super.key, this.picker});
  final AttachmentPicker? picker;

  @override
  State<AttachmentDiagnosticsPage> createState() => _AttachmentDiagnosticsPageState();
}

class _AttachmentDiagnosticsPageState extends State<AttachmentDiagnosticsPage> {
  late final AttachmentPicker _picker = widget.picker ?? DeviceAttachmentPicker();
  final List<PickProbe> _log = [];
  bool _busy = false;

  Future<void> _run(String name, Future<Object?> Function() call) async {
    if (_busy) return;
    setState(() => _busy = true);
    final probe = await probePicker(name, call);
    if (!mounted) return;
    setState(() {
      _log.add(probe);
      _busy = false;
    });
  }

  String get _report => [
        'Проверка вложений',
        'Система: ${Platform.operatingSystem} ${Platform.operatingSystemVersion}',
        ..._log.map((p) => p.line),
      ].join('\n');

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Проверка вложений')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Нажимайте кнопки по очереди. В каждом окне выберите файл или закройте его. Ниже появится результат.'),
          const SizedBox(height: 16),
          for (final (key, label, call) in <(String, String, Future<Object?> Function())>[
            ('gallery', 'Фото из галереи', _picker.photos),
            ('video', 'Видео', _picker.video),
            ('camera', 'Снять фото', _picker.camera),
            ('files', 'Файл', _picker.files),
            ('files-image', 'Фото через «Файлы»', () => _picker.viaFiles('image')),
          ])
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: OutlinedButton(
                key: ValueKey('probe-$key'),
                onPressed: _busy ? null : () => _run(label, call),
                child: Text(label),
              ),
            ),
          const SizedBox(height: 16),
          if (_busy) const LinearProgressIndicator(),
          for (final p in _log)
            Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: SelectableText(p.line, key: ValueKey('probe-result-${_log.indexOf(p)}'))),
          if (_log.isNotEmpty)
            TextButton(
              key: const ValueKey('probe-copy'),
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: _report));
                if (context.mounted) showMessage(context, 'Отчёт скопирован');
              },
              child: const Text('Скопировать отчёт'),
            ),
        ],
      ),
    );
  }
}
