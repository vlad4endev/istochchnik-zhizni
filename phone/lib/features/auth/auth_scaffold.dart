import 'package:material_ui/material_ui.dart';

import '../../ui/kit/kit.dart';

/// Экран входа и регистрации: крупный заголовок на тёмном фоне и лист с формой.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({super.key, required this.title, required this.description, required this.children});

  final String title;
  final String description;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Scaffold(
      backgroundColor: ChurchColors.night,
      body: Stack(
        children: [
          const Positioned.fill(child: ChurchBackdrop()),
          SafeArea(
            bottom: false,
            child: CustomScrollView(
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(Space.xl, Space.sm, Space.xl, 28),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (Navigator.of(context).canPop())
                          TextButton.icon(
                            style: TextButton.styleFrom(
                              foregroundColor: Colors.white.withValues(alpha: 0.85),
                              padding: const EdgeInsets.symmetric(horizontal: 4),
                              minimumSize: const Size(44, 44),
                            ),
                            onPressed: () => Navigator.of(context).maybePop(),
                            icon: const Icon(Icons.chevron_left_rounded, size: 22),
                            label: const Text('Назад'),
                          ),
                        const SizedBox(height: Space.md),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const ChurchLogo(size: 60),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Semantics(
                                    header: true,
                                    child: Text(
                                      title,
                                      style: const TextStyle(
                                        fontSize: 28,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: -0.56,
                                        height: 1.1,
                                        color: Colors.white,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    description,
                                    style: const TextStyle(fontSize: 13, height: 1.4, color: Color(0xB8FFFFFF)),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: palette.sheet,
                      borderRadius: const BorderRadius.vertical(top: Radius.circular(Radii.sheet)),
                      boxShadow: const [BoxShadow(color: Color(0x59140408), offset: Offset(0, -18), blurRadius: 50)],
                    ),
                    child: SafeArea(
                      top: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(Space.xl, Space.xl, Space.xl, 30),
                        child: AutofillGroup(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: children,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
