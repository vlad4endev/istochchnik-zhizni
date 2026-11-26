import 'package:material_ui/material_ui.dart';

import '../../../core/nav.dart';
import '../../../ui/kit/kit.dart';
import '../call_controller.dart';
import '../call_page.dart';
import '../logic/call_layout.dart';

/// Возвращает на экран идущего звонка.
void openCurrentCall() {
  final controller = CallCenter.instance.current;
  final nav = navigatorKey.currentState;
  if (controller == null || controller.ended || nav == null) return;
  nav.push(MaterialPageRoute<void>(builder: (_) => CallPage(controller: controller)));
}

/// Оборачивает всё приложение: пока идёт звонок, а его экран свёрнут, сверху — зелёная плашка
/// «Идёт звонок · вернуться». Видна на любом экране: в чатах, на вкладках, в любом разделе.
class CallBannerHost extends StatefulWidget {
  const CallBannerHost({super.key, required this.child, this.center, this.onOpen});

  final Widget child;

  /// Для тестов; в приложении — общий [CallCenter].
  final CallCenter? center;
  final VoidCallback? onOpen;

  @override
  State<CallBannerHost> createState() => _CallBannerHostState();
}

class _CallBannerHostState extends State<CallBannerHost> {
  CallCenter get _center => widget.center ?? CallCenter.instance;

  @override
  void initState() {
    super.initState();
    _center.addListener(_onCenter);
  }

  @override
  void didUpdateWidget(CallBannerHost old) {
    super.didUpdateWidget(old);
    if ((old.center ?? CallCenter.instance) != _center) {
      (old.center ?? CallCenter.instance).removeListener(_onCenter);
      _center.addListener(_onCenter);
    }
  }

  @override
  void dispose() {
    _center.removeListener(_onCenter);
    super.dispose();
  }

  /// Звонок закончился сам, пока экран был свёрнут, — говорим почему, иначе плашка просто исчезла бы.
  void _onCenter() {
    final notice = _center.takeEndedNotice();
    if (notice == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(notice)));
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _center,
      builder: (context, _) {
        final call = _center.current;
        final show = call != null && call.minimized;
        final reduce = MediaQuery.disableAnimationsOf(context);
        // Структура дерева не меняется, показывается плашка или нет: иначе пересоздался бы Navigator и экраны потеряли бы состояние.
        return Column(
          children: [
            AnimatedSize(
              duration: reduce ? Duration.zero : const Duration(milliseconds: 180),
              curve: Curves.easeOut,
              alignment: Alignment.topCenter,
              child: SizedBox(
                width: double.infinity,
                child: show ? ActiveCallBar(controller: call, onTap: widget.onOpen ?? openCurrentCall) : null,
              ),
            ),
            Expanded(
              // Плашка уже заняла место под строкой состояния — экранам под ней свой отступ сверху не нужен.
              child: MediaQuery.removePadding(context: context, removeTop: show, child: widget.child),
            ),
          ],
        );
      },
    );
  }
}

/// Сама плашка: что за звонок, сколько идёт, куда нажать.
class ActiveCallBar extends StatelessWidget {
  const ActiveCallBar({super.key, required this.controller, required this.onTap});

  final CallController controller;
  final VoidCallback onTap;

  String _subtitle() {
    if (!controller.joined) return 'Подключаемся…';
    final since = controller.peerSince ?? controller.joinedAt;
    final time = since == null ? '' : callTimer(DateTime.now().difference(since));
    return time.isEmpty ? 'Нажмите, чтобы вернуться' : '$time · нажмите, чтобы вернуться';
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final top = media.padding.top;
    final title = controller.screenTitle;
    final kind = controller.spec.isMeeting ? (controller.spec.videoCall ? 'Видеовстреча' : 'Аудиовстреча') : (controller.spec.videoCall ? 'Видеозвонок' : 'Звонок');
    return Semantics(
      button: true,
      label: 'Идёт звонок: $title. Нажмите, чтобы вернуться',
      excludeSemantics: true,
      child: Material(
        color: ChurchColors.success,
        child: InkWell(
          key: const ValueKey('call-banner'),
          onTap: onTap,
          child: MediaQuery(
            // Плашка не должна распухать от крупного системного шрифта.
            data: media.copyWith(textScaler: media.textScaler.clamp(maxScaleFactor: 1.25)),
            child: Padding(
              padding: EdgeInsets.fromLTRB(16, top + 6, 8, 8),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 44),
                child: Row(
                  children: [
                    Icon(controller.spec.videoCall ? Icons.videocam_rounded : Icons.call_rounded, size: 22, color: Colors.white),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('$kind · $title', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: Colors.white)),
                          Text(_subtitle(), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: Color(0xE6FFFFFF))),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right_rounded, color: Colors.white, size: 26),
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

/// Перед началом нового звонка или входом во встречу: если уже идёт другой звонок, спрашиваем,
/// а не обрываем его молча. true — можно начинать; false — человек вернулся к текущему звонку или передумал.
Future<bool> confirmStartNewCall(BuildContext context, {CallCenter? center, VoidCallback? onReturn}) async {
  final call = (center ?? CallCenter.instance).current;
  if (call == null || call.ended) return true;
  final choice = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Сейчас идёт звонок'),
      content: Text('«${call.screenTitle}». Чтобы начать другой, этот придётся завершить.'),
      actions: [
        TextButton(key: const ValueKey('call-return'), onPressed: () => Navigator.pop(context, false), child: const Text('Вернуться к звонку')),
        TextButton(key: const ValueKey('call-replace'), onPressed: () => Navigator.pop(context, true), child: const Text('Завершить и начать')),
      ],
    ),
  );
  if (choice == true) return true;
  if (choice == false) (onReturn ?? openCurrentCall)();
  return false;
}
