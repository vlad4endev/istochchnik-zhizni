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

/// Плавающая «таблетка» вкладок: светлая карточка с мягкой тенью,
/// активный пункт подсвечен скруглённой плашкой в фирменном цвете.
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
      // Фон под панелью совпадает с листом страницы, поэтому «парит» только сама таблетка.
      child: ColoredBox(
        color: palette.sheet,
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 6, 14, 10),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: palette.card,
                borderRadius: BorderRadius.circular(34),
                border: Border.all(color: palette.hairline),
                boxShadow: [BoxShadow(color: palette.shadow.withValues(alpha: 0.18), blurRadius: 24, offset: const Offset(0, 8))],
              ),
              child: Padding(
                padding: const EdgeInsets.all(6),
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
          constraints: const BoxConstraints(minHeight: 56),
          padding: const EdgeInsets.symmetric(vertical: 7, horizontal: 2),
          decoration: BoxDecoration(
            color: active ? palette.accentSoft : Colors.transparent,
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
                      child: CountBadge(item.badge, outline: active ? palette.accentSoft : palette.card),
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
