import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/session.dart';
import '../../ui/kit/kit.dart';

class PendingPage extends StatefulWidget {
  const PendingPage({super.key});

  @override
  State<PendingPage> createState() => _PendingPageState();
}

class _PendingPageState extends State<PendingPage> {
  bool _checking = false;

  Future<void> _check() async {
    setState(() => _checking = true);
    await context.read<SessionController>().refreshProfile();
    if (mounted) setState(() => _checking = false);
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<SessionController>().user;
    final rejected = user?.registrationStatus == 'rejected';
    return DarkPage(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
          child: Column(
            children: [
              const Spacer(),
              Container(
                width: 92,
                height: 92,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.08),
                  border: Border.all(color: ChurchColors.amber.withValues(alpha: 0.35)),
                  boxShadow: [BoxShadow(color: ChurchColors.amber.withValues(alpha: 0.18), blurRadius: 40)],
                ),
                child: Icon(
                  rejected ? Icons.block_rounded : Icons.schedule_rounded,
                  color: ChurchColors.amber,
                  size: 40,
                ),
              ),
              const SizedBox(height: 24),
              Semantics(
                header: true,
                child: Text(
                  rejected ? 'Доступ не открыт' : 'Заявка на проверке',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.4),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                rejected
                    ? 'Администратор отклонил заявку. Напишите церкви, чтобы уточнить данные, и подайте её снова.'
                    : 'Мы сверяем ваши данные с карточкой участника церкви. Как только администратор одобрит заявку, приложение откроется само.',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 15, height: 1.5, color: Color(0xC7FFFFFF)),
              ),
              const Spacer(),
              Material(
                color: ChurchColors.creamButton,
                borderRadius: BorderRadius.circular(Radii.card),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: _checking ? null : _check,
                  child: SizedBox(
                    height: 56,
                    child: Center(
                      child: _checking
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2.2, color: ChurchColors.amberInk),
                            )
                          : const Text(
                              'Проверить статус',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: ChurchColors.amberInk),
                            ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Material(
                color: Colors.white.withValues(alpha: 0.06),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(Radii.card),
                  side: BorderSide(color: Colors.white.withValues(alpha: 0.3), width: 1.5),
                ),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () => context.read<SessionController>().logout(),
                  child: const SizedBox(
                    height: 54,
                    child: Center(
                      child: Text('Выйти', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white)),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
