import assert from 'node:assert/strict';

import {
  assembleSundayService,
  isSundayYmd,
  isValidYmd,
  pickSermonFromBlocks,
  pickSongsFromBlocks,
  sundayServiceTitle,
} from './calendarSundayServicesService';
import type { SundaySchedulePlanRow } from './sundayScheduleService';

function block(partial: {
  title?: string;
  content_json?: unknown;
  block_type_code?: string | null;
  block_kind?: string | null;
  song_title?: string | null;
  song_key?: string | null;
}) {
  return {
    service_plan_id: 1,
    title: partial.title ?? '',
    content_json: partial.content_json ?? {},
    block_type_code: partial.block_type_code ?? null,
    block_kind: partial.block_kind ?? null,
    song_title: partial.song_title ?? null,
    song_key: partial.song_key ?? null,
    order_index: 0,
  };
}

function run(): void {
  assert.equal(isSundayYmd('2026-08-16'), true);
  assert.equal(isSundayYmd('2026-08-17'), false);
  assert.equal(isValidYmd('2026-02-31'), false);
  assert.equal(isSundayYmd('not-a-date'), false);

  assert.equal(sundayServiceTitle(null), 'Воскресное служение');
  assert.equal(sundayServiceTitle('  '), 'Воскресное служение');
  assert.equal(sundayServiceTitle('Утреннее собрание'), 'Утреннее собрание');

  const sermon = pickSermonFromBlocks([
    block({ title: 'Песня', block_type_code: 'song', song_title: 'Свят' }),
    block({
      title: 'Иван — Живая надежда',
      block_type_code: 'sermon',
      content_json: { sermon_topic: 'Живая надежда', sermon_scripture: '1 Пет. 1:3' },
    }),
  ]);
  assert.equal(sermon.topic, 'Живая надежда');
  assert.equal(sermon.scripture, '1 Пет. 1:3');

  const songs = pickSongsFromBlocks([
    block({ title: 'Свят', block_type_code: 'song', song_title: 'Свят', song_key: 'G' }),
    block({ title: 'Свят', block_kind: 'song', song_title: 'Свят', song_key: 'G' }),
    block({ title: 'Ты благ', block_type_code: 'song', song_title: 'Ты благ' }),
  ]);
  assert.deepEqual(songs, [
    { title: 'Свят', key: 'G' },
    { title: 'Ты благ', key: null },
  ]);

  const row: SundaySchedulePlanRow = {
    id: 42,
    service_date: '2026-08-16',
    start_time: '10:00',
    status: 'published',
    template_name: 'Воскресное',
    leader_member_id: 1,
    preacher_member_id: 2,
    blocks_count: 8,
    has_program: true,
    leader: {
      id: 1,
      name: 'Анна Ведущая',
      avatar_url: '/a.jpg',
      ministry_direction: null,
      ministry_role: 'Ведущий',
    },
    preacher: {
      id: 2,
      name: 'Пётр Проповедник',
      avatar_url: null,
      ministry_direction: null,
      ministry_role: 'Проповедник',
    },
  };
  const assembled = assembleSundayService(row, {
    share_token: 'tok',
    status: 'published',
    sermon_topic: 'Живая надежда',
    sermon_scripture: '1 Пет. 1:3',
    songs: [{ title: 'Свят', key: 'G' }],
  });
  assert.equal(assembled.title, 'Воскресное');
  assert.equal(assembled.leader?.name, 'Анна Ведущая');
  assert.equal(assembled.preacher?.name, 'Пётр Проповедник');
  assert.equal(assembled.sermon_topic, 'Живая надежда');
  assert.equal(assembled.songs.length, 1);

  console.log('calendarSundayServicesService.test.ts: OK');
}

run();
