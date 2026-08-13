import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';

import {
  createFullBackup,
  deleteBackup,
  getBackupSettingsAdminView,
  isBackupCreateRunning,
  listBackups,
  resolveDownloadPath,
  sendBackupViaTelegram,
  applyRetention,
} from '../services/backupService';
import {
  patchBackupSettings,
  type BackupSettingsPatch,
  type BackupTelegramTarget,
} from '../services/backupSettingsService';

type AuthRequest = Request & { authUserId?: number; authUserRole?: string; authUserRoles?: string[] };

function ensureAdmin(req: Request, res: Response): AuthRequest | null {
  const r = req as AuthRequest;
  if (!r.authUserId) {
    res.status(401).json({ error: 'Требуется вход в аккаунт' });
    return null;
  }
  const roles = Array.isArray(r.authUserRoles) ? r.authUserRoles : [];
  if (r.authUserRole !== 'admin' && !roles.includes('admin')) {
    res.status(403).json({ error: 'Только администратор имеет доступ' });
    return null;
  }
  return r;
}

function mapBackupError(error: unknown): { status: number; error: string } {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg === 'backup_already_running') {
    return { status: 409, error: 'Создание бекапа уже выполняется. Дождитесь завершения.' };
  }
  if (msg === 'invalid_backup_id' || msg === 'invalid_backup_path') {
    return { status: 400, error: 'Некорректный идентификатор бекапа' };
  }
  if (msg === 'backup_not_found') {
    return { status: 404, error: 'Бекап не найден' };
  }
  if (msg === 'invalid_schedule_time') {
    return { status: 400, error: 'Время должно быть в формате HH:MM' };
  }
  if (msg === 'backup_script_missing') {
    return { status: 500, error: 'Скрипт scripts/backup.sh не найден на сервере' };
  }
  if (msg.startsWith('backup_script_failed:')) {
    return { status: 500, error: `Ошибка создания бекапа: ${msg.slice('backup_script_failed:'.length).slice(0, 500)}` };
  }
  if (msg.startsWith('telegram_')) {
    return { status: 400, error: `Telegram: ${msg}` };
  }
  console.error('[backup]', error);
  return { status: 500, error: 'Операция с бекапом не удалась' };
}

export async function getBackupSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const settings = await getBackupSettingsAdminView();
    res.json({
      settings,
      running: isBackupCreateRunning(),
    });
  } catch (error) {
    const mapped = mapBackupError(error);
    res.status(mapped.status).json({ error: mapped.error });
  }
}

export async function patchBackupSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: BackupSettingsPatch = {};

  if (body.auto_enabled !== undefined) {
    if (typeof body.auto_enabled !== 'boolean') {
      res.status(400).json({ error: 'auto_enabled должен быть boolean' });
      return;
    }
    patch.auto_enabled = body.auto_enabled;
  }
  if (body.schedule_time !== undefined) {
    if (typeof body.schedule_time !== 'string') {
      res.status(400).json({ error: 'schedule_time должен быть строкой HH:MM' });
      return;
    }
    patch.schedule_time = body.schedule_time;
  }
  if (body.schedule_kind !== undefined) {
    if (body.schedule_kind !== 'daily' && body.schedule_kind !== 'weekly') {
      res.status(400).json({ error: 'schedule_kind: daily | weekly' });
      return;
    }
    patch.schedule_kind = body.schedule_kind;
  }
  if (body.schedule_weekdays !== undefined) {
    if (!Array.isArray(body.schedule_weekdays)) {
      res.status(400).json({ error: 'schedule_weekdays должен быть массивом чисел 0–6' });
      return;
    }
    patch.schedule_weekdays = body.schedule_weekdays.map((v) => Number(v));
  }
  if (body.timezone !== undefined) {
    if (typeof body.timezone !== 'string') {
      res.status(400).json({ error: 'timezone должен быть строкой' });
      return;
    }
    patch.timezone = body.timezone;
  }
  if (body.telegram_send !== undefined) {
    if (typeof body.telegram_send !== 'boolean') {
      res.status(400).json({ error: 'telegram_send должен быть boolean' });
      return;
    }
    patch.telegram_send = body.telegram_send;
  }
  if (body.telegram_target !== undefined) {
    const t = body.telegram_target;
    if (t !== 'admins' && t !== 'default_chat' && t !== 'both') {
      res.status(400).json({ error: 'telegram_target: admins | default_chat | both' });
      return;
    }
    patch.telegram_target = t as BackupTelegramTarget;
  }
  if (body.retention_days !== undefined) {
    if (typeof body.retention_days !== 'number') {
      res.status(400).json({ error: 'retention_days должен быть числом (1–30)' });
      return;
    }
    patch.retention_days = body.retention_days;
  }

  try {
    const doc = await patchBackupSettings(patch);
    if (patch.retention_days !== undefined) {
      await applyRetention(doc.retention_days);
    }
    const settings = await getBackupSettingsAdminView();
    res.json({ settings });
  } catch (error) {
    const mapped = mapBackupError(error);
    res.status(mapped.status).json({ error: mapped.error });
  }
}

export async function listBackupsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const items = await listBackups();
    res.json({
      items,
      running: isBackupCreateRunning(),
    });
  } catch (error) {
    const mapped = mapBackupError(error);
    res.status(mapped.status).json({ error: mapped.error });
  }
}

export async function createBackupHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const body = (req.body ?? {}) as { send_telegram?: unknown };
  const sendTelegram = typeof body.send_telegram === 'boolean' ? body.send_telegram : undefined;
  try {
    const result = await createFullBackup({ sendTelegram, trigger: 'manual' });
    res.status(201).json({
      ok: true,
      backup: result,
      running: false,
    });
  } catch (error) {
    const mapped = mapBackupError(error);
    res.status(mapped.status).json({ error: mapped.error });
  }
}

export async function downloadBackupHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const id = typeof req.params.id === 'string' ? req.params.id : '';
  try {
    const { filePath, fileName } = await resolveDownloadPath(id);
    const abs = path.resolve(filePath);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    const stream = fs.createReadStream(abs);
    stream.on('error', (err) => {
      console.error('[backup] download stream error', err);
      if (!res.headersSent) res.status(500).json({ error: 'Ошибка чтения файла бекапа' });
      else res.end();
    });
    stream.pipe(res);
  } catch (error) {
    const mapped = mapBackupError(error);
    res.status(mapped.status).json({ error: mapped.error });
  }
}

export async function deleteBackupHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const id = typeof req.params.id === 'string' ? req.params.id : '';
  try {
    await deleteBackup(id);
    res.json({ ok: true });
  } catch (error) {
    const mapped = mapBackupError(error);
    res.status(mapped.status).json({ error: mapped.error });
  }
}

export async function sendBackupTelegramHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const id = typeof req.params.id === 'string' ? req.params.id : '';
  const body = (req.body ?? {}) as { telegram_target?: unknown };
  let target: BackupTelegramTarget | undefined;
  if (body.telegram_target !== undefined) {
    const t = body.telegram_target;
    if (t !== 'admins' && t !== 'default_chat' && t !== 'both') {
      res.status(400).json({ error: 'telegram_target: admins | default_chat | both' });
      return;
    }
    target = t;
  }
  try {
    const result = await sendBackupViaTelegram(id, target);
    res.json(result);
  } catch (error) {
    const mapped = mapBackupError(error);
    res.status(mapped.status).json({ error: mapped.error });
  }
}
