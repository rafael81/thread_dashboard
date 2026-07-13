const assert = require("node:assert/strict");
const test = require("node:test");

test("automation metrics use one selected date for comments, reviews, quality, and hearts", async () => {
  const { buildAutomationScopeMetrics } = await import("../dashboard/src/lib/automation-metrics.mjs");
  const metrics = buildAutomationScopeMetrics({
    date: "2026-07-11",
    todayDate: "2026-07-11",
    dailyTarget: 500,
    intervalMs: 92_000,
    comments: [
      { date: "2026-07-11", targetUrl: "https://x.com/a/status/1", qualityScore: 90 },
      { date: "2026-07-11", targetUrl: "https://x.com/b/status/2", qualityScore: 94 },
      { date: "2026-07-10", targetUrl: "https://x.com/c/status/3", qualityScore: 100 },
    ],
    pendingReviews: [{ date: "2026-07-11", targetUrl: "https://x.com/d/status/4", status: "review" }],
    errorReviews: [{ date: "2026-07-05", targetUrl: "https://x.com/e/status/5", status: "error" }],
    heartTimeline: [
      { date: "2026-07-11", count: 5 },
      { date: "2026-07-11", count: 7 },
      { date: "2026-07-10", count: 50 },
    ],
  });

  assert.equal(metrics.commentCount, 2);
  assert.equal(metrics.reviewCount, 1);
  assert.equal(metrics.pendingReviewCount, 1);
  assert.equal(metrics.errorReviewCount, 0);
  assert.equal(metrics.qualityAverage, 92);
  assert.equal(metrics.heartCount, 12);
  assert.equal(metrics.heartRunCount, 2);
  assert.equal(metrics.displayCount, 3);
  assert.equal(metrics.remaining, 498);
  assert.equal(metrics.intervalMs, 92_000);
});

test("posted review history is counted once and old review errors do not leak into today", async () => {
  const { buildAutomationScopeMetrics } = await import("../dashboard/src/lib/automation-metrics.mjs");
  const posted = {
    date: "2026-07-11",
    targetUrl: "https://x.com/follower/status/7",
    source: "comment_review_queue",
    qualityScore: 96,
  };
  const metrics = buildAutomationScopeMetrics({
    date: "2026-07-11",
    todayDate: "2026-07-11",
    comments: [posted],
    postedReviews: [{ ...posted, posted: true, status: "posted" }],
    errorReviews: [{ date: "2026-07-05", targetUrl: "https://x.com/old/status/8", status: "error" }],
  });

  assert.equal(metrics.reviewCount, 1);
  assert.equal(metrics.postedReviewCount, 1);
  assert.equal(metrics.errorReviewCount, 0);
});
