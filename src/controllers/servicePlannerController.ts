import type { Request, Response } from 'express';
import { query } from '../config/db';
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
    res.status(204).send();
  } catch (e) {
    console.error('[service-planner] deleteServicePlanById:', e);
    res.status(500).json({ error: 'Не удалось удалить план' });
  }
}
