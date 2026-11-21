import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../logic/home_logic.dart';
import '../models/home_models.dart';

/// Палитра карточки служения (бумага, вино, золото) — как в макете сайта; для тёмной темы свой набор.
class _Paper {
  const _Paper._(this.dark);

  final bool dark;

  static _Paper of(BuildContext context) => _Paper._(context.palette.isDark);

  Color get paper => dark ? const Color(0xFF2A1C1F) : const Color(0xFFF7F2E7);
  Color get paper2 => dark ? const Color(0xFF362428) : const Color(0xFFEFE8D9);
  Color get wine => dark ? const Color(0xFF6B3142) : const Color(0xFF5E2635);
  Color get wineDeep => dark ? const Color(0xFF4A1F2C) : const Color(0xFF481B27);
  Color get wineInk => const Color(0xFFF8EEE9);
  Color get gold => dark ? const Color(0xFFC4AD6A) : const Color(0xFF8E7237);
  Color get goldSoft => gold.withValues(alpha: dark ? 0.16 : 0.12);
  Color get goldLine => dark ? const Color(0x73C4AD6A) : const Color(0xFFC2B28C);
  Color get ink => dark ? const Color(0xFFF3E8E0) : const Color(0xFF281C1E);
  Color get inkSoft => dark ? const Color(0xFFC9B6B0) : const Color(0xFF6B5E5A);
  Color get line => ink.withValues(alpha: 0.12);
}

const _serif = TextStyle(fontFamily: ChurchType.serif);

/// Карточка «Богослужение»: проповедник, ведущий, тема, стих и «Оценить».
class ServiceCard extends StatelessWidget {
  const ServiceCard({
    super.key,
    required this.data,
    required this.currentMemberId,
    required this.onChat,
    required this.onScripture,
    required this.onRate,
  });

  final ServiceCardData data;
  final int currentMemberId;
  final void Function(ServicePerson person) onChat;
  final VoidCallback onScripture;
  final VoidCallback onRate;

  bool _canChat(ServicePerson p) => p.id > 0 && p.id != currentMemberId;

  @override
  Widget build(BuildContext context) {
    final p = _Paper.of(context);
    return Semantics(
      container: true,
      label: 'Карточка служения',
      child: Container(
        decoration: BoxDecoration(
          color: p.paper,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: p.line),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Band(date: serviceDateLabel(data.startsAt), paper: p),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _PersonRow(
                    person: data.preacher,
                    role: 'Проповедник',
                    detail: 'Проповеди',
                    host: false,
                    paper: p,
                    onChat: _canChat(data.preacher) ? () => onChat(data.preacher) : null,
                  ),
                  if (data.host != null) ...[
                    const SizedBox(height: 16),
                    _PersonRow(
                      person: data.host!,
                      role: 'Ведущий',
                      host: true,
                      paper: p,
                      onChat: _canChat(data.host!) ? () => onChat(data.host!) : null,
                    ),
                  ],
                ],
              ),
            ),
            Container(
              margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              padding: const EdgeInsets.only(top: 16),
              decoration: BoxDecoration(border: Border(top: BorderSide(color: p.line))),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    sermonTitle(data.topic),
                    style: _serif.copyWith(fontSize: 20, fontStyle: FontStyle.italic, fontWeight: FontWeight.w500, height: 1.28, color: p.ink),
                  ),
                  const SizedBox(height: 14),
                  _ScriptureTag(text: data.scripture, paper: p, onTap: onScripture),
                  const SizedBox(height: 10),
                  _SummaryPill(text: sermonSummary(data.preacher.name, data.topic), paper: p),
                  if (data.canRate) ...[
                    const SizedBox(height: 12),
                    SizedBox(
                      height: 44,
                      width: double.infinity,
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: p.wine,
                          foregroundColor: p.wineInk,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        onPressed: onRate,
                        child: const Text('Оценить и оставить комментарий', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Band extends StatelessWidget {
  const _Band({required this.date, required this.paper});
  final String date;
  final _Paper paper;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [const Color(0xFF642938), paper.wine, paper.wineDeep],
          stops: const [0, 0.45, 1],
        ),
      ),
      child: Wrap(
        alignment: WrapAlignment.spaceBetween,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 12,
        runSpacing: 4,
        children: [
          const Text(
            'БОГОСЛУЖЕНИЕ',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1.9, color: Colors.white),
          ),
          Text(
            date,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: const Color(0xFFF8EEE9).withValues(alpha: 0.88),
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

class _PersonRow extends StatelessWidget {
  const _PersonRow({
    required this.person,
    required this.role,
    required this.host,
    required this.paper,
    required this.onChat,
    this.detail,
  });

  final ServicePerson person;
  final String role;
  final String? detail;
  final bool host;
  final _Paper paper;
  final VoidCallback? onChat;

  @override
  Widget build(BuildContext context) {
    final tint = host ? paper.gold : paper.wine;
    return Row(
      children: [
        _Avatar(person: person, host: host, paper: paper),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                role.toUpperCase(),
                style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 1.3, color: host ? paper.gold : paper.inkSoft),
              ),
              const SizedBox(height: 3),
              Text(
                person.name,
                style: _serif.copyWith(fontSize: 18, fontWeight: FontWeight.w500, height: 1.2, color: paper.ink),
              ),
              if (detail != null) ...[
                const SizedBox(height: 3),
                Text(detail!, style: TextStyle(fontSize: 13, height: 1.35, color: paper.inkSoft)),
              ],
            ],
          ),
        ),
        if (onChat != null) ...[
          const SizedBox(width: 8),
          Semantics(
            button: true,
            label: 'Написать ${host ? 'ведущему' : 'проповеднику'}: ${person.name}',
            excludeSemantics: true,
            child: SizedBox(
              width: 44,
              height: 44,
              child: Center(
                child: Material(
                  color: host ? paper.goldSoft : paper.wine.withValues(alpha: 0.12),
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: onChat,
                    child: SizedBox(
                      width: 38,
                      height: 38,
                      child: Icon(Icons.chat_bubble_outline_rounded, size: 18, color: paper.dark && !host ? paper.wineInk : tint),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.person, required this.host, required this.paper});
  final ServicePerson person;
  final bool host;
  final _Paper paper;

  @override
  Widget build(BuildContext context) {
    final initials = Container(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: host ? paper.goldSoft : paper.wine,
        border: host ? Border.all(color: paper.goldLine) : null,
      ),
      alignment: Alignment.center,
      child: Text(
        person.initials,
        style: _serif.copyWith(fontSize: 15, fontWeight: FontWeight.w600, color: host ? paper.gold : paper.wineInk),
      ),
    );
    final url = person.avatarUrl;
    return ExcludeSemantics(
      child: SizedBox(
        width: 46,
        height: 46,
        child: url == null
            ? initials
            : ClipOval(
                child: Image.network(
                  url,
                  fit: BoxFit.cover,
                  width: 46,
                  height: 46,
                  errorBuilder: (_, _, _) => initials,
                  loadingBuilder: (context, child, progress) => progress == null ? child : initials,
                ),
              ),
      ),
    );
  }
}

class _ScriptureTag extends StatelessWidget {
  const _ScriptureTag({required this.text, required this.paper, required this.onTap});
  final String text;
  final _Paper paper;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Открыть в Библии: $text',
      excludeSemantics: true,
      child: Material(
        color: Colors.transparent,
        shape: StadiumBorder(side: BorderSide(color: paper.goldLine)),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.menu_book_outlined, size: 14, color: paper.gold),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      text,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: paper.gold),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SummaryPill extends StatelessWidget {
  const _SummaryPill({required this.text, required this.paper});
  final String text;
  final _Paper paper;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
      decoration: BoxDecoration(color: paper.paper2, borderRadius: BorderRadius.circular(99)),
      child: Text(
        text,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, height: 1.35, color: paper.inkSoft),
      ),
    );
  }
}
