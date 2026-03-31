import type { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

export const validateSendMessage = [
  body('content').custom((value, { req }) => {
    const pt = String(req.body?.payloadType ?? 'text');
    const v = typeof value === 'string' ? value.trim() : '';
    if (pt === 'image' || pt === 'file') {
      // For attachments we allow empty content (caption is optional).
      if (value == null || value === '') return true;
      if (typeof value !== 'string') throw new Error('Message content must be a string');
      if (v.length > 4000) throw new Error('Message content must be between 0 and 4000 characters');
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
    .isIn(['text', 'prayer_request', 'audio', 'image', 'file'])
    .withMessage('payloadType must be one of: text, prayer_request, audio, image, file'),

  body('payload')
    .optional({ nullable: true })
    .custom((value) => value == null || (typeof value === 'object' && !Array.isArray(value)))
    .withMessage('payload must be an object'),

  body('payload').custom((value, { req }) => {
    const pt = String(req.body?.payloadType ?? 'text');
    if (pt === 'image' || pt === 'file') {
      const v = value as Record<string, unknown> | null | undefined;
      const url = v && typeof v === 'object' && !Array.isArray(v) ? v.url : null;
      if (typeof url !== 'string' || !url.trim()) {
        throw new Error('payload.url is required for attachments');
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
