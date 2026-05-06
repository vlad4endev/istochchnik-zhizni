import type { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

export const validateSendMessage = [
  body('content').custom((value, { req }) => {
    const pt = String(req.body?.payloadType ?? 'text');
    const v = typeof value === 'string' ? value.trim() : '';
    if (pt === 'image' || pt === 'file' || pt === 'audio' || pt === 'video_note') {
      // For attachments we allow empty content (caption is optional).
      if (value == null || value === '') return true;
      if (typeof value !== 'string') throw new Error('Message content must be a string');
      if (v.length > 4000) throw new Error('Message content must be between 0 and 4000 characters');
      return true;
    }
    if (pt === 'poll') {
      if (typeof value !== 'string' || !v) {
        throw new Error('Poll question is required');
      }
      if (v.length > 500) throw new Error('Poll question must be at most 500 characters');
      return true;
    }
    if (!v) throw new Error('Message content is required');
    if (v.length < 1 || v.length > 4000) {
      throw new Error('Message content must be between 1 and 4000 characters');
    }
    return true;
  }),

  body('replyToMessageId')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined || value === '') return true;
      return /^\d+$/.test(String(value));
    })
    .withMessage('replyToMessageId must be a numeric id'),

  body('clientMsgId')
    .optional({ nullable: true })
    .isString()
    .withMessage('clientMsgId must be a string')
    .bail()
    .isLength({ min: 1, max: 128 })
    .withMessage('clientMsgId length must be between 1 and 128'),

  body('payloadType')
    .optional({ nullable: true })
    .isIn(['text', 'prayer_request', 'audio', 'video_note', 'image', 'file', 'poll'])
    .withMessage('payloadType must be one of: text, prayer_request, audio, video_note, image, file, poll'),

  body('payload')
    .optional({ nullable: true })
    .custom((value) => value == null || (typeof value === 'object' && !Array.isArray(value)))
    .withMessage('payload must be an object'),

  body('payload').custom((value, { req }) => {
    const pt = String(req.body?.payloadType ?? 'text');
    if (pt === 'image' || pt === 'file' || pt === 'audio' || pt === 'video_note') {
      const v = value as Record<string, unknown> | null | undefined;
      const url = v && typeof v === 'object' && !Array.isArray(v) ? v.url : null;
      if (typeof url !== 'string' || !url.trim()) {
        throw new Error('payload.url is required for attachments');
      }
    }
    if (pt === 'poll') {
      const v = value as Record<string, unknown> | null | undefined;
      if (!v || typeof v !== 'object' || Array.isArray(v)) {
        throw new Error('payload object is required for polls');
      }
      const opts = v.options;
      if (!Array.isArray(opts) || opts.length < 2 || opts.length > 10) {
        throw new Error('Poll requires between 2 and 10 options');
      }
      for (const o of opts) {
        const s = String(o ?? '').trim();
        if (!s) throw new Error('Poll options must be non-empty strings');
        if (s.length > 200) throw new Error('Each poll option must be at most 200 characters');
      }
      if (v.allows_multiple != null && typeof v.allows_multiple !== 'boolean') {
        throw new Error('Poll allows_multiple must be a boolean when set');
      }
      if (v.anonymous != null && typeof v.anonymous !== 'boolean') {
        throw new Error('Poll anonymous must be a boolean when set');
      }
    }
    return true;
  }),
];

export function ensureValidRequest(req: Request, res: Response, next: NextFunction): void {
  const result = validationResult(req);
  if (result.isEmpty()) {
    next();
    return;
  }
  const first = result.array({ onlyFirstError: true })[0];
  const field =
    first && typeof first === 'object' && 'path' in first && typeof first.path === 'string'
      ? first.path
      : null;
  res.status(400).json({
    error: 'Validation failed',
    field,
    message: first?.msg ?? 'Invalid request body',
  });
}
