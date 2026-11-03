const test = require("node:test");
const assert = require("node:assert/strict");
const { slotAt } = require("../scripts/publish-daily-ten.cjs");

test("ten operating-day slots alternate five original and five curated stories", () => {
  const start = Date.parse("2026-10-29T06:00:00+09:00");
  const slots = Array.from({ length: 10 }, (_, i) => slotAt(start + i * 7200000));
  assert.equal(new Set(slots.map(slot => slot.scheduledAt)).size, 10);
  assert.ok(slots.every(slot => slot.operatingDate === "2026-10-29"));
  assert.deepEqual(slots.map(slot => slot.slotNumber), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(slots.filter(slot => slot.type === "fiction").length, 5);
  assert.equal(slots.filter(slot => slot.type === "curation").length, 5);
  assert.equal(slots.at(-1).scheduledAt, "2026-10-29T15:00:00.000Z");
});

test("midnight remains in the previous operating day; overnight gap does not publish", () => {
  assert.equal(slotAt(Date.parse("2027-01-01T00:30:00+09:00")).operatingDate, "2026-12-31");
  assert.equal(slotAt(Date.parse("2027-01-01T00:30:00+09:00")).slotNumber, 10);
  for (const hour of [1, 2, 3, 4, 5]) assert.equal(slotAt(Date.parse(`2027-01-01T0${hour}:00:00+09:00`)), null);
  assert.equal(slotAt(Date.parse("2027-01-01T06:00:00+09:00")).slotNumber, 1);
});
