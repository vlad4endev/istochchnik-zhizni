import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/calls/logic/call_layout.dart';

class _P {
  const _P(this.name, {this.local = false, this.speaking = false});
  final String name;
  final bool local;
  final bool speaking;
}

void main() {
  test('сетка по числу плиток', () {
    expect((gridPlan(1).columns, gridPlan(1).rows), (1, 1));
    expect((gridPlan(2).columns, gridPlan(2).rows), (1, 2));
    expect((gridPlan(3).columns, gridPlan(3).rows), (2, 2));
    expect((gridPlan(4).columns, gridPlan(4).rows), (2, 2));
    expect((gridPlan(5).columns, gridPlan(5).rows), (2, 3));
    expect((gridPlan(6).columns, gridPlan(6).rows), (2, 3));
    expect((gridPlan(0).columns, gridPlan(0).rows), (1, 1));
  });

  test('переполнение: до шести — как есть, больше — пять плиток и «+N»', () {
    final six = splitOverflow([1, 2, 3, 4, 5, 6]);
    expect(six.visible.length, 6);
    expect(six.overflow, 0);
    final nine = splitOverflow([for (var i = 0; i < 9; i++) i]);
    expect(nine.visible.length, 5);
    expect(nine.overflow, 4);
  });

  test('крупно: говорящий собеседник → прежний → первый собеседник → я', () {
    const me = _P('Я', local: true, speaking: true);
    const a = _P('Анна');
    const b = _P('Пётр', speaking: true);
    bool local(_P p) => p.local;
    bool speaking(_P p) => p.speaking;
    expect(pickSpotlight(people: [me, a, b], isLocal: local, isSpeaking: speaking), b, reason: 'я говорю, но крупно — собеседник');
    expect(pickSpotlight(people: [me, a], isLocal: local, isSpeaking: speaking, previous: a), a);
    expect(pickSpotlight(people: [me, a], isLocal: local, isSpeaking: speaking), a);
    expect(pickSpotlight(people: [me], isLocal: local, isSpeaking: speaking), me);
    expect(pickSpotlight<_P>(people: const [], isLocal: local, isSpeaking: speaking), isNull);
  });

  test('таймер звонка', () {
    expect(callTimer(const Duration(seconds: 7)), '00:07');
    expect(callTimer(const Duration(minutes: 5, seconds: 9)), '05:09');
    expect(callTimer(const Duration(hours: 1, minutes: 2, seconds: 3)), '1:02:03');
    expect(callTimer(const Duration(seconds: -4)), '00:00');
  });

  test('подпись числа участников', () {
    expect([for (final n in [1, 2, 5, 11, 12, 21, 22, 25]) participantsCaption(n)], [
      '1 участник', '2 участника', '5 участников', '11 участников', '12 участников', '21 участник', '22 участника', '25 участников',
    ]);
  });
}
