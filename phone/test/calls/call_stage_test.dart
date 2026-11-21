import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/calls/logic/call_layout.dart';
import 'package:molitva/features/calls/widgets/call_stage.dart';
import 'package:molitva/features/calls/widgets/call_widgets.dart';

List<CallPerson> _people(int n, {bool speakingSecond = false}) => [
      const CallPerson(identity: 'me', name: 'Мария Лис', isLocal: true, micOn: true),
      for (var i = 1; i < n; i++) CallPerson(identity: 'p$i', name: ['Анна Орлова', 'Пётр Сидоров', 'Елена Музыка', 'Иван Петров', 'Ольга Свет', 'Павел Дорн', 'Нина Ра', 'Лев Тор'][i % 8], micOn: i % 3 != 0, speaking: speakingSecond && i == 1),
    ];

Widget _stage(List<CallPerson> people, {bool meeting = true, CallLayoutMode layout = CallLayoutMode.grid, double width = 360, double scale = 1, bool bar = true, Widget? invite}) => MaterialApp(
      theme: churchTheme(brightness: Brightness.dark),
      home: MediaQuery(
        data: MediaQueryData(size: Size(width, 780), textScaler: TextScaler.linear(scale)),
        child: Scaffold(
          backgroundColor: CallColors.bg,
          body: SafeArea(
            child: Stack(
              children: [
                Positioned.fill(
                  child: CallStage(people: people, title: 'Утренняя молитвенная стража', isMeeting: meeting, isVideo: true, layout: layout, onLayout: (_) {}, statusText: '05:07', inviteBar: invite),
                ),
                if (bar)
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: CallControlsBar(children: [
                      CallControl(icon: Icons.mic_rounded, label: 'Микрофон', onTap: () {}),
                      CallControl(icon: Icons.videocam_off_rounded, label: 'Камера', off: true, onTap: () {}),
                      CallControl(icon: Icons.people_alt_rounded, label: 'Участники', badge: '${people.length}', onTap: () {}),
                      CallControl(icon: Icons.link_rounded, label: 'Ссылка', onTap: () {}),
                      CallControl(icon: Icons.call_end_rounded, label: 'Выйти', hangup: true, onTap: () {}),
                    ]),
                  ),
              ],
            ),
          ),
        ),
      ),
    );

void _size(WidgetTester tester, double w) {
  tester.view.physicalSize = Size(w, 780);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

void main() {
  for (final n in [1, 2, 3, 4, 5, 6, 7, 12]) {
    testWidgets('сетка на $n участников: плитки, «+N» при переполнении, без переполнений', (tester) async {
      _size(tester, 360);
      await tester.pumpWidget(_stage(_people(n)));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final tiles = find.byType(ParticipantTile).evaluate().length;
      if (n <= 6) {
        expect(tiles, n);
        expect(find.byKey(const ValueKey('tile-overflow')), findsNothing);
      } else {
        expect(tiles, 5);
        expect(find.text('+${n - 5}'), findsOneWidget);
      }
      expect(find.text('Мария Лис (вы)'), findsOneWidget);
    });
  }

  for (final (w, s) in [(320.0, 1.0), (320.0, 2.0), (390.0, 1.3)]) {
    testWidgets('встреча: ширина $w, шрифт $s — без переполнений в сетке и «Говорящий»', (tester) async {
      _size(tester, w);
      for (final mode in CallLayoutMode.values) {
        await tester.pumpWidget(_stage(_people(5, speakingSecond: true), layout: mode, width: w, scale: s));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: '$mode');
      }
    });
  }

  testWidgets('«Говорящий»: крупно говорящий собеседник, остальные — в ленте', (tester) async {
    _size(tester, 360);
    await tester.pumpWidget(_stage(_people(4, speakingSecond: true), layout: CallLayoutMode.speaker));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('spot-p1')), findsOneWidget);
    expect(find.byKey(const ValueKey('strip-me')), findsOneWidget);
    expect(find.byKey(const ValueKey('strip-p2')), findsOneWidget);
    expect(find.byKey(const ValueKey('strip-p1')), findsNothing);
  });

  testWidgets('в одиночку «Говорящий» показывает единственную плитку на весь экран', (tester) async {
    _size(tester, 360);
    await tester.pumpWidget(_stage(_people(1), layout: CallLayoutMode.speaker));
    await tester.pumpAndSettle();
    expect(find.byType(ParticipantTile), findsOneWidget);
  });

  testWidgets('верхняя панель: название, число участников, переключатель раскладки', (tester) async {
    _size(tester, 360);
    CallLayoutMode? picked;
    await tester.pumpWidget(MaterialApp(
      theme: churchTheme(brightness: Brightness.dark),
      home: Scaffold(backgroundColor: CallColors.bg, body: CallTopBar(title: 'Встреча', count: 3, layout: CallLayoutMode.grid, onLayout: (m) => picked = m)),
    ));
    expect(find.text('Встреча'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('Говорящий крупно'));
    expect(picked, CallLayoutMode.speaker);
  });

  testWidgets('один на один без видео: портрет, имя и статус; кнопка камеры не нужна', (tester) async {
    _size(tester, 360);
    await tester.pumpWidget(_stage(_people(2), meeting: false));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Утренняя молитвенная стража'), findsOneWidget);
    expect(find.text('05:07'), findsOneWidget);
    expect(find.byType(ParticipantTile).evaluate().length, 1, reason: 'только крупный портрет');
  });

  testWidgets('кнопки управления: подписи, красная «Выйти», счётчик участников', (tester) async {
    _size(tester, 320);
    await tester.pumpWidget(_stage(_people(3), scale: 2));
    await tester.pumpAndSettle();
    for (final label in ['Микрофон', 'Камера', 'Участники', 'Ссылка', 'Выйти']) {
      expect(find.text(label), findsOneWidget);
    }
    expect(find.text('3'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('панель приглашения: копирование', (tester) async {
    _size(tester, 360);
    var copied = 0;
    await tester.pumpWidget(_stage(_people(1), invite: InviteBar(title: 'Встреча', url: 'https://x/call/join/abc', copied: false, onCopy: () => copied++, onClose: () {})));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('invite-copy')));
    expect(copied, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('лист «Участники»: все в списке, состояние микрофона, ссылка', (tester) async {
    _size(tester, 360);
    await tester.pumpWidget(MaterialApp(
      theme: churchTheme(brightness: Brightness.dark),
      home: Builder(builder: (context) => Scaffold(body: Center(child: ElevatedButton(onPressed: () => showParticipantsSheet(context, people: _people(4), inviteUrl: 'https://x/call/join/abc', onCopyInvite: () {}), child: const Text('open'))))),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('Участники (4)'), findsOneWidget);
    expect(find.byKey(const ValueKey('person-p1')), findsOneWidget);
    expect(find.text('Скопировать название и ссылку'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('картинки для визуальной проверки', (tester) async {
    final out = Platform.environment['CALL_SHOT'];
    if (out == null) return;
    for (final f in ['assets/fonts/Onest-Regular.ttf', 'assets/fonts/Onest-Medium.ttf', 'assets/fonts/Onest-SemiBold.ttf', 'assets/fonts/Onest-Bold.ttf']) {
      if (!File(f).existsSync()) continue;
      final l = FontLoader('Onest')..addFont(Future.value(ByteData.sublistView(File(f).readAsBytesSync())));
      await l.load();
    }
    final l = FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(File('/root/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf').readAsBytesSync())));
    await l.load();
    tester.view.physicalSize = const Size(780, 1560);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    final cases = <String, Widget>{
      'grid2': _stage(_people(2)),
      'grid4': _stage(_people(4, speakingSecond: true)),
      'grid7': _stage(_people(7)),
      'speaker': _stage(_people(4, speakingSecond: true), layout: CallLayoutMode.speaker),
      'invite': _stage(_people(1), invite: InviteBar(title: 'Утренняя молитвенная стража', url: 'https://example.org/call/join/aB3dE', copied: false, onCopy: () {}, onClose: () {})),
      'direct': _stage(_people(2), meeting: false),
    };
    for (final e in cases.entries) {
      final key = GlobalKey();
      await tester.pumpWidget(RepaintBoundary(key: key, child: e.value));
      await tester.pumpAndSettle();
      await tester.runAsync(() async {
        final image = await (key.currentContext!.findRenderObject()! as RenderRepaintBoundary).toImage(pixelRatio: 1);
        File('$out/call_${e.key}.png').writeAsBytesSync((await image.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List());
      });
    }
  });
}
