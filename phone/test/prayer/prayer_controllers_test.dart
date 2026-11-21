import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/prayer/data/prayer_source.dart';
import 'package:molitva/features/prayer/logic/prayer_logic.dart';
import 'package:molitva/features/prayer/models/prayer_models.dart';
import 'package:molitva/features/prayer/prayer_controllers.dart';

import 'fake_prayer.dart';

void main() {
  group('NotesController', () {
    test('загрузка, сохранение со сроком и удаление', () async {
      final s = FakePrayer();
      final c = NotesController(s);
      await c.load(DateTime(2026, 11, 21));
      expect(c.notes.urgent, isNull);
      await c.save(NoteKind.urgentPrayer, 'Помолитесь', NoteDuration.week, now: DateTime(2026, 11, 21));
      expect(c.notes.urgent!.text, 'Помолитесь');
      expect(s.calls, contains('save:urgent_prayer:Помолитесь:week:2026-11-21'));
      await c.remove(NoteKind.urgentPrayer, DateTime(2026, 11, 21));
      expect(c.notes.urgent, isNull);
    });

    test('сбой сети на загрузке оставляет прежние заметки', () async {
      final s = FakePrayer()..notesNow = const CoordinatorNotes(urgent: CoordinatorNote(text: 'Было'));
      final c = NotesController(s);
      await c.load(DateTime(2026, 11, 21));
      s.fail = true;
      await c.load(DateTime(2026, 11, 22));
      expect(c.notes.urgent!.text, 'Было');
    });

    test('сбой сохранения — исключение вызывающему, заметка не меняется', () async {
      final s = FakePrayer();
      final c = NotesController(s);
      await c.load(DateTime(2026, 11, 21));
      s.fail = true;
      await expectLater(c.save(NoteKind.announcement, 'x', NoteDuration.day), throwsStateError);
      expect(c.notes.announcement, isNull);
    });
  });

  group('CollectionController', () {
    CollectionController make(FakePrayer s) => CollectionController(s, meId: 9);

    test('загружает текущую неделю и отметки сбора', () async {
      final s = FakePrayer();
      final c = make(s);
      await c.load();
      expect(c.loading, isFalse);
      expect(c.days.length, 2);
      expect(c.stats.filled, 1);
      expect(c.claimsFailed, isFalse);
    });

    test('ошибка недели — экран ошибки; ошибка отметок — только предупреждение', () async {
      final bad = FakePrayer()..fail = true;
      final c1 = make(bad);
      await c1.load();
      expect(c1.error, isNotNull);

      final partial = FakePrayer()..failClaims = true;
      final c2 = make(partial);
      await c2.load();
      expect(c2.error, isNull);
      expect(c2.claimsFailed, isTrue);
      expect(c2.days, isNotEmpty);
    });

    test('переключение недели грузит вторую и кэширует обе', () async {
      final s = FakePrayer();
      final c = make(s);
      await c.load();
      await c.setKind(WeekKind.next);
      expect(c.days.single.member!.id, 3);
      s.calls.clear();
      await c.setKind(WeekKind.current);
      expect(s.calls, isEmpty, reason: 'уже загружено — повторного запроса нет');
      expect(c.days.length, 2);
    });

    test('переключение во время загрузки: каждая неделя ложится на своё место', () async {
      final s = FakePrayer()..gate = Completer<void>();
      final c = make(s);
      final first = c.load(); // «эта неделя» ждёт ответа
      await Future<void>.delayed(Duration.zero);
      final second = c.setKind(WeekKind.next); // пользователь уже переключился
      s.gate!.complete();
      await Future.wait([first, second]);
      expect(c.loading, isFalse);
      expect(c.days.single.member!.id, 3, reason: 'на экране выбранная «следующая»');
      s.calls.clear();
      await c.setKind(WeekKind.current);
      expect(s.calls, isEmpty, reason: 'ответ «этой» недели не потерялся и не затёр чужую');
      expect(c.days.length, 2);
    });

    test('куратор: назначение обновляет отметки, занятость сбрасывается', () async {
      final s = FakePrayer();
      final c = make(s);
      await c.load();
      final f = c.assign(2, 9);
      expect(c.busy, {2});
      await f;
      expect(c.busy, isEmpty);
      expect(c.claims.of(2)!.claimedBy!.id, 9);
      expect(s.calls, contains('assign:2:9:current'));
    });

    test('куратор: ошибка сети — исключение и busy очищен', () async {
      final s = FakePrayer();
      final c = make(s);
      await c.load();
      s.fail = true;
      await expectLater(c.assign(2, 9), throwsStateError);
      expect(c.busy, isEmpty);
    });

    test('нужда: сразу на экране, потом на сервер', () async {
      final s = FakePrayer();
      final c = make(s);
      await c.load();
      final target = c.days[1];
      final f = c.saveNeed(target, '  О работе  ');
      expect(c.days[1].member!.prayerRequest, 'О работе');
      await f;
      expect(s.calls, contains('need:2:2026-11-24:О работе'));
    });

    test('нужда: сбой сети откатывает текст', () async {
      final s = FakePrayer();
      final c = make(s);
      await c.load();
      s.fail = true;
      await expectLater(c.saveNeed(c.days[0], 'Новое'), throwsStateError);
      expect(c.days[0].member!.prayerRequest, 'Здоровье');
    });

    test('автораспределение: итог и обновление данных', () async {
      final s = FakePrayer();
      final c = make(s);
      await c.load();
      s.calls.clear();
      final r = await c.autoDistribute();
      expect((r.total, r.notified), (7, 2));
      expect(s.calls, ['distribute:current', 'claims:current', 'week:current']);
      expect(c.distributing, isFalse);
    });

    test('фильтры и поиск применяются к видимому списку', () async {
      final s = FakePrayer();
      final c = make(s);
      await c.load();
      c.setFilter(CollectionFilter.needEmpty);
      expect(c.visible.map((d) => d.member!.id), [2]);
      c.setFilter(CollectionFilter.all);
      c.setQuery('петров');
      expect(c.visible.map((d) => d.member!.id), [1]);
      await c.setKind(WeekKind.next);
      expect(c.filter, CollectionFilter.all);
      expect(c.query, isEmpty);
    });
  });
}
