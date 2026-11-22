import 'dart:async';

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:video_player/video_player.dart';

import '../../core/dates.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import 'data/feed_source.dart';
import 'logic/story_logic.dart';
import 'models/feed_models.dart';

/// Просмотр историй как в Instagram: полоски прогресса сверху, фото 5 секунд, видео до конца;
/// тап справа — дальше, слева — назад; удержание — пауза; свайп вниз — закрыть; свайп вбок — другой автор.
/// Чужие истории: реакции и ответ уходят личным сообщением. Свою можно удалить.
class StoryViewerPage extends StatefulWidget {
  const StoryViewerPage({super.key, required this.groups, required this.start, required this.source, required this.meId, required this.onSeen, required this.onDeleted});

  final List<StoryGroup> groups;
  final int start;
  final FeedSource source;
  final int meId;

  /// Историю посмотрели: кружок в ленте сереет.
  final void Function(int authorId, String storyId) onSeen;
  final ValueChanged<String> onDeleted;

  @override
  State<StoryViewerPage> createState() => _StoryViewerPageState();
}

class _StoryViewerPageState extends State<StoryViewerPage> {
  late final PageController _pages = PageController(initialPage: widget.start.clamp(0, widget.groups.length - 1));
  late int _page = widget.start.clamp(0, widget.groups.length - 1);
  late final List<StoryGroup> _groups = List.of(widget.groups);

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  void _close() {
    if (mounted) Navigator.of(context).maybePop();
  }

  void _nextGroup() {
    if (_page >= _groups.length - 1) return _close();
    _pages.nextPage(duration: const Duration(milliseconds: 260), curve: Curves.easeOut);
  }

  void _previousGroup() {
    if (_page <= 0) return;
    _pages.previousPage(duration: const Duration(milliseconds: 260), curve: Curves.easeOut);
  }

  void _groupEmptied(int index) {
    _groups.removeAt(index);
    if (_groups.isEmpty) return _close();
    if (index >= _groups.length) {
      _close();
    } else {
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dismissible(
      key: const ValueKey('story-dismiss'),
      direction: DismissDirection.down,
      resizeDuration: null,
      onDismissed: (_) => _close(),
      child: Scaffold(
        backgroundColor: Colors.black,
        body: PageView.builder(
          key: const ValueKey('story-pages'),
          controller: _pages,
          itemCount: _groups.length,
          onPageChanged: (i) => setState(() => _page = i),
          itemBuilder: (context, i) => StoryGroupPlayer(
            key: ValueKey('group-${_groups[i].author.memberId}'),
            group: _groups[i],
            active: i == _page,
            source: widget.source,
            meId: widget.meId,
            onSeen: widget.onSeen,
            onDeleted: widget.onDeleted,
            onFinished: _nextGroup,
            onBeforeStart: _previousGroup,
            onEmptied: () => _groupEmptied(i),
            onClose: _close,
          ),
        ),
      ),
    );
  }
}

/// Проигрыватель историй одного автора.
class StoryGroupPlayer extends StatefulWidget {
  const StoryGroupPlayer({
    super.key,
    required this.group,
    required this.active,
    required this.source,
    required this.meId,
    required this.onSeen,
    required this.onDeleted,
    required this.onFinished,
    required this.onBeforeStart,
    required this.onEmptied,
    required this.onClose,
  });

  final StoryGroup group;
  final bool active;
  final FeedSource source;
  final int meId;
  final void Function(int authorId, String storyId) onSeen;
  final ValueChanged<String> onDeleted;
  final VoidCallback onFinished;
  final VoidCallback onBeforeStart;
  final VoidCallback onEmptied;
  final VoidCallback onClose;

  @override
  State<StoryGroupPlayer> createState() => _StoryGroupPlayerState();
}

class _StoryGroupPlayerState extends State<StoryGroupPlayer> with SingleTickerProviderStateMixin {
  late List<StoryItem> _stories = List.of(widget.group.stories);
  late int _i = widget.group.firstUnseen.clamp(0, _stories.length - 1);
  late final AnimationController _anim = AnimationController(vsync: this, duration: storyImageDuration)..addStatusListener(_onAnimStatus);
  final _reply = TextEditingController();
  final _focus = FocusNode();

  VideoPlayerController? _video;
  bool _mediaFailed = false;
  bool _started = false; // прогресс текущей истории запущен
  bool _held = false; // палец удерживает экран
  bool _typing = false; // идёт ввод ответа
  bool _sending = false;
  String? _flash;
  Timer? _flashTimer;
  Timer? _flyTimer;
  String? _flyingReaction;
  final Set<String> _seen = {};

  bool get _isMine => widget.group.isMe || widget.group.author.memberId == widget.meId;
  bool get _paused => _held || _typing || !widget.active;
  StoryItem get _story => _stories[_i];

  @override
  void initState() {
    super.initState();
    _focus.addListener(() {
      _typing = _focus.hasFocus;
      _applyPause();
      if (mounted) setState(() {});
    });
    if (widget.active) _begin();
  }

  @override
  void didUpdateWidget(StoryGroupPlayer old) {
    super.didUpdateWidget(old);
    if (old.active != widget.active) {
      if (widget.active) {
        _begin();
      } else {
        _anim.stop();
        _video?.pause();
        _started = false;
      }
    }
  }

  @override
  void dispose() {
    _flashTimer?.cancel();
    _flyTimer?.cancel();
    _anim
      ..removeStatusListener(_onAnimStatus)
      ..dispose();
    _video?.dispose();
    _reply.dispose();
    _focus.dispose();
    super.dispose();
  }

  // ───────────── проигрывание ─────────────

  void _begin() {
    _anim.stop();
    _anim.value = 0;
    _anim.duration = storyImageDuration;
    _disposeVideo();
    _mediaFailed = false;
    _started = false;
    final s = _story;
    if (_seen.add(s.id) && !_isMine) widget.onSeen(widget.group.author.memberId, s.id);
    if (s.isVideo) {
      unawaited(_initVideo(s));
    } else if (_i + 1 < _stories.length && !_stories[_i + 1].isVideo) {
      // Следующая картинка подгружается заранее — переход без паузы.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) precacheImage(NetworkImage(_stories[_i + 1].mediaUrl), context, onError: (_, _) {}); // не загрузилась заранее — покажем ошибку, когда дойдём
      });
    }
    if (mounted) setState(() {});
  }

  /// Фото показано (или не загрузилось) — запускаем отсчёт.
  void _startProgress() {
    if (_started || !widget.active) return;
    _started = true;
    if (!_paused) _anim.forward(from: 0);
  }

  Future<void> _initVideo(StoryItem s) async {
    final controller = VideoPlayerController.networkUrl(Uri.parse(s.mediaUrl));
    _video = controller;
    try {
      await controller.initialize();
      if (!mounted || _video != controller || _story.id != s.id) return;
      controller
        ..setLooping(false)
        ..addListener(_onVideoTick);
      _started = true;
      if (!_paused) await controller.play();
      setState(() {});
    } catch (_) {
      if (!mounted || _video != controller) return;
      // Видео не открылось: показываем сообщение и идём дальше по таймеру, а не застреваем.
      setState(() => _mediaFailed = true);
      _startProgress();
    }
  }

  void _onVideoTick() {
    final v = _video;
    if (v == null || !v.value.isInitialized) return;
    final total = v.value.duration.inMilliseconds;
    if (total <= 0) return;
    _anim.value = (v.value.position.inMilliseconds / total).clamp(0.0, 1.0);
    if (v.value.position >= v.value.duration && !_paused) _next();
  }

  void _disposeVideo() {
    final v = _video;
    _video = null;
    v?.removeListener(_onVideoTick);
    v?.dispose();
  }

  void _onAnimStatus(AnimationStatus status) {
    // У видео отсчёт идёт от самого видео, а не от таймера.
    if (status == AnimationStatus.completed && !(_story.isVideo && !_mediaFailed)) _next();
  }

  void _applyPause() {
    if (_paused) {
      _anim.stop();
      _video?.pause();
    } else if (_started) {
      if (_story.isVideo && !_mediaFailed) {
        _video?.play();
      } else {
        _anim.forward();
      }
    }
  }

  void _next() {
    if (_i + 1 < _stories.length) {
      setState(() => _i++);
      _begin();
    } else {
      widget.onFinished();
    }
  }

  void _previous() {
    if (_i > 0) {
      setState(() => _i--);
      _begin();
    } else {
      widget.onBeforeStart();
    }
  }

  void _onTapUp(TapUpDetails d, double width) {
    if (_typing) {
      _focus.unfocus();
      return;
    }
    switch (storyTapZone(d.localPosition.dx, width)) {
      case StoryTap.previous:
        _previous();
      case StoryTap.next:
        _next();
    }
  }

  // ───────────── ответ и реакции ─────────────

  void _showFlash(String text) {
    _flashTimer?.cancel();
    setState(() => _flash = text);
    _flashTimer = Timer(const Duration(milliseconds: 1800), () {
      if (mounted) setState(() => _flash = null);
    });
  }

  Future<void> _sendReply({String? text, String? reaction}) async {
    if (_sending) return;
    final clean = text?.trim() ?? '';
    if (clean.isEmpty && (reaction == null || reaction.isEmpty)) return;
    setState(() {
      _sending = true;
      if (reaction != null) _flyingReaction = reaction;
    });
    HapticFeedback.selectionClick();
    try {
      await widget.source.replyToStory(_story.id, text: clean.isEmpty ? null : clean, reaction: reaction);
      if (!mounted) return;
      _reply.clear();
      _focus.unfocus();
      _showFlash(reaction != null && clean.isEmpty ? 'Реакция отправлена в чат' : 'Ответ отправлен в чат');
    } catch (e) {
      if (mounted) showMessage(context, e is FeedException ? e.message : 'Не удалось отправить. Попробуйте ещё раз.');
    } finally {
      if (mounted) {
        setState(() => _sending = false);
        _flyTimer?.cancel();
        _flyTimer = Timer(const Duration(milliseconds: 900), () {
          if (mounted) setState(() => _flyingReaction = null);
        });
      }
    }
  }

  Future<void> _delete() async {
    _held = true;
    _applyPause();
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Удалить историю?'),
        content: const Text('Она пропадёт у всех.'),
        actions: [
          TextButton(key: const ValueKey('story-delete-cancel'), onPressed: () => Navigator.pop(dialog, false), child: const Text('Отмена')),
          TextButton(key: const ValueKey('story-delete-ok'), onPressed: () => Navigator.pop(dialog, true), child: const Text('Удалить')),
        ],
      ),
    );
    if (!mounted) return;
    if (ok != true) {
      _held = false;
      _applyPause();
      return;
    }
    final id = _story.id;
    try {
      await widget.source.deleteStory(id);
      if (!mounted) return;
      widget.onDeleted(id);
      _held = false;
      if (_stories.length == 1) {
        widget.onEmptied();
        return;
      }
      setState(() {
        _stories = [for (final s in _stories) if (s.id != id) s];
        if (_i >= _stories.length) _i = _stories.length - 1;
      });
      _begin();
    } catch (e) {
      if (!mounted) return;
      _held = false;
      _applyPause();
      showMessage(context, e is FeedException ? e.message : 'Не удалось удалить историю.');
    }
  }

  // ───────────── интерфейс ─────────────

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final s = _story;
    return LayoutBuilder(
      builder: (context, box) => Stack(
        fit: StackFit.expand,
        children: [
          // Медиа и зоны нажатия.
          Positioned.fill(
            child: GestureDetector(
              key: const ValueKey('story-surface'),
              behavior: HitTestBehavior.opaque,
              onTapUp: (d) => _onTapUp(d, box.maxWidth),
              onLongPressStart: (_) {
                _held = true;
                _applyPause();
              },
              onLongPressEnd: (_) {
                _held = false;
                _applyPause();
              },
              onLongPressCancel: () {
                _held = false;
                _applyPause();
              },
              child: ColoredBox(color: Colors.black, child: Center(child: _mediaView(s))),
            ),
          ),
          // Затемнение сверху и снизу — чтобы текст читался на любом фото.
          const Positioned(top: 0, left: 0, right: 0, height: 140, child: IgnorePointer(child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xAA000000), Color(0x00000000)]))))),
          const Positioned(bottom: 0, left: 0, right: 0, height: 220, child: IgnorePointer(child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.bottomCenter, end: Alignment.topCenter, colors: [Color(0xCC000000), Color(0x00000000)]))))),
          Positioned(top: media.padding.top + 8, left: 10, right: 10, child: _top()),
          if (s.caption.isNotEmpty)
            Positioned(
              left: 20,
              right: 20,
              bottom: (_isMine ? 28 : 128) + media.padding.bottom,
              child: IgnorePointer(child: Text(s.caption, key: const ValueKey('story-caption'), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 17, height: 1.35, fontWeight: FontWeight.w600, shadows: [Shadow(blurRadius: 8, color: Colors.black54)]))),
            ),
          if (!_isMine) Positioned(left: 0, right: 0, bottom: 0, child: _replyBar(media)),
          if (_flyingReaction != null) Center(child: IgnorePointer(child: TweenAnimationBuilder<double>(tween: Tween(begin: 0.4, end: 2.2), duration: const Duration(milliseconds: 700), curve: Curves.easeOutBack, builder: (_, v, _) => Opacity(opacity: (2.4 - v).clamp(0.0, 1.0), child: Text(_flyingReaction!, style: TextStyle(fontSize: 48 * v)))))),
          if (_flash != null)
            Positioned(
              top: media.size.height * 0.4,
              left: 40,
              right: 40,
              child: IgnorePointer(child: Container(key: const ValueKey('story-flash'), padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 14), decoration: BoxDecoration(color: Colors.black87, borderRadius: BorderRadius.circular(14)), child: Text(_flash!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)))),
            ),
        ],
      ),
    );
  }

  Widget _mediaView(StoryItem s) {
    if (s.isVideo) {
      final v = _video;
      if (_mediaFailed) return const _Failed(text: 'Не удалось загрузить видео');
      if (v == null || !v.value.isInitialized) return const CircularProgressIndicator(color: Colors.white54);
      return AspectRatio(aspectRatio: v.value.aspectRatio, child: VideoPlayer(v));
    }
    return Image.network(
      s.mediaUrl,
      key: ValueKey('story-image-${s.id}'),
      fit: BoxFit.contain,
      width: double.infinity,
      height: double.infinity,
      frameBuilder: (context, child, frame, sync) {
        if (frame != null || sync) WidgetsBinding.instance.addPostFrameCallback((_) => _startProgress());
        return frame == null && !sync ? const Center(child: CircularProgressIndicator(color: Colors.white54)) : child;
      },
      errorBuilder: (context, error, stack) {
        // Не загрузилось — не застреваем: покажем значок и пойдём дальше.
        WidgetsBinding.instance.addPostFrameCallback((_) => _startProgress());
        return const _Failed(text: 'Не удалось загрузить фото');
      },
    );
  }

  Widget _top() {
    final a = widget.group.author;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        AnimatedBuilder(
          animation: _anim,
          builder: (context, _) => Row(
            key: const ValueKey('story-segments'),
            children: [
              for (var i = 0; i < _stories.length; i++)
                Expanded(
                  child: Container(
                    height: 3,
                    margin: const EdgeInsets.symmetric(horizontal: 1.5),
                    decoration: BoxDecoration(borderRadius: BorderRadius.circular(2), color: Colors.white30),
                    alignment: Alignment.centerLeft,
                    child: FractionallySizedBox(widthFactor: i < _i ? 1 : (i == _i ? _anim.value.clamp(0.0, 1.0) : 0), child: Container(decoration: BoxDecoration(borderRadius: BorderRadius.circular(2), color: Colors.white))),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            ChurchAvatar(name: a.label, imageUrl: a.avatarUrl, size: 36),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_isMine ? 'Ваша история' : a.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
                  Text([relativeTime(_story.createdAt?.toIso8601String()), if (_isMine) storyTimeLeft(_story.expiresAt)].where((e) => e.isNotEmpty).join(' · '), key: const ValueKey('story-time'), style: const TextStyle(color: Colors.white70, fontSize: 12.5)),
                ],
              ),
            ),
            if (_isMine)
              IconButton(key: const ValueKey('story-delete'), tooltip: 'Удалить историю', onPressed: _delete, icon: const Icon(Icons.delete_outline_rounded, color: Colors.white)),
            IconButton(key: const ValueKey('story-close'), tooltip: 'Закрыть', onPressed: widget.onClose, icon: const Icon(Icons.close_rounded, color: Colors.white)),
          ],
        ),
      ],
    );
  }

  Widget _replyBar(MediaQueryData media) {
    return Padding(
      padding: EdgeInsets.fromLTRB(12, 0, 12, 10 + media.padding.bottom + media.viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: 46,
            child: ListView(
              key: const ValueKey('story-reactions'),
              scrollDirection: Axis.horizontal,
              children: [
                for (final e in storyReactions)
                  Semantics(
                    button: true,
                    label: 'Реакция $e',
                    excludeSemantics: true,
                    child: InkWell(
                      key: ValueKey('reaction-$e'),
                      customBorder: const CircleBorder(),
                      onTap: _sending ? null : () => _sendReply(reaction: e),
                      child: SizedBox(width: 46, height: 46, child: Center(child: Text(e, style: const TextStyle(fontSize: 26)))),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: TextField(
                  key: const ValueKey('story-reply-field'),
                  controller: _reply,
                  focusNode: _focus,
                  style: const TextStyle(color: Colors.white),
                  textInputAction: TextInputAction.send,
                  onChanged: (_) => setState(() {}),
                  onSubmitted: (v) => _sendReply(text: v),
                  decoration: InputDecoration(
                    hintText: 'Отправить сообщение…',
                    hintStyle: const TextStyle(color: Colors.white70),
                    isDense: true,
                    filled: false,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: const BorderSide(color: Colors.white54)),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: const BorderSide(color: Colors.white, width: 1.4)),
                  ),
                ),
              ),
              if (_reply.text.trim().isNotEmpty)
                IconButton(key: const ValueKey('story-reply-send'), tooltip: 'Отправить', onPressed: _sending ? null : () => _sendReply(text: _reply.text), icon: const Icon(Icons.send_rounded, color: Colors.white)),
            ],
          ),
        ],
      ),
    );
  }
}

class _Failed extends StatelessWidget {
  const _Failed({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.broken_image_outlined, color: Colors.white54, size: 48),
          const SizedBox(height: 8),
          Text(text, key: const ValueKey('story-failed'), style: const TextStyle(color: Colors.white70)),
        ],
      );
}
