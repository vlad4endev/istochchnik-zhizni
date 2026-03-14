import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/project/project_branding_provider.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/app_logo.dart';
import 'login_screen.dart';

const _authLogoHeroTag = 'auth_logo_hero';

class AuthLandingScreen extends ConsumerWidget {
  const AuthLandingScreen({super.key});

  void _openAuthForm(BuildContext context, AuthMode mode) {
    Navigator.of(context).push(_buildAuthRoute(mode));
  }

  Route<void> _buildAuthRoute(AuthMode mode) {
    return PageRouteBuilder<void>(
      transitionDuration: const Duration(milliseconds: 520),
      reverseTransitionDuration: const Duration(milliseconds: 360),
      pageBuilder: (context, animation, secondaryAnimation) {
        return LoginScreen(initialMode: mode);
      },
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        final fade = CurvedAnimation(
          parent: animation,
          curve: Curves.easeOutCubic,
          reverseCurve: Curves.easeInCubic,
        );
        final slide =
            Tween<Offset>(
              begin: const Offset(0, 0.08),
              end: Offset.zero,
            ).animate(
              CurvedAnimation(
                parent: animation,
                curve: Curves.easeOutQuart,
                reverseCurve: Curves.easeInQuart,
              ),
            );
        final scale = Tween<double>(begin: 0.985, end: 1).animate(
          CurvedAnimation(
            parent: animation,
            curve: Curves.easeOutCubic,
            reverseCurve: Curves.easeInCubic,
          ),
        );
        return FadeTransition(
          opacity: fade,
          child: SlideTransition(
            position: slide,
            child: ScaleTransition(scale: scale, child: child),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branding = ref.watch(projectBrandingValueProvider);

    return Scaffold(
      backgroundColor: AppColors.primary,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
          child: Column(
            children: [
              const Spacer(flex: 3),
              Hero(
                tag: _authLogoHeroTag,
                child: Material(
                  color: Colors.transparent,
                  child: Container(
                    width: 112,
                    height: 112,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(AppRadius.xl),
                    ),
                    alignment: Alignment.center,
                    child: const AppLogo(size: 76),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Text(
                branding.appName,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.displayMedium?.copyWith(
                  color: AppColors.textOnPrimary,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.4,
                ),
              ),
              if (branding.description.trim().isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(
                  branding.description,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Colors.white.withValues(alpha: 0.88),
                  ),
                ),
              ],
              const Spacer(flex: 4),
              FilledButton(
                onPressed: () => _openAuthForm(context, AuthMode.signIn),
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: AppColors.primary,
                  minimumSize: const Size.fromHeight(54),
                ),
                child: const Text('Войти'),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => _openAuthForm(context, AuthMode.signUp),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primaryLight,
                  foregroundColor: AppColors.textOnPrimary,
                  minimumSize: const Size.fromHeight(54),
                ),
                child: const Text('Зарегистрироваться'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
