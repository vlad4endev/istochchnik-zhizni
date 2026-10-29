import type { Request, Response } from 'express';

import { AiAgentError } from '../ai';
import { buildInternalBibleUrl, parseBibleRef } from '../bible/bibleRefParser';
import {
  getChapterVerses,
  getReadingProgress,
  listBooks,
  listTranslations,
  saveReadingProgress,
  searchVerses,
} from '../services/bibleCatalogService';
import {
  createBibleNote,
  deleteBibleNote,
  listBibleNotes,
  listBibleNotesForChapter,
  updateBibleNote,
} from '../services/bibleNotesService';
import {
  deletePlan,
  getPlan,
  listPlans,
  setPlanDayCompleted,
} from '../services/biblePlansService';
import { generateBibleReadingPlan } from '../services/bibleReadingPlanAiService';
import {
  createChurchCommentary,
  deleteChurchCommentary,
  listCommentariesForChapter,
} from '../services/bibleCommentariesService';
import { getChapterAudio } from '../services/bibleAudioService';

type AuthReq = Request & {
  authUserId?: number;
  authUserRole?: string;
  authUserRoles?: string[];
};

function memberId(req: Request): number | null {
  const id = (req as AuthReq).authUserId;
  return typeof id === 'number' && id > 0 ? id : null;
}

function canEditChurchCommentary(req: Request): boolean {
  const r = req as AuthReq;
  const roles = new Set(
    [r.authUserRole, ...(Array.isArray(r.authUserRoles) ? r.authUserRoles : [])]
      .filter(Boolean)
      .map((x) => String(x).toLowerCase()),
  );
  return roles.has('admin') || roles.has('pastor') || roles.has('editor') || roles.has('minister');
}

export async function bibleTranslationsList(_req: Request, res: Response): Promise<void> {
  try {
    res.json({ translations: await listTranslations() });
  } catch (e) {
    console.error('[bible] translations:', e);
    res.status(500).json({ error: 'Не удалось загрузить переводы' });
  }
}

export async function bibleBooksList(req: Request, res: Response): Promise<void> {
  try {
    const code = String(req.query.translation ?? 'synodal');
    res.json({ books: await listBooks(code) });
  } catch (e) {
    console.error('[bible] books:', e);
    res.status(500).json({ error: 'Не удалось загрузить книги' });
  }
}

export async function bibleChapterGet(req: Request, res: Response): Promise<void> {
  try {
    const translation = String(req.params.translation ?? 'synodal');
    const book = String(req.params.book ?? '');
    const chapter = Number(req.params.chapter);
    const data = await getChapterVerses(translation, book, chapter);
    if (!data) {
      res.status(404).json({ error: 'Глава не найдена' });
      return;
    }
    res.json(data);
  } catch (e) {
    console.error('[bible] chapter:', e);
    res.status(500).json({ error: 'Не удалось загрузить главу' });
  }
}

export async function bibleSearch(req: Request, res: Response): Promise<void> {
  try {
    const translation = String(req.query.translation ?? 'synodal');
    const q = String(req.query.q ?? '');
    const results = await searchVerses(translation, q);
    res.json({ results });
  } catch (e) {
    console.error('[bible] search:', e);
    res.status(500).json({ error: 'Не удалось выполнить поиск' });
  }
}

export async function bibleParseRef(req: Request, res: Response): Promise<void> {
  const q = String(req.query.q ?? req.body?.q ?? '');
  const parsed = parseBibleRef(q);
  if (!parsed) {
    res.status(400).json({ error: 'Не удалось разобрать ссылку', path: buildInternalBibleUrl(q) });
    return;
  }
  res.json({
    book_slug: parsed.book.slug,
    chapter: parsed.chapter,
    verse_start: parsed.verseStart,
    verse_end: parsed.verseEnd,
    path: buildInternalBibleUrl(q),
  });
}

export async function bibleProgressGet(req: Request, res: Response): Promise<void> {
  try {
    const id = memberId(req);
    if (!id) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    const translation = String(req.query.translation ?? 'synodal');
    res.json({ progress: await getReadingProgress(id, translation) });
  } catch (e) {
    console.error('[bible] progress get:', e);
    res.status(500).json({ error: 'Не удалось загрузить прогресс' });
  }
}

export async function bibleProgressPut(req: Request, res: Response): Promise<void> {
  try {
    const id = memberId(req);
    if (!id) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    const body = req.body as {
      translation?: string;
      book_slug?: string;
      chapter?: number;
      verse?: number;
    };
    await saveReadingProgress({
      memberId: id,
      translationCode: String(body.translation ?? 'synodal'),
      bookSlug: String(body.book_slug ?? ''),
      chapter: Number(body.chapter),
      verse: Number(body.verse ?? 1),
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[bible] progress put:', e);
    res.status(500).json({ error: 'Не удалось сохранить прогресс' });
  }
}

export async function bibleNotesList(req: Request, res: Response): Promise<void> {
  try {
    const id = memberId(req);
    if (!id) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    const translation = typeof req.query.translation === 'string' ? req.query.translation : null;
    const book = typeof req.query.book === 'string' ? req.query.book : null;
    const chapter = req.query.chapter != null ? Number(req.query.chapter) : null;
    if (translation && book && chapter != null && Number.isInteger(chapter)) {
      res.json({ notes: await listBibleNotesForChapter(id, translation, book, chapter) });
      return;
    }
    res.json({ notes: await listBibleNotes(id) });
  } catch (e) {
    console.error('[bible] notes list:', e);
    res.status(500).json({ error: 'Не удалось загрузить заметки' });
  }
}

export async function bibleNotesCreate(req: Request, res: Response): Promise<void> {
  try {
    const id = memberId(req);
    if (!id) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const note = await createBibleNote(id, {
      translationCode: String(body.translation ?? 'synodal'),
      bookSlug: String(body.book_slug ?? ''),
      chapter: Number(body.chapter),
      verseStart: Number(body.verse_start ?? body.verse ?? 1),
      verseEnd: body.verse_end != null ? Number(body.verse_end) : undefined,
      body: String(body.body ?? ''),
    });
    res.status(201).json(note);
  } catch (e) {
    console.error('[bible] notes create:', e);
    res.status(500).json({ error: 'Не удалось создать заметку' });
  }
}

export async function bibleNotesUpdate(req: Request, res: Response): Promise<void> {
  try {
    const id = memberId(req);
    if (!id) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    const noteId = Number(req.params.id);
    const body = req.body as Record<string, unknown>;
    const note = await updateBibleNote(id, noteId, {
      body: typeof body.body === 'string' ? body.body : undefined,
      verseStart: body.verse_start != null ? Number(body.verse_start) : undefined,
      verseEnd: body.verse_end != null ? Number(body.verse_end) : undefined,
    });
    if (!note) {
      res.status(404).json({ error: 'Заметка не найдена' });
      return;
    }
    res.json(note);
  } catch (e) {
    console.error('[bible] notes update:', e);
    res.status(500).json({ error: 'Не удалось обновить заметку' });
  }
}

export async function bibleNotesDelete(req: Request, res: Response): Promise<void> {
  try {
    const id = memberId(req);
    if (!id) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    const ok = await deleteBibleNote(id, Number(req.params.id));
    if (!ok) {
      res.status(404).json({ error: 'Заметка не найдена' });
      return;
    }
    res.status(204).send();
  } catch (e) {
    console.error('[bible] notes delete:', e);
    res.status(500).json({ error: 'Не удалось удалить заметку' });
  }
}

export async function biblePlansList(req: Request, res: Response): Promise<void> {
  try {
    const id = memberId(req);
    if (!id) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    res.json({ plans: await listPlans(id) });
  } catch (e) {
    console.error('[bible] plans list:', e);
    res.status(500).json({ error: 'Не удалось загрузить планы' });
  }
}

export async function biblePlansGet(req: Request, res: Response): Promise<void> {
  try {
    const id = memberId(req);
    if (!id) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    const plan = await getPlan(id, Number(req.params.id));
    if (!plan) {
      res.status(404).json({ error: 'План не найден' });
      return;
    }
    res.json(plan);
  } catch (e) {
    console.error('[bible] plans get:', e);
    res.status(500).json({ error: 'Не удалось загрузить план' });
  }
}

export async function biblePlansGenerate(req: Request, res: Response): Promise<void> {
  try {
    const id = memberId(req);
    if (!id) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    const body = req.body as { goal?: string; days?: number; start_date?: string };
    const plan = await generateBibleReadingPlan({
      memberId: id,
      goal: String(body.goal ?? ''),
      days: Number(body.days ?? 7),
      startDate: body.start_date ?? null,
    });
    res.status(201).json(plan);
  } catch (e) {
    if (e instanceof AiAgentError) {
      const status =
        e.code === 'ai_disabled' || e.code === 'ai_not_configured' ? 503 : 502;
      res.status(status).json({ error: e.message, code: e.code });
      return;
    }
    console.error('[bible] plans generate:', e);
    res.status(500).json({ error: 'Не удалось создать план' });
  }
}

export async function biblePlansDayComplete(req: Request, res: Response): Promise<void> {
  try {
    const id = memberId(req);
    if (!id) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    const completed = Boolean((req.body as { completed?: boolean }).completed ?? true);
    const day = await setPlanDayCompleted(
      id,
      Number(req.params.id),
      Number(req.params.dayIndex),
      completed,
    );
    if (!day) {
      res.status(404).json({ error: 'День плана не найден' });
      return;
    }
    res.json(day);
  } catch (e) {
    console.error('[bible] plans day:', e);
    res.status(500).json({ error: 'Не удалось обновить день' });
  }
}

export async function biblePlansDelete(req: Request, res: Response): Promise<void> {
  try {
    const id = memberId(req);
    if (!id) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    const ok = await deletePlan(id, Number(req.params.id));
    if (!ok) {
      res.status(404).json({ error: 'План не найден' });
      return;
    }
    res.status(204).send();
  } catch (e) {
    console.error('[bible] plans delete:', e);
    res.status(500).json({ error: 'Не удалось удалить план' });
  }
}

export async function bibleCommentariesList(req: Request, res: Response): Promise<void> {
  try {
    const translation = String(req.query.translation ?? 'synodal');
    const book = String(req.query.book ?? '');
    const chapter = Number(req.query.chapter);
    res.json({ commentaries: await listCommentariesForChapter(translation, book, chapter) });
  } catch (e) {
    console.error('[bible] commentaries:', e);
    res.status(500).json({ error: 'Не удалось загрузить комментарии' });
  }
}

export async function bibleCommentariesCreate(req: Request, res: Response): Promise<void> {
  try {
    const id = memberId(req);
    if (!id) {
      res.status(401).json({ error: 'Требуется вход' });
      return;
    }
    if (!canEditChurchCommentary(req)) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const row = await createChurchCommentary(id, {
      translationCode: String(body.translation ?? 'synodal'),
      bookSlug: String(body.book_slug ?? ''),
      chapter: Number(body.chapter),
      verseStart: body.verse_start != null ? Number(body.verse_start) : null,
      verseEnd: body.verse_end != null ? Number(body.verse_end) : null,
      title: typeof body.title === 'string' ? body.title : '',
      body: String(body.body ?? ''),
    });
    res.status(201).json(row);
  } catch (e) {
    console.error('[bible] commentaries create:', e);
    res.status(500).json({ error: 'Не удалось создать комментарий' });
  }
}

export async function bibleCommentariesDelete(req: Request, res: Response): Promise<void> {
  try {
    if (!canEditChurchCommentary(req)) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }
    const ok = await deleteChurchCommentary(Number(req.params.id));
    if (!ok) {
      res.status(404).json({ error: 'Комментарий не найден' });
      return;
    }
    res.status(204).send();
  } catch (e) {
    console.error('[bible] commentaries delete:', e);
    res.status(500).json({ error: 'Не удалось удалить комментарий' });
  }
}

export async function bibleAudioGet(req: Request, res: Response): Promise<void> {
  try {
    const translation = String(req.params.translation ?? 'synodal');
    const book = String(req.params.book ?? '');
    const chapter = Number(req.params.chapter);
    const voice = String(req.query.voice ?? 'estimate');
    const audio = await getChapterAudio(translation, book, chapter, voice);
    if (!audio) {
      // fallback to default voice id
      const fallback = await getChapterAudio(translation, book, chapter, 'default');
      if (!fallback) {
        res.status(404).json({ error: 'Аудио не найдено' });
        return;
      }
      res.json(fallback);
      return;
    }
    res.json(audio);
  } catch (e) {
    console.error('[bible] audio:', e);
    res.status(500).json({ error: 'Не удалось загрузить аудио' });
  }
}
