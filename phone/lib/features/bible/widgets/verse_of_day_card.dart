import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/share_text.dart';
import '../../../ui/kit/kit.dart';
import '../data/bible_repository.dart';
import '../logic/verse_of_day.dart';
import '../models/bible_models.dart';

/// «Стих дня» на главной Библии: один и тот же у всех в один день, как на сайте.
/// Нажатие открывает стих в главе, кнопка отправляет его. Если текст не загрузился — карточки просто нет.
class VerseOfDayCard extends StatefulWidget {
  const VerseOfDayCard({
    super.key,
    required this.source,
    required this.translation,
    required this.books,
    required this.onOpen,
    this.today,
  });

  final BibleSource source;
  final BibleTranslation translation;
  final List<BibleBook> books;
  final void Function(String bookSlug, int chapter, int verse) onOpen;

  /// Для тестов: какой сегодня день.
  final DateTime? today;

  @override
  State<VerseOfDayCard> createState() => _VerseOfDayCardState();
}

class _VerseOfDayCardState extends State<VerseOfDayCard> {
  late final VerseRef _ref = pickVerseOfDay(widget.today ?? DateTime.now());
  Future<ChapterText>? _chapter;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(VerseOfDayCard old) {
    super.didUpdateWidget(old);
    if (old.translation.code != widget.translation.code) _load();
  }

  void _load() {
    final has = widget.books.any((b) => b.slug == _ref.book);
    _chapter = has ? widget.source.chapter(widget.translation.code, _ref.book, _ref.chapter) : null;
  }

  String _label(String shortName) => '$shortName ${_ref.chapter}:${_ref.verse}${_ref.last > _ref.verse ? '–${_ref.last}' : ''}';

  @override
  Widget build(BuildContext context) {
    final future = _chapter;
    if (future == null) return const SizedBox.shrink();
    return FutureBuilder<ChapterText>(
      future: future,
      builder: (context, snapshot) {
        final data = snapshot.data;
        if (data == null) return const SizedBox.shrink();
        final text = data.verses.where((v) => v.number >= _ref.verse && v.number <= _ref.last).map((v) => v.text).join(' ').trim();
        if (text.isEmpty) return const SizedBox.shrink();
        final book = widget.books.firstWhere((b) => b.slug == _ref.book);
        final label = _label(book.shortName);
        final quote = '«$text» — $label (${widget.translation.shortTitle})';
        return Semantics(
          container: true,
          label: 'Стих дня. $label. $text',
          child: Material(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(Radii.card),
            clipBehavior: Clip.antiAlias,
            child: Ink(
              decoration: BoxDecoration(gradient: wineGradient, borderRadius: BorderRadius.circular(Radii.card)),
              child: InkWell(
                onTap: () => widget.onOpen(_ref.book, _ref.chapter, _ref.verse),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(18, 14, 8, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.auto_awesome_rounded, size: 15, color: Color(0xB8FFFFFF)),
                          const SizedBox(width: 6),
                          const Expanded(child: Text('СТИХ ДНЯ', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1.15, color: Color(0xB8FFFFFF)))),
                          IconButton(
                            tooltip: 'Поделиться стихом дня',
                            constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                            onPressed: () async {
                              if (await shareText(quote, title: 'Стих дня — $label')) return;
                              await Clipboard.setData(ClipboardData(text: quote));
                              if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Стих скопирован')));
                            },
                            icon: const Icon(Icons.ios_share_rounded, size: 20, color: Color(0xCCFFFFFF)),
                          ),
                        ],
                      ),
                      Padding(
                        padding: const EdgeInsets.only(right: 10),
                        child: Text(text, style: ChurchType.serifTitle.copyWith(fontSize: 19, height: 1.45, color: Colors.white, fontWeight: FontWeight.w500)),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(child: Text(label, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: Colors.white))),
                          Text('${book.name} ${_ref.chapter}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Color(0xB3FFFFFF))),
                          const Icon(Icons.chevron_right_rounded, size: 18, color: Color(0xB3FFFFFF)),
                          const SizedBox(width: 8),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
