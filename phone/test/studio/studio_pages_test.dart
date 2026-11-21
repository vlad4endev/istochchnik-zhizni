import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/songbook/models/song.dart';
import 'package:molitva/features/studio/models/studio_models.dart';
import 'package:molitva/features/studio/setlist_page.dart';
import 'package:molitva/features/studio/setlist_player_page.dart';
import 'package:molitva/features/studio/studio_page.dart';
import 'package:molitva/features/studio/widgets/musician_notes_card.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'studio_test.dart' show FakeStudio;

SessionController _session() {
  final s = SessionController();
  s.user = AppUser(id: 1, name: 'И', firstName: 'И', lastName: 'П', role: 'musician', roles: const ['musician'], registrationStatus: 'active');
  return s;
}

Widget _app(Widget page, {double scale = 1, double width = 360}) => ChangeNotifierProvider.value(
      value: _session(),
      child: MaterialApp(
        theme: churchTheme(brightness: Brightness.light),
        home: MediaQuery(data: MediaQueryData(size: Size(width, 740), textScaler: TextScaler.linear(scale)), child: page),
      ),
    );

void _size(WidgetTester tester, {double width = 360}) {
  tester.view.physicalSize = Size(width, 740);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

DateTime _in(int days) {
  final n = DateTime.now().add(Duration(days: days));
  return DateTime(n.year, n.month, n.day);
}

SetlistItem _song(int id, String title, {String content = '[G]Строка один\n[D]Строка два', MusicianNotes notes = const MusicianNotes()}) =>
    SetlistItem(id: id, position: id, songId: id, title: title, content: content, key: 'G', notes: notes);

FakeStudio _studio({int owner = 1, List<SetlistItem>? items}) => FakeStudio()
  ..lists = [
    Setlist(id: 1, ownerId: owner, title: 'Воскресное служение', date: _in(2), isPublic: true, shareToken: 'TOKEN'),
    Setlist(id: 2, ownerId: 5, title: 'Из программы', date: _in(5), fromServicePlan: true),
    Setlist(id: 3, ownerId: 1, title: 'Идеи'),
    Setlist(id: 4, ownerId: 1, title: 'Давнее', date: _in(-10)),
  ]
  ..detail = SetlistDetail(
    setlist: Setlist(id: 1, ownerId: owner, title: 'Воскресное служение', date: _in(2), isPublic: true, shareToken: 'TOKEN'),
    items: items ?? [_song(1, 'Велик Бог'), _song(2, 'Господь — Пастырь мой')],
  );

void main() {
  setUpAll(() => initializeDateFormatting('ru'));
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('список сетлистов', () {
    testWidgets('секции, метки «из программы» и «по ссылке»', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(StudioPage(source: _studio(), userId: 1)));
      await tester.pumpAndSettle();
      expect(find.text('БЛИЖАЙШИЕ'), findsOneWidget);
      expect(find.text('БЕЗ ДАТЫ'), findsOneWidget);
      expect(find.text('ПРОШЕДШИЕ'), findsOneWidget);
      expect(find.text('Из программы служения'), findsOneWidget);
      expect(find.text('Доступ по ссылке'), findsOneWidget);
    });

    testWidgets('создание: название обязательно, после создания открывается сетлист', (tester) async {
      _size(tester);
      final s = _studio();
      await tester.pumpWidget(_app(StudioPage(source: s, userId: 1)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Новый сетлист'));
      await tester.pumpAndSettle();
      expect(tester.widget<TextButton>(find.widgetWithText(TextButton, 'Создать')).onPressed, isNull, reason: 'без названия создать нельзя');
      await tester.enterText(find.byType(TextField), 'Рождество');
      await tester.pump();
      await tester.tap(find.widgetWithText(TextButton, 'Создать'));
      await tester.pumpAndSettle();
      expect(s.calls, contains('create:Рождество'));
      expect(find.text('Играть сетлист'), findsOneWidget, reason: 'открылась страница нового сетлиста');
    });

    testWidgets('без сети: список из копии, создание выключено', (tester) async {
      _size(tester);
      final s = _studio()..stale = DateTime.now().subtract(const Duration(hours: 3));
      await tester.pumpWidget(_app(StudioPage(source: s, userId: 1)));
      await tester.pumpAndSettle();
      expect(find.textContaining('Нет связи'), findsOneWidget);
      expect(tester.widget<InkWell>(find.ancestor(of: find.text('Новый сетлист'), matching: find.byType(InkWell)).first).onTap, isNull);
    });

    testWidgets('ошибка загрузки — «Повторить»', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(StudioPage(source: _studio()..fail = true, userId: 1)));
      await tester.pumpAndSettle();
      expect(find.text('Повторить'), findsOneWidget);
    });

    testWidgets('«Мои песни»: пустое состояние объясняет, где создать версию', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(StudioPage(source: _studio(), userId: 1)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Мои песни'));
      await tester.pumpAndSettle();
      expect(find.text('Своих версий пока нет'), findsOneWidget);
    });
  });

  group('страница сетлиста', () {
    Widget page(FakeStudio s, {int owner = 1}) => _app(SetlistPage(
          setlist: s.lists.first,
          source: s,
          userId: 1,
          origin: 'https://church.example',
          loadSongs: () async => const <Song>[Song(id: 9, title: 'Новая песня', key: 'A')],
        ));

    testWidgets('свой сетлист: можно играть, добавлять, убирать и менять порядок', (tester) async {
      _size(tester);
      await tester.pumpWidget(page(_studio()));
      await tester.pumpAndSettle();
      expect(find.text('Играть сетлист'), findsOneWidget);
      expect(find.text('Добавить песню'), findsOneWidget);
      expect(find.byTooltip('Убрать «Велик Бог» из сетлиста'), findsOneWidget);
      expect(find.byType(ReorderableDragStartListener), findsNWidgets(2), reason: 'у каждой песни есть ручка перетаскивания');
    });

    testWidgets('чужой сетлист из программы: смотреть и играть, без правки', (tester) async {
      _size(tester);
      final s = _studio(owner: 5);
      await tester.pumpWidget(page(s, owner: 5));
      await tester.pumpAndSettle();
      expect(find.text('Играть сетлист'), findsOneWidget);
      expect(find.text('Добавить песню'), findsNothing);
      expect(find.byTooltip('Убрать «Велик Бог» из сетлиста'), findsNothing);
      expect(find.byTooltip('Ещё'), findsNothing);
    });

    testWidgets('убрать песню просит подтверждения и отправляет запрос', (tester) async {
      _size(tester);
      final s = _studio();
      await tester.pumpWidget(page(s));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Убрать «Велик Бог» из сетлиста'));
      await tester.pumpAndSettle();
      expect(find.text('Убрать песню из сетлиста?'), findsOneWidget);
      await tester.tap(find.text('Убрать'));
      await tester.pumpAndSettle();
      expect(s.calls, ['remove:1']);
      expect(find.text('Велик Бог'), findsNothing);
    });

    testWidgets('добавление: песня уходит на сервер, лист остаётся открытым', (tester) async {
      _size(tester);
      final s = _studio();
      await tester.pumpWidget(page(s));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Добавить песню'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Новая песня'));
      await tester.pumpAndSettle();
      expect(s.calls, ['add:9:']);
      expect(find.text('Готово'), findsOneWidget, reason: 'лист не закрылся: можно добавить ещё');
    });

    testWidgets('ссылка для команды: переключатель и копирование', (tester) async {
      _size(tester);
      final s = _studio();
      await tester.pumpWidget(page(s));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Ссылка для команды'));
      await tester.pumpAndSettle();
      expect(find.text('Скопировать ссылку'), findsOneWidget);
      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();
      expect(s.calls.last, startsWith('patch:1'));
      expect(find.text('Скопировать ссылку'), findsNothing, reason: 'доступ выключили — ссылки нет');
    });

    testWidgets('сетлист без песен: пустое состояние и неактивная кнопка «Играть»', (tester) async {
      _size(tester);
      await tester.pumpWidget(page(_studio(items: const [])));
      await tester.pumpAndSettle();
      expect(find.text('В сетлисте нет песен'), findsOneWidget);
    });
  });

  group('режим выступления', () {
    testWidgets('листание кнопками, «Дальше» и заметки музыканта', (tester) async {
      _size(tester);
      final items = [
        _song(1, 'Первая', notes: const MusicianNotes(lines: {1: 'Тише'})),
        _song(2, 'Вторая'),
        _song(3, 'Третья'),
      ];
      await tester.pumpWidget(_app(SetlistPlayerPage(items: items)));
      await tester.pumpAndSettle();
      expect(find.text('Песня 1 из 3'), findsOneWidget);
      expect(find.text('Дальше: Вторая'), findsOneWidget);
      expect(find.text('ЗАМЕТКИ МУЗЫКАНТА'), findsOneWidget);

      await tester.tap(find.byTooltip('Следующая песня'));
      await tester.pumpAndSettle();
      expect(find.text('Песня 2 из 3'), findsOneWidget);
      expect(find.text('ЗАМЕТКИ МУЗЫКАНТА'), findsNothing);

      await tester.tap(find.byTooltip('Следующая песня'));
      await tester.pumpAndSettle();
      expect(find.text('Последняя в сетлисте'), findsOneWidget);
      expect(tester.widget<Opacity>(find.descendant(of: find.byTooltip('Следующая песня'), matching: find.byType(Opacity)).first).opacity, lessThan(1));

      await tester.tap(find.byTooltip('Предыдущая песня'));
      await tester.pumpAndSettle();
      expect(find.text('Песня 2 из 3'), findsOneWidget);
    });

    testWidgets('старт с выбранной песни и свайп', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(SetlistPlayerPage(items: [_song(1, 'Первая'), _song(2, 'Вторая'), _song(3, 'Третья')], start: 1)));
      await tester.pumpAndSettle();
      expect(find.text('Песня 2 из 3'), findsOneWidget);
      await tester.fling(find.byType(PageView), const Offset(-400, 0), 1500);
      await tester.pumpAndSettle();
      expect(find.text('Песня 3 из 3'), findsOneWidget);
    });

    testWidgets('песня без текста не ломает режим выступления', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(SetlistPlayerPage(items: [_song(1, 'Пустая', content: ''), _song(2, 'Вторая')])));
      await tester.pumpAndSettle();
      expect(find.text('Текст песни ещё не добавлен'), findsOneWidget);
    });
  });

  group('заметки музыканта', () {
    test('строки и участки собираются по порядку с цитатой без аккордов', () {
      const content = '[G]Первая строка\n[D]Вторая строка\n[Em]Третья строка';
      final rows = notesRows(content, const MusicianNotes(lines: {2: 'Громче'}, blocks: [(from: 0, to: 1, text: 'Тише')]));
      expect(rows.map((r) => r.where), ['Строки 1–2', 'Строка 3']);
      expect(rows.first.quote, 'Первая строка');
      expect(rows.last.text, 'Громче');
    });

    test('номер строки за пределами текста не ломает показ', () {
      final rows = notesRows('[G]Одна', const MusicianNotes(lines: {40: 'Где-то далеко'}));
      expect(rows.single.quote, '');
      expect(rows.single.where, 'Строка 41');
    });

    test('цитата обрезается', () {
      expect(lyricExcerpt('[G]${'очень длинная строка ' * 10}', max: 20), endsWith('…'));
      expect(lyricExcerpt('{sec:Куплет}[G]Слова'), 'Слова');
    });
  });

  for (final scale in [1.0, 2.0]) {
    testWidgets('вёрстка без переполнений: ширина 320, шрифт ${(scale * 100).round()}%', (tester) async {
      _size(tester, width: 320);
      final s = _studio(items: [_song(1, 'Очень длинное название песни для проверки переноса строк в сетлисте'), _song(2, 'Вторая')]);
      await tester.pumpWidget(_app(StudioPage(source: s, userId: 1), scale: scale, width: 320));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Воскресное служение').first);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }
}
