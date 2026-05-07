import { Router, type Request, type Response } from 'express';

import { requireAuthSession } from '../middleware/authSession';

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

// GET /api/calls/ice-servers
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

export default router;
