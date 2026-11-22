import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../logic/chat_logic.dart';
import '../models/chat_models.dart';
import 'link_preview_card.dart';
import 'message_content.dart';

/// Пузырь сообщения в духе Telegram: автор и аватар в группах, цитата ответа, ссылки с карточками,
/// реакции. Тап — меню действий, долгое нажатие — реакции, свайп к центру — ответить.
class MessageBubble extends StatelessWidget {
  const MessageBubble({
    super.key,
    required this.view,
    required this.me,
    required this.groupLike,
    required this.origin,
    required this.member,
    required this.loadPreview,
    required this.onMenu,
    required this.onReactionMenu,
    required this.onReply,
    required this.onOpenUrl,
    required this.onVote,
    required this.onReact,
    required this.onOpenSender,
    this.onOpenReply,
    this.mentionNames = const {},
    this.ownHost,
  });

  final MessageView view;
  final int me;
  final bool groupLike;
  final String origin;
  final String? ownHost;
  final ChatMember? member;
  final Future<LinkPreview?> Function(String url) loadPreview;
  final VoidCallback onMenu;
  final VoidCallback onReactionMenu;
  final VoidCallback onReply;
  final void Function(String url) onOpenUrl;
  final ValueChanged<int> onVote;
  final ValueChanged<String> onReact;
  final ValueChanged<int> onOpenSender;

  /// Тап по цитате «в ответ на…» — перейти к исходному сообщению.
  final ValueChanged<String>? onOpenReply;

  /// Имена участников для упоминаний `@[id]` в тексте.
  final Map<int, String> mentionNames;

  static const _avatarSize = 32.0;

  @override
  Widget build(BuildContext context) {
    final message = view.message;
    final mine = message.senderId == me;
    final palette = context.palette;
    final deleted = message.isDeleted;
    final showSender = groupLike && !mine && message.senderId != null;
    final showAvatar = showSender && !view.groupedWithNext;
    final showName = showSender && !view.groupedWithPrev;
    final fg = deleted ? palette.inkFaint : (mine ? Colors.white : palette.ink);
    final textStyle = TextStyle(fontSize: 15.5, height: 1.35, color: fg, fontStyle: deleted ? FontStyle.italic : FontStyle.normal);
    final linkColor = mine ? const Color(0xFFFFE2B8) : palette.accent;
    final tail = !view.groupedWithNext;
    const big = Radius.circular(18);
    const small = Radius.circular(5);
    const tailR = Radius.circular(6);
    final radius = BorderRadius.only(
      topLeft: !mine && view.groupedWithPrev ? small : big,
      topRight: mine && view.groupedWithPrev ? small : big,
      bottomLeft: mine ? big : (tail ? tailR : small),
      bottomRight: mine ? (tail ? tailR : small) : big,
    );
    final urls = deleted || !message.isText ? const <String>[] : previewUrls(message.content, ownHost: ownHost);
    final time = message.createdAt;

    final bubble = Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
      decoration: BoxDecoration(
        gradient: mine && !deleted ? wineGradient : null,
        color: deleted ? palette.accentSoft.withValues(alpha: 0.7) : (mine ? null : palette.card),
        borderRadius: radius,
        boxShadow: mine || deleted ? null : palette.cardShadow,
      ),
      child: DefaultTextStyle.merge(
        style: textStyle,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (showName)
              Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: GestureDetector(
                  onTap: () => onOpenSender(message.senderId!),
                  child: Text(
                    message.senderName.isEmpty ? 'Участник' : message.senderName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: senderColor(message.senderId)),
                  ),
                ),
              ),
            if (message.forwarded && !deleted)
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Text('Пересланное сообщение', style: TextStyle(fontSize: 12.5, fontStyle: FontStyle.italic, fontWeight: FontWeight.w600, color: mine ? Colors.white70 : palette.accent)),
              ),
            if (message.replyTo != null && !deleted)
              _ReplyQuote(reply: message.replyTo!, mine: mine, onTap: onOpenReply == null || message.replyTo!.isDeleted ? null : () => onOpenReply!(message.replyTo!.id)),
            MessageContent(
              message: message,
              origin: origin,
              mine: mine,
              textStyle: textStyle,
              linkColor: linkColor,
              onOpenUrl: onOpenUrl,
              onVote: onVote,
              mentionNames: mentionNames,
            ),
            for (final url in urls) LinkPreviewCard(url: url, load: loadPreview, mine: mine, onOpen: onOpenUrl),
            if (message.reactions.isNotEmpty && !deleted)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Wrap(
                  spacing: 4,
                  runSpacing: 4,
                  children: [for (final r in message.reactions) _ReactionChip(reaction: r, mine: mine, onTap: () => onReact(r.emoji))],
                ),
              ),
            if (time != null && !deleted)
              Align(
                alignment: Alignment.centerRight,
                child: Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    '${message.isEdited ? 'изменено · ' : ''}${DateFormat('HH:mm').format(time)}',
                    style: TextStyle(fontSize: 11, fontStyle: FontStyle.normal, color: mine ? Colors.white.withValues(alpha: 0.7) : palette.inkFaint),
                  ),
                ),
              ),
          ],
        ),
      ),
    );

    final interactive = deleted
        ? bubble
        : SwipeToReply(
            mine: mine,
            onReply: onReply,
            child: GestureDetector(
              behavior: HitTestBehavior.deferToChild,
              onTap: onMenu,
              onLongPress: () {
                HapticFeedback.mediumImpact();
                onReactionMenu();
              },
              child: Semantics(
                container: true,
                label: [if (showName || (showSender && message.senderName.isNotEmpty)) message.senderName, messageSummary(message)].join(': '),
                onTapHint: 'Открыть меню сообщения',
                child: bubble,
              ),
            ),
          );

    final row = Row(
      mainAxisAlignment: mine ? MainAxisAlignment.end : MainAxisAlignment.start,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        if (groupLike && !mine) ...[
          SizedBox(
            width: _avatarSize,
            child: showAvatar
                ? GestureDetector(
                    onTap: () => onOpenSender(message.senderId!),
                    child: ChurchAvatar(name: message.senderName.isEmpty ? '?' : message.senderName, imageUrl: member?.avatarUrl, size: _avatarSize),
                  )
                : null,
          ),
          const SizedBox(width: 6),
        ],
        Flexible(child: ConstrainedBox(constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78), child: interactive)),
      ],
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (view.dateLabel != null) _DateDivider(label: view.dateLabel!),
        Padding(padding: EdgeInsets.only(top: view.groupedWithPrev ? 1.5 : 5, bottom: view.groupedWithNext ? 1.5 : 2), child: row),
      ],
    );
  }
}

class _DateDivider extends StatelessWidget {
  const _DateDivider({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(color: palette.ink.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(99)),
          child: Text(label, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: palette.inkMuted)),
        ),
      ),
    );
  }
}

class _ReplyQuote extends StatelessWidget {
  const _ReplyQuote({required this.reply, required this.mine, this.onTap});
  final ReplyPreview reply;
  final bool mine;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final accent = mine ? ChurchColors.amber : palette.accent;
    final quote = Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
      decoration: BoxDecoration(
        color: (mine ? Colors.white : palette.accent).withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border(left: BorderSide(color: accent, width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(reply.senderName.isEmpty ? 'Сообщение' : reply.senderName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: accent)),
          Text(
            reply.isDeleted ? 'Сообщение удалено' : (reply.content.trim().isEmpty ? 'Вложение' : reply.content.trim()),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 13, height: 1.25, color: (mine ? Colors.white : palette.ink).withValues(alpha: 0.85), fontStyle: FontStyle.normal),
          ),
        ],
      ),
    );
    if (onTap == null) return quote;
    return GestureDetector(behavior: HitTestBehavior.opaque, onTap: onTap, child: quote);
  }
}

class _ReactionChip extends StatelessWidget {
  const _ReactionChip({required this.reaction, required this.mine, required this.onTap});
  final Reaction reaction;
  final bool mine;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final highlighted = reaction.byMe;
    final bg = mine
        ? Colors.white.withValues(alpha: highlighted ? 0.32 : 0.16)
        : (highlighted ? palette.accent.withValues(alpha: 0.2) : palette.ink.withValues(alpha: 0.07));
    final fg = mine ? Colors.white : palette.ink;
    return Semantics(
      button: true,
      selected: highlighted,
      label: 'Реакция ${reaction.emoji}, ${reaction.count}',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(99),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 30, minWidth: 44),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(99),
              border: highlighted ? Border.all(color: mine ? Colors.white70 : palette.accent, width: 1.2) : null,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(reaction.emoji, style: const TextStyle(fontSize: 15, height: 1.1)),
                const SizedBox(width: 4),
                Text('${reaction.count}', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, fontStyle: FontStyle.normal, color: fg)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Свайп пузыря к центру экрана — «ответить»; стрелка проявляется по мере движения.
class SwipeToReply extends StatefulWidget {
  const SwipeToReply({super.key, required this.child, required this.onReply, required this.mine});

  final Widget child;
  final VoidCallback onReply;
  final bool mine;

  @override
  State<SwipeToReply> createState() => _SwipeToReplyState();
}

class _SwipeToReplyState extends State<SwipeToReply> {
  static const _trigger = 56.0;
  double _dx = 0;
  bool _fired = false;

  void _update(DragUpdateDetails d) {
    // К центру: свои — влево, чужие — вправо.
    final towardCenter = widget.mine ? -d.delta.dx : d.delta.dx;
    final next = (_dx + towardCenter).clamp(0.0, 72.0);
    if (next >= _trigger && !_fired) {
      _fired = true;
      HapticFeedback.selectionClick();
    }
    setState(() => _dx = next);
  }

  void _end(DragEndDetails _) {
    if (_fired) widget.onReply();
    setState(() {
      _dx = 0;
      _fired = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final progress = (_dx / _trigger).clamp(0.0, 1.0);
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onHorizontalDragUpdate: _update,
      onHorizontalDragEnd: _end,
      onHorizontalDragCancel: () => setState(() {
        _dx = 0;
        _fired = false;
      }),
      child: Stack(
        alignment: widget.mine ? Alignment.centerRight : Alignment.centerLeft,
        clipBehavior: Clip.none,
        children: [
          Positioned(
            right: widget.mine ? -34 : null,
            left: widget.mine ? null : -34,
            child: Opacity(
              opacity: progress,
              child: Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(color: palette.accent.withValues(alpha: 0.15), shape: BoxShape.circle),
                child: Icon(Icons.reply_rounded, size: 18, color: palette.accent),
              ),
            ),
          ),
          Transform.translate(offset: Offset(widget.mine ? -_dx : _dx, 0), child: widget.child),
        ],
      ),
    );
  }
}
