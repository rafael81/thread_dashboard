const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { mergeStoryDashboardRows } = require("../lib/story-dashboard");

test("unposted stories are scheduled only while the story dispatcher is active", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "story-dashboard-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const items = [
    { id: "a", status: "scheduled", scheduledAt: "2026-11-12T00:00:00Z", media: [] },
    { id: "b", status: "failed", scheduledAt: "2026-11-01T00:00:00Z", media: [] },
    { id: "c", status: "posted", completedAt: "2026-10-01T00:00:00Z", media: [] },
    { id: "d", status: "cancelled", media: [] },
  ];
  const status = rows => Object.fromEntries(rows.map(row => [row.canonicalUrl, row.status]));
  assert.deepEqual(status(mergeStoryDashboardRows([], items, root)), { "story:a": "scheduled", "story:b": "review", "story:c": "posted" });
  assert.deepEqual(status(mergeStoryDashboardRows([], items, root, { dispatchActive: false })), { "story:a": "review", "story:b": "review", "story:c": "posted" });
  assert.equal(mergeStoryDashboardRows([], items, root, { dispatchActive: false })[0].story.status, "scheduled");
});
