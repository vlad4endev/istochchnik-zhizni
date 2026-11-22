import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/features/feed/data/feed_source.dart';
import 'package:molitva/features/feed/feed_controller.dart';
import 'package:molitva/features/feed/models/feed_models.dart';

import 'fake_feed.dart';

String _resolve(String raw) => raw.startsWith('http') ? raw : 'https://srv$raw';

void main() {
  FeedController make(FakeFeed f, {Stream<String>? changes}) => FeedController(f, meId: 9, cacheChanges: changes);
  List<FeedPost> posts(int n) => [for (var i = 1; i <= n; i++) post('$i', caption: 'Запись $i')];

  group('модели', () {
    test('запись: автор, медиа по порядку, видео, репост', () {
      final p = FeedPost.tryParse({
        'id': 5,
        'member_id': 2,
        'author': {'member_id': 2, 'display_name': '', 'first_name': 'Анна', 'last_name': 'Орлова', 'avatar_url': '/a.jpg'},
        'caption': '  Привет  ',
        'created_at': '2026-11-22T10:00:00Z',
        'media': [
          {'url': '/2.mp4', 'type': 'video', 'order': 2},
          {'url': '/1.jpg', 'type': 'image', 'order': 1},
        ],
        'like_count': 3,
        'comment_count': 1,
        'repost_count': 2,
        'liked_by_me': true,
        'shared_post': {'id': 7, 'member_id': 3, 'author': {'display_name': 'Пётр'}, 'caption': 'Исходная', 'created_at': '2026-11-21T10:00:00Z', 'media': []},
      }, _resolve)!;
      expect(p.author.label, 'Анна Орлова');
      expect(p.author.avatarUrl, 'https://srv/a.jpg');
      expect(p.caption, 'Привет');
      expect(p.media.map((m) => m.url), ['https://srv/1.jpg', 'https://srv/2.mp4']);
      expect(p.media.last.isVideo, isTrue);
      expect((p.likeCount, p.commentCount, p.repostCount, p.likedByMe), (3, 1, 2, true));
      expect(p.shared?.author.label, 'Пётр');
      expect(FeedPost.tryParse({'caption': 'без id'}, _resolve), isNull);
    });

    test('автор без имени — «Участник»; логин как запасное имя', () {
      expect(FeedAuthor.parse({'username': 'anna'}, _resolve).label, 'anna');
      expect(FeedAuthor.parse(null, _resolve).label, 'Участник');
    });

    test('страница ленты: курсор; пустой курсор — конец', () {
      final page = FeedPageData.parse({'posts': [{'id': 1}, {'id': 2}, {'x': 1}], 'next_cursor': '30'}, _resolve);
      expect(page.posts, hasLength(2));
      expect(page.nextCursor, '30');
      expect(FeedPageData.parse({'posts': [], 'next_cursor': null}, _resolve).nextCursor, isNull);
    });

    test('комментарий: текст из любого поля, лайки', () {
      final c = FeedComment.tryParse({'id': 4, 'post_id': 5, 'member_id': 2, 'body': 'Аминь', 'like_count': 2, 'liked_by_me': true, 'author': {'display_name': 'Анна'}}, _resolve)!;
      expect((c.text, c.likeCount, c.likedByMe, c.author.label), ('Аминь', 2, true, 'Анна'));
    });

    test('истории: группа без историй отбрасывается; просмотрено, первая непросмотренная', () {
      expect(StoryGroup.tryParse({'author': {'display_name': 'А'}, 'stories': []}, _resolve), isNull);
      final g = StoryGroup.tryParse({
        'author': {'member_id': 2, 'display_name': 'Анна'},
        'is_me': false,
        'stories': [
          {'id': 1, 'member_id': 2, 'media_url': '/1.jpg', 'media_type': 'image', 'viewed_by_me': true},
          {'id': 2, 'member_id': 2, 'media_url': '/2.mp4', 'media_type': 'video', 'viewed_by_me': false},
        ],
      }, _resolve)!;
      expect(g.allSeen, isFalse);
      expect(g.firstUnseen, 1);
      expect(g.stories.last.isVideo, isTrue);
      final seen = g.withViewed('2');
      expect(seen.allSeen, isTrue);
      expect(seen.firstUnseen, 0, reason: 'всё просмотрено — смотрим с начала');
    });
  });

  group('лента', () {
    test('первая загрузка: записи, курсор, «прочитано» и истории', () async {
      final f = FakeFeed()..all = posts(25);
      final c = make(f);
      expect(c.loading, isTrue);
      await c.load();
      expect(c.loading, isFalse);
      expect(c.posts, hasLength(20));
      expect(c.hasMore, isTrue);
      await Future<void>.delayed(Duration.zero);
      expect(f.calls, containsAll(['feed::smart', 'markSeen', 'stories']));
    });

    test('первая загрузка не удалась — ошибка и пустой экран; повтор помогает', () async {
      final f = FakeFeed()
        ..all = posts(3)
        ..failFeed = true;
      final c = make(f);
      await c.load();
      expect(c.error, 'нет связи');
      expect(c.posts, isEmpty);
      f.failFeed = false;
      await c.load();
      expect(c.error, isNull);
      expect(c.posts, hasLength(3));
    });

    test('повторное открытие при записях — тихо: ошибка не затирает ленту', () async {
      final f = FakeFeed()..all = posts(3);
      final c = make(f);
      await c.load();
      f.failFeed = true;
      await c.load();
      expect(c.error, isNull);
      expect(c.posts, hasLength(3));
    });

    test('догрузка следующей страницы: без дублей; конец — hasMore false; сбой — можно повторить', () async {
      final f = FakeFeed()
        ..all = posts(25)
        ..pageSize = 20;
      final c = make(f);
      await c.load();
      f.failMore = true;
      await c.loadMore();
      expect(c.loadMoreFailed, isTrue);
      expect(c.posts, hasLength(20));
      f.failMore = false;
      await c.loadMore();
      expect(c.posts.map((p) => p.id).toSet(), hasLength(25));
      expect(c.hasMore, isFalse);
      f.calls.clear();
      await c.loadMore();
      expect(f.calls, isEmpty, reason: 'больше страниц нет — запроса нет');
    });

    test('две догрузки подряд не запускают два запроса', () async {
      final f = FakeFeed()
        ..all = posts(45)
        ..pageSize = 20;
      final c = make(f);
      await c.load();
      f.gate = Completer<void>();
      f.calls.clear();
      final a = c.loadMore();
      final b = c.loadMore();
      f.gate!.complete();
      await Future.wait([a, b]);
      expect(f.calls.where((x) => x.startsWith('feed:20')), hasLength(1));
    });

    test('смена порядка: перезагрузка с новой сортировкой', () async {
      final f = FakeFeed()..all = posts(3);
      final c = make(f);
      await c.load();
      f.calls.clear();
      await c.setSort(FeedSort.recent);
      expect(c.sort, FeedSort.recent);
      expect(f.calls.first, 'feed::recent');
      f.calls.clear();
      await c.setSort(FeedSort.recent);
      expect(f.calls, isEmpty, reason: 'тот же порядок — ничего не делаем');
    });

    test('баннер «Новые записи»: счётчик с сервера; после обновления — ноль', () async {
      final f = FakeFeed()..all = posts(3);
      final c = make(f);
      await c.load();
      f.unread = 4;
      await c.checkNew();
      expect(c.newCount, 4);
      await c.refresh();
      expect(c.newCount, 0);
    });
  });

  group('лайки и действия', () {
    test('лайк сразу на экране; счётчик меняется; повтор снимает', () async {
      final f = FakeFeed()..all = [post('1', likes: 3)];
      final c = make(f);
      await c.load();
      final future = c.toggleLike(c.posts.first);
      expect(c.posts.first.likedByMe, isTrue, reason: 'не ждём сервер');
      expect(c.posts.first.likeCount, 4);
      await future;
      await c.toggleLike(c.posts.first);
      expect(c.posts.first.likedByMe, isFalse);
      expect(c.posts.first.likeCount, 3);
      expect(f.calls.where((x) => x.startsWith('like')), ['like:1:true', 'like:1:false']);
    });

    test('сбой лайка — откат и понятная ошибка', () async {
      final f = FakeFeed()
        ..all = [post('1', likes: 3)]
        ..failLike = true;
      final c = make(f);
      await c.load();
      await expectLater(c.toggleLike(c.posts.first), throwsA(isA<FeedException>()));
      expect(c.posts.first.likedByMe, isFalse);
      expect(c.posts.first.likeCount, 3);
      f.failLike = false;
      await c.toggleLike(c.posts.first);
      expect(c.posts.first.likedByMe, isTrue, reason: 'после сбоя снова можно нажать');
    });

    test('быстрые двойные нажатия не гонят два запроса', () async {
      final f = FakeFeed()..all = [post('1')];
      final c = make(f);
      await c.load();
      f.gate = Completer<void>();
      final a = c.toggleLike(c.posts.first);
      final b = c.toggleLike(c.posts.first);
      f.gate!.complete();
      await Future.wait([a, b]);
      expect(f.calls.where((x) => x.startsWith('like')), hasLength(1));
    });

    test('двойной тап только ставит «нравится», уже поставленное не снимает', () async {
      final f = FakeFeed()..all = [post('1', liked: true, likes: 1)];
      final c = make(f);
      await c.load();
      await c.likeOnly(c.posts.first);
      expect(c.posts.first.likedByMe, isTrue);
      expect(f.calls.where((x) => x.startsWith('like')), isEmpty);
    });

    test('удаление: запись исчезает; сбой — остаётся и ошибка', () async {
      final f = FakeFeed()..all = posts(2);
      final c = make(f);
      await c.load();
      f.failAction = true;
      await expectLater(c.delete(c.posts.first), throwsA(isA<FeedException>()));
      expect(c.posts, hasLength(2));
      f.failAction = false;
      await c.delete(c.posts.first);
      expect(c.posts.map((p) => p.id), ['2']);
    });

    test('правка подписи и счётчик комментариев', () async {
      final f = FakeFeed()..all = [post('1', comments: 2)];
      final c = make(f);
      await c.load();
      await c.edit(c.posts.first, '  Новый текст  ');
      expect(c.posts.first.caption, 'Новый текст');
      c.commentCountChanged('1', 1);
      expect(c.posts.first.commentCount, 3);
      c.commentCountChanged('1', -5);
      expect(c.posts.first.commentCount, 0, reason: 'не уходит в минус');
    });

    test('репост: отметка и счётчик; ошибка сервера («уже поделились») показывается', () async {
      final f = FakeFeed()..all = [post('1')];
      final c = make(f);
      await c.load();
      f.failAction = true;
      await expectLater(c.repost(c.posts.first), throwsA(predicate((e) => e is FeedException && e.message == 'уже поделились')));
      f.failAction = false;
      await c.repost(c.posts.first, caption: 'Рекомендую');
      expect(f.calls, contains('repost:1:Рекомендую'));
    });
  });

  group('истории', () {
    test('своя группа отдельно; чужие: непросмотренные первыми', () async {
      final f = FakeFeed()
        ..storyGroups = [
          storyGroup(2, 'Анна', [story('1', viewed: true)]),
          storyGroup(9, 'Я', [story('2', by: 9)], me: true),
          storyGroup(3, 'Пётр', [story('3', by: 3)]),
        ];
      final c = make(f);
      await c.loadStories();
      expect(c.mine?.author.label, 'Я');
      expect(c.others.map((g) => g.author.label), ['Пётр', 'Анна']);
    });

    test('просмотр: кружок сереет сразу, на сервер уходит отметка', () async {
      final f = FakeFeed()..storyGroups = [storyGroup(3, 'Пётр', [story('3', by: 3)])];
      final c = make(f);
      await c.loadStories();
      c.storySeen(3, '3');
      expect(c.others.single.allSeen, isTrue);
      await Future<void>.delayed(Duration.zero);
      expect(f.calls, contains('view:3'));
    });

    test('удалили единственную историю — группа пропадает; одну из нескольких — остальные на месте', () async {
      final f = FakeFeed()
        ..storyGroups = [
          storyGroup(9, 'Я', [story('1', by: 9), story('2', by: 9)], me: true),
          storyGroup(3, 'Пётр', [story('3', by: 3)]),
        ];
      final c = make(f);
      await c.loadStories();
      c.storyDeleted('1');
      expect(c.mine?.stories.map((s) => s.id), ['2']);
      c.storyDeleted('2');
      expect(c.mine, isNull);
      expect(c.others, hasLength(1));
    });

    test('сбой загрузки историй не ломает ленту', () async {
      final f = FakeFeed()
        ..all = posts(2)
        ..failStories = true;
      final c = make(f);
      await c.load();
      await Future<void>.delayed(Duration.zero); // истории грузятся в фоне, параллельно ленте
      expect(c.posts, hasLength(2));
      expect(c.storiesLoaded, isTrue);
      expect(c.stories, isEmpty);
    });

    test('событие кеша по историям перечитывает их, по записям — нет', () async {
      final f = FakeFeed()..all = posts(2);
      final changes = StreamController<String>.broadcast();
      addTearDown(changes.close);
      final c = make(f, changes: changes.stream);
      await c.load();
      f.calls.clear();
      changes.add('/api/feed');
      await Future<void>.delayed(Duration.zero);
      expect(f.calls, isEmpty, reason: 'ленту из-за кеша не перетасовываем');
      changes.add('/api/stories');
      await Future<void>.delayed(Duration.zero);
      expect(f.calls, ['stories']);
    });
  });
}
