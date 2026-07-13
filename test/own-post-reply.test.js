const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assessTerafabxParentContextMismatch,
  assessTerafabxReplyRelationship,
  buildTerafabxFixedImageReplyRecord,
  buildTerafabxOwnPostReplyTarget,
  classifyTerafabxOwnPostReplies,
  isTerafabxAdComment,
  terafabxAdCommentReason,
  isTerafabxSkippableOwnPostReplyTargetError,
  isTerafabxImageOnlyReply,
  isTerafabxGeminiWorkTab,
  randomTerafabxOwnPostReplyDelayMs,
  runFixedWorkerPool,
  shouldUseTerafabxQuickIntent,
  terafabxBrowserConcurrency,
  terafabxCommentPrefillWorkerResources,
  knownTerafabxGrokWebSessions,
  terafabxOwnPostReplyBatchLimit,
  normalizeFxTwitterV2Status,
  flattenFxTwitterConversationReplies,
  normalizeTerafabxOwnPostReplyManualQueue,
  terafabxOwnPostReplyQueueItemForUrl,
  terafabxReplyReviewFinalScore,
  isTerafabxReplyReviewScoreQualified,
  terafabxFinalJudgePrompt,
  terafabxGeminiGeneratePrompt,
  terafabxSingleOwnPostCandidateLimit,
  isTerafabxGrokNonJsonLimitText,
  parseTerafabxFinalJudge,
  parseTerafabxGeminiBatchFinalJudge,
  parseTerafabxGeminiBatchReview,
  terafabxGrokContextPrompt,
  terafabxGeminiBatchFinalJudgePrompt,
  terafabxGeminiBatchReviewPrompt,
  terafabxGeminiBatchGeneratePrompt,
  terafabxGeminiReviewPrompt,
  terafabxStatusHrefMatches,
  isTerafabxReplySubmitCandidate,
  isTerafabxReplySubmissionUncertain,
  isTerafabxTransientReplyPageError,
  isTerafabxPendingCommentEligible,
  recoverRecentTransientPrefillFailures,
  terafabxPendingCommentFailureDisposition,
  withTerafabxBrowserSetupCleanup,
  xPageReadyState,
  terafabxGeminiPriorityValue,
} = require("../mirror_server");

test("X home readiness rejects blank and error pages", () => {
  assert.equal(xPageReadyState({ bodyText: "", articleCount: 0 }, "home").ready, false);
  assert.equal(xPageReadyState({ bodyText: "Something went wrong", articleCount: 2 }, "home").ready, false);
  assert.equal(xPageReadyState({ bodyText: "홈 타임라인", articleCount: 1 }, "home").ready, true);
});

test("X schedule readiness distinguishes loaded empty state from a blank shell", () => {
  assert.equal(xPageReadyState({ bodyText: "탐색 홈 알림", scheduleMarkerCount: 0 }, "schedule").ready, false);
  assert.equal(xPageReadyState({ bodyText: "예약 게시물이 없습니다", scheduleMarkerCount: 0 }, "schedule").ready, true);
  assert.equal(xPageReadyState({ bodyText: "7월 14일 전송 예정", scheduleMarkerCount: 1 }, "schedule").ready, true);
});

const rootUrl = "https://x.com/terafabXai/status/100";

test("FxTwitter v2 conversation rows preserve direct and nested reply relationships", () => {
  const direct = {
    id: "101",
    url: "https://x.com/alice/status/101",
    text: "@terafabXai 귀여워요",
    author: { screen_name: "alice", verification: { verified: true, type: "individual" } },
    replying_to: { screen_name: "terafabXai", status: "100" },
    media: {},
    replies: [{
      id: "102",
      url: "https://x.com/terafabXai/status/102",
      text: "@alice 그러게요",
      author: { screen_name: "terafabXai", verification: { verified: true, type: "individual" } },
      replying_to: { screen_name: "alice", status: "101" },
      media: {},
    }],
  };
  const rows = flattenFxTwitterConversationReplies([direct, direct.replies[0]]).map(normalizeFxTwitterV2Status);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].replyingToStatus, "100");
  assert.equal(rows[0].authorVerified, true);
  assert.equal(rows[1].replyingToStatus, "101");
  assert.equal(rows[1].text, "그러게요");
});

test("manual own-post reply queue survives restart and resolves the latest item per post", () => {
  const queue = normalizeTerafabxOwnPostReplyManualQueue([
    { id: "old", postUrl: `${rootUrl}?s=20`, status: "completed" },
    { id: "new", postUrl: rootUrl, status: "queued", stageLabel: "대기 중" },
  ]);
  assert.equal(queue.length, 2);
  assert.equal(queue[1].status, "queued");
  assert.equal(terafabxOwnPostReplyQueueItemForUrl(queue, `${rootUrl}?x=1`).id, "new");
});

test("own-post reply candidates exclude own affiliate comments, nested replies, and already replied comments", () => {
  const result = classifyTerafabxOwnPostReplies({
    rootUrl,
    requiredHandle: "terafabXai",
    tweets: [
      { id: "100", url: rootUrl, authorHandle: "terafabXai", text: "내 글" },
      { id: "101", url: "https://x.com/terafabXai/status/101", authorHandle: "terafabXai", text: "쿠팡 파트너스 링크", replyingToStatus: "100" },
      { id: "102", url: "https://x.com/alice/status/102", authorHandle: "alice", text: "첫 댓글", replyingToStatus: "100" },
      { id: "103", url: "https://x.com/terafabXai/status/103", authorHandle: "terafabXai", text: "이미 단 대댓글", replyingToStatus: "102" },
      { id: "104", url: "https://x.com/bob/status/104", authorHandle: "bob", text: "새 댓글", replyingToStatus: "100" },
      { id: "105", url: "https://x.com/carol/status/105", authorHandle: "carol", text: "중첩 댓글", replyingToStatus: "104" },
    ],
    state: {},
  });

  assert.deepEqual(result.ownComments.map((item) => item.id), ["101"]);
  assert.deepEqual(result.alreadyReplied.map((item) => item.id), ["102"]);
  assert.deepEqual(result.candidates.map((item) => item.id), ["104"]);
  assert.equal(result.nestedCount, 2);
});

test("generic comment history also prevents a duplicate own-post reply", () => {
  const result = classifyTerafabxOwnPostReplies({
    rootUrl,
    requiredHandle: "terafabXai",
    tweets: [
      { id: "106", url: "https://x.com/dave/status/106", authorHandle: "dave", text: "새 댓글", replyingToStatus: "100" },
    ],
    state: {
      commentHistory: [{ targetUrl: "https://x.com/dave/status/106", replyUrl: "https://x.com/terafabXai/status/107" }],
    },
  });

  assert.equal(result.candidates.length, 0);
  assert.deepEqual(result.alreadyReplied.map((item) => item.id), ["106"]);
});

test("own-post reply classification rejects another account's root post", () => {
  assert.throws(() => classifyTerafabxOwnPostReplies({
    rootUrl: "https://x.com/someone/status/100",
    requiredHandle: "terafabXai",
    tweets: [],
  }), /내 X 게시물만/);
});

test("verified-only own-post replies exclude accounts without X verification", () => {
  const result = classifyTerafabxOwnPostReplies({
    rootUrl,
    requiredHandle: "terafabXai",
    verifiedOnly: true,
    tweets: [
      { id: "110", url: "https://x.com/verified/status/110", authorHandle: "verified", authorVerified: true, text: "인증 댓글", replyingToStatus: "100" },
      { id: "111", url: "https://x.com/plain/status/111", authorHandle: "plain", authorVerified: false, text: "일반 댓글", replyingToStatus: "100" },
      { id: "112", url: "https://x.com/unknown/status/112", authorHandle: "unknown", text: "확인 불가 댓글", replyingToStatus: "100" },
    ],
  });

  assert.deepEqual(result.candidates.map((item) => item.id), ["110"]);
  assert.deepEqual(result.unverified.map((item) => item.id), ["111", "112"]);
});

test("own-post replies skip advertising or promotional comments even when verified", () => {
  const result = classifyTerafabxOwnPostReplies({
    rootUrl,
    requiredHandle: "terafabXai",
    verifiedOnly: true,
    tweets: [
      { id: "114", url: "https://x.com/ad1/status/114", authorHandle: "ad1", authorVerified: true, text: "쿠팡 파트너스 링크 확인하세요", replyingToStatus: "100" },
      { id: "115", url: "https://x.com/ad2/status/115", authorHandle: "ad2", authorVerified: true, text: "할인 이벤트 문의는 DM 주세요", replyingToStatus: "100" },
      { id: "116", url: "https://x.com/ad3/status/116", authorHandle: "ad3", authorVerified: true, text: "https://t.co/promo 지금 구매 가능", replyingToStatus: "100" },
      { id: "117", url: "https://x.com/ad4/status/117", authorHandle: "ad4", authorVerified: true, text: "제 프로필 링크도 확인 부탁드려요", replyingToStatus: "100" },
      { id: "118", url: "https://x.com/ad5/status/118", authorHandle: "ad5", authorVerified: true, text: "맞팔해 주세요", replyingToStatus: "100" },
      { id: "119", url: "https://x.com/fan/status/119", authorHandle: "fan", authorVerified: true, text: "이건 진짜 웃기네요 ㅋㅋ", replyingToStatus: "100" },
    ],
  });

  assert.equal(isTerafabxAdComment({ text: "할인 이벤트 문의는 DM 주세요" }), true);
  assert.equal(terafabxAdCommentReason({ text: "https://t.co/promo 지금 구매 가능" }), "external_link_or_contact");
  assert.equal(terafabxAdCommentReason({ text: "제 프로필 링크도 확인 부탁드려요" }), "profile_or_account_promo");
  assert.equal(terafabxAdCommentReason({ text: "맞팔해 주세요" }), "engagement_bait");
  assert.deepEqual(result.advertisements.map((item) => item.id), ["114", "115", "116", "117", "118"]);
  assert.deepEqual(result.candidates.map((item) => item.id), ["119"]);
});

test("verified image-only direct replies use the fixed heart emoji rule", () => {
  const imageReply = {
    id: "113",
    url: "https://x.com/verified/status/113",
    authorHandle: "verified",
    authorVerified: true,
    text: "",
    imageCount: 1,
    videoCount: 0,
    replyingToStatus: "100",
  };
  const result = classifyTerafabxOwnPostReplies({
    rootUrl,
    requiredHandle: "terafabXai",
    verifiedOnly: true,
    tweets: [
      imageReply,
      { ...imageReply, id: "114", url: "https://x.com/plain/status/114", authorVerified: false },
    ],
  });
  assert.deepEqual(result.candidates.map((item) => item.id), ["113"]);
  assert.equal(isTerafabxImageOnlyReply(result.candidates[0]), true);

  const target = buildTerafabxOwnPostReplyTarget(result.candidates[0], {
    postUrl: rootUrl,
    rootPost: { url: rootUrl, text: "침수된 집에서 고양이가 물을 마시는 장면" },
  });
  const record = buildTerafabxFixedImageReplyRecord(target, { manual: true, source: "own_post_reply" });
  assert.equal(target.imageOnly, true);
  assert.equal(record.comment, "❤️");
  assert.equal(record.generator, "fixed-image-only-emoji");
  assert.equal(record.geminiReview.decision, "fixed_image_only_emoji");
});

test("missing own-post reply targets are skippable without stopping the batch", () => {
  assert.equal(isTerafabxSkippableOwnPostReplyTargetError(new Error('원 댓글 좋아요 실패: {"reason":"target_article_not_found"}')), true);
  assert.equal(isTerafabxSkippableOwnPostReplyTargetError(new Error("로그인 확인 실패")), false);
});

test("own-post reply target carries the parent post context into every review stage", () => {
  const target = buildTerafabxOwnPostReplyTarget({
    id: "110",
    url: "https://x.com/verified/status/110",
    text: "진짜귀엽고기특함",
  }, {
    postUrl: rootUrl,
    rootPost: {
      url: rootUrl,
      text: "비 와서 집이 한강 됐는데 고양이는 자기가 다 마셔서 해결하려고 함",
    },
  });
  assert.equal(target.rootPostUrl, rootUrl);
  assert.match(target.rootPostText, /고양이는 자기가 다 마셔서 해결/);

  const grok = { reply: "물까지 마시면서 돕는 게 기특하네요", contextSummary: "침수된 집에서 고양이가 물을 마시는 장면", keyPoints: ["침수", "고양이"] };
  for (const prompt of [
    terafabxGrokContextPrompt(target),
    terafabxGeminiGeneratePrompt(target, grok),
    terafabxGeminiReviewPrompt(target, grok),
    terafabxFinalJudgePrompt(target, grok, "물까지 마시면서 돕는 게 기특하네요"),
  ]) {
    assert.match(prompt, /부모 원글: 비 와서 집이 한강 됐는데/);
    assert.match(prompt, /답글 대상 댓글: 진짜귀엽고기특함/);
    assert.match(prompt, /모르는 듯 되묻지 마라/);
  }
});

test("Grok context prompt does not ask Grok to generate a reply", () => {
  const prompt = terafabxGrokContextPrompt({
    url: "https://x.com/example/status/1",
    targetText: "주말 출근자들을 응원합니다",
  });
  assert.match(prompt, /공개 답글 후보는 절대 작성하지 마라/);
  assert.match(prompt, /reply, comment, final_reply 같은 댓글 필드는 출력하지 마라/);
});

test("own-post reply generation fails closed without parent post text", () => {
  assert.throws(() => buildTerafabxOwnPostReplyTarget({
    id: "110",
    url: "https://x.com/verified/status/110",
    text: "진짜귀엽고기특함",
  }, {
    postUrl: rootUrl,
    rootPost: { url: rootUrl, text: "" },
  }), /부모 원글 문맥이 비어/);
});

test("visible-subject praise cannot be rewritten as an unknown-subject question", () => {
  const target = {
    rootPostUrl: rootUrl,
    rootPostText: "고양이가 물을 마시며 침수된 집을 해결하려는 장면",
    targetText: "진짜귀엽고기특함",
  };
  assert.equal(assessTerafabxParentContextMismatch(target, "도대체 어떤 귀염둥이길래 그래요").ok, false);
  assert.equal(assessTerafabxParentContextMismatch(target, "물까지 마시면서 돕는 게 진짜 기특하죠").ok, true);
});

test("ordinary comment prompts keep the single-post context format", () => {
  const prompt = terafabxGeminiReviewPrompt({
    url: "https://x.com/example/status/1",
    targetText: "주말 출근자들을 응원합니다",
  }, { reply: "주말 출근 정말 고생 많으세요" });
  assert.match(prompt, /원문: 주말 출근자들을 응원합니다/);
  assert.doesNotMatch(prompt, /부모 원글:/);
});

test("own-post batch Gemini review keeps rewrite separate from independent scoring", () => {
  const target = buildTerafabxOwnPostReplyTarget({
    id: "120",
    url: "https://x.com/fan/status/120",
    authorHandle: "fan",
    authorVerified: true,
    text: "진짜 물 위를 걷는 것처럼 보이네요",
  }, {
    postUrl: rootUrl,
    rootPost: { url: rootUrl, text: "투명한 카약 신발처럼 보이는 장치를 타고 물 위를 이동하는 영상" },
  });
  const item = {
    ok: true,
    target,
    prepared: {
      comment: "진짜 있으면 한번 신어보고 싶네요",
      grokComment: "진짜 있으면 한번 신어보고 싶네요",
      grokContext: {
        summary: "투명한 장치로 물 위를 이동하는 장면에 대한 반응",
        keyPoints: ["물 위 이동", "신기한 장치"],
      },
    },
  };

  const reviewPrompt = terafabxGeminiBatchReviewPrompt([item]);
  assert.match(reviewPrompt, /점수를 매기지 않는다/);
  assert.match(reviewPrompt, /JSON 배열 한 줄/);
  assert.match(reviewPrompt, /index=0/);
  assert.doesNotMatch(reviewPrompt, /context 0~40/);

  const judgePrompt = terafabxGeminiBatchFinalJudgePrompt([{ ...item, review: { finalReply: "진짜 있으면 한번 신어보고 싶네요" } }]);
  assert.match(judgePrompt, /독립 묶음 최종 심사자/);
  assert.match(judgePrompt, /context 0~40/);
  assert.match(judgePrompt, /최종 심사 대상 댓글: 진짜 있으면 한번 신어보고 싶네요/);
});

test("comment prefill batches generation and rewrite without self scoring", () => {
  const prompt = terafabxGeminiBatchGeneratePrompt([{
    target: { url: rootUrl, targetId: "100", targetText: "수건으로 곰인형 만들기" },
    grokContext: { contextSummary: "수건 DIY", keyPoints: ["곰인형"] },
  }]);
  assert.match(prompt, /작성기/);
  assert.match(prompt, /점수를 매기지 마라/);
  assert.doesNotMatch(prompt, /context 0~40/);
  assert.match(prompt, /JSON 배열/);
});

test("automatic comments outrank manual and own-post Gemini work", () => {
  assert.ok(terafabxGeminiPriorityValue("comment") < terafabxGeminiPriorityValue("manual"));
  assert.ok(terafabxGeminiPriorityValue("manual") < terafabxGeminiPriorityValue("normal"));
});

test("own-post batch Gemini JSON parsing preserves review and final judge gates", () => {
  const reviewed = parseTerafabxGeminiBatchReview('```json\n[{"index":0,"final_reply":"물 위를 걷는 느낌이라 더 신기하네요","decision":"rewrite","reason":"장면 반영"}]\n```', [0]);
  assert.equal(reviewed[0].finalReply, "물 위를 걷는 느낌이라 더 신기하네요");
  assert.equal(reviewed[0].decision, "rewrite");

  const judged = parseTerafabxGeminiBatchFinalJudge('[{"index":0,"context":38,"naturalness":24,"specificity":14,"concision":9,"non_ai_style":9,"fatal_error":false,"language_error":false,"awkward_korean":false,"translation_tone":false,"cliche":false,"context_error":false,"cross_post_reusable":false,"headline_tone":false,"specificity_error":false,"source_anchor":"물 위를 걷는","reason":"문맥과 자연스러움이 좋음"}]', [{ finalReply: reviewed[0].finalReply, target: { targetText: "물 위를 걷는 장면" } }]);
  assert.equal(judged[0].score, 94);
  assert.equal(judged[0].passed, true);

  assert.throws(
    () => parseTerafabxGeminiBatchReview('[{"index":1,"final_reply":"좋네요","decision":"keep"}]', [0]),
    /index 오류|결과 누락/,
  );
});

test("one invalid Gemini batch reply is isolated without rejecting valid siblings", () => {
  const rows = parseTerafabxGeminiBatchReview(JSON.stringify([
    { index: 0, final_reply: "장면이 정말 절묘하게 맞아떨어지네", decision: "rewrite" },
    { index: 1, final_reply: "수익은 없어도 팔로워 만오천 명은 대박인데", decision: "rewrite" },
  ]), [{}, {}]);

  assert.equal(rows[0].rejected, false);
  assert.equal(rows[1].rejected, true);
  assert.match(rows[1].reason, /금지\/저품질 표현/);
});

test("reply permalink targeting matches only the exact status article", () => {
  const targetId = "2075755636374261849";

  assert.equal(terafabxStatusHrefMatches(
    "https://x.com/terafabXai/status/2075452455895306302",
    targetId,
  ), false);
  assert.equal(terafabxStatusHrefMatches(
    `https://x.com/n_advent/status/${targetId}`,
    targetId,
  ), true);
  assert.equal(terafabxStatusHrefMatches(
    `https://x.com/n_advent/status/${targetId}/analytics`,
    targetId,
  ), true);
  assert.equal(terafabxStatusHrefMatches(
    `https://x.com/n_advent/status/${targetId}0`,
    targetId,
  ), false);
});

test("reply verification requires the exact parent status relationship", () => {
  const targetUrl = "https://x.com/hanaya0012/status/2075456787537633464";
  assert.equal(assessTerafabxReplyRelationship({
    url: "https://x.com/terafabXai/status/201",
    authorHandle: "terafabXai",
    replyingToStatus: "2075456787537633464",
  }, targetUrl).ok, true);
  assert.equal(assessTerafabxReplyRelationship({
    url: "https://x.com/terafabXai/status/202",
    authorHandle: "terafabXai",
    replyingToStatus: "",
  }, targetUrl).ok, false);
  assert.equal(assessTerafabxReplyRelationship({
    url: "https://x.com/terafabXai/status/203",
    authorHandle: "terafabXai",
    replyingToStatus: "2075452455895306302",
  }, targetUrl).ok, false);
});

test("own-post batch delay is an inclusive 10 to 20 second random interval", () => {
  assert.equal(randomTerafabxOwnPostReplyDelayMs(() => 0), 10_000);
  assert.equal(randomTerafabxOwnPostReplyDelayMs(() => 0.999999999), 20_000);
  assert.equal(randomTerafabxOwnPostReplyDelayMs(() => 0.5), 15_000);
});

test("quick intent submission is disabled because it cannot prove reply context before posting", () => {
  assert.equal(shouldUseTerafabxQuickIntent({ quick: true }, "2075864860676809145"), false);
  assert.equal(shouldUseTerafabxQuickIntent({ quick: true, validate: true }, "2075864860676809145"), false);
  assert.equal(shouldUseTerafabxQuickIntent({ quick: false }, "2075864860676809145"), false);
  assert.equal(shouldUseTerafabxQuickIntent({ quick: true }, ""), false);
});

test("reply submit accepts localized controls only after the reply composer kind is proven", () => {
  assert.equal(isTerafabxReplySubmitCandidate({ withinReplyComposer: true, testid: "tweetButton", text: "답글" }), true);
  assert.equal(isTerafabxReplySubmitCandidate({ withinReplyComposer: true, testid: "tweetButtonInline", text: "Reply" }), true);
  assert.equal(isTerafabxReplySubmitCandidate({ withinReplyComposer: true, composerKind: "inline_reply", testid: "tweetButtonInline", text: "게시하기" }), true);
  assert.equal(isTerafabxReplySubmitCandidate({ withinReplyComposer: true, composerKind: "dialog_reply", testid: "tweetButton", text: "Post" }), true);
  assert.equal(isTerafabxReplySubmitCandidate({ withinReplyComposer: false, testid: "tweetButton", text: "답글" }), false);
  assert.equal(isTerafabxReplySubmitCandidate({ withinReplyComposer: true, testid: "tweetButton", text: "게시하기" }), false);
  assert.equal(isTerafabxReplySubmitCandidate({ withinReplyComposer: true, testid: "tweetButton", text: "Post" }), false);
});

test("an uncertain reply submission is quarantined instead of retried", () => {
  const error = new Error("reply verification timed out after submit");
  error.code = "TERAFABX_REPLY_SUBMISSION_UNCERTAIN";
  assert.equal(isTerafabxReplySubmissionUncertain(error), true);
  assert.deepEqual(terafabxPendingCommentFailureDisposition({ attempts: 0 }, error, 3), {
    attempts: 1,
    submissionUncertain: true,
    removeFromPending: true,
    failedReason: "submission_uncertain",
  });
  assert.deepEqual(terafabxPendingCommentFailureDisposition({ attempts: 0 }, new Error("browser did not open"), 3), {
    attempts: 1,
    submissionUncertain: false,
    removeFromPending: false,
    failedReason: null,
  });
});

test("a blank X reply page is retried with a cooldown instead of being exhausted rapidly", () => {
  const error = new Error('target root 검증 실패: {"ok":false,"text":"","url":"https://x.com/a/status/1"}');
  assert.equal(isTerafabxTransientReplyPageError(error), true);
  const result = terafabxPendingCommentFailureDisposition({ attempts: 2 }, error, 3);
  assert.equal(result.attempts, 3);
  assert.equal(result.submissionUncertain, false);
  assert.equal(result.removeFromPending, false);
  assert.equal(result.transientPageError, true);
  assert.ok(Date.parse(result.nextAttemptAt) > Date.now());
});

test("a pending comment remains ineligible until its retry cooldown expires", () => {
  const nowMs = Date.parse("2026-07-13T15:00:00.000Z");
  assert.equal(isTerafabxPendingCommentEligible({ nextAttemptAt: "2026-07-13T15:10:00.000Z" }, nowMs), false);
  assert.equal(isTerafabxPendingCommentEligible({ nextAttemptAt: "2026-07-13T14:59:59.000Z" }, nowMs), true);
  assert.equal(isTerafabxPendingCommentEligible({}, nowMs), true);
});

test("recent quality-passed prefill exhausted by a blank X page is recoverable", () => {
  const nowMs = Date.parse("2026-07-13T15:00:00.000Z");
  const state = {
    pendingCommentPosts: [],
    commentHistory: [],
    failedPendingCommentPosts: [{
      source: "prefill",
      targetUrl: "https://x.com/a/status/1",
      comment: "의정부고 졸업사진은 매년 퀄리티가 엄청나네요",
      queuedAt: "2026-07-13T14:30:00.000Z",
      errorAt: "2026-07-13T14:40:00.000Z",
      failedReason: "max_attempts",
      lastError: 'target root 검증 실패: {"text":""}',
      geminiReview: { finalJudge: {
        passed: true,
        fatalError: false,
        qualityFlagsComplete: true,
        genericityFlagsComplete: true,
        sourceAnchorGrounded: true,
        flaggedQualityIssues: [],
        qualityFlags: {
          language_error: false,
          awkward_korean: false,
          translation_tone: false,
          cliche: false,
          context_error: false,
          cross_post_reusable: false,
          headline_tone: false,
          specificity_error: false,
        },
        dimensions: { context: 40 },
      } },
    }],
  };
  const result = recoverRecentTransientPrefillFailures(state, { nowMs, persist: false });
  assert.equal(result.count, 1);
  assert.equal(result.recovered[0].attempts, 0);
  assert.ok(Date.parse(result.recovered[0].nextAttemptAt) > nowMs);

  const legacyState = JSON.parse(JSON.stringify(state));
  legacyState.failedPendingCommentPosts[0].queuedAt = "2026-07-13T12:15:00.000Z";
  assert.equal(recoverRecentTransientPrefillFailures(legacyState, { nowMs, persist: false }).count, 0);
});

test("Grok quota text is not converted into a typed own-post backoff error", () => {
  assert.throws(
    () => parseTerafabxFinalJudge("You've reached your limit of 50 Grok Auto questions per 2 hours for now.", "좋네요"),
    (error) => error?.code !== "TERAFABX_GROK_QUOTA_LIMIT" && /Unexpected token|not valid JSON/.test(error.message),
  );
  assert.equal(isTerafabxGrokNonJsonLimitText("You've reached your limit of 50 Grok Auto questions per 2 hours for now."), true);
  assert.equal(isTerafabxGrokNonJsonLimitText('{"context_summary":"정상","key_points":["문맥"]}'), false);
});

test("single own-post reply runner keeps its bounded candidate window", () => {
  assert.equal(terafabxSingleOwnPostCandidateLimit(), 5);
  assert.equal(terafabxSingleOwnPostCandidateLimit(0), 1);
  assert.equal(terafabxSingleOwnPostCandidateLimit(99), 20);
});

test("own-post reply batch defaults to all collected candidates", () => {
  assert.equal(terafabxOwnPostReplyBatchLimit(), 200);
  assert.equal(terafabxOwnPostReplyBatchLimit(5), 5);
  assert.equal(terafabxOwnPostReplyBatchLimit(999), 200);
});

test("own-post reply score gate rejects sub-90 final judge scores even when passed", () => {
  const lowPassed = { score: 89, finalJudge: { score: 89, passed: true } };
  assert.equal(terafabxReplyReviewFinalScore(lowPassed), 89);
  assert.equal(isTerafabxReplyReviewScoreQualified(lowPassed), false);
  assert.equal(isTerafabxReplyReviewScoreQualified({ score: 90, finalJudge: { score: 90, passed: true } }), true);
  assert.equal(isTerafabxReplyReviewScoreQualified({ score: 91 }), true);
  assert.equal(isTerafabxReplyReviewScoreQualified({}), false);
});

test("browser-heavy TerafabX workers keep five-way concurrency", () => {
  assert.equal(terafabxBrowserConcurrency(5, 5), 5);
  assert.equal(terafabxBrowserConcurrency(20, 20), 5);
  assert.equal(terafabxBrowserConcurrency(2, 1), 1);
  assert.equal(terafabxBrowserConcurrency(1, 10), 1);
});

test("five comment prefill workers use distinct Grok sessions, Gemini ports, and profiles", () => {
  const workers = Array.from({ length: 5 }, (_, index) => terafabxCommentPrefillWorkerResources(index));
  assert.equal(new Set(workers.map((item) => item.grokContextSession)).size, 5);
  assert.equal(new Set(workers.map((item) => item.chromePort)).size, 5);
  assert.equal(new Set(workers.map((item) => item.profileDir)).size, 5);
  assert.deepEqual(workers.map((item) => item.chromePort), [9254, 9255, 9256, 9257, 9258]);
  assert.ok(workers.every((item, index) => item.grokContextSession.endsWith(`comment-prefill-${index + 1}`)));
});

test("startup cleanup covers every fixed TerafabX Grok worker session", () => {
  const sessions = knownTerafabxGrokWebSessions();
  assert.equal(new Set(sessions).size, sessions.length);
  assert(sessions.includes("terafabx-grok-headless"));
  for (let index = 1; index <= 5; index += 1) {
    assert(sessions.includes(`terafabx-grok-headless-comment-prefill-${index}`));
    assert(sessions.includes(`terafabx-grok-headless-own-post-reply-context-${index}`));
  }
  assert(sessions.includes("terafabx-grok-headless-own-post-root-context"));
});

test("Gemini worker cleanup closes only disposable work tabs", () => {
  assert.equal(isTerafabxGeminiWorkTab({ type: "page", url: "https://gemini.google.com/app/abc" }), true);
  assert.equal(isTerafabxGeminiWorkTab({ type: "page", url: "https://www.google.com/sorry/index?continue=x" }), true);
  assert.equal(isTerafabxGeminiWorkTab({ type: "page", url: "about:blank" }), false);
  assert.equal(isTerafabxGeminiWorkTab({ type: "page", url: "https://x.com/home" }), false);
  assert.equal(isTerafabxGeminiWorkTab({ type: "service_worker", url: "https://gemini.google.com/sw.js" }), false);
});

test("headless browser setup failure always runs cleanup and preserves the original error", async () => {
  const calls = [];
  const setupError = new Error("CDP 9224 unavailable");
  await assert.rejects(withTerafabxBrowserSetupCleanup(
    async () => {
      calls.push("setup");
      throw setupError;
    },
    async () => {
      calls.push("cleanup");
      return { remainingPids: [] };
    },
    (error, cleanup) => {
      calls.push(`reported:${error.message}:${cleanup.remainingPids.length}`);
    },
  ), (error) => error === setupError);
  assert.deepEqual(calls, ["setup", "cleanup", "reported:CDP 9224 unavailable:0"]);
});

test("fixed worker pool prepares at most five items without reusing an active worker", async () => {
  const items = Array.from({ length: 12 }, (_, index) => index);
  const activeWorkers = new Set();
  let active = 0;
  let maxActive = 0;
  const results = await runFixedWorkerPool(items, 5, async (item, workerIndex) => {
    assert.equal(activeWorkers.has(workerIndex), false);
    activeWorkers.add(workerIndex);
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    activeWorkers.delete(workerIndex);
    return item === 6 ? { ok: false, item } : { ok: true, item, workerIndex };
  });

  assert.equal(maxActive, 5);
  assert.equal(results.length, 12);
  assert.deepEqual(results.map((item) => item.item), items);
  assert.equal(results[6].ok, false);
  assert.equal(results.filter((item) => item.ok).length, 11);
});
