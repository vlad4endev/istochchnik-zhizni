import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'core/project/project_branding_provider.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/presentation/widgets/auth_gate.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('ru');
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: AppColors.primary,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: AppColors.surface,
      systemNavigationBarIconBrightness: Brightness.dark,
    ),
  );
  runApp(const ProviderScope(child: MyApp()));
}

class MyApp extends ConsumerWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branding = ref.watch(projectBrandingValueProvider);
    return MaterialApp(
      title: branding.appName,
      debugShowCheckedModeBanner: false,
      locale: const Locale('ru'),
      supportedLocales: const [Locale('ru'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        colorScheme: const ColorScheme.light(
          primary: AppColors.primary,
          onPrimary: AppColors.textOnPrimary,
          secondary: AppColors.accent,
          onSecondary: Colors.white,
          surface: AppColors.surface,
          onSurface: AppColors.textPrimary,
        ),
        useMaterial3: true,
        textTheme: TextTheme(
          displayLarge: AppTypography.displayLarge.copyWith(
            color: AppColors.textPrimary,
          ),
          displayMedium: AppTypography.displayMedium.copyWith(
            color: AppColors.textPrimary,
          ),
          headlineLarge: AppTypography.headlineLarge.copyWith(
            color: AppColors.textPrimary,
          ),
          headlineMedium: AppTypography.headlineMedium.copyWith(
            color: AppColors.textPrimary,
          ),
          titleLarge: AppTypography.titleLarge.copyWith(
            color: AppColors.textPrimary,
          ),
          titleMedium: AppTypography.titleMedium.copyWith(
            color: AppColors.textPrimary,
          ),
          bodyLarge: AppTypography.bodyLarge.copyWith(
            color: AppColors.textSecondary,
          ),
          bodyMedium: AppTypography.bodyMedium.copyWith(
            color: AppColors.textSecondary,
          ),
          labelLarge: AppTypography.labelLarge.copyWith(
            color: AppColors.textPrimary,
          ),
          labelSmall: AppTypography.labelSmall.copyWith(
            color: AppColors.textTertiary,
          ),
        ),
        appBarTheme: const AppBarTheme(
          centerTitle: true,
          elevation: 0,
          scrolledUnderElevation: 0,
          surfaceTintColor: Colors.transparent,
          toolbarHeight: 72,
          titleSpacing: 24,
          titleTextStyle: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
          ),
        ),
        cardTheme: CardThemeData(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.lg),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 18),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
          ),
        ),
      ),
      builder: (context, child) {
        return GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
          child: child ?? const SizedBox.shrink(),
        );
      },
      home: const AuthGate(),
    );
  }
}
