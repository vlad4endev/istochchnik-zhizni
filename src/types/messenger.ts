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

export type MessagePayloadType = 'text' | 'prayer_request' | 'audio' | 'image' | 'file';

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
  } | null;
}

export interface MessageWithSender extends MessageRow {
  sender_name: string | null;
  sender_first_name: string | null;
  sender_last_name: string | null;
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
}

// ─── WebSocket event types ────────────────────────────────────

export type WsMessengerEvent =
  | { type: 'msg:new'; conversationId: string; message: MessageWithSender }
  | { type: 'msg:edited'; conversationId: string; messageId: string; content: string; updatedAt: string }
  | { type: 'msg:deleted'; conversationId: string; messageId: string }
  | { type: 'msg:reaction'; conversationId: string; messageId: string; emoji: string; memberId: number; action: 'add' | 'remove' }
  | { type: 'typing:start'; conversationId: string; memberId: number; memberName: string }
  | { type: 'typing:stop'; conversationId: string; memberId: number }
  | { type: 'conv:created'; conversation: ConversationListItem }
  | { type: 'conv:updated'; conversationId: string; title?: string; avatarUrl?: string }
  | { type: 'messages_read'; chatId: string; userId: number; lastReadMessageId: string }
  | { type: 'read:updated'; conversationId: string; memberId: number; lastReadMessageId: string }
  | { type: 'presence:online'; memberId: number }
  | { type: 'presence:offline'; memberId: number };
