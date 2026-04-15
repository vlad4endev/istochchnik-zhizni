import { create } from 'zustand';

import type { DashboardCoordinatorNoteKind } from '../calendar/api';

type State = {
  pendingOpenKind: DashboardCoordinatorNoteKind | null;
  requestOpenEditor: (kind: DashboardCoordinatorNoteKind) => void;
  clearPendingOpen: () => void;
};

export const useCoordinatorNoteEditorRequestStore = create<State>((set) => ({
  pendingOpenKind: null,
  requestOpenEditor: (kind) => set({ pendingOpenKind: kind }),
  clearPendingOpen: () => set({ pendingOpenKind: null }),
}));
