import type { StoryAuthorGroup } from '../api/feed';

export type AuthStackParamList = {
  Login: undefined;
  PendingReview: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Chats: undefined;
  Prayer: undefined;
  Songbook: undefined;
  Sermons: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  SongDetail: { songId: number; title: string };
  Events: undefined;
  ChatThread: { conversationId: string; title?: string; isGroup?: boolean };
  NewChat: undefined;
  MediaSchedule: undefined;
  MusicSchedule: undefined;
  SundaySchedule: undefined;
  ServicePlanner: undefined;
  ServicePlanDetail: { planId: number; shareToken: string; title?: string };
  Studio: undefined;
  StudioSetlistDetail: { setlistId: number; title: string };
  StudioPerform: { setlistId: number; title?: string };
  PrayerCyclePlan: undefined;
  Feed: undefined;
  Broadcast: undefined;
  MySermons: undefined;
  SermonNoteDetail: { noteId: string; title: string };
  Profile: { username?: string; memberId?: number } | undefined;
  ProfileEdit: undefined;
  ComposePost: undefined;
  FeedPostComments: { postId: string };
  StoryViewer: { groupIndex: number; groups: StoryAuthorGroup[] };
};
