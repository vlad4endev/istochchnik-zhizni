import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';
import '../models/chat_models.dart';

/// Карточка ссылки под сообщением: картинка, сайт, заголовок и описание. Тап открывает адрес.
/// Пока карточка не пришла или у страницы нечего показать — места не занимает.
class LinkPreviewCard extends StatelessWidget {
  const LinkPreviewCard({super.key, required this.url, required this.load, required this.mine, required this.onOpen});

  final String url;
  final Future<LinkPreview?> Function(String url) load;
  final bool mine;
  final void Function(String url) onOpen;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<LinkPreview?>(
      future: load(url),
      builder: (context, snapshot) {
        final data = snapshot.data;
        if (data == null || !data.isUseful) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(top: 8),
          child: _Card(data: data, mine: mine, onTap: () => onOpen(data.url)),
        );
      },
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.data, required this.mine, required this.onTap});
  final LinkPreview data;
  final bool mine;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final fg = mine ? Colors.white : palette.ink;
    final bg = mine ? Colors.white.withValues(alpha: 0.12) : palette.ink.withValues(alpha: 0.05);
    return Semantics(
      link: true,
      label: 'Ссылка: ${data.title.isEmpty ? data.site : data.title}',
      excludeSemantics: true,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (data.image != null)
                Image.network(
                  data.image!,
                  height: 140,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => const SizedBox.shrink(),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.open_in_new_rounded, size: 13, color: fg.withValues(alpha: 0.7)),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            data.site.toUpperCase(),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.5, color: fg.withValues(alpha: 0.7)),
                          ),
                        ),
                      ],
                    ),
                    if (data.title.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(data.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, height: 1.25, color: fg)),
                    ],
                    if (data.description.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(data.description, maxLines: 3, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, height: 1.3, color: fg.withValues(alpha: 0.78))),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
