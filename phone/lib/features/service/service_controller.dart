import 'package:flutter/foundation.dart';

import '../schedule/schedule_controller.dart' show dateOnly;
import 'data/plan_repository.dart';
import 'models/plan_models.dart';

/// Список программ служения: предстоящие и прошедшие.
class ServiceController extends ChangeNotifier {
  ServiceController(this.source, {DateTime Function()? clock, this.pastDays = 90, this.futureDays = 180}) : _clock = clock ?? DateTime.now;

  final PlanSource source;
  final DateTime Function() _clock;
  final int pastDays;
  final int futureDays;

  bool loading = true;
  String? error;
  DateTime? staleSince;
  List<PlanSummary> _plans = const [];
  bool _disposed = false;

  DateTime get today => dateOnly(_clock());

  /// Ближайшая программа первой.
  List<PlanSummary> get upcoming => ([for (final p in _plans) if (!p.date.isBefore(today)) p]..sort(_byDateTime));

  /// Недавняя — первой.
  List<PlanSummary> get past => ([for (final p in _plans) if (p.date.isBefore(today)) p]..sort((a, b) => _byDateTime(b, a)));

  bool get hasPlans => _plans.isNotEmpty;

  static int _byDateTime(PlanSummary a, PlanSummary b) {
    final byDate = a.date.compareTo(b.date);
    return byDate != 0 ? byDate : a.startTime.compareTo(b.startTime);
  }

  Future<void> load() async {
    loading = _plans.isEmpty;
    error = null;
    notifyListeners();
    try {
      final result = await source.plans(today.subtract(Duration(days: pastDays)), today.add(Duration(days: futureDays)));
      if (_disposed) return;
      _plans = result.value;
      staleSince = result.staleSince;
    } catch (_) {
      if (_disposed) return;
      error = 'Не удалось загрузить программы. Проверьте интернет и попробуйте снова.';
    }
    loading = false;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
