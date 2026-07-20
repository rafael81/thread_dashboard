const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assessTerafabxTodayPostReplyCompletion,
  terafabxTodayPostReplyDashboardState,
  terafabxTodayPostReplyIncompleteReason,
  isTerafabxTodayRootPostMetadata,
  terafabxCommentPrefillWorkerResources,
  terafabxTodayPostReplyWorkerResources,
  terafabxReplyBatchFailureSignature,
  terafabxOwnPostHeartTargets,
} = require("../mirror_server");

test("own-post heart targets include all third-party direct replies only once", () => {
  const targets = terafabxOwnPostHeartTargets({
    directReplies: [
      { id: "1", url: "https://x.com/user1/status/1", authorHandle: "user1", authorVerified: false },
      { id: "2", url: "https://x.com/terafabXai/status/2", authorHandle: "terafabXai", authorVerified: true },
      { id: "1", url: "https://x.com/user1/status/1", authorHandle: "user1", authorVerified: false },
      { id: "3", url: "https://x.com/user2/status/3", authorHandle: "user2", authorVerified: true },
    ],
  });

  assert.deepEqual(targets.map((item) => item.id), ["1", "3"]);
});

test("today post reply completion requires a full scan, zero remaining targets, and zero retry errors", () => {
  const complete = assessTerafabxTodayPostReplyCompletion({
    discoveryComplete: true,
    rootPostCount: 3,
    checkedRootCount: 3,
    remainingEligibleCount: 0,
    retryableErrorCount: 0,
  });
  assert.equal(complete.complete, true);

  const partial = assessTerafabxTodayPostReplyCompletion({
    discoveryComplete: true,
    rootPostCount: 3,
    checkedRootCount: 3,
    remainingEligibleCount: 1,
    retryableErrorCount: 0,
  });
  assert.equal(partial.complete, false);
  assert.equal(partial.conditions.find((item) => item.key === "no_actionable_replies").met, false);
});

test("today post reply incomplete reason describes the unmet condition instead of zero counters", () => {
  const reason = terafabxTodayPostReplyIncompleteReason({
    discoveryComplete: false,
    rootPostCount: 0,
    checkedRootCount: 0,
    remainingEligibleCount: 0,
    retryableErrorCount: 0,
  });
  assert.match(reason, /원글 발견 미완료/);
  assert.doesNotMatch(reason, /0건 남음/);
  assert.doesNotMatch(reason, /재시도 오류 0건/);
});

test("today post reply dashboard hides stale summaries from previous dates", () => {
  const dashboard = terafabxTodayPostReplyDashboardState({
    todayPostReplyLastRunAt: "2026-07-13T03:00:00.000Z",
    todayPostReplyLastStatus: "partial",
    todayPostReplyLastError: "0건 남음 · 재시도 오류 0건",
    todayPostReplyLastSummary: {
      date: "2026-07-13",
      discoveryComplete: false,
      rootPostCount: 0,
      checkedRootCount: 0,
      remainingEligibleCount: 0,
      retryableErrorCount: 0,
    },
  }, "2026-07-16");
  assert.equal(dashboard.lastStatus, null);
  assert.equal(dashboard.lastError, null);
  assert.equal(dashboard.summary, null);
  assert.deepEqual(dashboard.completion.conditions, []);
});

test("today post reply dashboard shows a meaningful reason for the current date", () => {
  const dashboard = terafabxTodayPostReplyDashboardState({
    todayPostReplyLastRunAt: "2026-07-16T03:00:00.000Z",
    todayPostReplyLastStatus: "partial",
    todayPostReplyLastError: "0건 남음 · 재시도 오류 0건",
    todayPostReplyLastSummary: {
      date: "2026-07-16",
      discoveryComplete: false,
      rootPostCount: 0,
      checkedRootCount: 0,
      remainingEligibleCount: 0,
      retryableErrorCount: 0,
    },
  }, "2026-07-16");
  assert.equal(dashboard.lastStatus, "partial");
  assert.match(dashboard.lastError, /원글 발견 미완료/);
  assert.doesNotMatch(dashboard.lastError, /0건 남음/);
});

test("today sweep circuit breaker recognizes repeated identical batch failures", () => {
  assert.equal(terafabxReplyBatchFailureSignature({
    posted: [],
    rejected: [
      { error: "Gemini runner missing" },
      { error: "Gemini runner missing" },
    ],
  }), "Gemini runner missing");
  assert.equal(terafabxReplyBatchFailureSignature({
    posted: [{ replyUrl: "https://x.com/terafabXai/status/1" }],
    rejected: [{ error: "later error" }],
  }), "");
});

test("today post discovery accepts only today's @terafabXai root posts", () => {
  const metadata = {
    id: "1",
    authorHandle: "terafabXai",
    replyingToStatus: "",
    createdAt: "2026-07-13T03:00:00.000Z",
  };
  assert.equal(isTerafabxTodayRootPostMetadata(metadata, "2026-07-13"), true);
  assert.equal(isTerafabxTodayRootPostMetadata({ ...metadata, replyingToStatus: "99" }, "2026-07-13"), false);
  assert.equal(isTerafabxTodayRootPostMetadata({ ...metadata, authorHandle: "other" }, "2026-07-13"), false);
});

test("today reply workers do not share Grok sessions, Gemini ports, or profiles with auto comments", () => {
  for (let index = 0; index < 5; index += 1) {
    const automatic = terafabxCommentPrefillWorkerResources(index);
    const today = terafabxTodayPostReplyWorkerResources(index);
    assert.notEqual(today.grokContextSession, automatic.grokContextSession);
    assert.notEqual(today.chromePort, automatic.chromePort);
    assert.notEqual(today.profileDir, automatic.profileDir);
  }
});
