import 'package:material_ui/material_ui.dart';

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
    if (loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(error!, textAlign: TextAlign.center),
              if (onRetry != null) ...[
                const SizedBox(height: 12),
                FilledButton(onPressed: onRetry, child: const Text('Повторить')),
              ],
            ],
          ),
        ),
      );
    }
    return child;
  }
}

class EmptyHint extends StatelessWidget {
  const EmptyHint(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
      ),
    );
  }
}

Future<T?> pushPage<T>(BuildContext context, Widget page) {
  return Navigator.of(context).push<T>(MaterialPageRoute(builder: (_) => page));
}
