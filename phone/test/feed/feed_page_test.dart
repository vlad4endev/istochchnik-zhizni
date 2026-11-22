import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:molitva/core/session.dart';
import 'package:molitva/core/theme.dart';
import 'package:molitva/features/chats/logic/attachment_logic.dart';
import 'package:molitva/features/feed/compose_page.dart';
import 'package:molitva/features/feed/feed_page.dart';
import 'package:molitva/features/feed/models/feed_models.dart';
import 'package:provider/provider.dart';

import 'fake_feed.dart';

class FakePicker implements FeedMediaPicker {
  List<PickedAttachment> galleryNow = const [];
  PickedAttachment? photoNow;
  PickedAttachment? videoNow;
  List<PickedAttachment> filesNow = const [];
  bool fail = false;
  final calls = <String>[];

  @override
  Future<List<PickedAttachment>> gallery({required int limit}) async {
    calls.add('gallery:$limit');
    if (fail) throw StateError('нет доступа');
    return galleryNow;
  }

  @override
  Future<PickedAttachment?> takePhoto() async {
    calls.add('photo');
    return photoNow;
  }

  @override
  Future<PickedAttachment?> takeVideo() async {
    calls.add('video');
    return videoNow;
  }

  @override
  Future<List<PickedAttachment>> files() async {
    calls.add('files');
    return filesNow;
  }
}

SessionController _session() {
  final s = SessionController();
  s.user = AppUser(id: 9, name: 'Мария Лис', firstName: 'Мария', lastName: 'Лис', role: 'member', roles: const ['member'], registrationStatus: 'active');
  return s;
}

Widget host(Widget home, {double width = 360, double scale = 1}) => ChangeNotifierProvider.value(
      value: _session(),
      child: MaterialApp(theme: churchTheme(brightness: Brightness.light), home: MediaQuery(data: MediaQueryData(size: Size(width, 760), textScaler: TextScaler.linear(scale)), child: home)),
    );

PostMedia photo(int i) => PostMedia(url: 'https://x/$i.jpg', isVideo: false);

void main() {
  setUpAll(() => initializeDateFormatting('ru'));

  Future<void> open(WidgetTester tester, FakeFeed feed, {double width = 360, double scale = 1, Duration poll = const Duration(seconds: 45), FakePicker? picker}) async {
    tester.view.physicalSize = Size(width, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(host(FeedPage(source: feed, checkInterval: poll, mediaPicker: picker), width: width, scale: scale));
    await tester.pumpAndSettle();
  }

  group('список', () {
    testWidgets('записи автора, подпись и счётчики; истории над лентой', (tester) async {
      final feed = FakeFeed()
        ..all = [post('1', caption: 'Благодарим за встречу!', likes: 3, comments: 2)]
        ..storyGroups = [storyGroup(3, 'Пётр Иванов', [story('1', by: 3)])];
      await open(tester, feed);
      expect(find.text('Благодарим за встречу!'), findsOneWidget);
      expect(find.text('Анна Орлова'), findsWidgets);
      expect(find.byKey(const ValueKey('stories-bar')), findsOneWidget);
      expect(find.byKey(const ValueKey('story-3')), findsOneWidget);
      expect(find.text('Смотреть все: 2 комментария'), findsOneWidget);
      expect(find.text('3 отметки «нравится»'), findsOneWidget);
    });

    testWidgets('пока грузится — заглушки, не пустой экран', (tester) async {
      final feed = FakeFeed()
        ..all = [post('1')]
        ..gate = Completer<void>();
      tester.view.physicalSize = const Size(360, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(host(FeedPage(source: feed)));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byKey(const ValueKey('feed-skeleton')), findsOneWidget);
      feed.gate!.complete();
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('feed-skeleton')), findsNothing);
      expect(find.text('Текст записи'), findsOneWidget);
    });

    testWidgets('пусто — подсказка, истории остаются', (tester) async {
      await open(tester, FakeFeed());
      expect(find.text('В ленте пока нет записей'), findsOneWidget);
      expect(find.byKey(const ValueKey('stories-bar')), findsOneWidget);
    });

    testWidgets('нет сети при первой загрузке — понятная ошибка и «Повторить»', (tester) async {
      final feed = FakeFeed()
        ..all = [post('1')]
        ..failFeed = true;
      await open(tester, feed);
      expect(find.textContaining('нет связи'), findsOneWidget);
      feed.failFeed = false;
      await tester.tap(find.text('Повторить'));
      await tester.pumpAndSettle();
      expect(find.text('Текст записи'), findsOneWidget);
    });

    testWidgets('длинная подпись сворачивается; «ещё» раскрывает', (tester) async {
      final long = 'Очень длинная подпись. ' * 20;
      await open(tester, FakeFeed()..all = [post('1', caption: long)]);
      expect(find.byKey(const ValueKey('post-expand')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('post-expand')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('post-expand')), findsNothing);
    });

    testWidgets('короткая подпись — без «ещё»', (tester) async {
      await open(tester, FakeFeed()..all = [post('1', caption: 'Коротко')]);
      expect(find.byKey(const ValueKey('post-expand')), findsNothing);
    });
  });

  group('лайки', () {
    testWidgets('тап по сердцу — сразу красное и +1; повтор снимает', (tester) async {
      final feed = FakeFeed()..all = [post('1', likes: 2)];
      await open(tester, feed);
      await tester.tap(find.byKey(const ValueKey('post-like')));
      await tester.pump();
      expect(find.byIcon(Icons.favorite_rounded), findsOneWidget);
      expect(find.text('3 отметки «нравится»'), findsOneWidget);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('post-like')));
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.favorite_border_rounded), findsOneWidget);
      expect(feed.calls.where((c) => c.startsWith('like')), ['like:1:true', 'like:1:false']);
    });

    testWidgets('сбой лайка — откат и сообщение, лента не перезагружается', (tester) async {
      final feed = FakeFeed()
        ..all = [post('1', likes: 2)]
        ..failLike = true;
      await open(tester, feed);
      feed.calls.clear();
      await tester.tap(find.byKey(const ValueKey('post-like')));
      await tester.pumpAndSettle();
      expect(find.text('не вышло'), findsOneWidget);
      expect(find.text('2 отметки «нравится»'), findsOneWidget);
      expect(feed.calls.where((c) => c.startsWith('feed')), isEmpty);
    });

    testWidgets('двойной тап по фото ставит «нравится» и не снимает его повторным', (tester) async {
      final feed = FakeFeed()..all = [post('1', media: [photo(1)])];
      await open(tester, feed);
      await tester.tap(find.byKey(const ValueKey('post-media')));
      await tester.pump(const Duration(milliseconds: 60));
      await tester.tap(find.byKey(const ValueKey('post-media')));
      await tester.pumpAndSettle();
      expect(feed.calls.where((c) => c.startsWith('like')), ['like:1:true']);
      await tester.tap(find.byKey(const ValueKey('post-media')));
      await tester.pump(const Duration(milliseconds: 60));
      await tester.tap(find.byKey(const ValueKey('post-media')));
      await tester.pumpAndSettle();
      expect(feed.calls.where((c) => c.startsWith('like')), ['like:1:true'], reason: 'второй двойной тап «нравится» не снимает');
    });

    testWidgets('тап по «N отметок» открывает список тех, кому понравилось', (tester) async {
      final feed = FakeFeed()
        ..all = [post('1', likes: 2)]
        ..likerList = [Liker(author: person(2, 'Анна Орлова'), likedAt: DateTime.now()), Liker(author: person(3, 'Пётр Иванов'), likedAt: DateTime.now())];
      await open(tester, feed);
      await tester.tap(find.byKey(const ValueKey('post-likers')));
      await tester.pumpAndSettle();
      expect(find.text('Нравится · 2'), findsOneWidget);
      expect(find.text('Пётр Иванов'), findsOneWidget);
    });
  });

  group('медиа', () {
    testWidgets('несколько фото — карусель со счётчиком «1/3» и точками; листается', (tester) async {
      await open(tester, FakeFeed()..all = [post('1', media: [photo(1), photo(2), photo(3)])]);
      expect(find.text('1/3'), findsOneWidget);
      await tester.drag(find.byKey(const ValueKey('post-media')), const Offset(-300, 0));
      await tester.pumpAndSettle();
      expect(find.text('2/3'), findsOneWidget);
    });

    testWidgets('одно фото — счётчика нет; видео — кнопка воспроизведения', (tester) async {
      await open(tester, FakeFeed()..all = [post('1', media: [photo(1)]), post('2', media: [const PostMedia(url: 'https://x/v.mp4', isVideo: true)])]);
      expect(find.byKey(const ValueKey('post-media-counter')), findsNothing);
      expect(find.byIcon(Icons.play_arrow_rounded), findsOneWidget);
    });

    testWidgets('репост показывает исходную запись во вложении', (tester) async {
      final shared = EmbeddedPost(id: '9', author: person(3, 'Пётр Иванов'), caption: 'Исходный текст', createdAt: DateTime.now(), media: const []);
      await open(tester, FakeFeed()..all = [post('1', caption: 'Согласен', shared: shared)]);
      expect(find.byKey(const ValueKey('post-embedded')), findsOneWidget);
      expect(find.text('Исходный текст'), findsOneWidget);
      expect(find.textContaining('поделился(-ась) записью'), findsOneWidget);
    });
  });

  group('меню автора', () {
    testWidgets('у чужой записи меню «⋯» нет, у своей — есть', (tester) async {
      await open(tester, FakeFeed()..all = [post('1', by: 2), post('2', by: 9, name: 'Мария Лис')]);
      expect(find.byKey(const ValueKey('post-menu')), findsOneWidget);
    });

    testWidgets('«Изменить подпись» сохраняет новый текст', (tester) async {
      final feed = FakeFeed()..all = [post('1', by: 9, name: 'Мария Лис', caption: 'Старый')];
      await open(tester, feed);
      await tester.tap(find.byKey(const ValueKey('post-menu')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Изменить подпись'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('edit-caption')), 'Новый');
      await tester.tap(find.byKey(const ValueKey('edit-save')));
      await tester.pumpAndSettle();
      expect(feed.calls, contains('edit:1:Новый'));
      expect(find.text('Новый'), findsOneWidget);
    });

    testWidgets('удаление: сначала подтверждение; «Отмена» ничего не удаляет', (tester) async {
      final feed = FakeFeed()..all = [post('1', by: 9, name: 'Мария Лис', caption: 'Моя запись')];
      await open(tester, feed);
      await tester.tap(find.byKey(const ValueKey('post-menu')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Удалить запись'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('delete-cancel')));
      await tester.pumpAndSettle();
      expect(find.text('Моя запись'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('post-menu')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Удалить запись'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('delete-ok')));
      await tester.pumpAndSettle();
      expect(find.text('Моя запись'), findsNothing);
      expect(feed.calls, contains('delete:1'));
    });
  });

  group('репост', () {
    testWidgets('«Поделиться»: комментарий необязателен, запись уходит в вашу ленту', (tester) async {
      final feed = FakeFeed()..all = [post('1')];
      await open(tester, feed);
      await tester.tap(find.byKey(const ValueKey('post-repost')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('repost-caption')), 'Рекомендую');
      await tester.tap(find.byKey(const ValueKey('repost-send')));
      await tester.pumpAndSettle();
      expect(feed.calls, contains('repost:1:Рекомендую'));
      expect(find.text('Запись добавлена в вашу ленту'), findsOneWidget);
    });

    testWidgets('ошибка репоста показывается текстом сервера', (tester) async {
      final feed = FakeFeed()
        ..all = [post('1')]
        ..failAction = true;
      await open(tester, feed);
      await tester.tap(find.byKey(const ValueKey('post-repost')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('repost-send')));
      await tester.pumpAndSettle();
      expect(find.text('уже поделились'), findsOneWidget);
    });
  });

  group('бесконечная прокрутка и порядок', () {
    testWidgets('докрутили до конца — подгружается следующая страница; в самом конце «Вы посмотрели всё»', (tester) async {
      final feed = FakeFeed()
        ..all = [for (var i = 1; i <= 7; i++) post('$i', caption: 'Запись $i')]
        ..pageSize = 3;
      await open(tester, feed);
      expect(find.text('Запись 7'), findsNothing);
      for (var i = 0; i < 8; i++) {
        await tester.drag(find.byKey(const ValueKey('feed-list')), const Offset(0, -2500));
        await tester.pumpAndSettle();
      }
      expect(feed.calls.where((c) => c.startsWith('feed:3')), isNotEmpty, reason: 'запросили вторую страницу');
      expect(find.byKey(const ValueKey('feed-end')), findsOneWidget);
    });

    testWidgets('не удалось догрузить — внизу «повторить», и повтор работает', (tester) async {
      final feed = FakeFeed()
        ..all = [for (var i = 1; i <= 7; i++) post('$i')]
        ..pageSize = 3
        ..failMore = true;
      await open(tester, feed);
      for (var i = 0; i < 4; i++) {
        await tester.drag(find.byKey(const ValueKey('feed-list')), const Offset(0, -2500));
        await tester.pumpAndSettle();
      }
      expect(find.byKey(const ValueKey('feed-more-retry')), findsOneWidget);
      feed.failMore = false;
      await tester.tap(find.byKey(const ValueKey('feed-more-retry')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('feed-more-retry')), findsNothing);
    });

    testWidgets('переключение «Для вас / Новые» перезагружает ленту с новым порядком', (tester) async {
      final feed = FakeFeed()..all = [post('1')];
      await open(tester, feed);
      feed.calls.clear();
      await tester.tap(find.byKey(const ValueKey('feed-sort')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Новые'));
      await tester.pumpAndSettle();
      expect(feed.calls.first, 'feed::recent');
      expect(find.text('Сначала новые'), findsOneWidget);
    });

    testWidgets('«Новые записи»: плашка появляется, по тапу лента обновляется и плашка уходит', (tester) async {
      final feed = FakeFeed()..all = [post('1')];
      await open(tester, feed, poll: const Duration(seconds: 1));
      expect(find.byKey(const ValueKey('feed-new-pill')), findsNothing);
      feed.unread = 3;
      await tester.pump(const Duration(seconds: 2));
      await tester.pump();
      expect(find.text('Новые записи · 3'), findsOneWidget);
      feed.calls.clear();
      await tester.tap(find.byKey(const ValueKey('feed-new-pill')));
      await tester.pumpAndSettle();
      expect(feed.calls.first, startsWith('feed:'));
      expect(find.byKey(const ValueKey('feed-new-pill')), findsNothing);
    });
  });

  group('комментарии', () {
    testWidgets('шторка: список с лайками; новый комментарий появляется сразу и увеличивает счётчик под записью', (tester) async {
      final feed = FakeFeed()
        ..all = [post('1', comments: 1)]
        ..commentList = [FeedComment(id: '5', postId: '1', memberId: 2, text: 'Аминь!', createdAt: DateTime.now(), author: person(2, 'Анна Орлова'))];
      await open(tester, feed);
      await tester.tap(find.byKey(const ValueKey('post-open-comments')));
      await tester.pumpAndSettle();
      expect(find.text('Аминь!'), findsOneWidget);
      expect(feed.calls.where((c) => c.startsWith('comments')), hasLength(1));
      await tester.enterText(find.byKey(const ValueKey('comment-field')), 'Спасибо за запись');
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('comment-send')));
      await tester.pumpAndSettle();
      expect(find.text('Спасибо за запись'), findsOneWidget);
      expect(feed.calls, contains('addComment:1:Спасибо за запись'));
      expect(feed.calls.where((c) => c.startsWith('comments')), hasLength(1), reason: 'не перезапрашиваем список при каждой перерисовке');
    });

    testWidgets('лайк комментария: сразу на экране, при сбое откат', (tester) async {
      final feed = FakeFeed()
        ..all = [post('1', comments: 1)]
        ..commentList = [FeedComment(id: '5', postId: '1', memberId: 2, text: 'Аминь!', createdAt: DateTime.now(), author: person(2, 'Анна'), likeCount: 1)];
      await open(tester, feed);
      await tester.tap(find.byKey(const ValueKey('post-open-comments')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('comment-like-5')));
      await tester.pumpAndSettle();
      expect(find.text('2'), findsOneWidget);
      feed.failLike = true;
      await tester.tap(find.byKey(const ValueKey('comment-like-5')));
      await tester.pumpAndSettle();
      expect(find.text('2'), findsOneWidget, reason: 'сбой — осталось как было');
      expect(find.text('не вышло'), findsOneWidget);
    });

    testWidgets('удалить можно свой комментарий (с подтверждением); чужой — нельзя', (tester) async {
      final feed = FakeFeed()
        ..all = [post('1', comments: 2)]
        ..commentList = [
          FeedComment(id: '5', postId: '1', memberId: 2, text: 'Чужой', createdAt: DateTime.now(), author: person(2, 'Анна')),
          FeedComment(id: '6', postId: '1', memberId: 9, text: 'Мой', createdAt: DateTime.now(), author: person(9, 'Мария Лис')),
        ];
      await open(tester, feed);
      await tester.tap(find.byKey(const ValueKey('post-open-comments')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('comment-del-5')), findsNothing);
      await tester.tap(find.byKey(const ValueKey('comment-del-6')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('comment-delete-ok')));
      await tester.pumpAndSettle();
      expect(find.text('Мой'), findsNothing);
      expect(feed.calls, contains('delComment:6'));
    });

    testWidgets('автор записи может удалить любой комментарий', (tester) async {
      final feed = FakeFeed()
        ..all = [post('1', by: 9, name: 'Мария Лис', comments: 1)]
        ..commentList = [FeedComment(id: '5', postId: '1', memberId: 2, text: 'Чужой', createdAt: DateTime.now(), author: person(2, 'Анна'))];
      await open(tester, feed);
      await tester.tap(find.byKey(const ValueKey('post-open-comments')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('comment-del-5')), findsOneWidget);
    });

    testWidgets('нет сети — «Повторить» в шторке; пусто — приглашение', (tester) async {
      final feed = FakeFeed()
        ..all = [post('1', comments: 1)]
        ..failComments = true;
      await open(tester, feed);
      await tester.tap(find.byKey(const ValueKey('post-comment')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('comments-retry')), findsOneWidget);
      feed.failComments = false;
      await tester.tap(find.byKey(const ValueKey('comments-retry')));
      await tester.pumpAndSettle();
      expect(find.text('Комментариев пока нет'), findsOneWidget);
    });
  });

  group('вёрстка', () {
    testWidgets('320 px и шрифт 2.0: лента с картинками, историями и меню — без переполнений', (tester) async {
      final feed = FakeFeed()
        ..all = [post('1', by: 9, name: 'Мария Лис с очень длинным именем для проверки переноса', caption: 'Подпись ' * 30, likes: 1200, comments: 15, media: [photo(1), photo(2)])]
        ..storyGroups = [storyGroup(3, 'Пётр', [story('1', by: 3)]), storyGroup(9, 'Я', [story('2', by: 9)], me: true)];
      await open(tester, feed, width: 320, scale: 2);
      expect(tester.takeException(), isNull);
    });
  });
}
