import { Router, type Request, type Response } from 'express';
import { getBroadcastEmbed, updateBroadcastEmbed } from '../controllers/broadcastController';
import { getPodcastEpisodes } from '../controllers/resourcesController';
import { requireAuthSession } from '../middleware/authSession';
import * as messenger from '../services/messengerService';

const router = Router();

router.get('/broadcast', getBroadcastEmbed);
router.patch('/broadcast', updateBroadcastEmbed);

/** GET /api/resources/podcasts */
router.get('/resources/podcasts', getPodcastEpisodes);

type AuthReq = Request & { authUserId?: number };

/** PATCH /api/messages/:id/interact { type? } */
router.patch('/messages/:id/interact', requireAuthSession, async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const messageId = String(req.params.id);
  const type = String((req.body?.type ?? 'pray_click') as string);
  if (type !== 'pray_click') {
    res.status(400).json({ error: 'Unsupported interaction type' });
    return;
  }

  try {
    const convId = await messenger.getMessageConversationId(messageId);
    if (!convId) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    const isMember = await messenger.isMemberInConversation(convId, userId);
    if (!isMember) {
      res.status(403).json({ error: 'Not a member of this conversation' });
      return;
    }

    const r = await messenger.interactWithMessage(messageId, userId, 'pray_click');
    if (!r) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    res.json({ ok: true, interaction_count: r.interaction_count, inserted: r.inserted });
  } catch (e) {
    console.error('[messages] interact error:', e);
    res.status(500).json({ error: 'Failed to interact' });
  }
});

export default router;
