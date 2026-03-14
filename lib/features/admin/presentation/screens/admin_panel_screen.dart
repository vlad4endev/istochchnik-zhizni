import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:dio/dio.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/responsive.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../domain/entities/admin_backslider.dart';
import '../../domain/entities/admin_direction_template.dart';
import '../../domain/entities/admin_member.dart';
import '../../domain/entities/admin_ministry.dart';
import '../../domain/entities/admin_role_template.dart';
import '../../domain/entities/global_theme.dart';
import '../../domain/entities/next_week_global_assignment.dart';
import '../../domain/entities/prayer_request_history_item.dart';
import '../../domain/entities/upcoming_week_member_assignment.dart';
import '../../domain/repositories/admin_repository.dart';
import '../providers/admin_providers.dart';

class AdminPanelScreen extends ConsumerStatefulWidget {
  const AdminPanelScreen({super.key});

  @override
  ConsumerState<AdminPanelScreen> createState() => _AdminPanelScreenState();
}

class _AdminPanelScreenState extends ConsumerState<AdminPanelScreen> {
  String _messageFromError(Object error, String fallback) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map && data['error'] is String) {
        final text = (data['error'] as String).trim();
        if (text.isNotEmpty) {
          return text;
        }
      }
    }
    return fallback;
  }

  @override
  Widget build(BuildContext context) {
    final authSession = ref.watch(authControllerProvider).valueOrNull;
    final isAdmin = (authSession?.role.toLowerCase() ?? '') == 'admin';
    if (!isAdmin) {
      return Scaffold(
        backgroundColor: AppColors.surface,
        appBar: AppBar(
          toolbarHeight: 80,
          titleSpacing: 24,
          title: const Text(
            'Админ панель',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
              color: AppColors.textOnPrimary,
            ),
          ),
          backgroundColor: AppColors.primary,
          surfaceTintColor: Colors.transparent,
        ),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.lock_outline_rounded,
                  size: 52,
                  color: AppColors.textMuted,
                ),
                SizedBox(height: 12),
                Text(
                  'Доступ запрещен',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  'Раздел доступен только пользователям с ролью Администратор.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 15,
                    color: AppColors.textMuted,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final membersAsync = ref.watch(adminMembersProvider);
    final roleTemplatesAsync = ref.watch(adminRoleTemplatesProvider);
    final directionTemplatesAsync = ref.watch(adminDirectionTemplatesProvider);
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        backgroundColor: AppColors.surface,
        appBar: AppBar(
          toolbarHeight: 80,
          titleSpacing: 24,
          title: const Text(
            'Админ панель',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
              color: AppColors.textOnPrimary,
            ),
          ),
          backgroundColor: AppColors.primary,
          surfaceTintColor: Colors.transparent,
          bottom: TabBar(
            indicatorColor: AppColors.textOnPrimary,
            indicatorSize: TabBarIndicatorSize.tab,
            indicatorWeight: 3,
            labelColor: AppColors.textOnPrimary,
            unselectedLabelColor: AppColors.textOnPrimary.withValues(alpha: 0.65),
            dividerColor: Colors.transparent,
            overlayColor: WidgetStateProperty.all(Colors.white.withValues(alpha: 0.08)),
            tabs: const [
              Tab(
                icon: Icon(Icons.people_alt_rounded),
                text: 'Пользователи',
              ),
              Tab(
                icon: Icon(Icons.calendar_month_rounded),
                text: 'Календарь',
              ),
              Tab(
                icon: Icon(Icons.inventory_2_rounded),
                text: 'Шаблоны',
              ),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _MembersManagementTab(
              membersAsync: membersAsync,
              onRefresh: () => ref.read(adminMembersProvider.notifier).refreshMembers(),
              onCreateMember: _createMember,
              onSetOneTimeDate: _setOneTimeMemberDate,
              onUpdateMember: _updateMember,
              onDeleteMember: _deleteMember,
              onToggleStatus: _toggleMemberStatus,
              onToggleAdminRole: _toggleMemberAdminRole,
            ),
            _CalendarSettingsTab(
              onStartPrayerCycle: _startPrayerCycle,
            ),
            _SystemTemplatesTab(
              roleTemplatesAsync: roleTemplatesAsync,
              directionTemplatesAsync: directionTemplatesAsync,
              onRefreshRoles: () => ref.read(adminRoleTemplatesProvider.notifier).refreshTemplates(),
              onRefreshDirections: () =>
                  ref.read(adminDirectionTemplatesProvider.notifier).refreshTemplates(),
              onAddRoleTemplate: _addRoleTemplate,
              onDeleteRoleTemplate: _deleteRoleTemplate,
              onAddDirectionTemplate: _addDirectionTemplate,
              onDeleteDirectionTemplate: _deleteDirectionTemplate,
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _startPrayerCycle() async {
    final selectedDate = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime(2020, 1, 1),
      lastDate: DateTime(2100, 12, 31),
      locale: const Locale('ru'),
    );

    if (selectedDate == null || !mounted) {
      return;
    }

    final chosenText = DateFormat('dd.MM.yyyy', 'ru').format(selectedDate);

    final shouldStart = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Запустить цикл?'),
        content: Text('Цикл начнется с выбранной даты: $chosenText.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Отмена'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Запустить'),
          ),
        ],
      ),
    );

    if (shouldStart != true || !mounted) {
      return;
    }

    try {
      final actualStartDate =
          await ref.read(adminMembersProvider.notifier).startPrayerCycle(selectedDate);
      if (!mounted) return;
      final actualText = DateFormat('dd.MM.yyyy', 'ru').format(actualStartDate);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Цикл запущен. Старт: $actualText.')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_messageFromError(error, 'Не удалось запустить цикл'))),
      );
    }
  }

  Future<void> _createMember() async {
    final roleTemplates = ref.read(adminRoleTemplatesProvider).valueOrNull ?? const [];
    final directionTemplates = ref.read(adminDirectionTemplatesProvider).valueOrNull ?? const [];
    final payload = await _showMemberFormDialog(
      context,
      roleTemplates: roleTemplates,
      directionTemplates: directionTemplates,
    );
    if (payload == null || !mounted) {
      return;
    }

    try {
      await ref.read(adminMembersProvider.notifier).createMember(
            firstName: payload.firstName,
            lastName: payload.lastName,
            phoneNumber: payload.phoneNumber,
            birthDate: payload.birthDate,
            ministryRole: payload.ministryRole,
            ministryDirection: payload.ministryDirection,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Участник добавлен')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_messageFromError(error, 'Не удалось добавить участника'))),
      );
    }
  }

  Future<void> _updateMember(AdminMember member) async {
    final roleTemplates = ref.read(adminRoleTemplatesProvider).valueOrNull ?? const [];
    final directionTemplates = ref.read(adminDirectionTemplatesProvider).valueOrNull ?? const [];
    final payload = await _showMemberFormDialog(
      context,
      initial: member,
      roleTemplates: roleTemplates,
      directionTemplates: directionTemplates,
    );
    if (payload == null || !mounted) {
      return;
    }

    try {
      await ref.read(adminMembersProvider.notifier).updateMember(
            id: member.id,
            firstName: payload.firstName,
            lastName: payload.lastName,
            phoneNumber: payload.phoneNumber,
            birthDate: payload.birthDate,
            ministryRole: payload.ministryRole,
            ministryDirection: payload.ministryDirection,
            isActive: member.isActive,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Данные участника обновлены')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_messageFromError(error, 'Не удалось обновить участника'))),
      );
    }
  }

  Future<void> _toggleMemberStatus(AdminMember member) async {
    final phoneNumber = member.phoneNumber?.trim() ?? '';
    final birthDate = member.birthDate?.trim() ?? '';
    if (phoneNumber.isEmpty || birthDate.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Для смены статуса заполните телефон и дату рождения участника'),
        ),
      );
      return;
    }

    try {
      await ref.read(adminMembersProvider.notifier).updateMember(
            id: member.id,
            firstName: member.firstName,
            lastName: member.lastName,
            phoneNumber: phoneNumber,
            birthDate: birthDate,
            ministryRole: member.ministryRole,
            ministryDirection: member.ministryDirection,
            isActive: !member.isActive,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            member.isActive ? 'Участник деактивирован' : 'Участник активирован',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_messageFromError(error, 'Не удалось изменить статус'))),
      );
    }
  }

  Future<void> _toggleMemberAdminRole(AdminMember member) async {
    final nextRole = member.isAdmin ? 'member' : 'admin';

    try {
      await ref.read(adminMembersProvider.notifier).setMemberAppRole(
            id: member.id,
            appRole: nextRole,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            nextRole == 'admin'
                ? 'Участник назначен администратором проекта'
                : 'Права администратора сняты',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_messageFromError(error, 'Не удалось обновить роль доступа'))),
      );
    }
  }

  Future<void> _deleteMember(AdminMember member) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Удалить участника?'),
          content: Text('Участник ${member.fullName} будет удален без возможности восстановления.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Отмена'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Удалить'),
            ),
          ],
        );
      },
    );

    if (confirm != true || !mounted) {
      return;
    }

    try {
      await ref.read(adminMembersProvider.notifier).deleteMember(member.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Участник удален')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_messageFromError(error, 'Не удалось удалить участника'))),
      );
    }
  }

  Future<void> _setOneTimeMemberDate(AdminMember member) async {
    final selectedDate = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime(2020, 1, 1),
      lastDate: DateTime(2100, 12, 31),
      locale: const Locale('ru'),
    );

    if (selectedDate == null || !mounted) {
      return;
    }

    final targetDate = DateTime(selectedDate.year, selectedDate.month, selectedDate.day);
    final targetText = DateFormat('dd.MM.yyyy', 'ru').format(targetDate);

    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Разовая перестановка'),
        content: Text(
          'Поставить ${member.fullName} на дату $targetText?\n'
          'Это изменение только на один день и не нарушит цикличность.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Отмена'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Сохранить'),
          ),
        ],
      ),
    );

    if (confirm != true || !mounted) {
      return;
    }

    try {
      await ref.read(adminMembersProvider.notifier).setOneTimeMemberDateOverride(
            memberId: member.id,
            targetDate: targetDate,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Назначено на $targetText (разово)')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_messageFromError(error, 'Не удалось назначить дату участнику'))),
      );
    }
  }

  Future<void> _addRoleTemplate() async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Новая роль в церкви'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Название роли',
            hintText: 'Например: лидер прославления',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Отмена'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(controller.text.trim()),
            child: const Text('Добавить'),
          ),
        ],
      ),
    );
    controller.dispose();

    if (result == null || result.isEmpty || !mounted) {
      return;
    }

    try {
      await ref.read(adminRoleTemplatesProvider.notifier).createTemplate(result);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Шаблон роли добавлен')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_messageFromError(error, 'Не удалось добавить шаблон'))),
      );
    }
  }

  Future<void> _addDirectionTemplate() async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Новое направление служения'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Название направления',
            hintText: 'Например: молодежное служение',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Отмена'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(controller.text.trim()),
            child: const Text('Добавить'),
          ),
        ],
      ),
    );
    controller.dispose();

    if (result == null || result.isEmpty || !mounted) {
      return;
    }

    try {
      await ref.read(adminDirectionTemplatesProvider.notifier).createTemplate(result);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Шаблон направления добавлен')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_messageFromError(error, 'Не удалось добавить шаблон направления'))),
      );
    }
  }

  Future<void> _deleteRoleTemplate(AdminRoleTemplate template) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Удалить шаблон?'),
        content: Text('Шаблон "${template.title}" будет удален.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Отмена'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Удалить'),
          ),
        ],
      ),
    );

    if (confirm != true || !mounted) {
      return;
    }

    try {
      await ref.read(adminRoleTemplatesProvider.notifier).deleteTemplate(template.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Шаблон удален')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_messageFromError(error, 'Не удалось удалить шаблон'))),
      );
    }
  }

  Future<void> _deleteDirectionTemplate(AdminDirectionTemplate template) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Удалить шаблон?'),
        content: Text('Шаблон "${template.title}" будет удален.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Отмена'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Удалить'),
          ),
        ],
      ),
    );

    if (confirm != true || !mounted) {
      return;
    }

    try {
      await ref.read(adminDirectionTemplatesProvider.notifier).deleteTemplate(template.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Шаблон направления удален')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_messageFromError(error, 'Не удалось удалить шаблон направления'))),
      );
    }
  }
}

class _MembersManagementTab extends ConsumerStatefulWidget {
  const _MembersManagementTab({
    required this.membersAsync,
    required this.onRefresh,
    required this.onCreateMember,
    required this.onSetOneTimeDate,
    required this.onUpdateMember,
    required this.onDeleteMember,
    required this.onToggleStatus,
    required this.onToggleAdminRole,
  });

  final AsyncValue<List<AdminMember>> membersAsync;
  final Future<void> Function() onRefresh;
  final Future<void> Function() onCreateMember;
  final Future<void> Function(AdminMember member) onSetOneTimeDate;
  final Future<void> Function(AdminMember member) onUpdateMember;
  final Future<void> Function(AdminMember member) onDeleteMember;
  final Future<void> Function(AdminMember member) onToggleStatus;
  final Future<void> Function(AdminMember member) onToggleAdminRole;

  @override
  ConsumerState<_MembersManagementTab> createState() => _MembersManagementTabState();
}

class _MembersManagementTabState extends ConsumerState<_MembersManagementTab> {
  String _searchQuery = '';
  _UsersStatusFilter _statusFilter = _UsersStatusFilter.all;
  _UsersRoleFilter _roleFilter = _UsersRoleFilter.all;
  _UsersDirectionFilter _directionFilter = _UsersDirectionFilter.all;
  _UsersSortMode _sortMode = _UsersSortMode.fullNameAsc;
  final Map<int, Future<List<PrayerRequestHistoryItem>>> _historyFutures = {};
  final Set<int> _expandedMemberIds = <int>{};

  // Normalize common Latin lookalikes so mixed-script names
  // (e.g. "Cамодуров" with Latin "C") sort correctly in RU order.
  String _normalizeSortText(String value) {
    const lookalikes = {
      'A': 'А',
      'B': 'В',
      'C': 'С',
      'E': 'Е',
      'H': 'Н',
      'K': 'К',
      'M': 'М',
      'O': 'О',
      'P': 'Р',
      'T': 'Т',
      'X': 'Х',
      'Y': 'У',
      'a': 'а',
      'c': 'с',
      'e': 'е',
      'o': 'о',
      'p': 'р',
      'x': 'х',
      'y': 'у',
      'k': 'к',
      'm': 'м',
      'h': 'н',
      'b': 'в',
    };

    final buffer = StringBuffer();
    for (final rune in value.runes) {
      final ch = String.fromCharCode(rune);
      buffer.write(lookalikes[ch] ?? ch);
    }
    return buffer.toString().trim().toLowerCase();
  }

  bool _matchesRole(AdminMember member) {
    final hasRole = (member.ministryRole?.trim().isNotEmpty ?? false);
    switch (_roleFilter) {
      case _UsersRoleFilter.all:
        return true;
      case _UsersRoleFilter.withRole:
        return hasRole;
      case _UsersRoleFilter.withoutRole:
        return !hasRole;
    }
  }

  bool _matchesDirection(AdminMember member) {
    final hasDirection = (member.ministryDirection?.trim().isNotEmpty ?? false);
    switch (_directionFilter) {
      case _UsersDirectionFilter.all:
        return true;
      case _UsersDirectionFilter.withDirection:
        return hasDirection;
      case _UsersDirectionFilter.withoutDirection:
        return !hasDirection;
    }
  }

  int _compareMembers(AdminMember a, AdminMember b) {
    final aSurnameName = _normalizeSortText('${a.lastName} ${a.firstName}');
    final bSurnameName = _normalizeSortText('${b.lastName} ${b.firstName}');
    switch (_sortMode) {
      case _UsersSortMode.fullNameAsc:
        return aSurnameName.compareTo(bSurnameName);
      case _UsersSortMode.fullNameDesc:
        return bSurnameName.compareTo(aSurnameName);
      case _UsersSortMode.createdNewest:
        return b.createdAt.compareTo(a.createdAt);
      case _UsersSortMode.createdOldest:
        return a.createdAt.compareTo(b.createdAt);
    }
  }

  String _displayName(AdminMember member) {
    final full = '${member.lastName} ${member.firstName}'.trim();
    return full.isEmpty ? member.fullName : full;
  }

  Future<List<PrayerRequestHistoryItem>> _loadHistory(int memberId) {
    return _historyFutures.putIfAbsent(
      memberId,
      () => ref.read(adminMembersProvider.notifier).getMemberPrayerRequestHistory(memberId: memberId),
    );
  }

  void _refreshHistory(int memberId) {
    setState(() {
      _historyFutures[memberId] =
          ref.read(adminMembersProvider.notifier).getMemberPrayerRequestHistory(memberId: memberId);
    });
  }

  Future<void> _editPrayerRequest(AdminMember member) async {
    final controller = TextEditingController(text: member.prayerRequest ?? '');
    final text = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Нужда: ${member.fullName}'),
        content: TextField(
          controller: controller,
          minLines: 3,
          maxLines: 6,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Введите молитвенную нужду',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Отмена'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(controller.text.trim()),
            child: const Text('Сохранить'),
          ),
        ],
      ),
    );
    controller.dispose();

    if (!mounted || text == null) {
      return;
    }

    try {
      await ref.read(adminMembersProvider.notifier).updateMemberPrayerRequest(
            memberId: member.id,
            prayerRequest: text,
          );
      if (!mounted) return;
      _refreshHistory(member.id);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Нужда обновлена')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось обновить нужду')),
      );
    }
  }

  bool _matchesStatus(AdminMember member) {
    switch (_statusFilter) {
      case _UsersStatusFilter.active:
        return member.isActive;
      case _UsersStatusFilter.inactive:
        return !member.isActive;
      case _UsersStatusFilter.all:
        return true;
    }
  }

  @override
  Widget build(BuildContext context) {
    final padding = Responsive.horizontalPadding(context);
    return widget.membersAsync.when(
      data: (members) {
        final now = DateTime.now();
        final activeCount = members.where((m) => m.isActive).length;
        final inactiveCount = members.length - activeCount;
        final withRoleCount = members.where((m) => (m.ministryRole ?? '').trim().isNotEmpty).length;
        final birthdaysThisMonth = members.where((m) {
          final raw = m.birthDate;
          if (raw == null || raw.trim().isEmpty) {
            return false;
          }
          final parsed = DateTime.tryParse(raw);
          return parsed != null && parsed.month == now.month;
        }).length;

        final query = _searchQuery.trim().toLowerCase();
        final filtered = members.where((member) {
          if (!_matchesStatus(member)) {
            return false;
          }
          if (!_matchesRole(member)) {
            return false;
          }
          if (!_matchesDirection(member)) {
            return false;
          }
          if (query.isEmpty) {
            return true;
          }
          final haystack = [
            _displayName(member),
            member.fullName,
            member.phoneNumber ?? '',
            member.ministryRole ?? '',
            member.ministryDirection ?? '',
          ].join(' ').toLowerCase();
          return haystack.contains(query);
        }).toList(growable: true)
          ..sort(_compareMembers);

        return RefreshIndicator(
          onRefresh: widget.onRefresh,
          child: ListView.builder(
            padding: EdgeInsets.fromLTRB(padding, 16, padding, 24),
            itemCount: filtered.isEmpty ? 2 : filtered.length + 1,
            itemBuilder: (context, index) {
              if (index == 0) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Column(
                    children: [
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: widget.onCreateMember,
                          icon: const Icon(Icons.person_add_rounded),
                          label: const Text('Добавить участника'),
                          style: FilledButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(AppRadius.md),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceElevated,
                          borderRadius: BorderRadius.circular(AppRadius.lg),
                          boxShadow: AppShadows.cardSubtle,
                        ),
                        child: Column(
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: _MiniStat(
                                    title: 'Всего',
                                    value: members.length.toString(),
                                    color: AppColors.primary,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: _MiniStat(
                                    title: 'Активные',
                                    value: activeCount.toString(),
                                    color: const Color(0xFF0D9488),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: _MiniStat(
                                    title: 'Неактивные',
                                    value: inactiveCount.toString(),
                                    color: const Color(0xFFDC2626),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(
                                  child: _MiniStat(
                                    title: 'С ролью',
                                    value: withRoleCount.toString(),
                                    color: AppColors.accent,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: _MiniStat(
                                    title: 'ДР в этом месяце',
                                    value: birthdaysThisMonth.toString(),
                                    color: const Color(0xFF7C3AED),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        decoration: InputDecoration(
                          prefixIcon: const Icon(Icons.search_rounded),
                          hintText: 'Поиск: имя, телефон, роль, направление',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(AppRadius.md),
                          ),
                          filled: true,
                          fillColor: AppColors.surfaceElevated,
                        ),
                        onChanged: (value) => setState(() => _searchQuery = value),
                      ),
                      const SizedBox(height: 12),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(AppRadius.md),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Фильтры и сортировка',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: AppColors.textPrimary,
                              ),
                            ),
                            const SizedBox(height: 10),
                            const Text(
                              'Статус',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textSecondary,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                ChoiceChip(
                                  label: const Text('Все'),
                                  selected: _statusFilter == _UsersStatusFilter.all,
                                  onSelected: (_) =>
                                      setState(() => _statusFilter = _UsersStatusFilter.all),
                                ),
                                ChoiceChip(
                                  label: const Text('Активные'),
                                  selected: _statusFilter == _UsersStatusFilter.active,
                                  onSelected: (_) =>
                                      setState(() => _statusFilter = _UsersStatusFilter.active),
                                ),
                                ChoiceChip(
                                  label: const Text('Неактивные'),
                                  selected: _statusFilter == _UsersStatusFilter.inactive,
                                  onSelected: (_) =>
                                      setState(() => _statusFilter = _UsersStatusFilter.inactive),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            const Text(
                              'Роли в церкви',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textSecondary,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                ChoiceChip(
                                  label: const Text('Все роли'),
                                  selected: _roleFilter == _UsersRoleFilter.all,
                                  onSelected: (_) => setState(() => _roleFilter = _UsersRoleFilter.all),
                                ),
                                ChoiceChip(
                                  label: const Text('С ролью'),
                                  selected: _roleFilter == _UsersRoleFilter.withRole,
                                  onSelected: (_) =>
                                      setState(() => _roleFilter = _UsersRoleFilter.withRole),
                                ),
                                ChoiceChip(
                                  label: const Text('Без роли'),
                                  selected: _roleFilter == _UsersRoleFilter.withoutRole,
                                  onSelected: (_) =>
                                      setState(() => _roleFilter = _UsersRoleFilter.withoutRole),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            const Text(
                              'Направления служений',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textSecondary,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                ChoiceChip(
                                  label: const Text('Все направления'),
                                  selected: _directionFilter == _UsersDirectionFilter.all,
                                  onSelected: (_) =>
                                      setState(() => _directionFilter = _UsersDirectionFilter.all),
                                ),
                                ChoiceChip(
                                  label: const Text('С направлением'),
                                  selected: _directionFilter == _UsersDirectionFilter.withDirection,
                                  onSelected: (_) => setState(
                                    () => _directionFilter = _UsersDirectionFilter.withDirection,
                                  ),
                                ),
                                ChoiceChip(
                                  label: const Text('Без направления'),
                                  selected: _directionFilter == _UsersDirectionFilter.withoutDirection,
                                  onSelected: (_) => setState(
                                    () => _directionFilter = _UsersDirectionFilter.withoutDirection,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            const Text(
                              'Сортировка',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textSecondary,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10),
                              decoration: BoxDecoration(
                                color: AppColors.surfaceElevated,
                                borderRadius: BorderRadius.circular(AppRadius.md),
                                border: Border.all(color: AppColors.dividerLight),
                              ),
                              child: DropdownButtonHideUnderline(
                                child: DropdownButton<_UsersSortMode>(
                                  isExpanded: true,
                                  value: _sortMode,
                                  items: const [
                                    DropdownMenuItem(
                                      value: _UsersSortMode.fullNameAsc,
                                      child: Text('Фамилия, имя (А-Я)'),
                                    ),
                                    DropdownMenuItem(
                                      value: _UsersSortMode.fullNameDesc,
                                      child: Text('Фамилия, имя (Я-А)'),
                                    ),
                                    DropdownMenuItem(
                                      value: _UsersSortMode.createdNewest,
                                      child: Text('Сначала новые'),
                                    ),
                                    DropdownMenuItem(
                                      value: _UsersSortMode.createdOldest,
                                      child: Text('Сначала старые'),
                                    ),
                                  ],
                                  onChanged: (value) {
                                    if (value == null) return;
                                    setState(() => _sortMode = value);
                                  },
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 10),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'Показано: ${filtered.length} из ${members.length}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.textSecondary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }

              if (filtered.isEmpty) {
                return Container(
                  margin: const EdgeInsets.only(top: 4),
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceElevated,
                    borderRadius: BorderRadius.circular(AppRadius.lg),
                    boxShadow: AppShadows.cardSubtle,
                  ),
                  child: const Text(
                    'Ничего не найдено по заданным фильтрам.',
                    style: TextStyle(color: AppColors.textSecondary),
                  ),
                );
              }

              final member = filtered[index - 1];
              final isExpanded = _expandedMemberIds.contains(member.id);
              return Container(
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(AppRadius.lg),
                  boxShadow: AppShadows.cardSubtle,
                ),
                child: InkWell(
                  borderRadius: BorderRadius.circular(AppRadius.lg),
                  onTap: () {
                    setState(() {
                      if (isExpanded) {
                        _expandedMemberIds.remove(member.id);
                      } else {
                        _expandedMemberIds.add(member.id);
                      }
                    });
                  },
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            CircleAvatar(
                              radius: 18,
                              backgroundColor: member.isActive
                                  ? AppColors.primary.withValues(alpha: 0.1)
                                  : AppColors.textTertiary.withValues(alpha: 0.2),
                              child: Icon(
                                Icons.person_rounded,
                                size: 18,
                                color: member.isActive
                                    ? AppColors.primary
                                    : AppColors.textTertiary,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _displayName(member),
                                    style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.textPrimary,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  _Badge(
                                    text: member.isActive ? 'Активный' : 'Неактивный',
                                    color: member.isActive
                                        ? const Color(0xFF0D9488)
                                        : AppColors.textTertiary,
                                  ),
                                ],
                              ),
                            ),
                            Icon(
                              isExpanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                              color: AppColors.textSecondary,
                            ),
                          ],
                        ),
                        if (isExpanded) ...[
                          const SizedBox(height: 10),
                          const Divider(height: 1),
                          const SizedBox(height: 10),
                          _DetailRow(
                            icon: Icons.phone_rounded,
                            label: 'Телефон',
                            value: member.phoneNumber ?? 'Не указан',
                          ),
                          _DetailRow(
                            icon: Icons.cake_rounded,
                            label: 'День рождения',
                            value: member.birthDate ?? 'Не указан',
                          ),
                          _DetailRow(
                            icon: Icons.workspace_premium_rounded,
                            label: 'Роль',
                            value: (member.ministryRole?.trim().isNotEmpty ?? false)
                                ? member.ministryRole!
                                : 'Не указана',
                          ),
                          _DetailRow(
                            icon: Icons.admin_panel_settings_rounded,
                            label: 'Доступ в проект',
                            value: member.isAdmin ? 'Администратор' : 'Пользователь',
                          ),
                          _DetailRow(
                            icon: Icons.account_tree_rounded,
                            label: 'Направление',
                            value: (member.ministryDirection?.trim().isNotEmpty ?? false)
                                ? member.ministryDirection!
                                : 'Не указано',
                          ),
                          _DetailRow(
                            icon: Icons.volunteer_activism_rounded,
                            label: 'Текущая нужда',
                            value: (member.prayerRequest?.trim().isNotEmpty ?? false)
                                ? member.prayerRequest!
                                : 'Не указана',
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              OutlinedButton.icon(
                                onPressed: () => widget.onUpdateMember(member),
                                icon: const Icon(Icons.edit_rounded, size: 16),
                                label: const Text('Редактировать'),
                              ),
                              OutlinedButton.icon(
                                onPressed: () => _editPrayerRequest(member),
                                icon: const Icon(Icons.notes_rounded, size: 16),
                                label: const Text('Нужда'),
                              ),
                              OutlinedButton.icon(
                                onPressed: () => widget.onSetOneTimeDate(member),
                                icon: const Icon(Icons.event_available_rounded, size: 16),
                                label: const Text('Дата (1 раз)'),
                              ),
                              OutlinedButton.icon(
                                onPressed: () => widget.onToggleStatus(member),
                                icon: const Icon(Icons.toggle_on_rounded, size: 16),
                                label: Text(member.isActive ? 'Деактивировать' : 'Активировать'),
                              ),
                              OutlinedButton.icon(
                                onPressed: () => widget.onToggleAdminRole(member),
                                icon: const Icon(Icons.admin_panel_settings_rounded, size: 16),
                                label: Text(
                                  member.isAdmin ? 'Снять админа' : 'Назначить админом',
                                ),
                              ),
                              OutlinedButton.icon(
                                onPressed: () => widget.onDeleteMember(member),
                                icon: const Icon(Icons.delete_outline_rounded, size: 16),
                                label: const Text('Удалить'),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Theme(
                            data: Theme.of(context).copyWith(
                              dividerColor: Colors.transparent,
                            ),
                            child: ExpansionTile(
                              tilePadding: EdgeInsets.zero,
                              childrenPadding: EdgeInsets.zero,
                              title: const Text(
                                'История нужд',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.textSecondary,
                                ),
                              ),
                              trailing: IconButton(
                                onPressed: () => _refreshHistory(member.id),
                                icon: const Icon(Icons.refresh_rounded, size: 18),
                                tooltip: 'Обновить историю',
                              ),
                              children: [
                                FutureBuilder<List<PrayerRequestHistoryItem>>(
                                  future: _loadHistory(member.id),
                                  builder: (context, snapshot) {
                                    if (snapshot.connectionState == ConnectionState.waiting) {
                                      return const Padding(
                                        padding: EdgeInsets.only(bottom: 8),
                                        child: SizedBox(
                                          height: 20,
                                          width: 20,
                                          child: CircularProgressIndicator(strokeWidth: 2),
                                        ),
                                      );
                                    }
                                    if (snapshot.hasError) {
                                      return const Padding(
                                        padding: EdgeInsets.only(bottom: 8),
                                        child: Text(
                                          'Не удалось загрузить историю нужд',
                                          style: TextStyle(color: AppColors.textSecondary),
                                        ),
                                      );
                                    }

                                    final items = snapshot.data ?? const <PrayerRequestHistoryItem>[];
                                    if (items.isEmpty) {
                                      return const Padding(
                                        padding: EdgeInsets.only(bottom: 8),
                                        child: Text(
                                          'История пока пустая',
                                          style: TextStyle(color: AppColors.textSecondary),
                                        ),
                                      );
                                    }

                                    return Column(
                                      children: items
                                          .map(
                                            (entry) => _PrayerHistoryRow(
                                              dateText: DateFormat('dd.MM.yyyy HH:mm')
                                                  .format(entry.createdAt.toLocal()),
                                              text: entry.prayerRequest,
                                            ),
                                          )
                                          .toList(growable: false),
                                    );
                                  },
                                ),
                              ],
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        );
      },
      loading: () => const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      ),
      error: (error, stackTrace) => Center(
        child: Padding(
          padding: EdgeInsets.all(padding),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Не удалось загрузить список участников',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: widget.onRefresh,
                child: const Text('Повторить'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

enum _UsersStatusFilter { all, active, inactive }

enum _UsersRoleFilter { all, withRole, withoutRole }

enum _UsersDirectionFilter { all, withDirection, withoutDirection }

enum _UsersSortMode { fullNameAsc, fullNameDesc, createdNewest, createdOldest }

class _MiniStat extends StatelessWidget {
  const _MiniStat({
    required this.title,
    required this.value,
    required this.color,
  });

  final String title;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 11,
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class _CalendarOverviewCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.info_outline_rounded, color: AppColors.primary, size: 24),
              ),
              const SizedBox(width: 14),
              const Expanded(
                child: Text(
                  'Как работает календарь молитвы',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _OverviewItem(
            icon: Icons.people_rounded,
            title: 'Участники',
            text: 'Каждый день назначается один участник по циклу. Нужда участника отображается в разделе «Молитва».',
          ),
          const SizedBox(height: 12),
          _OverviewItem(
            icon: Icons.public_rounded,
            title: 'Темы и служения',
            text: 'Глобальные темы и служения тоже идут по циклу — до 3 тем и 3 служений на дату. Управляются в «Глобальные нужды».',
          ),
          const SizedBox(height: 12),
          _OverviewItem(
            icon: Icons.replay_rounded,
            title: 'Цикл',
            text: '«Запустить новый цикл» сбрасывает привязку к дате. «Заполнить нужды» показывает участников на следующую неделю для ввода молитвенных нужд.',
          ),
        ],
      ),
    );
  }
}

class _OverviewItem extends StatelessWidget {
  const _OverviewItem({
    required this.icon,
    required this.title,
    required this.text,
  });

  final IconData icon;
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: AppColors.primary),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                text,
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.textSecondary,
                  height: 1.45,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CalendarActionsCard extends StatelessWidget {
  const _CalendarActionsCard({
    required this.onStartCycle,
    required this.onLoadNextWeek,
    required this.onOpenGlobalNeeds,
  });

  final VoidCallback onStartCycle;
  final VoidCallback onLoadNextWeek;
  final VoidCallback onOpenGlobalNeeds;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        boxShadow: AppShadows.cardSubtle,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'ДЕЙСТВИЯ',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Управление календарём',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: onStartCycle,
            icon: const Icon(Icons.play_arrow_rounded),
            label: const Text('Запустить новый цикл'),
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
              minimumSize: const Size(double.infinity, 0),
            ),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: onLoadNextWeek,
            icon: const Icon(Icons.event_note_rounded),
            label: const Text('Участники на следующую неделю'),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
              minimumSize: const Size(double.infinity, 0),
            ),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: onOpenGlobalNeeds,
            icon: const Icon(Icons.public_rounded),
            label: const Text('Глобальные нужды (темы, служения, отпавшие)'),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
              minimumSize: const Size(double.infinity, 0),
            ),
          ),
        ],
      ),
    );
  }
}

class _CalendarSettingsTab extends ConsumerStatefulWidget {
  const _CalendarSettingsTab({
    required this.onStartPrayerCycle,
  });

  final Future<void> Function() onStartPrayerCycle;

  @override
  ConsumerState<_CalendarSettingsTab> createState() => _CalendarSettingsTabState();
}

class _CalendarSettingsTabState extends ConsumerState<_CalendarSettingsTab> {
  Future<List<UpcomingWeekMemberAssignment>>? _nextWeekFuture;
  final Map<int, TextEditingController> _controllers = {};
  final Set<int> _savingMemberIds = <int>{};
  bool _showNextWeekNeeds = false;

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  void _ensureController(int memberId, String initialValue) {
    if (_controllers.containsKey(memberId)) {
      return;
    }
    _controllers[memberId] = TextEditingController(text: initialValue);
  }

  Future<void> _loadNextWeekMembers() async {
    setState(() {
      _showNextWeekNeeds = true;
      _nextWeekFuture = ref.read(adminMembersProvider.notifier).getNextWeekMembers();
    });
  }

  Future<void> _openGlobalNeedsDialog() async {
    await showDialog<void>(
      context: context,
      builder: (ctx) => _GlobalNeedsDialog(
        repository: ref.read(adminRepositoryProvider),
      ),
    );
  }

  Future<void> _savePrayerRequest({
    required int memberId,
    required DateTime date,
  }) async {
    final controller = _controllers[memberId];
    if (controller == null) {
      return;
    }

    setState(() => _savingMemberIds.add(memberId));
    try {
      await ref.read(adminMembersProvider.notifier).updateMemberPrayerRequest(
            memberId: memberId,
            prayerRequest: controller.text,
          );
      if (!mounted) return;
      final dateText = DateFormat('dd.MM.yyyy', 'ru').format(date);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Нужда сохранена на дату $dateText')),
      );
      await _loadNextWeekMembers();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось сохранить нужду')),
      );
    } finally {
      if (mounted) {
        setState(() => _savingMemberIds.remove(memberId));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final padding = Responsive.horizontalPadding(context);
    return ListView(
      padding: EdgeInsets.fromLTRB(padding, 16, padding, 24),
      children: [
        _CalendarOverviewCard(),
        const SizedBox(height: 16),
        _CalendarActionsCard(
          onStartCycle: widget.onStartPrayerCycle,
          onLoadNextWeek: _loadNextWeekMembers,
          onOpenGlobalNeeds: _openGlobalNeedsDialog,
        ),
        if (_showNextWeekNeeds) ...[
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppColors.surfaceElevated,
              borderRadius: BorderRadius.circular(AppRadius.lg),
              boxShadow: AppShadows.cardSubtle,
            ),
            child: FutureBuilder<List<UpcomingWeekMemberAssignment>>(
              future: _nextWeekFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(32),
                      child: CircularProgressIndicator(color: AppColors.primary),
                    ),
                  );
                }
                if (snapshot.hasError) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.error_outline_rounded, color: AppColors.accent),
                          const SizedBox(width: 8),
                          const Expanded(
                            child: Text(
                              'Не удалось загрузить расписание',
                              style: TextStyle(
                                color: AppColors.textPrimary,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          OutlinedButton.icon(
                            onPressed: _loadNextWeekMembers,
                            icon: const Icon(Icons.refresh_rounded, size: 18),
                            label: const Text('Повторить'),
                          ),
                        ],
                      ),
                    ],
                  );
                }

                final assignments = snapshot.data ?? const <UpcomingWeekMemberAssignment>[];
                if (assignments.isEmpty) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Участники на следующую неделю',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'На будущую неделю назначений нет. Добавьте участников во вкладке «Пользователи».',
                        style: TextStyle(
                          fontSize: 14,
                          color: AppColors.textSecondary,
                          height: 1.4,
                        ),
                      ),
                    ],
                  );
                }

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.calendar_month_rounded, color: AppColors.primary, size: 22),
                        const SizedBox(width: 10),
                        const Expanded(
                          child: Text(
                            'Участники на следующую неделю',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: AppColors.textPrimary,
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: _loadNextWeekMembers,
                          icon: const Icon(Icons.refresh_rounded),
                          tooltip: 'Обновить',
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Введите молитвенные нужды для каждого участника. Они отобразятся в разделе «Молитва» в день назначения.',
                      style: TextStyle(
                        fontSize: 13,
                        color: AppColors.textSecondary,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 16),
                    ...assignments.map((item) {
                      final dateText = DateFormat('EEEE, d MMMM', 'ru').format(item.date);
                      final shortDate = DateFormat('dd.MM', 'ru').format(item.date);
                      final memberId = item.memberId;
                      if (memberId == null || item.memberName == null) {
                        return Container(
                          margin: const EdgeInsets.only(bottom: 12),
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: AppColors.surface,
                            borderRadius: BorderRadius.circular(AppRadius.md),
                            border: Border.all(color: AppColors.dividerLight),
                          ),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: AppColors.textTertiary.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  shortDate,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  '$dateText — участник не назначен',
                                  style: const TextStyle(
                                    fontSize: 14,
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      }

                      _ensureController(memberId, item.prayerRequest ?? '');
                      final isSaving = _savingMemberIds.contains(memberId);
                      return Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(AppRadius.md),
                          border: Border.all(color: AppColors.dividerLight),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                  decoration: BoxDecoration(
                                    color: AppColors.primary.withValues(alpha: 0.12),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    shortDate,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.primary,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        dateText,
                                        style: const TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w700,
                                          color: AppColors.textPrimary,
                                        ),
                                      ),
                                      Text(
                                        item.memberName!,
                                        style: const TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w600,
                                          color: AppColors.textSecondary,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: _controllers[memberId],
                              minLines: 2,
                              maxLines: 4,
                              decoration: const InputDecoration(
                                labelText: 'Молитвенная нужда',
                                hintText: 'Введите нужду участника для молитвы в этот день',
                                alignLabelWithHint: true,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Align(
                              alignment: Alignment.centerRight,
                              child: FilledButton.icon(
                                onPressed: isSaving
                                    ? null
                                    : () => _savePrayerRequest(
                                          memberId: memberId,
                                          date: item.date,
                                        ),
                                icon: isSaving
                                    ? const SizedBox(
                                        width: 16,
                                        height: 16,
                                        child: CircularProgressIndicator(strokeWidth: 2),
                                      )
                                    : const Icon(Icons.save_rounded),
                                label: const Text('Сохранить'),
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                  ],
                );
              },
            ),
          ),
        ],
      ],
    );
  }
}

class _SystemTemplatesTab extends StatelessWidget {
  const _SystemTemplatesTab({
    required this.roleTemplatesAsync,
    required this.directionTemplatesAsync,
    required this.onRefreshRoles,
    required this.onRefreshDirections,
    required this.onAddRoleTemplate,
    required this.onDeleteRoleTemplate,
    required this.onAddDirectionTemplate,
    required this.onDeleteDirectionTemplate,
  });

  final AsyncValue<List<AdminRoleTemplate>> roleTemplatesAsync;
  final AsyncValue<List<AdminDirectionTemplate>> directionTemplatesAsync;
  final Future<void> Function() onRefreshRoles;
  final Future<void> Function() onRefreshDirections;
  final Future<void> Function() onAddRoleTemplate;
  final Future<void> Function(AdminRoleTemplate template) onDeleteRoleTemplate;
  final Future<void> Function() onAddDirectionTemplate;
  final Future<void> Function(AdminDirectionTemplate template) onDeleteDirectionTemplate;

  @override
  Widget build(BuildContext context) {
    final padding = Responsive.horizontalPadding(context);
    return ListView(
      padding: EdgeInsets.fromLTRB(padding, 16, padding, 24),
      children: [
        _TemplatesSection<AdminDirectionTemplate>(
          title: 'Направления служений',
          subtitle: 'Справочник направлений для назначения в карточке участника.',
          icon: Icons.account_tree_rounded,
          templatesAsync: directionTemplatesAsync,
          onRefresh: onRefreshDirections,
          onAdd: onAddDirectionTemplate,
          addButtonLabel: 'Добавить направление',
          getTitle: (item) => item.title,
          onDelete: onDeleteDirectionTemplate,
        ),
        const SizedBox(height: 14),
        _TemplatesSection<AdminRoleTemplate>(
          title: 'Роли в церкви',
          subtitle: 'Системные роли и пользовательские роли служения.',
          icon: Icons.workspace_premium_rounded,
          templatesAsync: roleTemplatesAsync,
          onRefresh: onRefreshRoles,
          onAdd: onAddRoleTemplate,
          addButtonLabel: 'Добавить роль',
          getTitle: (item) => item.title,
          onDelete: onDeleteRoleTemplate,
        ),
      ],
    );
  }
}

class _TemplatesSection<T> extends StatelessWidget {
  const _TemplatesSection({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.templatesAsync,
    required this.onRefresh,
    required this.onAdd,
    required this.addButtonLabel,
    required this.getTitle,
    required this.onDelete,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final AsyncValue<List<T>> templatesAsync;
  final Future<void> Function() onRefresh;
  final Future<void> Function() onAdd;
  final String addButtonLabel;
  final String Function(T item) getTitle;
  final Future<void> Function(T template) onDelete;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        boxShadow: AppShadows.cardSubtle,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: AppColors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              IconButton(
                onPressed: onRefresh,
                icon: const Icon(Icons.refresh_rounded),
                tooltip: 'Обновить',
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: const TextStyle(
              fontSize: 13,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: onAdd,
            icon: const Icon(Icons.add_rounded),
            label: Text(addButtonLabel),
          ),
          const SizedBox(height: 10),
          templatesAsync.when(
            data: (templates) {
              if (templates.isEmpty) {
                return const Text(
                  'Пока пусто',
                  style: TextStyle(color: AppColors.textSecondary),
                );
              }
              return Column(
                children: templates
                    .map(
                      (template) => Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(AppRadius.md),
                        ),
                        child: ListTile(
                          dense: true,
                          title: Text(getTitle(template)),
                          trailing: IconButton(
                            onPressed: () => onDelete(template),
                            icon: const Icon(Icons.delete_outline_rounded),
                          ),
                        ),
                      ),
                    )
                    .toList(growable: false),
              );
            },
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 10),
              child: SizedBox(
                height: 24,
                width: 24,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
            error: (error, stackTrace) => const Text(
              'Не удалось загрузить',
              style: TextStyle(color: AppColors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}

class _MemberFormPayload {
  const _MemberFormPayload({
    required this.firstName,
    required this.lastName,
    required this.phoneNumber,
    required this.birthDate,
    this.ministryRole,
    this.ministryDirection,
  });

  final String firstName;
  final String lastName;
  final String phoneNumber;
  final String birthDate;
  final String? ministryRole;
  final String? ministryDirection;
}

Future<_MemberFormPayload?> _showMemberFormDialog(
  BuildContext context, {
  AdminMember? initial,
  List<AdminRoleTemplate> roleTemplates = const [],
  List<AdminDirectionTemplate> directionTemplates = const [],
}) async {
  var firstNameValue = initial?.firstName ?? '';
  var lastNameValue = initial?.lastName ?? '';
  var phoneValue = initial?.phoneNumber ?? '';
  var birthDateValue = initial?.birthDate ?? '';
  var ministryRoleValue = initial?.ministryRole ?? '';
  var ministryDirectionValue = initial?.ministryDirection ?? '';
  final formKey = GlobalKey<FormState>();

  final result = await showDialog<_MemberFormPayload>(
    context: context,
    builder: (dialogContext) {
      return StatefulBuilder(
        builder: (context, setDialogState) {
          return AlertDialog(
            title: Text(initial == null ? 'Новый участник' : 'Редактировать участника'),
            content: Form(
              key: formKey,
              child: SizedBox(
                width: 420,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextFormField(
                      initialValue: firstNameValue,
                      decoration: const InputDecoration(labelText: 'Имя *'),
                      onChanged: (value) => firstNameValue = value,
                      validator: (value) {
                        if (value == null || value.trim().isEmpty) {
                          return 'Введите имя';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      initialValue: lastNameValue,
                      decoration: const InputDecoration(labelText: 'Фамилия *'),
                      onChanged: (value) => lastNameValue = value,
                      validator: (value) {
                        if (value == null || value.trim().isEmpty) {
                          return 'Введите фамилию';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      initialValue: phoneValue,
                      decoration: const InputDecoration(labelText: 'Номер телефона *'),
                      keyboardType: TextInputType.phone,
                      maxLength: 20,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9+\-() ]')),
                      ],
                      onChanged: (value) => phoneValue = value,
                      validator: (value) {
                        final text = value?.trim() ?? '';
                        if (text.isEmpty) {
                          return 'Введите номер телефона';
                        }
                        if (text.length < 7) {
                          return 'Слишком короткий номер';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      key: ValueKey('birthDate:$birthDateValue'),
                      initialValue: birthDateValue,
                      readOnly: true,
                      decoration: const InputDecoration(
                        labelText: 'Дата рождения (YYYY-MM-DD) *',
                        suffixIcon: Icon(Icons.calendar_today_rounded),
                      ),
                      onTap: () async {
                        final selected = await showDatePicker(
                          context: context,
                          initialDate: DateTime.tryParse(birthDateValue) ??
                              DateTime(1990, 1, 1),
                          firstDate: DateTime(1900, 1, 1),
                          lastDate: DateTime.now(),
                        );
                        if (selected == null) {
                          return;
                        }
                        setDialogState(
                          () => birthDateValue = DateFormat('yyyy-MM-dd').format(selected),
                        );
                      },
                      validator: (value) {
                        final text = (value ?? '').trim();
                        final pattern = RegExp(r'^\d{4}-\d{2}-\d{2}$');
                        if (text.isEmpty) {
                          return 'Выберите дату рождения';
                        }
                        if (!pattern.hasMatch(text)) {
                          return 'Формат: YYYY-MM-DD';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 10),
                    TextFormField(
                      key: ValueKey('ministryRole:$ministryRoleValue'),
                      initialValue: ministryRoleValue,
                      decoration: const InputDecoration(
                        labelText: 'Роль в служении',
                        hintText: 'Например: лидер прославления',
                      ),
                      onChanged: (value) => ministryRoleValue = value,
                    ),
                    if (roleTemplates.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: roleTemplates
                              .map(
                                (template) => ActionChip(
                                  label: Text(template.title),
                                  onPressed: () {
                                    setDialogState(() => ministryRoleValue = template.title);
                                  },
                                ),
                              )
                              .toList(growable: false),
                        ),
                      ),
                    ],
                    const SizedBox(height: 10),
                    TextFormField(
                      key: ValueKey('ministryDirection:$ministryDirectionValue'),
                      initialValue: ministryDirectionValue,
                      decoration: const InputDecoration(
                        labelText: 'Направление служения',
                        hintText: 'Например: молодежное служение',
                      ),
                      onChanged: (value) => ministryDirectionValue = value,
                    ),
                    if (directionTemplates.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: directionTemplates
                              .map(
                                (template) => ActionChip(
                                  label: Text(template.title),
                                  onPressed: () {
                                    setDialogState(() => ministryDirectionValue = template.title);
                                  },
                                ),
                              )
                              .toList(growable: false),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: const Text('Отмена'),
              ),
              FilledButton(
                onPressed: () {
                  final isValid = formKey.currentState?.validate() ?? false;
                  if (!isValid) {
                    return;
                  }

                  Navigator.of(dialogContext).pop(
                    _MemberFormPayload(
                      firstName: firstNameValue.trim(),
                      lastName: lastNameValue.trim(),
                      phoneNumber: phoneValue.trim(),
                      birthDate: birthDateValue.trim(),
                      ministryRole:
                          ministryRoleValue.trim().isEmpty ? null : ministryRoleValue.trim(),
                      ministryDirection: ministryDirectionValue.trim().isEmpty
                          ? null
                          : ministryDirectionValue.trim(),
                    ),
                  );
                },
                child: Text(initial == null ? 'Добавить' : 'Сохранить'),
              ),
            ],
          );
        },
      );
    },
  );

  return result;
}

class _Badge extends StatelessWidget {
  const _Badge({
    required this.text,
    required this.color,
  });

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadius.full),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.3,
          color: color,
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: AppColors.textTertiary),
          const SizedBox(width: 10),
          Expanded(
            child: RichText(
              text: TextSpan(
                style: const TextStyle(
                  fontSize: 14,
                  color: AppColors.textSecondary,
                  height: 1.5,
                  letterSpacing: 0.1,
                ),
                children: [
                  TextSpan(
                    text: '$label: ',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  TextSpan(text: value),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PrayerHistoryRow extends StatelessWidget {
  const _PrayerHistoryRow({
    required this.dateText,
    required this.text,
  });

  final String dateText;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: AppColors.textTertiary.withValues(alpha: 0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            dateText,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: AppColors.textTertiary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            text,
            style: const TextStyle(
              fontSize: 14,
              height: 1.4,
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class _GlobalNeedsDialog extends ConsumerStatefulWidget {
  const _GlobalNeedsDialog({required this.repository});

  final AdminRepository repository;

  @override
  ConsumerState<_GlobalNeedsDialog> createState() => _GlobalNeedsDialogState();
}

class _GlobalNeedsDialogState extends ConsumerState<_GlobalNeedsDialog>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<AdminGlobalTheme> _themes = [];
  List<AdminMinistry> _ministries = [];
  List<AdminBackslider> _backsliders = [];
  List<NextWeekGlobalAssignment> _nextWeek = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        widget.repository.getGlobalThemes(),
        widget.repository.getMinistries(),
        widget.repository.getBacksliders(),
        widget.repository.getNextWeekGlobalAssignments(),
      ]);
      if (!mounted) return;
      setState(() {
        _themes = results[0] as List<AdminGlobalTheme>;
        _ministries = results[1] as List<AdminMinistry>;
        _backsliders = results[2] as List<AdminBackslider>;
        _nextWeek = results[3] as List<NextWeekGlobalAssignment>;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720, maxHeight: 640),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(24, 20, 16, 16),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.public_rounded, color: AppColors.primary, size: 24),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Глобальные нужды',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            color: AppColors.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Темы, служения и отпавшие — циклично по датам',
                          style: TextStyle(
                            fontSize: 13,
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded),
                    tooltip: 'Закрыть',
                  ),
                ],
              ),
            ),
            TabBar(
              controller: _tabController,
              labelColor: AppColors.primary,
              unselectedLabelColor: AppColors.textSecondary,
              tabs: const [
                Tab(text: 'Расписание'),
                Tab(text: 'Темы'),
                Tab(text: 'Служения'),
                Tab(text: 'Отпавшие'),
              ],
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
                  : _error != null
                      ? Padding(
                          padding: const EdgeInsets.all(20),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(_error!, style: const TextStyle(color: AppColors.accent)),
                              const SizedBox(height: 12),
                              FilledButton(
                                onPressed: _load,
                                child: const Text('Повторить'),
                              ),
                            ],
                          ),
                        )
                      : TabBarView(
                          controller: _tabController,
                          children: [
                            _NextWeekTable(assignments: _nextWeek),
                            _GlobalNeedsList<AdminGlobalTheme>(
                              items: _themes,
                              titleKey: (t) => t.title,
                              subtitleKey: (t) => t.prayerPoints ?? t.bibleVerse,
                              onAdd: _addTheme,
                              onEdit: _editTheme,
                              onDelete: (t) => _deleteTheme(t.id),
                              onRefresh: _load,
                            ),
                            _GlobalNeedsList<AdminMinistry>(
                              items: _ministries,
                              titleKey: (m) => m.title,
                              subtitleKey: (m) => m.prayerPoints,
                              onAdd: _addMinistry,
                              onEdit: _editMinistry,
                              onDelete: (m) => _deleteMinistry(m.id),
                              onRefresh: _load,
                            ),
                            _GlobalNeedsList<AdminBackslider>(
                              items: _backsliders,
                              titleKey: (b) => b.name,
                              subtitleKey: (_) => null,
                              onAdd: _addBackslider,
                              onEdit: _editBackslider,
                              onDelete: (b) => _deleteBackslider(b.id),
                              onRefresh: _load,
                            ),
                          ],
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _addTheme() async {
    final result = await showDialog<_ThemeDialogResult>(
      context: context,
      builder: (ctx) => const _ThemeDialog(),
    );
    if (result != null && result.title.isNotEmpty) {
      try {
        await widget.repository.createGlobalTheme(
          title: result.title,
          bibleVerse: result.bibleVerse,
          prayerPoints: result.prayerPoints,
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Тема добавлена')),
        );
        _load();
      } catch (_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Не удалось добавить тему')),
        );
      }
    }
  }

  Future<void> _editTheme(AdminGlobalTheme theme) async {
    final result = await showDialog<_ThemeDialogResult>(
      context: context,
      builder: (ctx) => _ThemeDialog(
        dialogTitle: 'Редактировать тему',
        submitLabel: 'Сохранить',
        initialTitle: theme.title,
        initialBibleVerse: theme.bibleVerse,
        initialPrayerPoints: theme.prayerPoints,
      ),
    );
    if (result == null || result.title.isEmpty) {
      return;
    }

    try {
      await widget.repository.updateGlobalTheme(
        theme.id,
        title: result.title,
        bibleVerse: result.bibleVerse,
        prayerPoints: result.prayerPoints,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Тема обновлена')),
      );
      _load();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось обновить тему')),
      );
    }
  }

  Future<void> _deleteTheme(int id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Удалить тему?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Удалить')),
        ],
      ),
    );
    if (ok == true) {
      try {
        await widget.repository.deleteGlobalTheme(id);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Тема удалена')),
        );
        _load();
      } catch (_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Не удалось удалить тему')),
        );
      }
    }
  }

  Future<void> _addMinistry() async {
    final result = await showDialog<_MinistryDialogResult>(
      context: context,
      builder: (ctx) => const _MinistryDialog(),
    );
    if (result != null && result.title.isNotEmpty) {
      try {
        await widget.repository.createMinistry(
          title: result.title,
          prayerPoints: result.prayerPoints,
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Служение добавлено')),
        );
        _load();
      } catch (_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Не удалось добавить служение')),
        );
      }
    }
  }

  Future<void> _editMinistry(AdminMinistry ministry) async {
    final result = await showDialog<_MinistryDialogResult>(
      context: context,
      builder: (ctx) => _MinistryDialog(
        dialogTitle: 'Редактировать служение',
        submitLabel: 'Сохранить',
        initialTitle: ministry.title,
        initialPrayerPoints: ministry.prayerPoints,
      ),
    );
    if (result != null && result.title.isNotEmpty) {
      try {
        await widget.repository.updateMinistry(
          ministry.id,
          title: result.title,
          prayerPoints: result.prayerPoints,
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Служение обновлено')),
        );
        _load();
      } catch (_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Не удалось обновить служение')),
        );
      }
    }
  }

  Future<void> _deleteMinistry(int id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Удалить служение?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Удалить')),
        ],
      ),
    );
    if (ok == true) {
      try {
        await widget.repository.deleteMinistry(id);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Служение удалено')),
        );
        _load();
      } catch (_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Не удалось удалить служение')),
        );
      }
    }
  }

  Future<void> _addBackslider() async {
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => _SimpleTextDialog(
        title: 'Новый отпавший',
        hint: 'Имя',
        submitLabel: 'Добавить',
      ),
    );
    if (name != null && name.isNotEmpty) {
      try {
        await widget.repository.createBackslider(name: name);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Отпавший добавлен')),
        );
        _load();
      } catch (_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Не удалось добавить')),
        );
      }
    }
  }

  Future<void> _editBackslider(AdminBackslider backslider) async {
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => _SimpleTextDialog(
        title: 'Редактировать отпавшего',
        hint: 'Имя',
        submitLabel: 'Сохранить',
        initialValue: backslider.name,
      ),
    );
    if (name == null || name.isEmpty) {
      return;
    }

    try {
      await widget.repository.updateBackslider(backslider.id, name: name);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Данные обновлены')),
      );
      _load();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось обновить')),
      );
    }
  }

  Future<void> _deleteBackslider(int id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Удалить отпавшего?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Удалить')),
        ],
      ),
    );
    if (ok == true) {
      try {
        await widget.repository.deleteBackslider(id);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Отпавший удалён')),
        );
        _load();
      } catch (_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Не удалось удалить')),
        );
      }
    }
  }
}

class _NextWeekTable extends StatelessWidget {
  const _NextWeekTable({required this.assignments});

  final List<NextWeekGlobalAssignment> assignments;

  @override
  Widget build(BuildContext context) {
    if (assignments.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.calendar_today_rounded, size: 48, color: AppColors.textTertiary),
              const SizedBox(height: 12),
              const Text(
                'Нет данных на будущую неделю',
                style: TextStyle(fontSize: 15, color: AppColors.textSecondary),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              const Text(
                'Добавьте темы, служения и отпавших во вкладках выше.',
                style: TextStyle(fontSize: 13, color: AppColors.textTertiary),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text(
          'Расписание на следующую неделю',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Темы, служения и отпавшие назначаются циклично по датам.',
          style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
        ),
        const SizedBox(height: 16),
        ...assignments.map((a) {
          final dateStr = DateFormat('EEEE, d MMMM', 'ru').format(a.date);
          final shortDate = DateFormat('dd.MM', 'ru').format(a.date);
          final hasData = a.themes.isNotEmpty || a.ministries.isNotEmpty || a.backslider != null;
          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: hasData ? AppColors.surface : AppColors.surface,
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(
                color: hasData
                    ? AppColors.primary.withValues(alpha: 0.2)
                    : AppColors.dividerLight,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: hasData
                            ? AppColors.primary.withValues(alpha: 0.12)
                            : AppColors.textTertiary.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        shortDate,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: hasData ? AppColors.primary : AppColors.textSecondary,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        dateStr,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ),
                  ],
                ),
                if (a.themes.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _AssignmentRow(
                    icon: Icons.public_rounded,
                    label: 'Темы',
                    values: a.themes.map((t) => t.title).toList(),
                  ),
                ],
                if (a.ministries.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  _AssignmentRow(
                    icon: Icons.handyman_rounded,
                    label: 'Служения',
                    values: a.ministries.map((m) => m.title).toList(),
                  ),
                ],
                if (a.backslider != null) ...[
                  const SizedBox(height: 4),
                  _AssignmentRow(
                    icon: Icons.person_off_rounded,
                    label: 'Отпавший',
                    values: [a.backslider!.name],
                  ),
                ],
                if (!hasData)
                  const Padding(
                    padding: EdgeInsets.only(top: 6),
                    child: Text(
                      'Нет назначений',
                      style: TextStyle(fontSize: 13, color: AppColors.textTertiary),
                    ),
                  ),
              ],
            ),
          );
        }),
      ],
    );
  }
}

class _AssignmentRow extends StatelessWidget {
  const _AssignmentRow({
    required this.icon,
    required this.label,
    required this.values,
  });

  final IconData icon;
  final String label;
  final List<String> values;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 16, color: AppColors.textSecondary),
        const SizedBox(width: 8),
        SizedBox(
          width: 70,
          child: Text(
            '$label:',
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppColors.textSecondary,
            ),
          ),
        ),
        Expanded(
          child: Text(
            values.join(', '),
            style: const TextStyle(fontSize: 13, color: AppColors.textPrimary),
          ),
        ),
      ],
    );
  }
}

class _GlobalNeedsList<T> extends StatelessWidget {
  const _GlobalNeedsList({
    required this.items,
    required this.titleKey,
    required this.subtitleKey,
    required this.onAdd,
    required this.onEdit,
    required this.onDelete,
    required this.onRefresh,
  });

  final List<T> items;
  final String Function(T) titleKey;
  final String? Function(T)? subtitleKey;
  final VoidCallback onAdd;
  final void Function(T) onEdit;
  final void Function(T) onDelete;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              FilledButton.icon(
                onPressed: onAdd,
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('Добавить'),
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: onRefresh,
                icon: const Icon(Icons.refresh_rounded),
                tooltip: 'Обновить',
              ),
            ],
          ),
        ),
        Expanded(
          child: items.isEmpty
              ? const Center(child: Text('Список пуст'))
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: items.length,
                  itemBuilder: (context, i) {
                    final item = items[i];
                    final subtitle = subtitleKey?.call(item);
                    return ListTile(
                      title: Text(titleKey(item)),
                      subtitle: subtitle != null && subtitle.isNotEmpty
                          ? Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis)
                          : null,
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.edit_outlined),
                            onPressed: () => onEdit(item),
                          ),
                          IconButton(
                            icon: const Icon(Icons.delete_outline_rounded),
                            onPressed: () => onDelete(item),
                          ),
                        ],
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _ThemeDialogResult {
  const _ThemeDialogResult({
    required this.title,
    this.bibleVerse,
    this.prayerPoints,
  });
  final String title;
  final String? bibleVerse;
  final String? prayerPoints;
}

class _ThemeDialog extends StatefulWidget {
  const _ThemeDialog({
    this.dialogTitle = 'Новая тема',
    this.submitLabel = 'Добавить',
    this.initialTitle,
    this.initialBibleVerse,
    this.initialPrayerPoints,
  });

  final String dialogTitle;
  final String submitLabel;
  final String? initialTitle;
  final String? initialBibleVerse;
  final String? initialPrayerPoints;

  @override
  State<_ThemeDialog> createState() => _ThemeDialogState();
}

class _ThemeDialogState extends State<_ThemeDialog> {
  late final TextEditingController _titleController;
  late final TextEditingController _verseController;
  late final TextEditingController _pointsController;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.initialTitle ?? '');
    _verseController = TextEditingController(text: widget.initialBibleVerse ?? '');
    _pointsController = TextEditingController(text: widget.initialPrayerPoints ?? '');
  }

  @override
  void dispose() {
    _titleController.dispose();
    _verseController.dispose();
    _pointsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.dialogTitle),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _titleController,
            decoration: const InputDecoration(labelText: 'Название темы'),
            autofocus: true,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _verseController,
            decoration: const InputDecoration(labelText: 'Стих из Библии'),
            minLines: 1,
            maxLines: 2,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _pointsController,
            decoration: const InputDecoration(labelText: 'Пункты молитвы'),
            minLines: 2,
            maxLines: 4,
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Отмена'),
        ),
        FilledButton(
          onPressed: () {
            final t = _titleController.text.trim();
            if (t.isEmpty) return;
            final v = _verseController.text.trim();
            final p = _pointsController.text.trim();
            Navigator.pop(
              context,
              _ThemeDialogResult(
                title: t,
                bibleVerse: v.isEmpty ? null : v,
                prayerPoints: p.isEmpty ? null : p,
              ),
            );
          },
          child: Text(widget.submitLabel),
        ),
      ],
    );
  }
}

class _MinistryDialogResult {
  const _MinistryDialogResult({
    required this.title,
    this.prayerPoints,
  });

  final String title;
  final String? prayerPoints;
}

class _MinistryDialog extends StatefulWidget {
  const _MinistryDialog({
    this.dialogTitle = 'Новое служение',
    this.submitLabel = 'Добавить',
    this.initialTitle,
    this.initialPrayerPoints,
  });

  final String dialogTitle;
  final String submitLabel;
  final String? initialTitle;
  final String? initialPrayerPoints;

  @override
  State<_MinistryDialog> createState() => _MinistryDialogState();
}

class _MinistryDialogState extends State<_MinistryDialog> {
  late final TextEditingController _titleController;
  late final TextEditingController _pointsController;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.initialTitle ?? '');
    _pointsController = TextEditingController(text: widget.initialPrayerPoints ?? '');
  }

  @override
  void dispose() {
    _titleController.dispose();
    _pointsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.dialogTitle),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _titleController,
            decoration: const InputDecoration(labelText: 'Название служения'),
            autofocus: true,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _pointsController,
            decoration: const InputDecoration(labelText: 'Пункты молитвы'),
            minLines: 2,
            maxLines: 5,
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Отмена'),
        ),
        FilledButton(
          onPressed: () {
            final title = _titleController.text.trim();
            if (title.isEmpty) return;
            final points = _pointsController.text.trim();
            Navigator.pop(
              context,
              _MinistryDialogResult(
                title: title,
                prayerPoints: points.isEmpty ? null : points,
              ),
            );
          },
          child: Text(widget.submitLabel),
        ),
      ],
    );
  }
}

class _SimpleTextDialog extends StatefulWidget {
  const _SimpleTextDialog({
    required this.title,
    required this.hint,
    required this.submitLabel,
    this.initialValue,
  });

  final String title;
  final String hint;
  final String submitLabel;
  final String? initialValue;

  @override
  State<_SimpleTextDialog> createState() => _SimpleTextDialogState();
}

class _SimpleTextDialogState extends State<_SimpleTextDialog> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialValue ?? '');
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(
        controller: _controller,
        decoration: InputDecoration(labelText: widget.hint),
        autofocus: true,
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Отмена'),
        ),
        FilledButton(
          onPressed: () {
            final v = _controller.text.trim();
            if (v.isEmpty) return;
            Navigator.pop(context, v);
          },
          child: Text(widget.submitLabel),
        ),
      ],
    );
  }
}
