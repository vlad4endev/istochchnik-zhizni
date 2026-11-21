import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/features/calls/logic/meeting_logic.dart';
import 'package:molitva/features/calls/widgets/meeting_sheet.dart';
import 'package:molitva/core/theme.dart';
import 'package:provider/provider.dart';

AppUser _user({String role = 'member', List<String> roles = const ['member'], bool coordinator = false}) => AppUser(
      id: 1,
      name: 'Мария Лис',
      firstName: 'Мария',
      lastName: 'Лис',
      role: role,
      roles: roles,
      registrationStatus: 'active',
      isCollectionCoordinator: coordinator,
    );

void main() {
  group('meeting_logic', () {
    test('cleanMeetingTitle: пробелы, пусто, длина 80', () {
      expect(cleanMeetingTitle(null), isNull);
      expect(cleanMeetingTitle('   '), isNull);
      expect(cleanMeetingTitle('  Молитва за семью '), 'Молитва за семью');
      expect(cleanMeetingTitle('я' * 120)!.length, meetingTitleMax);
    });

    test('inviteShareText: название и ссылка, дефолтное название', () {
      expect(inviteShareText('Стража', 'https://x/call/join/t', media: MeetingMedia.video), 'Стража\nhttps://x/call/join/t');
      expect(inviteShareText('  ', 'https://x', media: MeetingMedia.audio), 'Аудиовстреча\nhttps://x');
      expect(inviteShareText('Встреча', '', media: MeetingMedia.video), 'Встреча');
    });

    test('absoluteInviteUrl: относительная ссылка дополняется origin', () {
      expect(absoluteInviteUrl('/call/join/abc', 'https://app.example/'), 'https://app.example/call/join/abc');
      expect(absoluteInviteUrl('https://a.b/call/join/abc', 'https://app.example'), 'https://a.b/call/join/abc');
      expect(absoluteInviteUrl('', 'https://app.example'), '');
    });

    test('canUseMeetingTemplates: пастор, админ, координатор — да; участник — нет', () {
      expect(canUseMeetingTemplates(null), isFalse);
      expect(canUseMeetingTemplates(_user()), isFalse);
      expect(canUseMeetingTemplates(_user(role: 'pastor', roles: const ['pastor'])), isTrue);
      expect(canUseMeetingTemplates(_user(roles: const ['member', 'admin'])), isTrue);
      expect(canUseMeetingTemplates(_user(coordinator: true)), isTrue);
    });

    test('MeetingLaunch.standalone зависит от чата', () {
      expect(const MeetingLaunch(media: MeetingMedia.video).standalone, isTrue);
      expect(const MeetingLaunch(media: MeetingMedia.video, conversationId: '').standalone, isTrue);
      expect(const MeetingLaunch(media: MeetingMedia.video, conversationId: 'c1').standalone, isFalse);
    });
  });

  group('MeetingForm', () {
    Future<MeetingLaunch?> pump(WidgetTester tester, {required MeetingMedia media, AppUser? user, String? chat, double scale = 1}) async {
      tester.view.physicalSize = const Size(320, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      MeetingLaunch? result;
      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: SessionController(),
          child: MaterialApp(
            theme: churchTheme(brightness: Brightness.light),
            home: MediaQuery(
              data: MediaQueryData(size: const Size(320, 700), textScaler: TextScaler.linear(scale)),
              child: Scaffold(
                body: SingleChildScrollView(
                  child: MeetingForm(media: media, conversationId: chat, user: user),
                ),
              ),
            ),
          ),
        ),
      );
      return result;
    }

    testWidgets('обычный участник: нет шаблонов, видео — есть переключатель камеры', (tester) async {
      await pump(tester, media: MeetingMedia.video, user: _user());
      expect(find.byKey(const ValueKey('meeting-template-morning')), findsNothing);
      expect(find.byKey(const ValueKey('meeting-cam')), findsOneWidget);
      expect(find.text('Название встречи'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('аудио: переключателя камеры нет', (tester) async {
      await pump(tester, media: MeetingMedia.audio, user: _user());
      expect(find.byKey(const ValueKey('meeting-cam')), findsNothing);
      expect(find.byKey(const ValueKey('meeting-mic')), findsOneWidget);
    });

    testWidgets('пастор: шаблоны на 320 px и шрифте 200% без переполнения', (tester) async {
      await pump(tester, media: MeetingMedia.video, user: _user(role: 'pastor', roles: const ['pastor']), scale: 2);
      expect(find.byKey(const ValueKey('meeting-template-morning')), findsOneWidget);
      expect(find.byKey(const ValueKey('meeting-template-evening')), findsOneWidget);
      expect(find.text('Своё название'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('создание возвращает название, чат и состояние микрофона/камеры', (tester) async {
      MeetingLaunch? result;
      tester.view.physicalSize = const Size(360, 760);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        MaterialApp(
          theme: churchTheme(brightness: Brightness.light),
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () async {
                    result = await showModalBottomSheet<MeetingLaunch>(
                      context: context,
                      isScrollControlled: true,
                      builder: (_) => MeetingForm(media: MeetingMedia.video, conversationId: 'c1', user: _user()),
                    );
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
      await tester.enterText(find.byType(TextField), '  Молодёжная встреча  ');
      await tester.tap(find.byKey(const ValueKey('meeting-cam')));
      await tester.pump();
      await tester.tap(find.text('Создать видеовстречу').last);
      await tester.pumpAndSettle();
      expect(result, isNotNull);
      expect(result!.title, 'Молодёжная встреча');
      expect(result!.conversationId, 'c1');
      expect(result!.micOn, isTrue);
      expect(result!.camOn, isFalse);
      expect(result!.standalone, isFalse);
    });

    testWidgets('шаблон возвращает своё название', (tester) async {
      MeetingLaunch? result;
      tester.view.physicalSize = const Size(360, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        MaterialApp(
          theme: churchTheme(brightness: Brightness.light),
          home: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: ElevatedButton(
                  onPressed: () async {
                    result = await showModalBottomSheet<MeetingLaunch>(
                      context: context,
                      isScrollControlled: true,
                      builder: (_) => MeetingForm(media: MeetingMedia.audio, conversationId: null, user: _user(coordinator: true)),
                    );
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
      await tester.tap(find.byKey(const ValueKey('meeting-template-evening')));
      await tester.pumpAndSettle();
      expect(result!.title, 'Вечерняя молитвенная стража');
      expect(result!.standalone, isTrue);
      expect(result!.media, MeetingMedia.audio);
    });
  });
}
