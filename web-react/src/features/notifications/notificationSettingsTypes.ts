export type NotificationRepeat = 'day' | 'week' | 'month' | 'year';

export type NotificationImportance = 'low' | 'normal' | 'high';

export type NotificationRuleId =
  | 'prayer_reminder'
  | 'birthday_today'
  | 'birthday_week'
  | 'broadcast_start'
  | 'system_update'
  | 'new_sermon'
  | 'new_event'
  | 'coordinator_week_digest';

export interface NotificationRule {
  id: NotificationRuleId;
  title: string;
  enabled: boolean;
  time: string;
  importance: NotificationImportance;
  repeat: NotificationRepeat;
  weekDay: number;
  monthDay: number;
  yearMonth: number;
  yearDay: number;
}

export interface NotificationSettingsPublic {
  timezone: string;
  rules: NotificationRule[];
}
