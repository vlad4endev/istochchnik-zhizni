import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  approveAccessRequestHandler,
  changePhoneHandler,
  changePasswordHandler,
  completeAdminPasswordResetHandler,
  completePasswordResetSmsHandler,
  forgotPasswordRequestHandler,
  listAccessRequestsHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  patchProfileHandler,
  refreshHandler,
  sessionHintsHandler,
  uploadAvatarHandler,
  registerHandler,
  rejectAccessRequestHandler,
  startPasswordResetSmsHandler,
  verifyPasswordResetSmsHandler,
} from '../controllers/authController';
import { requireAuthSession } from '../middleware/authSession';
import { createIpRateLimiter } from '../middleware/rateLimit';
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

const authLoginRateLimit = createIpRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  // SECURITY FIX: ограничиваем брутфорс попытки логина по IP.
  message: 'Too many login attempts. Please try again later.',
});

/** Отдельный лимит: refresh по cookie — не брутфорс; SPA держит несколько вкладок + SessionKeepAlive. */
const authRefreshRateLimit = createIpRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 180,
  message: 'Too many session refresh attempts. Please wait and try again.',
  keyPrefix: 'auth-refresh',
});

const authResetRateLimit = createIpRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 8,
  // SECURITY FIX: ограничиваем перебор кодов/запросов восстановления по IP.
  message: 'Too many password reset attempts. Please try again later.',
});

/** Оборачивает multer: отдаёт JSON вместо «молчаливого» 500 при отклонении файла / превышении размера. */
function avatarUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'Файл больше 5 МБ' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    if (err) {
      const message = err instanceof Error ? err.message : 'Ошибка загрузки';
      res.status(400).json({ error: message });
      return;
    }

    const file = (req as Request & { file?: Express.Multer.File }).file;
    // SECURITY FIX: проверяем сигнатуру файла после загрузки в память, чтобы отсечь MIME spoofing.
    if (!file?.buffer || file.buffer.length < 4) {
      res.status(400).json({ error: 'Некорректный файл изображения' });
      return;
    }
    const isJpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
    const isPng =
      file.buffer.length >= 8 &&
      file.buffer[0] === 0x89 &&
      file.buffer[1] === 0x50 &&
      file.buffer[2] === 0x4e &&
      file.buffer[3] === 0x47 &&
      file.buffer[4] === 0x0d &&
      file.buffer[5] === 0x0a &&
      file.buffer[6] === 0x1a &&
      file.buffer[7] === 0x0a;
    const isGif =
      file.buffer.length >= 6 &&
      (file.buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
        file.buffer.subarray(0, 6).toString('ascii') === 'GIF89a');
    const isWebp =
      file.buffer.length >= 12 &&
      file.buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      file.buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    const isHeifFamily =
      file.buffer.length >= 12 &&
      file.buffer.subarray(4, 8).toString('ascii') === 'ftyp' &&
      ['heic', 'heif', 'mif1', 'msf1'].includes(file.buffer.subarray(8, 12).toString('ascii').toLowerCase());
    if (!(isJpeg || isPng || isGif || isWebp || isHeifFamily)) {
      res.status(400).json({ error: 'Файл не похож на валидное изображение' });
      return;
    }
    next();
  });
}

router.get('/session-hints', sessionHintsHandler);
router.post('/register', registerHandler);
router.post('/login', authLoginRateLimit, loginHandler);
router.post('/refresh', authRefreshRateLimit, refreshHandler);
router.post('/forgot-password-request', authResetRateLimit, forgotPasswordRequestHandler);
router.post('/password-reset/sms/request', authResetRateLimit, startPasswordResetSmsHandler);
router.post('/password-reset/sms/verify', authResetRateLimit, verifyPasswordResetSmsHandler);
router.post('/password-reset/sms/complete', authResetRateLimit, completePasswordResetSmsHandler);
router.post('/password-reset/admin-complete', authResetRateLimit, completeAdminPasswordResetHandler);
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
