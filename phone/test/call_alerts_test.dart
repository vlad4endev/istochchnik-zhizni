import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/core/call_alerts.dart';

/// Ровно те ключи, что кладёт сервер: sendIncomingCallWake + toFcmDataStrings (src/services/pushService.ts).
Map<String, dynamic> serverIncoming({String callType = 'audio'}) => {
      'title': 'Входящий звонок',
      'body': 'Андрей Жуков',
      'type': 'incoming_call',
      'callId': '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      'conversationId': '42',
      'callType': callType,
      'callerId': '7',
      'callerName': 'Андрей Жуков',
      'callerAvatar': '',
      'url': '/call/7c9e6679-7425-40de-944b-e07fc1f90ae7',
      'tag': 'call-7c9e6679-7425-40de-944b-e07fc1f90ae7',
      'renotify': 'true',
      'requireInteraction': 'true',
    };

void main() {
  test('пуш входящего звонка разбирается', () {
    final invite = CallInvite.fromPush(serverIncoming(callType: 'video'))!;
    expect(invite.callId, '7c9e6679-7425-40de-944b-e07fc1f90ae7');
    expect(invite.callerName, 'Андрей Жуков');
    expect(invite.video, isTrue);
    expect(invite.conversationId, '42');
  });

  test('обычный пуш сообщения — не звонок', () {
    expect(CallInvite.fromPush({'title': 'Чат', 'body': 'Привет', 'conversationId': '42'}), isNull);
    expect(CallInvite.fromPush({'type': 'incoming_call'}), isNull, reason: 'без callId звонить некуда');
  });

  test('пуши об окончании звонка снимают звонилку', () {
    expect(CallInvite.endedCallId({'type': 'call_ended', 'callId': 'a'}), 'a');
    expect(CallInvite.endedCallId({'type': 'call_cancelled', 'callId': 'b'}), 'b');
    expect(CallInvite.endedCallId({'type': 'incoming_call', 'callId': 'c'}), isNull);
  });

  test('параметры системной звонилки и обратный разбор', () {
    final invite = CallInvite.fromPush(serverIncoming())!;
    final params = invite.toParams();
    expect(params.id, invite.callId);
    expect(params.type, 0);
    expect(params.nameCaller, 'Андрей Жуков');
    expect(params.android?.textAccept, 'Ответить');
    expect(params.android?.isShowFullLockedScreen, isTrue);
    final back = CallInvite.fromParams(params);
    expect(back.callId, invite.callId);
    expect(back.conversationId, '42');
    expect(back.video, isFalse);
  });
}
