const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assessTerafabxCurrentCommentPolicy,
  assessTerafabxLanguageQuality,
  auditTerafabxPrefillQuality,
  parseTerafabxFinalJudge,
  scoreTerafabxClichePenalty,
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

test("local quality gate blocks insulting tone escalation", () => {
  const result = assessTerafabxLanguageQuality("수업 중에 저걸 하다니 간이 엄청 부었네요");
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("tone_escalation_insult"));
  assert.equal(assessTerafabxLanguageQuality("축구 지능 미쳤다 소름 돋네").ok, true);
});

test("local quality gate blocks repeated reaction stems", () => {
  const result = assessTerafabxLanguageQuality("엄마를 놀라게 하는 장면에 놀라는 모습이 유쾌해요");
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("repeated_reaction_stem"));
  assert.equal(assessTerafabxLanguageQuality("엄마 반응이 예상보다 커서 유쾌해요").ok, true);
});

test("local quality gate blocks fabricated personal experience", () => {
  const result = assessTerafabxLanguageQuality("옛날 맛이랑 확실히 달라지긴 했더라고요");
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("fabricated_personal_experience"));
  assert.ok(assessTerafabxLanguageQuality("습도만 낮아져도 살 것 같더라").errors.includes("fabricated_personal_experience"));
  assert.ok(assessTerafabxLanguageQuality("인중 늘어날까 봐 안 따라 했는데 꿀팁이네요").errors.includes("fabricated_personal_experience"));
  assert.ok(assessTerafabxLanguageQuality("시간 지나도 한결같고 편한 사람이 남더라고").errors.includes("fabricated_personal_experience"));
  assert.equal(assessTerafabxLanguageQuality("옛날 단면과 확실히 달라 보이네요").ok, true);
});

test("current policy blocks deterministic cliches even when the independent judge misses its flag", () => {
  const comment = "자신감 넘치는 직진 플러팅에 웃음이 터지네요";
  assert.equal(scoreTerafabxClichePenalty(comment).penalty, 16);
  const result = assessTerafabxCurrentCommentPolicy({
    at: "2026-07-13T16:00:00.000Z",
    targetText: "경기장에서 자신 있게 말을 거는 장면",
    comment,
    grokContext: {
      summary: "경기장 관중석에서 한 남성이 자신 있게 플러팅하고 상대가 웃으며 반응하는 가벼운 영상이다.",
      keyPoints: ["자신감 있는 직진 플러팅", "유쾌한 상호작용"],
      rawPreview: "grok-json",
      provider: "web-context",
    },
    geminiReview: { finalJudge: {
      passed: true,
      fatalError: false,
      qualityFlagsComplete: true,
      flaggedQualityIssues: [],
      dimensions: { context: 40 },
    } },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("deterministic_cliche:반복 감탄 자동댓글"));
});

test("current policy blocks unsupported certainty when the source asks whether something is broken", () => {
  const result = assessTerafabxCurrentCommentPolicy({
    at: "2026-07-13T23:42:00.000Z",
    targetText: "테슬라 온도계가 고장난 걸까요? 37도를 찍었네요.",
    comment: "37도면 고장 난 게 아니라 밖이 너무 더운 것 같아요",
    grokContext: {
      summary: "차량 온도계가 37도를 표시해 고장을 의심하는 질문이며 실제 정상 여부는 확인되지 않았다.",
      keyPoints: ["37도 표시", "고장 여부 질문"],
      rawPreview: "grok-json",
      provider: "web-context",
    },
    geminiReview: { finalJudge: {
      passed: true,
      fatalError: false,
      qualityFlagsComplete: true,
      flaggedQualityIssues: [],
      dimensions: { context: 40 },
    } },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("unsupported_uncertainty_resolution"));
});

test("current policy blocks a weekday invented outside the source and Grok context", () => {
  const result = assessTerafabxCurrentCommentPolicy({
    at: "2026-07-13T23:44:00.000Z",
    targetText: "굿모닝! 오늘 하루도 상쾌하게 시작해볼까요?",
    comment: "월요일 아침부터 에너지가 넘치시네요",
    grokContext: {
      summary: "밝은 아침 인사와 출근 응원을 전하는 게시물이며 특정 요일은 언급하지 않았다.",
      keyPoints: ["굿모닝", "활기찬 하루 응원"],
      rawPreview: "grok-json",
      provider: "web-context",
    },
    geminiReview: { finalJudge: {
      passed: true,
      fatalError: false,
      qualityFlagsComplete: true,
      flaggedQualityIssues: [],
      dimensions: { context: 35 },
    } },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("unsupported_temporal_detail:월요일"));
});

test("current policy blocks sensory details absent from the source and Grok context", () => {
  const result = assessTerafabxCurrentCommentPolicy({
    at: "2026-07-13T16:00:00.000Z",
    targetText: "눅눅하고 차가운 부추전이 좋다",
    comment: "눅눅한 전 특유의 찰진 식감이 매력 있죠",
    grokContext: {
      summary: "바삭하고 뜨거운 부추전보다 눅눅하고 차가운 부추전을 선호하는 음식 취향 글이다.",
      keyPoints: ["눅눅한 부추전 취향"],
      rawPreview: "grok-json",
      provider: "web-context",
    },
    geminiReview: { finalJudge: {
      passed: true,
      fatalError: false,
      qualityFlagsComplete: true,
      flaggedQualityIssues: [],
      dimensions: { context: 40 },
    } },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.startsWith("unsupported_sensory_detail:")));
});

test("current policy blocks unsupported chewy texture claims", () => {
  const result = assessTerafabxCurrentCommentPolicy({
    at: "2026-07-13T16:00:00.000Z",
    targetText: "요즘 이것만 먹고 있다",
    comment: "소라 살이 통통해서 식감이 쫄깃하겠어",
    grokContext: {
      summary: "사진 속 해산물 요리를 맛있다고 소개하는 게시물이다.",
      keyPoints: ["최근 자주 먹는 음식"],
      rawPreview: "grok-json",
      provider: "web-context",
    },
    geminiReview: { finalJudge: {
      passed: true,
      fatalError: false,
      qualityFlagsComplete: true,
      flaggedQualityIssues: [],
      dimensions: { context: 40 },
    } },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("쫄깃")));
});

test("current policy blocks sensitive terms introduced by the generated comment", () => {
  const result = assessTerafabxCurrentCommentPolicy({
    at: "2026-07-13T16:00:00.000Z",
    targetText: "메뉴판 해석에 대한 반박",
    comment: "사기라고 단정 짓는 건 너무 성급했네",
    grokContext: {
      summary: "메뉴판을 오독한 일을 바로잡는 게시물이다.",
      keyPoints: ["성급한 판단을 정정"],
      rawPreview: "grok-json",
      provider: "web-context",
    },
    geminiReview: { finalJudge: {
      passed: true,
      fatalError: false,
      qualityFlagsComplete: true,
      flaggedQualityIssues: [],
      dimensions: { context: 40 },
    } },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("sensitive_comment_text"));
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
    grokContext: { summary: "Grok이 원문과 답글 관계를 충분히 분석하여 안전한 반응 지점을 확인했다.", keyPoints: ["원문의 구체적인 핵심"], rawPreview: "grok-json", provider: "web-context" },
    geminiReview: { finalJudge: legacyJudge },
  });
  const current = assessTerafabxCurrentCommentPolicy({
    at: "2026-07-13T00:46:00.000Z",
    comment: "숫자와 문장이 정상적으로 보존된 댓글이에요",
    grokContext: { summary: "Grok이 원문과 답글 관계를 충분히 분석하여 안전한 반응 지점을 확인했다.", keyPoints: ["원문의 구체적인 핵심"], rawPreview: "grok-json", provider: "web-context" },
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
  const grokContext = {
    contextSummary: "Grok이 공동 계좌의 2만 달러와 폭로성 스캔들 문맥을 각각 상세히 확인했다.",
    keyPoints: ["공동 계좌에서 2만 달러"],
    rawPreview: '{"context_summary":"verified"}',
    provider: "web-context",
  };
  const audit = auditTerafabxPrefillQuality({
    pendingCommentPosts: [{
      source: "prefill",
      status: "pending",
      queuedAt: "2026-07-13T13:30:00.000Z",
      targetUrl: "https://x.com/example/status/1",
      targetText: "공동 계좌에서 2만 달러가 빠진 사건",
      comment: "공동 계좌에서 2만 달러면 신뢰가 흔들릴 만하네요",
      grokContext,
      geminiReview: { finalJudge: goodJudge },
    }],
    commentHistory: [{
      source: "prefill",
      status: "posted",
      posted: true,
      queuedAt: "2026-07-13T13:20:00.000Z",
      postedAt: "2026-07-13T13:21:00.000Z",
      targetUrl: "https://x.com/example/status/2",
      targetText: "폭로성 스캔들에 대한 사실 확인",
      comment: "폭로성 스캔들은 사실 확인이 먼저 필요합니다",
      grokContext,
      geminiReview: { finalJudge: { ...goodJudge, genericityFlagsComplete: false, sourceAnchorGrounded: false } },
    }],
  }, { sinceMs: 1 });

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
  const pendingItem = audit.items.find((item) => item.status === "pending");
  const postedItem = audit.items.find((item) => item.status === "posted");
  assert.equal(pendingItem.createdAt, "2026-07-13T13:30:00.000Z");
  assert.equal(pendingItem.postedAt, null);
  assert.equal(postedItem.createdAt, "2026-07-13T13:20:00.000Z");
  assert.equal(postedItem.postedAt, "2026-07-13T13:21:00.000Z");
  assert.ok(audit.items.find((item) => !item.ok).errors.includes("genericity_quality_flags_missing"));
});
