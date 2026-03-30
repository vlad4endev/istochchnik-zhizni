import { Router } from 'express';
import {
  approveAccessRequestHandler,
  changePasswordHandler,
  listAccessRequestsHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  patchProfileHandler,
  uploadAvatarHandler,
  registerHandler,
  rejectAccessRequestHandler,
} from '../controllers/authController';
import { requireAuthSession } from '../middleware/authSession';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';

const router = Router();

const avatarsDir = path.join(process.cwd(), 'uploads', 'avatars');
fs.mkdirSync(avatarsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarsDir),
  filename: (req, file, cb) => {
    const userId = (req as unknown as { authUserId?: number }).authUserId ?? 'anon';
    const ext = path.extname(file.originalname || '') || '';
    const safeExt = ext && ext.length <= 10 ? ext : '';
    cb(null, `u${userId}-${Date.now()}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype?.startsWith('image/')) return cb(null, false);
    cb(null, true);
  },
});

router.post('/register', registerHandler);
router.post('/login', loginHandler);
router.get('/me', requireAuthSession, meHandler);
router.patch('/me', requireAuthSession, patchProfileHandler);
router.post('/me/avatar', requireAuthSession, upload.single('file'), uploadAvatarHandler);
router.post('/change-password', requireAuthSession, changePasswordHandler);
router.post('/logout', requireAuthSession, logoutHandler);
router.get('/access-requests', requireAuthSession, listAccessRequestsHandler);
router.post('/access-requests/:id/approve', requireAuthSession, approveAccessRequestHandler);
router.post('/access-requests/:id/reject', requireAuthSession, rejectAccessRequestHandler);

export default router;
