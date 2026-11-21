import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/service/data/plan_repository.dart';
import 'package:molitva/features/service/editor/models/editor_models.dart';
import 'package:molitva/features/service/editor/plan_editor_page.dart';
import 'package:molitva/features/service/editor/widgets/new_plan_sheet.dart';
import 'package:molitva/features/service/models/plan_models.dart';
import 'package:molitva/features/service/service_page.dart';
import 'package:provider/provider.dart';

import 'fake_editor.dart';

SessionController _session({String role = 'admin'}) {
  final s = SessionController();
  s.user = AppUser(id: 1, name: 'Мария Лис', firstName: 'Мария', lastName: 'Лис', role: role, roles: [role], registrationStatus: 'active');
  return s;
}

Widget _app(Widget home, {SessionController? session, double width = 360, double scale = 1}) => ChangeNotifierProvider.value(
      value: session ?? _session(),
      child: MaterialApp(
        theme: churchTheme(brightness: Brightness.light),
        home: MediaQuery(data: MediaQueryData(size: Size(width, 760), textScaler: TextScaler.linear(scale)), child: home),
      ),
    );

void _size(WidgetTester tester, [double w = 360, double h = 760]) {
  tester.view.physicalSize = Size(w, h);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Future<FakeEditor> _open(WidgetTester tester, {SessionController? session, double width = 360, double scale = 1, FakeEditor? fake}) async {
  _size(tester, width);
  final f = fake ?? FakeEditor(plan(preacher: 11, music: 12));
  await tester.pumpWidget(_app(PlanEditorPage(planId: 7, source: f), session: session, width: width, scale: scale));
  await tester.pumpAndSettle();
  return f;
}

class _Plans implements PlanSource {
  @override
  Future<Loaded<List<PlanSummary>>> plans(DateTime from, DateTime to) async => Loaded([
        PlanSummary(id: 7, date: DateTime.now().add(const Duration(days: 3)), startTime: '10:00', published: true, blocksCount: 3, templateName: 'Воскресное служение'),
      ]);

  @override
  Future<Loaded<PlanView>> view(PlanSummary plan) => throw UnimplementedError();
}

void main() {
  setUpAll(() => initializeDateFormatting('ru'));

  group('редактор программы', () {
    testWidgets('шапка, настройки и блоки с временем начала', (tester) async {
      await _open(tester);
      expect(find.text('Воскресенье, 22 ноября'), findsOneWidget);
      expect(find.text('Черновик'), findsOneWidget);
      expect(find.byKey(const ValueKey('settings-toggle')), findsOneWidget);
      expect(find.byKey(const ValueKey('set-leader')), findsNothing, reason: 'настройки свёрнуты');
      await tester.tap(find.byKey(const ValueKey('settings-toggle')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('set-date')), findsOneWidget);
      expect(find.byKey(const ValueKey('set-leader')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('settings-toggle')));
      await tester.pumpAndSettle();
      expect(find.text('Пётр Сидоров - Вера'), findsOneWidget);
      expect(find.text('10:00'), findsWidgets);
      expect(find.text('10:05'), findsOneWidget);
      expect(find.text('10:15'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    for (final (w, s) in [(320.0, 1.0), (320.0, 2.0), (390.0, 1.3)]) {
      testWidgets('без переполнений: ширина $w, шрифт $s', (tester) async {
        await _open(tester, width: w, scale: s);
        expect(tester.takeException(), isNull);
        await tester.drag(find.byType(CustomScrollView), const Offset(0, -400));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('участник без прав: настроек плана нет, в меню нет удаления', (tester) async {
      await _open(tester, session: _session(role: 'member'));
      expect(find.byKey(const ValueKey('settings-toggle')), findsNothing);
      await tester.tap(find.byTooltip('Действия с программой'));
      await tester.pumpAndSettle();
      expect(find.text('Удалить программу'), findsNothing);
      expect(find.text('Скопировать ссылку'), findsOneWidget);
    });

    testWidgets('правка блока: «Готово» → автосохранение только этого блока', (tester) async {
      final f = await _open(tester);
      await tester.tap(find.text('Молитва'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('block-title')), 'Общая молитва');
      await tester.enterText(find.byKey(const ValueKey('block-minutes')), '12');
      await tester.ensureVisible(find.byKey(const ValueKey('block-save')));
      await tester.tap(find.byKey(const ValueKey('block-save')));
      await tester.pumpAndSettle(const Duration(seconds: 2));
      expect(f.patched[1]!['title'], 'Общая молитва');
      expect(f.patched[1]!['duration_minutes'], 12);
      expect(f.log.where((l) => l.startsWith('patchBlock')).toList(), ['patchBlock 1']);
      expect(find.text('Сохранено'), findsOneWidget);
      expect(find.text('Общая молитва'), findsOneWidget);
      expect(find.text('10:12'), findsOneWidget, reason: 'время следующего блока пересчитано');
    });

    testWidgets('у песни и проповеди ответственный назначается автоматически', (tester) async {
      await _open(tester);
      await tester.tap(find.text('Пётр Сидоров - Вера'));
      await tester.pumpAndSettle();
      expect(find.text('Назначается автоматически из настроек программы'), findsOneWidget);
      expect(find.byKey(const ValueKey('block-topic')), findsOneWidget);
      expect(find.byKey(const ValueKey('block-scripture')), findsOneWidget);
    });

    testWidgets('песня: выбор из каталога подставляет название с тональностью', (tester) async {
      final f = await _open(tester);
      await tester.tap(find.text('Песня').first);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const ValueKey('block-song')));
      await tester.tap(find.byKey(const ValueKey('block-song')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('song-5')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const ValueKey('block-save')));
      await tester.tap(find.byKey(const ValueKey('block-save')));
      await tester.pumpAndSettle(const Duration(seconds: 2));
      expect(f.patched[2]!['song_id'], 5);
      expect(f.patched[2]!['title'], 'Великий Бог [G]');
    });

    testWidgets('добавить блок: создаётся и сразу открывается на правку', (tester) async {
      final f = await _open(tester);
      await tester.tap(find.byKey(const ValueKey('add-block')));
      await tester.pumpAndSettle();
      expect(f.log, contains('createBlock Новый блок'));
      expect(find.byKey(const ValueKey('block-title')), findsOneWidget);
    });

    testWidgets('разделитель: правка текста', (tester) async {
      final f = await _open(tester);
      await tester.tap(find.byKey(const ValueKey('add-separator')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('block-title')), 'Прославление');
      await tester.ensureVisible(find.byKey(const ValueKey('block-save')));
      await tester.tap(find.byKey(const ValueKey('block-save')));
      await tester.pumpAndSettle(const Duration(seconds: 2));
      expect(find.text('ПРОСЛАВЛЕНИЕ'), findsOneWidget);
      expect(f.patched[100]!['content_json']['separator_text'], 'Прославление');
    });

    testWidgets('удаление блока и «Отменить»', (tester) async {
      final f = await _open(tester);
      await tester.tap(find.byTooltip('Меню блока').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Удалить'));
      await tester.pumpAndSettle();
      expect(f.log, contains('deleteBlock 1'));
      expect(find.text('Блок «Молитва» удалён'), findsOneWidget);
      await tester.tap(find.text('Отменить'));
      await tester.pumpAndSettle();
      expect(f.log.where((l) => l.startsWith('createBlock')).length, 1);
    });

    testWidgets('скрыть из публикации: блок помечается и сохраняется', (tester) async {
      final f = await _open(tester);
      await tester.tap(find.byTooltip('Меню блока').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Скрыть из публикации'));
      await tester.pumpAndSettle(const Duration(seconds: 2));
      expect(find.text('Скрыт в публикации'), findsOneWidget);
      expect(f.patched[1]!['content_json']['hide_in_public'], true);
    });

    testWidgets('ведущий: выбор из списка и снятие, план сохраняется', (tester) async {
      final f = await _open(tester);
      await tester.tap(find.byKey(const ValueKey('settings-toggle')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('set-leader')));
      await tester.pumpAndSettle();
      expect(find.text('Анна Орлова'), findsOneWidget);
      await tester.tap(find.text('Анна Орлова'));
      await tester.pumpAndSettle(const Duration(seconds: 2));
      expect(f.planPatches.last['leader_member_id'], 10);
      expect(find.text('Анна Орлова'), findsOneWidget);
    });

    testWidgets('публикация: статус меняется, сообщение пользователю', (tester) async {
      final f = await _open(tester);
      await tester.tap(find.byKey(const ValueKey('publish')));
      await tester.pumpAndSettle();
      expect(f.planPatches.last['status'], 'published');
      expect(find.text('Опубликована'), findsOneWidget);
      expect(find.text('Вернуть в черновик'), findsOneWidget);
    });

    testWidgets('публикация при уже отправленном уведомлении спрашивает про рассылку', (tester) async {
      final base = plan(preacher: 11, music: 12);
      final f = FakeEditor(PlanDraft(
        id: base.id, date: base.date, startTime: base.startTime, published: false, archived: false, blocks: base.blocks, preacherId: 11, musicId: 12, notifySentAt: DateTime(2026, 11, 1),
      ));
      await _open(tester, fake: f);
      await tester.tap(find.byKey(const ValueKey('publish')));
      await tester.pumpAndSettle();
      expect(find.text('Отправить уведомление снова?'), findsOneWidget);
      await tester.tap(find.text('Без рассылки'));
      await tester.pumpAndSettle();
      expect(f.planPatches.last['send_published_notify'], false);
    });

    testWidgets('сбой сохранения виден и можно повторить', (tester) async {
      final f = await _open(tester);
      f.failPatchBlock = StateError('Нет связи');
      await tester.tap(find.byTooltip('Меню блока').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Скрыть из публикации'));
      await tester.pumpAndSettle(const Duration(seconds: 2));
      expect(find.text('Нет связи'), findsOneWidget);
      f.failPatchBlock = null;
      await tester.tap(find.text('Повторить'));
      await tester.pumpAndSettle();
      expect(find.text('Сохранено'), findsOneWidget);
    });

    testWidgets('перетаскивание блока меняет порядок на сервере', (tester) async {
      final f = await _open(tester);
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -300));
      await tester.pumpAndSettle();
      final handle = find.byIcon(Icons.drag_indicator_rounded).first;
      final start = tester.getCenter(handle);
      final gesture = await tester.startGesture(start);
      await gesture.moveBy(const Offset(0, 30));
      await tester.pump(const Duration(milliseconds: 50));
      await gesture.moveBy(const Offset(0, 100));
      await tester.pump(const Duration(milliseconds: 50));
      await gesture.moveBy(const Offset(0, 20));
      await tester.pump(const Duration(milliseconds: 50));
      await gesture.up();
      await tester.pumpAndSettle();
      expect(f.log.where((l) => l.startsWith('reorder')).length, 1);
      expect(f.log.firstWhere((l) => l.startsWith('reorder')), isNot('reorder 1,2,3'));
    });

    testWidgets('копирование программы кладёт в буфер время, названия и конец', (tester) async {
      await _open(tester);
      String? copied;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
        return null;
      });
      addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
      await tester.tap(find.byTooltip('Действия с программой'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Скопировать программу'));
      await tester.pumpAndSettle();
      expect(copied, contains('10:00 Молитва'));
      expect(copied, contains('10:15 Пётр Сидоров - Вера'));
      expect(copied, contains('Конец 10:55'));
    });

    testWidgets('удаление программы просит подтверждение', (tester) async {
      final f = await _open(tester);
      await tester.tap(find.byTooltip('Действия с программой'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Удалить программу'));
      await tester.pumpAndSettle();
      expect(find.text('Удалить программу?'), findsOneWidget);
      expect(f.log, isNot(contains('deletePlan')));
      await tester.tap(find.text('Удалить'));
      await tester.pumpAndSettle();
      expect(f.log, contains('deletePlan'));
    });
  });

  group('новая программа', () {
    testWidgets('шаблоны, дата — ближайшее воскресенье, создание возвращает id', (tester) async {
      _size(tester);
      final f = FakeEditor(plan());
      int? created;
      await tester.pumpWidget(_app(Builder(
        builder: (context) => Scaffold(body: Center(child: ElevatedButton(onPressed: () async => created = await showNewPlanSheet(context, f), child: const Text('open')))),
      )));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.text('Воскресное служение'), findsOneWidget);
      expect(find.textContaining('воскресенье'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('new-plan-create')));
      await tester.pumpAndSettle();
      expect(created, 7);
      expect(f.log, contains('createPlan 1'));
    });
  });

  group('раздел «Служение»', () {
    testWidgets('администратор: кнопка «+» и вкладка «Архив»', (tester) async {
      _size(tester);
      final f = FakeEditor(plan())
        ..archivedPlans = [PlanSummary(id: 3, date: DateTime(2026, 5, 3), startTime: '10:00', published: true, blocksCount: 4, templateName: 'Старое служение')];
      await tester.pumpWidget(_app(ServicePage(source: _Plans(), editorSource: f)));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Новая программа'), findsOneWidget);
      await tester.tap(find.text('Архив'));
      await tester.pumpAndSettle();
      expect(find.text('Старое служение'), findsOneWidget);
    });

    testWidgets('участник: ни «+», ни архива', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(ServicePage(source: _Plans(), editorSource: FakeEditor(plan())), session: _session(role: 'member')));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Новая программа'), findsNothing);
      expect(find.text('Архив'), findsNothing);
    });

    testWidgets('нажатие на программу у администратора открывает редактор', (tester) async {
      _size(tester);
      await tester.pumpWidget(_app(ServicePage(source: _Plans(), editorSource: FakeEditor(plan(preacher: 11, music: 12)))));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Воскресное служение'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('publish')), findsOneWidget);
    });
  });
}
