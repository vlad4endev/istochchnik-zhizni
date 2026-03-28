/** Ответ GET `/api/calendar/next-week/collection`. */
export interface NextWeekCollectionSnapshot {
  week_start: string;
  day_dates: string[];
  coordinator_rows: CoordinatorCollectionRow[];
  members_for_select: { id: number; name: string }[];
}

export interface CoordinatorCollectionRow {
  coordinator: { id: number; name: string };
  days: Array<{ date: string; selected_member: { id: number; name: string } | null }>;
  can_edit: boolean;
}
