import 'dart:io';

import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import '../chats/data/attachment_picker.dart';
import '../chats/logic/attachment_logic.dart';
import 'data/feed_source.dart';
import 'logic/compose_logic.dart';

/// Откуда берутся фото и видео для записи и истории. Отдельный интерфейс — чтобы проверять без телефона.
abstract class FeedMediaPicker {
  /// Несколько фото и видео из галереи; пусто — человек ничего не выбрал.
  Future<List<PickedAttachment>> gallery({required int limit});
  Future<PickedAttachment?> takePhoto();
  Future<PickedAttachment?> takeVideo();

  /// Запасной путь через системные «Файлы» (если галерея на телефоне не отвечает).
  Future<List<PickedAttachment>> files();
}

class DeviceFeedMediaPicker implements FeedMediaPicker {
  DeviceFeedMediaPicker({ImagePicker? images, DeviceAttachmentPicker? attachments})
      : _images = images ?? ImagePicker(),
        _attachments = attachments ?? DeviceAttachmentPicker();
  final ImagePicker _images;
  final DeviceAttachmentPicker _attachments;

  PickedAttachment _from(XFile f) => PickedAttachment(path: f.path, name: f.name, mimeType: f.mimeType);

  @override
  Future<List<PickedAttachment>> gallery({required int limit}) async {
    final picked = limit == 1 ? [?await _images.pickMedia()] : await _images.pickMultipleMedia(limit: limit < 2 ? null : limit, imageQuality: 88);
    return [for (final f in picked) _from(f)];
  }

  @override
  Future<PickedAttachment?> takePhoto() async {
    final f = await _images.pickImage(source: ImageSource.camera, imageQuality: 88);
    return f == null ? null : _from(f);
  }

  @override
  Future<PickedAttachment?> takeVideo() async {
    final f = await _images.pickVideo(source: ImageSource.camera, maxDuration: const Duration(minutes: 2));
    return f == null ? null : _from(f);
  }

  @override
  Future<List<PickedAttachment>> files() async => [...await _attachments.viaFiles('image')];
}

/// Создание записи (до 10 фото и видео, подпись) или истории (одно фото или видео на 24 часа).
class ComposePage extends StatefulWidget {
  const ComposePage({super.key, this.story = false, this.source, this.picker});
  final bool story;

  /// Для тестов; в приложении берутся из сессии.
  final FeedSource? source;
  final FeedMediaPicker? picker;

  @override
  State<ComposePage> createState() => _ComposePageState();
}

class _ComposePageState extends State<ComposePage> {
  final _caption = TextEditingController();
  late final FeedMediaPicker _picker = widget.picker ?? DeviceFeedMediaPicker();
  final List<PickedAttachment> _files = [];
  bool _busy = false;
  double? _progress;
  String? _problem;

  int get _limit => widget.story ? 1 : maxPostFiles;

  @override
  void dispose() {
    _caption.dispose();
    super.dispose();
  }

  FeedSource get _source => widget.source ?? FeedApi(context.read<SessionController>());

  bool get _dirty => _files.isNotEmpty || _caption.text.trim().isNotEmpty;

  Future<void> _add(Future<List<PickedAttachment>> Function() choose) async {
    List<PickedAttachment> picked;
    try {
      picked = await choose();
    } catch (_) {
      if (mounted) setState(() => _problem = 'Не удалось открыть выбор. Попробуйте ещё раз или выберите через «Файлы».');
      return;
    }
    if (!mounted || picked.isEmpty) return;
    final big = _tooLarge(picked);
    if (big != null) {
      setState(() => _problem = big);
      return;
    }
    setState(() {
      _problem = null;
      if (widget.story) {
        _files
          ..clear()
          ..add(picked.first);
      } else {
        final r = clampFiles(_files, picked);
        _files.addAll(r.accepted);
        if (r.dropped > 0) _problem = 'Можно приложить не больше $maxPostFiles файлов — лишние пропущены.';
      }
    });
  }

  String? _tooLarge(List<PickedAttachment> picked) {
    for (final f in picked) {
      try {
        final message = tooLargeMessage(f.name, File(f.path).lengthSync());
        if (message != null) return message;
      } catch (_) {
        /* размер неизвестен — решит сервер */
      }
    }
    return null;
  }

  Future<void> _publish() async {
    if (_busy) return;
    final caption = _caption.text.trim();
    if (widget.story ? _files.isEmpty : !canPublishPost(caption: caption, files: _files.length)) return;
    setState(() {
      _busy = true;
      _progress = null;
      _problem = null;
    });
    try {
      if (widget.story) {
        await _source.createStory(file: UploadFile(path: _files.first.path, name: _files.first.name), caption: caption, onProgress: (f) => mounted ? setState(() => _progress = f) : null);
      } else {
        await _source.createPost(caption: caption, files: [for (final f in _files) UploadFile(path: f.path, name: f.name)], onProgress: (f) => mounted ? setState(() => _progress = f) : null);
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() => _problem = e is FeedException ? e.message : 'Не удалось опубликовать. Проверьте интернет и попробуйте снова.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool> _confirmLeave() async {
    if (!_dirty || _busy) return true;
    final leave = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Выйти без публикации?'),
        content: const Text('Выбранное и написанное не сохранится.'),
        actions: [
          TextButton(key: const ValueKey('compose-stay'), onPressed: () => Navigator.pop(dialog, false), child: const Text('Остаться')),
          TextButton(key: const ValueKey('compose-leave'), onPressed: () => Navigator.pop(dialog, true), child: const Text('Выйти')),
        ],
      ),
    );
    return leave == true;
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_dirty || _busy,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _confirmLeave() && context.mounted) Navigator.of(context).pop();
      },
      child: widget.story ? _storyBody(context) : _postBody(context),
    );
  }

  // ───────────── запись ─────────────

  Widget _postBody(BuildContext context) {
    final palette = context.palette;
    final canSend = canPublishPost(caption: _caption.text, files: _files.length);
    return ChurchPage(
      title: 'Новая запись',
      subtitle: 'Появится в ленте общины',
      body: SheetList(
        children: [
          if (_files.isEmpty) _emptyPicker(palette) else _thumbs(palette),
          Row(
            children: [
              Expanded(child: SecondaryButton(key: const ValueKey('compose-gallery'), label: 'Галерея', icon: Icons.photo_library_outlined, onPressed: _busy ? null : () => _add(() => _picker.gallery(limit: _limit - _files.length < 2 ? 2 : _limit - _files.length)))),
              const SizedBox(width: 10),
              Expanded(child: SecondaryButton(key: const ValueKey('compose-camera'), label: 'Камера', icon: Icons.photo_camera_outlined, onPressed: _busy ? null : () => _add(() async => [?await _picker.takePhoto()]))),
            ],
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(key: const ValueKey('compose-files'), onPressed: _busy ? null : () => _add(_picker.files), child: const Text('Галерея не открывается? Выбрать из файлов')),
          ),
          TextField(
            key: const ValueKey('compose-caption'),
            controller: _caption,
            minLines: 3,
            maxLines: 8,
            maxLength: 2000,
            onChanged: (_) => setState(() {}),
            textCapitalization: TextCapitalization.sentences,
            style: TextStyle(fontSize: 15.5, color: palette.ink),
            decoration: const InputDecoration(hintText: 'Что нового в общине?'),
          ),
          if (_problem != null) InfoBanner(_problem!, error: true),
          if (_busy) LinearProgressIndicator(key: const ValueKey('compose-progress'), value: _progress, minHeight: 6, borderRadius: BorderRadius.circular(3)),
          PrimaryButton(key: const ValueKey('compose-publish'), label: _busy ? uploadLabel(_progress) : 'Опубликовать', icon: Icons.send_rounded, busy: _busy, onPressed: canSend && !_busy ? _publish : null),
        ],
      ),
    );
  }

  Widget _emptyPicker(ChurchPalette palette) => Semantics(
        button: true,
        label: 'Выбрать фото или видео',
        child: GestureDetector(
          onTap: _busy ? null : () => _add(() => _picker.gallery(limit: _limit)),
          child: AspectRatio(
            aspectRatio: 16 / 9,
            child: Container(
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(Radii.card), gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF8A2742), Color(0xFFE8A06A)])),
              child: const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.add_photo_alternate_outlined, color: Colors.white, size: 42),
                  SizedBox(height: 10),
                  Text('Добавьте фото или видео\n(до 10 файлов)', textAlign: TextAlign.center, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: Colors.white)),
                ],
              ),
            ),
          ),
        ),
      );

  Widget _thumbs(ChurchPalette palette) => SizedBox(
        height: 118,
        child: ListView(
          key: const ValueKey('compose-thumbs'),
          scrollDirection: Axis.horizontal,
          children: [
            for (var i = 0; i < _files.length; i++)
              Padding(
                key: ValueKey('thumb-$i'),
                padding: const EdgeInsets.only(right: 8),
                child: Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(Radii.md),
                      child: SizedBox(
                        width: 104,
                        height: 118,
                        child: isVideoFile(_files[i].name, _files[i].mimeType)
                            ? Container(color: palette.card, child: const Center(child: Icon(Icons.play_circle_fill_rounded, size: 40, color: Colors.black45)))
                            : Image.file(File(_files[i].path), fit: BoxFit.cover, cacheWidth: 300, errorBuilder: (_, _, _) => Container(color: palette.accentSoft, child: Icon(Icons.image_outlined, color: palette.inkFaint))),
                      ),
                    ),
                    Positioned(
                      top: 4,
                      right: 4,
                      child: GestureDetector(
                        key: ValueKey('thumb-remove-$i'),
                        onTap: _busy ? null : () => setState(() => _files.removeAt(i)),
                        child: Container(width: 26, height: 26, decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle), child: const Icon(Icons.close_rounded, size: 16, color: Colors.white)),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      );

  // ───────────── история ─────────────

  Widget _storyBody(BuildContext context) {
    final palette = context.palette;
    final file = _files.isEmpty ? null : _files.first;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          if (file == null)
            _storyChooser()
          else if (isVideoFile(file.name, file.mimeType))
            const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [Icon(Icons.videocam_rounded, color: Colors.white54, size: 72), SizedBox(height: 8), Text('Видео готово к публикации', style: TextStyle(color: Colors.white70))]))
          else
            Image.file(File(file.path), fit: BoxFit.contain, errorBuilder: (_, _, _) => const Center(child: Icon(Icons.image_outlined, color: Colors.white54, size: 72))),
          SafeArea(
            child: Align(
              alignment: Alignment.topCenter,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
                child: Row(
                  children: [
                    IconButton(
                      key: const ValueKey('story-compose-close'),
                      tooltip: 'Закрыть',
                      onPressed: () async {
                        final navigator = Navigator.of(context);
                        if (await _confirmLeave()) navigator.pop();
                      },
                      icon: const Icon(Icons.close_rounded, color: Colors.white),
                    ),
                    const Expanded(child: Text('Новая история', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 17))),
                    if (file != null) IconButton(key: const ValueKey('story-compose-replace'), tooltip: 'Выбрать другое', onPressed: _busy ? null : () => setState(() => _files.clear()), icon: const Icon(Icons.refresh_rounded, color: Colors.white)),
                  ],
                ),
              ),
            ),
          ),
          if (file != null)
            Align(
              alignment: Alignment.bottomCenter,
              child: SafeArea(
                child: Container(
                  padding: EdgeInsets.fromLTRB(14, 14, 14, 12 + MediaQuery.of(context).viewInsets.bottom),
                  decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.bottomCenter, end: Alignment.topCenter, colors: [Color(0xE6000000), Color(0x00000000)])),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (_problem != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(_problem!, key: const ValueKey('story-compose-problem'), style: const TextStyle(color: Color(0xFFFF9AA8), fontWeight: FontWeight.w600))),
                      if (_busy) Padding(padding: const EdgeInsets.only(bottom: 8), child: LinearProgressIndicator(key: const ValueKey('compose-progress'), value: _progress, minHeight: 5, borderRadius: BorderRadius.circular(3))),
                      TextField(
                        key: const ValueKey('compose-caption'),
                        controller: _caption,
                        maxLength: 200,
                        maxLines: 2,
                        minLines: 1,
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          hintText: 'Подпись (необязательно)',
                          hintStyle: const TextStyle(color: Colors.white70),
                          counterStyle: const TextStyle(color: Colors.white54),
                          filled: false,
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: const BorderSide(color: Colors.white54)),
                          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: const BorderSide(color: Colors.white, width: 1.4)),
                        ),
                      ),
                      const SizedBox(height: 6),
                      PrimaryButton(key: const ValueKey('compose-publish'), label: _busy ? uploadLabel(_progress) : 'Опубликовать историю', icon: Icons.send_rounded, busy: _busy, onPressed: _busy ? null : _publish),
                      const SizedBox(height: 4),
                      Text('Будет видна 24 часа', style: TextStyle(fontSize: 12.5, color: palette.inkFaint)),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _storyChooser() => SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.auto_awesome_rounded, color: Colors.white70, size: 46),
                const SizedBox(height: 14),
                const Text('Поделитесь моментом', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                const Text('Фото или видео будет видно 24 часа', style: TextStyle(color: Colors.white70)),
                const SizedBox(height: 22),
                if (_problem != null) Padding(padding: const EdgeInsets.only(bottom: 14), child: Text(_problem!, key: const ValueKey('story-compose-problem'), textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFFFF9AA8), fontWeight: FontWeight.w600))),
                PrimaryButton(key: const ValueKey('compose-gallery'), label: 'Из галереи', icon: Icons.photo_library_outlined, onPressed: () => _add(() => _picker.gallery(limit: 1))),
                const SizedBox(height: 10),
                SecondaryButton(key: const ValueKey('compose-camera'), label: 'Снять фото', icon: Icons.photo_camera_outlined, onPressed: () => _add(() async => [?await _picker.takePhoto()])),
                const SizedBox(height: 10),
                SecondaryButton(key: const ValueKey('compose-video'), label: 'Снять видео', icon: Icons.videocam_outlined, onPressed: () => _add(() async => [?await _picker.takeVideo()])),
                TextButton(key: const ValueKey('compose-files'), onPressed: () => _add(_picker.files), child: const Text('Галерея не открывается? Выбрать из файлов', style: TextStyle(color: Colors.white70))),
              ],
            ),
          ),
        ),
      );
}
