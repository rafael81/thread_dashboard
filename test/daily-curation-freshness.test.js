const test = require("node:test"), assert = require("node:assert/strict");
const { assertCurationFreshness } = require("../scripts/publish-daily-ten.cjs");
const policy = { curationFreshnessPolicy: { enabled: true, originalStartMaxAgeHours: 48 } };
const now = Date.parse("2026-10-31T22:00:00+09:00");
test("current original S date passes with a conservative whole-day bound", () => {
  assert.doesNotThrow(() => assertCurationFreshness({ type: "curation", source: { originalStartedDate: "2026-10-31" } }, policy, { now }));
});
test("recent E recirculation never makes an old or unverified original eligible", () => {
  for (const source of [{ originalStartedDate: "2026-10-28", recirculatedAt: new Date(now).toISOString() }, {}, { originalStartedDate: "2026-11-01" }]) {
    assert.throws(() => assertCurationFreshness({ type: "curation", source }, policy, { now }), /original S:/);
  }
});
test("future planning and recovery of an existing root retain their separate gates", () => {
  const source = { type: "curation", source: {} };
  assert.doesNotThrow(() => assertCurationFreshness(source, policy, { now, planning: true }));
  assert.doesNotThrow(() => assertCurationFreshness(source, policy, { now, alreadyPosted: true }));
});
