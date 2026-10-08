const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildDiscoveryTitleRefinePrompt,
  isVagueDiscoveryCaption,
  parseRefinedDiscoveryTitle,
  sanitizeRefinedDiscoveryTitle,
  validateRefinedDiscoveryTitle,
} = require("../lib/discovery-title-refine");

test("prompt embeds the original title and demands single-line JSON output", () => {
  const prompt = buildDiscoveryTitleRefinePrompt("잠자기 전에 당신의 외모를 감상하세요 🤣");
  assert.match(prompt, /잠자기 전에 당신의 외모를 감상하세요 🤣/);
  assert.match(prompt, /\{"title": "다시 쓴 문장"\}/);
  assert.match(prompt, /원문을 그대로 가져오지 말고/);
  assert.match(prompt, /반드시 다른 문장으로 다시 쓴다/);
  assert.match(prompt, /해시태그, 멘션은 넣지 않는다/);
  assert.doesNotMatch(prompt, /원문 그대로 반환/);
});

test("prompt with media frames requires scene over caption translation", () => {
  const prompt = buildDiscoveryTitleRefinePrompt("정말 웃고 울게 해요 🤣🤣🤣", { hasMediaFrames: true });
  assert.match(prompt, /첨부 이미지는 원문 영상의 대표 프레임/);
  assert.match(prompt, /직역·번역해서 제목을 만들지 마라/);
  assert.match(prompt, /캡션과 영상이 다르면 영상을 따른다/);
  assert.doesNotMatch(prompt, /영상 프레임이 없다/);
});

test("vague captions include foreign fluff and emotion-only lines", () => {
  assert.equal(isVagueDiscoveryCaption("정말 웃고 울게 해요 🤣🤣🤣"), true);
  assert.equal(isVagueDiscoveryCaption("Blue Therapy 🩵"), true);
  assert.equal(isVagueDiscoveryCaption("😂"), true);
  assert.equal(isVagueDiscoveryCaption("사람들이 이렇게 행복할 수 있다는 것이 밝혀졌네...😘"), true);
  assert.equal(isVagueDiscoveryCaption("케이블 타이 던져줬더니 혼자 집 짓고 있네ㅋㅋ"), false);
  assert.equal(isVagueDiscoveryCaption("냥이 육아스킬.... 전생에 배테랑 어린이집 교사 였을듯"), false);
});

test("parse extracts the title from clean and noisy Gemini output", () => {
  assert.equal(parseRefinedDiscoveryTitle('{"title": "잠자기 전에 외모췍~"}'), "잠자기 전에 외모췍~");
  assert.equal(
    parseRefinedDiscoveryTitle('알겠습니다. 다듬은 결과입니다.\n```json\n{"title": "귀엽네 진짜ㅋㅋ"}\n```'),
    "귀엽네 진짜ㅋㅋ",
  );
  assert.equal(parseRefinedDiscoveryTitle("그냥 설명 텍스트만 있는 응답"), "");
  assert.equal(parseRefinedDiscoveryTitle(""), "");
});

test("parse uses the last JSON candidate when multiple appear", () => {
  const raw = '{"title": "첫 시도"} 재고해보니 이게 낫겠습니다 {"title": "최종본"}';
  assert.equal(parseRefinedDiscoveryTitle(raw), "최종본");
});

test("sanitize strips wrapping quotes, code fences, and label prefixes", () => {
  assert.equal(sanitizeRefinedDiscoveryTitle('"외모췍~"'), "외모췍~");
  assert.equal(sanitizeRefinedDiscoveryTitle("제목: 외모췍~"), "외모췍~");
  assert.equal(sanitizeRefinedDiscoveryTitle("```json\n외모췍~\n```"), "외모췍~");
  assert.equal(sanitizeRefinedDiscoveryTitle("  외모췍~  "), "외모췍~");
});

test("validate fails closed on empty, unchanged, ballooned, or artifact outputs", () => {
  const original = "잠자기 전에 당신의 외모를 감상하세요, 당신은 정말 잘생겼어요 🤣";
  assert.equal(validateRefinedDiscoveryTitle("잠자기 전에 외모췍~", original).ok, true);
  assert.equal(validateRefinedDiscoveryTitle("", original).reason, "empty");
  assert.equal(validateRefinedDiscoveryTitle(original, original).reason, "unchanged");
  assert.equal(validateRefinedDiscoveryTitle(`${original} ㅋㅋ`, original).reason, "unchanged");
  assert.equal(validateRefinedDiscoveryTitle("가".repeat(241), "가".repeat(239)).reason, "too_long");
  assert.equal(validateRefinedDiscoveryTitle("아주 길게 부풀린 문장".repeat(10), "짧은 원문").reason, "longer_than_original");
  assert.equal(validateRefinedDiscoveryTitle('{"title": "외모췍~"}', original).reason, "json_artifact");
  assert.equal(validateRefinedDiscoveryTitle("다듬은 문장", original).reason, "prompt_echo");
  assert.equal(
    validateRefinedDiscoveryTitle(
      "운동이 인생 0순위인데 강인수 대표님 발 힘무게 1톤은 좀...",
      "강아지들이 이거 하나에 이렇게 난리",
    ).reason,
    "personal_commentary",
  );
});

test("vague original with media frames may become a short scene line", () => {
  assert.equal(
    validateRefinedDiscoveryTitle(
      "물고기한테 민트초코 떠먹이네 ㅋㅋ",
      "정말 웃고 울게 해요 🤣🤣🤣",
      { hasMediaFrames: true },
    ).ok,
    true,
  );
  // Without frames, a short vague original still allows a modest rewrite by length,
  // but refineDiscoveryTitleOnce refuses the call with needs_media_context.
  assert.equal(isVagueDiscoveryCaption("정말 웃고 울게 해요 🤣🤣🤣"), true);
});

test("short original may still get a slightly longer natural rewrite", () => {
  assert.equal(validateRefinedDiscoveryTitle("귀엽긴 한데 좀 웃기네ㅋㅋ", "귀엽다ㅋㅋ").ok, true);
});

test("mirror server wires media frames into refine and title-refine API", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "mirror_server.js"), "utf8");
  const shareBlock = source.slice(
    source.indexOf('logEvent("share_added_to_discovery"'),
    source.indexOf('logEvent("share_added_to_discovery"') + 900,
  );
  assert.match(shareBlock, /queueDiscoveryTitleRefine\(canonicalUrl, textPreview\.slice\(0, 240\)\)/);
  assert.match(source, /"\/api\/discovery\/title-refine"/);
  const refineBlock = source.slice(
    source.indexOf("async function refineDiscoveryTitleOnce"),
    source.indexOf("function queueDiscoveryTitleRefine"),
  );
  assert.match(refineBlock, /title_changed_by_user/);
  assert.match(refineBlock, /already_refined/);
  assert.match(refineBlock, /validateRefinedDiscoveryTitle/);
  assert.match(refineBlock, /status IN/);
  assert.match(refineBlock, /prepareDiscoveryTitleRefineMedia/);
  assert.match(refineBlock, /needs_media_context/);
  assert.match(refineBlock, /--image/);
  assert.match(refineBlock, /hasMediaFrames/);
  assert.match(source, /extractDiscoveryTitleRefineFrames/);
  const gemini = fs.readFileSync(path.join(__dirname, "..", "scripts", "gemini_custom_prompt.js"), "utf8");
  assert.match(gemini, /collectImageArgs/);
  assert.match(gemini, /uploadGeminiImages/);
  assert.match(gemini, /upload", "input\[type=file\]/);
});
