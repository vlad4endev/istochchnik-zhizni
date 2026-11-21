import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../core/dates.dart';
import '../../core/session.dart';
import '../../ui/kit/kit.dart';
import '../../ui/widgets.dart';
import '../songbook/widgets/toggle_chip.dart';
import 'data/schedule_repository.dart';
import 'logic/ministry_access.dart';
import 'logic/schedule_labels.dart';
import 'models/schedule_models.dart';
import 'schedule_controller.dart';
import 'widgets/agenda_widgets.dart';
import 'widgets/person_picker.dart';
import 'widgets/team_widgets.dart';

enum _Tab { mine, team }

/// Расписание: «Мои» — что мне предстоит и ответ на назначения; «Команда» — кто где служит на неделе.
class SchedulePage extends StatefulWidget {
  const SchedulePage({super.key, this.source});

  /// Для тестов; в приложении источник создаётся из сессии.
  final ScheduleSource? source;

  @override
  State<SchedulePage> createState() => _SchedulePageState();
}

class _SchedulePageState extends State<SchedulePage> {
  late final ScheduleController _c;
  _Tab _tab = _Tab.mine;
  bool _teamLoaded = false;

  @override
  void initState() {
    super.initState();
    final session = context.read<SessionController>();
    _c = ScheduleController(
      widget.source ?? ScheduleRepository(session),
      access: MinistryAccess.of(session.user),
      userId: session.user?.id ?? 0,
    )..loadMine();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _openTab(_Tab tab) {
    setState(() => _tab = tab);
    if (tab == _Tab.team && !_teamLoaded) {
      _teamLoaded = true;
      _c.loadTeam();
    }
  }

  Future<void> _answer(AgendaItem item, AssignmentStatus status) async {
    try {
      await _c.answer(item, status);
      if (mounted) showMessage(context, status == AssignmentStatus.confirmed ? 'Подтверждено' : 'Отказ отправлен');
    } catch (error) {
      if (mounted) showMessage(context, 'Не удалось отправить ответ — проверьте интернет. Ответ не изменён.');
    }
  }

  Future<void> _confirmAll() async {
    final n = _c.pending.length;
    final failed = await _c.confirmAllPending();
    if (!mounted) return;
    showMessage(context, failed == 0 ? 'Подтверждено: $n' : 'Не удалось отправить: $failed. Попробуйте ещё раз.');
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _c,
      builder: (context, _) {
        final pending = _c.pending.length;
        return ChurchPage(
          title: 'Расписание',
          subtitle: 'Мои назначения и команда',
          subtitleAccent: pending > 0 ? 'ждут ответа: $pending' : null,
          body: _c.ministries.isEmpty && !_c.loadingMine ? const _NoAccess() : _body(),
        );
      },
    );
  }

  Widget _body() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Space.lg, 14, Space.lg, 4),
          child: SegmentedPills<_Tab>(
            segments: [
              (_Tab.mine, _c.pending.isEmpty ? 'Мои' : 'Мои · ${_c.pending.length}'),
              (_Tab.team, 'Команда'),
            ],
            selected: _tab,
            onChanged: _openTab,
          ),
        ),
        Expanded(child: _tab == _Tab.mine ? _mine() : _team()),
      ],
    );
  }

  // ——— мои ———

  Widget _mine() {
    if (_c.loadingMine && _c.agenda.isEmpty) return const LoadingView();
    if (_c.agenda.isEmpty && _c.failedMinistries.length == _c.ministries.length && _c.ministries.isNotEmpty) {
      return ErrorView(message: 'Не удалось загрузить назначения. Проверьте интернет и попробуйте снова.', onRetry: _c.loadMine);
    }
    final today = _c.today;
    final next = _c.next;
    final rest = _c.agenda.length > 1 ? _c.agenda.sublist(1) : const <AgendaItem>[];
    final groups = groupByWeek(rest);
    final stale = _c.staleSince;
    return SheetList(
      onRefresh: _c.loadMine,
      gap: Space.md,
      children: [
        if (stale != null) _Notice(icon: Icons.cloud_off_rounded, text: 'Нет связи — показаны данные ${relativeTime(stale.toIso8601String())}', action: 'Обновить', onAction: _c.loadMine),
        if (_c.failedMinistries.isNotEmpty && _c.agenda.isNotEmpty)
          _Notice(
            icon: Icons.error_outline_rounded,
            text: 'Не удалось загрузить: ${_c.failedMinistries.map((m) => m.shortLabel).join(', ')}',
            action: 'Повторить',
            onAction: _c.loadMine,
          ),
        if (_c.pending.length > 1) PendingBanner(count: _c.pending.length, busy: _c.pending.any(_c.isBusy), onConfirmAll: _confirmAll),
        if (next == null)
          const EmptyHint(
            'Назначений нет',
            icon: Icons.event_available_outlined,
            hint: 'На ближайшие три месяца вас не поставили на служение. Когда назначат — здесь появится запись и придёт уведомление.',
          )
        else
          NextServiceCard(item: next, today: today, busy: _c.isBusy(next), onAnswer: _answer),
        for (final group in groups) ...[
          SectionLabel(weekLabel(group.monday, today)),
          for (final item in group.items) AgendaCard(item: item, today: today, busy: _c.isBusy(item), onAnswer: _answer),
        ],
      ],
    );
  }

  // ——— команда ———

  Widget _team() {
    final m = _c.teamMinistry;
    if (m == null) return const _NoAccess();
    final manage = _c.canManage(m);
    return SheetList(
      onRefresh: _c.loadTeam,
      gap: Space.md,
      children: [
        if (_c.ministries.length > 1)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final x in _c.ministries) ...[
                  ToggleChip(label: x.shortLabel, selected: x == m, icon: ministryIcon(x), onTap: () => _c.selectMinistry(x)),
                  const SizedBox(width: 8),
                ],
              ],
            ),
          ),
        WeekBar(monday: _c.weekStart, thisWeek: _c.isThisWeek, onShift: _c.shiftWeek, onToday: _c.goToThisWeek),
        if (_c.loadingTeam && _c.teamEvents.isEmpty && _c.teamSunday.isEmpty)
          const Padding(padding: EdgeInsets.symmetric(vertical: 48), child: LoadingView())
        else if (_c.teamError != null)
          ErrorView(message: _c.teamError!, onRetry: _c.loadTeam)
        else if (m == Ministry.sunday)
          ..._sundayCards(manage)
        else
          ..._eventCards(manage),
      ],
    );
  }

  List<Widget> _empty(bool manage) => [
        EmptyHint(
          'На этой неделе собраний нет',
          icon: Icons.event_busy_outlined,
          hint: manage ? 'Собрания появляются, когда на сайте создают программу служения.' : 'Загляните на другую неделю — стрелки сверху.',
        ),
      ];

  List<Widget> _eventCards(bool manage) {
    if (_c.teamEvents.isEmpty) return _empty(manage);
    return [
      for (final e in _c.teamEvents)
        EventTeamCard(
          event: e,
          roles: _c.teamRoles,
          me: _c.userId,
          manage: manage,
          onRole: (role, current) => _pickForRole(e, role, current),
        ),
    ];
  }

  List<Widget> _sundayCards(bool manage) {
    if (_c.teamSunday.isEmpty) return _empty(manage);
    return [
      for (final p in _c.teamSunday)
        SundayTeamCard(
          plan: p,
          me: _c.userId,
          manage: manage,
          onLeader: () => _pickSunday(p, leader: true),
          onPreacher: () => _pickSunday(p, leader: false),
        ),
    ];
  }

  Future<void> _pickForRole(ScheduleEvent event, ScheduleRole role, ScheduleAssignment? current) async {
    String? done;
    await showPersonPicker(
      context,
      title: role.name,
      subtitle: '${friendlyDay(event.date, _c.today)} · ${event.title}',
      load: (everyone) => _c.candidates(role, everyone: everyone),
      current: current == null ? null : PersonRef(id: current.memberId, name: current.memberName, avatarUrl: current.avatarUrl),
      onPick: (person) async {
        await _c.assign(event, role, person);
        done = '${person.name} — ${role.name}';
      },
      onClear: current == null
          ? null
          : () async {
              await _c.unassign(event, current);
              done = 'Снято: ${current.memberName}';
            },
    );
    if (done != null && mounted) showMessage(context, done!);
  }

  Future<void> _pickSunday(SundayPlan plan, {required bool leader}) async {
    final current = leader ? plan.leader : plan.preacher;
    String? done;
    await showPersonPicker(
      context,
      title: leader ? 'Ведущий' : 'Проповедник',
      subtitle: '${friendlyDay(plan.date, _c.today)} · ${plan.title}',
      load: (_) => _c.sundayCandidates(),
      current: current,
      offerEveryone: false,
      clearLabel: 'Снять',
      onPick: (person) async {
        await _c.setSunday(plan, leader: leader, preacher: !leader, person: person);
        done = '${leader ? 'Ведущий' : 'Проповедник'}: ${person.name}';
      },
      onClear: current == null
          ? null
          : () async {
              await _c.setSunday(plan, leader: leader, preacher: !leader);
              done = 'Снято: ${current.name}';
            },
    );
    if (done != null && mounted) showMessage(context, done!);
  }
}

class _NoAccess extends StatelessWidget {
  const _NoAccess();

  @override
  Widget build(BuildContext context) => const EmptyHint(
        'Расписание для служителей',
        icon: Icons.lock_outline_rounded,
        hint: 'Оно открывается тем, кто служит в медиа, музыке или ведёт собрания. Если это про вас — попросите координатора указать ваше направление служения.',
      );
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.text, required this.action, required this.onAction});

  final IconData icon;
  final String text;
  final String action;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
        decoration: BoxDecoration(color: palette.accentSoft, borderRadius: BorderRadius.circular(Radii.md)),
        child: Row(
          children: [
            Icon(icon, size: 18, color: palette.accent),
            const SizedBox(width: 10),
            Expanded(child: Text(text, style: TextStyle(fontSize: 12.5, height: 1.3, color: palette.ink))),
            TextButton(style: TextButton.styleFrom(minimumSize: const Size(48, 48)), onPressed: onAction, child: Text(action)),
          ],
        ),
      ),
    );
  }
}
