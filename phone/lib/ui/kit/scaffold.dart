import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import 'tokens.dart';

/// Тёмный винный фон с двумя мягкими пятнами света, как в макете.
class ChurchBackdrop extends StatelessWidget {
  const ChurchBackdrop({super.key, this.color = ChurchColors.night, this.extraGlow = false});

  final Color color;

  /// Третье пятно ниже — для приветствия, входящего звонка и плеера.
  final bool extraGlow;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: color,
      child: Stack(
        fit: StackFit.expand,
        children: [
          const _Glow(left: -150, top: -190, size: 520, color: ChurchColors.wineBlob, opacity: 0.95),
          const _Glow(right: -170, top: -90, size: 380, color: ChurchColors.amberBlob, opacity: 0.36),
          if (extraGlow) ...[
            const _Glow(left: -140, top: 180, size: 380, color: Color(0xFFC2455F), opacity: 0.45),
            const _Glow(right: -160, top: 260, size: 400, color: ChurchColors.amberBlob, opacity: 0.38),
          ],
        ],
      ),
    );
  }
}

class _Glow extends StatelessWidget {
  const _Glow({this.left, this.right, required this.top, required this.size, required this.color, required this.opacity});

  final double? left;
  final double? right;
  final double top;
  final double size;
  final Color color;
  final double opacity;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: left,
      right: right,
      top: top,
      width: size,
      height: size,
      child: IgnorePointer(
        child: DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              colors: [
                color.withValues(alpha: opacity),
                color.withValues(alpha: opacity * 0.55),
                color.withValues(alpha: 0),
              ],
              stops: const [0, 0.45, 1],
            ),
          ),
        ),
      ),
    );
  }
}

/// Стеклянная кнопка в шапке (назад, добавить, фильтр).
class HeaderButton extends StatelessWidget {
  const HeaderButton({
    super.key,
    required this.icon,
    required this.onPressed,
    required this.tooltip,
    this.accent = false,
  });

  final IconData icon;
  final VoidCallback? onPressed;
  final String tooltip;

  /// Янтарная кнопка — главное действие шапки.
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        label: tooltip,
        child: Material(
          color: accent ? ChurchColors.amber : Colors.white.withValues(alpha: 0.14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(Radii.md),
            side: accent ? BorderSide.none : BorderSide(color: Colors.white.withValues(alpha: 0.22)),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onPressed,
            child: SizedBox(
              width: 44,
              height: 44,
              child: Icon(icon, size: 21, color: accent ? ChurchColors.amberInk : Colors.white),
            ),
          ),
        ),
      ),
    );
  }
}

/// Основной каркас экрана: тёмная шапка и кремовый лист со скруглением 30.
class ChurchPage extends StatelessWidget {
  const ChurchPage({
    super.key,
    required this.title,
    required this.body,
    this.subtitle,
    this.subtitleAccent,
    this.leading,
    this.actions = const [],
    this.floatingActionButton,
    this.bottom,
    this.showBack,
    this.sheetColor,
    this.headerExtra,
    this.onTitleTap,
  });

  final String title;
  final String? subtitle;

  /// Тап по аватару и названию в шапке — например, открыть профиль собеседника.
  final VoidCallback? onTitleTap;

  /// Выделенная янтарём часть подзаголовка, например «13 впереди».
  final String? subtitleAccent;
  final Widget body;

  /// Виджет слева от заголовка вместо кнопки «назад» (например, аватар).
  final Widget? leading;
  final List<Widget> actions;
  final Widget? floatingActionButton;

  /// Закреплённая снизу панель внутри листа — поле сообщения, кнопка действия.
  final Widget? bottom;
  final bool? showBack;
  final Color? sheetColor;

  /// Дополнительный блок под заголовком на тёмном фоне.
  final Widget? headerExtra;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final canPop = showBack ?? Navigator.of(context).canPop();
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: ChurchColors.night,
        // Вложенный Scaffold учитывает только клавиатуру и не знает о нижнем меню оболочки (extendBody):
        // без этого отступа кнопка «+» оказывалась под меню.
        floatingActionButton: floatingActionButton == null
            ? null
            : Padding(padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom), child: floatingActionButton),
        body: Stack(
          children: [
            const Positioned.fill(child: ChurchBackdrop()),
            Column(
              children: [
                SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(Space.lg, Space.sm, Space.lg, Space.md),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _Header(
                          title: title,
                          subtitle: subtitle,
                          subtitleAccent: subtitleAccent,
                          leading: leading,
                          canPop: canPop,
                          actions: actions,
                          onTitleTap: onTitleTap,
                        ),
                        ?headerExtra,
                      ],
                    ),
                  ),
                ),
                Expanded(
                  child: DecoratedBox(
                    decoration: const BoxDecoration(
                      borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.sheet)),
                      boxShadow: [BoxShadow(color: Color(0x59140408), offset: Offset(0, -18), blurRadius: 50)],
                    ),
                    child: ClipRRect(
                      borderRadius: const BorderRadius.vertical(top: Radius.circular(Radii.sheet)),
                      child: ColoredBox(
                        color: sheetColor ?? palette.sheet,
                        child: DefaultTextStyle.merge(
                          style: TextStyle(color: palette.ink, fontFamily: ChurchType.family),
                          child: Column(
                            children: [
                              Expanded(child: body),
                              ?bottom,
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.title,
    required this.subtitle,
    required this.subtitleAccent,
    required this.leading,
    required this.canPop,
    required this.actions,
    this.onTitleTap,
  });

  final VoidCallback? onTitleTap;
  final String title;
  final String? subtitle;
  final String? subtitleAccent;
  final Widget? leading;
  final bool canPop;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final compact = canPop || leading != null;
    final hasSubtitle = (subtitle ?? '').isNotEmpty || (subtitleAccent ?? '').isNotEmpty;
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 44),
      child: Row(
        children: [
          if (canPop) ...[
            HeaderButton(
              icon: Icons.chevron_left_rounded,
              tooltip: 'Назад',
              onPressed: () => Navigator.of(context).maybePop(),
            ),
            const SizedBox(width: Space.md),
          ],
          Expanded(
            child: _tappable(
              onTitleTap,
              Row(
                children: [
                  if (leading != null) ...[leading!, const SizedBox(width: Space.md)],
                  Expanded(
                    child: Semantics(
              header: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: compact ? ChurchType.headerTitle.copyWith(fontSize: 20) : ChurchType.headerTitle,
                  ),
                  if (hasSubtitle)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text.rich(
                        TextSpan(
                          children: [
                            if ((subtitle ?? '').isNotEmpty) TextSpan(text: subtitle),
                            if ((subtitle ?? '').isNotEmpty && (subtitleAccent ?? '').isNotEmpty)
                              const TextSpan(text: ' · '),
                            if ((subtitleAccent ?? '').isNotEmpty)
                              TextSpan(
                                text: subtitleAccent,
                                style: const TextStyle(color: ChurchColors.amber, fontWeight: FontWeight.w600),
                              ),
                          ],
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ChurchType.headerSubtitle,
                      ),
                    ),
                ],
              ),
            ),
                  ),
                ],
              ),
            ),
          ),
          for (final action in actions) ...[const SizedBox(width: Space.sm), action],
        ],
      ),
    );
  }
}

Widget _tappable(VoidCallback? onTap, Widget child) {
  if (onTap == null) return child;
  return Semantics(
    button: true,
    hint: 'Открыть профиль',
    child: InkWell(borderRadius: BorderRadius.circular(Radii.md), onTap: onTap, child: ConstrainedBox(constraints: const BoxConstraints(minHeight: 44), child: Align(alignment: Alignment.centerLeft, child: child))),
  );
}

/// Полностью тёмный экран: приветствие, заявка, звонок, плеер.
class DarkPage extends StatelessWidget {
  const DarkPage({super.key, required this.child, this.extraGlow = true, this.color = ChurchColors.nightDeep});

  final Widget child;
  final bool extraGlow;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: color,
        body: Stack(
          children: [
            Positioned.fill(child: ChurchBackdrop(color: color, extraGlow: extraGlow)),
            Positioned.fill(
              child: DefaultTextStyle.merge(
                style: const TextStyle(color: Colors.white, fontFamily: ChurchType.family),
                child: child,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
