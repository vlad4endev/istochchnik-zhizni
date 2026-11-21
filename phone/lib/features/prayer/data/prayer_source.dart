import 'package:dio/dio.dart' show Options;

import '../../../core/json.dart';
import '../../../core/session.dart';
import '../models/prayer_models.dart';

/// Какая неделя плана: текущая или следующая.
enum WeekKind {
  current('current', 'Эта неделя'),
  next('next', 'Следующая');

  const WeekKind(this.api, this.label);
  final String api;
  final String label;
}

/// Всё, что «Молитва» и главная берут с сервера. Интерфейс нужен тестам:
/// контроллеры не знают про Dio.
abstract class PrayerSource {
  Future<CoordinatorNotes> notes(String forDate);
  Future<CoordinatorNotes> manageNotes();
  Future<void> saveNote(NoteKind kind, String text, NoteDuration duration, String todayYmd);
  Future<void> deleteNote(NoteKind kind, String forDate);

  Future<List<WeekDay>> week(WeekKind kind);
  Future<Claims> claims(WeekKind kind);
  Future<Claims> assignCurator(int memberId, int? coordinatorId, WeekKind kind);
  Future<DistributionResult> autoDistribute(WeekKind kind);
  Future<void> saveNeed(int memberId, String dateYmd, String text);
  Future<String> improveText(String text, String memberName);

  Future<ViewersToday> viewers();
  Future<void> registerVisit();

  Future<String> telegramPreview(String dateYmd);
  Future<int> telegramSendNow(String dateYmd);

  Future<List<Birthday>> birthdays();
  Future<void> submitNeed(String text);
}

/// Боевая реализация поверх `session.dio`.
class PrayerApi implements PrayerSource {
  PrayerApi(this.session);
  final SessionController session;

  Future<Object?> _get(String path, {Map<String, dynamic>? query}) async =>
      (await session.dio.get<Object?>(path, queryParameters: query)).data;

  Future<Object?> _send(String method, String path, {Object? data, Map<String, dynamic>? query}) async =>
      (await session.dio.request<Object?>(
        path,
        data: data,
        queryParameters: query,
        options: Options(method: method),
      ))
          .data;

  @override
  Future<CoordinatorNotes> notes(String forDate) async =>
      CoordinatorNotes.fromJson(await _get('/api/calendar/dashboard-coordinator-notes', query: {'for_date': forDate}));

  @override
  Future<CoordinatorNotes> manageNotes() async =>
      CoordinatorNotes.fromJson(await _get('/api/calendar/dashboard-coordinator-notes', query: {'scope': 'manage'}));

  @override
  Future<void> saveNote(NoteKind kind, String text, NoteDuration duration, String todayYmd) async {
    await _send('POST', '/api/calendar/dashboard-coordinator-notes', data: {
      'kind': kind.api,
      'text': text,
      'duration': duration.api,
      'today_key': todayYmd,
    });
  }

  @override
  Future<void> deleteNote(NoteKind kind, String forDate) async {
    await _send('DELETE', '/api/calendar/dashboard-coordinator-notes/${kind.api}', query: {'for_date': forDate});
  }

  @override
  Future<List<WeekDay>> week(WeekKind kind) async =>
      WeekDay.parseList(await _get('/api/calendar/next-week/members', query: {'week': kind.api}));

  @override
  Future<Claims> claims(WeekKind kind) async =>
      Claims.fromJson(await _get('/api/calendar/cycle/collection-claims', query: {'week': kind.api}));

  @override
  Future<Claims> assignCurator(int memberId, int? coordinatorId, WeekKind kind) async =>
      Claims.fromJson(await _send('PATCH', '/api/calendar/cycle/collection-claims', data: {
        'member_id': memberId,
        'claim': coordinatorId != null,
        'week': kind.api,
        'assigned_coordinator_id': ?coordinatorId,
      }));

  @override
  Future<DistributionResult> autoDistribute(WeekKind kind) async =>
      DistributionResult.fromJson(await _send('POST', '/api/calendar/next-week/curator-distribution', data: {
        'week_kind': kind.api,
        'notify_curators': true,
      }));

  @override
  Future<void> saveNeed(int memberId, String dateYmd, String text) async {
    await _send('PATCH', '/api/calendar/member-cycle-prayer', data: {
      'member_id': memberId,
      'target_date': dateYmd,
      'prayer_request': text,
    });
  }

  @override
  Future<String> improveText(String text, String memberName) async {
    final data = asMap(await _send('POST', '/api/calendar/prayer-need/improve-text', data: {
      'text': text,
      'member_name': memberName,
    }));
    final improved = str(data['text']);
    if (improved.trim().isEmpty) throw StateError('empty_improved_text');
    return improved;
  }

  @override
  Future<ViewersToday> viewers() async =>
      ViewersToday.fromJson(await _get('/api/calendar/prayer-section/today-viewers'));

  @override
  Future<void> registerVisit() async {
    await _send('POST', '/api/calendar/prayer-section/visit');
  }

  @override
  Future<String> telegramPreview(String dateYmd) async =>
      str(asMap(await _get('/api/telegram/dispatch/preview-prayer', query: {'date': dateYmd}))['text']);

  @override
  Future<int> telegramSendNow(String dateYmd) async =>
      asInt(asMap(await _send('POST', '/api/telegram/dispatch/run-now', data: {'date': dateYmd}))['sent_count']);

  @override
  Future<List<Birthday>> birthdays() async => Birthday.parseList(await _get('/api/calendar/birthdays/week'));

  @override
  Future<void> submitNeed(String text) async {
    await _send('POST', '/api/calendar/prayer-need/submit', data: {'text': text});
  }
}
