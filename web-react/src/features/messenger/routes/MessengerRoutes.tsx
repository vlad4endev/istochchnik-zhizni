import { Navigate, Route, Routes } from 'react-router-dom';
import { MessengerPage } from '../components/MessengerPage';
import { ManageChatHomePage } from '../manage/ManageChatHomePage';
import { ChatMembersPage } from '../manage/ChatMembersPage';
import { ChatAdminsPage } from '../manage/ChatAdminsPage';
import { ChatPermissionsPage } from '../manage/ChatPermissionsPage';

export function MessengerRoutes() {
  return (
    <Routes>
      <Route index element={<MessengerPage />} />
      <Route path="chat/:chatId/manage" element={<ManageChatHomePage />} />
      <Route path="chat/:chatId/manage/members" element={<ChatMembersPage />} />
      <Route path="chat/:chatId/manage/admins" element={<ChatAdminsPage />} />
      <Route path="chat/:chatId/manage/permissions" element={<ChatPermissionsPage />} />
      <Route path="*" element={<Navigate to="/messenger" replace />} />
    </Routes>
  );
}

