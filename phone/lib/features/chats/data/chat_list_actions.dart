import '../../../core/session.dart';

/// Действия над чатом из списка. Интерфейс нужен тестам: экран не знает про Dio.
abstract class ChatListActions {
  Future<void> setPinned(String conversationId, bool pinned);
  Future<void> setMuted(String conversationId, bool muted);
  Future<void> clearHistory(String conversationId);

  /// Выйти из чата; создатель группы или канала этим удаляет его у всех.
  Future<void> leave(String conversationId);
}

class ServerChatListActions implements ChatListActions {
  ServerChatListActions(this.session);
  final SessionController session;

  static const _base = '/api/messenger/conversations';

  String _id(String id) => Uri.encodeComponent(id);

  @override
  Future<void> setPinned(String conversationId, bool pinned) async {
    await session.dio.patch<Object?>('$_base/${_id(conversationId)}/my-ui', data: {'uiPinned': pinned});
  }

  @override
  Future<void> setMuted(String conversationId, bool muted) async {
    await session.dio.patch<Object?>('$_base/${_id(conversationId)}/my-ui', data: {'muted': muted});
  }

  @override
  Future<void> clearHistory(String conversationId) async {
    await session.dio.post<Object?>('$_base/${_id(conversationId)}/clear-history');
  }

  @override
  Future<void> leave(String conversationId) async {
    final me = session.user?.id;
    if (me == null) throw StateError('нет текущего пользователя');
    await session.dio.delete<Object?>('$_base/${_id(conversationId)}/participants/$me');
  }
}
