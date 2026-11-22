import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/calls/logic/call_status.dart';

void main() {
  test('статус звонка с сервера → сообщение или «идёт»', () {
    expect(endMessageForStatus('declined'), 'Собеседник отклонил звонок');
    expect(endMessageForStatus('missed'), 'Собеседник не ответил');
    expect(endMessageForStatus('cancelled'), 'Звонок отменён');
    expect(endMessageForStatus('ended'), 'Звонок завершён');
    expect(endMessageForStatus('failed'), 'Звонок завершён');
    for (final s in ['ringing', 'waiting', 'active', '']) {
      expect(endMessageForStatus(s), isNull, reason: s);
    }
  });

  test('события сокета: отклонён, отменён, завершён, без ответа, служебная очистка игнорируется', () {
    expect(endMessageForEvent('call:rejected'), 'Собеседник отклонил звонок');
    expect(endMessageForEvent('call:cancelled'), 'Звонок отменён');
    expect(endMessageForEvent('call:ended'), 'Звонок завершён');
    expect(endMessageForEvent('call:ended', reason: 'no_answer'), 'Собеседник не ответил');
    expect(endMessageForEvent('call:ended', reason: 'ghost_cleanup'), isNull);
    expect(endMessageForEvent('call:accepted'), isNull);
    expect(endMessageForEvent('call:participant_joined'), isNull);
  });

  test('подпись ожидания', () {
    expect(waitingStatus(direct: true, outgoing: true), 'Вызываем…');
    expect(waitingStatus(direct: true, outgoing: false), 'Ждём собеседника…');
    expect(waitingStatus(direct: false, outgoing: true), 'Ждём участников');
  });
}
