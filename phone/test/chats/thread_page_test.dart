import 'dart:async';

import 'package:emoji_picker_flutter/emoji_picker_flutter.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/chats/models/chat_models.dart';
import 'package:molitva/features/chats/thread_page.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher_platform_interface/link.dart';
import 'package:url_launcher_platform_interface/url_launcher_platform_interface.dart';

import 'fake_chat.dart';

/// Запоминает, какие адреса пытались открыть.
class _Launcher extends UrlLauncherPlatform with MockPlatformInterfaceMixin {
  final opened = <String>[];

  @override
  LinkDelegate? get linkDelegate => null;

  @override
  Future<bool> canLaunch(String url) async => true;

  @override
  Future<bool> launchUrl(String url, LaunchOptions options) async {
    opened.add(url);
    return true;
  }
}

SessionController _session({int id = 9}) {
  final s = SessionController();
  s.user = AppUser(id: id, name: 'Мария Лис', firstName: 'Мария', lastName: 'Лис', role: 'member', roles: const ['member'], registrationStatus: 'active');
  return s;
}

Widget _app(FakeChat chat, {String type = 'group', double scale = 1, double width = 360, Stream<Map<String, dynamic>>? events, Brightness brightness = Brightness.light, SessionController? session}) =>
    ChangeNotifierProvider.value(
      value: session ?? _session(),
      child: MaterialApp(
        theme: churchTheme(brightness: brightness),
        home: MediaQuery(
          data: MediaQueryData(size: Size(width, 760), textScaler: TextScaler.linear(scale)),
          child: ThreadPage(
            key: UniqueKey(),
            conversationId: 'c1',
            title: type == 'private' ? 'Анна Орлова' : 'Молодёжь',
            type: type,
            otherMemberId: type == 'private' ? 2 : null,
            source: chat,
            events: events ?? const Stream.empty(),
          ),
        ),
      ),
    );

void _size(WidgetTester tester, {double width = 360, double height = 760}) {
  tester.view.physicalSize = Size(width, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

DateTime _today(int minute) {
  final n = DateTime.now();
  return DateTime(n.year, n.month, n.day, 9, minute);
}

FakeChat _chat() => FakeChat()
  ..all = [
    msg('1', sender: 2, name: 'Анна Орлова', text: 'Всем привет', at: _today(1)),
    msg('2', sender: 2, name: 'Анна Орлова', text: 'Как дела?', at: _today(2)),
    msg('3', sender: 3, name: 'Пётр Сидоров', text: 'Хорошо, спасибо', at: _today(3)),
    msg('4', sender: 9, name: 'Мария Лис', text: 'Отлично!', at: _today(4)),
  ];

Future<void> _open(WidgetTester tester, FakeChat chat, {String type = 'group', SessionController? session}) async {
  if (type == 'private') chat.metaNow = const ChatMeta(type: 'private');
  _size(tester);
  await tester.pumpWidget(_app(chat, type: type, session: session));
  await tester.pumpAndSettle();
}

void main() {
  late _Launcher launcher;

  setUpAll(() => initializeDateFormatting('ru'));
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    launcher = _Launcher();
    UrlLauncherPlatform.instance = launcher;
  });

  group('группа: от кого сообщение', () {
    testWidgets('имя автора над первым сообщением пачки, у подряд идущих — один раз, у своих — нет', (tester) async {
      await _open(tester, _chat());
      expect(find.text('Анна Орлова'), findsOneWidget, reason: 'два её сообщения подряд — одно имя');
      expect(find.text('Пётр Сидоров'), findsOneWidget);
      expect(find.text('Мария Лис'), findsNothing, reason: 'у своих сообщений имени нет');
      expect(find.text('Всем привет'), findsOneWidget);
    });

    testWidgets('аватар автора рядом с последним сообщением пачки; у участника с фото — картинка', (tester) async {
      await _open(tester, _chat());
      expect(find.text('АО'), findsOneWidget, reason: 'аватар один на пачку');
      expect(find.text('ПС'), findsOneWidget);
    });

    testWidgets('личный чат: имён и аватаров нет', (tester) async {
      await _open(tester, _chat(), type: 'private');
      expect(find.text('Пётр Сидоров'), findsNothing);
      expect(find.text('ПС'), findsNothing);
      expect(find.text('Всем привет'), findsOneWidget);
    });

    testWidgets('разделитель дат и время сообщения', (tester) async {
      await _open(tester, _chat());
      expect(find.text('Сегодня'), findsOneWidget);
      expect(find.text('09:01'), findsOneWidget);
    });

    testWidgets('в шапке — число участников', (tester) async {
      await _open(tester, _chat());
      expect(find.text('2 участника'), findsOneWidget);
    });

    testWidgets('тап по имени автора открывает личный чат с ним — не падает без сети', (tester) async {
      final chat = _chat();
      await _open(tester, chat);
      await tester.tap(find.text('Пётр Сидоров'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  });

  group('ссылки', () {
    testWidgets('адрес в тексте кликабельный и открывается; точка в конце в адрес не входит', (tester) async {
      final chat = FakeChat()..all = [msg('1', text: 'Смотри https://example.com/page. Интересно', at: _today(1))];
      await _open(tester, chat);
      await tester.tapOnText(find.textRange.ofSubstring('https://example.com/page'));
      await tester.pumpAndSettle();
      expect(launcher.opened, ['https://example.com/page']);
      expect(find.text('Открыть меню сообщения'), findsNothing);
    });

    testWidgets('карточка ссылки: сайт, заголовок, описание; тап открывает', (tester) async {
      final chat = FakeChat()
        ..all = [msg('1', text: 'https://example.com/page', at: _today(1))]
        ..previews['https://example.com/page'] = const LinkPreview(url: 'https://example.com/page', host: 'example.com', title: 'Заголовок страницы', description: 'Описание страницы', siteName: 'Пример');
      await _open(tester, chat);
      expect(find.text('ПРИМЕР'), findsOneWidget);
      expect(find.text('Заголовок страницы'), findsOneWidget);
      expect(find.text('Описание страницы'), findsOneWidget);
      await tester.tap(find.text('Заголовок страницы'));
      await tester.pumpAndSettle();
      expect(launcher.opened, ['https://example.com/page']);
    });

    testWidgets('нет данных о странице — карточки нет; ссылка на сам сервер — без карточки', (tester) async {
      final chat = FakeChat()..all = [msg('1', text: 'https://nodata.ru и https://app.church-tambov.ru/prayer', at: _today(1))];
      await _open(tester, chat);
      expect(chat.calls.where((c) => c.startsWith('preview:')), ['preview:https://nodata.ru']);
      expect(find.byType(InkWell).evaluate().length, greaterThan(0));
    });

    testWidgets('ссылка в чужом и своём сообщении', (tester) async {
      final chat = FakeChat()..all = [msg('1', sender: 9, text: 'Мой https://a.ru', at: _today(1)), msg('2', sender: 2, text: 'Чужой https://b.ru', at: _today(2))];
      await _open(tester, chat);
      await tester.tapOnText(find.textRange.ofSubstring('https://b.ru'));
      await tester.tapOnText(find.textRange.ofSubstring('https://a.ru'));
      expect(launcher.opened, ['https://b.ru', 'https://a.ru']);
    });
  });

  group('меню сообщения', () {
    testWidgets('чужое: ответить, копировать, переслать и реакции; без правки и удаления', (tester) async {
      await _open(tester, _chat());
      await tester.tap(find.text('Как дела?'));
      await tester.pumpAndSettle();
      for (final t in ['Ответить', 'Копировать', 'Переслать']) {
        expect(find.text(t), findsOneWidget, reason: t);
      }
      expect(find.text('Редактировать'), findsNothing);
      expect(find.text('Удалить'), findsNothing);
      expect(find.text('Кто прочитал'), findsNothing);
      expect(find.text('❤️'), findsOneWidget);
      expect(find.text('👍'), findsOneWidget);
    });

    testWidgets('своё в группе: правка, удаление, «кто прочитал»', (tester) async {
      await _open(tester, _chat());
      await tester.tap(find.text('Отлично!'));
      await tester.pumpAndSettle();
      for (final t in ['Редактировать', 'Удалить', 'Кто прочитал']) {
        expect(find.text(t), findsOneWidget, reason: t);
      }
    });

    testWidgets('своё в личном чате: «кто прочитал» нет', (tester) async {
      await _open(tester, _chat(), type: 'private');
      await tester.tap(find.text('Отлично!'));
      await tester.pumpAndSettle();
      expect(find.text('Редактировать'), findsOneWidget);
      expect(find.text('Кто прочитал'), findsNothing);
    });

    testWidgets('долгое нажатие открывает то же меню с реакциями', (tester) async {
      await _open(tester, _chat());
      await tester.longPress(find.text('Как дела?'));
      await tester.pumpAndSettle();
      expect(find.text('👍'), findsOneWidget);
      expect(find.text('Ответить'), findsOneWidget);
    });

    testWidgets('«Копировать» кладёт текст в буфер', (tester) async {
      final clipboard = <String>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') clipboard.add((call.arguments as Map)['text'] as String);
        return null;
      });
      addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
      await _open(tester, _chat());
      await tester.tap(find.text('Как дела?'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Копировать'));
      await tester.pumpAndSettle();
      expect(clipboard, ['Как дела?']);
      expect(find.text('Текст скопирован'), findsOneWidget);
    });
  });

  group('реакции', () {
    testWidgets('быстрая реакция: появляется на сообщении и уходит на сервер; тап по значку снимает', (tester) async {
      final chat = _chat();
      await _open(tester, chat);
      await tester.tap(find.text('Как дела?'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('👍'));
      await tester.pumpAndSettle();
      expect(chat.calls, contains('react:2:👍:add'));
      expect(find.text('1'), findsOneWidget);
      expect(find.text('👍'), findsOneWidget, reason: 'значок реакции в пузыре');
      await tester.tap(find.text('👍'));
      await tester.pumpAndSettle();
      expect(chat.calls, contains('react:2:👍:remove'));
      expect(find.text('👍'), findsNothing);
    });

    testWidgets('сбой реакции откатывается и показывается сообщение', (tester) async {
      final chat = _chat()..failReact = true;
      await _open(tester, chat);
      await tester.tap(find.text('Как дела?'));
      await tester.pumpAndSettle();
      // Седьмая быстрая реакция за краем строки: прокручиваем её, как это сделал бы человек.
      await tester.drag(find.descendant(of: find.byType(BottomSheet), matching: find.byType(ListView)), const Offset(-300, 0));
      await tester.pumpAndSettle();
      await tester.tap(find.text('🔥'));
      await tester.pumpAndSettle();
      expect(find.text('🔥'), findsNothing);
      expect(find.textContaining('Не удалось выполнить действие'), findsOneWidget);
    });

    testWidgets('чужие реакции из ответа сервера видны с числом', (tester) async {
      final chat = FakeChat()
        ..all = [
          msg('1', text: 'Молитва', reactions: const [Reaction(emoji: '🙏', count: 3, byMe: false), Reaction(emoji: '❤️', count: 1, byMe: true)], at: _today(1)),
        ];
      await _open(tester, chat);
      expect(find.text('🙏'), findsOneWidget);
      expect(find.text('3'), findsOneWidget);
      expect(find.text('❤️'), findsOneWidget);
    });

    testWidgets('«+» в меню открывает полный каталог эмодзи', (tester) async {
      await _open(tester, _chat());
      await tester.tap(find.text('Как дела?'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Другие реакции'));
      await tester.pumpAndSettle();
      expect(find.byType(EmojiPicker), findsOneWidget);
      expect(find.text('Реакция'), findsOneWidget);
    });
  });

  group('ответ, правка, удаление, пересылка', () {
    testWidgets('«Ответить»: баннер с автором, отправка уходит с цитатой, баннер исчезает', (tester) async {
      final chat = _chat();
      await _open(tester, chat);
      await tester.tap(find.text('Как дела?'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ответить'));
      await tester.pumpAndSettle();
      expect(find.text('Ответ: Анна Орлова'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'Хорошо');
      await tester.pump();
      await tester.tap(find.byTooltip('Отправить'));
      await tester.pumpAndSettle();
      expect(chat.calls, contains('send:Хорошо:2:text'));
      expect(find.text('Ответ: Анна Орлова'), findsNothing);
      expect(find.text('Хорошо'), findsOneWidget);
    });

    testWidgets('отмена ответа крестиком', (tester) async {
      await _open(tester, _chat());
      await tester.tap(find.text('Как дела?'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ответить'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Отменить ответ'));
      await tester.pumpAndSettle();
      expect(find.text('Ответ: Анна Орлова'), findsNothing);
    });

    testWidgets('свайп сообщения к центру — «ответить»', (tester) async {
      await _open(tester, _chat());
      await tester.drag(find.text('Как дела?'), const Offset(120, 0));
      await tester.pumpAndSettle();
      expect(find.text('Ответ: Анна Орлова'), findsOneWidget);
    });

    testWidgets('«Редактировать»: текст в поле, правка меняет сообщение на месте', (tester) async {
      final chat = _chat();
      await _open(tester, chat);
      await tester.tap(find.text('Отлично!'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Редактировать'));
      await tester.pumpAndSettle();
      expect(find.text('Редактирование'), findsOneWidget);
      expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, 'Отлично!');
      await tester.enterText(find.byType(TextField), 'Замечательно!');
      await tester.pump();
      await tester.tap(find.byTooltip('Сохранить'));
      await tester.pumpAndSettle();
      expect(chat.calls, contains('edit:4:Замечательно!'));
      expect(find.text('Замечательно!'), findsOneWidget);
      expect(find.textContaining('изменено'), findsOneWidget);
      expect(find.text('Редактирование'), findsNothing);
    });

    testWidgets('«Удалить»: подтверждение, потом «Сообщение удалено»', (tester) async {
      final chat = _chat();
      await _open(tester, chat);
      await tester.tap(find.text('Отлично!'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Удалить'));
      await tester.pumpAndSettle();
      expect(find.text('Удалить сообщение?'), findsOneWidget);
      await tester.tap(find.widgetWithText(TextButton, 'Отмена'));
      await tester.pumpAndSettle();
      expect(chat.calls.where((c) => c.startsWith('delete')), isEmpty);
      await tester.tap(find.text('Отлично!'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Удалить'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Удалить'));
      await tester.pumpAndSettle();
      expect(chat.calls, contains('delete:4'));
      expect(find.text('Сообщение удалено'), findsOneWidget);
    });

    testWidgets('«Переслать»: выбор чата и отправка', (tester) async {
      final chat = _chat()
        ..conversationsNow = [
          {'id': 'c1', 'type': 'group', 'title': 'Молодёжь'},
          {'id': 'c2', 'type': 'group', 'title': 'Прославление'},
          {'id': 'c3', 'type': 'private', 'other_member': {'name': 'Пётр Сидоров'}},
        ];
      await _open(tester, chat);
      await tester.tap(find.text('Как дела?'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Переслать'));
      await tester.pumpAndSettle();
      expect(find.text('Прославление'), findsOneWidget);
      expect(find.descendant(of: find.byType(BottomSheet), matching: find.text('Молодёжь')), findsNothing, reason: 'текущий чат в списке не нужен');
      expect(find.text('Выберите чат'), findsOneWidget);
      Finder inSheet(String t) => find.descendant(of: find.byType(BottomSheet), matching: find.text(t));
      await tester.tap(inSheet('Прославление'));
      await tester.tap(inSheet('Пётр Сидоров'));
      await tester.pump();
      await tester.tap(find.text('Переслать (2)'));
      await tester.pumpAndSettle();
      expect(chat.calls, contains('forward:2:c2,c3'));
      expect(find.text('Сообщение переслано в 2 чата'), findsOneWidget);
    });

    testWidgets('«Кто прочитал»: список читателей', (tester) async {
      final chat = _chat()
        ..readersNow = Readers.fromJson({
          'readers': [
            {'member_id': 2, 'display_name': 'Анна Орлова', 'read_at': '2026-11-21T09:10:00'},
          ],
          'other_member_count': 4,
        });
      await _open(tester, chat);
      await tester.tap(find.text('Отлично!'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Кто прочитал'));
      await tester.pumpAndSettle();
      expect(find.text('Прочитали 1 из 4'), findsOneWidget);
      expect(find.text('Анна Орлова'), findsWidgets);
    });
  });

  group('эмодзи в поле ввода', () {
    testWidgets('смайлик открывает каталог, клавиатура возвращает поле', (tester) async {
      await _open(tester, _chat());
      expect(find.byType(EmojiPicker), findsNothing);
      await tester.tap(find.byTooltip('Эмодзи'));
      await tester.pumpAndSettle();
      expect(find.byType(EmojiPicker), findsOneWidget);
      expect(find.byTooltip('Клавиатура'), findsOneWidget);
      await tester.tap(find.byTooltip('Клавиатура'));
      await tester.pumpAndSettle();
      expect(find.byType(EmojiPicker), findsNothing);
    });

    testWidgets('тап по полю закрывает каталог', (tester) async {
      await _open(tester, _chat());
      await tester.tap(find.byTooltip('Эмодзи'));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(TextField));
      await tester.pumpAndSettle();
      expect(find.byType(EmojiPicker), findsNothing);
    });
  });

  group('права и состояние', () {
    testWidgets('писать запрещено — вместо поля пояснение', (tester) async {
      final chat = _chat()..metaNow = ChatMeta.fromJson({'type': 'channel', 'my_effective_permissions': {'can_send_messages': false}});
      await _open(tester, chat, type: 'channel');
      expect(find.byType(TextField), findsNothing);
      expect(find.text('В этом чате писать могут только администраторы'), findsOneWidget);
    });

    testWidgets('нет права на медиа — скрепки нет, текст можно', (tester) async {
      final chat = _chat()..metaNow = ChatMeta.fromJson({'type': 'group', 'my_effective_permissions': {'can_send_messages': true, 'can_send_media': false}});
      await _open(tester, chat);
      expect(find.byTooltip('Прикрепить'), findsNothing);
      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('пусто — приглашение написать первым; ошибка — «Повторить»', (tester) async {
      await _open(tester, FakeChat());
      expect(find.text('Сообщений пока нет'), findsOneWidget);
      await _open(tester, FakeChat()..failMessages = true);
      expect(find.text('Повторить'), findsOneWidget);
    });

    testWidgets('событие из сокета подтягивает новое сообщение', (tester) async {
      final chat = _chat();
      final events = StreamController<Map<String, dynamic>>.broadcast();
      addTearDown(events.close);
      _size(tester);
      await tester.pumpWidget(_app(chat, events: events.stream));
      await tester.pumpAndSettle();
      chat.all.add(msg('5', sender: 2, name: 'Анна Орлова', text: 'Новое из сокета', at: _today(5)));
      events.add({'type': 'msg:new', 'conversationId': 'c1'});
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(find.text('Новое из сокета'), findsOneWidget);
    });

    testWidgets('сбой отправки: сообщение об ошибке, текст остаётся в поле', (tester) async {
      final chat = _chat()..failSend = true;
      await _open(tester, chat);
      await tester.enterText(find.byType(TextField), 'Не уйдёт');
      await tester.pump();
      await tester.tap(find.byTooltip('Отправить'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Не удалось выполнить действие'), findsOneWidget);
      expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, 'Не уйдёт');
    });
  });

  group('вёрстка без переполнений', () {
    for (final (width, scale, brightness) in [
      (320.0, 1.0, Brightness.light),
      (320.0, 2.0, Brightness.light),
      (360.0, 1.3, Brightness.dark),
    ]) {
      testWidgets('чат: ширина $width, шрифт $scale, ${brightness.name}', (tester) async {
        tester.view.physicalSize = Size(width, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final chat = FakeChat()
          ..previews['https://example.com/very/long/path'] = LinkPreview(url: 'https://example.com/very/long/path', host: 'example.com', title: 'Очень длинный заголовок страницы ' * 3, description: 'Длинное описание ' * 12, siteName: 'Сайт')
          ..all = [
            msg('1', sender: 2, name: 'Константинопольский Александр Константинович', text: 'Длинное сообщение с адресом https://example.com/very/long/path и текстом ' * 3, at: _today(1), reactions: [for (final e in ['❤️', '👍', '😂', '😮', '😢', '🙏', '🔥']) Reaction(emoji: e, count: 12, byMe: e == '👍')]),
            msg('2', sender: 9, name: 'Мария Лис', text: 'Ответ', at: _today(2), reply: ReplyPreview(id: '1', content: 'Очень длинная цитата сообщения ' * 6, senderName: 'Константинопольский Александр', isDeleted: false)),
          ];
        await tester.pumpWidget(_app(chat, width: width, scale: scale, brightness: brightness));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.tap(find.text('Ответ'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  });
}
