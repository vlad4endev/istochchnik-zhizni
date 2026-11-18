import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';

/// Чип-переключатель со счётчиком. Нажатая зона не меньше 44 px по высоте.
class ToggleChip extends StatelessWidget {
  const ToggleChip({super.key, required this.label, required this.selected, required this.onTap, this.count, this.icon});

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final int? count;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final fg = selected ? Colors.white : palette.ink;
    return Semantics(
      button: true,
      selected: selected,
      label: count == null ? label : '$label, $count',
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44),
          child: Center(
            widthFactor: 1,
            child: AnimatedContainer(
              duration: Motion.normal,
              curve: Curves.easeOut,
              height: 38,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                gradient: selected ? wineGradient : null,
                color: selected ? null : palette.card,
                borderRadius: BorderRadius.circular(19),
                border: selected ? null : Border.all(color: palette.outline),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon != null) ...[Icon(icon, size: 16, color: selected ? Colors.white : const Color(0xFFD6385B)), const SizedBox(width: 6)],
                  Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: fg)),
                  if (count != null) ...[
                    const SizedBox(width: 6),
                    Text('$count', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: fg.withValues(alpha: 0.65))),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
