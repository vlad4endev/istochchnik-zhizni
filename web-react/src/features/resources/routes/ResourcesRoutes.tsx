import { Navigate, Route, Routes } from 'react-router-dom';

import { ResourcesHomePage } from '../pages/ResourcesHomePage';
import { PodcastsPage } from '../pages/PodcastsPage';
import { VideosPage } from '../pages/VideosPage';
import { ReadingPage } from '../pages/ReadingPage';

export function ResourcesRoutes() {
  return (
    <Routes>
      <Route index element={<ResourcesHomePage />} />
      <Route path="podcasts" element={<PodcastsPage />} />
      <Route path="video" element={<VideosPage />} />
      <Route path="read" element={<ReadingPage />} />
      <Route path="*" element={<Navigate to="/resources" replace />} />
    </Routes>
  );
}

