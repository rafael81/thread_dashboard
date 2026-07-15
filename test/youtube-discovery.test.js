const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildYouTubeXText,
  isYouTubeUrl,
  normalizeDiscoveryUrl,
  sanitizeYouTubeXTitle,
  validateYouTubeUrl,
  xWeightedLength,
} = require("../mirror_server");

test("YouTube Shorts share URL is canonicalized without tracking parameters", () => {
  const shared = "https://youtube.com/shorts/fTP728UELsg?si=6yb65CHYdLPx0HSd";
  assert.equal(validateYouTubeUrl(shared), "https://www.youtube.com/shorts/fTP728UELsg");
  assert.equal(normalizeDiscoveryUrl(shared), "https://www.youtube.com/shorts/fTP728UELsg");
  assert.equal(isYouTubeUrl(shared), true);
});

test("YouTube watch and youtu.be URLs are accepted", () => {
  assert.equal(
    validateYouTubeUrl("https://www.youtube.com/watch?v=fTP728UELsg&t=2"),
    "https://www.youtube.com/watch?v=fTP728UELsg",
  );
  assert.equal(
    validateYouTubeUrl("https://youtu.be/fTP728UELsg?si=abc"),
    "https://www.youtube.com/watch?v=fTP728UELsg",
  );
});

test("YouTube X text always preserves the canonical video URL within 280 weighted characters", () => {
  const url = "https://www.youtube.com/shorts/fTP728UELsg";
  const text = buildYouTubeXText("아주 긴 영상 제목 ".repeat(40), url);
  assert.equal(text.endsWith(url), true);
  assert.equal(xWeightedLength(text) <= 280, true);
});

test("YouTube upload title removes hashtags and links", () => {
  assert.equal(
    sanitizeYouTubeXTitle("나한테 오지마 제발 #shorts\nhttps://www.youtube.com/shorts/fTP728UELsg"),
    "나한테 오지마 제발",
  );
  assert.equal(sanitizeYouTubeXTitle("#viral #쇼츠"), "YouTube 영상");
});

test("non-YouTube URL is rejected by YouTube validation", () => {
  assert.equal(isYouTubeUrl("https://example.com/watch?v=fTP728UELsg"), false);
  assert.throws(() => validateYouTubeUrl("https://example.com/watch?v=fTP728UELsg"));
});
