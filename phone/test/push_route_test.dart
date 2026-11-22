import 'package:flutter_test/flutter_test.dart';
import 'package:molitva/core/push_route.dart';

PushTarget _t(Map<String, String> data) => resolvePushTarget(data);

void main() {
  test('напоминания из правил сервера: молитва, дни рождения, трансляция, проповедь, событие, обновление', () {
    expect(_t({'type': 'prayer_reminder', 'kind': 'prayer_reminder', 'url': '/prayer'}).destination, PushDestination.prayer);
    expect(_t({'type': 'birthday_today', 'kind': 'birthday_today', 'url': '/dashboard'}).destination, PushDestination.home);
    expect(_t({'type': 'birthday_week', 'kind': 'birthday_week', 'url': '/dashboard'}).destination, PushDestination.home);
    expect(_t({'type': 'broadcast_start', 'kind': 'broadcast', 'url': '/dashboard'}).destination, PushDestination.broadcast);
    expect(_t({'type': 'new_sermon', 'kind': 'new_sermon', 'url': '/sermons'}).destination, PushDestination.sermons);
    expect(_t({'type': 'new_event', 'kind': 'new_event', 'url': '/dashboard'}).destination, PushDestination.events);
    expect(_t({'type': 'system_update', 'kind': 'system_update', 'url': '/dashboard'}).destination, PushDestination.home);
  });

  test('координаторам и кураторам: молитвенные напоминания и назначения', () {
    for (final type in ['coordinator_week_digest', 'coordinator_missing_need_tomorrow', 'coordinator_missing_need_today_escalation', 'curator_assignment_by_pastor', 'curator_week_assignments_manual', 'prayer_coordinator_update']) {
      expect(_t({'type': type, 'url': '/calendar'}).destination, PushDestination.prayer, reason: type);
    }
  });

  test('проповедникам: комментарии к проповеди — на сайт, назначения в плане — в «Служение»', () {
    final t = _t({'type': 'sermon_feedback_ready', 'url': '/service-plan/sermon-comments/abc123'});
    expect(t.destination, PushDestination.web);
    expect(t.webPath, '/service-plan/sermon-comments/abc123');
    expect(_t({'type': 'service_plan_preacher_assigned', 'url': '/dashboard'}).destination, PushDestination.service);
    expect(_t({'type': 'service_plan_leader_assigned'}).destination, PushDestination.service);
  });

  test('служение: назначения и напоминания медиа и музыки, сетлист из плана', () {
    for (final type in ['media_assignment', 'media_cancellation', 'media_assignment_declined', 'media_reminder', 'music_assignment', 'music_cancellation', 'music_reminder']) {
      expect(_t({'type': type, 'url': '/media-schedule/my'}).destination, PushDestination.schedule, reason: type);
    }
    expect(_t({'type': 'planner_setlist_ready', 'url': '/songbook/setlists/12?welcome=planner'}).destination, PushDestination.studio);
  });

  test('лента: лайки, комментарии, репосты, новые публикации', () {
    for (final kind in ['feed_like', 'feed_comment', 'feed_repost', 'feed_new_post']) {
      expect(_t({'kind': kind, 'type': kind, 'url': '/feed'}).destination, PushDestination.feed, reason: kind);
    }
  });

  test('сообщения: чат определяется по conversationId или по ссылке', () {
    expect(_t({'conversationId': '42', 'type': 'message'}), const PushTarget(PushDestination.chat, conversationId: '42'));
    expect(_t({'url': '/messenger?conversationId=77'}), const PushTarget(PushDestination.chat, conversationId: '77'));
    expect(_t({'url': 'https://app.example/messenger?conversationId=88'}).conversationId, '88');
  });

  test('звонки и служебное', () {
    expect(_t({'type': 'call_declined'}).destination, PushDestination.calls);
    expect(_t({'type': 'call_missed'}).destination, PushDestination.calls);
    expect(_t({'type': 'incoming_call'}).destination, PushDestination.none);
    expect(_t({'type': 'call_ended'}).destination, PushDestination.none);
    expect(_t({'type': 'push_test', 'url': '/profile'}).destination, PushDestination.none);
    expect(_t({'type': 'member_joined'}).destination, PushDestination.home);
  });

  test('неизвестное — просто открыть приложение', () {
    expect(_t({}).destination, PushDestination.none);
    expect(_t({'type': 'что-то новое', 'url': '/unknown'}).destination, PushDestination.none);
  });
}
