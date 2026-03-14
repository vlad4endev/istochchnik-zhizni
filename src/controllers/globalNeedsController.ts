import { Request, Response } from 'express';
import {
  listGlobalThemes,
  createGlobalTheme,
  updateGlobalTheme,
  deleteGlobalTheme,
  listMinistries,
  createMinistry,
  updateMinistry,
  deleteMinistry,
  listBacksliders,
  createBackslider,
  updateBackslider,
  deleteBackslider,
  getNextWeekGlobalAssignments,
} from '../services/globalNeedsService';

function parseId(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function isValidOptionalString(value: unknown, maxLen = 5000): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'string') return false;
  return value.length <= maxLen;
}

export async function getThemes(_req: Request, res: Response): Promise<void> {
  try {
    const themes = await listGlobalThemes();
    res.json(themes);
  } catch (err) {
    console.error('getThemes error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function postTheme(req: Request, res: Response): Promise<void> {
  const title = req.body?.title;
  if (typeof title !== 'string' || title.trim().length === 0) {
    res.status(400).json({ error: 'Field "title" is required' });
    return;
  }
  if (!isValidOptionalString(req.body?.bible_verse) || !isValidOptionalString(req.body?.prayer_points)) {
    res.status(400).json({ error: 'Invalid field length' });
    return;
  }

  try {
    const theme = await createGlobalTheme({
      title: title.trim(),
      bible_verse: req.body?.bible_verse ?? null,
      prayer_points: req.body?.prayer_points ?? null,
    });
    res.status(201).json(theme);
  } catch (err) {
    console.error('postTheme error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function patchTheme(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid theme id' });
    return;
  }

  try {
    const theme = await updateGlobalTheme(id, {
      title: req.body?.title,
      bible_verse: req.body?.bible_verse,
      prayer_points: req.body?.prayer_points,
    });
    if (!theme) {
      res.status(404).json({ error: 'Theme not found' });
      return;
    }
    res.json(theme);
  } catch (err) {
    console.error('patchTheme error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function deleteTheme(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid theme id' });
    return;
  }

  try {
    const deleted = await deleteGlobalTheme(id);
    if (!deleted) {
      res.status(404).json({ error: 'Theme not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error('deleteTheme error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getMinistries(_req: Request, res: Response): Promise<void> {
  try {
    const ministries = await listMinistries();
    res.json(ministries);
  } catch (err) {
    console.error('getMinistries error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function postMinistry(req: Request, res: Response): Promise<void> {
  const title = req.body?.title;
  if (typeof title !== 'string' || title.trim().length === 0) {
    res.status(400).json({ error: 'Field "title" is required' });
    return;
  }
  if (!isValidOptionalString(req.body?.prayer_points)) {
    res.status(400).json({ error: 'Invalid field length' });
    return;
  }

  try {
    const ministry = await createMinistry({
      title: title.trim(),
      prayer_points: req.body?.prayer_points ?? null,
    });
    res.status(201).json(ministry);
  } catch (err) {
    console.error('postMinistry error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function patchMinistry(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid ministry id' });
    return;
  }

  try {
    const ministry = await updateMinistry(id, {
      title: req.body?.title,
      prayer_points: req.body?.prayer_points,
    });
    if (!ministry) {
      res.status(404).json({ error: 'Ministry not found' });
      return;
    }
    res.json(ministry);
  } catch (err) {
    console.error('patchMinistry error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function deleteMinistryHandler(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid ministry id' });
    return;
  }

  try {
    const deleted = await deleteMinistry(id);
    if (!deleted) {
      res.status(404).json({ error: 'Ministry not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error('deleteMinistry error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getBacksliders(_req: Request, res: Response): Promise<void> {
  try {
    const backsliders = await listBacksliders();
    res.json(backsliders);
  } catch (err) {
    console.error('getBacksliders error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function postBackslider(req: Request, res: Response): Promise<void> {
  const name = req.body?.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Field "name" is required' });
    return;
  }

  try {
    const backslider = await createBackslider({ name: name.trim() });
    res.status(201).json(backslider);
  } catch (err) {
    console.error('postBackslider error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function patchBackslider(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid backslider id' });
    return;
  }

  try {
    const backslider = await updateBackslider(id, { name: req.body?.name });
    if (!backslider) {
      res.status(404).json({ error: 'Backslider not found' });
      return;
    }
    res.json(backslider);
  } catch (err) {
    console.error('patchBackslider error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function deleteBacksliderHandler(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid backslider id' });
    return;
  }

  try {
    const deleted = await deleteBackslider(id);
    if (!deleted) {
      res.status(404).json({ error: 'Backslider not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error('deleteBackslider error', err);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function getNextWeekGlobal(req: Request, res: Response): Promise<void> {
  try {
    const assignments = await getNextWeekGlobalAssignments();
    res.json({ days: assignments });
  } catch (err) {
    console.error('getNextWeekGlobal error', err);
    res.status(500).json({ error: 'Database error' });
  }
}
