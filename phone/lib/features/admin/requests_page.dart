import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/cache_watch.dart';
import '../../core/church_api.dart';
import '../../core/dates.dart';
import '../../core/json.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';

class RequestsPage extends StatefulWidget {
  const RequestsPage({super.key});

  @override
  State<RequestsPage> createState() => _RequestsPageState();
}

class _RequestsPageState extends State<RequestsPage> with CacheWatcher<RequestsPage> {
  bool _loading = true;
  String? _error;
  List<dynamic> _items = const [];
  String _filter = 'all';
  final Set<int> _busy = {};

  @override
  void initState() {
    super.initState();
    _load();
    watchCache(const ['/api/auth/access-requests'], () => _load(quiet: true));
  }

  Future<void> _load({bool quiet = false}) async {
    if (!quiet) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final items = await ChurchApi(context.read<SessionController>()).accessRequests();
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } catch (error) {
      if (!mounted || quiet) return;
      setState(() {
        _loading = false;
        _error = describeDio(error);
      });
    }
  }

  Future<void> _review(int id, {required bool approve}) async {
    if (_busy.contains(id)) return;
    setState(() => _busy.add(id));
    try {
      await ChurchApi(context.read<SessionController>()).reviewRequest(id, approve: approve);
      await _load();
    } catch (error) {
      if (!mounted) return;
      showMessage(context, describeDio(error));
    } finally {
      if (mounted) setState(() => _busy.remove(id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final visible = _items.map(asMap).where((item) {
      if (_filter == 'all') return true;
      final reset = str(item['request_type']) == 'password_reset';
      return _filter == 'reset' ? reset : !reset;
    }).toList();
    return ChurchPage(
      title: 'Заявки',
      subtitle: _items.isEmpty ? 'Новых нет' : '${_items.length} ожидают',
      body: AsyncBody(
        loading: _loading,
        error: _error,
        onRetry: _load,
        child: SheetList(
          onRefresh: _load,
          children: [
            SegmentedPills<String>(
              segments: const [('all', 'Все'), ('registration', 'Регистрация'), ('reset', 'Сброс пароля')],
              selected: _filter,
              onChanged: (value) => setState(() => _filter = value),
            ),
            if (visible.isEmpty)
              const EmptyHint('Новых заявок нет', icon: Icons.how_to_reg_outlined)
            else
              for (final item in visible)
                Builder(builder: (context) {
                  final id = asInt(item['id']);
                  final name = '${str(item['first_name'])} ${str(item['last_name'])}'.trim();
                  final reset = str(item['request_type']) == 'password_reset';
                  final when = relativeTime(item['created_at']);
                  final busy = _busy.contains(id);
                  return ChurchCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            ChurchAvatar(name: name.isEmpty ? '?' : name),
                            const SizedBox(width: Space.md),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(name.isEmpty ? 'Без имени' : name, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: palette.ink)),
                                  Text(
                                    [str(item['phone_number']), when].where((part) => part.isNotEmpty).join(' · '),
                                    style: ChurchType.caption.copyWith(color: palette.inkMuted),
                                  ),
                                ],
                              ),
                            ),
                            StatusPill(reset ? 'Сброс пароля' : 'Регистрация'),
                          ],
                        ),
                        if (str(item['review_note']).isNotEmpty) ...[
                          const SizedBox(height: 10),
                          InfoBanner(str(item['review_note'])),
                        ],
                        const SizedBox(height: Space.md),
                        Row(
                          children: [
                            Expanded(
                              child: PrimaryButton(
                                label: 'Одобрить',
                                icon: Icons.check_rounded,
                                height: 48,
                                busy: busy,
                                onPressed: () => _review(id, approve: true),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: SecondaryButton(
                                label: 'Отклонить',
                                height: 48,
                                onPressed: busy ? null : () => _review(id, approve: false),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                }),
          ],
        ),
      ),
    );
  }
}
