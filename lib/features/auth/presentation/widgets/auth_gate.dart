import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../main_navigation/main_shell.dart';
import '../providers/auth_provider.dart';
import '../screens/auth_landing_screen.dart';

class AuthGate extends ConsumerWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authControllerProvider);

    return authState.when(
      data: (session) =>
          session == null ? const AuthLandingScreen() : const MainShell(),
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (_, __) => const AuthLandingScreen(),
    );
  }
}
