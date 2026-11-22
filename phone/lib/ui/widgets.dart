import 'dart:async';

import '../core/http_cache.dart';
import 'package:material_ui/material_ui.dart';

import 'kit/components.dart';
import 'kit/tokens.dart';

/// Загрузка, ошибка или содержимое экрана — единый вид во всём приложении.
class AsyncBody extends StatelessWidget {
  const AsyncBody({
    super.key,
    required this.loading,
    required this.error,
    required this.child,
    this.onRetry,
  });

  final bool loading;
  final String? error;
  final Widget child;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    if (loading) return const LoadingView();
    if (error != null) return ErrorView(message: error!, onRetry: onRetry);
    return child;
  }
}

/// Индикатор загрузки. Появляется не сразу: если данные пришли за долю секунды
/// (например, из сохранённого), экран не мигает спиннером.
class LoadingView extends StatefulWidget {
  const LoadingView({super.key, this.delay = const Duration(milliseconds: 220)});

  final Duration delay;

  @override
  State<LoadingView> createState() => _LoadingViewState();
}

class _LoadingViewState extends State<LoadingView> {
  Timer? _timer;
  bool _shown = false;

  @override
  void initState() {
    super.initState();
    _timer = Timer(widget.delay, () {
      if (mounted) setState(() => _shown = true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      opacity: _shown ? 1 : 0,
      duration: const Duration(milliseconds: 180),
      child: Center(
        child: Semantics(
          label: 'Загрузка',
          child: SizedBox(
            width: 28,
            height: 28,
            child: CircularProgressIndicator(strokeWidth: 2.6, color: context.palette.accent),
          ),
        ),
      ),
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const IconTile(Icons.wifi_off_rounded, tone: Tone.red, size: 56, radius: 18),
            const SizedBox(height: 14),
            Text(
              'Не удалось загрузить',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: palette.ink),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, height: 1.45, color: palette.inkMuted),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 18),
              PrimaryButton(label: 'Повторить', icon: Icons.refresh_rounded, onPressed: onRetry, height: 48, expand: false),
            ],
          ],
        ),
      ),
    );
  }
}

/// Пустое состояние: иконка, заголовок и пояснение.
class EmptyHint extends StatelessWidget {
  const EmptyHint(this.text, {super.key, this.icon = Icons.inbox_outlined, this.hint, this.action});

  final String text;
  final IconData icon;
  final String? hint;

  /// Что можно сделать прямо отсюда: «Сбросить поиск», «Показать все».
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconTile(icon, tone: Tone.neutral, size: 56, radius: 18),
            const SizedBox(height: 14),
            Text(
              text,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: palette.ink),
            ),
            if ((hint ?? '').isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(hint!, textAlign: TextAlign.center, style: TextStyle(fontSize: 13.5, height: 1.4, color: palette.inkMuted)),
            ],
            if (action != null) ...[const SizedBox(height: 18), action!],
          ],
        ),
      ),
    );
  }
}

/// Отступ снизу у прокручиваемого листа, чтобы контент не прятался под панелью.
const sheetListPadding = EdgeInsets.fromLTRB(Space.lg, 18, Space.lg, 32);

/// Список-лист с пулл-ту-рефреш в фирменном цвете.
class SheetList extends StatelessWidget {
  const SheetList({super.key, required this.children, this.onRefresh, this.padding = sheetListPadding, this.gap = Space.md});

  final List<Widget> children;
  final Future<void> Function()? onRefresh;
  final EdgeInsets padding;
  final double gap;

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.paddingOf(context).bottom;
    final spaced = <Widget>[];
    for (var i = 0; i < children.length; i++) {
      if (i > 0) spaced.add(SizedBox(height: gap));
      spaced.add(children[i]);
    }
    final list = ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: padding.copyWith(bottom: padding.bottom + inset),
      children: spaced,
    );
    if (onRefresh == null) return list;
    return RefreshIndicator(
      color: context.palette.accent,
      backgroundColor: context.palette.card,
      // Потянули вниз — просим сервер, а не сохранённое.
      onRefresh: () => HttpCache.fresh(onRefresh!),
      child: list,
    );
  }
}

void showMessage(BuildContext context, String text) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));
}

Future<T?> pushPage<T>(BuildContext context, Widget page) {
  return Navigator.of(context).push<T>(MaterialPageRoute(builder: (_) => page));
}
