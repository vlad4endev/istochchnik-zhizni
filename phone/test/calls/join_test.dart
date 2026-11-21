import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/calls/join_meeting_page.dart';
import 'package:molitva/features/calls/logic/invite_logic.dart';
import 'package:molitva/features/calls/logic/meeting_logic.dart';
import 'package:provider/provider.dart';

const _token = 'aB3_dE-fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5zA7bC9';

Widget _app(Widget home, {double width = 320, double scale = 1}) => ChangeNotifierProvider.value(
      value: SessionController(),
      child: MaterialApp(
        theme: churchTheme(brightness: Brightness.light),
        home: MediaQuery(data: MediaQueryData(size: Size(width, 700), textScaler: TextScaler.linear(scale)), child: home),
      ),
    );

void _size(WidgetTester tester, [double w = 320]) {
  tester.view.physicalSize = Size(w, 700);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

void main() {
  group('parseInviteToken', () {
    test('ссылка, относительный путь, «название + ссылка», токен', () {
      expect(parseInviteToken('https://app.example/call/join/$_token'), _token);
      expect(parseInviteToken('/call/join/$_token?x=1'), _token);
      expect(parseInviteToken('Утренняя молитвенная стража\nhttps://a.b/call/join/$_token'), _token);
      expect(parseInviteToken('  $_token  '), _token);
      expect(parseInviteToken('https://a.b/call/join/$_token.'), _token);
    });
    test('не ссылка → null', () {
      expect(parseInviteToken(null), isNull);
      expect(parseInviteToken(''), isNull);
      expect(parseInviteToken('привет'), isNull);
      expect(parseInviteToken('https://example.com/page'), isNull);
    });
    test('inviteTokenFromUrl: голый токен не считается ссылкой', () {
      expect(inviteTokenFromUrl('https://a.b/call/join/$_token'), _token);
      expect(inviteTokenFromUrl(_token), isNull);
      expect(inviteTokenFromUrl('https://a.b/other'), isNull);
    });
  });

  group('InvitePreview', () {
    test('причины отказа по-русски', () {
      String? msg(Map<String, dynamic> j) => InvitePreview.fromJson(j).blockReason;
      expect(msg({'valid': true, 'canJoin': true}), isNull);
      expect(msg({'valid': false, 'reason': 'expired'}), 'Срок приглашения истёк');
      expect(msg({'valid': false, 'reason': 'revoked'}), 'Приглашение отозвано');
      expect(msg({'valid': false, 'reason': 'call_ended'}), 'Встреча уже завершена');
      expect(msg({'valid': true, 'reason': 'no_group_access', 'canJoin': false}), 'Нет доступа к этой встрече');
      expect(msg({'valid': false, 'reason': 'exhausted'}), 'Лимит использований приглашения исчерпан');
      expect(msg({'valid': false}), 'Приглашение недействительно');
    });
    test('название и тип', () {
      final p = InvitePreview.fromJson({'valid': true, 'canJoin': true, 'mediaType': 'audio', 'title': ' Стража ', 'participantCount': 3});
      expect(p.displayTitle, 'Стража');
      expect(p.media, MeetingMedia.audio);
      expect(p.participants, 3);
      expect(InvitePreview.fromJson({'valid': true, 'canJoin': true}).displayTitle, 'Видеовстреча');
    });
  });

  group('JoinMeetingPage', () {
    Future<void> open(WidgetTester tester, InvitePreviewLoader loader, {double scale = 1}) async {
      _size(tester);
      await tester.pumpWidget(_app(JoinMeetingPage(token: _token, loader: loader), scale: scale));
      await tester.pump(const Duration(milliseconds: 400));
    }

    testWidgets('видеовстреча: название, камера и микрофон, «Войти»', (tester) async {
      await open(tester, (_) async => const InvitePreview(valid: true, canJoin: true, media: MeetingMedia.video, title: 'Молодёжная', participants: 2), scale: 2);
      expect(find.text('Молодёжная'), findsWidgets);
      expect(find.byKey(const ValueKey('join-cam')), findsOneWidget);
      expect(find.byKey(const ValueKey('join-mic')), findsOneWidget);
      expect(find.byKey(const ValueKey('join-go')), findsOneWidget);
      expect(find.text('Участников: 2'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('аудио: без переключателя камеры', (tester) async {
      await open(tester, (_) async => const InvitePreview(valid: true, canJoin: true, media: MeetingMedia.audio));
      expect(find.byKey(const ValueKey('join-cam')), findsNothing);
      expect(find.text('Аудиовстреча'), findsWidgets);
    });

    testWidgets('приглашение истекло: причина и нет кнопки «Войти»', (tester) async {
      await open(tester, (_) async => InvitePreview.fromJson({'valid': false, 'reason': 'expired'}));
      expect(find.text('Срок приглашения истёк'), findsOneWidget);
      expect(find.byKey(const ValueKey('join-go')), findsNothing);
    });

    testWidgets('сбой загрузки: «Повторить» запрашивает снова', (tester) async {
      var calls = 0;
      await open(tester, (_) async {
        calls++;
        if (calls == 1) throw Exception('network');
        return const InvitePreview(valid: true, canJoin: true, media: MeetingMedia.video);
      });
      expect(find.text('Повторить'), findsOneWidget);
      await tester.tap(find.text('Повторить'));
      await tester.pump(const Duration(milliseconds: 400));
      expect(calls, 2);
      expect(find.byKey(const ValueKey('join-go')), findsOneWidget);
    });
  });

  group('JoinByLinkForm', () {
    Future<String?> run(WidgetTester tester, {String? clipboard, String? typed}) async {
      _size(tester, 360);
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.getData') return clipboard == null ? null : {'text': clipboard};
        return null;
      });
      addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
      String? result;
      await tester.pumpWidget(
        MaterialApp(
          theme: churchTheme(brightness: Brightness.light),
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () async {
                    result = await showModalBottomSheet<String>(context: context, isScrollControlled: true, builder: (_) => const JoinByLinkForm());
                  },
                  child: const Text('open'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      if (typed != null) await tester.enterText(find.byType(TextField), typed);
      await tester.tap(find.text('Продолжить'));
      await tester.pumpAndSettle();
      return result;
    }

    testWidgets('ссылка из буфера подставляется и принимается', (tester) async {
      expect(await run(tester, clipboard: 'Стража\nhttps://a.b/call/join/$_token'), _token);
    });

    testWidgets('мусор: ошибка и лист не закрывается', (tester) async {
      expect(await run(tester, typed: 'привет'), isNull);
      expect(find.textContaining('Не нашли ссылку'), findsOneWidget);
    });

    testWidgets('обычный текст в буфере не подставляется', (tester) async {
      await run(tester, clipboard: 'купить хлеб');
      expect(find.textContaining('Не нашли ссылку'), findsOneWidget);
    });
  });
}
