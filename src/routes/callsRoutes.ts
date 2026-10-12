import { Router, type Request, type Response } from 'express';

import { requireAuthSession } from '../middleware/authSession';
import { createMemberIdRateLimiter } from '../middleware/rateLimit';
import {
  acceptCallHandler,
  callHistoryHandler,
  callTokenHandler,
  cancelCallHandler,
  createCallHandler,
  createInvitationHandler,
  declineCallHandler,
  endCallHandler,
  getCallHandler,
  invitationJoinHandler,
  invitationPreviewHandler,
  revokeInvitationHandler,
} from '../controllers/callsController';

const router = Router();

type IceServerPayload = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const FALLBACK_ICE_SERVERS: IceServerPayload[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

async function fetchMeteredIceServers(domain: string, apiKey: string): Promise<IceServerPayload[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const endpoint = `https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Metered API error: ${response.status}`);
    }
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      throw new Error('Metered API returned invalid payload');
    }
    return payload as IceServerPayload[];
  } finally {
    clearTimeout(timeoutId);
  }
}

const createCallLimiter = createMemberIdRateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
  keyPrefix: 'calls-create',
  message: 'Слишком много звонков. Подождите немного.',
  resolveMemberId: (req) => {
    const id = (req as Request & { authUserId?: number }).authUserId;
    return typeof id === 'number' && Number.isFinite(id) ? id : null;
  },
});

// Legacy ICE helper (optional Metered TURN) — not required for LiveKit media path.
router.get('/ice-servers', requireAuthSession, async (_req: Request, res: Response) => {
  try {
    const apiKey = String(process.env.METERED_API_KEY ?? '').trim();
    const domain = String(process.env.METERED_DOMAIN ?? '').trim();

    if (!apiKey || !domain) {
      res.json({ iceServers: FALLBACK_ICE_SERVERS });
      return;
    }

    const iceServers = await fetchMeteredIceServers(domain, apiKey);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.json({ iceServers });
  } catch (error) {
    console.error('[TURN] Failed to fetch credentials:', error);
    res.json({ iceServers: FALLBACK_ICE_SERVERS });
  }
});

router.get('/history', requireAuthSession, callHistoryHandler);
router.post('/', requireAuthSession, createCallLimiter, createCallHandler);
router.get('/:callId', requireAuthSession, getCallHandler);
router.post('/:callId/accept', requireAuthSession, acceptCallHandler);
router.post('/:callId/decline', requireAuthSession, declineCallHandler);
router.post('/:callId/cancel', requireAuthSession, cancelCallHandler);
router.post('/:callId/end', requireAuthSession, endCallHandler);
router.post('/:callId/token', requireAuthSession, callTokenHandler);
router.post('/:callId/invitations', requireAuthSession, createInvitationHandler);
router.delete('/:callId/invitations/:invitationId', requireAuthSession, revokeInvitationHandler);

export const callInvitationsRouter = Router();
callInvitationsRouter.get('/:token', invitationPreviewHandler);
callInvitationsRouter.post('/:token/join', requireAuthSession, invitationJoinHandler);

export default router;
