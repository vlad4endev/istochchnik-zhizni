import type { Request, Response } from 'express';
import { AiAgentError, chatCompletion } from '../ai';
import { notifyRealtime } from '../realtime/notify';
import { getAiSettingsAdmin, updateAiSettings } from '../services/aiSettingsService';
import { isConnectionPresetId, type AiConnectionPresetId } from '../types/aiConnectionPresets';
import { isAiPromptScopeId, type AiPromptScopeId } from '../types/aiPromptScopes';

type AuthRequest = Request & { authUserId?: number; authUserRole?: string };

function ensureAdmin(req: Request, res: Response): boolean {
  const r = req as AuthRequest;
  if (!r.authUserId) {
    res.status(401).json({ error: 'Требуется вход в аккаунт' });
    return false;
  }
  if (r.authUserRole !== 'admin') {
    res.status(403).json({ error: 'Только администратор может менять настройки ИИ' });
    return false;
  }
  return true;
}

export async function getAiSettingsAdminHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const view = await getAiSettingsAdmin();
    res.json(view);
  } catch (e) {
    console.error('[ai-settings] GET admin error', e);
    res.status(500).json({ error: 'Не удалось загрузить настройки ИИ' });
  }
}

export async function patchAiSettingsHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const body = req.body as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Ожидался JSON-объект с полями настроек' });
    return;
  }

  const patch: {
    enabled?: boolean;
    connection_preset?: AiConnectionPresetId | null;
    base_url?: string | null;
    api_key?: string | null;
    default_model?: string | null;
    system_prompt?: string | null;
    section_prompts?: Partial<Record<AiPromptScopeId, string | null>>;
    temperature?: number | null;
    max_tokens?: number | null;
  } = {};

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') {
      res.status(400).json({ error: 'Поле enabled должно быть boolean' });
      return;
    }
    patch.enabled = body.enabled;
  }
  if (body.connection_preset !== undefined) {
    if (body.connection_preset !== null && typeof body.connection_preset !== 'string') {
      res.status(400).json({ error: 'Поле connection_preset: строка (openai|deepseek|openrouter|custom) или null' });
      return;
    }
    if (body.connection_preset !== null && !isConnectionPresetId(body.connection_preset)) {
      res.status(400).json({ error: 'Неизвестный connection_preset' });
      return;
    }
    patch.connection_preset = body.connection_preset as AiConnectionPresetId | null;
  }
  if (body.base_url !== undefined) {
    if (body.base_url !== null && typeof body.base_url !== 'string') {
      res.status(400).json({ error: 'Поле base_url: строка или null' });
      return;
    }
    patch.base_url = body.base_url as string | null;
  }
  if (body.api_key !== undefined) {
    if (body.api_key !== null && typeof body.api_key !== 'string') {
      res.status(400).json({ error: 'Поле api_key: строка или null' });
      return;
    }
    patch.api_key = body.api_key as string | null;
  }
  if (body.default_model !== undefined) {
    if (body.default_model !== null && typeof body.default_model !== 'string') {
      res.status(400).json({ error: 'Поле default_model: строка или null' });
      return;
    }
    patch.default_model = body.default_model as string | null;
  }
  if (body.system_prompt !== undefined) {
    if (body.system_prompt !== null && typeof body.system_prompt !== 'string') {
      res.status(400).json({ error: 'Поле system_prompt: строка или null' });
      return;
    }
    patch.system_prompt = body.system_prompt as string | null;
  }
  if (body.section_prompts !== undefined) {
    if (body.section_prompts === null || typeof body.section_prompts !== 'object' || Array.isArray(body.section_prompts)) {
      res.status(400).json({ error: 'Поле section_prompts должно быть объектом с промптами по разделам' });
      return;
    }
    const raw = body.section_prompts as Record<string, unknown>;
    const cleaned: Partial<Record<AiPromptScopeId, string | null>> = {};
    for (const key of Object.keys(raw)) {
      if (!isAiPromptScopeId(key)) {
        res.status(400).json({ error: `Неизвестный раздел промпта: ${key}` });
        return;
      }
      const v = raw[key];
      if (v === null) {
        cleaned[key] = null;
      } else if (typeof v === 'string') {
        cleaned[key] = v;
      } else {
        res.status(400).json({ error: `Некорректное значение промпта для раздела «${key}»` });
        return;
      }
    }
    patch.section_prompts = cleaned;
  }
  if (body.temperature !== undefined) {
    if (body.temperature !== null && typeof body.temperature !== 'number') {
      res.status(400).json({ error: 'Поле temperature: число или null' });
      return;
    }
    patch.temperature = body.temperature as number | null;
  }
  if (body.max_tokens !== undefined) {
    if (body.max_tokens !== null && typeof body.max_tokens !== 'number') {
      res.status(400).json({ error: 'Поле max_tokens: число или null' });
      return;
    }
    patch.max_tokens = body.max_tokens as number | null;
  }

  try {
    const view = await updateAiSettings(patch);
    notifyRealtime(['admin']);
    res.json(view);
  } catch (e) {
    console.error('[ai-settings] PATCH error', e);
    res.status(500).json({ error: 'Не удалось сохранить настройки ИИ' });
  }
}

export async function postAiTestHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const body = req.body as { message?: unknown; section?: unknown } | null;
  const rawSection = typeof body?.section === 'string' ? body.section.trim() : '';
  const section = rawSection.length > 0 ? rawSection : undefined;
  if (section !== undefined && !isAiPromptScopeId(section)) {
    res.status(400).json({ error: 'Неизвестный раздел для теста. Выберите id из списка в админке.' });
    return;
  }

  const msg =
    typeof body?.message === 'string' && body.message.trim()
      ? body.message.trim()
      : 'Ответь одним коротким предложением: подтверди, что связь с моделью работает.';

  try {
    const reply = await chatCompletion([{ role: 'user', content: msg }], { section });
    res.json({ ok: true, reply });
  } catch (e) {
    if (e instanceof AiAgentError) {
      const status =
        e.code === 'ai_disabled'
          ? 409
          : e.code === 'ai_not_configured'
            ? 400
            : e.code === 'ai_http_error'
              ? e.status && e.status >= 400 && e.status < 600
                ? e.status
                : 502
              : 502;
      res.status(status).json({
        error: e.message,
        code: e.code,
        details: e.bodySnippet ? { bodySnippet: e.bodySnippet } : undefined,
      });
      return;
    }
    console.error('[ai-settings] test error', e);
    res.status(500).json({ error: 'Не удалось выполнить тестовый запрос' });
  }
}
