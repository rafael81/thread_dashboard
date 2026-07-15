const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeNaverAdpostRevenueRows } = require('../mirror_server.js');

test('Naver AdPost revenue rows aggregate devices and media by date', () => {
  const rows = normalizeNaverAdpostRevenueRows([
    { date: '20260714', mediaName: '큐리큐리', impressionCount: 200, clickCount: 1, revenueAmount: 10 },
    { date: '20260714', mediaName: '큐리큐리', impressionCount: 50, clickCount: 1, revenueAmount: 5 },
    { date: '20260713', mediaName: '큐리큐리', impressionCount: 100, clickCount: 0, revenueAmount: 2 },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, '20260713');
  assert.equal(rows[1].impressionCount, 250);
  assert.equal(rows[1].clickCount, 2);
  assert.equal(rows[1].revenueAmount, 15);
  assert.equal(rows[1].ctr, 0.008);
  assert.deepEqual(rows[1].mediaNames, ['큐리큐리']);
});

test('Naver AdPost revenue rows ignore invalid dates', () => {
  assert.deepEqual(normalizeNaverAdpostRevenueRows([
    { date: '', revenueAmount: 10 },
    { date: '2026-07', revenueAmount: 20 },
  ]), []);
});
