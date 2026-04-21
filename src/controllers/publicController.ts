import type { Request, Response } from 'express';

import { getPublicSetlistByToken } from '../services/studioService';
import { getPublicPlanByToken } from '../services/servicePlannerService';

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
