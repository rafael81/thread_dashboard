"use strict";

const { isPersonalDiscoveryCaption } = require("./discovery-group-classifier");

const DISCOVERY_TITLE_MAX_LENGTH = 240;
const DISCOVERY_TITLE_VOICE = "terafabx-voice-1";

function compactDiscoveryTitle(value = "") {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[ㅋㅎ.!！?？~…,，。.、"'“”‘’^^:;；]/g, "");
}

function titlesTooClose(left = "", right = "") {
  const a = compactDiscoveryTitle(left);
  const b = compactDiscoveryTitle(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return longer.includes(shorter) && shorter.length / longer.length >= 0.82;
}

function stripCaptionNoise(value = "") {
  return String(value || "")
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F]/gu, "")
    .replace(/[ㅋㅎ.!！?？~…,，。.、"'“”‘’^^:;；\s]/g, "")
    .trim();
}

/**
 * Captions that are mood/emoji fluff or foreign one-liners without a concrete scene.
 * With video frames these become scene lines; text-only refine just translates them.
 */
function isVagueDiscoveryCaption(value = "") {
  const text = String(value || "").trim();
  if (!text) return true;
  const stripped = stripCaptionNoise(text);
  if (stripped.length <= 2) return true;

  const hangul = (text.match(/[\uac00-\ud7a3]/g) || []).length;
  const foreign = (text.match(/[A-Za-z\u3040-\u30ff\u4e00-\u9fff]/g) || []).length;
  if (foreign > hangul && hangul < 6) return true;

  if (
    /^(?:정말\s*)?(?:웃고\s*울게|웃기(?:네|다)?|행복|사랑|귀여|예뻐|멋지|최고|레전드|실화|좋아|미쳐|대박)/.test(text)
    && stripped.length < 24
  ) {
    return true;
  }
  if (/^(?:blue\s*therapy|therapy|vibes?|mood|lol+|lmao+|omg+)\b/i.test(text) && stripped.length < 24) {
    return true;
  }
  // Abstract mood lines with no concrete scene noun ("행복할 수 있다", "웃고 울게 해요").
  const hasConcreteNoun = /(고양이|강아지|개|냥이|물고기|아이스크림|모니터|케이블|슬리퍼|국수|문앞|황소|양|초밥|스시)/.test(text);
  if (
    !hasConcreteNoun
    && /(행복|웃고\s*울|사랑|힐링|감동|therapy|vibes?)/i.test(text)
    && stripped.length < 50
  ) {
    return true;
  }
  return false;
}

function buildDiscoveryTitleRefinePrompt(originalTitle, options = {}) {
  const title = String(originalTitle || "").trim();
  const hasMediaFrames = options.hasMediaFrames === true;
  const retry = options.retry === true
    ? ["", hasMediaFrames
      ? "이전 시도는 원문과 너무 비슷했다. 단어 순서를 바꾸고, 보이는 장면 반응을 붙여 다른 문장으로 다시 써라."
      : "이전 시도는 원문과 너무 비슷했다. 뜻은 그대로 두고 어순과 표현을 바꿔 다른 문장으로 다시 써라."]
    : [];
  const mediaRules = hasMediaFrames
    ? [
      "",
      "첨부 이미지는 원문 영상의 대표 프레임이다. 제목은 반드시 이 장면에 맞춰 쓴다.",
      "- 캡션(원문)은 분위기 힌트일 뿐이다. 캡션 단어를 직역·번역해서 제목을 만들지 마라.",
      "- 외국어·이모지·감정만 있는 캡션은 무시하고, 프레임에 보이는 행동·대상만 말한다.",
      "- 캡션과 영상이 다르면 영상을 따른다. 영상 없는 감정 형용사로 메우지 마라.",
      "- 프레임에 없는 사실(이름, 장소명, 해시태그)은 넣지 않는다.",
    ]
    : [
      "",
      "영상은 보지 않는다. 원문 글만 보고 제목을 쓴다.",
      "- 원문이 외국어(중국어, 일본어, 러시아어, 영어 등)면 뜻을 살려 자연스러운 한국어로 옮긴다. 직역체·번역체는 쓰지 않는다.",
      "- 원문이 기계번역처럼 어색한 한국어면, 같은 뜻을 한국 사람이 실제로 쓰는 말투로 고친다.",
      "- 감정·이모지·짧은 한마디뿐인 원문도 비워두지 말고 그 뜻만 짧게 옮긴다.",
      "- 영상에 무엇이 나오는지 추측해서 덧붙이지 않는다. 원문에 없는 동물 종류, 행동, 장소, 숫자를 만들지 않는다.",
    ];
  return [
    "너는 X에 올리는 짧은 한국어 글을 대신 쓰는 사람이다. 아래는 스레드 원문이다. 원문을 그대로 가져오지 말고, 같은 장면만 내 말투로 다시 써서 저장할 제목을 만들어라.",
    "",
    "원문:",
    '"""',
    title,
    '"""',
    ...mediaRules,
    "",
    "내 말투 예:",
    "- 상사 지나갈 때마다 모니터 빛의 속도로 변하는 거 봐라 ㅋㅋㅋㅋㅋ 순발력 미쳤네;;;",
    "- 케이블 타이 던져줬더니 혼자 집 짓고 있네ㅋㅋ 건축학과 입학하는 거 아니냐고;;",
    "- 슬리퍼 방향 돌리기 귀찮아서 앞뒤 없는 걸로 샀음ㅋㅋㅋ",
    "",
    "재작성 규칙:",
    "- 원문 문장, 조사, 어순을 유지하지 마라. 반드시 다른 문장으로 다시 쓴다.",
    "- 장면의 사실만 남긴다. 원문에 없는 사실, 이름, 해시태그, 멘션은 넣지 않는다.",
    "- 반말로, 본 장면을 툭 던지듯 1~2문장. 설명하지 않는다.",
    "- 팔로워에게 묻는 말, 홍보 문구, 존댓말 안내문은 쓰지 않는다.",
    "- 1인칭 일상 기록, 운동 일지, 특정인 평가로 바꾸지 않는다. '은 좀...' 같은 사적 평가를 만들지 않는다.",
    "- 미쳤다, 레전드, 실화냐, 신세계, 존나, 욕설은 쓰지 않는다.",
    hasMediaFrames
      ? "- 원문보다 길어지지 않게. 최대 200자. 단, 원문이 이모지·외국어 한마디뿐이고 프레임이 있으면 장면 기준으로 짧게 써도 된다."
      : "- 원문보다 길어지지 않게. 최대 200자. 외국어 원문은 한국어로 옮긴 뜻만큼만 쓴다.",
    ...retry,
    "",
    "출력 형식: 딱 한 줄의 JSON만 출력한다. 설명, 마크다운, 코드블록 금지.",
    '{"title": "다시 쓴 문장"}',
  ].join("\n");
}

function parseRefinedDiscoveryTitle(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const candidates = text.match(/\{[^{}]*"title"[^{}]*\}/gs) || [];
  for (const candidate of candidates.reverse()) {
    try {
      const parsed = JSON.parse(candidate);
      const title = String(parsed?.title || "").trim();
      if (title) return title;
    } catch {}
  }
  return "";
}

function sanitizeRefinedDiscoveryTitle(value) {
  let title = String(value || "").replace(/\r/g, "").trim();
  title = title.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  title = title.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  title = title.replace(/^(?:제목|다듬은 문장|결과)\s*[:：]\s*/, "").trim();
  return title;
}

/**
 * Returns { ok, reason } — fail-closed: only clearly usable rewrites are applied.
 */
function validateRefinedDiscoveryTitle(refined, originalTitle, options = {}) {
  const title = String(refined || "").trim();
  const original = String(originalTitle || "").trim();
  const hasMediaFrames = options.hasMediaFrames === true;
  if (!title) return { ok: false, reason: "empty" };
  if (title.length > DISCOVERY_TITLE_MAX_LENGTH) return { ok: false, reason: "too_long" };
  if (title === original || titlesTooClose(title, original)) return { ok: false, reason: "unchanged" };
  // Caption-only fluff must not invent a long mood essay. With video frames, allow a
  // normal short scene line even when the original was emoji/foreign-only.
  if (!(hasMediaFrames && isVagueDiscoveryCaption(original))) {
    if (title.length > Math.max(original.length * 1.5, original.length + 30)) {
      return { ok: false, reason: "longer_than_original" };
    }
  } else if (title.length > 120) {
    return { ok: false, reason: "longer_than_original" };
  }
  if (/\{|\}|"title"/.test(title)) return { ok: false, reason: "json_artifact" };
  if (/(다듬은 문장|원문:|출력 형식|첨부 이미지)/.test(title)) return { ok: false, reason: "prompt_echo" };
  if (!isPersonalDiscoveryCaption(original) && isPersonalDiscoveryCaption(title)) {
    return { ok: false, reason: "personal_commentary" };
  }
  return { ok: true, reason: null };
}

module.exports = {
  DISCOVERY_TITLE_MAX_LENGTH,
  DISCOVERY_TITLE_VOICE,
  compactDiscoveryTitle,
  titlesTooClose,
  isVagueDiscoveryCaption,
  buildDiscoveryTitleRefinePrompt,
  parseRefinedDiscoveryTitle,
  sanitizeRefinedDiscoveryTitle,
  validateRefinedDiscoveryTitle,
};
