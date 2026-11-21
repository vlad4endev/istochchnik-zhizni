import 'package:material_ui/material_ui.dart';

import '../../../core/church_api.dart';
import '../../../ui/kit/kit.dart';
import '../../../ui/widgets.dart' show LoadingView;
import '../../songbook/logic/song_search.dart' show foldForSearch;
import '../models/schedule_models.dart';

/// Выбор человека на роль. Список приходит с сервера (для роли — только подходящие),
/// «Показать всех» снимает этот фильтр. Лист закрывается после успешного сохранения;
/// при ошибке сети остаётся открытым с понятным сообщением.
Future<void> showPersonPicker(
  BuildContext context, {
  required String title,
  required String subtitle,
  required Future<List<PersonRef>> Function(bool everyone) load,
  required Future<void> Function(PersonRef person) onPick,
  PersonRef? current,
  Future<void> Function()? onClear,
  String clearLabel = 'Снять с роли',
  bool offerEveryone = true,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _PickerSheet(
      title: title,
      subtitle: subtitle,
      load: load,
      onPick: onPick,
      current: current,
      onClear: onClear,
      clearLabel: clearLabel,
      offerEveryone: offerEveryone,
    ),
  );
}

class _PickerSheet extends StatefulWidget {
  const _PickerSheet({
    required this.title,
    required this.subtitle,
    required this.load,
    required this.onPick,
    required this.current,
    required this.onClear,
    required this.clearLabel,
    required this.offerEveryone,
  });

  final String title;
  final String subtitle;
  final Future<List<PersonRef>> Function(bool everyone) load;
  final Future<void> Function(PersonRef person) onPick;
  final PersonRef? current;
  final Future<void> Function()? onClear;
  final String clearLabel;
  final bool offerEveryone;

  @override
  State<_PickerSheet> createState() => _PickerSheetState();
}

class _PickerSheetState extends State<_PickerSheet> {
  bool _loading = true;
  bool _everyone = false;
  bool _saving = false;
  String? _error;
  String _query = '';
  List<PersonRef> _people = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await widget.load(_everyone);
      if (!mounted) return;
      setState(() {
        _people = [...list]..sort((a, b) => a.name.compareTo(b.name));
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

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await action();
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = describeDio(error);
      });
    }
  }

  List<PersonRef> get _filtered {
    final q = foldForSearch(_query).trim();
    if (q.isEmpty) return _people;
    return [for (final p in _people) if (foldForSearch(p.name).contains(q)) p];
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final height = MediaQuery.sizeOf(context).height;
    final shown = _filtered;
    return Container(
      constraints: BoxConstraints(maxHeight: height * 0.9),
      decoration: BoxDecoration(
        color: palette.sheet,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(Radii.sheet)),
      ),
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Material(type: MaterialType.transparency, child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 10),
            Container(width: 40, height: 4, decoration: BoxDecoration(color: palette.outline, borderRadius: BorderRadius.circular(2))),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 8, 4),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(header: true, child: Text(widget.title, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: palette.ink))),
                        Text(widget.subtitle, style: TextStyle(fontSize: 13, color: palette.inkMuted)),
                      ],
                    ),
                  ),
                  IconButton(tooltip: 'Закрыть', onPressed: () => Navigator.pop(context), icon: Icon(Icons.close_rounded, color: palette.inkMuted)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: TextField(
                onChanged: (v) => setState(() => _query = v),
                enableSuggestions: false,
                textInputAction: TextInputAction.search,
                style: TextStyle(fontSize: 15.5, color: palette.ink),
                decoration: InputDecoration(
                  hintText: 'Найти по имени',
                  prefixIcon: Icon(Icons.search_rounded, color: palette.inkMuted),
                  contentPadding: const EdgeInsets.symmetric(vertical: 12),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.lg), borderSide: BorderSide(color: palette.hairline)),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.lg), borderSide: BorderSide(color: palette.hairline)),
                ),
              ),
            ),
            if (_error != null)
              Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 8), child: InfoBanner(_error!, error: true)),
            if (widget.onClear != null && widget.current != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 0, 10, 4),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    style: TextButton.styleFrom(minimumSize: const Size(48, 48), foregroundColor: ChurchColors.danger),
                    onPressed: _saving ? null : () => _run(widget.onClear!),
                    icon: const Icon(Icons.person_remove_outlined, size: 20),
                    label: Text('${widget.clearLabel}: ${widget.current!.name}', style: const TextStyle(fontWeight: FontWeight.w700)),
                  ),
                ),
              ),
            Flexible(
              child: _loading
                  ? const Padding(padding: EdgeInsets.all(40), child: LoadingView())
                  : shown.isEmpty
                      ? Padding(
                          padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
                          child: Text(
                            _people.isEmpty ? 'Подходящих людей нет.' : 'Никого не нашли по запросу.',
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 14.5, color: palette.inkMuted),
                          ),
                        )
                      : ListView.builder(
                          shrinkWrap: true,
                          padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                          itemCount: shown.length,
                          itemBuilder: (context, i) {
                            final p = shown[i];
                            final selected = p.id == widget.current?.id;
                            return Semantics(
                              button: true,
                              selected: selected,
                              label: p.name,
                              excludeSemantics: true,
                              child: InkWell(
                                borderRadius: BorderRadius.circular(Radii.md),
                                onTap: _saving ? null : () => _run(() => widget.onPick(p)),
                                child: ConstrainedBox(
                                  constraints: const BoxConstraints(minHeight: 60),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                    child: Row(
                                      children: [
                                        ChurchAvatar(name: p.name, imageUrl: p.avatarUrl, size: 42),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: palette.ink)),
                                              if (p.ministryRole.trim().isNotEmpty)
                                                Text(p.ministryRole, maxLines: 1, overflow: TextOverflow.ellipsis, style: ChurchType.caption.copyWith(color: palette.inkMuted)),
                                            ],
                                          ),
                                        ),
                                        if (selected) Icon(Icons.check_circle_rounded, color: palette.accent),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
            ),
            if (widget.offerEveryone)
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 0, 10, 8),
                child: TextButton(
                  style: TextButton.styleFrom(minimumSize: const Size(48, 48), foregroundColor: palette.accent),
                  onPressed: _saving
                      ? null
                      : () {
                          _everyone = !_everyone;
                          _load();
                        },
                  child: Text(_everyone ? 'Показать только подходящих' : 'Показать всех', style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
          ],
        ),
      )),
    );
  }
}
