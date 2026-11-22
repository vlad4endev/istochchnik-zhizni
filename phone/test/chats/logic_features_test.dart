import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/chats/logic/chat_logic.dart';
import 'package:molitva/features/chats/logic/mentions.dart';
import 'package:molitva/features/chats/logic/selection.dart';
import 'package:molitva/features/chats/logic/voice.dart';
import 'package:molitva/features/chats/models/chat_models.dart';
import 'package:molitva/features/chats/widgets/media_gallery.dart';

import 'fake_chat.dart';

class _Mic implements VoiceBackend {
  bool allowed = true;
  bool failStart = false;
  String? path = '/tmp/voice.m4a';
  final calls = <String>[];
  final levels = StreamController<double>.broadcast();

  @override
  Future<bool> hasPermission() async => allowed;
  @override
  Future<void> start() async {
    calls.add('start');
    if (failStart) throw StateError('mic busy');
  }

  @override
  Future<String?> stop() async {
    calls.add('stop');
    return path;
  }

  @override
  Future<void> cancel() async => calls.add('cancel');
  @override
  Stream<double> get amplitude => levels.stream;
  @override
  void dispose() {}
}

ChatMember _m(int id, String name) => ChatMember(id: id, name: name);

void main() {
  group('упоминания', () {
    test('токен и отправка: «@Имя» в поле → @[id] на сервере → обратно при правке', () {
      final token = buildMentionToken('Анна Орлова', 12);
      expect(token.startsWith('@Анна Орлова'), isTrue);
      final typed = 'Привет, $token как дела?';
      expect(normalizeMentions(typed), 'Привет, @[12] как дела?');
      expect(denormalizeMentions('Привет, @[12]!', {12: 'Анна Орлова'}), 'Привет, $token!');
      expect(denormalizeMentions('Привет, @[99]!', {12: 'Анна'}), 'Привет, @[99]!', reason: 'имя неизвестно — остаётся как есть');
      expect(stripMentionMarkers(token), '@Анна Орлова');
    });

    test('в тексте сообщения @[id] показывается именем; без имени — «@участник»', () {
      final parts = splitMentions('Эй @[2], и @[7]!', {2: 'Анна'});
      expect(parts.map((p) => p.text).join(), 'Эй @Анна, и @участник!');
      expect(parts.where((p) => p.isMention).map((p) => p.memberId), [2, 7]);
      expect(mentionsAsText('@[2] привет', {2: 'Анна'}), '@Анна привет');
      expect(mentionsForPreview('@[2] привет'), '@участник привет');
    });

    test('когда показывать подсказки: после @ в начале слова, не в e-mail и не после готового токена', () {
      expect(activeMentionQuery('@', 1)?.query, '');
      expect(activeMentionQuery('Привет @Ан', 10)?.query, 'Ан');
      expect(activeMentionQuery('Привет @Ан', 10)?.start, 7);
      expect(activeMentionQuery('mail@site.ru', 12), isNull, reason: 'это e-mail');
      expect(activeMentionQuery('Привет', 6), isNull);
      expect(activeMentionQuery('${buildMentionToken('Анна', 2)} ', 8), isNull, reason: 'токен уже вставлен');
      expect(activeMentionQuery('@Анна Ор', 8)?.query, 'Анна Ор', reason: 'имя из двух слов ещё набирается');
      expect(activeMentionQuery('@a b c', 6), isNull, reason: 'три слова — это уже не имя');
      expect(activeMentionQuery('@Анна\nдальше', 12), isNull);
    });

    test('кого предложить: без себя, по имени и фамилии, с начала имени — первыми', () {
      final list = [_m(1, 'Я Сам'), _m(2, 'Анна Орлова'), _m(3, 'Пётр Андреев'), _m(4, 'Мария Лис')];
      expect(mentionCandidates(list, '', me: 1).map((m) => m.id), [2, 4, 3], reason: 'без запроса — все, кроме меня, по алфавиту');
      expect(mentionCandidates(list, 'ан', me: 1).map((m) => m.id), [2, 3], reason: '«Анна» начинается с «ан», «Андреев» — фамилия');
      expect(mentionCandidates(list, 'лис', me: 1).map((m) => m.id), [4]);
      expect(mentionCandidates(list, 'яяя', me: 1), isEmpty);
      expect(mentionCandidates(List.generate(20, (i) => _m(i + 10, 'Имя$i')), '', me: 0, limit: 6), hasLength(6));
    });

    test('вставка: запрос заменяется токеном с пробелом, курсор — после него', () {
      const text = 'Привет @Ан';
      final q = activeMentionQuery(text, text.length)!;
      final r = insertMention(text, q, text.length, _m(2, 'Анна Орлова'));
      expect(stripMentionMarkers(r.text), 'Привет @Анна Орлова ');
      expect(r.cursor, r.text.length);
      expect(normalizeMentions(r.text), 'Привет @[2] ');
    });
  });

  group('выбор сообщений', () {
    final mine = msg('1', sender: 9, name: 'Я', text: 'Моё');
    final other = msg('2', sender: 2, name: 'Анна', text: 'Чужое');
    final photo = msg('3', sender: 9, type: 'image', text: '', payload: const {'url': 'https://x/a.jpg'});
    final pending = msg('local-1', sender: 9, text: 'Не ушло', pending: true);

    test('удалить можно, только если можно удалить каждое; переслать — всё, кроме неотправленных', () {
      SelectionActions a(List<ChatMessage> l) => selectionActions(l, me: 9, groupLike: true, canPin: false);
      expect(a([mine, photo]).delete, isTrue);
      expect(a([mine, other]).delete, isFalse, reason: 'чужое удалять нельзя');
      expect(a([mine, other]).forward, isTrue);
      expect(a([pending]).forward, isFalse);
      expect(a([photo]).copy, isFalse, reason: 'у фото нет текста');
      expect(a(const []).delete, isFalse);
    });

    test('копирование: порядок переписки; имена авторов — только в группе и при нескольких', () {
      final all = [mine, other, photo];
      final chosen = orderedSelection(all, {'2', '1', '3'});
      expect(chosen.map((m) => m.id), ['1', '2', '3']);
      expect(selectionText(chosen, withAuthors: true), 'Я: Моё\nАнна: Чужое');
      expect(selectionText(chosen, withAuthors: false), 'Моё\nЧужое');
      expect(selectionText([other], withAuthors: true), 'Чужое');
      expect(selectionText([msg('7', text: '@[2], привет')], withAuthors: false, names: {2: 'Анна'}), '@Анна, привет');
    });

    test('«1 сообщение, 3 сообщения, 5 сообщений, 11 сообщений, 21 сообщение»', () {
      expect([1, 3, 5, 11, 12, 21, 24, 100].map(messagesCount), ['1 сообщение', '3 сообщения', '5 сообщений', '11 сообщений', '12 сообщений', '21 сообщение', '24 сообщения', '100 сообщений']);
    });
  });

  group('голосовые: чистая логика', () {
    test('волна из децибел: всегда нужное число столбиков, тишина — низкие, крик — высокие', () {
      final quiet = waveformFromDecibels(List.filled(100, -60.0));
      final loud = waveformFromDecibels(List.filled(100, 0.0));
      expect(quiet, hasLength(40));
      expect(quiet.every((v) => v <= 10), isTrue);
      expect(loud.every((v) => v == 100), isTrue);
      expect(waveformFromDecibels(const []), hasLength(40), reason: 'пустая запись не ломает волну');
      expect(waveformFromDecibels([double.negativeInfinity, double.nan, -20]).every((v) => v >= 6 && v <= 100), isTrue);
      expect(waveformFromDecibels(List.filled(3, -10.0), bars: 40), hasLength(40), reason: 'коротких записей меньше столбиков, чем нужно');
    });

    test('волна из сообщения: нет данных (запись из веба) — ровная; мусор ограничивается', () {
      expect(waveformFromPayload(null), everyElement(22));
      expect(waveformFromPayload([0, 50, 200, 'x']), [4, 50, 100, 4]);
    });

    test('время и скорость', () {
      expect(clockText(const Duration(seconds: 7)), '0:07');
      expect(clockText(const Duration(seconds: 65)), '1:05');
      expect(clockText(const Duration(seconds: -3)), '0:00');
      expect([1.0, 1.5, 2.0].map(nextSpeed), [1.5, 2.0, 1.0]);
      expect([1.0, 1.5, 2.0].map(speedLabel), ['1×', '1,5×', '2×']);
    });

    test('жесты: влево — отмена, вверх — закрепить, иначе отправить; влево сильнее вверх', () {
      expect(releaseAction(dx: -120, dy: 0), ReleaseAction.cancel);
      expect(releaseAction(dx: 0, dy: -100), ReleaseAction.lock);
      expect(releaseAction(dx: -10, dy: -10), ReleaseAction.send);
      expect(releaseAction(dx: -120, dy: -100), ReleaseAction.cancel);
    });
  });

  group('запись голосового (контроллер)', () {
    VoiceRecorderController make(_Mic mic, {Duration min = Duration.zero}) => VoiceRecorderController(mic, minDuration: min);

    test('нет доступа к микрофону — понятная причина, запись не начинается', () async {
      final mic = _Mic()..allowed = false;
      final c = make(mic);
      await c.begin();
      expect(c.active, isFalse);
      expect(c.problem, contains('микрофон'));
      expect(mic.calls, isEmpty);
    });

    test('сбой запуска не оставляет «зависшую» запись', () async {
      final mic = _Mic()..failStart = true;
      final c = make(mic);
      await c.begin();
      expect(c.state, VoiceState.idle);
      expect(c.problem, isNotNull);
    });

    test('удержали и отпустили — готовая запись с длительностью и волной', () async {
      final mic = _Mic();
      final c = make(mic);
      await c.begin();
      expect(c.state, VoiceState.recording);
      mic.levels.add(-10);
      mic.levels.add(-30);
      await Future<void>.delayed(const Duration(milliseconds: 30));
      final clip = await c.release();
      expect(clip, isNotNull);
      expect(clip!.path, '/tmp/voice.m4a');
      expect(clip.waveform, hasLength(40));
      expect(c.active, isFalse);
      expect(mic.calls, ['start', 'stop']);
    });

    test('слишком короткая запись (случайное касание) выбрасывается с подсказкой', () async {
      final mic = _Mic();
      final c = make(mic, min: const Duration(seconds: 5));
      await c.begin();
      final clip = await c.release();
      expect(clip, isNull);
      expect(c.problem, contains('Удерживайте'));
    });

    test('свайп влево — отмена: ничего не отправляется, запись сбрасывается', () async {
      final mic = _Mic();
      final c = make(mic);
      await c.begin();
      c.drag(-140, 0);
      expect(c.willCancel, isTrue);
      expect(await c.release(), isNull);
      expect(mic.calls, ['start', 'cancel']);
      expect(c.active, isFalse);
    });

    test('свайп вверх — запись закрепляется; дальше «Отправить» или «Удалить»', () async {
      final mic = _Mic();
      final c = make(mic);
      await c.begin();
      c.drag(0, -100);
      expect(c.willLock, isTrue);
      expect(await c.release(), isNull);
      expect(c.state, VoiceState.locked);
      final clip = await c.finish();
      expect(clip, isNotNull);

      await c.begin();
      c.drag(0, -100);
      await c.release();
      await c.cancel();
      expect(c.active, isFalse);
      expect(mic.calls.last, 'cancel');
    });

    test('beginLocked — запись сразу закреплена (для скринридера)', () async {
      final c = make(_Mic());
      await c.beginLocked();
      expect(c.state, VoiceState.locked);
      await c.cancel();
    });

    test('потерялся файл записи — понятная причина, а не тишина', () async {
      final mic = _Mic()..path = null;
      final c = make(mic);
      await c.begin();
      expect(await c.finish(), isNull);
      expect(c.problem, contains('сохранить'));
    });

    test('двойной «begin» не запускает вторую запись', () async {
      final mic = _Mic();
      final c = make(mic);
      await Future.wait([c.begin(), c.begin()]);
      expect(mic.calls.where((x) => x == 'start'), hasLength(1));
      await c.cancel();
    });
  });

  group('общие медиа', () {
    test('видео отделены от фото; у файла есть размер; ссылки без повторов', () {
      final shared = collectSharedMedia([
        msg('1', type: 'image', text: '', payload: const {'url': '/a.jpg', 'mimeType': 'image/jpeg'}),
        msg('2', type: 'image', text: '', payload: const {'url': '/b.mp4', 'mimeType': 'video/mp4'}),
        msg('3', type: 'file', text: '', payload: const {'url': '/c.pdf', 'name': 'Отчёт.pdf', 'size': 2097152}),
        msg('4', text: 'смотри https://example.com/x и https://example.com/x'),
      ], (raw) => 'https://srv$raw');
      expect(shared.images.map((i) => i.url), ['https://srv/a.jpg']);
      expect(shared.videos.map((i) => i.url), ['https://srv/b.mp4']);
      expect(shared.mediaCount, 2);
      expect(shared.files.single.size, 2097152);
      expect(shared.links, hasLength(1));
    });

    test('размер файла и домен ссылки', () {
      expect(fileSizeText(0), '');
      expect(fileSizeText(512), '512 Б');
      expect(fileSizeText(340 * 1024), '340 КБ');
      expect(fileSizeText(1258291), '1,2 МБ');
      expect(linkHost('https://www.example.com/path?q=1'), 'example.com');
      expect(linkHost('не ссылка'), '');
    });
  });
}
