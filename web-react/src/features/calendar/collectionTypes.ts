/** Ответ GET/PATCH `/api/calendar/cycle/collection-claims`. */
export interface CycleCollectionClaimRow {
  id: number;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  claimed_by: {
    id: number;
    name: string;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  can_toggle: boolean;
}

export interface CycleCollectionClaimsSnapshot {
  cycle_index: number;
  cycle_number: number;
  members: CycleCollectionClaimRow[];
}
