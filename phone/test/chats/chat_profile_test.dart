import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/chats/chat_profile_page.dart';
import 'package:molitva/features/chats/models/chat_models.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_chat.dart';

SessionController _session() {
  final s = SessionController();
  s.user = AppUser(id: 9, name: 'Мария Лис', firstName: 'Мария', lastName: 'Лис', role: 'member', roles: const ['member'], registrationStatus: 'active');
  return s;
}

Widget _app(FakeChat chat, {required bool group, bool muted = false, double scale = 1, double width = 360, Brightness brightness = Brightness.light}) => ChangeNotifierProvider.value(
      value: _session(),
      child: MaterialApp(
        theme: churchTheme(brightness: brightness),
        home: MediaQuery(
          data: MediaQueryData(size: Size(width, 900), textScaler: TextScaler.linear(scale)),
          child: ChatProfilePage(
            key: UniqueKey(),
            conversationId: 'c1',
            title: group ? 'Молодёжь' : 'Анна Орлова',
            isGroup: group,
            otherMemberId: group ? null : 2,
            muted: muted,
            source: chat,
          ),
        ),
      ),
    );

void _size(WidgetTester tester, {double width = 360, double height = 900}) {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

FakeChat _private() => FakeChat()
  ..profile = PrivateProfile.fromJson({
    'id': 2,
    'first_name': 'Анна',
    'last_name': 'Орлова',
    'phone_number': '+7 900 123-45-67',
    'ministry_role': 'Ведущий, Оператор',
    'ministry_direction': 'Медиа',
    'app_role': 'musician',
    'birth_date': '1990-${DateTime.now().month.toString().padLeft(2, '0')}-${DateTime.now().day.toString().padLeft(2, '0')}',
    'last_seen_at': DateTime.now().subtract(const Duration(minutes: 30)).toIso8601String(),
  });

void main() {
  setUpAll(() => initializeDateFormatting('ru'));
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('личный чат', () {
    testWidgets('имя, статус, телефон, день рождения, служение, направление, роль', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_private(), group: false));
      await tester.pumpAndSettle();
      expect(find.text('Анна Орлова'), findsOneWidget);
      expect(find.text('был(а) 30 мин назад'), findsOneWidget);
      expect(find.text('+7 900 123-45-67'), findsOneWidget);
      expect(find.text('Телефон'), findsOneWidget);
      expect(find.text('День рождения'), findsOneWidget);
      expect(find.text('СЕГОДНЯ'), findsOneWidget, reason: 'именинник сегодня');
      expect(find.text('Ведущий'), findsOneWidget);
      expect(find.text('Оператор'), findsOneWidget);
      expect(find.text('Медиа'), findsOneWidget);
      expect(find.text('Музыкант'), findsOneWidget, reason: 'роль по-русски');
    });

    testWidgets('быстрые действия: чат, звонок, звук', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_private(), group: false));
      await tester.pumpAndSettle();
      expect(find.text('Чат'), findsOneWidget);
      expect(find.text('Звонок'), findsOneWidget);
      expect(find.text('Звук'), findsOneWidget);
    });

    testWidgets('звук: выключить → «Включить»; сбой сервера возвращает как было', (tester) async {
      final chat = _private();
      _size(tester);
      await tester.pumpWidget(_app(chat, group: false));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Звук'));
      await tester.pumpAndSettle();
      expect(chat.calls, contains('mute:true'));
      expect(find.text('Включить'), findsOneWidget);
      await tester.tap(find.text('Включить'));
      await tester.pumpAndSettle();
      expect(chat.calls, contains('mute:false'));
      expect(find.text('Звук'), findsOneWidget);
    });

    testWidgets('уже отключённый чат показывает «Включить»', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_private(), group: false, muted: true));
      await tester.pumpAndSettle();
      expect(find.text('Включить'), findsOneWidget);
    });

    testWidgets('копирование номера', (tester) async {
      final copied = <String>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') copied.add((call.arguments as Map)['text'] as String);
        return null;
      });
      addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
      _size(tester);
      await tester.pumpWidget(_app(_private(), group: false));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Скопировать номер'));
      await tester.pumpAndSettle();
      expect(copied, ['+7 900 123-45-67']);
      expect(find.text('Номер скопирован'), findsOneWidget);
    });

    testWidgets('собеседник ничего не заполнил — понятная подпись', (tester) async {
      final chat = FakeChat()..profile = const PrivateProfile(id: 2, name: 'Анна Орлова');
      _size(tester);
      await tester.pumpWidget(_app(chat, group: false));
      await tester.pumpAndSettle();
      expect(find.text('Собеседник пока не заполнил данные.'), findsOneWidget);
    });

    testWidgets('общие медиа: фото, файлы и ссылки', (tester) async {
      final chat = _private()
        ..all = [
          msg('1', type: 'image', text: '', payload: {'url': '/u/1.jpg'}),
          msg('2', type: 'file', text: '', payload: {'url': '/u/a.pdf', 'name': 'Отчёт.pdf'}),
          msg('3', text: 'Посмотри https://example.com/page'),
        ];
      _size(tester, height: 1400);
      await tester.pumpWidget(_app(chat, group: false));
      await tester.pumpAndSettle();
      expect(find.text('Общие медиа'), findsOneWidget);
      expect(find.text('ФОТО · 1'), findsOneWidget);
      expect(find.text('ФАЙЛЫ · 1'), findsOneWidget);
      expect(find.text('Отчёт.pdf'), findsOneWidget);
      expect(find.text('ССЫЛКИ · 1'), findsOneWidget);
      expect(find.text('https://example.com/page'), findsOneWidget);
    });

    testWidgets('нет медиа — пояснение', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(_private(), group: false));
      await tester.pumpAndSettle();
      expect(find.text('Фото, файлов и ссылок пока нет.'), findsOneWidget);
    });

    testWidgets('сбой загрузки — «Повторить», потом всё на месте', (tester) async {
      final chat = _private()..failMessages = true;
      _size(tester);
      await tester.pumpWidget(_app(chat, group: false));
      await tester.pumpAndSettle();
      expect(find.text('Не удалось загрузить медиа.'), findsOneWidget);
    });
  });

  group('группа', () {
    FakeChat group() => FakeChat()
      ..metaNow = const ChatMeta(type: 'group', title: 'Молодёжная группа', description: 'Общаемся и молимся вместе')
      ..membersNow = [
        const ChatMember(id: 5, name: 'Ольга Ким', online: false),
        const ChatMember(id: 3, name: 'Пётр Сидоров', online: true),
        const ChatMember(id: 9, name: 'Мария Лис', role: 'admin'),
        const ChatMember(id: 1, name: 'Иван Петров', role: 'owner'),
      ];

    testWidgets('название, описание и подпись «4 участника, 1 в сети»', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(group(), group: true));
      await tester.pumpAndSettle();
      expect(find.text('Молодёжная группа'), findsOneWidget);
      expect(find.text('Общаемся и молимся вместе'), findsOneWidget);
      expect(find.text('4 участника, 1 в сети'), findsOneWidget);
    });

    testWidgets('участники: владелец, админ, затем «в сети», затем остальные; метки ролей', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(group(), group: true));
      await tester.pumpAndSettle();
      double top(String t) => tester.getTopLeft(find.text(t)).dy;
      expect(top('Иван Петров'), lessThan(top('Мария Лис (вы)')));
      expect(top('Мария Лис (вы)'), lessThan(top('Пётр Сидоров')));
      expect(top('Пётр Сидоров'), lessThan(top('Ольга Ким')));
      expect(find.text('ВЛАДЕЛЕЦ'), findsOneWidget);
      expect(find.text('АДМИН'), findsOneWidget);
      expect(find.text('в сети'), findsOneWidget);
    });

    testWidgets('канал: «подписчики»', (tester) async {
      final chat = group();
      _size(tester);
      await tester.pumpWidget(ChangeNotifierProvider.value(
        value: _session(),
        child: MaterialApp(
          theme: churchTheme(brightness: Brightness.light),
          home: ChatProfilePage(conversationId: 'c1', title: 'Новости', isGroup: true, channel: true, source: chat),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('4 подписчика, 1 в сети'), findsOneWidget);
      expect(find.text('ПОДПИСЧИКИ'), findsOneWidget);
    });

    testWidgets('тап по участнику — лист с «Написать»; по себе — ничего', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(group(), group: true));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Мария Лис (вы)'));
      await tester.pumpAndSettle();
      expect(find.text('Написать'), findsNothing);
      await tester.tap(find.text('Пётр Сидоров'));
      await tester.pumpAndSettle();
      expect(find.text('Написать'), findsOneWidget);
    });

    testWidgets('быстрые действия группы — без «Звонка»', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(group(), group: true));
      await tester.pumpAndSettle();
      expect(find.text('Звонок'), findsNothing);
      expect(find.text('Чат'), findsOneWidget);
      expect(find.text('Звук'), findsOneWidget);
    });
  });

  group('вёрстка без переполнений', () {
    for (final (width, scale, brightness) in [(320.0, 1.0, Brightness.light), (320.0, 2.0, Brightness.light), (360.0, 1.3, Brightness.dark)]) {
      testWidgets('профиль: ширина $width, шрифт $scale, ${brightness.name}', (tester) async {
        _size(tester, width: width, height: 2400);
        await tester.pumpWidget(_app(_private(), group: false, width: width, scale: scale, brightness: brightness));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        final chat = FakeChat()
          ..metaNow = ChatMeta(type: 'group', title: 'Очень длинное название группы церкви ' * 3, description: 'Описание ' * 30)
          ..membersNow = [for (var i = 1; i <= 8; i++) ChatMember(id: i, name: 'Константинопольский Александр Константинович $i', role: i == 1 ? 'owner' : 'member', online: i.isEven)];
        await tester.pumpWidget(_app(chat, group: true, width: width, scale: scale, brightness: brightness));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  });
}
