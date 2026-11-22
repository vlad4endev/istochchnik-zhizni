import 'package:material_ui/material_ui.dart';

import '../../../core/dates.dart';
import '../../../ui/kit/kit.dart';
import '../../../ui/video_page.dart';
import '../../../ui/widgets.dart';
import '../logic/chat_logic.dart';

/// «1,2 МБ», «340 КБ»; пусто, если размер неизвестен.
String fileSizeText(int bytes) {
  if (bytes <= 0) return '';
  if (bytes < 1024) return '$bytes Б';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).round()} КБ';
  final mb = bytes / (1024 * 1024);
  if (mb < 1024) return '${mb.toStringAsFixed(1).replaceAll('.', ',')} МБ';
  return '${(mb / 1024).toStringAsFixed(1).replaceAll('.', ',')} ГБ';
}

/// Короткая подпись ссылки: домен без «www.».
String linkHost(String url) {
  final host = Uri.tryParse(url)?.host ?? '';
  return host.startsWith('www.') ? host.substring(4) : host;
}

enum GalleryTab { media, files, links }

/// Все фото, видео, файлы и ссылки чата — как «Медиа, файлы, ссылки» в Telegram.
class MediaGalleryPage extends StatefulWidget {
  const MediaGalleryPage({super.key, required this.media, required this.onOpenUrl, this.initial = GalleryTab.media, this.partial = false});

  final SharedMedia media;
  final void Function(String url) onOpenUrl;
  final GalleryTab initial;

  /// Показаны только последние сообщения (старше не загружали) — скажем об этом внизу.
  final bool partial;

  @override
  State<MediaGalleryPage> createState() => _MediaGalleryPageState();
}

class _MediaGalleryPageState extends State<MediaGalleryPage> {
  late GalleryTab _tab = widget.initial;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final m = widget.media;
    final tabs = <(GalleryTab, String, int)>[
      (GalleryTab.media, 'Фото и видео', m.mediaCount),
      (GalleryTab.files, 'Файлы', m.files.length),
      (GalleryTab.links, 'Ссылки', m.links.length),
    ];
    return Scaffold(
      backgroundColor: palette.sheet,
      appBar: AppBar(backgroundColor: palette.sheet, elevation: 0, title: const Text('Медиа, файлы, ссылки')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: SegmentedPills<GalleryTab>(
              segments: [for (final t in tabs) (t.$1, '${t.$2} · ${t.$3}')],
              selected: _tab,
              onChanged: (value) => setState(() => _tab = value),
            ),
          ),
          Expanded(child: _body(m, palette)),
          if (widget.partial)
            Padding(padding: const EdgeInsets.all(10), child: Text('Показаны последние сообщения чата', style: TextStyle(fontSize: 12.5, color: palette.inkFaint))),
        ],
      ),
    );
  }

  Widget _body(SharedMedia m, ChurchPalette palette) {
    switch (_tab) {
      case GalleryTab.media:
        // Новые сверху; фото и видео вперемешку в порядке сообщений.
        final items = <({String messageId, String url, bool video})>[
          for (final i in m.images) (messageId: i.messageId, url: i.url, video: false),
          for (final v in m.videos) (messageId: v.messageId, url: v.url, video: true),
        ]..sort((a, b) => (int.tryParse(b.messageId) ?? 0).compareTo(int.tryParse(a.messageId) ?? 0));
        if (items.isEmpty) return const EmptyHint('Фото и видео пока нет', icon: Icons.photo_outlined);
        final photoUrls = [for (final i in items) if (!i.video) i.url];
        return GridView.builder(
          key: const ValueKey('gallery-grid'),
          padding: const EdgeInsets.all(4),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, mainAxisSpacing: 3, crossAxisSpacing: 3),
          itemCount: items.length,
          itemBuilder: (context, i) {
            final item = items[i];
            return Semantics(
              button: true,
              label: item.video ? 'Открыть видео' : 'Открыть фото',
              child: GestureDetector(
                key: ValueKey('gallery-item-${item.messageId}'),
                onTap: () => item.video ? pushPage(context, VideoPage(url: item.url)) : pushPage(context, GalleryViewerPage(urls: photoUrls, initial: photoUrls.indexOf(item.url))),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    item.video
                        ? Container(color: palette.card)
                        : Image.network(item.url, fit: BoxFit.cover, cacheWidth: 360, errorBuilder: (_, _, _) => Container(color: palette.outline)),
                    if (item.video) const Center(child: Icon(Icons.play_circle_fill_rounded, size: 40, color: Colors.white70)),
                  ],
                ),
              ),
            );
          },
        );
      case GalleryTab.files:
        if (m.files.isEmpty) return const EmptyHint('Файлов пока нет', icon: Icons.insert_drive_file_outlined);
        return ListView.separated(
          key: const ValueKey('gallery-files'),
          itemCount: m.files.length,
          separatorBuilder: (_, _) => Divider(height: 1, indent: 70, color: palette.outline.withValues(alpha: 0.4)),
          itemBuilder: (context, i) {
            final f = m.files[i];
            final meta = [fileSizeText(f.size), if (f.at != null) chatStamp(f.at!.toIso8601String())].where((s) => s.isNotEmpty).join(' · ');
            return ListRow(
              leading: const IconTile(Icons.insert_drive_file_outlined, tone: Tone.amber, size: 42),
              title: f.name,
              subtitle: meta.isEmpty ? null : meta,
              chevron: false,
              onTap: () => widget.onOpenUrl(f.url),
            );
          },
        );
      case GalleryTab.links:
        if (m.links.isEmpty) return const EmptyHint('Ссылок пока нет', icon: Icons.link_rounded);
        return ListView.separated(
          key: const ValueKey('gallery-links'),
          itemCount: m.links.length,
          separatorBuilder: (_, _) => Divider(height: 1, indent: 70, color: palette.outline.withValues(alpha: 0.4)),
          itemBuilder: (context, i) {
            final l = m.links[i];
            return ListRow(
              leading: const IconTile(Icons.link_rounded, tone: Tone.teal, size: 42),
              title: linkHost(l.url).isEmpty ? l.url : linkHost(l.url),
              subtitle: l.url,
              chevron: false,
              onTap: () => widget.onOpenUrl(l.url),
            );
          },
        );
    }
  }
}

/// Просмотр фото из галереи: листается пальцем влево-вправо, щипком приближается, сверху «3 из 12».
class GalleryViewerPage extends StatefulWidget {
  const GalleryViewerPage({super.key, required this.urls, required this.initial});
  final List<String> urls;
  final int initial;

  @override
  State<GalleryViewerPage> createState() => _GalleryViewerPageState();
}

class _GalleryViewerPageState extends State<GalleryViewerPage> {
  late final PageController _pages = PageController(initialPage: widget.initial.clamp(0, widget.urls.length - 1));
  late int _index = widget.initial.clamp(0, widget.urls.length - 1);

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(backgroundColor: Colors.black, foregroundColor: Colors.white, elevation: 0, title: Text('${_index + 1} из ${widget.urls.length}', key: const ValueKey('viewer-counter'), style: const TextStyle(fontSize: 16))),
      body: PageView.builder(
        controller: _pages,
        itemCount: widget.urls.length,
        onPageChanged: (i) => setState(() => _index = i),
        itemBuilder: (context, i) => Center(
          child: InteractiveViewer(
            maxScale: 5,
            child: Image.network(widget.urls[i], fit: BoxFit.contain, errorBuilder: (_, _, _) => const Icon(Icons.broken_image_outlined, color: Colors.white54, size: 48)),
          ),
        ),
      ),
    );
  }
}
