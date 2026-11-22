import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../../../ui/widgets.dart';
import '../logic/chat_logic.dart';
import 'package:flutter/services.dart';

import '../logic/mentions.dart';
import '../logic/voice.dart';
import '../models/chat_models.dart';
import '../thread_controller.dart' show UploadProgress;
import 'emoji_panel.dart';

/// Панель ввода: баннер «ответ / правка», кнопка эмодзи, поле, вложения, отправка и голосовое.
class ChatComposer extends StatefulWidget {
  const ChatComposer({
    super.key,
    required this.controller,
    required this.focusNode,
    required this.sending,
    required this.canSend,
    required this.canSendMedia,
    required this.replyTo,
    required this.editing,
    this.uploading,
    required this.onCancelMode,
    required this.onSend,
    required this.onAttach,
    required this.voice,
    required this.onVoiceClip,
    this.mentionMembers = const [],
    this.meId = 0,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool sending;
  final bool canSend;
  final bool canSendMedia;
  final ChatMessage? replyTo;
  final ChatMessage? editing;

  /// Идёт загрузка вложений: показываем прогресс над полем.
  final UploadProgress? uploading;
  final VoidCallback onCancelMode;
  final VoidCallback onSend;
  final VoidCallback onAttach;
  /// Запись голосового: удержание кнопки, свайп влево — отмена, вверх — закрепить.
  final VoiceRecorderController voice;

  /// Запись готова к отправке.
  final ValueChanged<VoiceClip> onVoiceClip;

  /// Участники группы для подсказок при вводе «@» (в личных чатах пусто).
  final List<ChatMember> mentionMembers;
  final int meId;

  @override
  State<ChatComposer> createState() => _ChatComposerState();
}

class _ChatComposerState extends State<ChatComposer> {
  bool _emojiOpen = false;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_rebuild);
    widget.voice.addListener(_rebuild);
    widget.focusNode.addListener(_onFocus);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_rebuild);
    widget.voice.removeListener(_rebuild);
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

  Future<void> _sendLocked() async {
    final clip = await widget.voice.finish();
    if (clip != null) widget.onVoiceClip(clip);
  }

  /// Список «кого упомянуть», пока набирается «@имя» в группе.
  List<Widget> _mentionSuggestions() {
    if (widget.mentionMembers.isEmpty) return const [];
    final value = widget.controller.value;
    final query = activeMentionQuery(value.text, value.selection.isValid ? value.selection.baseOffset : value.text.length);
    if (query == null) return const [];
    final list = mentionCandidates(widget.mentionMembers, query.query, me: widget.meId);
    if (list.isEmpty) return const [];
    return [
      MentionSuggestions(
        members: list,
        onPick: (member) {
          final cursor = value.selection.isValid ? value.selection.baseOffset : value.text.length;
          final next = insertMention(value.text, query, cursor, member);
          widget.controller.value = TextEditingValue(text: next.text, selection: TextSelection.collapsed(offset: next.cursor));
          widget.focusNode.requestFocus();
        },
      ),
    ];
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
    final voice = widget.voice;
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
              ..._mentionSuggestions(),
              if (widget.uploading != null) _UploadBanner(progress: widget.uploading!),
              if (modeMessage != null)
                _ModeBanner(message: modeMessage, editing: editing, onCancel: widget.onCancelMode),
              Padding(
                padding: const EdgeInsets.fromLTRB(2, 8, 10, 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (widget.canSendMedia && !editing && !voice.active)
                      IconButton(
                        tooltip: 'Прикрепить',
                        constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                        onPressed: widget.sending ? null : widget.onAttach,
                        icon: Icon(Icons.attach_file_rounded, color: palette.inkMuted),
                      )
                    else
                      const SizedBox(width: 8),
                    Expanded(
                      child: voice.active
                          ? RecordingBar(voice: voice, onCancel: voice.cancel)
                          : TextField(
                        controller: widget.controller,
                        focusNode: widget.focusNode,
                        minLines: 1,
                        maxLines: 5,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: InputDecoration(
                          hintText: editing ? 'Изменить сообщение' : 'Сообщение',
                          contentPadding: const EdgeInsets.only(left: 16, top: 12, bottom: 12),
                          // Смайлик внутри строки ввода, справа — как в Telegram.
                          suffixIcon: IconButton(
                            tooltip: _emojiOpen ? 'Клавиатура' : 'Эмодзи',
                            constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                            onPressed: _toggleEmoji,
                            icon: Icon(_emojiOpen ? Icons.keyboard_alt_outlined : Icons.emoji_emotions_outlined, color: palette.inkMuted),
                          ),
                          suffixIconConstraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide(color: palette.outline)),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide(color: palette.outline)),
                          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide(color: palette.accent, width: 1.4)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    if (hasText || editing)
                      _RoundAction(
                        icon: editing ? Icons.check_rounded : Icons.send_rounded,
                        tooltip: editing ? 'Сохранить' : 'Отправить',
                        busy: widget.sending,
                        onPressed: widget.sending ? null : widget.onSend,
                      )
                    else if (voice.state == VoiceState.locked)
                      _RoundAction(icon: Icons.send_rounded, tooltip: 'Отправить запись', busy: widget.sending, onPressed: widget.sending ? null : _sendLocked)
                    else
                      // Голосовое — это вложение: без права на медиа микрофон не нужен.
                      _MicButton(enabled: widget.canSendMedia && !widget.sending, voice: voice, onClip: widget.onVoiceClip),
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

class _UploadBanner extends StatelessWidget {
  const _UploadBanner({required this.progress});
  final UploadProgress progress;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final percent = (progress.fraction * 100).round();
    final many = progress.total > 1;
    return Semantics(
      liveRegion: true,
      label: 'Отправка вложения: $percent%',
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: palette.hairline))),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    many ? 'Отправка ${progress.index} из ${progress.total} · ${progress.name}' : 'Отправка · ${progress.name}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: palette.ink),
                  ),
                ),
                const SizedBox(width: 8),
                Text('$percent%', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: palette.accent)),
              ],
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(value: progress.fraction <= 0 ? null : progress.fraction, minHeight: 4, color: palette.accent, backgroundColor: palette.outline),
            ),
          ],
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
  const _RoundAction({required this.icon, required this.tooltip, required this.onPressed, this.busy = false});

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool busy;

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
            gradient: wineGradient,
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

/// Подсказки участников над полем ввода: аватар и имя, тап вставляет «@Имя».
class MentionSuggestions extends StatelessWidget {
  const MentionSuggestions({super.key, required this.members, required this.onPick});

  final List<ChatMember> members;
  final ValueChanged<ChatMember> onPick;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      key: const ValueKey('mention-suggestions'),
      constraints: const BoxConstraints(maxHeight: 220),
      decoration: BoxDecoration(color: palette.card, border: Border(top: BorderSide(color: palette.hairline))),
      child: ListView(
        shrinkWrap: true,
        padding: EdgeInsets.zero,
        children: [
          for (final m in members)
            InkWell(
              key: ValueKey('mention-${m.id}'),
              onTap: () => onPick(m),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                child: Row(
                  children: [
                    ChurchAvatar(name: m.name, imageUrl: m.avatarUrl, size: 32),
                    const SizedBox(width: 10),
                    Expanded(child: Text(m.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: palette.ink))),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Строка записи вместо поля ввода: красная точка, время и подсказка жестов (или живая волна, если запись закреплена).
class RecordingBar extends StatelessWidget {
  const RecordingBar({super.key, required this.voice, required this.onCancel});

  final VoiceRecorderController voice;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final locked = voice.state == VoiceState.locked;
    final cancelling = voice.willCancel;
    return Container(
      key: const ValueKey('recording-bar'),
      constraints: const BoxConstraints(minHeight: 48),
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: cancelling ? ChurchColors.danger : palette.outline),
        color: cancelling ? ChurchColors.danger.withValues(alpha: 0.08) : null,
      ),
      child: Row(
        children: [
          Container(width: 10, height: 10, decoration: const BoxDecoration(color: ChurchColors.danger, shape: BoxShape.circle)),
          const SizedBox(width: 8),
          Text(clockText(voice.elapsed), key: const ValueKey('recording-clock'), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: palette.ink, fontFeatures: const [FontFeature.tabularFigures()])),
          const SizedBox(width: 12),
          Expanded(
            child: locked
                ? SizedBox(height: 24, child: CustomPaint(painter: _LiveWavePainter(voice.liveWave, palette.accent)))
                : Opacity(
                    opacity: (1 - (-voice.dx / 140)).clamp(0.25, 1.0),
                    child: Text(cancelling ? 'Отпустите — запись удалится' : '‹ Влево — отмена   ↑ закрепить', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, color: cancelling ? ChurchColors.danger : palette.inkMuted)),
                  ),
          ),
          if (locked)
            TextButton(key: const ValueKey('recording-cancel'), onPressed: onCancel, child: const Text('Удалить', style: TextStyle(color: ChurchColors.danger, fontWeight: FontWeight.w700))),
        ],
      ),
    );
  }
}

class _LiveWavePainter extends CustomPainter {
  _LiveWavePainter(this.bars, this.color);
  final List<int> bars;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (bars.isEmpty) return;
    final paint = Paint()..color = color;
    final w = size.width / bars.length;
    for (var i = 0; i < bars.length; i++) {
      final h = (bars[i] / 100 * size.height).clamp(3.0, size.height);
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(i * w, (size.height - h) / 2, (w - 2).clamp(1.5, 5.0), h), const Radius.circular(2)), paint);
    }
  }

  @override
  bool shouldRepaint(_LiveWavePainter old) => true;
}

/// Микрофон: удерживайте, чтобы записать; влево — отмена, вверх — закрепить запись (без удержания).
class _MicButton extends StatefulWidget {
  const _MicButton({required this.enabled, required this.voice, required this.onClip});
  final bool enabled;
  final VoiceRecorderController voice;
  final ValueChanged<VoiceClip> onClip;

  @override
  State<_MicButton> createState() => _MicButtonState();
}

class _MicButtonState extends State<_MicButton> {
  Offset _origin = Offset.zero;

  Future<void> _release() async {
    final clip = await widget.voice.release();
    if (clip != null) widget.onClip(clip);
  }

  @override
  Widget build(BuildContext context) {
    final recording = widget.voice.state == VoiceState.recording;
    final cancelling = widget.voice.willCancel;
    final scale = recording ? 1.35 : 1.0;
    return Semantics(
      button: true,
      enabled: widget.enabled,
      label: 'Записать голосовое: удерживайте кнопку',
      onLongPress: widget.enabled ? () => widget.voice.beginLocked() : null,
      excludeSemantics: true,
      child: GestureDetector(
        key: const ValueKey('mic'),
        behavior: HitTestBehavior.opaque,
        onTap: widget.enabled ? () => showMessage(context, 'Удерживайте кнопку, чтобы записать голосовое') : null,
        onLongPressStart: widget.enabled
            ? (d) {
                _origin = d.globalPosition;
                HapticFeedback.mediumImpact();
                widget.voice.begin();
              }
            : null,
        onLongPressMoveUpdate: widget.enabled ? (d) => widget.voice.drag(d.globalPosition.dx - _origin.dx, d.globalPosition.dy - _origin.dy) : null,
        onLongPressEnd: widget.enabled ? (_) => _release() : null,
        onLongPressCancel: widget.enabled ? () => widget.voice.cancel() : null,
        child: AnimatedScale(
          scale: scale,
          duration: const Duration(milliseconds: 120),
          child: Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: recording ? null : wineGradient,
              color: recording ? (cancelling ? context.palette.inkMuted : ChurchColors.danger) : null,
            ),
            child: Icon(cancelling ? Icons.delete_outline_rounded : Icons.mic_rounded, color: Colors.white, size: 24),
          ),
        ),
      ),
    );
  }
}
