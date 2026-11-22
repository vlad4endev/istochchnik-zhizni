import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../../../core/dates.dart';
import '../../../ui/kit/kit.dart';
import '../../../ui/widgets.dart';
import '../data/chat_source.dart';
import '../logic/chat_logic.dart';
import '../models/chat_models.dart';

/// Поиск по сообщениям одного чата. Возвращает найденное сообщение — чат прокрутится к нему.
class ChatSearchPage extends StatefulWidget {
  const ChatSearchPage({super.key, required this.source, required this.conversationId, this.debounce = const Duration(milliseconds: 350)});

  final ChatSource source;
  final String conversationId;
  final Duration debounce;

  @override
  State<ChatSearchPage> createState() => _ChatSearchPageState();
}

class _ChatSearchPageState extends State<ChatSearchPage> {
  final _query = TextEditingController();
  Timer? _timer;
  List<SearchHit>? _hits;
  bool _loading = false;
  bool _failed = false;
  int _seq = 0;

  @override
  void dispose() {
    _timer?.cancel();
    _query.dispose();
    super.dispose();
  }

  void _changed(String text) {
    _timer?.cancel();
    final q = text.trim();
    if (q.length < 2) {
      setState(() {
        _hits = null;
        _loading = false;
        _failed = false;
      });
      return;
    }
    _timer = Timer(widget.debounce, () => _run(q));
  }

  Future<void> _run(String q) async {
    final seq = ++_seq;
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final hits = await widget.source.search(widget.conversationId, q);
      if (!mounted || seq != _seq) return;
      setState(() {
        _hits = hits;
        _loading = false;
      });
    } catch (_) {
      if (!mounted || seq != _seq) return;
      setState(() {
        _loading = false;
        _failed = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final q = _query.text.trim();
    Widget body;
    if (_failed) {
      body = const EmptyHint('Не удалось выполнить поиск', icon: Icons.cloud_off_rounded, hint: 'Проверьте интернет и попробуйте снова.');
    } else if (_hits == null) {
      body = _loading ? const Center(child: CircularProgressIndicator()) : const EmptyHint('Поиск по чату', icon: Icons.search_rounded, hint: 'Введите хотя бы две буквы.');
    } else if (_hits!.isEmpty) {
      body = const EmptyHint('Ничего не найдено', icon: Icons.search_off_rounded);
    } else {
      body = ListView.separated(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: _hits!.length,
        separatorBuilder: (_, _) => Divider(height: 1, color: palette.outline.withValues(alpha: 0.4)),
        itemBuilder: (context, i) => SearchHitTile(hit: _hits![i], query: q, onTap: () => Navigator.pop(context, _hits![i].message.id)),
      );
    }
    return Scaffold(
      backgroundColor: palette.sheet,
      appBar: AppBar(
        backgroundColor: palette.sheet,
        elevation: 0,
        title: TextField(
          key: const ValueKey('chat-search-field'),
          controller: _query,
          autofocus: true,
          onChanged: _changed,
          textInputAction: TextInputAction.search,
          style: TextStyle(fontSize: 16, color: palette.ink),
          decoration: InputDecoration(hintText: 'Поиск по сообщениям', border: InputBorder.none, hintStyle: TextStyle(color: palette.inkFaint)),
        ),
        actions: [
          if (_query.text.isNotEmpty)
            IconButton(
              tooltip: 'Очистить',
              icon: const Icon(Icons.close_rounded),
              onPressed: () {
                _query.clear();
                _changed('');
              },
            ),
        ],
      ),
      body: body,
    );
  }
}

/// Строка результата: кто, когда и фрагмент текста с выделенным найденным словом.
class SearchHitTile extends StatelessWidget {
  const SearchHitTile({super.key, required this.hit, required this.query, required this.onTap});

  final SearchHit hit;
  final String query;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final m = hit.message;
    final text = messageSummary(m);
    final when = m.createdAt == null ? '' : chatStamp(m.createdAt!.toIso8601String());
    final title = hit.conversationTitle.isNotEmpty ? hit.conversationTitle : (m.senderName.isEmpty ? 'Сообщение' : m.senderName);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w800, color: palette.ink))),
                Text(when, style: TextStyle(fontSize: 12, color: palette.inkFaint)),
              ],
            ),
            if (hit.conversationTitle.isNotEmpty && m.senderName.isNotEmpty) Text(m.senderName, style: TextStyle(fontSize: 12.5, color: palette.accent)),
            const SizedBox(height: 2),
            Text.rich(highlightMatches(text, query, TextStyle(fontSize: 14, height: 1.3, color: palette.inkMuted), TextStyle(fontSize: 14, height: 1.3, fontWeight: FontWeight.w800, color: palette.accent)), maxLines: 3, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }
}

/// Текст с выделенными вхождениями [query] (без учёта регистра).
TextSpan highlightMatches(String text, String query, TextStyle base, TextStyle match) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return TextSpan(text: text, style: base);
  final lower = text.toLowerCase();
  final spans = <TextSpan>[];
  var from = 0;
  while (true) {
    final at = lower.indexOf(q, from);
    if (at < 0) break;
    if (at > from) spans.add(TextSpan(text: text.substring(from, at), style: base));
    spans.add(TextSpan(text: text.substring(at, at + q.length), style: match));
    from = at + q.length;
  }
  if (from < text.length) spans.add(TextSpan(text: text.substring(from), style: base));
  return TextSpan(children: spans.isEmpty ? [TextSpan(text: text, style: base)] : spans);
}
