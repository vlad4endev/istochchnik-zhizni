import { Router, type Request, type Response, type NextFunction } from 'express';

import {
  createReleaseHandler,
  deleteReleaseHandler,
  getLatestReleaseHandler,
  listReleasesHandler,
  patchReleaseHandler,
} from '../controllers/appReleasesController';
import { requireAuthSession } from '../middleware/authSession';
import { apkUploadMiddleware } from '../middleware/apkUpload';

const router = Router();

/** Skip multer when the client sends JSON (link-only create/update). */
function apkUploadIfMultipart(req: Request, res: Response, next: NextFunction): void {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('multipart/form-data')) {
    apkUploadMiddleware(req, res, next);
    return;
  }
  next();
}

/** Latest active release for the home Android download widget (auth optional). */
router.get('/latest', getLatestReleaseHandler);

router.get('/', requireAuthSession, listReleasesHandler);
router.post('/', requireAuthSession, apkUploadIfMultipart, createReleaseHandler);
router.patch('/:id', requireAuthSession, apkUploadIfMultipart, patchReleaseHandler);
router.delete('/:id', requireAuthSession, deleteReleaseHandler);

export default router;
