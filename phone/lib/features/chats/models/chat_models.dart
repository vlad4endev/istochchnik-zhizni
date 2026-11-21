import '../../../core/dates.dart';
import '../../../core/json.dart';

/// Реакция на сообщение: эмодзи, сколько человек и ставил ли её я.
class Reaction {
  const Reaction({required this.emoji, required this.count, required this.byMe});
  final String emoji;
  final int count;
  final bool byMe;

  static List<Reaction> parseList(Object? raw) => [
        for (final item in asList(raw))
          if (str(asMap(item)['emoji']).isNotEmpty)
            Reaction(
              emoji: str(asMap(item)['emoji']),
              count: asInt(asMap(item)['count']),
              byMe: asBool(asMap(item)['reacted_by_me']),
            ),
      ];
}

/// Цитата сообщения, на которое отвечают.
class ReplyPreview {
  const ReplyPreview({required this.id, required this.content, required this.senderName, required this.isDeleted});
  final String id;
  final String content;
  final String senderName;
  final bool isDeleted;

  static ReplyPreview? tryParse(Object? raw) {
    final m = asMap(raw);
    if (m.isEmpty || str(m['id']).isEmpty) return null;
    return ReplyPreview(
      id: str(m['id']),
      content: str(m['content']),
      senderName: str(m['sender_name']).trim(),
      isDeleted: asBool(m['is_deleted']),
    );
  }
}

/// Сообщение чата, разобранное из ответа сервера.
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.senderName,
    required this.content,
    required this.payloadType,
    required this.payload,
    required this.createdAt,
    this.replyTo,
    this.reactions = const [],
    this.isEdited = false,
    this.isDeleted = false,
    this.isPinned = false,
    this.forwarded = false,
    this.pollTallies = const [],
    this.pollMine = const [],
    this.pending = false,
  });

  final String id;
  final String conversationId;

  /// null — системное сообщение без автора (рассылка).
  final int? senderId;
  final String senderName;
  final String content;
  final String payloadType;
  final Map<String, dynamic> payload;
  final DateTime? createdAt;
  final ReplyPreview? replyTo;
  final List<Reaction> reactions;
  final bool isEdited;
  final bool isDeleted;
  final bool isPinned;
  final bool forwarded;
  final List<int> pollTallies;
  final List<int> pollMine;

  /// Ещё не подтверждено сервером (локальное сообщение).
  final bool pending;

  bool get isText => payloadType == 'text' || payloadType.isEmpty;

  ChatMessage copyWith({
    String? content,
    bool? isEdited,
    bool? isDeleted,
    List<Reaction>? reactions,
    bool? isPinned,
    List<int>? pollTallies,
    List<int>? pollMine,
  }) =>
      ChatMessage(
        id: id,
        conversationId: conversationId,
        senderId: senderId,
        senderName: senderName,
        content: content ?? this.content,
        payloadType: payloadType,
        payload: payload,
        createdAt: createdAt,
        replyTo: replyTo,
        reactions: reactions ?? this.reactions,
        isEdited: isEdited ?? this.isEdited,
        isDeleted: isDeleted ?? this.isDeleted,
        isPinned: isPinned ?? this.isPinned,
        forwarded: forwarded,
        pollTallies: pollTallies ?? this.pollTallies,
        pollMine: pollMine ?? this.pollMine,
        pending: pending,
      );

  static ChatMessage? tryParse(Object? raw) {
    final m = asMap(raw);
    final id = str(m['id']);
    if (id.isEmpty) return null;
    final first = str(m['sender_first_name']).trim();
    final last = str(m['sender_last_name']).trim();
    final named = str(m['sender_name']).trim();
    final full = '$first $last'.trim();
    final senderId = m['sender_id'] == null ? null : asInt(m['sender_id']);
    final payloadType = str(m['payload_type']);
    return ChatMessage(
      id: id,
      conversationId: str(m['conversation_id']),
      senderId: senderId == 0 ? null : senderId,
      senderName: named.isNotEmpty ? named : full,
      content: str(m['content']),
      payloadType: payloadType.isEmpty ? 'text' : payloadType,
      payload: asMap(m['payload']),
      createdAt: parseApiDate(m['created_at']),
      replyTo: ReplyPreview.tryParse(m['reply_preview']),
      reactions: Reaction.parseList(m['reactions']),
      isEdited: asBool(m['is_edited']),
      isDeleted: asBool(m['is_deleted']),
      isPinned: asBool(m['is_pinned']),
      forwarded: m['forwarded_from'] != null,
      pollTallies: [for (final t in asList(m['poll_tallies'])) asInt(t)],
      pollMine: [for (final t in asList(m['poll_my_options'])) asInt(t)],
    );
  }
}

/// Участник чата: имя, аватар, роль, «в сети».
class ChatMember {
  const ChatMember({
    required this.id,
    required this.name,
    this.avatarUrl,
    this.role = 'member',
    this.online = false,
    this.lastSeen,
  });

  final int id;
  final String name;
  final String? avatarUrl;
  final String role;
  final bool online;
  final DateTime? lastSeen;

  static ChatMember? tryParse(Object? raw) {
    final m = asMap(raw);
    final id = asInt(m['member_id'] ?? m['id']);
    if (id <= 0) return null;
    final full = '${str(m['first_name'])} ${str(m['last_name'])}'.trim();
    final avatar = str(m['avatar_url']).trim();
    return ChatMember(
      id: id,
      name: full.isNotEmpty ? full : str(m['name']).trim(),
      avatarUrl: avatar.isEmpty ? null : avatar,
      role: str(m['role']).isEmpty ? 'member' : str(m['role']),
      online: asBool(m['is_online']),
      lastSeen: parseApiDate(m['last_seen_at']),
    );
  }
}

/// Сведения о чате: тип, описание, мои права.
class ChatMeta {
  const ChatMeta({
    required this.type,
    this.title = '',
    this.avatarUrl,
    this.description = '',
    this.myRole = 'member',
    this.permissions = const {},
    this.hasPermissions = false,
  });

  final String type;
  final String title;
  final String? avatarUrl;
  final String description;
  final String myRole;
  final Map<String, bool> permissions;

  /// Сервер прислал права; иначе считаем, что можно всё (как в вебе).
  final bool hasPermissions;

  bool get isGroupLike => type == 'group' || type == 'channel';

  /// Писать можно, если права не пришли или `can_send_messages` не выключен явно.
  bool get canSend => !hasPermissions || permissions['can_send_messages'] != false;
  bool get canSendMedia => canSend && (!hasPermissions || permissions['can_send_media'] != false);
  bool get canPin => permissions['can_pin_messages'] == true;
  bool get isStaff => myRole == 'owner' || myRole == 'admin';

  factory ChatMeta.fromJson(Object? raw) {
    final m = asMap(raw);
    final perms = asMap(m['my_effective_permissions']);
    final avatar = str(m['avatar_url']).trim();
    return ChatMeta(
      type: str(m['type']).isEmpty ? 'private' : str(m['type']),
      title: str(m['title']).trim(),
      avatarUrl: avatar.isEmpty ? null : avatar,
      description: str(m['description']).trim(),
      myRole: str(m['my_role']).isEmpty ? 'member' : str(m['my_role']),
      permissions: {for (final e in perms.entries) e.key: e.value == true},
      hasPermissions: perms.isNotEmpty,
    );
  }
}

/// Профиль собеседника в личном чате.
class PrivateProfile {
  const PrivateProfile({
    required this.id,
    required this.name,
    this.avatarUrl,
    this.phone = '',
    this.appRoles = const [],
    this.ministryRoles = const [],
    this.directions = const [],
    this.birthDate,
    this.lastSeen,
  });

  final int id;
  final String name;
  final String? avatarUrl;
  final String phone;
  final List<String> appRoles;
  final List<String> ministryRoles;
  final List<String> directions;
  final DateTime? birthDate;
  final DateTime? lastSeen;

  bool get hasInfo => phone.isNotEmpty || birthDate != null || appRoles.isNotEmpty || ministryRoles.isNotEmpty || directions.isNotEmpty;

  static List<String> _list(Object? raw) =>
      [for (final p in str(raw).split(RegExp(r'[,;]+'))) if (p.trim().isNotEmpty) p.trim()];

  factory PrivateProfile.fromJson(Object? raw) {
    final m = asMap(raw);
    final full = '${str(m['first_name'])} ${str(m['last_name'])}'.trim();
    final avatar = str(m['avatar_url']).trim();
    final birth = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(str(m['birth_date']));
    return PrivateProfile(
      id: asInt(m['id']),
      name: full.isNotEmpty ? full : str(m['name']).trim(),
      avatarUrl: avatar.isEmpty ? null : avatar,
      phone: str(m['phone_number']).trim(),
      appRoles: _list(m['app_role']),
      ministryRoles: _list(m['ministry_role']),
      directions: _list(m['ministry_direction']),
      birthDate: birth == null ? null : DateTime(int.parse(birth.group(1)!), int.parse(birth.group(2)!), int.parse(birth.group(3)!)),
      lastSeen: parseApiDate(m['last_seen_at']),
    );
  }
}

/// Данные для карточки ссылки.
class LinkPreview {
  const LinkPreview({required this.url, required this.host, this.title = '', this.description = '', this.image, this.siteName = ''});

  final String url;
  final String host;
  final String title;
  final String description;
  final String? image;
  final String siteName;

  String get site => siteName.isNotEmpty ? siteName : host;

  /// Карточка без заголовка и описания ничего не даёт — не показываем.
  bool get isUseful => title.isNotEmpty || description.isNotEmpty || image != null;

  static LinkPreview? tryParse(Object? raw) {
    final m = asMap(asMap(raw)['preview']);
    if (m.isEmpty || str(m['url']).isEmpty) return null;
    final image = str(m['image']).trim();
    return LinkPreview(
      url: str(m['url']),
      host: str(m['host']),
      title: str(m['title']).trim(),
      description: str(m['description']).trim(),
      image: image.isEmpty ? null : image,
      siteName: str(m['siteName']).trim(),
    );
  }
}

/// Кто прочитал сообщение.
class Reader {
  const Reader({required this.id, required this.name, this.avatarUrl, this.readAt});
  final int id;
  final String name;
  final String? avatarUrl;
  final DateTime? readAt;
}

/// Ответ «кто прочитал»: читатели и сколько всего других участников в чате.
class Readers {
  const Readers({required this.readers, required this.otherCount});
  final List<Reader> readers;
  final int otherCount;

  factory Readers.fromJson(Object? raw) {
    final m = asMap(raw);
    String? avatar(Object? v) => str(v).trim().isEmpty ? null : str(v).trim();
    return Readers(
      readers: [
        for (final item in asList(m['readers']))
          if (asInt(asMap(item)['member_id']) > 0)
            Reader(
              id: asInt(asMap(item)['member_id']),
              name: str(asMap(item)['display_name']).trim(),
              avatarUrl: avatar(asMap(item)['avatar_url']),
              readAt: parseApiDate(asMap(item)['read_at']),
            ),
      ],
      otherCount: asInt(m['other_member_count']),
    );
  }
}
