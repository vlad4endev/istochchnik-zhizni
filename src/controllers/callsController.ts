import type { Request, Response } from 'express';

import {
  CallsError,
  acceptCall,
  cancelCall,
  createDirectCall,
  createGroupCall,
  createInvitation,
  declineCall,
  endCall,
  getCallForMember,
  getInvitationPreview,
  issueCallToken,
  joinViaInvitation,
  listCallHistory,
  revokeInvitation,
  type CallAccessMode,
  type CallMediaType,
} from '../services/callsService';

type AuthReq = Request & { authUserId?: number };

function memberId(req: Request): number | null {
  const id = (req as AuthReq).authUserId;
  return typeof id === 'number' && Number.isFinite(id) ? id : null;
}

function sendCallsError(res: Response, err: unknown): void {
  if (err instanceof CallsError) {
    const statusMap: Record<CallsError['code'], number> = {
      forbidden: 403,
      not_found: 404,
      busy: 409,
      already_in_call: 409,
      invalid: 400,
      conflict: 409,
      livekit_unavailable: 503,
      invite_invalid: 404,
      invite_expired: 410,
      invite_revoked: 410,
      full: 409,
      disabled: 503,
    };
    res.status(statusMap[err.code] ?? 400).json({ error: err.message, code: err.code });
    return;
  }
  console.error('[calls] unexpected error:', err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}

function pickMediaType(raw: unknown): CallMediaType | null {
  if (raw === 'audio' || raw === 'video') return raw;
  return null;
}

export async function createCallHandler(req: Request, res: Response): Promise<void> {
  const uid = memberId(req);
  if (!uid) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  try {
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const type = body.type === 'group' ? 'group' : body.type === 'direct' ? 'direct' : null;
    const mediaType = pickMediaType(body.mediaType ?? body.media_type);
    const conversationId = String(body.conversationId ?? body.chatId ?? '').trim();
    if (!type || !mediaType || !conversationId) {
      res.status(400).json({ error: 'Укажите type, mediaType и conversationId' });
      return;
    }

    if (type === 'direct') {
      const recipientId = Number(body.recipientId ?? body.recipient_id);
      const call = await createDirectCall({
        initiatorId: uid,
        conversationId,
        recipientId,
        mediaType,
      });
      res.status(201).json({ call });
      return;
    }

    const accessMode: CallAccessMode =
      body.accessMode === 'link' || body.access_mode === 'link' ? 'link' : 'closed';
    const call = await createGroupCall({
      initiatorId: uid,
      conversationId,
      mediaType,
      accessMode,
    });
    res.status(201).json({ call });
  } catch (err) {
    sendCallsError(res, err);
  }
}

export async function getCallHandler(req: Request, res: Response): Promise<void> {
  const uid = memberId(req);
  if (!uid) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  try {
    const callId = String(req.params.callId ?? '').trim();
    const call = await getCallForMember(callId, uid);
    res.json({ call });
  } catch (err) {
    sendCallsError(res, err);
  }
}

export async function acceptCallHandler(req: Request, res: Response): Promise<void> {
  const uid = memberId(req);
  if (!uid) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  try {
    const call = await acceptCall(String(req.params.callId ?? ''), uid);
    res.json({ call });
  } catch (err) {
    sendCallsError(res, err);
  }
}

export async function declineCallHandler(req: Request, res: Response): Promise<void> {
  const uid = memberId(req);
  if (!uid) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  try {
    const call = await declineCall(String(req.params.callId ?? ''), uid);
    res.json({ call });
  } catch (err) {
    sendCallsError(res, err);
  }
}

export async function cancelCallHandler(req: Request, res: Response): Promise<void> {
  const uid = memberId(req);
  if (!uid) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  try {
    const call = await cancelCall(String(req.params.callId ?? ''), uid);
    res.json({ call });
  } catch (err) {
    sendCallsError(res, err);
  }
}

export async function endCallHandler(req: Request, res: Response): Promise<void> {
  const uid = memberId(req);
  if (!uid) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  try {
    const call = await endCall(String(req.params.callId ?? ''), uid);
    res.json({ call });
  } catch (err) {
    sendCallsError(res, err);
  }
}

export async function callTokenHandler(req: Request, res: Response): Promise<void> {
  const uid = memberId(req);
  if (!uid) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  try {
    const result = await issueCallToken(String(req.params.callId ?? ''), uid);
    res.json({
      token: result.token,
      url: result.url,
      identity: result.identity,
      call: result.call,
    });
  } catch (err) {
    sendCallsError(res, err);
  }
}

export async function callHistoryHandler(req: Request, res: Response): Promise<void> {
  const uid = memberId(req);
  if (!uid) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  try {
    const conversationId =
      typeof req.query.conversationId === 'string' ? req.query.conversationId.trim() : undefined;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const result = await listCallHistory({
      memberId: uid,
      conversationId,
      cursor,
      limit,
    });
    res.json(result);
  } catch (err) {
    sendCallsError(res, err);
  }
}

export async function createInvitationHandler(req: Request, res: Response): Promise<void> {
  const uid = memberId(req);
  if (!uid) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  try {
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const maxUses =
      body.maxUses != null && Number.isFinite(Number(body.maxUses))
        ? Number(body.maxUses)
        : null;
    const accessMode: CallAccessMode | undefined =
      body.accessMode === 'link' ? 'link' : body.accessMode === 'closed' ? 'closed' : undefined;
    const result = await createInvitation(String(req.params.callId ?? ''), uid, {
      maxUses,
      accessMode,
    });
    res.status(201).json(result);
  } catch (err) {
    sendCallsError(res, err);
  }
}

export async function revokeInvitationHandler(req: Request, res: Response): Promise<void> {
  const uid = memberId(req);
  if (!uid) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  try {
    await revokeInvitation(
      String(req.params.callId ?? ''),
      String(req.params.invitationId ?? ''),
      uid,
    );
    res.json({ ok: true });
  } catch (err) {
    sendCallsError(res, err);
  }
}

export async function invitationPreviewHandler(req: Request, res: Response): Promise<void> {
  const uid = memberId(req);
  try {
    const token = String(req.params.token ?? '').trim();
    if (!token || token.length < 16) {
      res.status(404).json({ error: 'Приглашение не найдено', code: 'invite_invalid' });
      return;
    }
    const preview = await getInvitationPreview(token, uid);
    res.json(preview);
  } catch (err) {
    sendCallsError(res, err);
  }
}

export async function invitationJoinHandler(req: Request, res: Response): Promise<void> {
  const uid = memberId(req);
  if (!uid) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  try {
    const token = String(req.params.token ?? '').trim();
    if (!token || token.length < 16) {
      res.status(404).json({ error: 'Приглашение не найдено', code: 'invite_invalid' });
      return;
    }
    const result = await joinViaInvitation(token, uid);
    res.json({
      token: result.token,
      url: result.url,
      identity: result.identity,
      call: result.call,
    });
  } catch (err) {
    sendCallsError(res, err);
  }
}
