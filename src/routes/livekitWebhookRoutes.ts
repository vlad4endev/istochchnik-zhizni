import express, { Router, type Request, type Response } from 'express';

import { handleLiveKitWebhookEvent } from '../services/callsService';
import { verifyLiveKitWebhook } from '../services/livekitService';

/**
 * POST /api/livekit/webhook — события LiveKit (participant_left, room_finished, …).
 * Тело нужно сырым: подпись считается от байтов (Content-Type: application/webhook+json).
 * Подключать ДО express.json и resolveAuthSession: Authorization здесь — подпись LiveKit, не сессия.
 */
const router = Router();

router.post(
  '/',
  express.text({ type: '*/*', limit: '64kb' }),
  async (req: Request, res: Response) => {
    const raw = typeof req.body === 'string' ? req.body : '';
    let verified;
    try {
      verified = await verifyLiveKitWebhook(raw, req.header('authorization') ?? undefined);
    } catch (e) {
      console.warn('[livekit] webhook rejected:', e instanceof Error ? e.message : e);
      res.status(401).json({ error: 'invalid_signature' });
      return;
    }
    try {
      const result = await handleLiveKitWebhookEvent(verified);
      res.json({ ok: true, result });
    } catch (e) {
      // 500 → LiveKit повторит доставку; обработка идемпотентна.
      console.warn('[livekit] webhook handling failed:', e instanceof Error ? e.message : e);
      res.status(500).json({ error: 'webhook_failed' });
    }
  },
);

export default router;
