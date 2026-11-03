const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { normalizeAagagUrl, isAagagUrl, aagagIssueId, normalizeAagagArticle, normalizeAagagMediaUrl, createAagagSource } = require("../lib/aagag-source");
const { normalizeDiscoveryUrl, pruneDiscoveryReviewOutsideVideoStyle } = require("../mirror_server");
const url = "https://aagag.com/issue/?idx=1621842_1";
const raw = { url, title: "의외로 전자파 심각한 장소.mp4", body: "모니터 앞\n미미함\n\n뽑기방 앞\nEMP수준임", media: [
  { url: "https://i.aagag.com/o/L1rES.webp", type: "image" },
  { url: "//i.aagag.com/KV9GR.mp4", type: "video" },
] };

test("AAGAG shares normalize tracking and HTTP while preserving the selected revision", () => {
  assert.equal(normalizeDiscoveryUrl("http://www.aagag.com/issue?idx=1621842_1&utm_source=share#x"), url);
  assert.equal(aagagIssueId(url), aagagIssueId("https://aagag.com/issue/?idx=1621842_0"));
  assert.equal(normalizeAagagUrl(url), url);
  for (const invalid of ["https://aagag.com/issue/", "https://aagag.com.evil.test/issue/?idx=1", "https://aagag.com:3131/issue/?idx=1", "ftp://aagag.com/issue/?idx=1", "https://user@aagag.com/issue/?idx=1", "https://aagag.com/issue/?idx=1_bad"]) {
    assert.equal(isAagagUrl(invalid), false, invalid);
  }
});

test("article keeps media order, removes duplicates, and limits uploads to four", () => {
  const post = normalizeAagagArticle({ ...raw, media: [...raw.media, raw.media[0], ...[1, 2, 3, 4].map((i) => ({ url: `https://i.aagag.com/o/image${i}.jpg`, type: "image" }))] }, url);
  assert.equal(post.media.length, 4);
  assert.equal(post.totalMediaCount, 6);
  assert.deepEqual(post.media.map((item) => item.type), ["image", "video", "image", "image"]);
  assert.match(post.text, /모니터 앞\n미미함/);
});

test("error pages, wrong articles and off-site media are rejected", () => {
  assert.throws(() => normalizeAagagArticle(null, url), /본문/);
  assert.throws(() => normalizeAagagArticle({ ...raw, url: "https://aagag.com/issue/?idx=123" }, url), /본문/);
  for (const media of ["http://127.0.0.1/file.mp4", "https://i.aagag.com.evil.test/a.jpg", "data:image/png;base64,x", "https://i.aagag.com/a.html"]) {
    assert.throws(() => normalizeAagagMediaUrl(media));
  }
});

test("startup style pruning preserves manual AAGAG and manually shared Threads rows but still hides unsuitable Threads scans", async () => {
  const updates = [];
  const threadUrl = "https://www.threads.com/@example/post/abc";
  const result = await pruneDiscoveryReviewOutsideVideoStyle({ db: {
    prepare: () => ({
      all: async () => [
        { canonicalUrl: url, textPreview: raw.title, mediaCount: 4, likeCount: 0, criteria: '{"source":"aagag","manualShare":true}' },
        { canonicalUrl: threadUrl, textPreview: "개인 일기", mediaCount: 0, likeCount: 0, criteria: "{}" },
        { canonicalUrl: "https://www.threads.com/@example/post/shared", textPreview: "아 안보이네😁", mediaCount: 1, likeCount: 60, criteria: '{"manualShare":true,"hasVideo":true}' },
      ],
      run: async (...args) => { updates.push(args); },
    }),
  } });
  assert.deepEqual(result, { kept: 2, hidden: 1 });
  assert.equal(updates.length, 1);
  assert.equal(updates[0][1], threadUrl);
});

test("collection stores valid JPEG/MP4 snapshots, closes owned tabs, and preserves previous files on download failure", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aagag-test-"));
  const sharp = (await import("sharp")).default;
  const webp = await sharp({ create: { width: 12, height: 10, channels: 3, background: "red" } }).webp().toBuffer();
  const mp4 = Buffer.from("00000018667479706d703432000000006d703432", "hex");
  let opened = 0, closed = 0, fail = false;
  const source = createAagagSource({ mediaRoot: dir, withChromeLock: async (_action, fn) => fn(),
    newPage: async (pageUrl) => {
      opened++;
      return { navigate: async () => {}, eval: async () => raw,
        evalFast: async () => { if (fail) throw new Error("HTTP 403"); return (pageUrl.endsWith(".mp4") ? mp4 : webp).toString("base64"); },
        close: async () => { closed++; } };
    },
  });
  try {
    const [post, samePost] = await Promise.all([source.collect(url), source.collect(url)]);
    assert.deepEqual(samePost, post);
    assert.equal(opened, 3, "concurrent imports share one article and two media tabs");
    assert.equal(post.files.length, 2);
    assert.equal((await sharp(post.files[0]).metadata()).format, "jpeg");
    assert.deepEqual(await fs.readFile(post.files[1]), mp4);
    assert.match(post.previewUrls[1], /^\/generated-media\/aagag-\w+\/media-2.mp4$/);
    fail = true;
    await assert.rejects(source.collect(url), /HTTP 403/);
    assert.equal((await source.load(url)).files.length, 2);
    assert.equal((await fs.readdir(dir)).length, 1, "failed staging directory is removed");
    assert.equal(opened, closed);
    await fs.unlink(post.files[1]);
    assert.equal(await source.load(url), null, "missing media cannot silently become text-only");
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
