import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/church_api.dart';
import '../../core/dates.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';

class BroadcastPage extends StatefulWidget {
  const BroadcastPage({super.key});

  @override
  State<BroadcastPage> createState() => _BroadcastPageState();
}

class _BroadcastPageState extends State<BroadcastPage> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _active = {};
  List<dynamic> _history = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = ChurchApi(context.read<SessionController>());
    try {
      final active = await api.broadcast();
      Object? history;
      try {
        history = await api.broadcastHistory();
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _active = asMap(active['broadcast']);
        _history = history is List ? history : asList(asMap(history)['broadcasts']);
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = describeDio(error);
      });
    }
  }

  Future<void> _open(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null || url.isEmpty) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final live = _active.isNotEmpty && str(_active['status']) == 'live';
    return ChurchPage(
      title: 'Трансляция',
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: SheetList(
          onRefresh: _load,
          children: [
            if (_active.isEmpty)
              ChurchCard(
                child: Row(
                  children: [
                    const IconTile(Icons.videocam_off_outlined, tone: Tone.neutral, size: 48),
                    const SizedBox(width: Space.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Сейчас эфира нет', style: ChurchType.title.copyWith(color: palette.ink)),
                          Text('Когда служение начнётся, трансляция появится здесь.', style: ChurchType.caption.copyWith(color: palette.inkMuted)),
                        ],
                      ),
                    ),
                  ],
                ),
              )
            else ...[
              Semantics(
                button: true,
                label: 'Открыть трансляцию',
                child: GestureDetector(
                  onTap: () => _open(str(_active['stream_url'])),
                  child: AspectRatio(
                    aspectRatio: 16 / 10,
                    child: Container(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(Radii.card),
                        gradient: const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [Color(0xFF8A2742), Color(0xFF2A0B15)],
                        ),
                        boxShadow: palette.cardShadow,
                      ),
                      child: Stack(
                        children: [
                          if (live)
                            Positioned(
                              left: 14,
                              top: 14,
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                decoration: BoxDecoration(color: ChurchColors.danger, borderRadius: BorderRadius.circular(99)),
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.circle, size: 7, color: Colors.white),
                                    SizedBox(width: 5),
                                    Text('В ЭФИРЕ', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: Colors.white)),
                                  ],
                                ),
                              ),
                            ),
                          Center(
                            child: Container(
                              width: 64,
                              height: 64,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: Colors.white.withValues(alpha: 0.18),
                                border: Border.all(color: Colors.white.withValues(alpha: 0.35)),
                              ),
                              child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 38),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    str(_active['title']).isEmpty ? 'Трансляция' : str(_active['title']),
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: palette.ink),
                  ),
                  if (str(_active['description']).isNotEmpty)
                    Text(str(_active['description']), style: ChurchType.caption.copyWith(color: palette.inkMuted, fontSize: 13.5)),
                ],
              ),
              PrimaryButton(
                label: live ? 'Смотреть эфир' : 'Открыть трансляцию',
                icon: Icons.open_in_new_rounded,
                height: 50,
                onPressed: str(_active['stream_url']).isEmpty ? null : () => _open(str(_active['stream_url'])),
              ),
            ],
            if (_history.isNotEmpty) ...[
              const SectionLabel('Записи эфиров'),
              ListGroup(
                children: [
                  for (final raw in _history)
                    Builder(builder: (context) {
                      final item = asMap(raw);
                      final when = parseApiDate(item['starts_at']);
                      return ListRow(
                        leading: const IconTile(Icons.videocam_outlined, tone: Tone.red),
                        title: str(item['title']).isEmpty ? 'Эфир' : str(item['title']),
                        subtitle: when == null ? str(item['starts_at']) : longDate(when),
                        onTap: () => _open(str(item['stream_url'])),
                      );
                    }),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
