import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/bible/bible_page.dart';
import 'package:molitva/features/bible/bible_reader_page.dart';
import 'package:molitva/features/bible/bible_store.dart';
import 'package:molitva/features/bible/models/bible_models.dart';
import 'package:molitva/features/bible/widgets/bible_palette.dart';
import 'package:molitva/features/bible/widgets/book_picker.dart';
import 'package:molitva/features/bible/widgets/chapter_view.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fakes.dart';

Future<void> _size(WidgetTester tester, {double width = 360}) async {
  tester.view.physicalSize = Size(width, 740);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Widget _app(Widget child) => MaterialApp(
      theme: churchTheme(brightness: Brightness.light),
      home: MediaQuery(
        data: MediaQueryData(size: const Size(360, 740), textScaler: TextScaler.noScaling),
        child: child,
      ),
    );

const _longVerse = 'Сверхдлинноеслововбезпробеловдлявыявленияпереполненияэкранаприбольшомшрифте и обычный хвост стиха.';

ChapterText get _chapter => ChapterText(
      translation: 'synodal',
      bookSlug: 'john',
      chapter: 3,
      verses: [for (var i = 1; i <= 20; i++) Verse(i, i == 5 ? _longVerse : 'Ибо так возлюбил Бог мир, что отдал Сына Своего Единородного №$i')],
    );

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  for (final width in [320.0, 360.0]) {
    for (final scale in [1.0, 2.0]) {
      for (final lines in [false, true]) {
        testWidgets('глава: ширина ${width.round()}, шрифт ${(scale * 100).round()}%, ${lines ? 'по строкам' : 'сплошным текстом'}', (tester) async {
          await _size(tester, width: width);
          final taps = <int>[];
          await tester.pumpWidget(MaterialApp(
            theme: churchTheme(brightness: Brightness.light),
            home: MediaQuery(
              data: MediaQueryData(size: Size(width, 740), textScaler: TextScaler.linear(scale)),
              child: Scaffold(
                body: ChapterView(
                  text: _chapter,
                  bookName: 'От Иоанна',
                  palette: biblePaletteFor(BibleTheme.light, Brightness.light),
                  settings: BibleSettings(fontSize: 30, verseLines: lines),
                  selected: const {2},
                  highlighted: const {3},
                  notes: [
                    BibleNote(
                      id: 1,
                      translation: 'synodal',
                      bookSlug: 'john',
                      bookName: 'От Иоанна',
                      shortName: 'Ин',
                      chapter: 3,
                      verseStart: 1,
                      verseEnd: 1,
                      body: _longVerse,
                      updatedAt: null,
                    ),
                  ],
                  onVerseTap: taps.add,
                  onNoteTap: (_) {},
                  focusVerse: 12,
                ),
              ),
            ),
          ));
          await tester.pump();
          await tester.pump();
          expect(tester.takeException(), isNull);
          expect(find.text('Глава 3'), findsOneWidget);
        });
      }
    }
  }

  testWidgets('главная: ссылка открывает читалку на нужной главе, поиск без совпадений предлагает сброс', (tester) async {
    await _size(tester);
    final source = FakeBibleSource();
    await tester.pumpWidget(_app(BiblePage(source: source)));
    await tester.pumpAndSettle();
    expect(find.text('Начните с Евангелия от Иоанна'), findsOneWidget);
    expect(find.text('НОВЫЙ ЗАВЕТ'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'Ин 3:16');
    await tester.pumpAndSettle();
    expect(find.text('Открыть Ин 3:16'), findsOneWidget);
    await tester.tap(find.text('Открыть Ин 3:16'));
    await tester.pumpAndSettle();
    expect(find.text('От Иоанна 3'), findsWidgets);
    expect(find.text('Глава 3'), findsOneWidget);
    expect(source.chapterCalls, greaterThan(0));
  });

  testWidgets('главная: неверная глава подсказывает, сколько глав в книге', (tester) async {
    await _size(tester);
    await tester.pumpWidget(_app(BiblePage(source: FakeBibleSource())));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Лев 99');
    await tester.pumpAndSettle();
    expect(find.text('Левит: 27 глав'), findsOneWidget);
    expect(find.text('Выбрать главу'), findsOneWidget);
  });

  testWidgets('главная: поиск по словам без интернета объясняет причину и предлагает повторить', (tester) async {
    await _size(tester);
    await tester.pumpWidget(_app(BiblePage(source: FakeBibleSource(online: false))));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'любовь');
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(find.text('Поиск по тексту недоступен'), findsOneWidget);
    expect(find.text('Повторить'), findsOneWidget);
  });

  testWidgets('читалка: без сети показывает ошибку, после возвращения сети «Повторить» открывает главу', (tester) async {
    await _size(tester);
    final source = FakeBibleSource(online: false);
    final books = await source.books('synodal');
    await tester.pumpWidget(_app(BibleReaderPage(
      source: source,
      books: books,
      translations: await source.translations(),
      translation: 'synodal',
      bookSlug: 'john',
      chapter: 3,
    )));
    await tester.pumpAndSettle();
    expect(find.textContaining('Не удалось открыть'), findsOneWidget);

    source.online = true;
    await tester.tap(find.text('Повторить'));
    await tester.pumpAndSettle();
    expect(find.text('Глава 3'), findsOneWidget);
    expect(find.textContaining('Стих 1 главы 3'), findsWidgets);
  });

  testWidgets('читалка: нажатие на стих выделяет его и показывает действия, «закрыть» снимает', (tester) async {
    await _size(tester);
    final source = FakeBibleSource();
    final books = await source.books('synodal');
    await tester.pumpWidget(_app(BibleReaderPage(
      source: source,
      books: books,
      translations: await source.translations(),
      translation: 'synodal',
      bookSlug: 'john',
      chapter: 3,
    )));
    await tester.pumpAndSettle();
    expect(find.text('Глава 3 из 21'), findsOneWidget);

    // Все стихи — один абзац; нажимаем в его начало, это первый стих.
    await tester.tapAt(tester.getTopLeft(find.textContaining('Стих 1 главы 3', findRichText: true)) + const Offset(30, 8));
    await tester.pumpAndSettle();
    expect(find.text('Стихи: 1'), findsOneWidget);
    expect(find.byTooltip('Заметка'), findsOneWidget);

    await tester.tap(find.byTooltip('Снять выделение'));
    await tester.pumpAndSettle();
    expect(find.text('Стихи: 1'), findsNothing);
  });

  for (final scale in [1.0, 2.0]) {
    testWidgets('выбор книги и главы: плитки не переполняются (шрифт ${(scale * 100).round()}%)', (tester) async {
      await _size(tester, width: 320);
      final books = await FakeBibleSource().books('synodal');
      final colors = PickerColors.fromReader(biblePaletteFor(BibleTheme.light, Brightness.light));
      await tester.pumpWidget(MaterialApp(
        theme: churchTheme(brightness: Brightness.light),
        home: MediaQuery(
          data: MediaQueryData(size: const Size(320, 740), textScaler: TextScaler.linear(scale)),
          child: Scaffold(
            body: SingleChildScrollView(
              child: Column(children: [
                BookGrid(books: books, colors: colors, onPick: (_) {}),
                ChapterGrid(book: books.firstWhere((b) => b.slug == 'psalms'), colors: colors, onPick: (_) {}, currentChapter: 119),
              ]),
            ),
          ),
        ),
      ));
      await tester.pump();
      expect(tester.takeException(), isNull);
    });
  }
}
