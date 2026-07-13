const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assessTerafabxCurrentCommentPolicy,
  assessTerafabxLanguageQuality,
  auditTerafabxPrefillQuality,
  parseTerafabxFinalJudge,
  stripTerafabxListPrefix,
} = require("../mirror_server");

test("semantic leading numbers are preserved while real list markers are removed", () => {
  assert.equal(stripTerafabxListPrefix("5년 전이나 지금이나 말에 일관성이 있네"), "5년 전이나 지금이나 말에 일관성이 있네");
  assert.equal(stripTerafabxListPrefix("1. 첫 번째 후보"), "첫 번째 후보");
  assert.equal(stripTerafabxListPrefix("2) 두 번째 후보"), "두 번째 후보");
  assert.equal(stripTerafabxListPrefix("- 목록 후보"), "목록 후보");
});

test("local language checks only block deterministic mechanical corruption", () => {
  assert.equal(assessTerafabxLanguageQuality(
    "서민 유리가 지갑만 탈탈 털리는 현실이 씁쓸하네요",
  ).ok, true);
  assert.equal(assessTerafabxLanguageQuality(
    "년 전이나 지금이나 말에 일관성이 있네",
  ).ok, false);
});

test("style phrases are left to the structured Gemini judge", () => {
  assert.equal(assessTerafabxLanguageQuality("식기까지 일회용으로 바꾸는 효율성은 대단하네요").ok, true);
  assert.equal(assessTerafabxLanguageQuality("현장 소음 때문에 힘들어도 힘내세요").ok, true);
  assert.equal(assessTerafabxLanguageQuality("종이접시까지 쓰는 건 진짜 극한의 효율이네요").ok, true);
});

test("a perfect Gemini score cannot override an identified typo", () => {
  const result = parseTerafabxFinalJudge(JSON.stringify({
    context: 40,
    naturalness: 25,
    specificity: 15,
    concision: 10,
    non_ai_style: 10,
    fatal_error: false,
    language_error: true,
    awkward_korean: true,
    translation_tone: false,
    cliche: false,
    context_error: false,
    reason: "문맥상 유리 지갑을 유리가 지갑으로 오기함",
  }), "서민 유리가 지갑만 탈탈 털리는 현실이 씁쓸하네요");
  assert.equal(result.score, 100);
  assert.equal(result.passed, false);
  assert.deepEqual(result.flaggedQualityIssues, ["language_error", "awkward_korean"]);
});

test("structured Gemini flags are mandatory only for comments created after rollout", () => {
  const legacyJudge = { passed: true, fatalError: false, dimensions: { context: 38 } };
  const legacy = assessTerafabxCurrentCommentPolicy({
    at: "2026-07-13T00:45:59.000Z",
    comment: "숫자와 문장이 정상적으로 보존된 댓글이에요",
    geminiReview: { finalJudge: legacyJudge },
  });
  const current = assessTerafabxCurrentCommentPolicy({
    at: "2026-07-13T00:46:00.000Z",
    comment: "숫자와 문장이 정상적으로 보존된 댓글이에요",
    geminiReview: { finalJudge: legacyJudge },
  });
  assert.equal(legacy.ok, true);
  assert.equal(current.ok, false);
  assert.ok(current.errors.includes("structured_quality_flags_missing"));
});

test("prefill audit checks every queued and posted item with the genericity gate", () => {
  const goodJudge = {
    passed: true,
    fatalError: false,
    qualityFlagsComplete: true,
    genericityFlagsComplete: true,
    sourceAnchorGrounded: true,
    flaggedQualityIssues: [],
    dimensions: { context: 38 },
    score: 94,
    sourceAnchor: "공동 계좌에서 2만 달러",
    qualityFlags: { cross_post_reusable: false, headline_tone: false, specificity_error: false },
  };
  const audit = auditTerafabxPrefillQuality({
    pendingCommentPosts: [{
      source: "prefill",
      status: "pending",
      queuedAt: "2026-07-13T13:30:00.000Z",
      targetUrl: "https://x.com/example/status/1",
      comment: "공동 계좌에서 2만 달러면 신뢰가 흔들릴 만하네요",
      geminiReview: { finalJudge: goodJudge },
    }],
    commentHistory: [{
      source: "prefill",
      status: "posted",
      posted: true,
      queuedAt: "2026-07-13T13:20:00.000Z",
      postedAt: "2026-07-13T13:21:00.000Z",
      targetUrl: "https://x.com/example/status/2",
      comment: "폭로성 스캔들은 사실 확인이 먼저 필요합니다",
      geminiReview: { finalJudge: { ...goodJudge, genericityFlagsComplete: false, sourceAnchorGrounded: false } },
    }],
  });

  assert.equal(audit.checkedCount, 2);
  assert.equal(audit.passedCount, 1);
  assert.equal(audit.failedCount, 1);
  assert.equal(audit.pendingCount, 1);
  assert.equal(audit.pendingPassedCount, 1);
  assert.equal(audit.pendingFailedCount, 0);
  assert.equal(audit.postedCount, 1);
  assert.equal(audit.postedPassedCount, 0);
  assert.equal(audit.postedFailedCount, 1);
  assert.equal(audit.postedLegacyUnverifiableCount, 1);
  assert.equal(audit.postedQualityFailedCount, 0);
  assert.ok(audit.items.find((item) => !item.ok).errors.includes("genericity_quality_flags_missing"));
});
