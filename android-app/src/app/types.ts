export type RootStackParamList = {
  AuthLanding: undefined;
  Login: undefined;
  MainTabs: undefined;
  SongDetail: {songId: string};
  SongEdit: {songId?: string};
  Offline: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Songbook: undefined;
  Feed: undefined;
  MediaSchedule: undefined;
  Settings: undefined;
};
