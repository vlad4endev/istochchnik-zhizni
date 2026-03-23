import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'package:table_calendar/table_calendar.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/responsive.dart';
import '../../domain/entities/day_prayer_model.dart';
import '../providers/calendar_providers.dart';

class DailyPrayerScreen extends ConsumerStatefulWidget {
  const DailyPrayerScreen({super.key});

  @override
  ConsumerState<DailyPrayerScreen> createState() => _DailyPrayerScreenState();
}

class _DailyPrayerScreenState extends ConsumerState<DailyPrayerScreen> {
  CalendarFormat _calendarFormat = CalendarFormat.week;
  bool _isCalendarExpanded = false;

  void _onDateSelected(DateTime date) {
    ref.read(selectedDateProvider.notifier).state = date;
    setState(() => _isCalendarExpanded = false);
  }

  void _toggleCalendar() {
    setState(() => _isCalendarExpanded = !_isCalendarExpanded);
  }

  @override
  Widget build(BuildContext context) {
    final selectedDate = ref.watch(selectedDateProvider);
    final dateStr = DateFormat('yyyy-MM-dd').format(selectedDate);
    final prayerAsync = ref.watch(prayerDataProvider(dateStr));

    final isPhone = Responsive.isPhone(context);

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        toolbarHeight: 80,
        titleSpacing: 20,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Flexible(
              child: Text(
                'Молитва',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                  fontSize: isPhone ? 24 : 26,
                  color: AppColors.textOnPrimary,
                  height: 1.2,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        backgroundColor: AppColors.primary,
        elevation: 0,
        scrolledUnderElevation: 4,
        surfaceTintColor: Colors.transparent,
      ),
      body: SafeArea(
        top: false,
        bottom: true,
        left: true,
        right: true,
        child: Column(
        children: [
          _SelectedDateChip(
            date: selectedDate,
            isExpanded: _isCalendarExpanded,
            onTap: _toggleCalendar,
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 280),
            curve: Curves.easeInOut,
            child: _isCalendarExpanded
                ? _CalendarSection(
                    selectedDate: selectedDate,
                    calendarFormat: _calendarFormat,
                    onDateSelected: _onDateSelected,
                    onFormatChanged: (format) =>
                        setState(() => _calendarFormat = format),
                    onExpandMonth: () =>
                        setState(() => _calendarFormat = CalendarFormat.month),
                    onCollapseToWeek: () =>
                        setState(() => _calendarFormat = CalendarFormat.week),
                    onCollapse: () => setState(() => _isCalendarExpanded = false),
                  )
                : const SizedBox.shrink(),
          ),
          Expanded(
            child: prayerAsync.when(
              data: (data) => _PrayerCardsList(data: data),
              loading: () => _LoadingState(),
              error: (err, _) => _ErrorState(
                error: err,
                onRetry: () =>
                    ref.invalidate(prayerDataProvider(dateStr)),
              ),
            ),
          ),
        ],
        ),
      ),
    );
  }
}

class _SelectedDateChip extends StatelessWidget {
  const _SelectedDateChip({
    required this.date,
    required this.isExpanded,
    required this.onTap,
  });

  final DateTime date;
  final bool isExpanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isToday = _isSameDay(date, DateTime.now());
    final padding = Responsive.horizontalPadding(context);
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: double.infinity,
        padding: EdgeInsets.symmetric(horizontal: padding, vertical: 10),
        color: AppColors.surface,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.surfaceElevated,
            borderRadius: BorderRadius.circular(AppRadius.full),
            boxShadow: AppShadows.cardSubtle,
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  Icons.calendar_today_rounded,
                  size: 18,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
          child: Text(
            DateFormat('d MMMM yyyy', 'ru').format(date),
            style: TextStyle(
              fontSize: Responsive.isPhone(context) ? 15 : 16,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
              letterSpacing: -0.2,
            ),
            overflow: TextOverflow.ellipsis,
          ),
              ),
              if (isToday) ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.accent.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(AppRadius.full),
                  ),
                      child: Text(
                        'СЕГОДНЯ',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: AppColors.accent,
                          letterSpacing: 0.8,
                        ),
                      ),
                ),
                const SizedBox(width: 12),
              ],
              AnimatedRotation(
                turns: isExpanded ? 0.5 : 0,
                duration: const Duration(milliseconds: 250),
                child: Icon(
                  Icons.keyboard_arrow_down_rounded,
                  size: 28,
                  color: AppColors.textTertiary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

String? _loadErrorDescription(Object? error) {
  if (error == null) {
    return null;
  }
  if (error is DioException) {
    final code = error.response?.statusCode;
    final ct = error.response?.headers.value('content-type') ?? '';
    if (code == 404) {
      return 'Сервер вернул 404. Убедитесь, что API_BASE_URL — это хост бэкенда '
          '(с маршрутом /api/calendar), а не только статика фронтенда на Vercel.';
    }
    if (ct.contains('text/html')) {
      return 'Пришёл ответ HTML вместо JSON. Часто URL API совпадает с сайтом на Vercel '
          '— укажите отдельный адрес сервера с бэкендом.';
    }
    if (error.type == DioExceptionType.connectionError) {
      return 'Не удаётся подключиться к серверу. Проверьте CORS, HTTPS и доступность API.';
    }
    final msg = error.message;
    if (msg != null && msg.isNotEmpty) {
      return msg;
    }
  }
  return error.toString();
}

class _LoadingState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            width: 40,
            height: 40,
            child: CircularProgressIndicator(
              strokeWidth: 2.5,
              color: AppColors.burgundy,
              strokeCap: StrokeCap.round,
            ),
          ),
          const SizedBox(height: 20),
          Text(
            'Загрузка...',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppColors.textMuted,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.onRetry, this.error});

  final VoidCallback onRetry;
  final Object? error;

  @override
  Widget build(BuildContext context) {
    final padding = Responsive.horizontalPadding(context);
    final detail = _loadErrorDescription(error);
    return Center(
      child: SingleChildScrollView(
        child: Padding(
          padding: EdgeInsets.all(padding * 2),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.08),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.cloud_off_rounded,
                size: 48,
                color: AppColors.primary.withValues(alpha: 0.6),
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'Не удалось загрузить данные',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.3,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Проверьте подключение к интернету и что бэкенд доступен по HTTPS.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 15,
                height: 1.5,
                color: AppColors.textMuted,
                letterSpacing: 0.1,
              ),
            ),
            if (detail != null) ...[
              const SizedBox(height: 16),
              Text(
                detail,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13,
                  height: 1.45,
                  color: AppColors.textSecondary,
                  letterSpacing: 0.1,
                ),
              ),
            ],
            const SizedBox(height: 8),
            Text(
              'API: ${AppConfig.apiBaseUrlForDisplay}',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                height: 1.4,
                color: AppColors.textTertiary,
                letterSpacing: 0.05,
              ),
            ),
            if (AppConfig.isApiUrlProbablyWrongForWeb) ...[
              const SizedBox(height: 12),
              Text(
                'Похоже, в сборке указан localhost вместо публичного API. '
                'В Vercel: Environment Variables → API_BASE_URL → Redeploy.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13,
                  height: 1.45,
                  color: AppColors.burgundy,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded, size: 20),
              label: const Text('Повторить'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: AppColors.textOnPrimary,
                padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
                minimumSize: const Size(0, 52),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppRadius.md),
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

class _CalendarSection extends StatelessWidget {
  const _CalendarSection({
    required this.selectedDate,
    required this.calendarFormat,
    required this.onDateSelected,
    required this.onFormatChanged,
    required this.onExpandMonth,
    required this.onCollapseToWeek,
    required this.onCollapse,
  });

  final DateTime selectedDate;
  final CalendarFormat calendarFormat;
  final ValueChanged<DateTime> onDateSelected;
  final ValueChanged<CalendarFormat> onFormatChanged;
  final VoidCallback onExpandMonth;
  final VoidCallback onCollapseToWeek;
  final VoidCallback onCollapse;

  @override
  Widget build(BuildContext context) {
    final isMonthView = calendarFormat == CalendarFormat.month;
    final padding = Responsive.horizontalPadding(context);
    final isPhone = Responsive.isPhone(context);

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        boxShadow: AppShadows.cardSubtle,
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(AppRadius.xxl)),
      ),
      padding: EdgeInsets.fromLTRB(padding, 24, padding, 28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TableCalendar(
            firstDay: DateTime(2020),
            lastDay: DateTime(2030),
            focusedDay: selectedDate,
            selectedDayPredicate: (day) => isSameDay(selectedDate, day),
            onDaySelected: (_, day) => onDateSelected(day),
            calendarFormat: calendarFormat,
            onFormatChanged: onFormatChanged,
            locale: 'ru',
            daysOfWeekStyle: DaysOfWeekStyle(
              weekdayStyle: TextStyle(
                fontSize: isPhone ? 11 : 12,
                fontWeight: FontWeight.w600,
                color: AppColors.textMuted,
              ),
              weekendStyle: TextStyle(
                fontSize: isPhone ? 11 : 12,
                fontWeight: FontWeight.w600,
                color: AppColors.textMuted,
              ),
            ),
            headerStyle: HeaderStyle(
              formatButtonVisible: false,
              titleCentered: true,
              leftChevronVisible: true,
              rightChevronVisible: true,
              headerPadding: EdgeInsets.only(bottom: isPhone ? 8 : 12),
              titleTextStyle: TextStyle(
                fontSize: isPhone ? 15 : 17,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
              formatButtonDecoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(AppRadius.sm),
              ),
            ),
            calendarStyle: CalendarStyle(
              cellPadding: EdgeInsets.symmetric(
                vertical: isPhone ? 6 : 8,
                horizontal: isPhone ? 2 : 4,
              ),
              defaultTextStyle: TextStyle(
                fontSize: isPhone ? 13 : 15,
                color: AppColors.textPrimary,
              ),
              weekendTextStyle: TextStyle(
                fontSize: isPhone ? 13 : 15,
                color: AppColors.textSecondary,
              ),
              selectedTextStyle: TextStyle(
                fontSize: isPhone ? 13 : 15,
                color: Colors.white,
                fontWeight: FontWeight.w600,
              ),
              todayTextStyle: TextStyle(
                fontSize: isPhone ? 13 : 15,
                color: AppColors.primary,
                fontWeight: FontWeight.w700,
              ),
              selectedDecoration: const BoxDecoration(
                color: AppColors.primary,
                shape: BoxShape.circle,
              ),
              todayDecoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              outsideDaysVisible: false,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextButton.icon(
                  onPressed: isMonthView ? onCollapseToWeek : onExpandMonth,
                  icon: Icon(
                    isMonthView ? Icons.view_week_rounded : Icons.calendar_month_rounded,
                    size: 20,
                    color: AppColors.primary,
                  ),
                  label: Text(
                    isMonthView ? 'Неделя' : 'Весь месяц',
                    style: const TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                  style: TextButton.styleFrom(
                    padding: EdgeInsets.symmetric(
                      vertical: isPhone ? 14 : 12,
                      horizontal: 16,
                    ),
                    minimumSize: const Size(0, 48),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppRadius.md),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: onCollapse,
                icon: const Icon(Icons.expand_less_rounded, size: 28),
                tooltip: 'Свернуть',
                style: IconButton.styleFrom(
                  foregroundColor: AppColors.textSecondary,
                  minimumSize: const Size(48, 48),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppRadius.md),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PrayerCardsList extends StatelessWidget {
  const _PrayerCardsList({required this.data});

  final DayPrayerModel data;

  @override
  Widget build(BuildContext context) {
    final padding = Responsive.horizontalPadding(context);
    final bottomPadding = MediaQuery.paddingOf(context).bottom;
    return ListView(
      physics: const BouncingScrollPhysics(),
      padding: EdgeInsets.fromLTRB(
        padding,
        16,
        padding,
        28 + bottomPadding.clamp(0, 34),
      ),
      children: [
        if (data.members.isNotEmpty) ...[
          _SectionHeader(
            icon: Icons.volunteer_activism_rounded,
            title: 'Молитва за члена церкви',
          ),
          const SizedBox(height: 12),
          ...data.members.map((m) => _MemberCard(member: m)),
          const SizedBox(height: 24),
        ],
        if (data.globalThemes.isNotEmpty || data.ministries.isNotEmpty) ...[
          ...data.globalThemes.map((t) => _GlobalThemeCard(theme: t)),
          ...data.ministries.map((m) => _MinistryCard(ministry: m)),
          const SizedBox(height: 20),
        ],
        if (data.backsliders.isNotEmpty) ...[
          _SectionHeader(icon: Icons.place_rounded, title: 'Отпавшие'),
          const SizedBox(height: 12),
          ...data.backsliders.map((b) => _BacksliderCard(backslider: b)),
        ],
        if (data.members.isEmpty &&
            data.globalThemes.isEmpty &&
            data.ministries.isEmpty &&
            data.backsliders.isEmpty)
          _EmptyState(),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.icon, required this.title});

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 2, bottom: 12),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 20, color: AppColors.primary),
          ),
          const SizedBox(width: 14),
          Text(
            title.toUpperCase(),
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: AppColors.textPrimary,
              letterSpacing: 1.1,
              height: 1.2,
            ),
          ),
        ],
      ),
    );
  }
}

class _PrayerCard extends StatelessWidget {
  const _PrayerCard({
    required this.icon,
    required this.title,
    required this.child,
    this.accentColor,
  });

  final IconData icon;
  final String title;
  final Widget child;
  final Color? accentColor;

  @override
  Widget build(BuildContext context) {
    final accent = accentColor ?? AppColors.primary;
    final cardPadding = Responsive.cardPadding(context);
    final iconSize = Responsive.cardIconSize(context);

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        boxShadow: AppShadows.cardSubtle,
        border: Border.all(color: AppColors.dividerLight, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(cardPadding, 18, cardPadding, 0),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Container(
                  width: iconSize + 8,
                  height: iconSize + 8,
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  alignment: Alignment.center,
                  child: Icon(icon, size: iconSize * 0.65, color: accent),
                ),
                SizedBox(width: Responsive.isPhone(context) ? 12 : 14),
                Expanded(
                  child: Text(
                    title,
                    style: TextStyle(
                      fontSize: Responsive.isPhone(context) ? 17 : 18,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary,
                      height: 1.3,
                      letterSpacing: -0.2,
                    ),
                    overflow: TextOverflow.ellipsis,
                    maxLines: 2,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(cardPadding, 16, cardPadding, 20),
            child: child,
          ),
        ],
      ),
    );
  }
}

class _MemberCard extends StatelessWidget {
  const _MemberCard({required this.member});

  final ChurchMember member;

  @override
  Widget build(BuildContext context) {
    return _PrayerCard(
      icon: Icons.volunteer_activism_rounded,
      title: member.name,
      accentColor: AppColors.memberAccent,
      child: member.prayerRequest != null && member.prayerRequest!.isNotEmpty
          ? Text(
              member.prayerRequest!,
              style: const TextStyle(
                fontSize: 16,
                height: 1.6,
                color: AppColors.textSecondary,
                letterSpacing: 0.1,
              ),
            )
          : Text(
              'Нет указанных нужд',
              style: TextStyle(
                fontSize: 15,
                color: AppColors.textMuted,
                fontStyle: FontStyle.italic,
              ),
            ),
    );
  }
}

class _GlobalThemeCard extends StatelessWidget {
  const _GlobalThemeCard({required this.theme});

  final GlobalTheme theme;

  @override
  Widget build(BuildContext context) {
    return _PrayerCard(
      icon: Icons.auto_stories_rounded,
      title: theme.title,
      accentColor: AppColors.themeAccent,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (theme.bibleVerse != null && theme.bibleVerse!.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.themeAccent.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(
                  color: AppColors.themeAccent.withValues(alpha: 0.15),
                  width: 1,
                ),
              ),
                  child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.menu_book_rounded, size: 18, color: AppColors.themeAccent),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      theme.bibleVerse!,
                      style: const TextStyle(
                        fontSize: 15,
                        height: 1.6,
                        color: AppColors.textSecondary,
                        fontStyle: FontStyle.italic,
                        letterSpacing: 0.1,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (theme.prayerPoints != null && theme.prayerPoints!.isNotEmpty)
              const SizedBox(height: 12),
          ],
          if (theme.prayerPoints != null && theme.prayerPoints!.isNotEmpty)
            Text(
              theme.prayerPoints!,
              style: const TextStyle(
                fontSize: 16,
                height: 1.6,
                color: AppColors.textSecondary,
                letterSpacing: 0.1,
              ),
            ),
          if ((theme.bibleVerse == null || theme.bibleVerse!.isEmpty) &&
              (theme.prayerPoints == null || theme.prayerPoints!.isEmpty))
            Text(
              'Нет дополнительной информации',
              style: TextStyle(
                fontSize: 15,
                color: AppColors.textMuted,
                fontStyle: FontStyle.italic,
              ),
            ),
        ],
      ),
    );
  }
}

class _MinistryCard extends StatelessWidget {
  const _MinistryCard({required this.ministry});

  final Ministry ministry;

  @override
  Widget build(BuildContext context) {
    return _PrayerCard(
      icon: Icons.handyman_rounded,
      title: ministry.title,
      accentColor: AppColors.ministryAccent,
      child: ministry.prayerPoints != null && ministry.prayerPoints!.isNotEmpty
          ? Text(
              ministry.prayerPoints!,
              style: const TextStyle(
                fontSize: 16,
                height: 1.6,
                color: AppColors.textSecondary,
                letterSpacing: 0.1,
              ),
            )
          : Text(
              'Нет указанных пунктов молитвы',
              style: TextStyle(
                fontSize: 15,
                color: AppColors.textMuted,
                fontStyle: FontStyle.italic,
              ),
            ),
    );
  }
}

class _BacksliderCard extends StatelessWidget {
  const _BacksliderCard({required this.backslider});

  final Backslider backslider;

  @override
  Widget build(BuildContext context) {
    return _PrayerCard(
      icon: Icons.person_off_rounded,
      title: backslider.name,
      accentColor: AppColors.backsliderAccent,
        child: Text(
          'Отпавший — нуждается в молитве о возвращении',
          style: TextStyle(
            fontSize: 16,
            height: 1.5,
            color: AppColors.textMuted,
            fontStyle: FontStyle.italic,
          ),
        ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final padding = Responsive.horizontalPadding(context);
    return Center(
      child: Padding(
        padding: EdgeInsets.all(padding * 2),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(28),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.08),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.volunteer_activism_rounded,
                size: 48,
                color: AppColors.primary.withValues(alpha: 0.4),
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'Нет данных на эту дату',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
                letterSpacing: -0.3,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Выберите другую дату в календаре',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 15,
                color: AppColors.textMuted,
                letterSpacing: 0.2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
