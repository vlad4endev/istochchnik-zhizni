import 'package:material_ui/material_ui.dart';

import 'tokens.dart';

/// Белая карточка листа: радиус 20 и мягкая винная тень.
class ChurchCard extends StatelessWidget {
  const ChurchCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(14),
    this.color,
    this.border,
    this.radius = Radii.card,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final Color? color;
  final BoxBorder? border;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final shape = BorderRadius.circular(radius);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color ?? palette.card,
        borderRadius: shape,
        boxShadow: palette.cardShadow,
        border: border ?? (palette.isDark ? Border.all(color: palette.hairline) : null),
      ),
      child: Material(
        type: MaterialType.transparency,
        borderRadius: shape,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

/// Подпись раздела: «ДНИ РОЖДЕНИЯ», «ДЛЯ АДМИНИСТРАТОРОВ».
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.trailing, this.padding = const EdgeInsets.fromLTRB(4, 8, 4, 0)});

  final String text;
  final Widget? trailing;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              header: true,
              child: Text(text.toUpperCase(), style: ChurchType.sectionLabel.copyWith(color: context.palette.accent)),
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// Квадратная плитка с иконкой в пастельном тоне.
class IconTile extends StatelessWidget {
  const IconTile(this.icon, {super.key, this.tone = Tone.wine, this.size = 42, this.radius = Radii.md, this.iconSize});

  final IconData icon;
  final Tone tone;
  final double size;
  final double radius;
  final double? iconSize;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: tone.bg(palette), borderRadius: BorderRadius.circular(radius)),
      alignment: Alignment.center,
      child: Icon(icon, size: iconSize ?? size * 0.5, color: tone.fg(palette)),
    );
  }
}

/// Логотип церкви: обложка подкаста и проповеди, знак на входе, аватар канала.
class ChurchLogo extends StatelessWidget {
  const ChurchLogo({super.key, this.size = 46, this.circle = false});

  final double size;

  /// Круглый вариант для списков с круглыми аватарами.
  final bool circle;

  @override
  Widget build(BuildContext context) {
    final image = Image.asset(
      circle ? 'assets/images/logo-square.png' : 'assets/images/logo.png',
      width: size,
      height: size,
      fit: BoxFit.cover,
      filterQuality: FilterQuality.medium,
      semanticLabel: 'Логотип церкви',
    );
    return circle ? ClipOval(child: image) : image;
  }
}

/// Карточка-группа строк с тонкими разделителями.
class ListGroup extends StatelessWidget {
  const ListGroup({super.key, required this.children, this.dividerIndent = 70});

  final List<Widget> children;
  final double dividerIndent;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final items = <Widget>[];
    for (var i = 0; i < children.length; i++) {
      if (i > 0) {
        items.add(Padding(
          padding: EdgeInsetsDirectional.only(start: dividerIndent, end: 14),
          child: Divider(height: 1, color: palette.hairline),
        ));
      }
      items.add(children[i]);
    }
    return ChurchCard(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Column(mainAxisSize: MainAxisSize.min, children: items),
    );
  }
}

/// Строка списка: плитка или аватар, заголовок, подзаголовок и хвост.
class ListRow extends StatelessWidget {
  const ListRow({
    super.key,
    required this.title,
    this.subtitle,
    this.subtitleWidget,
    this.leading,
    this.trailing,
    this.meta,
    this.onTap,
    this.chevron,
    this.titleColor,
    this.subtitleMaxLines = 1,
    this.padding = const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
  });

  final String title;
  final String? subtitle;

  /// Своё содержимое вместо строки подзаголовка (например, текст с подсветкой найденных слов).
  final Widget? subtitleWidget;
  final Widget? leading;
  final Widget? trailing;

  /// Мелкий текст справа от заголовка — время, дата.
  final String? meta;
  final VoidCallback? onTap;
  final bool? chevron;
  final Color? titleColor;
  final int subtitleMaxLines;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final showChevron = chevron ?? (onTap != null && trailing == null);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: padding,
        child: Row(
          children: [
            if (leading != null) ...[leading!, const SizedBox(width: Space.md)],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: ChurchType.title.copyWith(color: titleColor ?? palette.ink),
                        ),
                      ),
                      if ((meta ?? '').isNotEmpty) ...[
                        const SizedBox(width: Space.sm),
                        Text(meta!, style: TextStyle(fontSize: 12, color: palette.inkFaint)),
                      ],
                    ],
                  ),
                  if (subtitleWidget != null)
                    Padding(padding: const EdgeInsets.only(top: 4), child: subtitleWidget)
                  else if ((subtitle ?? '').isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        subtitle!,
                        maxLines: subtitleMaxLines,
                        overflow: TextOverflow.ellipsis,
                        style: ChurchType.caption.copyWith(color: palette.inkMuted, fontSize: 13),
                      ),
                    ),
                ],
              ),
            ),
            if (trailing != null) ...[
              const SizedBox(width: Space.sm),
              ConstrainedBox(
                constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.4),
                child: trailing!,
              ),
            ],
            if (showChevron) ...[
              const SizedBox(width: Space.xs),
              Icon(Icons.chevron_right_rounded, color: palette.chevron, size: 22),
            ],
          ],
        ),
      ),
    );
  }
}

/// Плитка раздела: иконка сверху, подпись снизу.
class FeatureTile extends StatelessWidget {
  const FeatureTile({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.tone = Tone.wine,
    this.badge,
    this.centered = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Tone tone;
  final String? badge;
  final bool centered;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: ChurchCard(
        onTap: onTap,
        padding: centered ? const EdgeInsets.fromLTRB(4, 14, 4, 12) : const EdgeInsets.fromLTRB(12, 14, 12, 12),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            SizedBox(
              width: double.infinity,
              child: Column(
                crossAxisAlignment: centered ? CrossAxisAlignment.center : CrossAxisAlignment.start,
                children: [
                  IconTile(icon, tone: tone),
                  const SizedBox(height: 10),
                  _TileLabel(label: label, centered: centered, color: palette.ink),
                ],
              ),
            ),
            if ((badge ?? '').isNotEmpty) Positioned(top: -6, right: -4, child: StatusPill(badge!)),
          ],
        ),
      ),
    );
  }
}

/// Подпись плитки: длинное одно слово ужимается, а не рвётся посередине.
class _TileLabel extends StatelessWidget {
  const _TileLabel({required this.label, required this.centered, required this.color});

  final String label;
  final bool centered;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final text = Text(
      label,
      maxLines: 2,
      softWrap: label.contains(' '),
      textAlign: centered ? TextAlign.center : TextAlign.start,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        fontSize: centered ? 12.5 : 14,
        fontWeight: centered ? FontWeight.w600 : FontWeight.w700,
        height: 1.2,
        color: color,
      ),
    );
    if (label.contains(' ')) return text;
    return FittedBox(
      fit: BoxFit.scaleDown,
      alignment: centered ? Alignment.center : Alignment.centerLeft,
      child: text,
    );
  }
}

/// Сетка плиток по N в ряд одинаковой высоты.
class TileGrid extends StatelessWidget {
  const TileGrid({super.key, required this.children, this.columns = 3});

  final List<Widget> children;
  final int columns;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var i = 0; i < children.length; i += columns) {
      final slice = children.sublist(i, (i + columns).clamp(0, children.length));
      rows.add(IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var j = 0; j < columns; j++) ...[
              if (j > 0) const SizedBox(width: 10),
              Expanded(child: j < slice.length ? slice[j] : const SizedBox.shrink()),
            ],
          ],
        ),
      ));
    }
    return Column(
      children: [
        for (var i = 0; i < rows.length; i++) ...[if (i > 0) const SizedBox(height: 10), rows[i]],
      ],
    );
  }
}

/// Маленький бейдж-статус: «Регистрация», «Черновик», «LIVE».
class StatusPill extends StatelessWidget {
  const StatusPill(this.text, {super.key, this.tone, this.solid = false});

  final String text;
  final Tone? tone;

  /// Залитый винный бейдж («Ближайшая»).
  final bool solid;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final bg = solid ? ChurchColors.wine : (tone?.bg(palette) ?? palette.accentSoft);
    final fg = solid ? Colors.white : (tone?.text(palette) ?? palette.accent);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Text(
        text,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        softWrap: false,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.4, color: fg, height: 1.1),
      ),
    );
  }
}

/// Главная кнопка: винный градиент, радиус 18, тень.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.busy = false,
    this.height = 54,
    this.expand = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool busy;
  final double height;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !busy;
    final radius = BorderRadius.circular(height >= 54 ? Radii.card : Radii.xl);
    final content = Row(
      mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (busy)
          const SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
          )
        else if (icon != null)
          Icon(icon, size: 20, color: Colors.white),
        if (busy || icon != null) const SizedBox(width: 10),
        Flexible(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: height >= 54 ? 16.5 : 15.5, fontWeight: FontWeight.w700, color: Colors.white),
          ),
        ),
      ],
    );
    return Semantics(
      button: true,
      enabled: enabled,
      label: label,
      excludeSemantics: true,
      child: AnimatedOpacity(
        duration: Motion.fast,
        opacity: enabled || busy ? 1 : 0.5,
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: wineGradient,
            borderRadius: radius,
            boxShadow: enabled
                ? const [BoxShadow(color: Color(0x595A1826), offset: Offset(0, 14), blurRadius: 28, spreadRadius: -6)]
                : null,
          ),
          child: Material(
            type: MaterialType.transparency,
            borderRadius: radius,
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: enabled ? onPressed : null,
              child: SizedBox(
                height: height,
                child: Padding(padding: const EdgeInsets.symmetric(horizontal: 18), child: content),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Вторичная кнопка: светлая с тонкой обводкой, винный текст.
class SecondaryButton extends StatelessWidget {
  const SecondaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.height = 50,
    this.danger = false,
    this.expand = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final double height;
  final bool danger;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final color = danger ? ChurchColors.danger : palette.accent;
    return Semantics(
      button: true,
      enabled: onPressed != null,
      label: label,
      excludeSemantics: true,
      child: Opacity(
        opacity: onPressed == null ? 0.5 : 1,
        child: Material(
          color: palette.card,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(Radii.lg),
            side: BorderSide(color: palette.outline),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onPressed,
            child: SizedBox(
              height: height,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(
                  mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (icon != null) ...[Icon(icon, size: 18, color: color), const SizedBox(width: 8)],
                    Flexible(
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: color),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Круглая винная кнопка «+» в правом нижнем углу.
class ChurchFab extends StatelessWidget {
  const ChurchFab({super.key, required this.onPressed, required this.tooltip, this.icon = Icons.add_rounded});

  final VoidCallback onPressed;
  final String tooltip;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        label: tooltip,
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [Color(0xFFC0304F), ChurchColors.wine]),
            borderRadius: BorderRadius.circular(Radii.card),
            boxShadow: const [BoxShadow(color: Color(0x668A2742), offset: Offset(0, 12), blurRadius: 24, spreadRadius: -4)],
          ),
          child: Material(
            type: MaterialType.transparency,
            borderRadius: BorderRadius.circular(Radii.card),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onPressed,
              child: SizedBox(width: 58, height: 58, child: Icon(icon, color: Colors.white, size: 28)),
            ),
          ),
        ),
      ),
    );
  }
}

/// Сегменты-«таблетки» в белой подложке: «Вход / Регистрация», «Медиа / Музыка».
class SegmentedPills<T> extends StatelessWidget {
  const SegmentedPills({super.key, required this.segments, required this.selected, required this.onChanged});

  final List<(T, String)> segments;
  final T selected;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(Radii.xl),
        border: Border.all(color: palette.hairline),
      ),
      child: Row(
        children: [
          for (final (value, label) in segments) ...[
            if (value != segments.first.$1) const SizedBox(width: 4),
            Expanded(
              child: Semantics(
                selected: value == selected,
                button: true,
                label: label,
                excludeSemantics: true,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onChanged(value),
                  child: AnimatedContainer(
                    duration: Motion.normal,
                    curve: Curves.easeOut,
                    height: 44,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      gradient: value == selected ? wineGradient : null,
                      borderRadius: BorderRadius.circular(Radii.md),
                      boxShadow: value == selected
                          ? const [BoxShadow(color: Color(0x405A1826), offset: Offset(0, 8), blurRadius: 16, spreadRadius: -4)]
                          : null,
                    ),
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                        color: value == selected ? Colors.white : palette.ink,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Горизонтальные фильтры-чипы со счётчиками.
class FilterChips<T> extends StatelessWidget {
  const FilterChips({super.key, required this.items, required this.selected, required this.onChanged, this.padding});

  final List<(T, String, int?)> items;
  final T selected;
  final ValueChanged<T> onChanged;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: padding,
        clipBehavior: Clip.none,
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(width: Space.sm),
        itemBuilder: (context, index) {
          final (value, label, count) = items[index];
          final active = value == selected;
          return Semantics(
            selected: active,
            button: true,
            child: GestureDetector(
              onTap: () => onChanged(value),
              child: AnimatedContainer(
                duration: Motion.normal,
                curve: Curves.easeOut,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  gradient: active ? wineGradient : null,
                  color: active ? null : palette.card,
                  borderRadius: BorderRadius.circular(22),
                  border: active ? null : Border.all(color: palette.outline),
                ),
                child: Text.rich(
                  TextSpan(
                    text: label,
                    children: [
                      if (count != null)
                        TextSpan(
                          text: '  $count',
                          style: TextStyle(color: (active ? Colors.white : palette.ink).withValues(alpha: 0.65)),
                        ),
                    ],
                  ),
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: active ? Colors.white : palette.ink),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Поле поиска: белая плашка с лупой.
class ChurchSearchField extends StatelessWidget {
  const ChurchSearchField({
    super.key,
    required this.controller,
    required this.hint,
    this.onChanged,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String hint;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return TextField(
      controller: controller,
      onChanged: onChanged,
      onSubmitted: onSubmitted,
      textInputAction: TextInputAction.search,
      style: TextStyle(fontSize: 15.5, color: palette.ink),
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: Icon(Icons.search_rounded, color: palette.inkFaint),
        contentPadding: const EdgeInsets.symmetric(vertical: 13),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.lg), borderSide: BorderSide(color: palette.hairline)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(Radii.lg),
          borderSide: BorderSide(color: palette.hairline),
        ),
      ),
    );
  }
}

/// Поле формы с подписью сверху, как в макете входа.
class LabeledField extends StatelessWidget {
  const LabeledField({
    super.key,
    required this.label,
    required this.controller,
    this.hint,
    this.note,
    this.keyboardType,
    this.obscureText = false,
    this.suffix,
    this.onChanged,
    this.onSubmitted,
    this.minLines,
    this.maxLines = 1,
    this.textInputAction,
    this.autofillHints,
    this.textCapitalization = TextCapitalization.none,
    this.autofocus = false,
  });

  final String label;

  /// Сразу поставить курсор в поле (переход «Моя нужда» → профиль).
  final bool autofocus;

  /// Пояснение рядом с подписью, светлее основного текста.
  final String? note;
  final TextEditingController controller;
  final String? hint;
  final TextInputType? keyboardType;
  final bool obscureText;
  final Widget? suffix;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final int? minLines;
  final int? maxLines;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final TextCapitalization textCapitalization;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 2, bottom: 6),
          child: Text.rich(
            TextSpan(
              text: label,
              children: [
                if ((note ?? '').isNotEmpty)
                  TextSpan(text: ' $note', style: TextStyle(fontWeight: FontWeight.w500, color: palette.inkFaint)),
              ],
            ),
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: palette.ink),
          ),
        ),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          obscureText: obscureText,
          onChanged: onChanged,
          onSubmitted: onSubmitted,
          minLines: minLines,
          maxLines: obscureText ? 1 : maxLines,
          textInputAction: textInputAction,
          autofillHints: autofillHints,
          textCapitalization: textCapitalization,
          autofocus: autofocus,
          style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w500, color: palette.ink),
          decoration: InputDecoration(hintText: hint, suffixIcon: suffix),
        ),
      ],
    );
  }
}

/// Плашка с пояснением или ошибкой формы.
class InfoBanner extends StatelessWidget {
  const InfoBanner(this.text, {super.key, this.error = false});

  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final tone = error ? Tone.red : Tone.wine;
    return Semantics(
      liveRegion: error,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: tone.bg(palette), borderRadius: BorderRadius.circular(Radii.lg)),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(error ? Icons.error_outline_rounded : Icons.info_outline_rounded, size: 18, color: tone.fg(palette)),
            const SizedBox(width: 10),
            Expanded(
              child: Text(text, style: TextStyle(fontSize: 13, height: 1.4, color: error ? tone.fg(palette) : palette.inkMuted)),
            ),
          ],
        ),
      ),
    );
  }
}

const _avatarGradients = <List<Color>>[
  [Color(0xFFE9A24F), Color(0xFFC0792E)],
  [Color(0xFF7B2A3E), Color(0xFF4A1224)],
  [Color(0xFF3FAE7A), Color(0xFF1E7A4C)],
  [Color(0xFF8E44AD), Color(0xFF5E2B7A)],
  [Color(0xFF2E4A6E), Color(0xFF0F1D33)],
  [Color(0xFFB8862E), Color(0xFF8A6118)],
  [Color(0xFFD0476A), Color(0xFF8A1E36)],
  [Color(0xFF2A9D96), Color(0xFF12756F)],
];

String initialsOf(String name) {
  final parts = name
      .replaceAll(RegExp(r'[^\p{L}\p{N}\s]', unicode: true), ' ')
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return (parts[0].substring(0, 1) + parts[1].substring(0, 1)).toUpperCase();
}

/// Круглый аватар: фото или инициалы на градиенте, стабильном для имени.
class ChurchAvatar extends StatelessWidget {
  const ChurchAvatar({super.key, required this.name, this.imageUrl, this.size = 46, this.ring = false});

  final String name;
  final String? imageUrl;
  final double size;

  /// Кольцо как у сторис и большого аватара профиля.
  final bool ring;

  @override
  Widget build(BuildContext context) {
    final colors = _avatarGradients[name.hashCode.abs() % _avatarGradients.length];
    final url = (imageUrl ?? '').trim();
    Widget avatar = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: colors),
      ),
      clipBehavior: Clip.antiAlias,
      alignment: Alignment.center,
      child: url.isEmpty
          ? Text(
              initialsOf(name),
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: size * 0.33),
            )
          : Image.network(
              url,
              width: size,
              height: size,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => Text(
                initialsOf(name),
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: size * 0.33),
              ),
            ),
    );
    if (ring) {
      avatar = Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: ChurchColors.amber, width: 2),
        ),
        child: avatar,
      );
    }
    return Semantics(label: name, image: true, excludeSemantics: true, child: avatar);
  }
}

/// Счётчик непрочитанного.
class CountBadge extends StatelessWidget {
  const CountBadge(this.count, {super.key, this.outline});

  final int count;
  final Color? outline;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return const SizedBox.shrink();
    return Container(
      constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
      padding: const EdgeInsets.symmetric(horizontal: 5),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: ChurchColors.badge,
        borderRadius: BorderRadius.circular(9),
        border: outline == null ? null : Border.all(color: outline!, width: 2),
      ),
      child: Text(
        count > 99 ? '99+' : '$count',
        style: const TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w700, height: 1.1),
      ),
    );
  }
}

/// Плашка-дата «ВС / 18» для мероприятий и служений.
class DateBadge extends StatelessWidget {
  const DateBadge({super.key, required this.date, this.size = 52});

  final DateTime date;
  final double size;

  static const _weekdays = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF6C1E32), ChurchColors.wineDeep],
        ),
        borderRadius: BorderRadius.circular(Radii.md),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            _weekdays[date.weekday - 1],
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: Color(0xCCFFFFFF)),
          ),
          Text(
            '${date.day}',
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white, height: 1.05),
          ),
        ],
      ),
    );
  }
}

/// Цитата Писания: Playfair Italic на мятной плашке.
class ScriptureQuote extends StatelessWidget {
  const ScriptureQuote(this.text, {super.key, this.reference});

  final String text;
  final String? reference;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: palette.isDark ? const Color(0x2212756F) : const Color(0xFFEAF5F1),
        borderRadius: BorderRadius.circular(Radii.md),
        border: Border.all(color: Tone.teal.fg(palette).withValues(alpha: 0.25)),
      ),
      child: Text.rich(
        TextSpan(
          children: [
            if ((reference ?? '').isNotEmpty) TextSpan(text: '$reference: '),
            TextSpan(text: text),
          ],
        ),
        style: ChurchType.serifTitle.copyWith(fontSize: 15, color: Tone.teal.fg(palette), height: 1.45),
      ),
    );
  }
}
