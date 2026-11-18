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
  Call: undefined;
  ChatProfile: { conversationId: string; title?: string; isGroup: boolean };
  ChatMembers: { conversationId: string; isChannel: boolean };
  ChatMedia: { conversationId: string };
  ChatPermissions: { conversationId: string };
  MediaSchedule: undefined;
  ServicePlanner: undefined;
  ServicePlanDetail: { planId: number; shareToken: string; title?: string };
  Studio: undefined;
  StudioSetlistDetail: { setlistId: number; title: string };
  StudioPerform: { setlistId: number; title?: string };
  PrayerCyclePlan: undefined;
  Bible: undefined;
  BibleReader: {
    translation: string;
    book: string;
    chapter: number;
    title?: string;
    verse?: number;
  };
};
