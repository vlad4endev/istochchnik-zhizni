/** Ответ GET/PATCH `/api/calendar/cycle/collection-claims`. */
export interface CycleCollectionClaimRow {
  id: number;
  name: string;
  claimed_by: { id: number; name: string } | null;
  can_toggle: boolean;
}

export interface CycleCollectionClaimsSnapshot {
  cycle_index: number;
  cycle_number: number;
  members: CycleCollectionClaimRow[];
}
