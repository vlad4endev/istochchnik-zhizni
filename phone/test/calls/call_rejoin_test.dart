import 'package:flutter_test/flutter_test.dart';
import 'package:livekit_client/livekit_client.dart';
import 'package:molitva/features/calls/logic/call_rejoin.dart';

void main() {
  test('обрыв связи после сворачивания — возвращаемся в звонок', () {
    for (final r in [null, DisconnectReason.unknown, DisconnectReason.disconnected, DisconnectReason.stateMismatch, DisconnectReason.joinFailure]) {
      expect(shouldRejoinAfterDisconnect(r), isTrue, reason: '$r');
    }
  });

  test('звонок закрыт сервером, нас убрали, вошли с другого устройства или вышли сами — не возвращаемся', () {
    for (final r in [
      DisconnectReason.clientInitiated,
      DisconnectReason.roomDeleted,
      DisconnectReason.participantRemoved,
      DisconnectReason.serverShutdown,
      DisconnectReason.duplicateIdentity,
    ]) {
      expect(shouldRejoinAfterDisconnect(r), isFalse, reason: '$r');
    }
  });

  test('паузы растут: 2, 4, 8 секунд', () {
    expect([for (var i = 1; i <= maxRejoinAttempts; i++) rejoinDelay(i).inSeconds], [2, 4, 8]);
  });
}
