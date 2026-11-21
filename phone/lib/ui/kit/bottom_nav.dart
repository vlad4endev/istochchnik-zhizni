import 'dart:ui';

import 'package:material_ui/material_ui.dart';

import 'components.dart';
import 'tokens.dart';

class NavItem {
  const NavItem({required this.label, required this.icon, required this.activeIcon, this.badge = 0});

  final String label;
  final IconData icon;
  final IconData activeIcon;
  final int badge;
}

/// Полупрозрачная панель вкладок на всю ширину, как в iOS: размытый фон, тонкая линия сверху,
/// контент страницы виден и прокручивается под ней. Активная вкладка — тонированная плашка.
class ChurchBottomNav extends StatelessWidget {
  const ChurchBottomNav({super.key, required this.items, required this.index, required this.onSelect});

  final List<NavItem> items;
  final int index;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    // Подписи вкладок не должны ломать панель при крупном системном шрифте.
    final media = MediaQuery.of(context);
    return MediaQuery(
      data: media.copyWith(textScaler: media.textScaler.clamp(maxScaleFactor: 1.25)),
      child: ClipRect(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 28, sigmaY: 28),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: palette.sheet.withValues(alpha: palette.isDark ? 0.74 : 0.78),
              border: Border(top: BorderSide(color: palette.hairline)),
            ),
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 6, 8, 4),
                child: Row(
                  children: [
                    for (var i = 0; i < items.length; i++)
                      Expanded(child: _NavButton(item: items[i], active: i == index, onTap: () => onSelect(i))),
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

class _NavButton extends StatelessWidget {
  const _NavButton({required this.item, required this.active, required this.onTap});

  final NavItem item;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final label = item.badge > 0 ? '${item.label}, непрочитанных ${item.badge}' : item.label;
    final color = active ? palette.accent : palette.inkMuted;
    return Semantics(
      selected: active,
      button: true,
      label: label,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(28),
        highlightColor: Colors.transparent,
        splashColor: palette.accent.withValues(alpha: 0.08),
        child: AnimatedContainer(
          duration: Motion.normal,
          curve: Curves.easeOut,
          constraints: const BoxConstraints(minHeight: 52),
          padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 2),
          decoration: BoxDecoration(
            color: active ? palette.accentSoft.withValues(alpha: 0.9) : Colors.transparent,
            borderRadius: BorderRadius.circular(28),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Icon(item.icon, size: 26, color: color),
                  if (item.badge > 0)
                    Positioned(
                      top: -7,
                      right: -12,
                      child: CountBadge(item.badge, outline: palette.sheet),
                    ),
                ],
              ),
              const SizedBox(height: 3),
              Text(
                item.label,
                maxLines: 1,
                overflow: TextOverflow.fade,
                softWrap: false,
                style: TextStyle(fontSize: 12, fontWeight: active ? FontWeight.w700 : FontWeight.w500, color: color),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
