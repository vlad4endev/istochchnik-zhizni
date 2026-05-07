import { apiClient } from '../../lib/apiClient';

export type SermonFeedbackComment = {
  id: number;
  rating: number | null;
  comment: string;
  created_at: string;
  author_member_id: number;
  author_name: string;
  author_avatar_url: string | null;
};

export type SermonFeedbackPayload = {
  plan: {
    service_plan_id: number;
    share_token: string;
    service_date: string;
    start_time: string;
    total_duration_minutes: number;
    preacher_member_id: number | null;
    preacher_name: string | null;
    topic: string;
    scripture: string;
    starts_at: string;
    ends_at: string;
    feedback_ends_at: string;
    phase: 'upcoming' | 'live' | 'feedback' | 'closed';
    can_comment: boolean;
  };
  stats: {
    comments_count: number;
    ratings_count: number;
    avg_rating: number | null;
  };
  comments: SermonFeedbackComment[];
};

export type PreacherSermonHistoryRow = {
  service_plan_id: number;
  share_token: string;
  service_date: string;
  start_time: string;
  total_duration_minutes: number;
  topic: string;
  scripture: string;
  comments_count: number;
  ratings_count: number;
  avg_rating: number | null;
};

export async function fetchSermonFeedbackByToken(token: string): Promise<SermonFeedbackPayload> {
  const { data } = await apiClient.get<SermonFeedbackPayload>(
    `/api/service-plans/sermon-feedback/${encodeURIComponent(token)}`,
  );
  return data;
}

export async function saveSermonFeedbackByToken(
  token: string,
  body: { rating: number; comment: string },
): Promise<void> {
  await apiClient.post(
    `/api/service-plans/sermon-feedback/${encodeURIComponent(token)}/comments`,
    body,
  );
}

export async function fetchMyPreacherSermonHistory(limit = 20): Promise<PreacherSermonHistoryRow[]> {
  const { data } = await apiClient.get<{ items: PreacherSermonHistoryRow[] }>(
    '/api/service-plans/my-sermon-history',
    { params: { limit } },
  );
  return Array.isArray(data?.items) ? data.items : [];
}
