export const keys = {
  me: ['auth', 'me'] as const,
  songs: ['songs', 'list'] as const,
  song: (id: string | number) => ['songs', 'detail', String(id)] as const,
  syncStatus: ['sync', 'status'] as const,
} as const;
