const test = require("node:test");
const assert = require("node:assert/strict");
const { storySlots } = require("../lib/story-schedule");

test("30 distinct local schedule slots span 06:00 to next-day 01:00 KST", () => {
  const slots = storySlots("2026-09-27");
  assert.equal(slots.length, 30);
  assert.equal(new Set(slots.map(s => s.scheduledAt)).size, 30);
  assert.equal(slots[0].scheduledAt, "2026-09-26T21:00:00.000Z");
  assert.equal(slots[29].scheduledAt, "2026-09-27T16:00:00.000Z");
  for (let i = 1; i < slots.length; i++) {
    assert.ok([35, 40].includes((Date.parse(slots[i].scheduledAt) - Date.parse(slots[i-1].scheduledAt)) / 60000));
  }
});

test("month and year boundaries preserve the Korean operating day", () => {
  assert.equal(storySlots("2026-12-31")[29].scheduledAt, "2026-12-31T16:00:00.000Z");
  assert.throws(() => storySlots("2026-02-30"));
  assert.throws(() => storySlots("tomorrow"));
});
