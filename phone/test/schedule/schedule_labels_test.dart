import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:molitva/features/schedule/logic/ministry_access.dart';
import 'package:molitva/features/schedule/logic/schedule_labels.dart';
import 'package:molitva/features/schedule/models/schedule_models.dart';

AgendaItem _item(DateTime d) => AgendaItem(ministry: Ministry.media, date: d, startTime: '11:00', title: 'Служение', roleName: 'Звук');

void main() {
  setUpAll(() => initializeDateFormatting('ru'));
  final today = DateTime(2026, 11, 18); // среда

  test('человеческие названия дней', () {
    expect(friendlyDay(today, today), 'Сегодня');
    expect(friendlyDay(DateTime(2026, 11, 19), today), 'Завтра');
    expect(friendlyDay(DateTime(2026, 11, 22), today), 'В воскресенье, 22 ноября');
    expect(friendlyDay(DateTime(2026, 11, 25), today), 'В среду, 25 ноября');
    expect(friendlyDay(DateTime(2026, 11, 24), today), 'Во вторник, 24 ноября');
    expect(friendlyDay(DateTime(2026, 11, 28), today), 'В субботу, 28 ноября');
  });

  test('подписи недель', () {
    expect(weekLabel(DateTime(2026, 11, 16), today), 'Эта неделя');
    expect(weekLabel(DateTime(2026, 11, 23), today), 'Следующая неделя');
    expect(weekLabel(DateTime(2026, 11, 30), today), '30 ноября – 6 декабря');
    expect(weekRange(DateTime(2026, 11, 16)), '16–22 ноября');
  });

  test('группировка по неделям сохраняет порядок', () {
    final groups = groupByWeek([_item(DateTime(2026, 11, 22)), _item(DateTime(2026, 11, 23)), _item(DateTime(2026, 11, 29))]);
    expect(groups.length, 2);
    expect(groups.first.items.length, 1);
    expect(groups.last.monday, DateTime(2026, 11, 23));
    expect(groups.last.items.length, 2);
  });

  test('склонение «ждут ответа»', () {
    expect([for (final n in [1, 2, 5, 11, 21, 22, 25]) awaitingText(n)], [
      '1 назначение', '2 назначения', '5 назначений', '11 назначений', '21 назначение', '22 назначения', '25 назначений',
    ]);
  });
}
