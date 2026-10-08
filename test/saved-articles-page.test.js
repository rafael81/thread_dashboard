const test = require("node:test");
const assert = require("node:assert/strict");

const {
  stripSavedArticleChrome,
  resolveSavedArticleMedia,
  renderArticleBlocks,
  ARTICLES_ROOT,
} = require("../lib/saved-articles-page");

test("saved article chrome lines are removed before the body starts", () => {
  const text = [
    "유튜브 중급강의",
    "야옹야옹",
    "@mung99933",
    "·",
    "9월 10일",
    "36",
    "5.6만",
    "반갑다.",
    "일본은 자막이랑 TTS가 전부다.",
  ].join("\n");
  assert.equal(stripSavedArticleChrome(text, "유튜브 중급강의"), "반갑다.\n일본은 자막이랑 TTS가 전부다.");
});

test("article blocks keep X rich text and inline media order", () => {
  const html = renderArticleBlocks([
    { type: "p", spans: [{ text: "반갑다." }] },
    { type: "p", spans: [{ text: "빨간약", bold: true }] },
    { type: "p", spans: [{ text: "\"쉬워요\"", italic: true }] },
    { type: "p", spans: [{ text: "shorts_ranger", href: "https://www.youtube.com/@shorts_ranger" }] },
    { type: "h1", spans: [{ text: "1. TTS" }] },
    { type: "h2", spans: [{ text: "사용법" }] },
    { type: "image", file: "media/img_02.png" },
    { type: "p", spans: [] },
  ], "2098026448049291607");
  assert.match(html, /<p class="x-p">반갑다\.<\/p>/);
  assert.match(html, /<strong>빨간약<\/strong>/);
  assert.match(html, /<em>&quot;쉬워요&quot;<\/em>/);
  assert.match(html, /href="https:\/\/www\.youtube\.com\/@shorts_ranger"/);
  assert.match(html, /<h2 class="x-h1">1\. TTS<\/h2>/);
  assert.match(html, /<h3 class="x-h2">사용법<\/h3>/);
  assert.match(html, /file=media%2Fimg_02\.png/);
  assert.ok(html.indexOf("반갑다") < html.indexOf("img_02"));
});

test("article media paths cannot escape the article folder", () => {
  assert.equal(resolveSavedArticleMedia("1", "../index.json"), null);
  assert.equal(resolveSavedArticleMedia("1", "media/../../index.json"), null);
  assert.equal(ARTICLES_ROOT.includes("mung99933-youtube-articles"), true);
});
