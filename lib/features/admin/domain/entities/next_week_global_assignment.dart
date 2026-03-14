import 'global_theme.dart';
import 'admin_ministry.dart';
import 'admin_backslider.dart';

class NextWeekGlobalAssignment {
  const NextWeekGlobalAssignment({
    required this.date,
    required this.themes,
    required this.ministries,
    required this.backslider,
  });

  final DateTime date;
  final List<AdminGlobalTheme> themes;
  final List<AdminMinistry> ministries;
  final AdminBackslider? backslider;
}
