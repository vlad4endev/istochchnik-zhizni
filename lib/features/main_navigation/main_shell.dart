import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/project/project_branding_provider.dart';
import '../../../core/widgets/app_logo.dart';
import '../auth/presentation/providers/auth_provider.dart';
import '../admin/presentation/screens/admin_panel_screen.dart';
import '../calendar/presentation/screens/daily_prayer_screen.dart';
import '../profile/presentation/screens/profile_screen.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/responsive.dart';

/// Главный экран с нижней навигацией для мобильных устройств
class MainShell extends ConsumerStatefulWidget {
  const MainShell({super.key});

  @override
  ConsumerState<MainShell> createState() => _MainShellState();
}

class _MainShellState extends ConsumerState<MainShell> {
  int _currentIndex = 0;

  Future<void> _handleLogout() async {
    if (AppConfig.authDisabled) {
      return;
    }
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

    if (confirm != true || !mounted) {
      return;
    }

    await ref.read(authControllerProvider.notifier).signOut();
  }

  List<_NavItem> _navItemsForRole({required bool isAdmin}) {
    final items = <_NavItem>[
      const _NavItem(
        label: 'Молитва',
        icon: Icons.volunteer_activism_rounded,
        screen: DailyPrayerScreen(),
      ),
      const _NavItem(
        label: 'Профиль',
        icon: Icons.person_rounded,
        screen: ProfileScreen(),
      ),
    ];

    if (isAdmin) {
      items.add(
        const _NavItem(
          label: 'Админ',
          icon: Icons.admin_panel_settings_rounded,
          screen: AdminPanelScreen(),
        ),
      );
    }

    return items;
  }

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final screenWidth = mediaQuery.size.width;
    final isCompactPhone = screenWidth < 380;
    final authSession = ref.watch(authControllerProvider).valueOrNull;
    final branding = ref.watch(projectBrandingValueProvider);
    final isAdmin = (authSession?.role.toLowerCase() ?? '') == 'admin';
    final navItems = _navItemsForRole(isAdmin: isAdmin);
    final selectedIndex = navItems.isEmpty
        ? 0
        : _currentIndex.clamp(0, navItems.length - 1);

    final showBottomNav = Responsive.isPhone(context);

    if (!showBottomNav) {
      return Scaffold(
        backgroundColor: AppColors.surface,
        body: Row(
          children: [
            _DesktopSidebar(
              currentIndex: selectedIndex,
              appName: branding.appName,
              appDescription: branding.description,
              navItems: navItems,
              onSelect: (index) => setState(() => _currentIndex = index),
              onLogout: _handleLogout,
            ),
            Expanded(child: navItems[selectedIndex].screen),
          ],
        ),
      );
    }

    return Scaffold(
      body: IndexedStack(
        index: selectedIndex,
        children: navItems.map((e) => e.screen).toList(),
      ),
      extendBody: true,
      bottomNavigationBar: Padding(
        padding: EdgeInsets.fromLTRB(
          isCompactPhone ? 10 : 20,
          0,
          isCompactPhone ? 10 : 20,
          isCompactPhone ? 10 : 16,
        ),
        child: SafeArea(
          top: false,
          child: Container(
            padding: EdgeInsets.symmetric(
              horizontal: isCompactPhone ? 4 : 8,
              vertical: isCompactPhone ? 6 : 8,
            ),
            decoration: BoxDecoration(
              color: AppColors.surfaceElevated,
              borderRadius: BorderRadius.circular(AppRadius.xxl),
              boxShadow: AppShadows.floating,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: List.generate(
                navItems.length,
                (index) => _NavBarItem(
                  item: navItems[index],
                  isSelected: selectedIndex == index,
                  compact: isCompactPhone,
                  onTap: () => setState(() => _currentIndex = index),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DesktopSidebar extends StatelessWidget {
  const _DesktopSidebar({
    required this.currentIndex,
    required this.appName,
    required this.appDescription,
    required this.navItems,
    required this.onSelect,
    required this.onLogout,
  });

  final int currentIndex;
  final String appName;
  final String appDescription;
  final List<_NavItem> navItems;
  final ValueChanged<int> onSelect;
  final Future<void> Function() onLogout;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 260,
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 16,
            offset: const Offset(4, 0),
          ),
        ],
      ),
      child: SafeArea(
        right: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
              child: Row(
                children: [
                  const AppLogo(size: 40),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          appName,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: AppColors.textPrimary,
                            letterSpacing: -0.4,
                          ),
                          overflow: TextOverflow.ellipsis,
                          maxLines: 1,
                        ),
                        if (appDescription.trim().isNotEmpty)
                          Text(
                            appDescription,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.textTertiary,
                              letterSpacing: 0.1,
                              height: 1.2,
                            ),
                            overflow: TextOverflow.ellipsis,
                            maxLines: 2,
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 20),
              child: Divider(height: 1, color: AppColors.dividerLight),
            ),
            const SizedBox(height: 16),
            ...navItems.asMap().entries.map((entry) {
              final index = entry.key;
              final item = entry.value;
              final isSelected = currentIndex == index;
              return Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 4,
                ),
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: () => onSelect(index),
                    borderRadius: BorderRadius.circular(AppRadius.md),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 14,
                      ),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? AppColors.primary.withValues(alpha: 0.1)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(AppRadius.md),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            item.icon,
                            size: 24,
                            color: isSelected
                                ? AppColors.primary
                                : AppColors.textTertiary,
                          ),
                          const SizedBox(width: 14),
                          Text(
                            item.label,
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: isSelected
                                  ? FontWeight.w800
                                  : FontWeight.w600,
                              letterSpacing: -0.1,
                              color: isSelected
                                  ? AppColors.primary
                                  : AppColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            }),
            const Spacer(),
            if (!AppConfig.authDisabled)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
                child: OutlinedButton.icon(
                  onPressed: onLogout,
                  icon: const Icon(Icons.logout_rounded),
                  label: const Text('Выйти из аккаунта'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _NavItem {
  const _NavItem({
    required this.label,
    required this.icon,
    required this.screen,
  });

  final String label;
  final IconData icon;
  final Widget screen;
}

class _NavBarItem extends StatelessWidget {
  const _NavBarItem({
    required this.item,
    required this.isSelected,
    required this.compact,
    required this.onTap,
  });

  final _NavItem item;
  final bool isSelected;
  final bool compact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.lg),
          splashColor: AppColors.primary.withValues(alpha: 0.1),
          highlightColor: AppColors.primary.withValues(alpha: 0.05),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            padding: EdgeInsets.symmetric(
              vertical: compact ? 10 : 14,
              horizontal: compact ? 8 : 20,
            ),
            decoration: BoxDecoration(
              color: isSelected
                  ? AppColors.primary.withValues(alpha: 0.1)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(AppRadius.lg),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  item.icon,
                  size: compact ? 20 : 22,
                  color: isSelected
                      ? AppColors.primary
                      : AppColors.textTertiary,
                ),
                SizedBox(height: compact ? 4 : 6),
                Text(
                  item.label,
                  style: TextStyle(
                    fontSize: compact ? 10 : 11,
                    fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                    letterSpacing: compact ? 0.2 : 0.4,
                    color: isSelected
                        ? AppColors.primary
                        : AppColors.textTertiary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
