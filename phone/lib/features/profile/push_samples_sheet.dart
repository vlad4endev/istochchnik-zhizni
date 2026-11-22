import 'package:dio/dio.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/push.dart';
import '../../ui/kit/kit.dart';
import '../prayer/widgets/sheet_frame.dart';

/// Пример напоминания, который сервер может отправить на устройство.
class PushSample {
  const PushSample({required this.id, required this.label});
  final String id;
  final String label;
}

/// Источник примеров и отправка выбранного — отдельно от экрана, чтобы проверять без сети.
abstract class PushSamplesSource {
  Future<List<PushSample>> load();
  Future<void> send(String id);
}

class ServerPushSamples implements PushSamplesSource {
  const ServerPushSamples();

  Dio get _dio => PushService.instance.session!.dio;

  @override
  Future<List<PushSample>> load() async {
    final data = (await _dio.get<Object?>('/api/notifications/samples')).data;
    final list = data is Map ? data['samples'] : null;
    if (list is! List) return const [];
    return [
      for (final e in list)
        if (e is Map && e['id'] is String) PushSample(id: e['id'] as String, label: '${e['label'] ?? e['id']}'),
    ];
  }

  @override
  Future<void> send(String id) async {
    await _dio.post<Object?>('/api/notifications/test-sample', data: {'id': id});
  }
}

/// «Примеры напоминаний»: шлёт себе молитву, день рождения, трансляцию и т. д. —
/// чтобы убедиться, что уведомление пришло и по нажатию открывает нужный раздел.
Future<void> showPushSamples(BuildContext context, {PushSamplesSource source = const ServerPushSamples()}) {
  return showPrayerSheet<void>(
    context,
    title: 'Примеры напоминаний',
    subtitle: 'Придут на это устройство. Нажмите на уведомление — откроется нужный раздел',
    builder: (_) => PushSamplesView(source: source),
  );
}

class PushSamplesView extends StatefulWidget {
  const PushSamplesView({super.key, required this.source});
  final PushSamplesSource source;

  @override
  State<PushSamplesView> createState() => _PushSamplesViewState();
}

class _PushSamplesViewState extends State<PushSamplesView> {
  List<PushSample>? _samples;
  String? _loadError;
  String? _sending;
  String? _sentId;
  String? _sendError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _samples = null;
      _loadError = null;
    });
    try {
      final list = await widget.source.load();
      if (mounted) setState(() => _samples = list);
    } catch (_) {
      if (mounted) setState(() => _loadError = 'Не удалось загрузить список — проверьте соединение и попробуйте снова');
    }
  }

  Future<void> _send(PushSample s) async {
    if (_sending != null) return;
    setState(() {
      _sending = s.id;
      _sendError = null;
      _sentId = null;
    });
    try {
      await widget.source.send(s.id);
      if (mounted) setState(() => _sentId = s.id);
    } catch (_) {
      if (mounted) setState(() => _sendError = 'Не удалось отправить — подождите несколько секунд и попробуйте снова');
    } finally {
      if (mounted) setState(() => _sending = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final samples = _samples;
    if (_loadError != null) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
        InfoBanner(_loadError!, error: true),
        const SizedBox(height: 10),
        SecondaryButton(key: const ValueKey('samples-retry'), label: 'Повторить', icon: Icons.refresh_rounded, onPressed: _load),
      ]);
    }
    if (samples == null) {
      return const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Center(child: SizedBox(width: 26, height: 26, child: CircularProgressIndicator(strokeWidth: 2.6))));
    }
    if (samples.isEmpty) return const InfoBanner('Примеров пока нет.');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (_sendError != null) Padding(padding: const EdgeInsets.only(bottom: 10), child: InfoBanner(_sendError!, error: true)),
        if (_sentId != null) const Padding(padding: EdgeInsets.only(bottom: 10), child: InfoBanner('Отправлено. Уведомление придёт в течение 10–20 секунд.')),
        for (final s in samples)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: SecondaryButton(
              key: ValueKey('sample-${s.id}'),
              label: _sending == s.id ? 'Отправляем…' : s.label,
              icon: _sentId == s.id ? Icons.check_circle_rounded : Icons.notifications_none_rounded,
              onPressed: _sending == null ? () => _send(s) : null,
            ),
          ),
        Text('Эти уведомления тестовые: ничего не меняют и приходят только вам.', style: TextStyle(fontSize: 12.5, color: palette.inkMuted)),
      ],
    );
  }
}
