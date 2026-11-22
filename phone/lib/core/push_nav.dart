import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../features/broadcast/broadcast_page.dart';
import '../features/calls/calls_page.dart';
import '../features/chats/thread_page.dart';
import '../features/events/events_page.dart';
import '../features/schedule/schedule_page.dart';
import '../features/sermons/sermons_page.dart';
import '../features/service/service_page.dart';
import '../features/studio/studio_page.dart';
import 'nav.dart';
import 'push_route.dart';
import 'session.dart';

/// Открывает нужное место приложения по нажатию на пуш: вкладку, раздел, чат или страницу на сайте.
/// Если приложение ещё запускается или человек не вошёл, переход откладывается до готовности.
class PushNavigator extends ChangeNotifier {
  PushNavigator._();
  static final PushNavigator instance = PushNavigator._();

  SessionController? _session;
  PushTarget? _pending;
  String? _pendingTitle;

  /// Вкладка, которую просит открыть пуш (слушает оболочка с нижним меню).
  String? requestedTab;

  void attach(SessionController session) => _session = session;

  /// [title] — заголовок уведомления, пригодится как название чата.
  void open(PushTarget target, {String? title}) {
    if (target.destination == PushDestination.none) return;
    if (!_ready) {
      _pending = target;
      _pendingTitle = title;
      return;
    }
    _go(target, title);
  }

  bool get _ready => navigatorKey.currentState != null && _session?.user != null && _shellReady;

  bool _shellReady = false;

  /// Оболочка с вкладками построена: можно выполнять отложенный переход.
  void shellReady() {
    _shellReady = true;
    final target = _pending;
    if (target == null) return;
    final title = _pendingTitle;
    _pending = null;
    _pendingTitle = null;
    _go(target, title);
  }

  void shellGone() => _shellReady = false;

  void _tab(String id) {
    requestedTab = id;
    notifyListeners();
  }

  void _go(PushTarget t, String? title) {
    final nav = navigatorKey.currentState;
    final session = _session;
    if (nav == null || session == null) return;
    // Закрываем открытые страницы, чтобы вкладка или раздел были на виду.
    nav.popUntil((route) => route.isFirst);

    void page(Widget Function() build) => nav.push(MaterialPageRoute<void>(builder: (_) => build()));

    switch (t.destination) {
      case PushDestination.none:
        break;
      case PushDestination.home:
        _tab('home');
      case PushDestination.prayer:
        _tab('prayer');
      case PushDestination.feed:
        _tab('feed');
      case PushDestination.chat:
        page(() => ThreadPage(conversationId: t.conversationId, title: (title == null || title.isEmpty) ? 'Чат' : title));
      case PushDestination.schedule:
        page(SchedulePage.new);
      case PushDestination.studio:
        session.canOpen('studio') ? page(StudioPage.new) : _tab('home');
      case PushDestination.sermons:
        session.canOpen('sermons') ? page(SermonsPage.new) : _tab('home');
      case PushDestination.events:
        page(EventsPage.new);
      case PushDestination.broadcast:
        page(BroadcastPage.new);
      case PushDestination.service:
        session.canOpen('service_planner') ? page(ServicePage.new) : _tab('home');
      case PushDestination.calls:
        page(CallsPage.new);
      case PushDestination.web:
        final path = t.webPath.startsWith('/') ? t.webPath : '/${t.webPath}';
        final uri = Uri.tryParse(t.webPath.startsWith('http') ? t.webPath : '${session.apiOrigin}$path');
        if (uri != null) launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}
