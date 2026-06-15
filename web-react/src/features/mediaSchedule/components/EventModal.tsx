import { useEffect, useMemo, useState } from 'react';
import { LuLoaderCircle, LuPlus, LuX } from 'react-icons/lu';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

import { AppAvatar } from '../../../components/AppAvatar';
import {
  apiErrorMessage,
  assignMediaMember,
  fetchMediaEventByPlanId,
  removeMediaAssignment,
  updateMediaAssignmentStatus,
} from '../api';
import {
  assignmentStatusBorderColor,
  assignmentStatusLabel,
} from '../mediaAccess';
import type { MediaEvent, MediaRole, MediaScheduleMember } from '../types';
import { formatPlannerEventLabel } from '../types';
import { MemberPickerModal } from './MemberPickerModal';

type Props = {
  open: boolean;
  onClose: () => void;
  planId: number | null;
  roles: MediaRole[];
  members: MediaScheduleMember[];
  canManage: boolean;
  currentMemberId: number | null;
  allEvents: MediaEvent[];
  onSaved: () => void;
};

export function EventModal({
  open,
  onClose,
  planId,
  roles,
  members,
  canManage,
  currentMemberId,
  allEvents,
  onSaved,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRoleId, setPickerRoleId] = useState<number | null>(null);
  const [localEvent, setLocalEvent] = useState<MediaEvent | null>(null);

  useEffect(() => {
    if (!open || planId == null) {
      setLocalEvent(null);
      return;
    }
    setError(null);
    let cancelled = false;
    void fetchMediaEventByPlanId(planId)
      .then((ev) => {
        if (!cancelled) setLocalEvent(ev);
      })
      .catch((e) => {
        if (!cancelled) setError(apiErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [open, planId]);

  const assignmentsByRole = useMemo(() => {
    const map = new Map<number, MediaEvent['assignments'][number] | undefined>();
    for (const role of roles) {
      map.set(role.id, undefined);
    }
    for (const a of localEvent?.assignments ?? []) {
      map.set(a.role_id, a);
    }
    return map;
  }, [localEvent, roles]);

  const busyMemberIdsOnDate = useMemo(() => {
    const ymd = localEvent?.event_date;
    if (!ymd) return [];
    const ids = new Set<number>();
    for (const ev of allEvents) {
      if (ev.event_date !== ymd) continue;
      if (localEvent && ev.id === localEvent.id) continue;
      for (const a of ev.assignments) ids.add(a.member_id);
    }
    return Array.from(ids);
  }, [allEvents, localEvent]);

  if (!open || planId == null) return null;

  async function refreshAfterMutation() {
    if (planId != null) {
      const ev = await fetchMediaEventByPlanId(planId);
      setLocalEvent(ev);
    }
    onSaved();
  }

  async function handleRemoveAssignment(assignmentId: number) {
    setBusy(true);
    try {
      await removeMediaAssignment(assignmentId);
      await refreshAfterMutation();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleAssign(memberId: number, roleId: number) {
    if (planId == null) return;
    await assignMediaMember(planId, memberId, roleId);
    await refreshAfterMutation();
    setPickerOpen(false);
  }

  async function handleStatus(assignmentId: number, status: 'confirmed' | 'declined') {
    setBusy(true);
    try {
      await updateMediaAssignmentStatus(assignmentId, status);
      await refreshAfterMutation();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const myAssignments = (localEvent?.assignments ?? []).filter((a) => a.member_id === currentMemberId);
  const headerLabel = localEvent
    ? formatPlannerEventLabel(localEvent)
    : 'Назначения';

  return (
    <>
      <div className="fixed inset-0 z-[75] flex items-end justify-center p-0 sm:items-center sm:p-4" role="presentation">
        <button type="button" aria-label="Закрыть" className="absolute inset-0 bg-black/45" onClick={onClose} />
        <div
          role="dialog"
          aria-modal="true"
          className="relative z-[76] flex max-h-[min(92dvh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-2xl sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">Назначения медиа-команды</h2>
              <p className="truncate text-xs text-[var(--text-muted)]">{headerLabel}</p>
            </div>
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-black/5">
              <LuX className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}

            {localEvent ? (
              <div className="space-y-1 text-sm">
                <p className="text-lg font-semibold">{localEvent.title}</p>
                <p className="text-[var(--text-muted)]">
                  {format(parseISO(localEvent.event_date), 'd MMMM yyyy, EEEE', { locale: ru })}
                  {localEvent.start_time ? ` · ${localEvent.start_time}` : ''}
                </p>
                {localEvent.notes ? <p className="whitespace-pre-wrap text-[var(--text-muted)]">{localEvent.notes}</p> : null}
              </div>
            ) : (
              <div className="flex justify-center py-8">
                <LuLoaderCircle className="h-7 w-7 animate-spin text-[var(--text-muted)]" />
              </div>
            )}

            {localEvent ? (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Роли
                </h3>
                <ul className="space-y-2">
                  {roles.map((role) => {
                    const assignment = assignmentsByRole.get(role.id);
                    return (
                      <li
                        key={role.id}
                        className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: role.color }}
                        />
                        <span className="w-24 shrink-0 truncate text-xs font-semibold text-[var(--text-muted)]">
                          {role.name}
                        </span>
                        {assignment ? (
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <AppAvatar
                              src={assignment.member.avatar_url}
                              fallback={
                                <span className="text-[10px] font-bold text-white">
                                  {assignment.member.name.slice(0, 1)}
                                </span>
                              }
                              initialsFallbackText={assignment.member.name}
                              className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{assignment.member.name}</p>
                              <p
                                className="text-[11px]"
                                style={{ color: assignmentStatusBorderColor(assignment.status) }}
                              >
                                {assignmentStatusLabel(assignment.status)}
                              </p>
                            </div>
                            {canManage ? (
                              <button
                                type="button"
                                onClick={() => void handleRemoveAssignment(assignment.id)}
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"
                              >
                                <LuX className="h-4 w-4" />
                              </button>
                            ) : null}
                          </div>
                        ) : canManage ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPickerRoleId(role.id);
                              setPickerOpen(true);
                            }}
                            className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                          >
                            <LuPlus className="h-4 w-4" /> Назначить
                          </button>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">—</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {!canManage && myAssignments.length > 0 ? (
              <div className="rounded-xl bg-[var(--surface)] p-3 ring-1 ring-[var(--border)]">
                <p className="mb-2 text-sm font-semibold">Ваши назначения</p>
                {myAssignments.map((a) => (
                  <div key={a.id} className="mb-2 flex flex-wrap items-center gap-2 last:mb-0">
                    <span className="text-sm" style={{ color: a.role.color }}>
                      {a.role.name}
                    </span>
                    <span className="text-sm text-[var(--text-muted)]">
                      {assignmentStatusLabel(a.status)}
                    </span>
                    {(a.status === 'assigned' || a.status === 'pending') && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleStatus(a.id, 'confirmed')}
                          className="rounded-lg bg-[var(--btn-success-bg,#16a34a)] px-2 py-1 text-xs font-semibold text-white"
                        >
                          Подтвердить
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleStatus(a.id, 'declined')}
                          className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-semibold text-white"
                        >
                          Отказать
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-[var(--border)] px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold sm:w-auto"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>

      <MemberPickerModal
        open={pickerOpen && Boolean(localEvent)}
        onClose={() => setPickerOpen(false)}
        members={members}
        roles={roles}
        preselectedRoleId={pickerRoleId}
        eventDate={localEvent?.event_date ?? ''}
        eventTitle={localEvent?.title ?? 'Служение'}
        busyMemberIdsOnDate={busyMemberIdsOnDate}
        onAssign={handleAssign}
      />
    </>
  );
}
