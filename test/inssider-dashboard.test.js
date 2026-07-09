const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cleanThreadText,
  dashboardDiscoveryRow,
  isPublishedDiscoveryRow,
  isTerafabxQuietPostingTime,
  mergeDiscoveryRowsWithMirrorHistory,
  mirrorHistoryDashboardRow,
  splitInssiderReplyChunks,
  xWeightedLength,
} = require('../mirror_server.js');

test('sharp runtime dependency is importable', async () => {
  const sharp = await import('sharp');
  assert.equal(typeof sharp.default, 'function');
});

test('past scheduled discovery row is treated as posted on dashboard', () => {
  const now = Date.parse('2026-07-05T08:00:00.000Z');
  const row = {
    canonicalUrl: 'https://inssider.kr/posts/003001/73202',
    status: 'scheduled',
    scheduledPostAt: '2026-07-05T07:40:00.000Z',
    postedAt: '2026-07-05 07:17:34',
  };
  assert.equal(isPublishedDiscoveryRow(row, now), true);
  assert.deepEqual(dashboardDiscoveryRow(row, now), {
    ...row,
    status: 'posted',
    postedAt: '2026-07-05T07:40:00.000Z',
    scheduledPostAt: null,
  });
});

test('future scheduled discovery row remains scheduled', () => {
  const now = Date.parse('2026-07-05T07:00:00.000Z');
  const row = {
    canonicalUrl: 'https://inssider.kr/posts/003001/73202',
    status: 'scheduled',
    scheduledPostAt: '2026-07-05T07:40:00.000Z',
    postedAt: '2026-07-05 07:17:34',
  };
  assert.equal(isPublishedDiscoveryRow(row, now), false);
  assert.equal(dashboardDiscoveryRow(row, now).status, 'scheduled');
});

test('mirror-history can backfill a missing posted dashboard row', () => {
  const now = Date.parse('2026-07-05T08:00:00.000Z');
  const entry = {
    canonicalUrl: 'https://inssider.kr/posts/003001/73202',
    status: 'scheduled',
    scheduledAt: '2026-07-05T07:40:00.000Z',
    mediaCount: 1,
    completedAt: '2026-07-05T07:17:34.351Z',
  };
  const row = mirrorHistoryDashboardRow(entry, now);
  assert.equal(row.status, 'posted');
  assert.equal(row.postedAt, '2026-07-05T07:40:00.000Z');
});

test('mergeDiscoveryRowsWithMirrorHistory promotes existing scheduled row after publish time', () => {
  const now = Date.parse('2026-07-05T08:00:00.000Z');
  const rows = [{
    canonicalUrl: 'https://inssider.kr/posts/003001/73202',
    status: 'scheduled',
    scheduledPostAt: '2026-07-05T07:40:00.000Z',
    postedAt: '2026-07-05 07:17:34',
    mediaCount: 0,
  }];
  const historyEntries = [{
    canonicalUrl: 'https://inssider.kr/posts/003001/73202',
    status: 'scheduled',
    scheduledAt: '2026-07-05T07:40:00.000Z',
    mediaCount: 1,
    completedAt: '2026-07-05T07:17:34.351Z',
  }];
  const merged = mergeDiscoveryRowsWithMirrorHistory(rows, now, historyEntries);
  assert.equal(merged[0].status, 'posted');
  assert.equal(merged[0].scheduledPostAt, null);
  assert.equal(merged[0].mediaCount, 1);
});

test('inssider reply chunks stay below X weighted length budget', () => {
  const text = '거래처별 특징, 실수하기 쉬운 부분, 업무 순서, 엑셀 함수, 자주 쓰는 메일 문구까지 5년 동안 틈틈이 정리했습니다. 회사에서 시킨 적은 없고, 전부 제가 편하려고 만든 자료였습니다. 그런데 퇴사 소식을 들은 팀장님이 갑자기 말씀하시더라고요.';
  const chunks = splitInssiderReplyChunks(text, 180);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => xWeightedLength(chunk) <= 180));
});

test('TerafabX quiet posting window blocks 01:00-06:00 KST only', () => {
  assert.equal(isTerafabxQuietPostingTime(new Date('2026-07-04T15:59:00.000Z')), false); // 00:59 KST
  assert.equal(isTerafabxQuietPostingTime(new Date('2026-07-04T16:00:00.000Z')), true); // 01:00 KST
  assert.equal(isTerafabxQuietPostingTime(new Date('2026-07-04T20:59:00.000Z')), true); // 05:59 KST
  assert.equal(isTerafabxQuietPostingTime(new Date('2026-07-04T21:00:00.000Z')), false); // 06:00 KST
});

test('Threads text cleanup preserves short Korean no-space captions', () => {
  assert.equal(cleanThreadText('aa_size\n끌고가라\n1\n/', 'aa_size'), '끌고가라');
});

test('Threads text cleanup still drops unrelated handle-only recommendations', () => {
  assert.equal(cleanThreadText('aa_size\n끌고가라\ndestination_now_\n1\n/', 'aa_size'), '끌고가라');
});
