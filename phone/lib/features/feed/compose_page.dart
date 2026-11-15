import 'dart:typed_data';

import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/church_api.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';

class ComposePage extends StatefulWidget {
  const ComposePage({super.key, this.story = false});
  final bool story;

  @override
  State<ComposePage> createState() => _ComposePageState();
}

class _ComposePageState extends State<ComposePage> {
  final _caption = TextEditingController();
  XFile? _file;
  Uint8List? _preview;
  bool _busy = false;

  @override
  void dispose() {
    _caption.dispose();
    super.dispose();
  }

  Future<void> _pick(ImageSource source) async {
    final picker = ImagePicker();
    final XFile? file;
    if (widget.story && source == ImageSource.camera) {
      file = await picker.pickVideo(source: source);
    } else if (widget.story) {
      file = await picker.pickMedia();
    } else {
      file = await picker.pickImage(source: source, imageQuality: 85);
    }
    if (file == null) return;
    final isVideo = _isVideo(file.name);
    final bytes = isVideo ? null : await file.readAsBytes();
    if (!mounted) return;
    setState(() {
      _file = file;
      _preview = bytes;
    });
  }

  Future<void> _send() async {
    final caption = _caption.text.trim();
    if (widget.story && _file == null) {
      showMessage(context, 'Для истории нужно фото или видео');
      return;
    }
    if (!widget.story && caption.isEmpty && _file == null) return;
    setState(() => _busy = true);
    final api = ChurchApi(context.read<SessionController>());
    try {
      if (widget.story) {
        await api.createStory(filePath: _file!.path, fileName: _file!.name, caption: caption);
      } else {
        await api.createPost(caption: caption, filePath: _file?.path, fileName: _file?.name);
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      showMessage(context, describeDio(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  bool _isVideo(String name) {
    final lower = name.toLowerCase();
    return lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.webm') || lower.endsWith('.m4v');
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final file = _file;
    final canSend = widget.story ? file != null : (_caption.text.trim().isNotEmpty || file != null);
    return ChurchPage(
      title: widget.story ? 'Новая история' : 'Новая запись',
      subtitle: widget.story ? 'Видна 24 часа' : 'Появится в ленте общины',
      body: SheetList(
        children: [
          Semantics(
            button: true,
            label: file == null ? 'Выбрать фото или видео' : 'Заменить файл',
            child: GestureDetector(
              onTap: () => _pick(ImageSource.gallery),
              child: AspectRatio(
                aspectRatio: widget.story ? 4 / 5 : 4 / 3,
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(Radii.card),
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFF8A2742), Color(0xFFE8A06A)],
                    ),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: _preview != null
                      ? Image.memory(_preview!, fit: BoxFit.cover)
                      : Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              file != null ? Icons.videocam_outlined : Icons.add_photo_alternate_outlined,
                              color: Colors.white,
                              size: 42,
                            ),
                            const SizedBox(height: 10),
                            Text(
                              file != null ? file.name : 'Нажмите, чтобы выбрать фото${widget.story ? ' или видео' : ''}',
                              textAlign: TextAlign.center,
                              style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: Colors.white),
                            ),
                          ],
                        ),
                ),
              ),
            ),
          ),
          Row(
            children: [
              Expanded(
                child: SecondaryButton(
                  label: file == null ? 'Галерея' : 'Заменить',
                  icon: Icons.photo_library_outlined,
                  onPressed: () => _pick(ImageSource.gallery),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: SecondaryButton(
                  label: 'Камера',
                  icon: Icons.photo_camera_outlined,
                  onPressed: () => _pick(ImageSource.camera),
                ),
              ),
            ],
          ),
          TextField(
            controller: _caption,
            minLines: widget.story ? 1 : 3,
            maxLines: 6,
            onChanged: (_) => setState(() {}),
            textCapitalization: TextCapitalization.sentences,
            style: TextStyle(fontSize: 15.5, color: palette.ink),
            decoration: InputDecoration(hintText: widget.story ? 'Подпись (необязательно)' : 'Что нового в общине?'),
          ),
          PrimaryButton(
            label: 'Опубликовать',
            icon: Icons.send_rounded,
            busy: _busy,
            onPressed: canSend ? _send : null,
          ),
          if (widget.story)
            Text(
              'Фото или видео будет видно 24 часа.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12.5, color: palette.inkFaint),
            ),
        ],
      ),
    );
  }
}
