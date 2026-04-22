import type { Request, Response } from 'express';

import { getPublicSetlistByToken } from '../services/studioService';
import {
  getEditablePlanByToken,
  getPublicPlanByToken,
  patchEditableBlockByToken,
  patchPublicBlockByShareToken,
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

export async function patchEditableServicePlanBlock(req: Request, res: Response): Promise<void> {
  try {
    const token = typeof req.params.token === 'string' ? req.params.token : '';
    const blockId = Number(req.params.blockId);
    if (!Number.isInteger(blockId) || blockId <= 0) {
      res.status(400).json({ error: 'Некорректный id блока' });
      return;
    }
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const patch: Partial<{ title: string; duration_minutes: number; content_json: Record<string, unknown> }> = {};
    if (body.title !== undefined) patch.title = String(body.title ?? '').trim();
    if (body.duration_minutes !== undefined) {
      const d = Number(body.duration_minutes);
      if (!Number.isFinite(d) || d <= 0) {
        res.status(400).json({ error: 'duration_minutes должен быть > 0' });
        return;
      }
      patch.duration_minutes = Math.round(d);
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

export async function patchPublicServicePlanBlock(req: Request, res: Response): Promise<void> {
  try {
    const token = typeof req.params.token === 'string' ? req.params.token : '';
    const blockId = Number(req.params.blockId);
    if (!Number.isInteger(blockId) || blockId <= 0) {
      res.status(400).json({ error: 'Некорректный id блока' });
      return;
    }
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const patch: Partial<{ title: string; duration_minutes: number; content_json: Record<string, unknown> }> = {};
    if (body.title !== undefined) patch.title = String(body.title ?? '').trim();
    if (body.duration_minutes !== undefined) {
      const d = Number(body.duration_minutes);
      if (!Number.isFinite(d) || d <= 0) {
        res.status(400).json({ error: 'duration_minutes должен быть > 0' });
        return;
      }
      patch.duration_minutes = Math.round(d);
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

    const ok = await patchPublicBlockByShareToken(token, blockId, patch);
    if (!ok) {
      res.status(404).json({ error: 'Программа недоступна для редактирования или блок не найден' });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
}
