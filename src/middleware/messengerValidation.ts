import type { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

export const validateSendMessage = [
  body('content')
    .exists({ checkFalsy: true })
    .withMessage('Message content is required')
    .bail()
    .isString()
    .withMessage('Message content must be a string')
    .bail()
    .trim()
    .isLength({ min: 1, max: 4000 })
    .withMessage('Message content must be between 1 and 4000 characters'),

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
    .isIn(['text', 'prayer_request', 'audio'])
    .withMessage('payloadType must be one of: text, prayer_request, audio'),

  body('payload')
    .optional({ nullable: true })
    .custom((value) => value == null || (typeof value === 'object' && !Array.isArray(value)))
    .withMessage('payload must be an object'),
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
