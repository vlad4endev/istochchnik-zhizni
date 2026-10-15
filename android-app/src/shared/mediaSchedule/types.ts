export type MediaRoleDto = {
  id: number;
  name: string;
  color?: string;
};

export type MediaAssignmentDto = {
  id: number;
  event_ref_id?: number;
  member_id: number;
  role_id: number;
  status: string;
  member?: {id: number; name: string; avatar_url?: string | null};
  role?: MediaRoleDto;
};

export type MediaEventDto = {
  id: number;
  event_ref_id: number;
  title: string;
  event_date: string;
  start_time?: string | null;
  end_time?: string | null;
  event_type: string;
  template_name?: string | null;
  assignments: MediaAssignmentDto[];
};
