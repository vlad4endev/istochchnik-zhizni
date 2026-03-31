import { Navigate, Route, Routes } from 'react-router-dom';

import { VideosPage } from '../pages/VideosPage';
import { ReadingPage } from '../pages/ReadingPage';

export function ResourcesRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="/sermons" replace />} />
      <Route path="podcasts" element={<Navigate to="/sermons" replace />} />
      <Route path="video" element={<VideosPage />} />
      <Route path="read" element={<ReadingPage />} />
      <Route path="*" element={<Navigate to="/resources" replace />} />
    </Routes>
  );
}

