"use strict";

const DISCOVERY_GROUPS = ["A", "B", "C"];
const DISCOVERY_TOPICS = ["동물", "유머", "일상공감", "스포츠", "기타"];
const GROUP_CLASSIFIER_VERSION = 1;

function parseCriteriaInput(criteria) {
  if (criteria && typeof criteria === "object") return criteria;
  try {
    return JSON.parse(String(criteria || "{}")) || {};
  } catch {
    return {};
  }
}

function isVideoPreviewUrl(url = "") {
  return /\.mp4|\.mov|\.webm|\/o1\/v\/|\/t2\/f2\/m86\/|\/t16\/f2\/m69\//i.test(String(url || ""));
}

function discoveryTextHasKorean(text = "") {
  return /[가-힣]{2,}/.test(String(text || ""));
}

const DISCOVERY_ANIMAL_RE = /(강아지|댕댕|강쥐|멍멍|개\b|고양이|냥이|고냥|야옹|동물|펫|반려견|반려묘|토끼|햄스터|병아리|앵무|새끼|puppy|kitten|dog|cat|🐶|🐱|🐕|🐈|🐹|🐰)/i;
const DISCOVERY_CUTE_RE = /(귀여|귀염|졸귀|애교|ㅋㅋ|ㅎㅎ|🥹|🥰|😍|💕|사랑스|꼬순|하품|잠든|잠자|표정|웃기|웃겼|웃긴|웃네|웃음|신기|귀엽|졸려|깨우)/;

function isCuteAnimalDiscoveryCaption(text = "") {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return false;
  if (!DISCOVERY_ANIMAL_RE.test(compact)) return false;
  return DISCOVERY_CUTE_RE.test(compact) || /🐶|🐱|🐕|🐈|🐹|🐰/.test(compact);
}

function discoveryEngagementCount({ likeCount, viewCount } = {}) {
  const likes = Number(likeCount);
  const views = Number(viewCount);
  const likeOk = Number.isFinite(likes) ? likes : 0;
  const viewOk = Number.isFinite(views) ? views : 0;
  return Math.max(likeOk, viewOk);
}

function isPersonalDiscoveryCaption(text = "") {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return false;
  if (/(나는|난|제가).{0,24}(?:0|1)\s*순위/.test(compact)) return true;
  if (/인생(?:이|은|의)?\s*(?:의\s*)?(?:0|1)\s*순위/.test(compact)) return true;
  if (/(?:대표님|선생님|코치님).{0,40}(?:은|는)\s*좀/.test(compact)) return true;
  if (/(?:은|는)\s*좀\s*\.{2,}/.test(compact) && /(나는|난|제\b|대표님|선생님|코치님)/.test(compact)) return true;
  if (/(?:나는|난)\s+.{0,30}(?:에요|예요|입니다)/.test(compact) && !/(봤|보면|보고|ㅋㅋ|ㅎㅎ)/.test(compact)) return true;
  const workoutLog = /\d+\s*(?:키로|킬로|kg)\b/i.test(compact)
    || /(?:무게|세트|어브덕션|스쿼트|데드리프트).{0,16}\d+/.test(compact);
  const firstPersonDiary = /(나는|난|제가|오늘|잘 일어나)/.test(compact);
  if (workoutLog && firstPersonDiary) return true;
  return false;
}

function discoveryTextIsMostlyCjk(text = "") {
  const value = String(text || "");
  const cjk = (value.match(/[\u4e00-\u9fff]/g) || []).length;
  const hangul = (value.match(/[가-힣]/g) || []).length;
  return cjk >= 2 && hangul < 2;
}

function discoveryCandidateHasVideo({ mediaCount, criteria, previewUrl } = {}) {
  const parsed = parseCriteriaInput(criteria);
  if (parsed.hasVideo === true || Number(parsed.videoCount || 0) > 0) return true;
  if (isVideoPreviewUrl(previewUrl) || isVideoPreviewUrl(parsed.mediaPreviewUrl)) return true;
  return Number(mediaCount || 0) > 0 && parsed.mediaKind === "video";
}

function classifyDiscoveryGroupByRules({ likeCount, mediaCount, criteria, textPreview, previewUrl } = {}) {
  const parsed = parseCriteriaInput(criteria);
  const style = parsed.terafabxStyle;
  const score = Number(style?.score ?? parsed.viralScore ?? parsed.viral_score ?? 0);
  const text = String(textPreview || "");
  const hasVideo = discoveryCandidateHasVideo({ mediaCount, criteria: parsed, previewUrl });
  const hasKorean = style?.hasKorean === true || discoveryTextHasKorean(text);
  const mostlyCjk = discoveryTextIsMostlyCjk(text);
  if (style?.personalCommentary === true || isPersonalDiscoveryCaption(text)) {
    return { group: "C", score, reasons: ["personal_commentary"], borderline: false };
  }
  void likeCount;

  if (!hasVideo) {
    return { group: "C", score, reasons: ["no_video"], borderline: false };
  }
  if (!style || typeof style !== "object") {
    return { group: "C", score, reasons: ["no_style_assessment"], borderline: false };
  }
  if (style.excluded === true) {
    return { group: "C", score, reasons: ["excluded_topic"], borderline: false };
  }
  if (style.longInfoPost === true) {
    return { group: "C", score, reasons: ["long_info_post"], borderline: false };
  }
  if (!hasKorean || mostlyCjk) {
    return { group: "C", score, reasons: ["no_korean_caption"], borderline: false };
  }
  if (style.animalCute === false || (style.animalCute !== true && !isCuteAnimalDiscoveryCaption(text))) {
    return { group: "C", score, reasons: ["not_cute_animal"], borderline: false };
  }
  if (style.engagementOk === false) {
    return { group: "C", score, reasons: ["below_view_threshold"], borderline: false };
  }

  const signals = style.signals && typeof style.signals === "object" ? style.signals : {};
  const hasStyleSignal = Boolean(signals.curiosity || signals.entertainment || signals.reaction || signals.visualHook);
  if (style.pass === true && hasKorean && !mostlyCjk) {
    return { group: "A", score: Number(style.score || score), reasons: ["style_pass"], borderline: false };
  }
  if (hasStyleSignal || Number(style.score || 0) >= 4) {
    const styleScore = Number(style.score || 0);
    return {
      group: "B",
      score: styleScore || score,
      reasons: ["style_review"],
      borderline: styleScore === 6 || styleScore === 7,
    };
  }
  return { group: "C", score, reasons: ["below_style"], borderline: false };
}

function buildGroupClassifierPrompt(row, rulesResult) {
  const text = String(row?.textPreview || "").trim().slice(0, 400);
  const likes = Number(row?.likeCount || 0);
  const media = Number(row?.mediaCount || 0);
  const rulesGroup = rulesResult?.group || "B";
  const rulesReasons = Array.isArray(rulesResult?.reasons) ? rulesResult.reasons.join(", ") : "";
  return [
    "너는 Threads 발굴 게시물을 X(@terafabXai) 게시 적합도로 재판정하는 분류기다.",
    "반드시 아래 JSON 형식 한 줄만 출력한다. 설명, 마크다운, 코드블록 금지.",
    '{"group":"A|B","topic":"<토픽>","reason":"<=80자"}',
    "",
    `규칙 분류 결과: ${rulesGroup} (사유: ${rulesReasons || "없음"})`,
    `좋아요: ${likes}, 미디어: ${media}개`,
    "",
    "그룹 정의:",
    "- A: terafabX 스타일에 잘 맞고 한국어 훅+강한 미디어, 바로 게시 추천",
    "- B: 화제성은 있지만 A 미달, 검토 후 게시 가능",
    "",
    "주의: C 그룹으로 판정된 항목을 A로 올리지 않는다. A→B demotion만 허용.",
    `허용 topic: ${DISCOVERY_TOPICS.join(", ")}`,
    "",
    "본문 미리보기:",
    '"""',
    text,
    '"""',
  ].join("\n");
}

function parseGroupClassification(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenced) candidates.push(fenced[1].trim());
  candidates.push(text);
  const objectMatches = text.match(/\{[\s\S]*?\}/g) || [];
  for (const match of objectMatches) candidates.push(match);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}

function validateGroupClassification(parsed, rulesResult) {
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, group: null, topic: null, reason: "invalid_object" };
  }
  if (rulesResult?.group === "C") {
    return { ok: false, group: null, topic: null, reason: "rules_group_c" };
  }
  const group = String(parsed.group || "").trim();
  if (!["A", "B"].includes(group)) {
    return { ok: false, group: null, topic: null, reason: "invalid_group" };
  }
  let topic = String(parsed.topic || "").trim();
  if (!DISCOVERY_TOPICS.includes(topic)) {
    topic = "기타";
  }
  const reason = String(parsed.reason || "").trim().slice(0, 80);
  if (rulesResult?.group === "B" && !rulesResult?.borderline && group === "A") {
    return { ok: true, group: "B", topic, reason: reason || "gemini_lift_blocked" };
  }
  return { ok: true, group, topic, reason };
}

module.exports = {
  DISCOVERY_GROUPS,
  DISCOVERY_TOPICS,
  GROUP_CLASSIFIER_VERSION,
  classifyDiscoveryGroupByRules,
  discoveryCandidateHasVideo,
  isPersonalDiscoveryCaption,
  isCuteAnimalDiscoveryCaption,
  discoveryEngagementCount,
  discoveryTextHasKorean,
  discoveryTextIsMostlyCjk,
  isVideoPreviewUrl,
  buildGroupClassifierPrompt,
  parseGroupClassification,
  validateGroupClassification,
};
