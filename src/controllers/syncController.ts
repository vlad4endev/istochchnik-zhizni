import type {Request, Response} from 'express';

import {requireAuthSession} from '../middleware/authSession';
import {
  bootstrapSyncSnapshot,
  pullSyncChanges,
  pushSyncBatch,
  type SyncPushItem,
  type SyncTableName,
} from '../services/syncService';

function isSyncTable(value: string): value is SyncTableName {
  return value === 'songs' || value === 'members';
}

export async function pullHandler(req: Request, res: Response): Promise<void> {
  const tableRaw = String(req.query.table ?? '');
  if (!isSyncTable(tableRaw)) {
    res.status(400).json({error: 'invalid table'});
    return;
  }
  const since = typeof req.query.since === 'string' ? req.query.since : null;
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
  const result = await pullSyncChanges({table: tableRaw, since, cursor});
  res.json({table: tableRaw, ...result});
}

export async function pushHandler(req: Request, res: Response): Promise<void> {
  const memberId = req.authUserId;
  if (!memberId) {
    res.status(401).json({error: 'unauthorized'});
    return;
  }
  const body = req.body as {items?: SyncPushItem[]};
  const items = Array.isArray(body.items) ? body.items : [];
  const result = await pushSyncBatch(items, memberId);
  res.json(result);
}

export async function bootstrapHandler(req: Request, res: Response): Promise<void> {
  const memberId = req.authUserId;
  if (!memberId) {
    res.status(401).json({error: 'unauthorized'});
    return;
  }
  const snapshot = await bootstrapSyncSnapshot(memberId);
  res.json({...snapshot, serverTime: new Date().toISOString()});
}

export {requireAuthSession};
