export type WeekPlanKind = 'current' | 'next';

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

export interface CycleCollectionCoordinatorRow {
  id: number;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
}

export interface CycleCollectionClaimsSnapshot {
  cycle_index: number;
  cycle_number: number;
  coordinators: CycleCollectionCoordinatorRow[];
  members: CycleCollectionClaimRow[];
}

export interface CuratorDistributionRunResponse {
  ok: boolean;
  week_kind: WeekPlanKind;
  total: number;
  pushed_coordinators: number;
}
