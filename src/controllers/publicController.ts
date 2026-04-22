import type { Request, Response } from 'express';

import { getPublicSetlistByToken } from '../services/studioService';
import {
  getEditablePlanMetaByToken,
  getEditablePlanByToken,
  getPublicPlanByToken,
  patchEditableBlockByToken,
} from '../services/servicePlannerService';

export async function getPublicSetlist(req: Request, res: Response): Promise<void> {
  try {
    const token = typeof req.params.token === 'string' ? req.params.token : '';
    const payload = await getPublicSetlistByToken(token);
    if (!payload) {
      res.status(404).json({ error: 'Не найдено или ссылка недействительна' });
      return;
    }
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function getPublicServicePlan(req: Request, res: Response): Promise<void> {
  try {
    const token = typeof req.params.token === 'string' ? req.params.token : '';
    const payload = await getPublicPlanByToken(token);
    if (!payload) {
      res.status(404).json({ error: 'Не найдено или ссылка недействительна' });
      return;
    }
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function getEditableServicePlan(req: Request, res: Response): Promise<void> {
  try {
    const token = typeof req.params.token === 'string' ? req.params.token : '';
    const payload = await getEditablePlanByToken(token);
    if (!payload) {
      res.status(404).json({ error: 'Не найдено или ссылка недействительна' });
      return;
    }
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function getEditableServicePlanMeta(req: Request, res: Response): Promise<void> {
  try {
    const token = typeof req.params.token === 'string' ? req.params.token : '';
    const payload = await getEditablePlanMetaByToken(token);
    if (!payload) {
      res.status(404).json({ error: 'Не найдено или ссылка недействительна' });
      return;
    }
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

export async function patchEditableServicePlanBlock(req: Request, res: Response): Promise<void> {
  try {
    const token = typeof req.params.token === 'string' ? req.params.token : '';
    const blockId = Number(req.params.blockId);
    if (!Number.isInteger(blockId) || blockId <= 0) {
      res.status(400).json({ error: 'Некорректный id блока' });
      return;
    }
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const patch: Partial<{
      title: string;
      duration_minutes: number;
      block_type_id: number;
      assigned_member_id: number | null;
      song_id: number | null;
      content_json: Record<string, unknown>;
    }> = {};
    if (body.title !== undefined) patch.title = String(body.title ?? '').trim();
    if (body.duration_minutes !== undefined) {
      const d = Number(body.duration_minutes);
      if (!Number.isFinite(d) || d <= 0) {
        res.status(400).json({ error: 'duration_minutes должен быть > 0' });
        return;
      }
      patch.duration_minutes = Math.round(d);
    }
    if (body.block_type_id !== undefined) {
      const blockTypeId = Number(body.block_type_id);
      if (!Number.isInteger(blockTypeId) || blockTypeId <= 0) {
        res.status(400).json({ error: 'block_type_id должен быть положительным числом' });
        return;
      }
      patch.block_type_id = blockTypeId;
    }
    if (body.assigned_member_id !== undefined) {
      const raw = body.assigned_member_id;
      if (raw == null || raw === '') {
        patch.assigned_member_id = null;
      } else {
        const memberId = Number(raw);
        if (!Number.isInteger(memberId) || memberId <= 0) {
          res.status(400).json({ error: 'assigned_member_id должен быть положительным числом или null' });
          return;
        }
        patch.assigned_member_id = memberId;
      }
    }
    if (body.song_id !== undefined) {
      const raw = body.song_id;
      if (raw == null || raw === '') {
        patch.song_id = null;
      } else {
        const songId = Number(raw);
        if (!Number.isInteger(songId) || songId <= 0) {
          res.status(400).json({ error: 'song_id должен быть положительным числом или null' });
          return;
        }
        patch.song_id = songId;
      }
    }
    if (body.content_json !== undefined) {
      if (!body.content_json || typeof body.content_json !== 'object' || Array.isArray(body.content_json)) {
        res.status(400).json({ error: 'content_json должен быть объектом' });
        return;
      }
      patch.content_json = body.content_json as Record<string, unknown>;
    }
    if (Object.keys(patch).length === 0) {
      res.json({ ok: true });
      return;
    }

    const ok = await patchEditableBlockByToken(token, blockId, patch);
    if (!ok) {
      res.status(404).json({ error: 'Программа или блок не найдены' });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}

