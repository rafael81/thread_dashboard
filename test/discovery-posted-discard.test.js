const assert = require("node:assert/strict");
const test = require("node:test");

const {
  mergeDiscoveryRowsWithMirrorHistory,
  mirrorHistoryDashboardRow,
} = require("../mirror_server.js");

test("mirror-history past-scheduled rows appear as posted and vanish when history is removed", () => {
  const nowMs = Date.parse("2026-07-30T12:00:00.000Z");
  const canonicalUrl = "https://www.threads.com/@woo_hoo_soojwoo/post/DbUn727jm_H";
  const history = [{
    canonicalUrl,
    status: "scheduled",
    scheduledAt: "2026-07-29T22:00:00.000Z",
    postUrl: "https://x.com/terafabXai/status/2082000000000000001",
    mediaCount: 1,
    completedAt: "2026-07-28T15:08:36.120Z",
  }];
  const historyRow = mirrorHistoryDashboardRow(history[0], nowMs);
  assert.equal(historyRow.status, "posted");
  const merged = mergeDiscoveryRowsWithMirrorHistory([], nowMs, history);
  assert.equal(merged.some((row) => row.canonicalUrl === canonicalUrl && row.status === "posted"), true);

  // discardPosted removes the history entry; merge must not resurrect the row.
  const remainingHistory = history.filter((item) => item.canonicalUrl !== canonicalUrl);
  const mergedAfter = mergeDiscoveryRowsWithMirrorHistory([], nowMs, remainingHistory);
  assert.equal(mergedAfter.some((row) => row.canonicalUrl === canonicalUrl), false);
});
