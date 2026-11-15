import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/session.dart';

class PendingPage extends StatelessWidget {
  const PendingPage({super.key});

  @override
  Widget build(BuildContext context) {
    final user = context.watch<SessionController>().user;
    final rejected = user?.registrationStatus == 'rejected';
    return Scaffold(
      appBar: AppBar(title: const Text('Источник жизни')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              rejected ? 'Доступ не открыт' : 'Заявка на рассмотрении',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 12),
            Text(
              rejected
                  ? 'Администратор отклонил заявку. Можно написать церкви и подать её снова.'
                  : 'Пока администратор подтверждает регистрацию, полный доступ к разделам закрыт. Когда заявку одобрят, приложение откроется само.',
            ),
            const Spacer(),
            FilledButton(
              onPressed: () => context.read<SessionController>().refreshProfile(),
              child: const Text('Проверить статус'),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => context.read<SessionController>().logout(),
              child: const Text('Выйти'),
            ),
          ],
        ),
      ),
    );
  }
}
