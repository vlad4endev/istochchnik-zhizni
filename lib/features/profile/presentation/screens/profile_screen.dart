import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/responsive.dart';
import '../../../auth/presentation/providers/auth_provider.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final padding = Responsive.horizontalPadding(context);
    final authAsync = ref.watch(authControllerProvider);

    Future<void> logout() async {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Выход из аккаунта'),
          content: const Text('Завершить текущую сессию?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Отмена'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Выйти'),
            ),
          ],
        ),
      );

      if (confirm != true) {
        return;
      }

      await ref.read(authControllerProvider.notifier).signOut();
    }

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        toolbarHeight: 80,
        titleSpacing: 24,
        title: const Text(
          'Профиль',
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
            color: AppColors.textOnPrimary,
          ),
        ),
        backgroundColor: AppColors.primary,
        elevation: 0,
        scrolledUnderElevation: 4,
        surfaceTintColor: Colors.transparent,
      ),
      body: SafeArea(
        child: authAsync.when(
          data: (authSession) => SingleChildScrollView(
            padding: EdgeInsets.all(padding * 2),
            child: Column(
              children: [
                const SizedBox(height: 32),
                Container(
                  padding: const EdgeInsets.all(32),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceElevated,
                    borderRadius: BorderRadius.circular(AppRadius.xl),
                    boxShadow: AppShadows.card,
                  ),
                  child: Column(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withOpacity(0.08),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          Icons.person_rounded,
                          size: 56,
                          color: AppColors.primary.withOpacity(0.6),
                        ),
                      ),
                      const SizedBox(height: 20),
                      Text(
                        '${authSession?.firstName ?? ''} ${authSession?.lastName ?? ''}'
                                .trim()
                                .isEmpty
                            ? 'Профиль'
                            : '${authSession?.firstName ?? ''} ${authSession?.lastName ?? ''}'
                                  .trim(),
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: AppColors.textPrimary,
                          letterSpacing: -0.4,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Роль: ${authSession?.role ?? 'member'}',
                        style: TextStyle(
                          fontSize: 16,
                          color: AppColors.textMuted,
                          height: 1.5,
                          letterSpacing: 0.1,
                        ),
                      ),
                      if (!AppConfig.authDisabled) ...[
                        const SizedBox(height: 20),
                        OutlinedButton.icon(
                          onPressed: logout,
                          icon: const Icon(Icons.logout_rounded),
                          label: const Text('Выйти из аккаунта'),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => Center(
            child: Padding(
              padding: EdgeInsets.all(padding * 2),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'Не удалось загрузить профиль',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: () =>
                        ref.invalidate(authControllerProvider),
                    child: const Text('Повторить'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
