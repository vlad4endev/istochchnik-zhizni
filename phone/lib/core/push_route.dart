/// Куда вести по нажатию на пуш: разбор данных, которые сервер кладёт в уведомление
/// (`type`, `kind`, `url` — путь на сайте, `conversationId`).
enum PushDestination { none, home, prayer, feed, chat, schedule, studio, sermons, events, broadcast, service, calls, web }

class PushTarget {
  const PushTarget(this.destination, {this.conversationId = '', this.webPath = ''});

  final PushDestination destination;

  /// Для [PushDestination.chat].
  final String conversationId;

  /// Для [PushDestination.web]: путь на сайте (`/service-plan/sermon-comments/…`).
  final String webPath;

  @override
  bool operator ==(Object other) => other is PushTarget && other.destination == destination && other.conversationId == conversationId && other.webPath == webPath;

  @override
  int get hashCode => Object.hash(destination, conversationId, webPath);

  @override
  String toString() => 'PushTarget($destination, $conversationId, $webPath)';
}

String _s(Object? v) => '${v ?? ''}'.trim();

/// Разбор данных пуша. Сначала смысл по `type`/`kind`, затем по пути `url`; неизвестное — [PushDestination.none]
/// (приложение просто открывается).
PushTarget resolvePushTarget(Map<String, dynamic> data) {
  final type = _s(data['type']).toLowerCase();
  final kind = _s(data['kind']).toLowerCase();
  final url = _s(data['url']);
  final path = url.split('?').first.toLowerCase();

  var conversationId = _s(data['conversationId']);
  if (conversationId.isEmpty && url.contains('conversationId=')) {
    conversationId = Uri.tryParse(url.startsWith('/') ? 'https://x$url' : url)?.queryParameters['conversationId'] ?? '';
  }
  if (conversationId.isNotEmpty) return PushTarget(PushDestination.chat, conversationId: conversationId);

  bool has(String s) => type.contains(s) || kind.contains(s);

  if (type == 'push_test' || type == 'incoming_call') return const PushTarget(PushDestination.none);
  if (type.startsWith('call_') && type != 'call_ended' && type != 'call_cancelled') return const PushTarget(PushDestination.calls);
  if (has('broadcast')) return const PushTarget(PushDestination.broadcast);
  if (has('new_event')) return const PushTarget(PushDestination.events);
  if (has('new_sermon')) return const PushTarget(PushDestination.sermons);
  if (has('sermon_feedback') || path.startsWith('/service-plan/sermon-comments')) return PushTarget(PushDestination.web, webPath: url);
  if (has('planner_setlist') || path.startsWith('/songbook/setlists')) return const PushTarget(PushDestination.studio);
  if (has('service_plan')) return const PushTarget(PushDestination.service);
  if (has('music_') || has('media_') || path.startsWith('/music-schedule') || path.startsWith('/media-schedule')) {
    return const PushTarget(PushDestination.schedule);
  }
  if (has('prayer') || has('curator') || has('coordinator') || path == '/prayer' || path == '/calendar') {
    return const PushTarget(PushDestination.prayer);
  }
  if (has('feed') || path == '/feed') return const PushTarget(PushDestination.feed);
  if (has('birthday') || has('system_update') || has('member_joined') || path == '/dashboard') return const PushTarget(PushDestination.home);
  if (path == '/sermons') return const PushTarget(PushDestination.sermons);
  return const PushTarget(PushDestination.none);
}

/// Какие сохранённые разделы устарели, когда пришёл такой пуш: их перепроверяют сразу,
/// чтобы к нажатию на уведомление (и на открытом экране) новое уже было на месте.
List<String> cachePrefixesFor(PushTarget target) => switch (target.destination) {
      PushDestination.prayer || PushDestination.home => const ['/api/calendar'],
      PushDestination.feed => const ['/api/feed', '/api/stories'],
      PushDestination.sermons => const ['/api/resources', '/api/sermon-notes'],
      PushDestination.events => const ['/api/calendar/events'],
      PushDestination.broadcast => const ['/api/broadcasts'],
      PushDestination.service ||
      PushDestination.schedule ||
      PushDestination.studio =>
        const ['/api/service-plans', '/api/sunday-schedule', '/api/media-schedule', '/api/music-schedule', '/api/studio'],
      PushDestination.calls => const ['/api/calls/history'],
      PushDestination.chat => const ['/api/messenger/conversations'],
      PushDestination.web || PushDestination.none => const [],
    };
