const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildYouTubeXText,
  firstUsableDiscoveryText,
  isDiscoveryPlaceholderText,
  isYouTubeUrl,
  normalizeDiscoveryUrl,
  resolveHomebrewTool,
  sanitizeYouTubeXTitle,
  validateYouTubeUrl,
  youtubeDlArgs,
  youtubeDownloadFailureDetail,
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

test("placeholder collecting titles are not usable schedule text", () => {
  assert.equal(isDiscoveryPlaceholderText("수집 중"), true);
  assert.equal(isDiscoveryPlaceholderText("수집중"), true);
  assert.equal(firstUsableDiscoveryText("수집 중", "", "5만 톤 배가 산을 넘어갑니다"), "5만 톤 배가 산을 넘어갑니다");
  assert.equal(firstUsableDiscoveryText("수집 중", "(본문 없음)"), "");
});

test("YouTube upload title removes hashtags and links", () => {
  assert.equal(
    sanitizeYouTubeXTitle("나한테 오지마 제발 #shorts\nhttps://www.youtube.com/shorts/fTP728UELsg"),
    "나한테 오지마 제발",
  );
  assert.equal(sanitizeYouTubeXTitle("#viral #쇼츠"), "YouTube 영상");
});

test("YouTube download args use player clients that avoid SABR 403", () => {
  const args = youtubeDlArgs("https://www.youtube.com/shorts/Fe44xglvqbg", "/tmp/video.%(ext)s");
  assert.equal(args.includes("youtube:player_client=android,ios,web"), true);
  assert.match(args[args.indexOf("-f") + 1], /\/18\/b$/);
});

test("YouTube download args pass an explicit ffmpeg location when resolved", () => {
  const args = youtubeDlArgs("https://www.youtube.com/shorts/Fe44xglvqbg", "/tmp/video.%(ext)s", {
    ffmpegLocation: "/opt/homebrew/bin/ffmpeg",
  });
  assert.equal(args[0], "--ffmpeg-location");
  assert.equal(args[1], "/opt/homebrew/bin/ffmpeg");
});

test("Homebrew tool lookup finds yt-dlp outside the Node Cellar bin", () => {
  const found = resolveHomebrewTool("yt-dlp", {
    execPath: "/opt/homebrew/Cellar/node/26.7.0/bin/node",
    pathEnv: "/usr/bin:/bin:/usr/sbin:/sbin",
    existsSync: (candidate) => candidate === "/opt/homebrew/bin/yt-dlp",
  });
  assert.equal(found, "/opt/homebrew/bin/yt-dlp");
});

test("YouTube download failure detail surfaces spawn ENOENT when stderr is empty", () => {
  assert.equal(
    youtubeDownloadFailureDetail({ error: "spawn yt-dlp ENOENT", code: "ENOENT", stderr: "" }),
    "spawn yt-dlp ENOENT code=ENOENT",
  );
});

test("non-YouTube URL is rejected by YouTube validation", () => {
  assert.equal(isYouTubeUrl("https://example.com/watch?v=fTP728UELsg"), false);
  assert.throws(() => validateYouTubeUrl("https://example.com/watch?v=fTP728UELsg"));
});
