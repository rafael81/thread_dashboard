const test = require("node:test");
const assert = require("node:assert/strict");
const { storySlots, planStoryReschedule } = require("../lib/story-schedule");

test("15 distinct local schedule slots span 06:00 to next-day 01:00 KST", () => {
  const slots = storySlots("2026-09-27");
  assert.equal(slots.length, 15);
  assert.equal(new Set(slots.map(s => s.scheduledAt)).size, 15);
  assert.equal(slots[0].scheduledAt, "2026-09-26T21:00:00.000Z");
  assert.equal(slots[14].scheduledAt, "2026-09-27T16:00:00.000Z");
  for (let i = 1; i < slots.length; i++) {
    assert.ok([80, 85].includes((Date.parse(slots[i].scheduledAt) - Date.parse(slots[i-1].scheduledAt)) / 60000));
  }
});

test("month and year boundaries preserve the Korean operating day", () => {
  assert.equal(storySlots("2026-12-31")[14].scheduledAt, "2026-12-31T16:00:00.000Z");
  assert.throws(() => storySlots("2026-02-30"));
  assert.throws(() => storySlots("tomorrow"));
});

test("existing pending stories keep order and fill 15 per day after posted roots", () => {
  const now = Date.parse("2026-10-13T00:40:00Z");
  const items = [
    ...Array.from({ length: 6 }, (_, index) => ({ id: `posted-${index}`, status: "posted", postUrl: `https://x.com/terafabXai/status/${index}`, operatingDate: "2026-10-13", scheduledAt: new Date(Date.parse("2026-10-12T21:00:00Z") + index * 40 * 60000).toISOString() })),
    ...Array.from({ length: 24 }, (_, index) => ({ id: `pending-${index}`, status: "scheduled", operatingDate: "2026-10-13", scheduledAt: new Date(now + (index + 1) * 40 * 60000).toISOString() })),
  ];
  const plan = planStoryReschedule(items, now);
  assert.equal(plan.length, 24);
  assert.deepEqual(plan.map(row => row.id), Array.from({ length: 24 }, (_, index) => `pending-${index}`));
  assert.equal(plan.filter(row => row.operatingDate === "2026-10-13").length, 9);
  assert.equal(plan.filter(row => row.operatingDate === "2026-10-14").length, 15);
  assert.ok(Date.parse(plan[0].scheduledAt) >= now + 5 * 60000);
  assert.equal(plan.at(-1).scheduledAt, "2026-10-14T16:00:00.000Z");
});

test("existing external reservation counts toward the same daily cap", () => {
  const now = Date.parse("2026-10-13T00:40:00Z");
  const items = [
    ...Array.from({ length: 15 }, (_, index) => ({ id: `posted-${index}`, status: "posted", postUrl: `https://x.com/terafabXai/status/${index}`, operatingDate: "2026-10-13", scheduledAt: new Date(Date.parse("2026-10-12T21:00:00Z") + index * 15 * 60000).toISOString() })),
    ...Array.from({ length: 16 }, (_, index) => ({
      id: `story-${index}`, status: "scheduled", operatingDate: "2026-10-14",
      scheduledAt: new Date(Date.parse("2026-10-13T21:00:00Z") + index * 40 * 60000).toISOString(),
    })),
  ];
  const external = [{ id: "threads-post", operatingDate: "2026-10-14", scheduledAt: "2026-10-14T01:00:00Z" }];
  const plan = planStoryReschedule(items, now, external);
  assert.equal(plan.filter(row => row.operatingDate === "2026-10-14").length, 14);
  assert.equal(plan.filter(row => row.operatingDate === "2026-10-15").length, 2);
});
