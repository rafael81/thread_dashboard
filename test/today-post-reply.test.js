const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assessTerafabxTodayPostReplyCompletion,
  isTerafabxTodayRootPostMetadata,
  terafabxCommentPrefillWorkerResources,
  terafabxTodayPostReplyWorkerResources,
  terafabxReplyBatchFailureSignature,
} = require("../mirror_server");

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
