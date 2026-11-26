import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/calls/logic/active_call_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('запоминает звонок и возвращает его', () async {
    final t = DateTime(2026, 11, 26, 12);
    await ActiveCallStore.save(callId: 'c1', host: true, video: true, title: 'Молитва', conversationId: 'g1', now: t);
    final r = await ActiveCallStore.read(now: t.add(const Duration(minutes: 5)));
    expect(r?.callId, 'c1');
    expect(r?.host, isTrue);
    expect(r?.video, isTrue);
    expect(r?.title, 'Молитва');
    expect(r?.conversationId, 'g1');
  });

  test('встреча без чата: conversationId пуст', () async {
    await ActiveCallStore.save(callId: 'c2', host: false, video: false, title: '');
    expect((await ActiveCallStore.read())?.conversationId, isNull);
  });

  test('старая запись забывается', () async {
    final t = DateTime(2026, 11, 26, 12);
    await ActiveCallStore.save(callId: 'c1', host: true, video: false, title: 'x', now: t);
    expect(await ActiveCallStore.read(now: t.add(ActiveCallStore.maxAge + const Duration(minutes: 1))), isNull);
    expect(await ActiveCallStore.read(now: t), isNull, reason: 'просроченная запись удаляется');
  });

  test('очистка и мусор в хранилище', () async {
    await ActiveCallStore.save(callId: 'c1', host: true, video: false, title: 'x');
    await ActiveCallStore.clear();
    expect(await ActiveCallStore.read(), isNull);
    SharedPreferences.setMockInitialValues({'active_call': '{не json'});
    expect(await ActiveCallStore.read(), isNull);
  });
}
