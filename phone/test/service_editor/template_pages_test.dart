import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/service/data/plan_repository.dart';
import 'package:molitva/features/service/editor/logic/editor_logic.dart';
import 'package:molitva/features/service/editor/templates_page.dart';
import 'package:molitva/features/service/models/plan_models.dart';
import 'package:molitva/features/service/service_page.dart';
import 'package:provider/provider.dart';

import 'fake_editor.dart';

SessionController _session({String role = 'admin', String ministryRole = ''}) {
  final s = SessionController();
  s.user = AppUser(id: 1, name: 'Мария Лис', firstName: 'Мария', lastName: 'Лис', role: role, roles: [role], registrationStatus: 'active', ministryRole: ministryRole);
  return s;
}

Widget _app(Widget home, {SessionController? session, double width = 360, double scale = 1}) => ChangeNotifierProvider.value(
      value: session ?? _session(),
      child: MaterialApp(
        theme: churchTheme(brightness: Brightness.light),
        home: MediaQuery(data: MediaQueryData(size: Size(width, 780), textScaler: TextScaler.linear(scale)), child: home),
      ),
    );

void _size(WidgetTester tester, [double w = 360]) {
  tester.view.physicalSize = Size(w, 780);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

class _Plans implements PlanSource {
  @override
  Future<Loaded<List<PlanSummary>>> plans(DateTime from, DateTime to) async => const Loaded([]);

  @override
  Future<Loaded<PlanView>> view(PlanSummary plan) => throw UnimplementedError();
}

void main() {
  setUpAll(() => initializeDateFormatting('ru'));

  group('список шаблонов', () {
    testWidgets('показывает все шаблоны, выключенные — с пометкой; повтор и время в подписи', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(TemplatesPage(source: FakeEditor(plan()))));
      await tester.pumpAndSettle();
      expect(find.text('Воскресное служение'), findsOneWidget);
      expect(find.text('Молодёжная встреча'), findsOneWidget);
      expect(find.text('Выключен'), findsOneWidget);
      expect(find.textContaining('Каждую неделю: воскресенье · начало 10:00'), findsOneWidget);
      expect(find.textContaining('пятница'), findsOneWidget);
    });

    testWidgets('нажатие открывает редактор с данными шаблона', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(TemplatesPage(source: FakeEditor(plan()))));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('template-row-1')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('tpl-save')), findsOneWidget);
      expect(find.text('Сохранить шаблон'), findsOneWidget);
      expect(find.byKey(const ValueKey('tpl-active')), findsOneWidget);
    });

    testWidgets('пустой список — подсказка про «+»', (tester) async {
      _size(tester);
      final f = FakeEditor(plan())..templateStore.clear();
      await tester.pumpWidget(_app(TemplatesPage(source: f)));
      await tester.pumpAndSettle();
      expect(find.text('Шаблонов пока нет'), findsOneWidget);
      expect(find.byTooltip('Новый шаблон'), findsOneWidget);
    });
  });

  group('редактор шаблона', () {
    Future<FakeEditor> open(WidgetTester tester, {int? id, double width = 360, double scale = 1}) async {
      _size(tester, width);
      final f = FakeEditor(plan());
      await tester.pumpWidget(_app(TemplateEditorPage(templateId: id, source: f), width: width, scale: scale));
      await tester.pumpAndSettle();
      return f;
    }

    for (final (w, s) in [(320.0, 1.0), (320.0, 2.0), (390.0, 1.3)]) {
      testWidgets('без переполнений: ширина $w, шрифт $s', (tester) async {
        await open(tester, id: 1, width: w, scale: s);
        expect(tester.takeException(), isNull);
        await tester.drag(find.byType(CustomScrollView), const Offset(0, -300));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('новый шаблон: заготовка, сохранение создаёт его', (tester) async {
      final f = await open(tester);
      expect(find.text('Новый шаблон'), findsWidgets);
      await tester.enterText(find.byKey(const ValueKey('tpl-name')), 'Вечернее служение');
      await tester.tap(find.byKey(const ValueKey('tpl-save')));
      await tester.pumpAndSettle();
      expect(f.log, contains('createTemplate'));
      expect(f.templateWrites.single['name'], 'Вечернее служение');
      expect(f.templateWrites.single['recurrence_rule'], {'frequency': 'weekly', 'byWeekday': 0});
    });

    testWidgets('пустое название: ошибка на экране, запроса нет', (tester) async {
      final f = await open(tester);
      await tester.enterText(find.byKey(const ValueKey('tpl-name')), '   ');
      await tester.tap(find.byKey(const ValueKey('tpl-save')));
      await tester.pumpAndSettle();
      expect(find.text('Укажите название шаблона'), findsWidgets);
      expect(f.log.where((l) => l.contains('Template')), isEmpty);
    });

    testWidgets('повтор: выбор дня недели', (tester) async {
      final f = await open(tester, id: 1);
      await tester.tap(find.byKey(const ValueKey('tpl-rule')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('rule-3')));
      await tester.pumpAndSettle();
      expect(find.textContaining('среда'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('tpl-save')));
      await tester.pumpAndSettle();
      expect(f.templateWrites.single['recurrence_rule'], {'frequency': 'weekly', 'byWeekday': 3});
    });

    testWidgets('блок: правка названия и ответственного по умолчанию, без «скрыть в публикации»', (tester) async {
      final f = await open(tester, id: 1);
      await tester.ensureVisible(find.text('Молитва'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Молитва'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('block-hidden')), findsNothing);
      expect(find.text('Ответственный по умолчанию'), findsOneWidget);
      await tester.enterText(find.byKey(const ValueKey('block-title')), 'Начальная молитва');
      await tester.ensureVisible(find.byKey(const ValueKey('block-save')));
      await tester.tap(find.byKey(const ValueKey('block-save')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('tpl-save')));
      await tester.pumpAndSettle();
      expect(f.templateWrites.single['blocks'][0]['title'], 'Начальная молитва');
    });

    testWidgets('песня в шаблоне: ответственный вручную, не автоматически', (tester) async {
      await open(tester, id: 1);
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -400));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Песня').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Песня').first);
      await tester.pumpAndSettle();
      expect(find.text('Назначается автоматически из настроек программы'), findsNothing);
      expect(find.text('Лена Музыка'), findsWidgets);
    });

    testWidgets('добавить блок и разделитель; удалить с «Отменить»', (tester) async {
      await open(tester, id: 1);
      await tester.tap(find.byKey(const ValueKey('tpl-add-separator')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const ValueKey('block-save')));
      await tester.tap(find.byKey(const ValueKey('block-save')));
      await tester.pumpAndSettle();
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -500));
      await tester.pumpAndSettle();
      expect(find.text('НОВЫЙ РАЗДЕЛ'), findsOneWidget);
      await tester.tap(find.byTooltip('Меню блока').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Удалить'));
      await tester.pumpAndSettle();
      expect(find.text('НОВЫЙ РАЗДЕЛ'), findsNothing);
      expect(find.text('Раздел удалён'), findsOneWidget);
      await tester.tap(find.text('Отменить'));
      await tester.pumpAndSettle();
      expect(find.text('НОВЫЙ РАЗДЕЛ'), findsOneWidget);
    });

    testWidgets('подтянуть из другого шаблона: подставляет название-копию и блоки', (tester) async {
      await open(tester);
      await tester.tap(find.byTooltip('Действия с шаблоном'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Подтянуть из другого шаблона'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('import-1')));
      await tester.pumpAndSettle();
      expect(find.text('Воскресное служение (копия)'), findsWidgets);
      expect(find.text('Молитва'), findsOneWidget);
      expect(find.textContaining('не забудьте сохранить'), findsOneWidget);
    });

    testWidgets('выход с несохранёнными изменениями просит подтверждение', (tester) async {
      final f = await open(tester, id: 1);
      await tester.enterText(find.byKey(const ValueKey('tpl-name')), 'Другое имя');
      await tester.pump();
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Выйти без сохранения?'), findsOneWidget);
      await tester.tap(find.text('Отмена'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('tpl-save')), findsOneWidget);
      expect(f.log.where((l) => l.contains('Template')), isEmpty);
    });

    testWidgets('удаление шаблона: подтверждение и запрос', (tester) async {
      final f = await open(tester, id: 2);
      await tester.tap(find.byTooltip('Действия с шаблоном'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Удалить шаблон'));
      await tester.pumpAndSettle();
      expect(find.text('Удалить шаблон?'), findsOneWidget);
      await tester.tap(find.text('Удалить'));
      await tester.pumpAndSettle();
      expect(f.log, contains('deleteTemplate 2'));
    });
  });

  group('вход в шаблоны из «Служения»', () {
    testWidgets('админ и ведущий видят кнопку «Шаблоны», участник — нет', (tester) async {
      _size(tester);
      for (final (session, expected) in [(_session(), true), (_session(role: 'member', ministryRole: 'Ведущий'), true), (_session(role: 'member'), false)]) {
        await tester.pumpWidget(_app(ServicePage(key: UniqueKey(), source: _Plans(), editorSource: FakeEditor(plan())), session: session));
        await tester.pumpAndSettle();
        expect(find.byTooltip('Шаблоны'), expected ? findsOneWidget : findsNothing);
      }
    });

    test('создание шаблона доступно только админу (из программы)', () {
      expect(canSaveAsTemplate(_session().user), isTrue);
      expect(canSaveAsTemplate(_session(role: 'minister').user), isFalse);
    });
  });
}
