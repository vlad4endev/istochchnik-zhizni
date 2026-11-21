import 'package:material_ui/material_ui.dart';

import '../../../core/json.dart';
import '../../../ui/audio_player_page.dart';
import '../../../ui/kit/kit.dart';
import '../../../ui/video_page.dart';
import '../../../ui/widgets.dart';
import '../logic/attachment_logic.dart';
import '../models/chat_models.dart';
import 'linkified_text.dart';

/// Полноэкранный просмотр фото: щипком можно приблизить.
class ImageViewerPage extends StatelessWidget {
  const ImageViewerPage({super.key, required this.url});
  final String url;

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(backgroundColor: Colors.black, foregroundColor: Colors.white, elevation: 0),
        body: Center(
          child: InteractiveViewer(
            maxScale: 5,
            child: Image.network(
              url,
              fit: BoxFit.contain,
              errorBuilder: (_, _, _) => const Icon(Icons.broken_image_outlined, color: Colors.white54, size: 48),
            ),
          ),
        ),
      );
}

/// Содержимое сообщения: текст со ссылками, фото, голосовое, файл, видео, опрос.
class MessageContent extends StatelessWidget {
  const MessageContent({
    super.key,
    required this.message,
    required this.origin,
    required this.mine,
    required this.textStyle,
    required this.linkColor,
    required this.onOpenUrl,
    required this.onVote,
  });

  final ChatMessage message;
  final String origin;
  final bool mine;
  final TextStyle textStyle;
  final Color linkColor;
  final void Function(String url) onOpenUrl;
  final ValueChanged<int> onVote;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    if (message.isDeleted) return Text('Сообщение удалено', style: textStyle.copyWith(fontStyle: FontStyle.italic));
    final payload = message.payload;
    final url = resolveUrl(origin, str(payload['url']));
    final caption = message.content;
    final fg = textStyle.color ?? palette.ink;
    final accent = mine ? Colors.white : ChurchColors.wine;

    Widget captionText() => Padding(
          padding: const EdgeInsets.only(top: 6),
          child: LinkifiedText(text: caption, style: textStyle, linkColor: linkColor, onOpen: onOpenUrl),
        );

    switch (message.payloadType) {
      // Видео уходит тем же типом «image» (как на сайте): отличаем по типу содержимого.
      case 'image' when url.isNotEmpty && isVideoPayload(mimeType: str(payload['mimeType']), url: url, name: str(payload['name'])):
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              button: true,
              label: 'Открыть видео',
              child: GestureDetector(
                onTap: () => pushPage(context, VideoPage(url: url)),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    width: 240,
                    height: 150,
                    color: Colors.black87,
                    alignment: Alignment.center,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        const Icon(Icons.play_circle_fill_rounded, size: 56, color: Colors.white),
                        if (str(payload['name']).isNotEmpty)
                          Positioned(
                            left: 10,
                            right: 10,
                            bottom: 8,
                            child: Text(str(payload['name']), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Colors.white70)),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            if (caption.isNotEmpty) captionText(),
          ],
        );
      case 'image' when url.isNotEmpty:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              button: true,
              label: 'Открыть фото',
              child: GestureDetector(
                onTap: () => pushPage(context, ImageViewerPage(url: url)),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.network(
                    url,
                    width: 240,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => Container(
                      width: 240,
                      height: 120,
                      color: fg.withValues(alpha: 0.08),
                      alignment: Alignment.center,
                      child: Icon(Icons.broken_image_outlined, color: fg.withValues(alpha: 0.5)),
                    ),
                  ),
                ),
              ),
            ),
            if (caption.isNotEmpty) captionText(),
          ],
        );
      case 'audio' when url.isNotEmpty:
        final voice = str(payload['kind']) == 'voice' || str(payload['name']).isEmpty;
        return InkWell(
          onTap: () => pushPage(context, AudioPlayerPage(url: url, title: voice ? 'Голосовое' : str(payload['name']))),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.play_circle_fill_rounded, size: 34, color: accent),
                const SizedBox(width: 8),
                Flexible(child: Text(voice ? 'Голосовое сообщение' : str(payload['name']), style: textStyle)),
              ],
            ),
          ),
        );
      case 'file' when url.isNotEmpty:
        return InkWell(
          onTap: () => onOpenUrl(url),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.insert_drive_file_outlined, color: accent),
                const SizedBox(width: 8),
                Flexible(child: Text(str(payload['name']).isEmpty ? 'Файл' : str(payload['name']), style: textStyle)),
              ],
            ),
          ),
        );
      case 'video_note' when url.isNotEmpty:
        return InkWell(
          onTap: () => pushPage(context, VideoPage(url: url)),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44),
            child: Row(mainAxisSize: MainAxisSize.min, children: [Icon(Icons.videocam, color: accent), const SizedBox(width: 8), Text('Видео', style: textStyle)]),
          ),
        );
      case 'poll':
        return _Poll(message: message, mine: mine, fg: fg, onVote: onVote);
      default:
        return LinkifiedText(text: caption, style: textStyle, linkColor: linkColor, onOpen: onOpenUrl);
    }
  }
}

class _Poll extends StatelessWidget {
  const _Poll({required this.message, required this.mine, required this.fg, required this.onVote});
  final ChatMessage message;
  final bool mine;
  final Color fg;
  final ValueChanged<int> onVote;

  @override
  Widget build(BuildContext context) {
    final options = asList(message.payload['options']);
    final tallies = message.pollTallies;
    final total = tallies.fold<int>(0, (a, b) => a + b);
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 220),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.poll_outlined, size: 16, color: mine ? ChurchColors.amber : ChurchColors.wine),
              const SizedBox(width: 6),
              Flexible(child: Text(message.content, style: TextStyle(fontWeight: FontWeight.w700, color: fg))),
            ],
          ),
          const SizedBox(height: 8),
          for (var i = 0; i < options.length; i++)
            Builder(builder: (context) {
              final votes = i < tallies.length ? tallies[i] : 0;
              final share = total == 0 ? 0.0 : votes / total;
              final chosen = message.pollMine.contains(i);
              return Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: InkWell(
                  borderRadius: BorderRadius.circular(10),
                  onTap: () => onVote(i),
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 44),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: fg.withValues(alpha: chosen ? 0.7 : 0.25), width: chosen ? 1.6 : 1),
                    ),
                    child: Stack(
                      children: [
                        Positioned.fill(
                          child: FractionallySizedBox(
                            alignment: Alignment.centerLeft,
                            widthFactor: share,
                            child: DecoratedBox(
                              decoration: BoxDecoration(color: (mine ? Colors.white : ChurchColors.wine).withValues(alpha: 0.14), borderRadius: BorderRadius.circular(10)),
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                          child: Row(
                            children: [
                              if (chosen) Padding(padding: const EdgeInsets.only(right: 6), child: Icon(Icons.check_circle_rounded, size: 16, color: fg)),
                              Expanded(child: Text(str(options[i]), style: TextStyle(fontSize: 14, color: fg))),
                              Text('$votes', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: fg)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          Text(total == 0 ? 'Голосов пока нет' : 'Голосов: $total', style: TextStyle(fontSize: 12, color: fg.withValues(alpha: 0.7))),
        ],
      ),
    );
  }
}
