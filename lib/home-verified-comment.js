/**
 * 홈 타임라인 · 파란체크 · 원글 자동댓글 도메인 로직.
 * own-post-reply 파이프라인 클론용 — 후보 필터·큐·상태·한도 판정.
 * browser/Grok/Gemini/X writer 호출은 mirror_server 쪽에서 연결한다.
 */

const SOURCE = "home_verified_comment";
const STAGES = Object.freeze([
  "candidate",
  "context_ready",
  "review_ready",
  "pending_post",
  "posted",
  "held",
  "quarantined",
  "verification_required",
]);

function normalizeStatusUrl(value, normalizeXStatusUrl) {
  if (typeof normalizeXStatusUrl === "function") return normalizeXStatusUrl(value) || "";
  const raw = String(value || "").trim();
  const match = raw.match(/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/i);
  if (!match) return "";
  return `https://x.com/${match[1]}/status/${match[2]}`;
}

function parseStatusId(url, parseXStatusUrl) {
  if (typeof parseXStatusUrl === "function") {
    const parsed = parseXStatusUrl(url);
    return parsed?.id || "";
  }
  const match = String(url || "").match(/\/status\/(\d+)/i);
  return match ? match[1] : "";
}

function authorHandleFromUrl(url) {
  const match = String(url || "").match(/x\.com\/([^/]+)\/status\//i);
  return match ? String(match[1]).replace(/^@/, "") : "";
}

/**
 * 홈 타임라인 raw 항목 또는 FxTwitter/DOM 메타를 정규화한다.
 */
function normalizeHomeTimelinePost(raw = {}, helpers = {}) {
  const normalizeXStatusUrl = helpers.normalizeXStatusUrl;
  const url = normalizeStatusUrl(raw.url || raw.statusUrl || raw.href || "", normalizeXStatusUrl);
  const id = String(raw.id || raw.statusId || parseStatusId(url, helpers.parseXStatusUrl) || "");
  const authorHandle = String(raw.authorHandle || raw.handle || raw.screen_name || authorHandleFromUrl(url) || "")
    .replace(/^@/, "");
  const text = String(raw.text || raw.full_text || raw.targetText || "").trim();
  const authorVerificationType = String(
    raw.authorVerificationType
    || raw.verificationType
    || raw.verification?.type
    || raw.author?.verification?.type
    || "",
  ).toLowerCase().trim();
  const authorVerified = raw.authorVerified === true
    || raw.verified === true
    || raw.isBlueVerified === true
    || Boolean(raw.author?.verification?.verified);
  // X 파란체크 중 개인만 허용. organization/government/business 등은 제외.
  // type만 있고 verified=false면 통과시키지 않는다.
  const isPersonalBlueVerified = authorVerified === true && (
    authorVerificationType === "individual"
    || authorVerificationType === "blue"
  );
  const isReply = Boolean(
    raw.isReply === true
    || raw.replyingToStatus
    || raw.replying_to_status
    || raw.inReplyToStatusId
    || raw.in_reply_to_status_id
    || (raw.replyingTo && !raw.isOriginal),
  );
  const isRetweet = Boolean(
    raw.isRetweet === true
    || raw.retweeted_status
    || raw.retweetedStatus
    || /^RT\s+@/i.test(text),
  );
  const isQuote = Boolean(raw.isQuote === true || raw.quote || raw.quoted_status || raw.quotedStatus);
  // 인용은 "원글"로 보지 않는다 (제품 결정).
  const isOriginal = !isReply && !isRetweet && !isQuote;

  return {
    id,
    url,
    authorHandle,
    authorVerified,
    authorVerificationType,
    isPersonalBlueVerified,
    text,
    imageCount: Math.max(0, Number(raw.imageCount || raw.media?.photos?.length || 0)),
    videoCount: Math.max(0, Number(raw.videoCount || raw.media?.videos?.length || 0)),
    mediaCount: Math.max(0, Number(raw.mediaCount || 0)
      || (Number(raw.imageCount || 0) + Number(raw.videoCount || 0))),
    isReply,
    isRetweet,
    isQuote,
    isOriginal,
    createdAt: raw.createdAt || raw.created_at || null,
    createdTimestamp: Number(raw.createdTimestamp || raw.created_timestamp || 0) || 0,
    source: raw.source || "home",
  };
}

/**
 * 원글 본문 안전성 + P0 후보 필터.
 * 욕설·비난·논란·외국어 우세·링크/스페이스 약본문·의료/세금/정치/투자조언 강화.
 */
const HOME_VERIFIED_PROFANITY_RE = /(좆|좇|좃|씨발|시발|씨팔|씹|병신|ㅄ|ㅂㅅ|개새끼|개새기|새끼야|지랄|꺼져|닥쳐|ㅅㅂ|ㅆㅂ|ㅈㄴ|ㅈㄹ|tlqkf|sibal|fuck|shit|bitch|asshole)/i;
const HOME_VERIFIED_ATTACK_RE = /(스토커|공개\s*저격|저격하|인신공격|인신\s*공격|인간\s*말종|쓰레기\s*새끼|등신|또라이|정신병자|죽이고\s*싶|패죽|한남|한녀|느금마|니애미|느금|외모\s*비하|몸매\s*비하|신체\s*비하|체중.{0,12}지적|조롱하|괴롭히|협박|위협하|harass(?:ment|ing)?|body\s*sham(?:e|ing))/i;
const HOME_VERIFIED_CONTROVERSY_RE = /(논란|여론\s*재판|사과문|고소\s*할|고발\s*할|소송|폭로|사태|게이트|취소\s*운동|불매|보이콧|집단\s*린치|마녀사냥|마녀\s*사냥|사이버\s*불링|악플\s*세례)/i;
const HOME_VERIFIED_MEDICAL_RE = /(위고비|마운자로|오젬픽|부작용|처방\s*약|다이어트\s*약|식욕\s*억제제|수술|양악|성형|성폭|강간|임신\s*중|항암|당뇨\s*약)/i;
const HOME_VERIFIED_TAX_POLITICS_RE = /(전세\s*없애|종부세|임대료|세금\s*올리|임차인|집주인\s*세금|대통령|국회|탄핵|선거\s*공약|정당\s*지지)/i;
const HOME_VERIFIED_INVEST_ADVICE_RE = /(매수\s*추천|무조건\s*사|물타기|존버|가즈아|에어드랍|스테이킹|레버리지\s*롱|레버리지\s*숏|수익률\s*보장)/i;
const HOME_VERIFIED_CRYPTO_HANDLE_RE = /(crypto|nft|defi|xrp|btc|eth|coin|airdrop|web3|0x|binance|bitcoin)/i;
const HOME_VERIFIED_GREETING_REPLY_RE = /^(?:좋은\s*아침|좋은\s*하루|한\s*주의\s*시작|벌써\s*하루가\s*시작|주말\s*(?:엔|에|도)?\s*(?:역시\s*)?(?:푹\s*)?쉬|주말\s*고생|푹\s*쉬|잘\s*자|굿\s*나잇|편안한\s*밤|좋은\s*밤|월요일이\s*또|오늘도\s*잘\s*부탁|다들\s*평온)/i;

function countScriptLetters(text = "") {
  const s = String(text || "");
  const hangul = (s.match(/[\uAC00-\uD7A3]/g) || []).length;
  const latin = (s.match(/[A-Za-zÀ-ỹ]/g) || []).length;
  const cjkOther = (s.match(/[\u3040-\u30FF\u4E00-\u9FFF\u0400-\u04FF\u0600-\u06FF]/g) || []).length;
  return { hangul, latin, cjkOther, total: hangul + latin + cjkOther };
}

/** 한국어 비율이 낮은 외국어 우세 본문 (혼합 짧은 글은 허용) */
function isHomeVerifiedForeignLanguageDominant(text = "") {
  const clean = String(text || "").replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim();
  if (!clean) return false;
  const { hangul, latin, cjkOther, total } = countScriptLetters(clean);
  if (total < 12) return false;
  const hangulRatio = hangul / total;
  // 한글이 거의 없고 라틴/기타 문자가 대세
  if (hangulRatio < 0.22 && (latin + cjkOther) / total >= 0.55) return true;
  // 일본어/중국어 등 한글 거의 없음
  if (hangul < 4 && cjkOther >= 12) return true;
  return false;
}

/** URL·스페이스 위주 약본문 */
function isHomeVerifiedLinkOrSpaceOnlyWeakText(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return true;
  const withoutUrls = raw
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/(?:^|\s)t\.co\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const letters = (withoutUrls.match(/[\uAC00-\uD7A3A-Za-zÀ-ỹ]/g) || []).length;
  if (/x\.com\/i\/spaces\//i.test(raw) && letters < 16) return true;
  if (/https?:\/\//i.test(raw) && letters < 10) return true;
  if (letters < 6 && Number(raw.length) > 0 && !/[\uAC00-\uD7A3]{2,}/.test(raw)) return true;
  return false;
}

function isHomeVerifiedCryptoSpamHandle(handle = "") {
  return HOME_VERIFIED_CRYPTO_HANDLE_RE.test(String(handle || "").replace(/^@/, ""));
}

/** 인사·굿나잇 등 cross-post 템플릿 댓글 (게시 게이트용) */
function isHomeVerifiedGreetingOnlyReply(reply = "") {
  const clean = String(reply || "").replace(/\s+/g, " ").trim();
  if (!clean) return false;
  if (HOME_VERIFIED_GREETING_REPLY_RE.test(clean)) return true;
  if (/^(?:주말|월요일|오늘\s*하루|다들).{0,12}(?:쉬|자요|자|보내)/i.test(clean) && clean.length <= 28) {
    return true;
  }
  return false;
}

/**
 * judge 결과 + 템플릿 위험으로 게시 가능 여부.
 * draft 문장 수정(trim)은 하지 않고 pass/fail만.
 */
function homeVerifiedJudgeHardFail(finalJudge = {}, finalReply = "") {
  const flags = finalJudge?.qualityFlags || finalJudge?.quality_flags || {};
  const flagged = Array.isArray(finalJudge?.flaggedQualityIssues)
    ? finalJudge.flaggedQualityIssues
    : Array.isArray(finalJudge?.flagged_quality_issues)
      ? finalJudge.flagged_quality_issues
      : [];
  const reasons = [];
  if (finalJudge?.passed !== true) reasons.push("judge_not_passed");
  if (flags.cross_post_reusable === true || flagged.includes("cross_post_reusable")) {
    reasons.push("cross_post_reusable");
  }
  if (flags.context_error === true || flagged.includes("context_error")) {
    reasons.push("context_error");
  }
  if (flags.unsupported_claim === true || flagged.includes("unsupported_claim")) {
    reasons.push("unsupported_claim");
  }
  if (flags.headline_tone === true || flagged.includes("headline_tone")) {
    reasons.push("headline_tone");
  }
  if (isHomeVerifiedGreetingOnlyReply(finalReply)) {
    reasons.push("greeting_template_reply");
  }
  // 문장 시작 '진짜' 습관: 오프너 자체 금지 (이중 사용도 동일 코드)
  const replyText = String(finalReply || "").trim();
  if (/^진짜(?:\s|$|[,.!?…·])/.test(replyText)) {
    reasons.push("habitual_jinzza");
  }
  return {
    ok: reasons.length === 0,
    reasons,
  };
}

/**
 * 게시 실패가 재시도해도 의미 없는 영구 실패인지.
 * 삭제/비공개/답글제한/target root 검증 실패 등은 큐에 남기면 재시도 루프가 된다.
 */
function isHomeVerifiedPermanentPostError(error) {
  const message = String(error?.message || error || "");
  if (!message) return false;
  return (
    /답글 제한 글입니다/i.test(message)
    || /replyRestricted["']?\s*:\s*true/i.test(message)
    || /replyDisabled["']?\s*:\s*true/i.test(message)
    || /target root 검증 실패/i.test(message)
    || /reply-target-not-found/i.test(message)
    || /tweet_not_found|status_not_found|article_not_found/i.test(message)
    || /HTTP\s*Error\s*404|HTTP\/1\.1 404|status code 404/i.test(message)
    || /존재하지 않|삭제된 (게시|트윗|글)|This Post is from a suspended/i.test(message)
  );
}

/**
 * soft 실패(입력창 일시 미검출 등)는 최대 시도 후 폐기.
 * rate-limit/backoff 는 영구 폐기가 아님.
 */
function homeVerifiedPostFailureDisposition(error, options = {}) {
  const message = String(error?.message || error || "");
  const attempts = Math.max(0, Number(options.attempts || 0));
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 5));
  if (/사용량 제한|HTTP 429|rate.?limit|too many requests/i.test(message)) {
    return { permanent: false, reason: "rate_limit", discard: false };
  }
  if (isHomeVerifiedPermanentPostError(message)) {
    return { permanent: true, reason: "dead_or_restricted_target", discard: true };
  }
  if (attempts >= maxAttempts) {
    return { permanent: true, reason: "max_attempts_exceeded", discard: true };
  }
  return { permanent: false, reason: "retryable", discard: false };
}

/** discover 거부 사유 히스토그램 (공급 피드백) */
function tallyHomeVerifiedRejectReasons(rejected = []) {
  const counts = {};
  for (const row of Array.isArray(rejected) ? rejected : []) {
    const reasons = Array.isArray(row?.reasons) && row.reasons.length
      ? row.reasons
      : [row?.error ? "metadata_error" : "unknown"];
    for (const reason of reasons) {
      const key = String(reason || "unknown");
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}

/**
 * following 피드가 소수 작성자로 도배될 때 enrich 예산을 아끼기 위해
 * 작성자 1인 1건을 먼저 배치하고, 남는 슬롯에 나머지 후보를 붙인다.
 */
function diversifyHomeVerifiedDiscoverCandidates(raw = [], maxCheck = 80) {
  const limit = Math.max(1, Number(maxCheck) || 80);
  const firstPass = [];
  const rest = [];
  const seenHandles = new Set();
  const seenUrls = new Set();
  for (const item of Array.isArray(raw) ? raw : []) {
    const url = String(item?.url || item?.targetUrl || "").trim();
    if (url && seenUrls.has(url)) continue;
    if (url) seenUrls.add(url);
    const handle = String(
      item?.authorHandle || item?.handle || authorHandleFromUrl(url) || "",
    ).replace(/^@/, "").toLowerCase();
    if (handle && !seenHandles.has(handle)) {
      seenHandles.add(handle);
      firstPass.push(item);
    } else {
      rest.push(item);
    }
  }
  return [...firstPass, ...rest].slice(0, limit);
}

function assessHomeVerifiedOriginalContentSafety(text = "", options = {}) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const handle = String(options.authorHandle || options.handle || "").replace(/^@/, "");
  if (!clean) {
    // 빈 본문은 link/media-only 쪽에서 별도 처리 가능
    if (options.allowEmpty) return { ok: true, reason: null };
    return { ok: true, reason: null };
  }
  if (isHomeVerifiedForeignLanguageDominant(clean)) {
    return { ok: false, reason: "foreign_language_dominant" };
  }
  if (isHomeVerifiedLinkOrSpaceOnlyWeakText(clean)) {
    return { ok: false, reason: "link_or_space_only_weak_text" };
  }
  if (HOME_VERIFIED_MEDICAL_RE.test(clean)) {
    return { ok: false, reason: "medical_sensitive_original" };
  }
  if (HOME_VERIFIED_TAX_POLITICS_RE.test(clean)) {
    return { ok: false, reason: "tax_or_politics_original" };
  }
  if (HOME_VERIFIED_INVEST_ADVICE_RE.test(clean)) {
    return { ok: false, reason: "investment_advice_original" };
  }
  if (options.bannedRe instanceof RegExp && options.bannedRe.test(clean)) {
    return { ok: false, reason: "sensitive_original_text" };
  }
  if (HOME_VERIFIED_PROFANITY_RE.test(clean)) {
    return { ok: false, reason: "profanity_original" };
  }
  if (HOME_VERIFIED_ATTACK_RE.test(clean)) {
    return { ok: false, reason: "attack_or_harassment_original" };
  }
  if (HOME_VERIFIED_CONTROVERSY_RE.test(clean)) {
    return { ok: false, reason: "controversy_original" };
  }
  if (handle && isHomeVerifiedCryptoSpamHandle(handle) && /(crypto|btc|eth|nft|airdrop|스테이킹|코인|비트)/i.test(clean)) {
    return { ok: false, reason: "crypto_spam_account_original" };
  }
  return { ok: true, reason: null };
}

/**
 * 제품 게이트: 원글 + 개인 파란체크만 + URL/본문 존재 + 자기 계정 제외.
 * organization / government / business 인증은 제외한다.
 * 욕설·비난·논란·민감 원글도 제외한다.
 */
function classifyHomeVerifiedOriginalCandidate(raw = {}, options = {}) {
  const post = normalizeHomeTimelinePost(raw, options.helpers || {});
  const requiredHandle = String(options.requiredHandle || "terafabXai").replace(/^@/, "").toLowerCase();
  const reasons = [];

  if (!post.url || !post.id) reasons.push("invalid_url");
  if (!post.authorHandle) reasons.push("missing_author");
  if (post.authorHandle.toLowerCase() === requiredHandle) reasons.push("own_account");
  if (!post.authorVerified) reasons.push("not_verified");
  if (!post.isPersonalBlueVerified) {
    const t = post.authorVerificationType || "unknown";
    if (["organization", "business", "government", "gov"].includes(t)) {
      reasons.push(`not_personal_blue:${t}`);
    } else {
      reasons.push("not_personal_blue");
    }
  }
  if (post.isReply) reasons.push("is_reply");
  if (post.isRetweet) reasons.push("is_retweet");
  if (post.isQuote) reasons.push("is_quote");
  if (!post.isOriginal) reasons.push("not_original");
  if (!post.text && Number(post.mediaCount || 0) <= 0) reasons.push("empty_content");
  // 미디어만 있고 본문 극단적으로 약하면 약본문으로 제외
  if (post.text && isHomeVerifiedLinkOrSpaceOnlyWeakText(post.text) && Number(post.mediaCount || 0) <= 0) {
    reasons.push("link_or_space_only_weak_text");
  } else if (!post.text && Number(post.mediaCount || 0) > 0) {
    // 텍스트 없는 미디어-only: 추측 맞장구 위험 → 홀드
    reasons.push("media_only_weak_text");
  }

  const contentSafety = assessHomeVerifiedOriginalContentSafety(post.text, {
    bannedRe: options.bannedRe,
    authorHandle: post.authorHandle,
  });
  if (!contentSafety.ok) reasons.push(contentSafety.reason);

  // P2: 핸들이 크립토성 + 본문도 크립토면 contentSafety에서 이미 탈락.
  // 핸들만으로 전부 제외하지 않음 (오탐·후보 고갈 방지).

  const seenIds = options.seenIds instanceof Set ? options.seenIds : new Set(options.seenIds || []);
  if (post.id && seenIds.has(post.id)) reasons.push("already_seen");

  const blockedAuthors = options.blockedAuthors instanceof Set
    ? options.blockedAuthors
    : new Set((options.blockedAuthors || []).map((h) => String(h).toLowerCase()));
  if (post.authorHandle && blockedAuthors.has(post.authorHandle.toLowerCase())) {
    reasons.push("author_blocked");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    post,
    stage: reasons.length === 0 ? "candidate" : "held",
  };
}

function selectHomeVerifiedOriginalCandidates(items = [], options = {}) {
  const selected = [];
  const rejected = [];
  const seenIds = new Set(options.seenIds || []);
  const limit = Math.max(0, Number(options.limit || 50));

  for (const item of Array.isArray(items) ? items : []) {
    if (selected.length >= limit) break;
    const result = classifyHomeVerifiedOriginalCandidate(item, { ...options, seenIds });
    if (!result.ok) {
      rejected.push(result);
      continue;
    }
    seenIds.add(result.post.id);
    selected.push(result.post);
  }
  return { selected, rejected, seenIds: Array.from(seenIds) };
}

/**
 * Grok/Gemini prepare용 타깃 — 원글 자체에 댓글 (대댓글 아님).
 * rootPost* 필드를 넣지 않아 own-post-reply 대댓글 문맥 분기와 섞이지 않게 한다.
 */
function buildHomeVerifiedCommentTarget(post = {}, helpers = {}) {
  const normalizeXStatusUrl = helpers.normalizeXStatusUrl;
  const cleanSocialText = helpers.cleanSocialText || ((v) => String(v || "").trim());
  const url = normalizeStatusUrl(post.url || "", normalizeXStatusUrl);
  const text = cleanSocialText(post.text || "");
  if (!url) throw new Error("홈 인증 원글 URL이 없습니다.");
  if (!text && Number(post.mediaCount || 0) <= 0) {
    throw new Error("원글 본문/미디어가 없어 댓글을 만들지 않습니다.");
  }
  const targetText = text || (Number(post.mediaCount || 0) > 0 ? "(미디어 중심 원글)" : "");
  return {
    url,
    targetId: String(post.id || parseStatusId(url, helpers.parseXStatusUrl) || ""),
    targetText,
    text: targetText,
    // 대댓글 파이프라인 필드 의도적 미설정
    rootPostUrl: null,
    rootPostText: null,
    authorHandle: String(post.authorHandle || authorHandleFromUrl(url) || "").replace(/^@/, ""),
    authorVerified: post.authorVerified === true,
    imageCount: Math.max(0, Number(post.imageCount || 0)),
    videoCount: Math.max(0, Number(post.videoCount || 0)),
    mediaCount: Math.max(0, Number(post.mediaCount || post.imageCount || 0) + Number(post.videoCount || 0)),
    imageOnly: false,
    gifOnly: false,
    fixedReply: null,
    source: SOURCE,
    kind: "home_verified_original",
  };
}

/**
 * 홈 원글 전용 게시 전 게이트.
 *
 * 초안 품질(문체·길이·상투·구체성)은 LLM 생성 프롬프트 + LLM judge에만 맡긴다.
 * 여기서는 구조/안전만 본다: 비어 있지 않음, (옵션) 민감 금칙, LLM judge 통과.
 * soft-trim / 톤 후처리 / 결정적 클리셰·언어 점수는 쓰지 않는다.
 */
function assessHomeVerifiedWriteQuality(record = {}, helpers = {}) {
  const cleanSocialText = helpers.cleanSocialText || ((v) => String(v || "").trim());
  const prepared = record.prepared || {};
  const commentText = cleanSocialText(prepared.comment || "");
  const errors = [];
  const length = Array.from(commentText).length;
  if (!commentText) errors.push("comment_empty");
  // 민감 금칙만 안전 차단 (품질 취향 게이트 아님)
  if (commentText && helpers.bannedRe && helpers.bannedRe.test(commentText)) {
    errors.push("sensitive_comment_text");
  }
  const finalJudge = prepared.geminiReview?.finalJudge || {};
  if (finalJudge.passed !== true) errors.push("independent_judge_not_passed");
  const flagsComplete = finalJudge.qualityFlagsComplete === true || finalJudge.quality_flags_complete === true;
  if (!flagsComplete) errors.push("structured_quality_flags_missing");
  for (const issue of finalJudge.flaggedQualityIssues || finalJudge.flagged_quality_issues || []) {
    errors.push(`gemini_quality:${issue}`);
  }
  // judge 플래그 + 인사 템플릿 하드페일 (문장 trim 없이 탈락만)
  const hard = homeVerifiedJudgeHardFail(finalJudge, commentText);
  if (!hard.ok) {
    for (const reason of hard.reasons) {
      if (reason !== "judge_not_passed") errors.push(`policy_hard_fail:${reason}`);
    }
  }
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    length,
    pipeline: SOURCE,
    draftQualityVia: "llm_and_prompt_only",
  };
}

function normalizeHomeVerifiedWriteQueue(value, helpers = {}) {
  const normalizeXStatusUrl = helpers.normalizeXStatusUrl;
  const parseXStatusUrl = helpers.parseXStatusUrl;
  const byTarget = new Map();
  for (const row of Array.isArray(value) ? value : []) {
    const targetUrl = normalizeStatusUrl(row?.target?.url || row?.targetUrl || "", normalizeXStatusUrl);
    const idPart = parseStatusId(targetUrl, parseXStatusUrl);
    if (!idPart || !row?.prepared?.comment) continue;
    const id = String(row.id || `home-verified-write-${idPart}`);
    const stage = STAGES.includes(row.stage) ? row.stage : (row.status === "posted" ? "posted" : "pending_post");
    const normalized = {
      ...row,
      id,
      targetUrl,
      rootUrl: normalizeStatusUrl(row.rootUrl || row?.target?.rootPostUrl || targetUrl, normalizeXStatusUrl),
      authorHandle: String(row.authorHandle || row?.target?.authorHandle || authorHandleFromUrl(targetUrl) || "").replace(/^@/, ""),
      status: String(row.status || "queued"),
      stage,
      source: SOURCE,
      queuedAt: row.queuedAt || new Date().toISOString(),
      attempts: Math.max(0, Number(row.attempts || 0)),
      targetDomMissRetries: Math.max(0, Number(row.targetDomMissRetries || 0)),
      retryAt: row.retryAt || null,
      lastError: row.lastError || null,
    };
    byTarget.set(targetUrl, normalized);
  }
  return Array.from(byTarget.values()).sort((left, right) => (
    new Date(left.queuedAt || 0).getTime() - new Date(right.queuedAt || 0).getTime()
  ));
}

function normalizeHomeVerifiedCandidateBacklog(value, helpers = {}) {
  const byId = new Map();
  for (const raw of Array.isArray(value) ? value : []) {
    const classified = classifyHomeVerifiedOriginalCandidate(raw, { helpers, requiredHandle: helpers.requiredHandle });
    if (!classified.ok) continue;
    const post = classified.post;
    byId.set(post.id, {
      ...post,
      stage: "candidate",
      source: SOURCE,
      discoveredAt: raw.discoveredAt || new Date().toISOString(),
    });
  }
  return Array.from(byId.values()).sort((a, b) => (
    Number(b.createdTimestamp || 0) - Number(a.createdTimestamp || 0)
  ));
}

/**
 * Grok 한도: 새 생성 중단, 기존 pending_post 배치는 유지.
 */
function homeVerifiedGrokQuotaDisposition(state = {}, nowMs = Date.now()) {
  const until = Date.parse(state.grokQuotaBackoffUntil || state.homeVerifiedGrokBackoffUntil || "");
  if (Number.isFinite(until) && until > nowMs) {
    return {
      allowGenerate: false,
      allowPostPrepared: true,
      until: new Date(until).toISOString(),
      message: state.grokQuotaMessage || state.homeVerifiedGrokBackoffMessage
        || `Grok 사용량 제한: ${new Date(until).toISOString()}까지 문맥·초안 생성 중지`,
    };
  }
  return { allowGenerate: true, allowPostPrepared: true, until: null, message: null };
}

function authorDailyUsageFromHistory({
  history = [],
  pending = [],
  authorHandle,
  dateKey,
  formatKstDateKey,
  limit = 2,
} = {}) {
  const handle = String(authorHandle || "").replace(/^@/, "").toLowerCase();
  if (!handle) return { handle: "", used: 0, reserved: 0, total: 0, limit, allowed: false, reason: "missing_author" };
  const keyFn = typeof formatKstDateKey === "function"
    ? formatKstDateKey
    : (d) => new Date(d).toISOString().slice(0, 10);
  const today = dateKey || keyFn(new Date());
  const posted = (Array.isArray(history) ? history : []).filter((item) => {
    if (String(item?.source || "") && item.source !== SOURCE && item.source !== "home_verified") return false;
    const itemHandle = String(item.authorHandle || authorHandleFromUrl(item.targetUrl || "") || "").toLowerCase();
    if (itemHandle !== handle) return false;
    const at = item.at || item.postedAt || item.createdAt;
    if (!at) return false;
    return keyFn(new Date(at)) === today;
  }).length;
  const reserved = (Array.isArray(pending) ? pending : []).filter((item) => {
    const itemHandle = String(item.authorHandle || authorHandleFromUrl(item.targetUrl || "") || "").toLowerCase();
    return itemHandle === handle && ["queued", "posting", "pending_post", "review_ready"].includes(String(item.status || item.stage || "queued"));
  }).length;
  const total = posted + reserved;
  return {
    handle,
    used: posted,
    reserved,
    total,
    limit,
    allowed: total < limit,
    reason: total < limit ? null : "author_daily_cap_reached",
  };
}

/**
 * 홈 원글 심사: source_anchor 토큰이 원문에 부분 포함되면 통과.
 * 예: 앵커 "부스팅용 봇들" ↔ 원문 "알고리즘 부스팅" / "봇"
 */
function assessHomeVerifiedSourceAnchorRelaxed(anchorValue = "", evidenceText = "") {
  const anchor = String(anchorValue || "").replace(/\s+/g, " ").trim().toLowerCase();
  const source = String(evidenceText || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!anchor || !source) {
    return { grounded: false, method: "missing", anchorTokens: [], matchedTokens: [], overlapRatio: 0 };
  }
  if (source.includes(anchor)) {
    return { grounded: true, method: "exact_phrase", anchorTokens: [anchor], matchedTokens: [anchor], overlapRatio: 1 };
  }
  const stripKoTail = (value) => String(value || "")
    .replace(/(?:으로|에서|에게|을|를|이|가|은|는|의|와|과|도|만|로|들|용)$/g, "");
  const tokens = Array.from(new Set(
    anchor.split(/[^0-9a-z가-힣]+/i)
      .map((t) => stripKoTail(t.trim()))
      .filter((t) => t.length >= 2),
  ));
  if (!tokens.length) {
    return { grounded: false, method: "no_tokens", anchorTokens: [], matchedTokens: [], overlapRatio: 0 };
  }
  const sourceParts = source.split(/[^0-9a-z가-힣]+/i)
    .map((part) => stripKoTail(part))
    .filter((part) => part.length >= 2);
  const matched = tokens.filter((token) => {
    if (source.includes(token)) return true;
    // 부분 일치: 부스팅용↔부스팅 / 봇들↔봇
    return sourceParts.some((part) => (
      part.includes(token) || token.includes(part)
    ));
  });
  // 앵커 토큰 중 절반 이상(최소 1)이 원문과 겹치면 통과
  const required = Math.max(1, Math.ceil(tokens.length * 0.5));
  const grounded = matched.length >= required;
  return {
    grounded,
    method: grounded ? "relaxed_substring_overlap" : "insufficient_token_overlap",
    anchorTokens: tokens,
    matchedTokens: matched,
    overlapRatio: tokens.length ? Math.round((matched.length / tokens.length) * 1000) / 1000 : 0,
  };
}

/**
 * 홈 최종 심사 결과 soft-pass: 점수 충분 + 품질 플래그 없음 + 앵커만 엄격 매칭 실패.
 */
function reconcileHomeVerifiedFinalJudge(judge = {}, target = {}, finalReply = "") {
  if (!judge || judge.passed) return judge;
  const flags = Array.isArray(judge.flaggedQualityIssues) ? judge.flaggedQualityIssues : [];
  const onlyAnchor = flags.length === 1 && flags[0] === "source_anchor_unverifiable";
  const scoreOk = Number(judge.score || 0) >= 90
    && Number(judge.dimensions?.context || 0) >= 30;
  if (!onlyAnchor || !scoreOk) return judge;

  const evidence = [
    target.rootPostText,
    target.targetText,
    target.text,
    target.quotePostText,
    finalReply,
    judge.reason,
    target.groundingContext?.contextSummary,
    target.groundingContext?.summary,
    ...(target.groundingContext?.keyPoints || []),
  ].filter(Boolean).join(" ");

  const relaxed = assessHomeVerifiedSourceAnchorRelaxed(judge.sourceAnchor || "", evidence);
  if (!relaxed.grounded) {
    // 댓글 본문 자체가 원문 토큰과 겹치면 통과
    const replyOverlap = assessHomeVerifiedSourceAnchorRelaxed(finalReply, [
      target.targetText,
      target.text,
      target.groundingContext?.contextSummary,
    ].filter(Boolean).join(" "));
    if (!replyOverlap.grounded) return judge;
    return {
      ...judge,
      passed: true,
      flaggedQualityIssues: [],
      sourceAnchorGrounded: true,
      sourceAnchorGrounding: { ...replyOverlap, recoveredFrom: "reply_overlap" },
      softGrounding: true,
    };
  }
  return {
    ...judge,
    passed: true,
    flaggedQualityIssues: [],
    sourceAnchorGrounded: true,
    sourceAnchorGrounding: { ...relaxed, recoveredFrom: "source_anchor_relaxed" },
    softGrounding: true,
  };
}

/**
 * following 합성 파이프라인 일일 진행.
 * postedToday: 오늘 게시 성공 수
 * pendingReserved: 게시 대기 큐(목표 대비 예비)
 */
function homeVerifiedDailyProgress({
  history = [],
  pending = [],
  dailyTarget = 500,
  formatKstDateKey = null,
  now = new Date(),
} = {}) {
  const target = Math.max(0, Number(dailyTarget || 0));
  const dateKey = typeof formatKstDateKey === "function"
    ? formatKstDateKey(now instanceof Date ? now : new Date(now))
    : String(now).slice(0, 10);
  const postedToday = (Array.isArray(history) ? history : []).filter((item) => {
    const at = item?.at || item?.postedAt;
    if (!at) return false;
    if (typeof formatKstDateKey === "function") return formatKstDateKey(new Date(at)) === dateKey;
    return String(at).slice(0, 10) === dateKey;
  }).length;
  const pendingReserved = (Array.isArray(pending) ? pending : []).filter((row) => {
    const status = String(row?.status || "queued");
    const stage = String(row?.stage || "");
    if (stage === "verification_required") return false;
    return status === "queued" || status === "posting" || stage === "pending_post" || stage === "held";
  }).length;
  const remaining = Math.max(0, target - postedToday);
  const remainingAfterPending = Math.max(0, remaining - pendingReserved);
  return {
    dailyTarget: target,
    postedToday,
    pendingReserved,
    remaining,
    remainingAfterPending,
    atCap: target > 0 && postedToday >= target,
    progressRatio: target > 0 ? Math.min(1, postedToday / target) : 0,
    sourceMode: "fxtwitter_following_synthesis",
  };
}

function homeVerifiedPipelineStatus({
  enabled = false,
  prefillOnly = true,
  backlogCount = 0,
  pendingCount = 0,
  postedToday = 0,
  dailyTarget = 0,
  grokQuota = null,
  lastError = null,
  lastStage = "idle",
} = {}) {
  if (!enabled) {
    return { status: "off", label: "꺼짐", blocker: null, prefillOnly: Boolean(prefillOnly) };
  }
  if (grokQuota && grokQuota.allowGenerate === false) {
    return {
      status: "blocked",
      label: "Grok 사용량 제한",
      blocker: grokQuota.message,
      prefillOnly: Boolean(prefillOnly),
      generatePaused: true,
    };
  }
  const target = Math.max(0, Number(dailyTarget || 0));
  if (target > 0 && Number(postedToday || 0) >= target) {
    return {
      status: "idle",
      label: `일일 목표 달성 (${postedToday}/${target})`,
      blocker: null,
      prefillOnly: Boolean(prefillOnly),
      dailyTargetReached: true,
      postedToday,
      dailyTarget: target,
    };
  }
  if (lastError && pendingCount <= 0 && backlogCount <= 0) {
    return { status: "blocked", label: "오류", blocker: lastError, prefillOnly: Boolean(prefillOnly) };
  }
  if (prefillOnly && pendingCount > 0) {
    return { status: "ready", label: "생성 보관(게시 off)", blocker: null, prefillOnly: true };
  }
  if (pendingCount > 0) {
    return { status: "ready", label: "게시 대기", blocker: null, prefillOnly: false };
  }
  if (backlogCount > 0) {
    return { status: "running", label: lastStage === "discover" ? "후보 수집" : "초안 준비", blocker: null, prefillOnly: Boolean(prefillOnly) };
  }
  return {
    status: "idle",
    label: target > 0 ? `대기 (${postedToday || 0}/${target})` : "대기",
    blocker: null,
    prefillOnly: Boolean(prefillOnly),
    postedToday,
    dailyTarget: target,
  };
}

function defaultHomeVerifiedStateSlice() {
  return {
    homeVerifiedCommentEnabled: false,
    homeVerifiedCommentPrefillOnly: true,
    homeVerifiedCommentBacklog: [],
    homeVerifiedCommentHistory: [],
    homeVerifiedCommentSeenIds: [],
    homeVerifiedCommentLastRunAt: null,
    homeVerifiedCommentLastStatus: "idle",
    homeVerifiedCommentLastError: null,
    homeVerifiedCommentLastSummary: null,
    homeVerifiedCommentXWriteBackoffUntil: null,
    homeVerifiedCommentXWriteBackoffError: null,
  };
}

module.exports = {
  SOURCE,
  STAGES,
  normalizeHomeTimelinePost,
  assessHomeVerifiedOriginalContentSafety,
  isHomeVerifiedForeignLanguageDominant,
  isHomeVerifiedLinkOrSpaceOnlyWeakText,
  isHomeVerifiedCryptoSpamHandle,
  isHomeVerifiedGreetingOnlyReply,
  homeVerifiedJudgeHardFail,
  isHomeVerifiedPermanentPostError,
  homeVerifiedPostFailureDisposition,
  tallyHomeVerifiedRejectReasons,
  diversifyHomeVerifiedDiscoverCandidates,
  classifyHomeVerifiedOriginalCandidate,
  selectHomeVerifiedOriginalCandidates,
  buildHomeVerifiedCommentTarget,
  assessHomeVerifiedWriteQuality,
  assessHomeVerifiedSourceAnchorRelaxed,
  reconcileHomeVerifiedFinalJudge,
  normalizeHomeVerifiedWriteQueue,
  normalizeHomeVerifiedCandidateBacklog,
  homeVerifiedGrokQuotaDisposition,
  authorDailyUsageFromHistory,
  homeVerifiedDailyProgress,
  homeVerifiedPipelineStatus,
  defaultHomeVerifiedStateSlice,
  authorHandleFromUrl,
  HOME_VERIFIED_PROFANITY_RE,
  HOME_VERIFIED_ATTACK_RE,
  HOME_VERIFIED_CONTROVERSY_RE,
};
