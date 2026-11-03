const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { nextAutoScheduleCandidate, X_NATIVE_AUTO_SCHEDULE_INTERVAL_MS } = require('../mirror_server');
const time = value => Date.parse(value);
const native = (latest, now) => nextAutoScheduleCandidate(latest, now, 'x_native');

test('native reservations maintain exactly 40 minutes across successive hours and :00', () => {
  const now = time('2026-11-02T00:00:00Z');
  let latest = time('2026-11-02T01:20:00Z');
  assert.equal(X_NATIVE_AUTO_SCHEDULE_INTERVAL_MS, 40 * 60 * 1000);
  for (let n = 0; n < 12; n++) {
    const next = native(latest, now);
    assert.equal(next.getTime() - latest, 40 * 60 * 1000);
    assert.equal(next.getUTCSeconds(), 0);
    latest = next.getTime();
  }
  assert.equal(native(time('2026-11-02T01:20:00Z'), now).toISOString(), '2026-11-02T02:00:00.000Z');
});

test('the first native reservation starts at least 40 minutes from now on a valid five-minute option', () => {
  const now = time('2026-11-02T13:01:21Z');
  assert.equal(native(0, now).toISOString(), '2026-11-02T13:45:00.000Z');
  assert.equal(native(time('2026-11-02T12:00:00Z'), now).toISOString(), '2026-11-02T13:45:00.000Z');
});

test('native reservations skip the existing KST 01–07 quiet period then resume 40-minute spacing', () => {
  const now = time('2026-11-02T12:00:00Z');
  const morning = native(time('2026-11-02T15:25:00Z'), now);
  assert.equal(morning.toISOString(), '2026-11-02T22:00:00.000Z');
  assert.equal(native(morning.getTime(), now).toISOString(), '2026-11-02T22:40:00.000Z');
});

test('legacy interval environment overrides do not change the requested native 40-minute cadence', () => {
  const value = execFileSync(process.execPath, ['-e', `const m=require('./mirror_server');process.stdout.write(m.nextAutoScheduleCandidate(Date.parse('2026-11-02T01:05:00Z'),Date.parse('2026-11-02T00:00:00Z'),'x_native').toISOString())`], {
    cwd: require('node:path').resolve(__dirname, '..'),
    env: { ...process.env, AUTO_SCHEDULE_INTERVAL_MS: String(90 * 60 * 1000) },
    encoding: 'utf8',
  });
  assert.equal(value, '2026-11-02T01:45:00.000Z');
});
