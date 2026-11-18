import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../../../ui/kit/kit.dart';

/// Полоса букв справа: тянем пальцем — список прыгает к нужной букве.
class AlphaIndex extends StatefulWidget {
  const AlphaIndex({super.key, required this.letters, required this.onSelect});

  final List<String> letters;
  final ValueChanged<String> onSelect;

  @override
  State<AlphaIndex> createState() => _AlphaIndexState();
}

class _AlphaIndexState extends State<AlphaIndex> {
  String? _active;

  void _pick(double dy, double height) {
    if (widget.letters.isEmpty || height <= 0) return;
    final i = (dy / height * widget.letters.length).floor().clamp(0, widget.letters.length - 1);
    final letter = widget.letters[i];
    if (letter == _active) return;
    HapticFeedback.selectionClick();
    setState(() => _active = letter);
    widget.onSelect(letter);
  }

  void _end() => setState(() => _active = null);

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return LayoutBuilder(
      builder: (context, constraints) {
        final height = constraints.maxHeight;
        // Если букв больше, чем влезает, прореживаем, чтобы не слипались.
        final slot = height / widget.letters.length;
        final step = slot >= 14 ? 1 : (14 / slot).ceil();
        return Stack(
          clipBehavior: Clip.none,
          children: [
            // Указатель дублирует прокрутку, скринридеру он не нужен.
            ExcludeSemantics(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapDown: (d) => _pick(d.localPosition.dy, height),
                onTapUp: (_) => _end(),
                onTapCancel: _end,
                onVerticalDragStart: (d) => _pick(d.localPosition.dy, height),
                onVerticalDragUpdate: (d) => _pick(d.localPosition.dy, height),
                onVerticalDragEnd: (_) => _end(),
                onVerticalDragCancel: _end,
                child: SizedBox(
                  width: 26,
                  height: height,
                  child: Column(
                    children: [
                      for (var i = 0; i < widget.letters.length; i++)
                        Expanded(
                          child: Center(
                            child: (i % step == 0 || widget.letters[i] == _active)
                                ? Text(
                                    widget.letters[i],
                                    style: TextStyle(
                                      fontSize: 11,
                                      height: 1,
                                      fontWeight: FontWeight.w800,
                                      color: widget.letters[i] == _active ? palette.ink : palette.accent,
                                    ),
                                  )
                                : null,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            if (_active != null)
              Positioned(
                right: 44,
                top: (height / 2 - 34).clamp(0, double.infinity),
                child: IgnorePointer(
                  child: Container(
                    width: 68,
                    height: 68,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: ChurchColors.wine,
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: const [BoxShadow(color: Color(0x59000000), blurRadius: 24, offset: Offset(0, 8))],
                    ),
                    child: Text(_active!, style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w800, color: Colors.white)),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
