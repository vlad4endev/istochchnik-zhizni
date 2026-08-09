/**
 * Чистые хелперы ИИ-подбора песен в студии.
 * Вынесены отдельно, чтобы тестировать ранжирование без БД/LLM.
 */

import { hashStringToSeed, mulberry32 } from './feedRanking';

/** `auto` — основной режим для UI: тема + сильная ротация без выбора пользователя. */
export type SongPickMode = 'auto' | 'fresh' | 'balanced' | 'classic';

export type SlotRole = 'opening' | 'worship' | 'response' | 'closing' | 'general';

export type CatalogSongBase = {
  id: number;
  title: string;
  song_number: number | null;
  default_key: string | null;
  tempo: number | null;
  tags: string[];
  excerpt: string;
  /** 0..1 от FTS; 0 если песня добавлена как fill. */
  relevance: number;
};

export type SongUsageStats = {
  song_id: number;
  usage_count_6m: number;
  last_used_date: string | null;
  days_since_last_use: number | null;
};

export type RankedCatalogSong = CatalogSongBase & {
  usage_count_6m: number;
  last_used_date: string | null;
  days_since_last_use: number | null;
  /** Итоговый score для порядка в промпте / fallback. */
  pick_score: number;
  /** Песня в жёстком cooldown (недавно пели). */
  on_cooldown: boolean;
};

export type ModePolicy = {
  mode: SongPickMode;
  /** Жёстко исключать песни, певшиеся за последние N дней (для primary). */
  hardCooldownDays: number;
  temperature: number;
  /** Вес «свежести» (давно не пели) в score. */
  freshnessWeight: number;
  /** Вес тематической релевантности. */
  relevanceWeight: number;
  /** Шум перемешивания (0..1) — чем выше, тем разнообразнее порядок. */
  shuffleNoise: number;
  /**
   * Для `auto`: смешать score нескольких политик в фоне
   * (свежесть + баланс), без второго LLM-вызова.
   */
  blendModes?: Array<'fresh' | 'balanced'>;
  labelRu: string;
};

export function resolvePickMode(raw: unknown): SongPickMode {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (v === 'fresh' || v === 'свежий') return 'fresh';
  if (v === 'balanced' || v === 'баланс') return 'balanced';
  if (v === 'classic' || v === 'классика' || v === 'familiar') return 'classic';
  // По умолчанию и для UI — авто: тема + ротация в фоне
  return 'auto';
}

export function modePolicy(mode: SongPickMode): ModePolicy {
  switch (mode) {
    case 'fresh':
      return {
        mode,
        hardCooldownDays: 28,
        temperature: 0.78,
        freshnessWeight: 0.55,
        relevanceWeight: 0.35,
        shuffleNoise: 0.45,
        labelRu: 'Свежий',
      };
    case 'classic':
      return {
        mode,
        hardCooldownDays: 10,
        temperature: 0.42,
        freshnessWeight: 0.15,
        relevanceWeight: 0.55,
        shuffleNoise: 0.18,
        labelRu: 'Классика',
      };
    case 'balanced':
      return {
        mode,
        hardCooldownDays: 18,
        temperature: 0.6,
        freshnessWeight: 0.4,
        relevanceWeight: 0.45,
        shuffleNoise: 0.32,
        labelRu: 'Сбалансированный',
      };
    default:
      // Авто: сильная ротация + тема; в ранжировании смешиваем fresh+balanced
      return {
        mode: 'auto',
        hardCooldownDays: 24,
        temperature: 0.72,
        freshnessWeight: 0.5,
        relevanceWeight: 0.42,
        shuffleNoise: 0.4,
        blendModes: ['fresh', 'balanced'],
        labelRu: 'Авто',
      };
  }
}

/** Роль слота по названию блока программы — для литургической дуги. */
export function inferSlotRole(title: string): SlotRole {
  const t = title.toLowerCase();
  if (/(вступ|открыт|call\s*to|привет|начало|intro|opening)/i.test(t)) return 'opening';
  if (/(закр|благослов|отправ|отправл|финал|closing|benedict|отправл)/i.test(t)) return 'closing';
  if (/(отклик|после\s*проповед|response|invitation|призыв|покаян)/i.test(t)) return 'response';
  if (/(поклон|хвал|прославл|worship|praise|адр|adoration)/i.test(t)) return 'worship';
  return 'general';
}

export function roleHintRu(role: SlotRole): string {
  switch (role) {
    case 'opening':
      return 'открытие / призыв к поклонению (обычно бодрее)';
    case 'worship':
      return 'поклонение / хвала (середина, глубина)';
    case 'response':
      return 'отклик на проповедь (тише, личнее)';
    case 'closing':
      return 'закрытие / благословение (завершение)';
    default:
      return 'общий музыкальный блок';
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/** Свежесть: давно не пели → ближе к 1; пели вчера → 0. Никогда не пели → 1. */
export function freshnessScore(daysSinceLastUse: number | null): number {
  if (daysSinceLastUse == null) return 1;
  if (daysSinceLastUse <= 0) return 0;
  // Плато около 90 дней
  return clamp01(daysSinceLastUse / 90);
}

/** Штраф за частоту за 6 месяцев. */
export function frequencyPenalty(usageCount6m: number): number {
  if (usageCount6m <= 0) return 0;
  if (usageCount6m === 1) return 0.08;
  if (usageCount6m === 2) return 0.16;
  if (usageCount6m <= 4) return 0.28;
  return Math.min(0.5, 0.12 * usageCount6m);
}

export function computePickScore(
  song: Pick<CatalogSongBase, 'relevance'> &
    Pick<SongUsageStats, 'usage_count_6m' | 'days_since_last_use'>,
  policy: ModePolicy,
  noise01: number,
): number {
  const relevance = clamp01(song.relevance);
  const fresh = freshnessScore(song.days_since_last_use);
  const freqPen = frequencyPenalty(song.usage_count_6m);
  const base =
    policy.relevanceWeight * relevance +
    policy.freshnessWeight * fresh -
    freqPen +
    policy.shuffleNoise * (noise01 - 0.5);
  return base;
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T12:00:00Z`);
  const b = Date.parse(`${toYmd}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function rankCatalogForPick(args: {
  catalog: CatalogSongBase[];
  usageBySongId: Map<number, SongUsageStats>;
  policy: ModePolicy;
  seed: string;
  todayYmd: string;
  /** Песни, которые нельзя предлагать как primary (недавние + exclude). */
  hardAvoidIds: Set<number>;
}): RankedCatalogSong[] {
  const rng = mulberry32(hashStringToSeed(`songpick:${args.seed}`));
  const blendPolicies =
    args.policy.blendModes && args.policy.blendModes.length > 0
      ? args.policy.blendModes.map((m) => modePolicy(m))
      : null;

  const ranked: RankedCatalogSong[] = args.catalog.map((song) => {
    const usage = args.usageBySongId.get(song.id);
    const days =
      usage?.days_since_last_use ??
      (usage?.last_used_date ? daysBetween(usage.last_used_date, args.todayYmd) : null);
    const usage_count_6m = usage?.usage_count_6m ?? 0;
    const on_cooldown = args.hardAvoidIds.has(song.id);
    const noise = rng();
    const stats = {
      relevance: song.relevance,
      usage_count_6m,
      days_since_last_use: days,
    };
    // auto: в фоне смешиваем «свежий» и «баланс» без второго LLM-вызова
    let pick_score: number;
    if (blendPolicies) {
      const sum = blendPolicies.reduce((acc, p) => acc + computePickScore(stats, p, noise), 0);
      pick_score = sum / blendPolicies.length;
    } else {
      pick_score = computePickScore(stats, args.policy, noise);
    }
    return {
      ...song,
      usage_count_6m,
      last_used_date: usage?.last_used_date ?? null,
      days_since_last_use: days,
      pick_score: on_cooldown ? pick_score - 1.5 : pick_score,
      on_cooldown,
    };
  });

  ranked.sort((a, b) => {
    if (a.on_cooldown !== b.on_cooldown) return a.on_cooldown ? 1 : -1;
    if (b.pick_score !== a.pick_score) return b.pick_score - a.pick_score;
    return a.title.localeCompare(b.title, 'ru');
  });
  return ranked;
}

/** Выбрать альтернативы к primary из уже ранжированного каталога. */
export function pickAlternativesForSong(args: {
  primaryId: number;
  ranked: RankedCatalogSong[];
  usedIds: Set<number>;
  limit?: number;
}): RankedCatalogSong[] {
  const limit = args.limit ?? 2;
  const primary = args.ranked.find((s) => s.id === args.primaryId);
  const out: RankedCatalogSong[] = [];
  for (const song of args.ranked) {
    if (out.length >= limit) break;
    if (song.id === args.primaryId) continue;
    if (args.usedIds.has(song.id)) continue;
    if (song.on_cooldown) continue;
    // Предпочитаем пересечение тегов / близкую релевантность
    if (primary) {
      const tagOverlap = song.tags.filter((t) => primary.tags.includes(t)).length;
      const sameKey =
        primary.default_key &&
        song.default_key &&
        primary.default_key.toLowerCase() === song.default_key.toLowerCase();
      // берём всё подряд из топа, но слегка приоритезируем overlap через уже отсортированный список;
      // дополнительный soft-gate: если relevance сильно ниже и нет overlap — пропускаем, пока есть выбор
      if (song.relevance + 0.15 < primary.relevance && tagOverlap === 0 && !sameKey && out.length === 0) {
        // всё равно можно взять позже как fill
      }
    }
    out.push(song);
  }
  // Если мало — добираем даже с cooldown (кроме primary/used)
  if (out.length < limit) {
    for (const song of args.ranked) {
      if (out.length >= limit) break;
      if (song.id === args.primaryId) continue;
      if (args.usedIds.has(song.id)) continue;
      if (out.some((s) => s.id === song.id)) continue;
      out.push(song);
    }
  }
  return out;
}

export function buildVariationSeed(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) return raw.trim().slice(0, 64);
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(Math.trunc(raw));
  // Новый seed на каждый запрос — «Другой вариант» даёт другой порядок каталога
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function normalizeExcludeSongIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    const id = Number(item);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.slice(0, 80);
}
