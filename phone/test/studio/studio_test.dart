import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/studio/data/studio_repository.dart';
import 'package:molitva/features/studio/models/studio_models.dart';
import 'package:molitva/features/studio/studio_controllers.dart';

class FakeStudio implements StudioSource {
  List<Setlist> lists = [];
  SetlistDetail? detail;
  DateTime? stale;
  bool fail = false;
  final calls = <String>[];

  void _need() {
    if (fail) throw Exception('нет сети');
  }

  @override
  Future<Loaded<List<Setlist>>> setlists() async {
    _need();
    return Loaded(lists, staleSince: stale);
  }

  @override
  Future<Loaded<SetlistDetail>> performance(int id) async {
    _need();
    return Loaded(detail!, staleSince: stale);
  }

  @override
  Future<Setlist> createSetlist(String title, DateTime? date) async {
    _need();
    calls.add('create:$title');
    return Setlist(id: 99, ownerId: 1, title: title, date: date);
  }

  @override
  Future<void> patchSetlist(int id, {String? title, DateTime? date, bool clearDate = false, bool? isPublic}) async {
    _need();
    calls.add('patch:$id:${title ?? ''}:${clearDate ? 'cleardate' : ''}:${isPublic ?? ''}');
  }

  @override
  Future<void> deleteSetlist(int id) async {
    _need();
    calls.add('delete:$id');
  }

  @override
  Future<void> addItem(int setlistId, {required int songId, int? versionId}) async {
    _need();
    calls.add('add:$songId:${versionId ?? ''}');
    detail = detail!.copyWith(items: [...detail!.items, SetlistItem(id: 100 + songId, position: detail!.items.length, songId: songId, title: 'Песня $songId', content: 'x')]);
  }

  @override
  Future<void> removeItem(int setlistId, int itemId) async {
    _need();
    calls.add('remove:$itemId');
  }

  @override
  Future<void> reorder(int setlistId, List<int> ids) async {
    _need();
    calls.add('reorder:${ids.join(',')}');
    reorderInFlight += 1;
    if (reorderInFlight > maxReorderInFlight) maxReorderInFlight = reorderInFlight;
    try {
      final gate = reorderGates.isEmpty ? null : reorderGates.removeAt(0);
      if (gate != null) await gate.future;
    } finally {
      reorderInFlight -= 1;
    }
  }

  /// Тест управляет моментом ответа сервера на перестановку: по одному Completer на запрос.
  final List<Completer<void>> reorderGates = [];
  int reorderInFlight = 0;
  int maxReorderInFlight = 0;

  @override
  Future<List<MyVersion>> myVersions() async => const [];
}

SetlistItem item(int id, String title) => SetlistItem(id: id, position: id, songId: id, title: title, content: '[A]текст');

void main() {
  final now = DateTime(2026, 11, 18, 10);

  group('модели', () {
    test('песня сетлиста: моя тональность и текст важнее общих', () {
      final i = SetlistItem.fromJson({
        'id': 5,
        'position': 2,
        'song_id': 7,
        'studio_version_id': 3,
        'effective_key': 'Bb',
        'effective_content': '[Bb]моя версия',
        'musician_notes': {'v': 1},
        'song': {'id': 7, 'title': 'Велик Бог', 'default_key': 'G', 'content': '[G]общая', 'tempo': 72, 'number': 12},
      });
      expect((i.key, i.content, i.versionId, i.tempo, i.number), ('Bb', '[Bb]моя версия', 3, 72, 12));
    });

    test('без своей версии берутся общие тональность и текст', () {
      final i = SetlistItem.fromJson({'id': 1, 'song_id': 7, 'song': {'id': 7, 'title': 'Песня', 'default_key': 'G', 'content': '[G]общая'}});
      expect((i.key, i.content, i.versionId), ('G', '[G]общая', null));
    });

    test('заметки музыканта: строки и участки, мусор отбрасывается', () {
      final n = MusicianNotes.fromJson({
        'v': 1,
        'lineComments': {'2': ' тише ', 'x': 'плохой индекс', '-1': 'минус', '4': ''},
        'blockComments': [
          {'from': 0, 'to': 3, 'text': 'без барабанов'},
          {'from': 5, 'to': 6, 'text': ''},
        ],
      });
      expect(n.lines, {2: 'тише'});
      expect(n.blocks.single.text, 'без барабанов');
      expect(MusicianNotes.fromJson({'v': 2}).isEmpty, isTrue);
      expect(MusicianNotes.fromJson(null).isEmpty, isTrue);
    });

    test('дата сетлиста разбирается как день, а сетлист из программы помечается', () {
      final s = Setlist.fromJson({'id': 1, 'member_id': 2, 'title': '', 'event_date': '2026-11-22', 'source_service_plan_id': 8})!;
      expect(s.date, DateTime(2026, 11, 22));
      expect(s.fromServicePlan, isTrue);
      expect(s.displayTitle, 'Сетлист');
      expect(Setlist.fromJson({'id': 0}), isNull);
    });
  });

  group('список', () {
    test('ближайшие по возрастанию, прошедшие по убыванию, без даты отдельно', () async {
      final s = FakeStudio()
        ..lists = [
          Setlist(id: 1, ownerId: 1, title: 'Давно', date: DateTime(2026, 10, 1)),
          Setlist(id: 2, ownerId: 1, title: 'Позже', date: DateTime(2026, 12, 6)),
          Setlist(id: 3, ownerId: 1, title: 'Скоро', date: DateTime(2026, 11, 22)),
          Setlist(id: 4, ownerId: 1, title: 'Недавно', date: DateTime(2026, 11, 10)),
          Setlist(id: 5, ownerId: 1, title: 'Черновик'),
          Setlist(id: 6, ownerId: 1, title: 'Сегодня', date: DateTime(2026, 11, 18)),
        ];
      final c = StudioController(s, userId: 1, clock: () => now);
      await c.load();
      expect([for (final x in c.upcoming) x.title], ['Сегодня', 'Скоро', 'Позже']);
      expect([for (final x in c.past) x.title], ['Недавно', 'Давно']);
      expect([for (final x in c.undated) x.title], ['Черновик']);
    });

    test('ошибка загрузки — понятное сообщение, копия без сети помечается', () async {
      final s = FakeStudio()..fail = true;
      final c = StudioController(s, userId: 1, clock: () => now);
      await c.load();
      expect(c.error, contains('Не удалось'));
      s
        ..fail = false
        ..stale = DateTime(2026, 11, 17)
        ..lists = [Setlist(id: 1, ownerId: 1, title: 'Копия')];
      await c.load();
      expect(c.error, isNull);
      expect(c.staleSince, DateTime(2026, 11, 17));
    });

    test('создание добавляет сетлист сразу; удаление откатывается при ошибке сети', () async {
      final s = FakeStudio()..lists = [Setlist(id: 1, ownerId: 1, title: 'Старый', date: DateTime(2026, 12, 1))];
      final c = StudioController(s, userId: 1, clock: () => now);
      await c.load();
      final created = await c.create('Воскресенье', DateTime(2026, 11, 22));
      expect(created.id, 99);
      expect(c.upcoming.first.title, 'Воскресенье');

      s.fail = true;
      await expectLater(c.delete(c.upcoming.first), throwsException);
      expect(c.upcoming.length, 2, reason: 'вернулся на место');
      s.fail = false;
      await c.delete(c.upcoming.first);
      expect(c.upcoming.length, 1);
      expect(s.calls, contains('delete:99'));
    });

    test('чужой сетлист (из программы) отличается от моего', () {
      final c = StudioController(FakeStudio(), userId: 1, clock: () => now);
      expect(c.isMine(Setlist(id: 1, ownerId: 1, title: '')), isTrue);
      expect(c.isMine(Setlist(id: 2, ownerId: 5, title: '')), isFalse);
    });
  });

  group('сетлист', () {
    SetlistController make(FakeStudio s, {int owner = 1}) => SetlistController(
          s,
          initial: Setlist(id: 7, ownerId: owner, title: 'Воскресенье', shareToken: 'TOKEN'),
          userId: 1,
          origin: 'https://church.example',
        );

    FakeStudio studioWith(List<SetlistItem> items) => FakeStudio()..detail = SetlistDetail(setlist: Setlist(id: 7, ownerId: 1, title: 'Воскресенье', shareToken: 'TOKEN'), items: items);

    test('загрузка, ссылка для команды, права', () async {
      final s = studioWith([item(1, 'А'), item(2, 'Б')]);
      final c = make(s);
      await c.load();
      expect(c.items.length, 2);
      expect(c.shareUrl, 'https://church.example/setlist-share/TOKEN');
      expect(c.canEdit, isTrue);
      expect(make(s, owner: 5).canEdit, isFalse);
    });

    test('без сети правка выключена: копия не должна расходиться с сервером', () async {
      final s = studioWith([item(1, 'А')])..stale = DateTime(2026, 11, 17);
      final c = make(s);
      await c.load();
      expect(c.canEdit, isTrue);
      expect(c.editable, isFalse);
    });

    test('порядок: перетаскивание вниз и вверх отправляет новый порядок', () async {
      final s = studioWith([item(1, 'А'), item(2, 'Б'), item(3, 'В')]);
      final c = make(s);
      await c.load();
      await c.move(0, 3); // «А» в конец (индекс как у ReorderableListView)
      expect([for (final i in c.items) i.title], ['Б', 'В', 'А']);
      await c.move(2, 0);
      expect([for (final i in c.items) i.title], ['А', 'Б', 'В']);
      expect(s.calls, ['reorder:2,3,1', 'reorder:1,2,3']);
      await c.move(1, 1);
      await c.move(1, 2);
      expect(s.calls.length, 2, reason: 'на то же место — запроса нет');
    });

    test('ошибка сети при перестановке и удалении возвращает как было', () async {
      final s = studioWith([item(1, 'А'), item(2, 'Б')]);
      final c = make(s);
      await c.load();
      s.fail = true;
      await expectLater(c.move(0, 2), throwsException);
      expect([for (final i in c.items) i.title], ['А', 'Б']);
      await expectLater(c.remove(c.items.first), throwsException);
      expect(c.items.length, 2);
      s.fail = false;
      await c.remove(c.items.first);
      expect([for (final i in c.items) i.title], ['Б']);
    });

    test('быстрые перестановки идут по одному запросу, последний = порядок на экране', () async {
      final s = studioWith([item(1, 'А'), item(2, 'Б'), item(3, 'В')]);
      final gate1 = Completer<void>();
      s.reorderGates.add(gate1);
      final c = make(s);
      await c.load();
      final first = c.move(0, 3); // Б В А — запрос ушёл и ждёт ответа
      await Future<void>.delayed(Duration.zero);
      final second = c.move(2, 0); // А Б В
      final third = c.move(0, 2); // Б А В
      expect([for (final i in c.items) i.title], ['Б', 'А', 'В'], reason: 'экран реагирует сразу');
      expect(s.calls, ['reorder:2,3,1'], reason: 'пока нет ответа, второй запрос не уходит');
      gate1.complete();
      await Future.wait([first, second, third]);
      expect(s.maxReorderInFlight, 1);
      expect(s.calls, ['reorder:2,3,1', 'reorder:2,1,3'], reason: 'остальные схлопнулись в один с итоговым порядком');
      expect([for (final i in c.items) i.title], ['Б', 'А', 'В']);
    });

    test('сбой отправки возвращает порядок, подтверждённый сервером', () async {
      final s = studioWith([item(1, 'А'), item(2, 'Б'), item(3, 'В')]);
      final c = make(s);
      await c.load();
      await c.move(0, 3); // Б В А — подтверждено
      s.fail = true;
      await expectLater(c.move(2, 0), throwsException);
      expect([for (final i in c.items) i.title], ['Б', 'В', 'А']);
      s.fail = false;
      await c.move(0, 2); // после сбоя очередь жива
      expect([for (final i in c.items) i.title], ['В', 'Б', 'А']);
      expect(s.calls.last, 'reorder:3,2,1');
    });

    test('добавление песни: с моей версией и без', () async {
      final s = studioWith([]);
      final c = make(s);
      await c.load();
      await c.addSong(5, versionId: 3);
      await c.addSong(6);
      expect(s.calls, ['add:5:3', 'add:6:']);
      expect(c.items.length, 2);
    });

    test('название, дата и доступ по ссылке: сразу на экране, при ошибке откат', () async {
      final s = studioWith([]);
      final c = make(s);
      await c.load();
      await c.rename('  Праздник  ');
      expect(c.setlist.title, 'Праздник');
      await c.setDate(DateTime(2026, 12, 25, 14));
      expect(c.setlist.date, DateTime(2026, 12, 25));
      await c.setDate(null);
      expect(c.setlist.date, isNull);
      await c.setPublic(true);
      expect(c.setlist.isPublic, isTrue);
      expect(s.calls, ['patch:7:Праздник::', 'patch:7:::', 'patch:7::cleardate:', 'patch:7:::true']);

      s.fail = true;
      await expectLater(c.setPublic(false), throwsException);
      expect(c.setlist.isPublic, isTrue);
      await expectLater(c.rename('Другое'), throwsException);
      expect(c.setlist.title, 'Праздник');
    });
  });
}
