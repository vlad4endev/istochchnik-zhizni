import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { getUploadsRoot } from '../config/uploadsRoot';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = getUploadsRoot();
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      console.warn('[uploads] cannot create messenger uploads dir:', dir, e);
    }
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '';
    const safeExt = ext && ext.length <= 12 ? ext : '';
    cb(null, `${uuidv4()}${safeExt}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

