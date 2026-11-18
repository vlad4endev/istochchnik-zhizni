import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/core/dates.dart';
import 'package:molitva/features/songbook/logic/song_format.dart';
import 'package:molitva/ui/kit/components.dart';

void main() {
  test('инициалы берут только буквы', () {
    expect(initialsOf('Богослужение (планирование)'), 'БП');
    expect(initialsOf('Андрей Жуков'), 'АЖ');
    expect(initialsOf('  '), '?');
    expect(initialsOf('Молодёжь'), 'М');
  });

  test('подписи частей песни', () {
    expect(parseSectionTitle('[Припев]'), 'Припев');
    expect(parseSectionTitle('Куплет 1:'), 'Куплет 1');
    expect(parseSectionTitle('Бога благослови, о, душа моя'), isNull);
    expect(parseSectionTitle('[A]'), isNull);
  });

  test('относительное время и длительность', () {
    final now = DateTime(2026, 11, 15, 12);
    expect(relativeTime(DateTime(2026, 11, 15, 10).toIso8601String(), now: now), '2 ч назад');
    expect(relativeTime(DateTime(2026, 11, 14, 10).toIso8601String(), now: now), 'вчера');
    expect(relativeTime('', now: now), '');
    expect(durationLabel(3500), '58:20');
    expect(durationLabel(6130), '1:42:10');
    expect(durationLabel(0), '');
    expect(shortTime('11:00:00'), '11:00');
  });
}
