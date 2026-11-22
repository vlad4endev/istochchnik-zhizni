/// Сообщение для экрана, если звонок по данным сервера уже закончился; null — идёт.
String? endMessageForStatus(String status) {
  return switch (status) {
    'declined' => 'Собеседник отклонил звонок',
    'missed' => 'Собеседник не ответил',
    'cancelled' => 'Звонок отменён',
    'ended' || 'failed' => 'Звонок завершён',
    _ => null,
  };
}

/// Событие сокета → сообщение (null — событие не про окончание звонка).
String? endMessageForEvent(String type, {String? reason}) {
  switch (type) {
    case 'call:rejected':
      return 'Собеседник отклонил звонок';
    case 'call:cancelled':
      return 'Звонок отменён';
    case 'call:ended':
      // Служебная очистка «призраков» во время переподключения звонок не завершает.
      if (reason == 'ghost_cleanup') return null;
      return reason == 'no_answer' ? 'Собеседник не ответил' : 'Звонок завершён';
  }
  return null;
}

/// Подпись, пока ждём ответа: для исходящего личного звонка — «Вызываем…», для встречи — ждём участников.
String waitingStatus({required bool direct, required bool outgoing}) {
  if (direct) return outgoing ? 'Вызываем…' : 'Ждём собеседника…';
  return 'Ждём участников';
}
