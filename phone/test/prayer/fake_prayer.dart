import 'dart:async';

import 'package:molitva/features/prayer/data/prayer_source.dart';
import 'package:molitva/features/prayer/models/prayer_models.dart';

WeekDay day(String ymd, int id, String name, {String need = ''}) => WeekDay(
      date: DateTime.parse(ymd),
      ymd: ymd,
      member: WeekMember(person: Person(id: id, name: name), prayerRequest: need),
    );

class FakePrayer implements PrayerSource {
  final calls = <String>[];
  bool fail = false;
  bool failClaims = false;
  CoordinatorNotes notesNow = CoordinatorNotes.empty;
  Map<WeekKind, List<WeekDay>> weeks = {
    WeekKind.current: [day('2026-11-23', 1, 'Иван Петров', need: 'Здоровье'), day('2026-11-24', 2, 'Анна Орлова')],
    WeekKind.next: [day('2026-11-30', 3, 'Олег Ким')],
  };
  Claims claimsNow = Claims.fromJson({
    'coordinators': [
      {'id': 9, 'name': 'Мария Лис'},
    ],
    'members': [
      {'id': 1, 'name': 'a', 'claimed_by': null},
      {'id': 2, 'name': 'b', 'claimed_by': null},
      {'id': 3, 'name': 'c', 'claimed_by': null},
    ],
  });
  Completer<void>? gate;

  void _need() {
    if (fail) throw StateError('network');
  }

  @override
  Future<CoordinatorNotes> notes(String forDate) async {
    calls.add('notes:$forDate');
    _need();
    return notesNow;
  }

  @override
  Future<CoordinatorNotes> manageNotes() async => notesNow;

  @override
  Future<void> saveNote(NoteKind kind, String text, NoteDuration duration, String todayYmd) async {
    calls.add('save:${kind.api}:$text:${duration.api}:$todayYmd');
    _need();
    notesNow = CoordinatorNotes(urgent: kind == NoteKind.urgentPrayer ? CoordinatorNote(text: text) : null);
  }

  @override
  Future<void> deleteNote(NoteKind kind, String forDate) async {
    calls.add('delete:${kind.api}');
    _need();
    notesNow = CoordinatorNotes.empty;
  }

  @override
  Future<List<WeekDay>> week(WeekKind kind) async {
    calls.add('week:${kind.api}');
    if (gate != null) await gate!.future;
    _need();
    return weeks[kind]!;
  }

  @override
  Future<Claims> claims(WeekKind kind) async {
    calls.add('claims:${kind.api}');
    if (failClaims) throw StateError('claims');
    return claimsNow;
  }

  @override
  Future<Claims> assignCurator(int memberId, int? coordinatorId, WeekKind kind) async {
    calls.add('assign:$memberId:$coordinatorId:${kind.api}');
    _need();
    return Claims.fromJson({
      'coordinators': [
        {'id': 9, 'name': 'Мария Лис'},
      ],
      'members': [
        {
          'id': memberId,
          'name': 'x',
          'claimed_by': coordinatorId == null ? null : {'id': coordinatorId, 'name': 'Я'},
        },
      ],
    });
  }

  @override
  Future<DistributionResult> autoDistribute(WeekKind kind) async {
    calls.add('distribute:${kind.api}');
    _need();
    return const DistributionResult(total: 7, notified: 2);
  }

  @override
  Future<void> saveNeed(int memberId, String dateYmd, String text) async {
    calls.add('need:$memberId:$dateYmd:$text');
    _need();
  }

  @override
  Future<String> improveText(String text, String memberName) async => '$text (улучшено)';

  ViewersToday viewersNow = const ViewersToday();
  List<Birthday> birthdaysNow = const [];

  @override
  Future<ViewersToday> viewers() async {
    calls.add('viewers');
    return viewersNow;
  }

  @override
  Future<void> registerVisit() async {
    calls.add('visit');
  }

  @override
  Future<String> telegramPreview(String dateYmd) async {
    calls.add('tg-preview:$dateYmd');
    _need();
    return 'Молитва дня: Иван Петров';
  }

  @override
  Future<int> telegramSendNow(String dateYmd) async {
    calls.add('tg-send:$dateYmd');
    _need();
    return 5;
  }

  @override
  Future<List<Birthday>> birthdays() async => birthdaysNow;

  @override
  Future<void> submitNeed(String text) async {
    calls.add('submit:$text');
    _need();
  }
}

