import {schemaMigrations, createTable} from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        createTable({
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
        createTable({
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
    },
  ],
});
