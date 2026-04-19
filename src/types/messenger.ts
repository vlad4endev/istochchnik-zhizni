/** Messenger domain types shared across services, routes, and realtime. */

export type ConversationType = 'private' | 'group' | 'channel';
export type ParticipantRole = 'owner' | 'admin' | 'member';

export type PermissionKey =
  | 'can_send_messages'
  | 'can_send_media'
  | 'can_add_users'
  | 'can_pin_messages'
  | 'can_manage_chat';

export type PermissionsJson = Partial<Record<PermissionKey, boolean>>;

export interface ConversationRow {
  id: string; // bigint comes as string from pg
  type: ConversationType;
  title: string | null;
  avatar_url: string | null;
  default_permissions?: PermissionsJson;
  settings?: Record<string, unknown>;
  /** Smart folders, defaults, and other chat-level JSON config */
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type MessagePayloadType =
  | 'text'
  | 'prayer_request'
  | 'audio'
  | 'image'
  | 'file'
  | 'poll'
  | 'access_request';

export interface ParticipantRow {
  conversation_id: string;
  member_id: number;
  role: ParticipantRole;
  permissions?: PermissionsJson;
  joined_at: string;
  muted_until?: string | null;
  left_at: string | null;
}

/** Structured extras for rich message types (text body, prayer card, audio + transcript). */
export type MessagePayload = Record<string, unknown>;
export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: number | null;
  client_msg_id?: string | null;
  content: string;
  payload_type: MessagePayloadType;
  payload: MessagePayload;
  interaction_count: number;
  reply_to_message_id: string | null;
  forwarded_from?: unknown;
  is_edited: boolean;
  is_deleted: boolean;
  is_pinned?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReadReceiptRow {
  conversation_id: string;
  member_id: number;
  last_read_message_id: string | null;
  read_at: string;
}

export interface ReactionRow {
  message_id: string;
  member_id: number;
  emoji: string;
  created_at: string;
}

// ─── API response shapes ──────────────────────────────────────

export interface ConversationListItem {
  id: string;
  type: ConversationType;
  title: string | null;
  avatar_url: string | null;
  updated_at: string;
  default_permissions?: PermissionsJson;
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /** Last message preview */
  last_message: {
    id: string;
    content: string;
    sender_id: number | null;
    sender_name: string | null;
    created_at: string;
    is_deleted: boolean;
  } | null;
  unread_count: number;
  /** For private (1:1) chats: the other participant */
  other_member: {
    id: number;
    name: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url?: string | null;
    /** ISO time of last disconnect (WS), optional until backfill */
    last_seen_at?: string | null;
  } | null;
  /** Персонально для текущего пользователя (из conversation_participants). */
  my_muted?: boolean;
  my_muted_until?: string | null;
  my_ui_pinned?: boolean;
  my_ui_pinned_at?: string | null;
  /** Ручная папка: переопределяет вкладку «Личные» / «Служения»; null = авто по типу чата. */
  my_ui_folder?: 'personal' | 'ministry' | null;
}

export interface MessageWithSender extends MessageRow {
  /** Для WS fan-out: клиентский счётчик непрочитанного. */
  is_read?: boolean;
  sender_name: string | null;
  sender_first_name: string | null;
  sender_last_name: string | null;
  /** For `payload_type === 'poll'`: vote counts per option (same order as `payload.options`). */
  poll_tallies?: number[];
  /** Option indexes the current user voted for. */
  poll_my_options?: number[];
  /** Replied message preview (if reply) */
  reply_preview: {
    id: string;
    content: string;
    sender_name: string | null;
    is_deleted: boolean;
  } | null;
  reactions: { emoji: string; count: number; reacted_by_me: boolean }[];
}

export interface ConversationMember {
  member_id: number;
  role: ParticipantRole;
  joined_at: string;
  muted_until: string | null;
  permissions: PermissionsJson;
  name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url?: string | null;
  previous_prayer_requests?: Array<{
    cycle_index: number;
    prayer_request: string;
    updated_at: string | null;
  }>;
}

// ─── WebSocket event types ────────────────────────────────────

export type WsMessengerEvent =
  | { type: 'msg:new'; conversationId: string; message: MessageWithSender }
  /** Сервер принял и провалидировал сообщение (до/параллельно INSERT); клиент ставит статус «отправлено». */
  | { type: 'msg:server_ack'; conversationId: string; clientMsgId: string }
  /** Получатель подтвердил доставку в свой клиент; ретрансляция отправителю через Redis. */
  | {
      type: 'msg:delivered';
      conversationId: string;
      messageId: string;
      clientMsgId: string;
      deliveredByMemberId?: number;
    }
  /** Сохранение в БД не удалось после раннего fan-out; клиент снимает pending/temp по client_msg_id. */
  | { type: 'msg:send_failed'; conversationId: string; clientMsgId: string; reason?: string }
  | { type: 'msg:edited'; conversationId: string; messageId: string; content: string; updatedAt: string }
  /** Слияние полей payload (например карточка заявки после принятия/отклонения). */
  | {
      type: 'msg:payload_updated';
      conversationId: string;
      messageId: string;
      payload: Record<string, unknown>;
      updatedAt: string;
    }
  | { type: 'msg:deleted'; conversationId: string; messageId: string }
  | { type: 'msg:reaction'; conversationId: string; messageId: string; emoji: string; memberId: number; action: 'add' | 'remove' }
  | { type: 'msg:poll'; conversationId: string; messageId: string; tallies: number[] }
  | { type: 'typing:start'; conversationId: string; memberId: number; memberName: string }
  | { type: 'typing:stop'; conversationId: string; memberId: number }
  | { type: 'conv:created'; conversation: ConversationListItem }
  | {
      type: 'conv:updated';
      conversationId: string;
      /** @deprecated — предпочтительно `conversation` */
      title?: string;
      avatarUrl?: string;
      /** Глобальные поля (аватар, название) для merge в списке без перетирания unread/last_message. */
      conversation?: Partial<Pick<ConversationListItem, 'avatar_url' | 'title' | 'updated_at'>>;
    }
  | { type: 'conv:history_cleared'; conversationId: string }
  | { type: 'messages_read'; chatId: string; userId: number; lastReadMessageId: string }
  | { type: 'read:updated'; conversationId: string; memberId: number; lastReadMessageId: string }
  | { type: 'presence:online'; memberId: number }
  | { type: 'presence:offline'; memberId: number; lastSeenAt?: string };
