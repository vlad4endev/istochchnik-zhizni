import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuLoaderCircle, LuPlus, LuX } from 'react-icons/lu';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

import { AppAvatar } from '../../../components/AppAvatar';
import { useMobileBottomNavLock } from '../../../app/useMobileBottomNavLock';
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

  useMobileBottomNavLock(open && planId != null);

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

  const eventModal = (
      <div className="fixed inset-0 z-[var(--z-modal-bg)] flex items-end justify-center p-0 sm:items-center sm:p-4" role="presentation">
        <button type="button" aria-label="Закрыть" className="absolute inset-0 bg-black/45" onClick={onClose} />
        <div
          role="dialog"
          aria-modal="true"
          className="relative z-[var(--z-modal)] flex max-h-[min(calc(100dvh-1rem),720px)] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-stone-200/80 bg-white shadow-2xl sm:max-h-[min(92dvh,720px)] sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 border-b border-stone-100 px-4 py-3 sm:py-4">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-stone-200 sm:hidden" />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-extrabold text-stone-900">Назначения медиа-команды</h2>
                <p className="truncate text-xs font-semibold text-stone-500">{headerLabel}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="tap-highlight-transparent grid h-11 w-11 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-600"
              >
                <LuX className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
            {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}

            {localEvent ? (
              <div className="rounded-2xl border border-stone-200/80 bg-gradient-to-br from-stone-50 to-white p-4 shadow-sm">
                <p className="text-lg font-extrabold text-stone-900">{localEvent.title}</p>
                <p className="mt-1 text-sm font-semibold text-stone-500">
                  {format(parseISO(localEvent.event_date), 'd MMMM yyyy, EEEE', { locale: ru })}
                  {localEvent.start_time ? ` · ${localEvent.start_time}` : ''}
                </p>
                {localEvent.notes ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">{localEvent.notes}</p>
                ) : null}
              </div>
            ) : (
              <div className="flex justify-center py-8">
                <LuLoaderCircle className="h-7 w-7 animate-spin text-stone-400" />
              </div>
            )}

            {localEvent ? (
              <div>
                <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                  Роли команды
                </h3>
                <ul className="space-y-2">
                  {roles.map((role) => {
                    const assignment = assignmentsByRole.get(role.id);
                    return (
                      <li
                        key={role.id}
                        className="flex min-h-[52px] items-center gap-2 rounded-2xl border border-stone-200/80 bg-white px-3 py-2.5 shadow-sm"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: role.color }}
                        />
                        <span className="w-24 shrink-0 truncate text-xs font-extrabold text-stone-500">
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
                              <p className="truncate text-sm font-extrabold text-stone-900">{assignment.member.name}</p>
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
                                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"
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
                            className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-xl bg-primary/10 px-3 py-2 text-xs font-extrabold text-primary hover:bg-primary/15"
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
              <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                <p className="mb-2 text-sm font-extrabold text-stone-900">Ваши назначения</p>
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
                          className="inline-flex min-h-11 items-center rounded-lg bg-[var(--btn-success-bg,#16a34a)] px-4 py-2 text-sm font-semibold text-white"
                        >
                          Подтвердить
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleStatus(a.id, 'declined')}
                          className="inline-flex min-h-11 items-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
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

          <div className="flex shrink-0 flex-wrap gap-2 border-t border-stone-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              className="tap-highlight-transparent w-full min-h-[48px] rounded-xl border border-stone-200 bg-white text-sm font-extrabold text-stone-800 shadow-sm sm:w-auto sm:px-4"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
  );

  return (
    <>
      {typeof document !== 'undefined' ? createPortal(eventModal, document.body) : null}
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
