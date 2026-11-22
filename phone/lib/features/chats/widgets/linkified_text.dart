import 'package:flutter/gestures.dart';
import 'package:material_ui/material_ui.dart';

import '../logic/chat_logic.dart';
import '../logic/mentions.dart';

/// Текст сообщения: адреса кликабельны (тап — открыть), остальное обычным шрифтом.
class LinkifiedText extends StatefulWidget {
  const LinkifiedText({super.key, required this.text, required this.style, required this.linkColor, required this.onOpen, this.mentionNames = const {}});

  final String text;
  final TextStyle style;
  final Color linkColor;
  final void Function(String url) onOpen;

  /// Имена участников для упоминаний `@[id]` (в группах).
  final Map<int, String> mentionNames;

  @override
  State<LinkifiedText> createState() => _LinkifiedTextState();
}

class _LinkifiedTextState extends State<LinkifiedText> {
  final _recognizers = <TapGestureRecognizer>[];

  @override
  void dispose() {
    for (final r in _recognizers) {
      r.dispose();
    }
    super.dispose();
  }

  List<InlineSpan> _spans() {
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();
    final spans = <InlineSpan>[];
    for (final segment in splitMentions(widget.text, widget.mentionNames)) {
      if (segment.isMention) {
        spans.add(TextSpan(text: segment.text, style: TextStyle(color: widget.linkColor, fontWeight: FontWeight.w800)));
        continue;
      }
      for (final chunk in chunkText(segment.text)) {
        if (!chunk.isLink) {
          spans.add(TextSpan(text: chunk.text));
          continue;
        }
        final recognizer = TapGestureRecognizer()..onTap = () => widget.onOpen(chunk.url!);
        _recognizers.add(recognizer);
        spans.add(TextSpan(
          text: chunk.text,
          style: TextStyle(color: widget.linkColor, decoration: TextDecoration.underline, decorationColor: widget.linkColor),
          recognizer: recognizer,
        ));
      }
    }
    return spans;
  }

  @override
  Widget build(BuildContext context) => Text.rich(TextSpan(style: widget.style, children: _spans()));
}
