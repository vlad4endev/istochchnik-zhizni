import { Router, type Request, type Response } from 'express';
import {
  createBroadcast,
  getActiveBroadcast,
  getBroadcastEmbed,
  listBroadcasts,
  patchBroadcast,
  updateBroadcastEmbed,
} from '../controllers/broadcastController';
import { getUnreadEvents, postEventRead } from '../controllers/eventsController';
import { getPodcastEpisodes, getPodcastSettings, patchPodcastSettings } from '../controllers/resourcesController';
import { requireAuthSession } from '../middleware/authSession';
import { blockImpersonationForChats } from '../middleware/blockImpersonationForChats';
import { requireBroadcastManager } from '../middleware/requireBroadcastManager';
import {
  deleteComment,
  deleteLike,
  deletePost,
  getFeed,
  getFeedUnread,
  getPostComments,
  getProfile,
  getProfileByUsername,
  patchPost,
  patchProfileSettings,
  postComment,
  postCreatePost,
  postFeedMarkSeen,
  postLike,
  postRepost,
} from '../controllers/profileController';
import {
  deleteStory,
  getStories,
  postCreateStory,
  postStoryView,
} from '../controllers/storyController';
import * as messenger from '../services/messengerService';
import { profilePostUploadIfMultipart } from '../middleware/profileMediaUpload';

const router = Router();

router.get('/broadcasts/active', getActiveBroadcast);
router.get('/broadcasts', requireBroadcastManager, listBroadcasts);
router.post('/broadcasts', requireBroadcastManager, createBroadcast);
router.patch('/broadcasts/:id', requireBroadcastManager, patchBroadcast);
router.get('/broadcast', getBroadcastEmbed);
router.patch('/broadcast', requireBroadcastManager, updateBroadcastEmbed);

/** GET /api/resources/podcasts */
router.get('/resources/podcasts', getPodcastEpisodes);

/** GET /api/resources/podcasts/settings (admin) */
router.get('/resources/podcasts/settings', requireAuthSession, getPodcastSettings);
/** PATCH /api/resources/podcasts/settings { rss_url } (admin) */
router.patch('/resources/podcasts/settings', requireAuthSession, patchPodcastSettings);

/**
 * Profile System (Instagram-style)
 * Note: actual URLs are under `/api/*` because this router is mounted at `/api`.
 */
router.get('/profile/by-username/:username', getProfileByUsername);
router.get('/profile/:id', getProfile);
router.patch('/profile/settings', requireAuthSession, patchProfileSettings);

router.get('/feed', requireAuthSession, getFeed);
router.get('/feed/unread-count', requireAuthSession, getFeedUnread);
router.post('/feed/mark-seen', requireAuthSession, postFeedMarkSeen);

router.get('/stories', requireAuthSession, getStories);
router.post('/stories', requireAuthSession, profilePostUploadIfMultipart, postCreateStory);
router.post('/stories/:id/view', requireAuthSession, postStoryView);
router.delete('/stories/:id', requireAuthSession, deleteStory);

router.get('/events/unread-count', requireAuthSession, getUnreadEvents);
router.post('/events/:id/read', requireAuthSession, postEventRead);

// Create post supports JSON or multipart uploads (field: media)
router.post('/posts', requireAuthSession, profilePostUploadIfMultipart, postCreatePost);
router.post('/posts/:id/like', requireAuthSession, postLike);
router.delete('/posts/:id/like', requireAuthSession, deleteLike);
router.post('/posts/:id/repost', requireAuthSession, postRepost);
router.patch('/posts/:id', requireAuthSession, patchPost);
router.delete('/posts/:id', requireAuthSession, deletePost);
router.get('/posts/:id/comments', requireAuthSession, getPostComments);
router.post('/posts/:id/comment', requireAuthSession, postComment);
router.delete('/posts/:id/comments/:commentId', requireAuthSession, deleteComment);

type AuthReq = Request & { authUserId?: number };

/** PATCH /api/messages/:id/interact { type? } */
router.patch(
  '/messages/:id/interact',
  requireAuthSession,
  blockImpersonationForChats,
  async (req: Request, res: Response) => {
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
