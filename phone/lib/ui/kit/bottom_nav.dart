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

/// Тёмная полупрозрачная панель вкладок с янтарной «таблеткой» активного пункта.
class ChurchBottomNav extends StatelessWidget {
  const ChurchBottomNav({super.key, required this.items, required this.index, required this.onSelect});

  final List<NavItem> items;
  final int index;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 26, sigmaY: 26),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: ChurchColors.nightBar,
            border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.14))),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(6, 10, 6, 8),
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
    final label = item.badge > 0 ? '${item.label}, непрочитанных ${item.badge}' : item.label;
    return Semantics(
      selected: active,
      button: true,
      label: label,
      excludeSemantics: true,
      child: InkResponse(
        onTap: onTap,
        radius: 36,
        highlightColor: Colors.transparent,
        splashColor: Colors.white.withValues(alpha: 0.08),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                AnimatedContainer(
                  duration: Motion.normal,
                  curve: Curves.easeOut,
                  width: 58,
                  height: 30,
                  decoration: BoxDecoration(
                    color: active ? ChurchColors.amber : Colors.transparent,
                    borderRadius: BorderRadius.circular(15),
                  ),
                  child: Icon(
                    active ? item.activeIcon : item.icon,
                    size: 21,
                    color: active ? ChurchColors.amberInk : Colors.white.withValues(alpha: 0.74),
                  ),
                ),
                if (item.badge > 0)
                  Positioned(
                    top: -6,
                    right: 2,
                    child: CountBadge(item.badge, outline: const Color(0xFF2A0B15)),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              item.label,
              maxLines: 1,
              overflow: TextOverflow.fade,
              softWrap: false,
              style: TextStyle(
                fontSize: 11,
                fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                color: active ? Colors.white : Colors.white.withValues(alpha: 0.7),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
