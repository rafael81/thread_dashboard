const assert = require("node:assert/strict");
const test = require("node:test");

const {
  SOURCE,
  normalizeHomeTimelinePost,
  assessHomeVerifiedOriginalContentSafety,
  classifyHomeVerifiedOriginalCandidate,
  selectHomeVerifiedOriginalCandidates,
  buildHomeVerifiedCommentTarget,
  normalizeHomeVerifiedWriteQueue,
  homeVerifiedGrokQuotaDisposition,
  authorDailyUsageFromHistory,
  homeVerifiedDailyProgress,
  homeVerifiedPipelineStatus,
} = require("../lib/home-verified-comment");

const {
  classifyTerafabxHomeVerifiedOriginalCandidate,
  selectTerafabxHomeVerifiedOriginalCandidates,
  buildTerafabxHomeVerifiedCommentTarget,
  normalizeTerafabxHomeVerifiedWriteQueue,
  getTerafabxHomeVerifiedCommentStatus,
  homeVerifiedCommentLib,
} = require("../mirror_server");

function sampleOriginal(overrides = {}) {
  return {
    id: "2081000000000000001",
    url: "https://x.com/BlueAccount/status/2081000000000000001",
    authorHandle: "BlueAccount",
    authorVerified: true,
    authorVerificationType: "individual",
    text: "오늘 날씨가 참 좋다",
    imageCount: 1,
    videoCount: 0,
    mediaCount: 1,
    ...overrides,
  };
}

test("accepts home original posts from blue-verified authors only", () => {
  const ok = classifyHomeVerifiedOriginalCandidate(sampleOriginal());
  assert.equal(ok.ok, true);
  assert.equal(ok.post.isOriginal, true);
  assert.equal(ok.stage, "candidate");
});

test("rejects replies, retweets, quotes, and unverified authors", () => {
  assert.ok(classifyHomeVerifiedOriginalCandidate(sampleOriginal({
    replyingToStatus: "2081000000000000000",
  })).reasons.includes("is_reply"));

  assert.ok(classifyHomeVerifiedOriginalCandidate(sampleOriginal({
    text: "RT @someone: hello",
    isRetweet: true,
  })).reasons.includes("is_retweet"));

  assert.ok(classifyHomeVerifiedOriginalCandidate(sampleOriginal({
    isQuote: true,
  })).reasons.includes("is_quote"));

  assert.ok(classifyHomeVerifiedOriginalCandidate(sampleOriginal({
    authorVerified: false,
    authorVerificationType: "",
  })).reasons.includes("not_verified"));
});

test("rejects organization/government blue checks; accepts personal individual", () => {
  assert.ok(classifyHomeVerifiedOriginalCandidate(sampleOriginal({
    authorVerificationType: "organization",
  })).reasons.some((r) => String(r).startsWith("not_personal_blue")));

  assert.ok(classifyHomeVerifiedOriginalCandidate(sampleOriginal({
    authorVerificationType: "government",
  })).reasons.some((r) => String(r).startsWith("not_personal_blue")));

  assert.ok(classifyHomeVerifiedOriginalCandidate(sampleOriginal({
    authorVerificationType: "business",
  })).reasons.some((r) => String(r).startsWith("not_personal_blue")));

  const personal = classifyHomeVerifiedOriginalCandidate(sampleOriginal({
    authorVerificationType: "individual",
  }));
  assert.equal(personal.ok, true);
  assert.equal(personal.post.isPersonalBlueVerified, true);
});

test("rejects own account originals", () => {
  const result = classifyHomeVerifiedOriginalCandidate(sampleOriginal({
    authorHandle: "terafabXai",
    url: "https://x.com/terafabXai/status/2081000000000000001",
  }), { requiredHandle: "terafabXai" });
  assert.ok(result.reasons.includes("own_account"));
});

test("rejects profanity, attack/harassment, and controversy originals", () => {
  const ktrnhd = classifyHomeVerifiedOriginalCandidate(sampleOriginal({
    text: "좆등신스토커새끼. 나이쳐먹고 왜 그러고 사냐",
  }));
  assert.equal(ktrnhd.ok, false);
  assert.ok(
    ktrnhd.reasons.includes("profanity_original")
    || ktrnhd.reasons.includes("attack_or_harassment_original")
    || ktrnhd.reasons.includes("sensitive_original_text"),
  );

  const attack = classifyHomeVerifiedOriginalCandidate(sampleOriginal({
    text: "그 인간 공개 저격한다. 인신공격 각이다",
  }));
  assert.equal(attack.ok, false);
  assert.ok(attack.reasons.includes("attack_or_harassment_original"));

  const controversy = classifyHomeVerifiedOriginalCandidate(sampleOriginal({
    text: "이번 논란 사과문 보고  Ment 어이가 없다",
  }));
  assert.equal(controversy.ok, false);
  assert.ok(controversy.reasons.includes("controversy_original"));

  const safe = assessHomeVerifiedOriginalContentSafety("양조장에서 산 막걸리와 소고기로 저녁식사. 복순도가 드셔보셨나요?");
  assert.equal(safe.ok, true);
});

test("P0 rejects foreign-dominant, link-only, medical, tax originals", () => {
  const {
    isHomeVerifiedForeignLanguageDominant,
    isHomeVerifiedLinkOrSpaceOnlyWeakText,
    assessHomeVerifiedOriginalContentSafety,
    classifyHomeVerifiedOriginalCandidate,
    homeVerifiedJudgeHardFail,
    isHomeVerifiedGreetingOnlyReply,
  } = require("../lib/home-verified-comment");

  assert.equal(isHomeVerifiedForeignLanguageDominant(
    "Chào buổi sáng đầu tuần của tháng 8! Mong mọi điều thuận lợi tốt đẹp nhất cho tất cả mọi người!",
  ), true);
  assert.equal(isHomeVerifiedForeignLanguageDominant(
    "다음주 금요일이 절기상 입추 날씨도 선선해질까",
  ), false);

  assert.equal(isHomeVerifiedLinkOrSpaceOnlyWeakText("https://x.com/i/spaces/1NGarrgQRZvJj"), true);
  assert.equal(isHomeVerifiedLinkOrSpaceOnlyWeakText("https://youtu.be/abc"), true);
  assert.equal(isHomeVerifiedLinkOrSpaceOnlyWeakText("휴게소 충전 늘어서 장거리가 편해졌네요 진짜"), false);

  assert.equal(assessHomeVerifiedOriginalContentSafety(
    "위고비 마운자로 부작용 영상 어떤 것이든 부작용이 있지만 확률 문제이다",
  ).reason, "medical_sensitive_original");
  assert.equal(assessHomeVerifiedOriginalContentSafety(
    "전세를 없애겠다는 말이군요. 집주인이 낼 세금을 올리면 임차인이 부담하게 됩니다",
  ).reason, "tax_or_politics_original");

  const foreign = classifyHomeVerifiedOriginalCandidate(sampleOriginal({
    text: "Gözleri kocaman olan potoyu görmezden gelirsen uğursuzluk gelsin bugün de devam.",
  }));
  assert.equal(foreign.ok, false);
  assert.ok(foreign.reasons.includes("foreign_language_dominant"));

  const linkOnly = classifyHomeVerifiedOriginalCandidate(sampleOriginal({
    text: "https://x.com/i/spaces/1NGarrgQRZvJj",
    mediaCount: 0,
  }));
  assert.equal(linkOnly.ok, false);
  assert.ok(linkOnly.reasons.includes("link_or_space_only_weak_text"));

  assert.equal(isHomeVerifiedGreetingOnlyReply("좋은 아침이야 오늘도 잘 부탁해"), true);
  assert.equal(isHomeVerifiedGreetingOnlyReply("휴게소에서 바로 충전되면 편하겠네요"), false);

  const hard = homeVerifiedJudgeHardFail({
    passed: true,
    qualityFlagsComplete: true,
    qualityFlags: { cross_post_reusable: true },
    flaggedQualityIssues: [],
  }, "좋은 아침이야 오늘도 잘 부탁해");
  assert.equal(hard.ok, false);
  assert.ok(hard.reasons.includes("cross_post_reusable") || hard.reasons.includes("greeting_template_reply"));

  const okJudge = homeVerifiedJudgeHardFail({
    passed: true,
    qualityFlagsComplete: true,
    qualityFlags: { cross_post_reusable: false, context_error: false, unsupported_claim: false },
    flaggedQualityIssues: [],
  }, "휴게소에서 바로 충전되면 편하겠네요");
  assert.equal(okJudge.ok, true);
});

test("selects unique candidates up to limit", () => {
  const items = [
    sampleOriginal({ id: "1", url: "https://x.com/a/status/1" }),
    sampleOriginal({ id: "1", url: "https://x.com/a/status/1" }),
    sampleOriginal({ id: "2", url: "https://x.com/b/status/2", authorHandle: "b" }),
    sampleOriginal({
      id: "3",
      url: "https://x.com/c/status/3",
      authorHandle: "c",
      authorVerified: false,
      authorVerificationType: "",
    }),
  ];
  const { selected, rejected } = selectHomeVerifiedOriginalCandidates(items, { limit: 5 });
  assert.equal(selected.length, 2);
  assert.ok(rejected.some((item) => item.reasons.includes("not_verified")));
});

test("build target is original-post only (no own-post-reply root frame)", () => {
  const target = buildHomeVerifiedCommentTarget(sampleOriginal());
  assert.equal(target.rootPostUrl, null);
  assert.equal(target.rootPostText, null);
  assert.equal(target.kind, "home_verified_original");
  assert.equal(target.source, SOURCE);
  assert.equal(target.authorHandle, "BlueAccount");
  assert.ok(target.targetText.includes("날씨"));
});

test("write queue is idempotent by target URL", () => {
  const rows = normalizeHomeVerifiedWriteQueue([
    {
      targetUrl: "https://x.com/a/status/1",
      prepared: { comment: "문맥에 맞는 짧은 댓글입니다" },
      queuedAt: "2026-08-01T00:00:00.000Z",
    },
    {
      targetUrl: "https://x.com/a/status/1",
      prepared: { comment: "두번째 초안은 덮어씀" },
      queuedAt: "2026-08-02T00:00:00.000Z",
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].prepared.comment, "두번째 초안은 덮어씀");
  assert.equal(rows[0].stage, "pending_post");
  assert.equal(rows[0].source, SOURCE);
});

test("Grok quota pauses generate but keeps prepared post drain allowed", () => {
  const until = new Date(Date.now() + 60_000).toISOString();
  const blocked = homeVerifiedGrokQuotaDisposition({ grokQuotaBackoffUntil: until, grokQuotaMessage: "한도" });
  assert.equal(blocked.allowGenerate, false);
  assert.equal(blocked.allowPostPrepared, true);
  const open = homeVerifiedGrokQuotaDisposition({});
  assert.equal(open.allowGenerate, true);
});

test("author daily cap counts history and pending together", () => {
  const today = "2026-08-02";
  const usage = authorDailyUsageFromHistory({
    authorHandle: "BlueAccount",
    dateKey: today,
    limit: 2,
    formatKstDateKey: () => today,
    history: [
      { authorHandle: "BlueAccount", source: SOURCE, at: "2026-08-02T01:00:00.000Z" },
      { authorHandle: "BlueAccount", source: SOURCE, at: "2026-08-02T02:00:00.000Z" },
    ],
    pending: [
      { authorHandle: "BlueAccount", status: "queued" },
    ],
  });
  assert.equal(usage.total, 3);
  assert.equal(usage.allowed, false);
  assert.equal(usage.reason, "author_daily_cap_reached");
});

test("pipeline status reflects off / prefill / grok block", () => {
  assert.equal(homeVerifiedPipelineStatus({ enabled: false }).status, "off");
  assert.equal(homeVerifiedPipelineStatus({
    enabled: true,
    prefillOnly: true,
    pendingCount: 2,
  }).label.includes("보관"), true);
  assert.equal(homeVerifiedPipelineStatus({
    enabled: true,
    grokQuota: { allowGenerate: false, message: "quota" },
  }).status, "blocked");
});

test("home verified daily progress targets 500 with following synthesis mode", () => {
  const today = "2026-08-02";
  const progress = homeVerifiedDailyProgress({
    dailyTarget: 500,
    formatKstDateKey: () => today,
    history: [
      { at: "2026-08-02T01:00:00.000Z", source: SOURCE },
      { at: "2026-08-02T02:00:00.000Z", source: SOURCE },
    ],
    pending: [
      { status: "queued", stage: "pending_post" },
      { status: "queued", stage: "pending_post" },
      { status: "queued", stage: "verification_required" },
    ],
  });
  assert.equal(progress.dailyTarget, 500);
  assert.equal(progress.postedToday, 2);
  assert.equal(progress.pendingReserved, 2);
  assert.equal(progress.remaining, 498);
  assert.equal(progress.remainingAfterPending, 496);
  assert.equal(progress.atCap, false);
  assert.equal(progress.sourceMode, "fxtwitter_following_synthesis");

  const capped = homeVerifiedDailyProgress({
    dailyTarget: 500,
    formatKstDateKey: () => today,
    history: Array.from({ length: 500 }, () => ({ at: "2026-08-02T03:00:00.000Z" })),
    pending: [],
  });
  assert.equal(capped.atCap, true);
  assert.equal(capped.remaining, 0);
  assert.equal(homeVerifiedPipelineStatus({
    enabled: true,
    postedToday: 500,
    dailyTarget: 500,
  }).dailyTargetReached, true);
});

test("mirror_server re-exports home-verified classifiers", () => {
  const result = classifyTerafabxHomeVerifiedOriginalCandidate(sampleOriginal());
  assert.equal(result.ok, true);
  const selected = selectTerafabxHomeVerifiedOriginalCandidates([sampleOriginal({ id: "9", url: "https://x.com/z/status/9", authorHandle: "z" })]);
  assert.equal(selected.selected.length, 1);
  const target = buildTerafabxHomeVerifiedCommentTarget(sampleOriginal());
  assert.equal(target.source, SOURCE);
  const queue = normalizeTerafabxHomeVerifiedWriteQueue([{
    targetUrl: sampleOriginal().url,
    prepared: { comment: "테스트 댓글 문장입니다" },
  }]);
  assert.equal(queue.length, 1);
  assert.equal(homeVerifiedCommentLib.SOURCE, SOURCE);
  const status = getTerafabxHomeVerifiedCommentStatus({
    homeVerifiedCommentEnabled: false,
    homeVerifiedCommentPrefillOnly: true,
    homeVerifiedCommentBacklog: [],
    homeVerifiedCommentHistory: [],
  });
  assert.equal(status.enabled, false);
  assert.equal(status.policy.blueVerifiedOnly, true);
  assert.equal(status.policy.homeTimelineOriginalOnly, true);
  assert.equal(status.policy.geminiTextOnlyContextAndDraft, true);
  assert.equal(status.policy.lengthTonePolish, false);
  assert.equal(status.policy.preferStage1Draft, true);
  assert.equal(status.policy.draftQualityViaLlmAndPromptOnly, true);
  assert.equal(status.policy.noDeterministicDraftPolish, true);
  assert.equal(status.policy.geminiReviewAndJudge, true);
});

test("normalize strips non-original timeline noise", () => {
  const reply = normalizeHomeTimelinePost({
    url: "https://x.com/a/status/10",
    authorHandle: "a",
    authorVerified: true,
    text: "답글",
    replying_to_status: "9",
  });
  assert.equal(reply.isOriginal, false);
  assert.equal(reply.isReply, true);
});

test("home verified prompts never use own-post-reply parent/reply framing", () => {
  const {
    homeVerifiedPromptContextLines,
    homeVerifiedGrokContextPrompt,
    homeVerifiedGeminiReviewPrompt,
    homeVerifiedFinalJudgePrompt,
  } = require("../lib/home-verified-comment-prompts");
  const target = buildHomeVerifiedCommentTarget(sampleOriginal());
  const context = homeVerifiedPromptContextLines(target).join("\n");
  const grok = homeVerifiedGrokContextPrompt(target);
  const review = homeVerifiedGeminiReviewPrompt(target, {
    reply: "오늘 하늘 소식이 반갑네요",
    contextSummary: "천문 이벤트 안내",
    keyPoints: ["일식", "유성우"],
  });
  const judge = homeVerifiedFinalJudgePrompt(target, {
    contextSummary: "천문 이벤트 안내",
  }, "오늘 하늘 소식이 반갑네요");
  for (const text of [context, grok, review, judge]) {
    assert.equal(/대댓글 문맥 규칙/.test(text), false);
    assert.equal(/부모 원글/.test(text), false);
    assert.equal(/답글 대상 댓글/.test(text), false);
    assert.match(text, /원글/);
    assert.match(text, /대댓글이 아니다|대댓글 검수가 아니다|대댓글\(부모글/);
  }
  assert.match(judge, /"context":0/);
  assert.match(judge, /"naturalness":0/);
  assert.match(judge, /source_anchor/);
});

test("soft-pass recovers 100-score source_anchor false negatives", () => {
  const { reconcileHomeVerifiedFinalJudge } = require("../lib/home-verified-comment");
  const judge = {
    passed: false,
    score: 100,
    dimensions: { context: 40, naturalness: 25, specificity: 15, concision: 10, non_ai_style: 10 },
    flaggedQualityIssues: ["source_anchor_unverifiable"],
    sourceAnchor: "부스팅용 봇들",
    reason: "원글의 알고리즘 부스팅 봇 추측에 자연스럽고 정확하게 호응함.",
  };
  const target = {
    targetText: "x에 활동하는 봇 중에도 알고리즘 부스팅을 위해 의도적으로 리트윗하고 좋아요 찍는 목적의 봇이 많다",
    groundingContext: {
      contextSummary: "알고리즘 부스팅 봇 추측 글",
      keyPoints: ["부스팅", "봇"],
    },
  };
  const recovered = reconcileHomeVerifiedFinalJudge(judge, target, "그런 봇 은근 많을 듯");
  assert.equal(recovered.passed, true);
  assert.equal(recovered.softGrounding, true);
  assert.deepEqual(recovered.flaggedQualityIssues, []);
});

test("home verified draft quality gate is LLM/judge only (no deterministic style polish)", () => {
  const { assessHomeVerifiedWriteQuality } = require("../lib/home-verified-comment");
  const base = {
    prepared: {
      comment: "휴게소 충전 편해졌네",
      geminiReview: {
        finalJudge: {
          passed: true,
          qualityFlagsComplete: true,
          flaggedQualityIssues: [],
          qualityFlags: {
            cross_post_reusable: false,
            context_error: false,
            unsupported_claim: false,
            headline_tone: false,
          },
        },
      },
    },
    target: { targetText: "아무 원글" },
  };
  const ok = assessHomeVerifiedWriteQuality(base, {
    cleanSocialText: (v) => String(v || "").trim(),
    bannedRe: /$a/,
    assessLanguage: () => ({ errors: ["would_fail"], styleWarnings: ["would_fail"] }),
    scoreCliche: () => ({ penalty: 9, matches: [{ label: "cliche" }] }),
    assessTechnical: () => ({ ok: false, unsupportedGroups: ["x"] }),
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.draftQualityVia, "llm_and_prompt_only");
  assert.equal(ok.pipeline, SOURCE);

  const greetingFail = assessHomeVerifiedWriteQuality({
    prepared: {
      comment: "좋은 아침이야 오늘도 잘 부탁해",
      geminiReview: {
        finalJudge: {
          passed: true,
          qualityFlagsComplete: true,
          flaggedQualityIssues: [],
          qualityFlags: { cross_post_reusable: false },
        },
      },
    },
  }, { cleanSocialText: (v) => String(v || "").trim() });
  assert.equal(greetingFail.ok, false);
  assert.ok(greetingFail.errors.some((e) => String(e).includes("greeting_template_reply")));

  const noJudge = assessHomeVerifiedWriteQuality({
    prepared: { comment: "괜찮은 맞장구 문장", geminiReview: { finalJudge: { passed: false } } },
  }, { cleanSocialText: (v) => String(v || "").trim() });
  assert.equal(noJudge.ok, false);
  assert.ok(noJudge.errors.includes("independent_judge_not_passed"));
});

test("tally-style reject reasons covered by content safety reason codes", () => {
  // supply feedback: reason codes must be stable strings for histogram
  const codes = [
    assessHomeVerifiedOriginalContentSafety("위고비 부작용").reason,
    assessHomeVerifiedOriginalContentSafety("전세 세금 임차인").reason,
    assessHomeVerifiedOriginalContentSafety("https://x.com/i/spaces/1NGarrgQRZvJj").reason,
    assessHomeVerifiedOriginalContentSafety("Chào buổi sáng đầu tuần của tháng 8! Mong mọi điều thuận lợi tốt đẹp nhất!").reason,
  ];
  assert.deepEqual(codes, [
    "medical_sensitive_original",
    "tax_or_politics_original",
    "link_or_space_only_weak_text",
    "foreign_language_dominant",
  ]);
});

test("tallyHomeVerifiedRejectReasons builds histogram from multi-reason rows", () => {
  const { tallyHomeVerifiedRejectReasons } = require("../lib/home-verified-comment");
  const counts = tallyHomeVerifiedRejectReasons([
    { reasons: ["not_personal_blue"] },
    { reasons: ["not_personal_blue", "is_reply"] },
    { reasons: ["author_already_in_batch"] },
    { error: "timeout" },
    {},
  ]);
  assert.equal(counts.not_personal_blue, 2);
  assert.equal(counts.is_reply, 1);
  assert.equal(counts.author_already_in_batch, 1);
  assert.equal(counts.metadata_error, 1);
  assert.equal(counts.unknown, 1);
});

test("diversifyHomeVerifiedDiscoverCandidates prefers unique authors first", () => {
  const { diversifyHomeVerifiedDiscoverCandidates } = require("../lib/home-verified-comment");
  const raw = [
    { url: "https://x.com/alpha/status/1", authorHandle: "alpha" },
    { url: "https://x.com/alpha/status/2", authorHandle: "alpha" },
    { url: "https://x.com/beta/status/3", authorHandle: "beta" },
    { url: "https://x.com/alpha/status/4", authorHandle: "alpha" },
    { url: "https://x.com/gamma/status/5", authorHandle: "gamma" },
  ];
  const out = diversifyHomeVerifiedDiscoverCandidates(raw, 4);
  assert.equal(out.length, 4);
  assert.equal(out[0].authorHandle, "alpha");
  assert.equal(out[1].authorHandle, "beta");
  assert.equal(out[2].authorHandle, "gamma");
  // remaining slot is second alpha, after unique set
  assert.equal(out[3].authorHandle, "alpha");
  assert.equal(out[3].url, "https://x.com/alpha/status/2");
});

test("hard-fail blocks leading 진짜 opener (quality feedback)", () => {
  const { homeVerifiedJudgeHardFail } = require("../lib/home-verified-comment");
  const lead = homeVerifiedJudgeHardFail({
    passed: true,
    qualityFlagsComplete: true,
    qualityFlags: {},
    flaggedQualityIssues: [],
  }, "진짜 이번에도 대단하네");
  assert.equal(lead.ok, false);
  assert.ok(lead.reasons.includes("habitual_jinzza"));

  const mid = homeVerifiedJudgeHardFail({
    passed: true,
    qualityFlagsComplete: true,
    qualityFlags: {},
    flaggedQualityIssues: [],
  }, "현장 할인 폭 진짜 쏠쏠하네");
  assert.equal(mid.ok, true);
});

test("stage1 and judge prompts include P0/P1 quality bans", () => {
  const {
    homeVerifiedGrokContextPrompt,
    homeVerifiedFinalJudgePrompt,
    homeVerifiedQualityRules,
  } = require("../lib/home-verified-comment-prompts");
  const target = {
    url: "https://x.com/a/status/1",
    targetText: "다음주 금요일이 입추",
    authorHandle: "a",
  };
  const stage1 = homeVerifiedGrokContextPrompt(target, "", "rid-1");
  const judge = homeVerifiedFinalJudgePrompt(target, { contextSummary: "입추 알림" }, "좋은 아침이야");
  const rules = homeVerifiedQualityRules().join("\n");
  const combined = [stage1, judge, rules].join("\n");
  assert.match(combined, /좋은 아침|잘 자|굿나잇|푹 쉬|한 주의 시작/);
  assert.match(stage1, /진짜/);
  assert.match(rules, /진짜/);
  assert.match(combined, /cross-post|cross_post|다른 글에도/i);
  assert.match(judge, /cross_post_reusable/);
  assert.match(judge, /의료|세금|정치/);
  assert.match(stage1, /색·브랜드 변형|장면을 지어내지/);
});

test("permanent post errors discard; rate limit retries", () => {
  const {
    isHomeVerifiedPermanentPostError,
    homeVerifiedPostFailureDisposition,
  } = require("../lib/home-verified-comment");
  assert.equal(isHomeVerifiedPermanentPostError('target root 검증 실패: {"ok":false,"text":""}'), true);
  assert.equal(isHomeVerifiedPermanentPostError("답글 제한 글입니다: {\"replyRestricted\":true}"), true);
  assert.equal(isHomeVerifiedPermanentPostError("X 계정 검증 사용량 제한 HTTP 429"), false);
  const dead = homeVerifiedPostFailureDisposition('target root 검증 실패: {"text":""}', { attempts: 1, maxAttempts: 5 });
  assert.equal(dead.discard, true);
  assert.equal(dead.reason, "dead_or_restricted_target");
  const rate = homeVerifiedPostFailureDisposition("HTTP 429 code 1003", { attempts: 9, maxAttempts: 5 });
  assert.equal(rate.discard, false);
  assert.equal(rate.reason, "rate_limit");
  const maxed = homeVerifiedPostFailureDisposition("답글 입력창을 찾지 못했습니다.", { attempts: 5, maxAttempts: 5 });
  assert.equal(maxed.discard, true);
  assert.equal(maxed.reason, "max_attempts_exceeded");
});
