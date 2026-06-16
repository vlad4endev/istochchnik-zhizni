import type { Ionicons } from '@expo/vector-icons';

import type { PublicServicePlanBlock } from '../api/servicePlanner';
import { meaningfulNoteLinesFromRaw } from './plannerNoteText';

type IonIcon = keyof typeof Ionicons.glyphMap;

export function stripLeadingBlockIndex(value: string): string {
  return value.replace(/^\s*\d+\.\s+/, '').trim();
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function stripSongKeySuffix(value: string): string {
  return value.replace(/\s*\[[^\]]+\]\s*$/, '').trim();
}

function isPoem(code: string | null, typeName: string | null): boolean {
  const normalizedName = String(typeName ?? '').toLowerCase();
  return code === 'poem' || normalizedName.includes('стих');
}

function isSermon(code: string | null, typeName: string | null): boolean {
  const normalizedName = String(typeName ?? '').toLowerCase();
  return code === 'sermon' || normalizedName.includes('проповед');
}

function isBirthdays(code: string | null, typeName: string | null): boolean {
  const normalizedName = String(typeName ?? '').toLowerCase();
  return code === 'birthdays' || normalizedName.includes('дни рождения');
}

function isHiddenFromPublic(content: Record<string, unknown>): boolean {
  return content.hide_in_public === true;
}

function isSeparator(content: Record<string, unknown>): boolean {
  return content.is_separator === true;
}

function birthdayRows(content: Record<string, unknown>): string[] {
  const raw = content.birthday_people;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const row = x as Record<string, unknown>;
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      if (!name) return null;
      const weekDate = typeof row.week_date === 'string' ? row.week_date.trim() : '';
      if (!weekDate) return name;
      const dt = new Date(`${weekDate}T12:00:00`);
      if (Number.isNaN(dt.getTime())) return name;
      const dateText = new Intl.DateTimeFormat('ru-RU', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(dt);
      return `${name} — ${dateText}`;
    })
    .filter((x): x is string => Boolean(x));
}

function scheduleRows(content: Record<string, unknown>): string[] {
  const raw = content.schedule_events;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const row = x as Record<string, unknown>;
      const title = typeof row.title === 'string' ? row.title.trim() : '';
      if (!title) return null;
      const dateIso = typeof row.event_date === 'string' ? row.event_date.trim() : '';
      const time = typeof row.event_time === 'string' ? row.event_time.trim().slice(0, 5) : '';
      let datePart = '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
        const dt = new Date(`${dateIso}T12:00:00`);
        if (!Number.isNaN(dt.getTime())) {
          datePart = new Intl.DateTimeFormat('ru-RU', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          }).format(dt);
        }
      }
      const prefix = [datePart, time].filter((v) => v.length > 0).join(' ');
      return prefix ? `${prefix} — ${title}` : title;
    })
    .filter((x): x is string => Boolean(x));
}

export type BlockDisplay = {
  id: number;
  startsAt: string;
  durationMinutes: number;
  isSeparator: boolean;
  heading: string;
  subtitle: string;
  note: string;
  poemSubline: string;
  sermonScripture: string;
  birthdaysList: string[];
  scheduleList: string[];
  songLine: string;
  icon: IonIcon;
  iconColor: string;
  iconBg: string;
};

const ICON_BY_CODE: Record<string, { icon: IonIcon; color: string; bg: string }> = {
  prayer: { icon: 'heart-outline', color: '#6d28d9', bg: '#ede9fe' },
  song: { icon: 'musical-notes-outline', color: '#0369a1', bg: '#e0f2fe' },
  scripture: { icon: 'book-outline', color: '#b45309', bg: '#fef3c7' },
  sermon: { icon: 'mic-outline', color: '#be123c', bg: '#ffe4e6' },
  announcements: { icon: 'megaphone-outline', color: '#047857', bg: '#d1fae5' },
  offering: { icon: 'cash-outline', color: '#65a30d', bg: '#ecfccb' },
  birthdays: { icon: 'gift-outline', color: '#db2777', bg: '#fce7f3' },
  schedule: { icon: 'calendar-outline', color: '#4338ca', bg: '#e0e7ff' },
  poem: { icon: 'document-text-outline', color: '#a21caf', bg: '#fae8ff' },
  custom: { icon: 'extension-puzzle-outline', color: '#57534e', bg: '#e7e5e4' },
};

export function blockIconMeta(code: string | null): { icon: IonIcon; color: string; bg: string } {
  const key = (code ?? '').toLowerCase();
  return ICON_BY_CODE[key] ?? ICON_BY_CODE.custom!;
}

export function deriveBlockDisplay(block: PublicServicePlanBlock): BlockDisplay {
  const notesRaw = typeof block.content_json.notes === 'string' ? block.content_json.notes.trim() : '';
  const textRaw = typeof block.content_json.text === 'string' ? block.content_json.text.trim() : '';
  const rawForNote = notesRaw || textRaw;
  const note = meaningfulNoteLinesFromRaw(rawForNote, block.content_json);

  const code = block.block_type_code;
  const typeName = block.block_type_name;
  const poem = isPoem(code, typeName);
  const sermon = isSermon(code, typeName);
  const birthdays = isBirthdays(code, typeName);

  const poemAuthor =
    typeof block.content_json.poem_author === 'string' ? block.content_json.poem_author.trim() : '';
  const poemTheme =
    typeof block.content_json.poem_theme === 'string' ? block.content_json.poem_theme.trim() : '';
  const poemSubline =
    poemAuthor && poemTheme ? `${poemAuthor} • ${poemTheme}` : poemAuthor || poemTheme;

  const sermonTopic =
    typeof block.content_json.sermon_topic === 'string' ? block.content_json.sermon_topic.trim() : '';
  const sermonScripture =
    typeof block.content_json.sermon_scripture === 'string'
      ? block.content_json.sermon_scripture.trim()
      : '';
  const sermonPreacher = block.assigned_member_name ?? 'Проповедник';

  const titlePlain = String(block.title ?? '').trim();
  const heading = poem
    ? `СТИХ — ${block.assigned_member_name ?? 'Чтец'}`
    : sermon
      ? sermonTopic
        ? `${sermonPreacher} — ${sermonTopic}`
        : sermonPreacher
      : birthdays
        ? 'Дни рождения недели'
        : block.title;

  const headingDisplay = stripLeadingBlockIndex(String(heading ?? '').trim());
  const songLine =
    block.song_title && String(block.song_title).trim()
      ? block.song_key && String(block.song_key).trim()
        ? `${String(block.song_title).trim()} [${String(block.song_key).trim()}]`
        : String(block.song_title).trim()
      : '';

  const showSongLine =
    songLine.length > 0 &&
    normalizeText(stripSongKeySuffix(songLine)) !== normalizeText(stripSongKeySuffix(headingDisplay));

  const iconMeta = blockIconMeta(code);

  return {
    id: block.id,
    startsAt: '',
    durationMinutes: Math.max(0, block.duration_minutes),
    isSeparator: isSeparator(block.content_json),
    heading: headingDisplay || titlePlain || 'Блок',
    subtitle: [
      block.block_type_name ?? 'Блок',
      block.duration_minutes > 0 ? `${block.duration_minutes} мин` : null,
      block.assigned_member_name,
    ]
      .filter(Boolean)
      .join(' • '),
    note,
    poemSubline,
    sermonScripture,
    birthdaysList: birthdays ? birthdayRows(block.content_json) : [],
    scheduleList: scheduleRows(block.content_json),
    songLine: showSongLine ? songLine : '',
    icon: iconMeta.icon,
    iconColor: iconMeta.color,
    iconBg: iconMeta.bg,
  };
}

export function visiblePlanBlocks(blocks: PublicServicePlanBlock[]): PublicServicePlanBlock[] {
  return blocks
    .slice()
    .sort((a, b) => a.order_index - b.order_index)
    .filter((b) => !isHiddenFromPublic(b.content_json));
}

export function planDisplayTitle(templateName: string | null, fallback = 'Служение'): string {
  return (templateName?.trim() || fallback).trim();
}

export function statusLabel(status: 'draft' | 'published'): string {
  return status === 'published' ? 'Опубликован' : 'Черновик';
}
