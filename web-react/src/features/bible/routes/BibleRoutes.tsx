import { Navigate, Route, Routes } from 'react-router-dom';

import { BibleHomePage } from '../pages/BibleHomePage';
import { BibleNotesPage } from '../pages/BibleNotesPage';
import { BiblePlanDetailPage, BiblePlansListPage } from '../pages/BiblePlanPage';
import { BibleReaderPage } from '../pages/BibleReaderPage';

export function BibleRoutes() {
  return (
    <Routes>
      <Route index element={<BibleHomePage />} />
      <Route path="notes" element={<BibleNotesPage />} />
      <Route path="plans" element={<BiblePlansListPage />} />
      <Route path="plans/:planId" element={<BiblePlanDetailPage />} />
      <Route path=":translation/:book/:chapter" element={<BibleReaderPage />} />
      <Route path="*" element={<Navigate to="/bible" replace />} />
    </Routes>
  );
}
