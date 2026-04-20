import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  approveAccessRequestHandler,
  changePhoneHandler,
  changePasswordHandler,
  completePasswordResetSmsHandler,
  forgotPasswordRequestHandler,
  listAccessRequestsHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  patchProfileHandler,
  uploadAvatarHandler,
  registerHandler,
  rejectAccessRequestHandler,
  startPasswordResetSmsHandler,
  verifyPasswordResetSmsHandler,
} from '../controllers/authController';
import { requireAuthSession } from '../middleware/authSession';
import multer from 'multer';
import path from 'node:path';

const router = Router();

const AVATAR_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.heic',
  '.heif',
  '.bmp',
  '.avif',
]);

function avatarFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void {
  const mt = (file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (mt.startsWith('image/')) {
    cb(null, true);
    return;
  }
  // Мобильные браузеры иногда шлют пустой MIME или application/octet-stream — ориентируемся на расширение.
  if (AVATAR_IMAGE_EXTENSIONS.has(ext)) {
    cb(null, true);
    return;
  }
  cb(new Error('Разрешены только изображения (JPEG, PNG, WebP и др.)'));
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: avatarFileFilter,
});

/** Оборачивает multer: отдаёт JSON вместо «молчаливого» 500 при отклонении файла / превышении размера. */
function avatarUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'Файл больше 5 МБ' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Ошибка загрузки';
    res.status(400).json({ error: message });
  });
}

router.post('/register', registerHandler);
router.post('/login', loginHandler);
router.post('/forgot-password-request', forgotPasswordRequestHandler);
router.post('/password-reset/sms/request', startPasswordResetSmsHandler);
router.post('/password-reset/sms/verify', verifyPasswordResetSmsHandler);
router.post('/password-reset/sms/complete', completePasswordResetSmsHandler);
router.get('/me', requireAuthSession, meHandler);
router.patch('/me', requireAuthSession, patchProfileHandler);
router.post('/me/avatar', requireAuthSession, avatarUploadMiddleware, uploadAvatarHandler);
router.post('/change-password', requireAuthSession, changePasswordHandler);
router.post('/change-phone', requireAuthSession, changePhoneHandler);
router.post('/logout', requireAuthSession, logoutHandler);
router.get('/access-requests', requireAuthSession, listAccessRequestsHandler);
router.post('/access-requests/:id/approve', requireAuthSession, approveAccessRequestHandler);
router.post('/access-requests/:id/reject', requireAuthSession, rejectAccessRequestHandler);

export default router;
