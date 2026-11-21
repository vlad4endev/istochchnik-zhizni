import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:molitva/features/chats/logic/chat_logic.dart';
import 'package:molitva/features/chats/models/chat_models.dart';

import 'fake_chat.dart';

final _now = DateTime(2026, 11, 21, 12);

void main() {
  sharedMediaTests();
  setUpAll(() => initializeDateFormatting('ru'));

  group('разбор сообщения с сервера', () {
    test('имя отправителя: name, иначе имя+фамилия; id приходит строкой', () {
      final m = ChatMessage.tryParse({
        'id': '77',
        'conversation_id': '5',
        'sender_id': 3,
        'sender_name': '',
        'sender_first_name': 'Анна',
        'sender_last_name': 'Орлова',
        'content': 'Привет',
        'created_at': '2026-11-21T10:00:00Z',
        'reactions': [
          {'emoji': '👍', 'count': 2, 'reacted_by_me': true},
          {'emoji': '', 'count': 1, 'reacted_by_me': false},
        ],
        'reply_preview': {'id': '70', 'content': 'Тема', 'sender_name': 'Пётр', 'is_deleted': false},
        'forwarded_from': {'x': 1},
        'poll_tallies': [1, 2],
      })!;
      expect(m.senderName, 'Анна Орлова');
      expect(m.senderId, 3);
      expect(m.reactions.single.emoji, '👍');
      expect(m.reactions.single.byMe, isTrue);
      expect(m.replyTo!.senderName, 'Пётр');
      expect(m.forwarded, isTrue);
      expect(m.pollTallies, [1, 2]);
      expect(m.payloadType, 'text');
    });
    test('без id сообщения нет; системное сообщение без автора', () {
      expect(ChatMessage.tryParse({'content': 'x'}), isNull);
      expect(ChatMessage.tryParse({'id': 1, 'sender_id': null, 'content': 'Рассылка'})!.senderId, isNull);
    });
    test('права чата: нет данных — писать можно; явный запрет — нельзя', () {
      expect(ChatMeta.fromJson({'type': 'group'}).canSend, isTrue);
      final ro = ChatMeta.fromJson({'type': 'channel', 'my_effective_permissions': {'can_send_messages': false, 'can_send_media': true}});
      expect(ro.canSend, isFalse);
      expect(ro.canSendMedia, isFalse, reason: 'без текста нет и медиа');
      final media = ChatMeta.fromJson({'type': 'group', 'my_effective_permissions': {'can_send_messages': true, 'can_send_media': false, 'can_pin_messages': true}});
      expect((media.canSend, media.canSendMedia, media.canPin), (true, false, true));
    });
    test('участник: имя из колонок, роль, «в сети»', () {
      final m = ChatMember.tryParse({'member_id': 4, 'first_name': 'Пётр', 'last_name': 'Сидоров', 'name': 'x', 'role': 'admin', 'is_online': true, 'avatar_url': ''})!;
      expect((m.name, m.role, m.online, m.avatarUrl), ('Пётр Сидоров', 'admin', true, null));
    });
    test('профиль собеседника: списки через запятую и дата рождения', () {
      final p = PrivateProfile.fromJson({
        'id': 2,
        'first_name': 'Анна',
        'last_name': 'Орлова',
        'phone_number': ' +7 900 000-00-00 ',
        'ministry_role': 'Ведущий, Оператор',
        'ministry_direction': 'Медиа;Музыка',
        'app_role': 'member',
        'birth_date': '1990-11-22',
      });
      expect(p.ministryRoles, ['Ведущий', 'Оператор']);
      expect(p.directions, ['Медиа', 'Музыка']);
      expect(p.birthDate, DateTime(1990, 11, 22));
      expect(p.phone, '+7 900 000-00-00');
      expect(p.hasInfo, isTrue);
      expect(PrivateProfile.fromJson({'id': 1, 'name': 'X'}).hasInfo, isFalse);
    });
    test('карточка ссылки: пустая не нужна', () {
      expect(LinkPreview.tryParse({'preview': null}), isNull);
      final p = LinkPreview.tryParse({'preview': {'url': 'https://a.ru/x', 'host': 'a.ru', 'title': '', 'description': '', 'image': null}})!;
      expect(p.isUseful, isFalse);
      expect(p.site, 'a.ru');
      expect(LinkPreview.tryParse({'preview': {'url': 'https://a.ru', 'host': 'a.ru', 'title': 'T', 'siteName': 'Сайт'}})!.site, 'Сайт');
    });
    test('кто прочитал', () {
      final r = Readers.fromJson({
        'readers': [
          {'member_id': 2, 'display_name': 'Анна', 'avatar_url': null, 'read_at': '2026-11-21T10:00:00Z'},
          {'member_id': 0, 'display_name': 'Пустой'},
        ],
        'other_member_count': 5,
      });
      expect(r.readers.single.name, 'Анна');
      expect(r.otherCount, 5);
    });
  });

  group('группировка', () {
    test('один автор подряд меньше 5 минут — «пачка»: у соседей флаги, имя повторно не нужно', () {
      final views = groupMessages([msg('1', sender: 2), msg('2', sender: 2), msg('3', sender: 3, name: 'Пётр'), msg('9', sender: 3, name: 'Пётр')], _now);
      expect([for (final v in views) v.groupedWithPrev], [false, true, false, false], reason: '9-е спустя 6 минут — новая пачка');
      expect([for (final v in views) v.groupedWithNext], [true, false, false, false]);
    });
    test('разделитель даты: «Сегодня», «Вчера», дата; пачка не тянется через полночь', () {
      final views = groupMessages([
        msg('1', at: DateTime(2026, 11, 19, 23, 59)),
        msg('2', at: DateTime(2026, 11, 20, 0, 1)),
        msg('3', at: DateTime(2026, 11, 21, 9)),
      ], _now);
      expect([for (final v in views) v.dateLabel], ['19 ноября 2026', 'Вчера', 'Сегодня']);
      expect(views[1].groupedWithPrev, isFalse);
    });
    test('пусто', () => expect(groupMessages(const [], _now), isEmpty));
  });

  group('ссылки', () {
    test('точка и скобка в конце предложения в ссылку не входят', () {
      final chunks = chunkText('Смотри https://example.com/a?b=1, и (https://x.ru/y). Всё!');
      expect([for (final c in chunks) if (c.isLink) c.url], ['https://example.com/a?b=1', 'https://x.ru/y']);
      expect(chunks.map((c) => c.text).join(), 'Смотри https://example.com/a?b=1, и (https://x.ru/y). Всё!');
    });
    test('без ссылок один кусок; пустой текст — нет кусков', () {
      expect(chunkText('просто текст').single.isLink, isFalse);
      expect(chunkText(''), isEmpty);
    });
    test('карточки: до двух, без дублей и без адресов самого приложения', () {
      final urls = previewUrls('https://app.church.ru/x https://a.ru https://a.ru https://b.ru https://c.ru', ownHost: 'app.church.ru');
      expect(urls, ['https://a.ru', 'https://b.ru']);
    });
  });

  group('что можно сделать с сообщением', () {
    MessageActions a(ChatMessage m, {int me = 9, bool group = true, bool pin = false}) => actionsFor(m, me: me, groupLike: group, canPin: pin);

    test('чужое текстовое: ответить, переслать, копировать, реакция — но не править и не удалять', () {
      final r = a(msg('5', sender: 2));
      expect((r.reply, r.forward, r.copy, r.react), (true, true, true, true));
      expect((r.edit, r.delete, r.readers), (false, false, false));
    });
    test('своё: правка, удаление и «кто прочитал» в группе; в личном чате читателей нет', () {
      final mine = msg('5', sender: 9);
      expect((a(mine).edit, a(mine).delete, a(mine).readers), (true, true, true));
      expect(a(mine, group: false).readers, isFalse);
    });
    test('опрос нельзя править; удалённое и неотправленное — ничего', () {
      expect(a(msg('5', sender: 9, type: 'poll')).edit, isFalse);
      expect(a(msg('5', deleted: true)).any, isFalse);
      expect(a(msg('local-1', pending: true)).any, isFalse);
      expect(a(msg('abc')).any, isFalse, reason: 'не серверный id');
    });
    test('системное сообщение без автора можно удалить; закрепить — только с правом', () {
      expect(a(msg('5', sender: null)).delete, isTrue);
      expect(a(msg('5'), pin: true).pin, isTrue);
      expect(a(msg('5')).pin, isFalse);
    });
    test('копировать только текст; у фото текста нет', () {
      expect(a(msg('5', type: 'image', text: '')).copy, isFalse);
      expect(a(msg('5', text: '   ')).copy, isFalse);
    });
  });

  group('реакции', () {
    test('поставить новую, поддержать чужую, снять свою', () {
      var list = <Reaction>[];
      list = toggleReaction(list, '👍');
      expect((list.single.count, list.single.byMe), (1, true));
      list = toggleReaction(list, '👍');
      expect(list, isEmpty, reason: 'моя единственная — исчезает');
      list = [const Reaction(emoji: '🔥', count: 2, byMe: false)];
      list = toggleReaction(list, '🔥');
      expect((list.single.count, list.single.byMe), (3, true));
      list = toggleReaction(list, '🔥');
      expect((list.single.count, list.single.byMe), (2, false));
    });
  });

  group('подписи', () {
    test('цвет имени один и тот же для человека, из набора', () {
      expect(senderColor(5), senderColor(5));
      expect(senderColor(null), senderColor(0));
    });
    test('«в сети» и «был(а)»', () {
      expect(presenceLabel(online: true, now: _now), 'в сети');
      expect(presenceLabel(online: false, lastSeen: _now.subtract(const Duration(minutes: 1)), now: _now), 'в сети');
      expect(presenceLabel(online: false, lastSeen: _now.subtract(const Duration(minutes: 30)), now: _now), 'был(а) 30 мин назад');
      expect(presenceLabel(online: false, lastSeen: DateTime(2026, 11, 21, 8, 5), now: _now), 'был(а) сегодня в 08:05');
      expect(presenceLabel(online: false, lastSeen: DateTime(2026, 11, 20, 8, 5), now: _now), 'был(а) вчера в 08:05');
      expect(presenceLabel(online: false, lastSeen: DateTime(2026, 11, 1), now: _now), 'был(а) 1 ноября');
      expect(presenceLabel(online: false, now: _now), '');
    });
    test('склонение участников и подписчиков', () {
      expect([for (final n in [1, 2, 5, 11, 21, 22]) membersCaption(n)], ['1 участник', '2 участника', '5 участников', '11 участников', '21 участник', '22 участника']);
      expect(membersCaption(3, channel: true), '3 подписчика');
    });
    test('краткое содержание для ответа и пересылки', () {
      expect(messageSummary(msg('1', text: ' Привет ')), 'Привет');
      expect(messageSummary(msg('1', text: '', type: 'image')), 'Фото');
      expect(messageSummary(msg('1', text: '', type: 'audio')), 'Голосовое сообщение');
      expect(messageSummary(msg('1', deleted: true)), 'Сообщение удалено');
      expect(messageSummary(msg('1', text: 'Когда?', type: 'poll')), 'Опрос: Когда?');
    });
  });
}

void sharedMediaTests() {
  group('общие медиа', () {
    String abs(String raw) => 'https://x$raw';
    test('фото, файлы и ссылки; новые сверху, удалённые не считаются, ссылки без дублей', () {
      final shared = collectSharedMedia([
        msg('1', type: 'image', text: '', payload: {'url': '/u/1.jpg'}),
        msg('2', type: 'file', text: '', payload: {'url': '/u/a.pdf', 'name': 'Отчёт.pdf'}),
        msg('3', text: 'Смотри https://a.ru и ещё https://a.ru, а также https://b.ru'),
        msg('4', type: 'image', text: '', payload: {'url': '/u/2.jpg'}, deleted: true),
        msg('5', type: 'image', text: '', payload: {'url': '/u/3.jpg'}),
        msg('6', type: 'file', text: '', payload: {'url': '/u/b', 'name': ''}),
        msg('7', type: 'image', text: '', payload: {}),
      ], abs);
      expect(shared.images.map((i) => i.url), ['https://x/u/3.jpg', 'https://x/u/1.jpg']);
      expect(shared.files.map((f) => f.name), ['Файл', 'Отчёт.pdf']);
      expect(shared.links.map((l) => l.url), ['https://a.ru', 'https://b.ru']);
      expect(shared.isEmpty, isFalse);
      expect(collectSharedMedia(const [], abs).isEmpty, isTrue);
    });
  });

  group('день рождения', () {
    test('сегодня, скоро и в следующем году', () {
      final now = DateTime(2026, 11, 21);
      expect(daysUntilBirthday(DateTime(1990, 11, 21), now), 0);
      expect(daysUntilBirthday(DateTime(1990, 11, 25), now), 4);
      expect(daysUntilBirthday(DateTime(1990, 11, 20), now), 364);
      expect(daysUntilBirthday(null, now), isNull);
    });
  });
}
