import {appSchema, tableSchema} from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 2,
  tables: [
    tableSchema({
      name: 'songs',
      columns: [
        {name: 'server_id', type: 'string', isOptional: true, isIndexed: true},
        {name: 'client_id', type: 'string', isOptional: true, isIndexed: true},
        {name: 'song_number', type: 'number', isOptional: true},
        {name: 'title', type: 'string'},
        {name: 'slug', type: 'string'},
        {name: 'content', type: 'string'},
        {name: 'default_key', type: 'string', isOptional: true},
        {name: 'tempo', type: 'number', isOptional: true},
        {name: 'time_signature', type: 'string', isOptional: true},
        {name: 'tags_json', type: 'string'},
        {name: 'is_published', type: 'boolean'},
        {name: 'updated_at', type: 'number'},
        {name: 'deleted_at', type: 'number', isOptional: true},
        {name: 'synced_at', type: 'number', isOptional: true},
        {name: 'created_by_device', type: 'string', isOptional: true},
      ],
    }),
    tableSchema({
      name: 'members',
      columns: [
        {name: 'server_id', type: 'string', isIndexed: true},
        {name: 'first_name', type: 'string'},
        {name: 'last_name', type: 'string'},
        {name: 'username', type: 'string', isOptional: true},
        {name: 'app_role', type: 'string', isOptional: true},
        {name: 'updated_at', type: 'number'},
        {name: 'deleted_at', type: 'number', isOptional: true},
        {name: 'synced_at', type: 'number', isOptional: true},
      ],
    }),
    tableSchema({
      name: 'sync_queue',
      columns: [
        {name: 'queue_id', type: 'string', isIndexed: true},
        {name: 'table_name', type: 'string'},
        {name: 'operation', type: 'string'},
        {name: 'record_id', type: 'string', isOptional: true},
        {name: 'client_id', type: 'string', isOptional: true},
        {name: 'payload_json', type: 'string'},
        {name: 'device_id', type: 'string', isOptional: true},
        {name: 'created_at', type: 'number'},
        {name: 'attempts', type: 'number'},
        {name: 'last_error', type: 'string', isOptional: true},
      ],
    }),
    tableSchema({
      name: 'sync_metadata',
      columns: [
        {name: 'table_name', type: 'string', isIndexed: true},
        {name: 'last_synced_at', type: 'number'},
      ],
    }),
    tableSchema({
      name: 'sync_conflicts',
      columns: [
        {name: 'table_name', type: 'string'},
        {name: 'record_id', type: 'string', isOptional: true},
        {name: 'client_id', type: 'string', isOptional: true},
        {name: 'local_json', type: 'string'},
        {name: 'remote_json', type: 'string'},
        {name: 'resolved_with', type: 'string'},
        {name: 'created_at', type: 'number'},
      ],
    }),
    /** Read-only cache for church feed (online pull → offline read). */
    tableSchema({
      name: 'feed_posts',
      columns: [
        {name: 'server_id', type: 'string', isIndexed: true},
        {name: 'author_json', type: 'string'},
        {name: 'caption', type: 'string', isOptional: true},
        {name: 'media_json', type: 'string'},
        {name: 'like_count', type: 'number'},
        {name: 'comment_count', type: 'number'},
        {name: 'repost_count', type: 'number'},
        {name: 'liked_by_me', type: 'boolean'},
        {name: 'created_at', type: 'number', isIndexed: true},
        {name: 'cached_at', type: 'number'},
      ],
    }),
    /** Read-only cache for media ministry schedule. */
    tableSchema({
      name: 'media_events',
      columns: [
        {name: 'server_id', type: 'string', isIndexed: true},
        {name: 'title', type: 'string'},
        {name: 'event_date', type: 'string', isIndexed: true},
        {name: 'start_time', type: 'string', isOptional: true},
        {name: 'end_time', type: 'string', isOptional: true},
        {name: 'event_type', type: 'string'},
        {name: 'assignments_json', type: 'string'},
        {name: 'payload_json', type: 'string'},
        {name: 'cached_at', type: 'number'},
      ],
    }),
  ],
});

/** Tables that participate in bidirectional /api/sync. */
export type LocalTableName = 'songs' | 'members';

/** Tables cached from feature APIs for offline reading. */
export type CacheTableName = 'feed_posts' | 'media_events';
