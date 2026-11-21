import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../logic/chat_logic.dart';
import '../models/chat_models.dart';
import 'emoji_panel.dart';

/// Панель ввода: баннер «ответ / правка», кнопка эмодзи, поле, вложения, отправка и голосовое.
class ChatComposer extends StatefulWidget {
  const ChatComposer({
    super.key,
    required this.controller,
    required this.focusNode,
    required this.sending,
    required this.recording,
    required this.canSend,
    required this.canSendMedia,
    required this.replyTo,
    required this.editing,
    required this.onCancelMode,
    required this.onSend,
    required this.onAttach,
    required this.onToggleRecord,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool sending;
  final bool recording;
  final bool canSend;
  final bool canSendMedia;
  final ChatMessage? replyTo;
  final ChatMessage? editing;
  final VoidCallback onCancelMode;
  final VoidCallback onSend;
  final VoidCallback onAttach;
  final VoidCallback onToggleRecord;

  @override
  State<ChatComposer> createState() => _ChatComposerState();
}

class _ChatComposerState extends State<ChatComposer> {
  bool _emojiOpen = false;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_rebuild);
    widget.focusNode.addListener(_onFocus);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_rebuild);
    widget.focusNode.removeListener(_onFocus);
    super.dispose();
  }

  void _rebuild() => setState(() {});

  /// Тап по полю — клавиатура вместо каталога эмодзи.
  void _onFocus() {
    if (widget.focusNode.hasFocus && _emojiOpen) setState(() => _emojiOpen = false);
  }

  void _toggleEmoji() {
    if (_emojiOpen) {
      setState(() => _emojiOpen = false);
      widget.focusNode.requestFocus();
    } else {
      widget.focusNode.unfocus();
      setState(() => _emojiOpen = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    if (!widget.canSend) {
      return DecoratedBox(
        decoration: BoxDecoration(color: palette.sheet, border: Border(top: BorderSide(color: palette.hairline))),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(Icons.lock_outline_rounded, size: 18, color: palette.inkMuted),
                const SizedBox(width: 8),
                Expanded(child: Text('В этом чате писать могут только администраторы', style: TextStyle(fontSize: 14, color: palette.inkMuted))),
              ],
            ),
          ),
        ),
      );
    }
    final hasText = widget.controller.text.trim().isNotEmpty;
    final editing = widget.editing != null;
    final modeMessage = widget.editing ?? widget.replyTo;
    final emojiBg = palette.isDark ? palette.card : const Color(0xFFF3ECE3);
    return PopScope(
      canPop: !_emojiOpen,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _emojiOpen) setState(() => _emojiOpen = false);
      },
      child: DecoratedBox(
        decoration: BoxDecoration(color: palette.sheet, border: Border(top: BorderSide(color: palette.hairline))),
        child: SafeArea(
          top: false,
          bottom: !_emojiOpen,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (modeMessage != null)
                _ModeBanner(message: modeMessage, editing: editing, onCancel: widget.onCancelMode),
              Padding(
                padding: const EdgeInsets.fromLTRB(2, 8, 10, 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    IconButton(
                      tooltip: _emojiOpen ? 'Клавиатура' : 'Эмодзи',
                      constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                      onPressed: _toggleEmoji,
                      icon: Icon(_emojiOpen ? Icons.keyboard_alt_outlined : Icons.emoji_emotions_outlined, color: palette.inkMuted),
                    ),
                    Expanded(
                      child: TextField(
                        controller: widget.controller,
                        focusNode: widget.focusNode,
                        minLines: 1,
                        maxLines: 5,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: InputDecoration(
                          hintText: widget.recording ? 'Идёт запись голосового…' : (editing ? 'Изменить сообщение' : 'Сообщение'),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide(color: palette.outline)),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide(color: palette.outline)),
                          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide(color: palette.accent, width: 1.4)),
                        ),
                      ),
                    ),
                    if (widget.canSendMedia && !editing)
                      IconButton(
                        tooltip: 'Прикрепить',
                        constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                        onPressed: widget.sending ? null : widget.onAttach,
                        icon: Icon(Icons.attach_file_rounded, color: palette.inkMuted),
                      ),
                    const SizedBox(width: 2),
                    _RoundAction(
                      icon: hasText ? (editing ? Icons.check_rounded : Icons.send_rounded) : (widget.recording ? Icons.stop_rounded : Icons.mic_none_rounded),
                      tooltip: hasText ? (editing ? 'Сохранить' : 'Отправить') : (widget.recording ? 'Остановить и отправить' : 'Записать голосовое'),
                      busy: widget.sending,
                      danger: widget.recording,
                      // Голосовое — это вложение: без права на медиа и при правке микрофон не нужен.
                      onPressed: widget.sending ? null : (hasText ? widget.onSend : ((widget.canSendMedia && !editing) ? widget.onToggleRecord : null)),
                    ),
                  ],
                ),
              ),
              if (_emojiOpen)
                ColoredBox(
                  color: emojiBg,
                  child: SafeArea(
                    top: false,
                    child: EmojiPanel(
                      textController: widget.controller,
                      height: 280,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ModeBanner extends StatelessWidget {
  const _ModeBanner({required this.message, required this.editing, required this.onCancel});
  final ChatMessage message;
  final bool editing;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 6, 4, 6),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: palette.hairline))),
      child: Row(
        children: [
          Icon(editing ? Icons.edit_outlined : Icons.reply_rounded, size: 22, color: palette.accent),
          const SizedBox(width: 10),
          Container(width: 3, height: 34, decoration: BoxDecoration(color: palette.accent, borderRadius: BorderRadius.circular(2))),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  editing ? 'Редактирование' : (message.senderName.isEmpty ? 'Ответ' : 'Ответ: ${message.senderName}'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: palette.accent),
                ),
                Text(messageSummary(message), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, color: palette.inkMuted)),
              ],
            ),
          ),
          IconButton(
            tooltip: editing ? 'Отменить правку' : 'Отменить ответ',
            constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
            onPressed: onCancel,
            icon: Icon(Icons.close_rounded, color: palette.inkMuted),
          ),
        ],
      ),
    );
  }
}

class _RoundAction extends StatelessWidget {
  const _RoundAction({required this.icon, required this.tooltip, required this.onPressed, this.busy = false, this.danger = false});

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool busy;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        enabled: onPressed != null,
        label: tooltip,
        excludeSemantics: true,
        child: DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: danger ? null : wineGradient,
            color: danger ? ChurchColors.danger : null,
          ),
          child: Material(
            type: MaterialType.transparency,
            shape: const CircleBorder(),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onPressed,
              child: SizedBox(
                width: 46,
                height: 46,
                child: busy
                    ? const Padding(padding: EdgeInsets.all(13), child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
                    : Icon(icon, color: onPressed == null ? Colors.white54 : Colors.white, size: 22),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
