import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:molitva/features/service/logic/plan_logic.dart';
import 'package:molitva/features/service/models/plan_models.dart';

PlanBlock block(int id, String title, int minutes, {BlockKind kind = BlockKind.other, String assigned = '', String song = '', String key = '', Map<String, dynamic> content = const {}, String type = ''}) => PlanBlock(
      id: id,
      order: id,
      title: title,
      durationMinutes: minutes,
      kind: kind,
      typeName: type,
      assignedName: assigned,
      songTitle: song,
      songKey: key,
      content: content,
    );

void main() {
  setUpAll(() => initializeDateFormatting('ru'));

  test('время: разбор и вывод', () {
    expect(parseClock('11:00'), 660);
    expect(parseClock('9:05'), 545);
    expect(parseClock('11:00:00'), 660);
    expect(parseClock(''), isNull);
    expect(parseClock('25:00'), isNull);
    expect(formatClock(660), '11:00');
    expect(formatClock(24 * 60 + 5), '00:05', reason: 'после полуночи не уходим за 24 часа');
  });

  test('ход служения: старт каждого блока и конец', () {
    final t = Timeline.of('11:00', [block(1, 'Открытие', 5), block(2, 'Песни', 20), block(3, 'Проповедь', 40)]);
    expect(t.starts, ['11:00', '11:05', '11:25']);
    expect(t.end, '12:05');
    expect(t.totalMinutes, 65);
  });

  test('без времени начала времён блоков нет, длительность считается', () {
    final t = Timeline.of('', [block(1, 'A', 10), block(2, 'B', 15)]);
    expect(t.starts, isEmpty);
    expect(t.end, isNull);
    expect(t.totalMinutes, 25);
  });

  test('отрицательная и нулевая длительность не ломают расчёт', () {
    final t = Timeline.of('10:00', [block(1, 'A', -5), block(2, 'B', 0), block(3, 'C', 10)]);
    expect(t.starts, ['10:00', '10:00', '10:00']);
    expect(t.end, '10:10');
  });

  test('длительность словами', () {
    expect([for (final m in [0, 45, 60, 100, 120]) durationText(m)], ['', '45 мин', '1 ч', '1 ч 40 мин', '2 ч']);
  });

  test('заметка без служебных строк и пустых меток', () {
    const raw = 'Читает:\nschedule_week_start\n2026-11-16\nВажная мысль\nТема:\nвторая строка';
    expect(meaningfulNote(raw, const {'schedule_week_start': '2026-11-16'}), 'Важная мысль\nвторая строка');
    expect(meaningfulNote('Заметка:', const {}), '');
  });

  test('стих: чтец, автор и тема', () {
    final d = detailsOf(block(1, '3. Стих', 3, kind: BlockKind.poem, assigned: 'Мария Сидорова', content: {'poem_author': 'А. Пушкин', 'poem_theme': 'Вера'}));
    expect(d.heading, 'Стих — Мария Сидорова');
    expect(d.subline, 'А. Пушкин • Вера');
  });

  test('проповедь: имя, тема и место Писания', () {
    final d = detailsOf(block(1, 'Проповедь', 40, kind: BlockKind.sermon, assigned: 'Пётр Иванов', content: {'sermon_topic': 'Любовь Бога', 'sermon_scripture': 'Ин 3:16'}));
    expect(d.heading, 'Пётр Иванов — Любовь Бога');
    expect(d.scripture, 'Ин 3:16');
    expect(detailsOf(block(1, 'Проповедь', 40, kind: BlockKind.sermon)).heading, 'Проповедь');
  });

  test('песня: название с тональностью показывается, если оно не повторяет заголовок', () {
    expect(detailsOf(block(1, 'Прославление', 10, kind: BlockKind.song, song: '10 000 причин', key: 'G')).songLine, '10 000 причин [G]');
    expect(detailsOf(block(1, '1. 10 000 причин', 5, kind: BlockKind.song, song: '10 000 причин', key: 'G')).songLine, isEmpty, reason: 'уже в заголовке');
  });

  test('заметка-дубль названия песни скрывается', () {
    final d = detailsOf(block(1, 'Прославление', 5, kind: BlockKind.song, song: 'Велик Бог', content: {'notes': 'Велик Бог'}));
    expect(d.note, isEmpty);
  });

  test('дни рождения и расписание недели', () {
    final b = detailsOf(block(1, '', 2, kind: BlockKind.birthdays, content: {
      'birthday_people': [
        {'name': 'Анна', 'week_date': '2026-11-20'},
        {'name': 'Борис'},
        {'name': ''},
      ],
    }));
    expect(b.list.first, startsWith('Анна — '));
    expect(b.list.last, 'Борис');
    expect(b.list.length, 2);

    final s = detailsOf(block(2, 'Расписание', 2, kind: BlockKind.schedule, content: {
      'schedule_events': [
        {'title': 'Молодёжная', 'event_date': '2026-11-21', 'event_time': '18:30:00'},
      ],
    }));
    expect(s.list.single, contains('18:30 — Молодёжная'));
  });

  test('подготовка сцены', () {
    expect(stageSetupLines(const {'place_mic_and_pulpits': true}), ['Выставляем микрофоны и пюпитры']);
    expect(stageSetupLines(const {'remove_mic_stands': 'true', 'remove_pulpits': 1}), ['Убираем микрофонные стойки', 'Убираем пюпитры']);
    expect(stageSetupLines(const {}), isEmpty);
  });

  test('виды блоков по коду и названию типа', () {
    expect(detectBlockKind(code: 'sermon', typeName: ''), BlockKind.sermon);
    expect(detectBlockKind(code: '', typeName: 'Стихотворение'), BlockKind.poem);
    expect(detectBlockKind(code: '', typeName: 'Дни рождения'), BlockKind.birthdays);
    expect(detectBlockKind(code: '', typeName: 'Другое', songId: 5), BlockKind.song);
    expect(detectBlockKind(code: '', typeName: 'Объявления'), BlockKind.other);
  });

  test('программа текстом для отправки', () {
    final plan = PlanView(
      summary: PlanSummary(id: 1, date: DateTime(2026, 11, 22), startTime: '11:00', published: true, blocksCount: 2, templateName: 'Воскресное служение'),
      leaderName: 'Иван Петров',
      preacherName: 'Пётр Иванов',
      notes: 'Принести Библии',
      blocks: [
        block(1, 'Открытие', 5, assigned: 'Иван Петров'),
        block(2, 'Прославление', 20, kind: BlockKind.song, song: 'Велик Бог', key: 'D'),
      ],
    );
    final text = programText(plan);
    expect(text, startsWith('Воскресное служение — воскресенье, 22 ноября 2026, 11:00'));
    expect(text, contains('Ведущий: Иван Петров'));
    expect(text, contains('11:00 Открытие: Иван Петров (5 мин)'));
    expect(text, contains('11:05 Прославление: Велик Бог [D] (20 мин)'));
    expect(text, contains('Окончание около 11:25 (25 мин)'));
    expect(text, endsWith('Принести Библии'));
  });
}
