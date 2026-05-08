import { Router, type Request, type Response } from 'express';

import { enqueuePageView } from '../middleware/analyticsMiddleware';
import { createIpRateLimiter } from '../middleware/rateLimit';
import { requireAdmin } from '../middleware/requireAdmin';
import {
  getOverview,
  getPageDetails,
  getPagesStats,
  getRealtimeOnline,
  getTopUsers,
  getUserStats,
  hashIp,
  exportAnalyticsCsv,
  trackFeatureEvent,
} from '../services/analyticsService';

type AuthReq = Request & { authUserId?: number };

const router = Router();

const trackPageViewMaxPerMin = ((): number => {
  const raw = String(process.env.ANALYTICS_TRACK_PAGE_VIEW_MAX_PER_MIN ?? '').trim();
  const n = raw ? Number.parseInt(raw, 10) : 300;
  if (!Number.isFinite(n) || n < 30) return 300;
  return Math.min(n, 2000);
})();

const trackPageViewRateLimit = createIpRateLimiter({
  windowMs: 60_000,
  maxRequests: trackPageViewMaxPerMin,
  keyPrefix: 'analytics-track-page',
  message: 'Too many page tracking requests',
});
const trackEventRateLimit = createIpRateLimiter({
  windowMs: 60_000,
  maxRequests: 120,
  keyPrefix: 'analytics-track-event',
  message: 'Too many event tracking requests',
});

router.post('/track/page-view', trackPageViewRateLimit, async (req: Request, res: Response) => {
  try {
    if ((process.env.ANALYTICS_ENABLED ?? 'true').toLowerCase() === 'false') {
      res.json({ ok: true, skipped: true });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const pageKey = String(body.page_key ?? '').trim().slice(0, 100);
    if (!pageKey) {
      res.status(400).json({ error: 'page_key is required' });
      return;
    }
    const authReq = req as AuthReq;
    const sessionIdRaw = String(body.session_id ?? '').trim();
    const sessionId = sessionIdRaw ? sessionIdRaw.slice(0, 64) : null;
    const durationMs = Number(body.duration_ms);
    const durationSeconds =
      Number.isFinite(durationMs) && durationMs >= 0
        ? Math.round(durationMs / 1000)
        : Number.isFinite(Number(body.duration_seconds))
          ? Number(body.duration_seconds)
          : null;
    enqueuePageView({
      pageKey,
      pageUrl: typeof body.page_url === 'string' ? body.page_url : null,
      userId: authReq.authUserId ?? null,
      sessionId: authReq.authUserId ? null : sessionId,
      ipHash: hashIp(req.ip),
      userAgent: req.get('user-agent') ?? null,
      deviceType: typeof body.device_type === 'string' ? body.device_type : null,
      os: typeof body.os === 'string' ? body.os : null,
      browser: typeof body.browser === 'string' ? body.browser : null,
      referrer: typeof body.referrer === 'string' ? body.referrer : req.get('referer') ?? null,
      durationSeconds,
      viewedAt: new Date(),
    });
    res.status(202).json({ ok: true });
  } catch (err) {
    console.error('[analytics] track page failed:', err);
    res.status(500).json({ error: 'Failed to track page view' });
  }
});

router.post('/track/event', trackEventRateLimit, async (req: Request, res: Response) => {
  try {
    if ((process.env.ANALYTICS_ENABLED ?? 'true').toLowerCase() === 'false') {
      res.json({ ok: true, skipped: true });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const eventType = String(body.event_type ?? '').trim();
    if (!eventType) {
      res.status(400).json({ error: 'event_type is required' });
      return;
    }
    const authReq = req as AuthReq;
    await trackFeatureEvent({
      eventType,
      pageKey: typeof body.page_key === 'string' ? body.page_key : null,
      userId: authReq.authUserId ?? null,
      metadata: body.metadata ?? {},
    });
    res.status(202).json({ ok: true });
  } catch (err) {
    console.error('[analytics] track event failed:', err);
    res.status(500).json({ error: 'Failed to track event' });
  }
});

router.get('/overview', requireAdmin, async (req: Request, res: Response) => {
  try {
    const data = await getOverview(req.query.period);
    res.json(data);
  } catch (err) {
    console.error('[analytics] overview failed:', err);
    res.status(500).json({ error: 'Failed to load overview analytics' });
  }
});

router.get('/pages', requireAdmin, async (req: Request, res: Response) => {
  try {
    const data = await getPagesStats(req.query.period);
    res.json(data);
  } catch (err) {
    console.error('[analytics] pages failed:', err);
    res.status(500).json({ error: 'Failed to load pages analytics' });
  }
});

router.get('/pages/:pageKey', requireAdmin, async (req: Request, res: Response) => {
  try {
    const data = await getPageDetails(String(req.params.pageKey ?? ''), req.query.period);
    res.json(data);
  } catch (err) {
    console.error('[analytics] page detail failed:', err);
    res.status(500).json({ error: 'Failed to load page analytics' });
  }
});

router.get('/users/:userId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId)) {
      res.status(400).json({ error: 'Invalid userId' });
      return;
    }
    const data = await getUserStats(userId, req.query.period);
    res.json(data);
  } catch (err) {
    console.error('[analytics] user detail failed:', err);
    res.status(500).json({ error: 'Failed to load user analytics' });
  }
});

router.get('/users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const data = await getTopUsers({
      periodRaw: req.query.period,
      sortByRaw: req.query.sort_by,
      pageKeyRaw: req.query.page_key,
    });
    res.json(data);
  } catch (err) {
    console.error('[analytics] users rating failed:', err);
    res.status(500).json({ error: 'Failed to load users analytics' });
  }
});

router.get('/realtime', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const data = await getRealtimeOnline();
    res.json(data);
  } catch (err) {
    console.error('[analytics] realtime failed:', err);
    res.status(500).json({ error: 'Failed to load realtime analytics' });
  }
});

router.get('/export', requireAdmin, async (req: Request, res: Response) => {
  try {
    const format = String(req.query.format ?? 'csv').toLowerCase();
    if (format !== 'csv') {
      res.status(400).json({ error: 'Only csv export format is supported' });
      return;
    }
    const period = String(req.query.period ?? '30d');
    const csv = await exportAnalyticsCsv(period);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="analytics-${period}-${stamp}.csv"`);
    res.status(200).send(csv);
  } catch (err) {
    console.error('[analytics] export failed:', err);
    res.status(500).json({ error: 'Failed to export analytics' });
  }
});

export default router;
