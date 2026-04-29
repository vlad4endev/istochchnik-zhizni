import type { Request, Response } from 'express';
import { query } from '../config/db';
import { notifyRealtime } from '../realtime/notify';
import { listUsers } from '../services/userService';
import {
  createPlan,
  createTemplate,
  createBlock,
  deletePlan,
  deleteBlock,
  deleteTemplate,
  getPlanDetails,
  getServicePlanIdForBlock,
  getTemplateDetails,
  listBlockTypes,
  listPlans,
  listTemplates,
  markServicePlanLastEdited,
  patchBlock,
  patchPlan,
  patchTemplate,
  reorderBlocks,
} from '../services/servicePlannerService';

function parseId(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function parseDateYmd(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function parseTimeHm(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!/^\d{2}:\d{2}$/.test(s)) return null;
  return s;
}

function isPlannerManager(req: Request): boolean {
  const role = String(req.authUserRole ?? 'member').toLowerCase();
  if (role === 'admin' || role === 'minister') return true;
  const roles = Array.isArray(req.authUserRoles) ? req.authUserRoles : [];
  return roles.includes('admin') || roles.includes('minister');
}

function ensurePlannerManager(req: Request, res: Response): boolean {
  if (!isPlannerManager(req)) {
    res.status(403).json({ error: 'Недостаточно прав (только администратор или служитель)' });
    return false;
  }
  return true;
}

function hasMinistryRole(raw: unknown, roleName: string): boolean {
  const normalize = (v: string) => v.trim().toLowerCase().replace(/ё/g, 'е');
  const target = normalize(roleName);
  return String(raw ?? '')
    .split(/[;,]/)
    .map((s) => normalize(s))
    .some((s) => s === target || s.includes(target));
}

async function ensureTemplateManager(req: Request, res: Response): Promise<boolean> {
  if (isPlannerManager(req)) return true;
  if (!req.authUserId) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return false;
  }
  try {
    const r = await query(`select ministry_role from public.members where id = $1 limit 1`, [req.authUserId]);
    const row = r.rows[0] as { ministry_role?: string | null } | undefined;
    if (row && hasMinistryRole(row.ministry_role, 'Ведущий')) return true;
  } catch (e) {
    console.error('[service-planner] ensureTemplateManager lookup failed:', e);
  }
  res.status(403).json({ error: 'Недостаточно прав (админ или ведущий)' });
  return false;
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function notifyServicePlannerRealtime(): void {
  notifyRealtime(['service-planner']);
}

function formatRuDateFromYmd(ymd: string): string {
  const dt = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return ymd;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(dt);
}

async function syncBroadcastFromPublishedPlan(planId: number): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS broadcasts (
      id BIGSERIAL PRIMARY KEY,
      title VARCHAR(255),
      description TEXT,
      starts_at TIMESTAMP,
      source_service_plan_id BIGINT,
      platform VARCHAR(20) NOT NULL DEFAULT 'youtube',
      stream_url TEXT,
      notify_members BOOLEAN NOT NULL DEFAULT TRUE,
      is_public BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
      notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS source_service_plan_id BIGINT`);
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcasts_source_service_plan_id
      ON broadcasts (source_service_plan_id)
      WHERE source_service_plan_id IS NOT NULL`,
  );

  const planRes = await query(
    `select
       p.id,
       p.service_date::text as service_date,
       to_char(p.start_time, 'HH24:MI') as start_time,
       p.status,
       coalesce(nullif(trim(concat(coalesce(preacher.first_name, ''), ' ', coalesce(preacher.last_name, ''))), ''), preacher.name) as preacher_name
     from public.service_plans p
     left join public.members preacher on preacher.id = p.preacher_member_id
     where p.status = 'published'
       and coalesce(p.is_archived, false) = false
       and (p.service_date::timestamp + p.start_time) >= (now() - interval '6 hours')
     order by (p.service_date::timestamp + p.start_time) asc
     limit 1`,
  );
  const plan = planRes.rows[0] as
    | {
        id: number;
        service_date: string;
        start_time: string;
        status: 'draft' | 'published';
        preacher_name: string | null;
      }
    | undefined;
  if (!plan || plan.status !== 'published') return;

  const sermonRes = await query(
    `select b.content_json
     from public.service_blocks b
     left join public.block_types bt on bt.id = b.block_type_id
     where b.service_plan_id = $1
       and bt.code = 'sermon'
     order by b.order_index asc, b.id asc
     limit 1`,
    [planId],
  );
  const sermonRow = sermonRes.rows[0] as { content_json?: Record<string, unknown> } | undefined;
  const sermonTopic = String(sermonRow?.content_json?.sermon_topic ?? '').trim();
  const sermonScripture = String(sermonRow?.content_json?.sermon_scripture ?? '').trim();
  const preacher = String(plan.preacher_name ?? '').trim() || 'Не назначен';
  const ruDate = formatRuDateFromYmd(plan.service_date);
  const title = `Воскресное собрание | ${ruDate}`;
  const startsAt = `${plan.service_date} ${plan.start_time}:00`;
  const description = [
    `Проповедник: ${preacher}`,
    `Тема: ${sermonTopic || '—'}`,
    `Стих: ${sermonScripture || '—'}`,
  ].join('\n');

  await query(
    `insert into broadcasts (title, description, starts_at, status, source_service_plan_id, notify_members)
     values ($1, $2, $3::timestamp, 'scheduled', $4, true)
     on conflict (source_service_plan_id)
     do update set
       title = excluded.title,
       description = excluded.description,
       starts_at = excluded.starts_at,
       status = 'scheduled',
       updated_at = now()`,
    [title, description, startsAt, planId],
  );
  notifyRealtime(['broadcast']);
}

async function isPlanPublished(planId: number): Promise<boolean> {
  const res = await query(`select status from public.service_plans where id = $1 limit 1`, [planId]);
  const status = String((res.rows[0] as { status?: string } | undefined)?.status ?? 'draft');
  return status === 'published';
}

export async function getServiceBlockTypes(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await listBlockTypes());
  } catch (e) {
    console.error('[service-planner] getServiceBlockTypes:', e);
    res.status(500).json({ error: 'Не удалось получить типы блоков' });
  }
}

export async function getServicePlannerMembers(req: Request, res: Response): Promise<void> {
  if (!ensurePlannerManager(req, res)) return;
  try {
    const users = await listUsers();
    res.json(users.filter((u) => u.is_active));
  } catch (e) {
    console.error('[service-planner] getServicePlannerMembers:', e);
    res.status(500).json({ error: 'Не удалось получить список участников' });
  }
}

export async function getServiceTemplates(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await listTemplates());
  } catch (e) {
    console.error('[service-planner] getServiceTemplates:', e);
    res.status(500).json({ error: 'Не удалось получить шаблоны' });
  }
}

export async function postServiceTemplate(req: Request, res: Response): Promise<void> {
  if (!(await ensureTemplateManager(req, res))) return;
  const body = parseJsonObject(req.body);
  const name = String(body.name ?? '').trim();
  if (!name) {
    res.status(400).json({ error: 'Поле "name" обязательно' });
    return;
  }

  const blocksInput = Array.isArray(body.blocks) ? body.blocks : [];
  try {
    const blocks = blocksInput.map((raw, idx) => {
      const o = parseJsonObject(raw);
      const blockTypeId = parseId(o.block_type_id);
      const duration = Number(o.duration_minutes ?? 5);
      if (!blockTypeId) {
        throw new Error(`Некорректный block_type_id в блоке #${idx + 1}`);
      }
      return {
        block_type_id: blockTypeId,
        title: String(o.title ?? '').trim() || `Блок ${idx + 1}`,
        order_index: Number.isInteger(Number(o.order_index)) ? Number(o.order_index) : idx,
        duration_minutes: Number.isFinite(duration) ? Math.max(1, Math.round(duration)) : 5,
        default_song_id: o.default_song_id == null ? null : parseId(o.default_song_id),
        default_content_json: parseJsonObject(o.default_content_json),
      };
    });
    const createdId = await createTemplate({
      name,
      description: body.description == null ? null : String(body.description),
      recurrence_rule: parseJsonObject(body.recurrence_rule),
      default_start_time: parseTimeHm(body.default_start_time) ?? '10:00',
      blocks,
      created_by_member_id: req.authUserId!,
    });
    notifyServicePlannerRealtime();
    res.status(201).json({ id: createdId });
  } catch (e) {
    console.error('[service-planner] postServiceTemplate:', e);
    const msg = e instanceof Error ? e.message : 'Не удалось создать шаблон';
    res.status(400).json({ error: msg });
  }
}

export async function getServiceTemplateById(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Некорректный id шаблона' });
    return;
  }
  try {
    const tpl = await getTemplateDetails(id);
    if (!tpl) {
      res.status(404).json({ error: 'Шаблон не найден' });
      return;
    }
    res.json(tpl);
  } catch (e) {
    console.error('[service-planner] getServiceTemplateById:', e);
    res.status(500).json({ error: 'Не удалось получить шаблон' });
  }
}

export async function patchServiceTemplateById(req: Request, res: Response): Promise<void> {
  if (!(await ensureTemplateManager(req, res))) return;
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Некорректный id шаблона' });
    return;
  }
  const body = parseJsonObject(req.body);
  const name = String(body.name ?? '').trim();
  if (!name) {
    res.status(400).json({ error: 'Поле "name" обязательно' });
    return;
  }
  const blocksInput = Array.isArray(body.blocks) ? body.blocks : [];
  try {
    const blocks = blocksInput.map((raw, idx) => {
      const o = parseJsonObject(raw);
      const blockTypeId = parseId(o.block_type_id);
      const duration = Number(o.duration_minutes ?? 5);
      if (!blockTypeId) {
        throw new Error(`Некорректный block_type_id в блоке #${idx + 1}`);
      }
      return {
        block_type_id: blockTypeId,
        title: String(o.title ?? '').trim() || `Блок ${idx + 1}`,
        order_index: Number.isInteger(Number(o.order_index)) ? Number(o.order_index) : idx,
        duration_minutes: Number.isFinite(duration) ? Math.max(1, Math.round(duration)) : 5,
        default_song_id: o.default_song_id == null ? null : parseId(o.default_song_id),
        default_content_json: parseJsonObject(o.default_content_json),
      };
    });
    const ok = await patchTemplate(id, {
      name,
      description: body.description == null ? null : String(body.description),
      recurrence_rule: parseJsonObject(body.recurrence_rule),
      default_start_time: parseTimeHm(body.default_start_time) ?? '10:00',
      is_active: body.is_active === false ? false : true,
      blocks,
    });
    if (!ok) {
      res.status(404).json({ error: 'Шаблон не найден' });
      return;
    }
    notifyServicePlannerRealtime();
    res.json({ ok: true });
  } catch (e) {
    console.error('[service-planner] patchServiceTemplateById:', e);
    const msg = e instanceof Error ? e.message : 'Не удалось обновить шаблон';
    res.status(400).json({ error: msg });
  }
}

export async function deleteServiceTemplateById(req: Request, res: Response): Promise<void> {
  if (!(await ensureTemplateManager(req, res))) return;
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Некорректный id шаблона' });
    return;
  }
  try {
    const ok = await deleteTemplate(id);
    if (!ok) {
      res.status(404).json({ error: 'Шаблон не найден' });
      return;
    }
    notifyServicePlannerRealtime();
    res.status(204).send();
  } catch (e) {
    console.error('[service-planner] deleteServiceTemplateById:', e);
    res.status(500).json({ error: 'Не удалось удалить шаблон' });
  }
}

export async function getServicePlans(req: Request, res: Response): Promise<void> {
  const from = parseDateYmd(req.query.from);
  const to = parseDateYmd(req.query.to);
  const includeArchived =
    req.query.include_archived === '1' ||
    req.query.include_archived === 'true';
  try {
    res.json(
      await listPlans({
        from: from ?? undefined,
        to: to ?? undefined,
        include_archived: includeArchived,
      }),
    );
  } catch (e) {
    console.error('[service-planner] getServicePlans:', e);
    res.status(500).json({ error: 'Не удалось получить планы' });
  }
}

export async function getServicePlanById(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Некорректный id плана' });
    return;
  }
  try {
    const plan = await getPlanDetails(id);
    if (!plan) {
      res.status(404).json({ error: 'План не найден' });
      return;
    }
    res.json(plan);
  } catch (e) {
    console.error('[service-planner] getServicePlanById:', e);
    res.status(500).json({ error: 'Не удалось получить план' });
  }
}

export async function postServicePlan(req: Request, res: Response): Promise<void> {
  if (!ensurePlannerManager(req, res)) return;
  const body = parseJsonObject(req.body);
  const templateId = parseId(body.template_id);
  const date = parseDateYmd(body.service_date);
  if (!templateId || !date) {
    res.status(400).json({ error: 'Нужны поля "template_id" и "service_date"' });
    return;
  }
  try {
    const id = await createPlan({
      template_id: templateId,
      service_date: date,
      start_time: parseTimeHm(body.start_time) ?? undefined,
      leader_member_id: body.leader_member_id == null ? null : parseId(body.leader_member_id),
      preacher_member_id: body.preacher_member_id == null ? null : parseId(body.preacher_member_id),
      created_by_member_id: req.authUserId!,
    });
    if (req.authUserId) {
      try {
        await markServicePlanLastEdited(id, req.authUserId);
      } catch (e) {
        console.error('[service-planner] mark last edited (create plan):', e);
      }
    }
    notifyServicePlannerRealtime();
    res.status(201).json({ id });
  } catch (e) {
    console.error('[service-planner] postServicePlan:', e);
    const msg = e instanceof Error ? e.message : 'Не удалось создать план';
    res.status(400).json({ error: msg });
  }
}

export async function patchServicePlanById(req: Request, res: Response): Promise<void> {
  if (!ensurePlannerManager(req, res)) return;
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Некорректный id плана' });
    return;
  }
  const body = parseJsonObject(req.body);
  const patch: Parameters<typeof patchPlan>[1] = {};
  if (body.service_date !== undefined) {
    const d = parseDateYmd(body.service_date);
    if (!d) {
      res.status(400).json({ error: 'service_date должен быть YYYY-MM-DD' });
      return;
    }
    patch.service_date = d;
  }
  if (body.start_time !== undefined) {
    const t = parseTimeHm(body.start_time);
    if (!t) {
      res.status(400).json({ error: 'start_time должен быть HH:mm' });
      return;
    }
    patch.start_time = t;
  }
  if (body.status !== undefined) {
    if (body.status !== 'draft' && body.status !== 'published') {
      res.status(400).json({ error: 'status должен быть draft или published' });
      return;
    }
    patch.status = body.status;
  }
  if (body.is_archived !== undefined) {
    if (typeof body.is_archived !== 'boolean') {
      res.status(400).json({ error: 'is_archived должен быть boolean' });
      return;
    }
    patch.is_archived = body.is_archived;
  }
  if (body.leader_member_id !== undefined) {
    patch.leader_member_id = body.leader_member_id == null ? null : parseId(body.leader_member_id);
  }
  if (body.preacher_member_id !== undefined) {
    patch.preacher_member_id =
      body.preacher_member_id == null ? null : parseId(body.preacher_member_id);
  }
  if (body.current_block_id !== undefined) {
    patch.current_block_id = body.current_block_id == null ? null : parseId(body.current_block_id);
  }
  if (body.notes !== undefined) {
    patch.notes = body.notes == null ? null : String(body.notes);
  }
  const hadPatch = Object.keys(patch).length > 0;
  try {
    const beforeRes = await query(`select status from public.service_plans where id = $1 limit 1`, [id]);
    const previousStatus = String((beforeRes.rows[0] as { status?: string } | undefined)?.status ?? 'draft');
    const ok = await patchPlan(id, patch);
    if (!ok) {
      res.status(404).json({ error: 'План не найден' });
      return;
    }
    if (hadPatch && req.authUserId) {
      try {
        await markServicePlanLastEdited(id, req.authUserId);
      } catch (e) {
        console.error('[service-planner] mark last edited (patch plan):', e);
      }
    }
    const shouldSyncBroadcast =
      patch.status === 'published' ||
      previousStatus === 'published' ||
      (patch.status === undefined && hadPatch);
    if (shouldSyncBroadcast) {
      try {
        await syncBroadcastFromPublishedPlan(id);
      } catch (syncErr) {
        console.error('[service-planner] syncBroadcastFromPublishedPlan:', syncErr);
      }
    }
    notifyServicePlannerRealtime();
    res.json({ ok: true });
  } catch (e) {
    console.error('[service-planner] patchServicePlanById:', e);
    res.status(500).json({ error: 'Не удалось обновить план' });
  }
}

export async function patchServiceBlocksReorder(req: Request, res: Response): Promise<void> {
  if (!ensurePlannerManager(req, res)) return;
  const body = parseJsonObject(req.body);
  const servicePlanId = parseId(body.service_plan_id);
  const orderedBlockIdsRaw = Array.isArray(body.ordered_block_ids) ? body.ordered_block_ids : [];
  const orderedBlockIds = orderedBlockIdsRaw.map((v) => parseId(v)).filter((v): v is number => Boolean(v));
  if (!servicePlanId || orderedBlockIds.length === 0 || orderedBlockIds.length !== orderedBlockIdsRaw.length) {
    res.status(400).json({ error: 'Нужны service_plan_id и ordered_block_ids[]' });
    return;
  }
  try {
    await reorderBlocks(servicePlanId, orderedBlockIds);
    if (req.authUserId) {
      try {
        await markServicePlanLastEdited(servicePlanId, req.authUserId);
      } catch (e) {
        console.error('[service-planner] mark last edited (reorder):', e);
      }
    }
    if (await isPlanPublished(servicePlanId)) {
      try {
        await syncBroadcastFromPublishedPlan(servicePlanId);
      } catch (syncErr) {
        console.error('[service-planner] syncBroadcastFromPublishedPlan (reorder):', syncErr);
      }
    }
    notifyServicePlannerRealtime();
    res.json({ ok: true });
  } catch (e) {
    console.error('[service-planner] patchServiceBlocksReorder:', e);
    const msg = e instanceof Error ? e.message : 'Не удалось изменить порядок блоков';
    res.status(400).json({ error: msg });
  }
}

export async function patchServiceBlockById(req: Request, res: Response): Promise<void> {
  if (!ensurePlannerManager(req, res)) return;
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Некорректный id блока' });
    return;
  }
  const body = parseJsonObject(req.body);
  const patch: Parameters<typeof patchBlock>[1] = {};
  if (body.title !== undefined) patch.title = String(body.title ?? '').trim();
  if (body.block_type_id !== undefined) {
    const v = parseId(body.block_type_id);
    if (!v) {
      res.status(400).json({ error: 'block_type_id должен быть положительным числом' });
      return;
    }
    patch.block_type_id = v;
  }
  if (body.duration_minutes !== undefined) {
    const d = Number(body.duration_minutes);
    if (!Number.isFinite(d) || d <= 0) {
      res.status(400).json({ error: 'duration_minutes должен быть > 0' });
      return;
    }
    patch.duration_minutes = Math.round(d);
  }
  if (body.assigned_member_id !== undefined) {
    patch.assigned_member_id = body.assigned_member_id == null ? null : parseId(body.assigned_member_id);
  }
  if (body.song_id !== undefined) {
    patch.song_id = body.song_id == null ? null : parseId(body.song_id);
  }
  if (body.content_json !== undefined) {
    patch.content_json = parseJsonObject(body.content_json);
  }
  const hadBlockPatch = Object.keys(patch).length > 0;
  try {
    const planId = hadBlockPatch ? await getServicePlanIdForBlock(id) : null;
    const ok = await patchBlock(id, patch);
    if (!ok) {
      res.status(404).json({ error: 'Блок не найден' });
      return;
    }
    if (hadBlockPatch && planId && req.authUserId) {
      try {
        await markServicePlanLastEdited(planId, req.authUserId);
      } catch (e) {
        console.error('[service-planner] mark last edited (patch block):', e);
      }
    }
    if (planId && (await isPlanPublished(planId))) {
      try {
        await syncBroadcastFromPublishedPlan(planId);
      } catch (syncErr) {
        console.error('[service-planner] syncBroadcastFromPublishedPlan (patch block):', syncErr);
      }
    }
    notifyServicePlannerRealtime();
    res.json({ ok: true });
  } catch (e) {
    console.error('[service-planner] patchServiceBlockById:', e);
    res.status(500).json({ error: 'Не удалось обновить блок' });
  }
}

export async function postServiceBlock(req: Request, res: Response): Promise<void> {
  if (!ensurePlannerManager(req, res)) return;
  const body = parseJsonObject(req.body);
  const servicePlanId = parseId(body.service_plan_id);
  const blockTypeId = parseId(body.block_type_id);
  const duration = Number(body.duration_minutes ?? 5);
  if (!servicePlanId || !blockTypeId) {
    res.status(400).json({ error: 'Нужны service_plan_id и block_type_id' });
    return;
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    res.status(400).json({ error: 'duration_minutes должен быть > 0' });
    return;
  }
  try {
    const id = await createBlock({
      service_plan_id: servicePlanId,
      block_type_id: blockTypeId,
      title: String(body.title ?? '').trim() || 'Новый блок',
      duration_minutes: Math.round(duration),
      assigned_member_id: body.assigned_member_id == null ? null : parseId(body.assigned_member_id),
      song_id: body.song_id == null ? null : parseId(body.song_id),
      content_json: parseJsonObject(body.content_json),
    });
    if (req.authUserId) {
      try {
        await markServicePlanLastEdited(servicePlanId, req.authUserId);
      } catch (e) {
        console.error('[service-planner] mark last edited (create block):', e);
      }
    }
    if (await isPlanPublished(servicePlanId)) {
      try {
        await syncBroadcastFromPublishedPlan(servicePlanId);
      } catch (syncErr) {
        console.error('[service-planner] syncBroadcastFromPublishedPlan (create block):', syncErr);
      }
    }
    notifyServicePlannerRealtime();
    res.status(201).json({ id });
  } catch (e) {
    console.error('[service-planner] postServiceBlock:', e);
    res.status(500).json({ error: 'Не удалось создать блок' });
  }
}

export async function deleteServiceBlockById(req: Request, res: Response): Promise<void> {
  if (!ensurePlannerManager(req, res)) return;
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Некорректный id блока' });
    return;
  }
  try {
    const planId = await getServicePlanIdForBlock(id);
    const ok = await deleteBlock(id);
    if (!ok) {
      res.status(404).json({ error: 'Блок не найден' });
      return;
    }
    if (planId && req.authUserId) {
      try {
        await markServicePlanLastEdited(planId, req.authUserId);
      } catch (e) {
        console.error('[service-planner] mark last edited (delete block):', e);
      }
    }
    if (planId && (await isPlanPublished(planId))) {
      try {
        await syncBroadcastFromPublishedPlan(planId);
      } catch (syncErr) {
        console.error('[service-planner] syncBroadcastFromPublishedPlan (delete block):', syncErr);
      }
    }
    notifyServicePlannerRealtime();
    res.status(204).send();
  } catch (e) {
    console.error('[service-planner] deleteServiceBlockById:', e);
    res.status(500).json({ error: 'Не удалось удалить блок' });
  }
}

export async function deleteServicePlanById(req: Request, res: Response): Promise<void> {
  if (!ensurePlannerManager(req, res)) return;
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Некорректный id плана' });
    return;
  }
  try {
    const ok = await deletePlan(id);
    if (!ok) {
      res.status(404).json({ error: 'План не найден' });
      return;
    }
    notifyServicePlannerRealtime();
    res.status(204).send();
  } catch (e) {
    console.error('[service-planner] deleteServicePlanById:', e);
    res.status(500).json({ error: 'Не удалось удалить план' });
  }
}
