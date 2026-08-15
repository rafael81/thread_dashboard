const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  saveDiscoveryMediaSnapshot,
  loadDiscoveryMediaSnapshot,
  cleanupDiscoveryMediaSnapshot,
  cleanupExpiredDiscoveryMediaSnapshots,
  discoveryScheduleRetryDecision,
} = require("../mirror_server.js");

const SAMPLE_URL = "https://www.threads.com/@snapshot_test/post/DbSnapShotTest1";

test("discovery media snapshot saves local files and reloads them for retries", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "discovery-media-snap-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });
  const opts = {
    root,
    downloadFile: async (url, file) => {
      fs.writeFileSync(file, url.includes(".mp4") ? "video-bytes" : "image-bytes");
    },
  };

  const snapshot = await saveDiscoveryMediaSnapshot(SAMPLE_URL, {
    text: "스냅샷 테스트 본문",
    mediaUrls: ["https://example.com/a.jpg", "https://example.com/b.mp4"],
    imageMediaUrls: ["https://example.com/a.jpg"],
    videoMediaUrls: ["https://example.com/b.mp4"],
    likeCount: 12,
  }, opts);

  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.files.length, 2);
  assert.equal(snapshot.threadPost.text, "스냅샷 테스트 본문");
  assert.ok(fs.existsSync(snapshot.files[0]));
  assert.ok(fs.existsSync(path.join(snapshot.dir, "manifest.json")));

  const reloaded = loadDiscoveryMediaSnapshot(SAMPLE_URL, { root });
  assert.equal(reloaded.ready, true);
  assert.equal(reloaded.files.length, 2);
  assert.deepEqual(
    reloaded.files.map((file) => path.basename(file)).sort(),
    snapshot.files.map((file) => path.basename(file)).sort(),
  );

  const cleaned = cleanupDiscoveryMediaSnapshot(SAMPLE_URL, { root, reason: "scheduled" });
  assert.equal(cleaned.removed, true);
  assert.equal(loadDiscoveryMediaSnapshot(SAMPLE_URL, { root }), null);
});

test("expired discovery media snapshots are removed by TTL cleanup", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "discovery-media-ttl-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const oldDir = path.join(root, "oldsnap");
  fs.mkdirSync(oldDir, { recursive: true });
  fs.writeFileSync(path.join(oldDir, "manifest.json"), JSON.stringify({
    canonicalUrl: SAMPLE_URL,
    savedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    files: [],
  }));
  fs.writeFileSync(path.join(oldDir, "media-1.jpg"), "x");
  const result = cleanupExpiredDiscoveryMediaSnapshots({
    root,
    now: Date.now(),
    ttlMs: 7 * 24 * 60 * 60 * 1000,
  });
  assert.equal(result.removed, 1);
  assert.equal(fs.existsSync(oldDir), false);
});

test("deleted Threads source errors are not retried by schedule recovery", () => {
  const decision = discoveryScheduleRetryDecision({
    status: "failed_schedule",
    attempts: 1,
    discoveredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    lastError: "Threads 원문이 삭제·비공개·잘못된 링크 상태라 미디어와 본문을 신뢰할 수 없습니다.",
  }, Date.now());
  assert.equal(decision.retry, false);
  assert.equal(decision.reason, "content_constraint");
});

test("Threads temporary error pages are not reused as text-only snapshots", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "discovery-media-error-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });
  const url = "https://www.threads.com/@junho_song_/post/Db8U8YAGOGk";
  const errorText = [
    "문제가 발생했습니다. 나중에 다시 시도해보세요.",
    "다시 시도",
    "© 2026",
    "Threads 약관",
    "개인정보처리방침",
    "쿠키 정책",
  ].join("\n");
  const saved = await saveDiscoveryMediaSnapshot(url, {
    text: errorText,
    mediaUrls: [],
  }, { root });
  assert.equal(saved.ready, false);
  assert.equal(loadDiscoveryMediaSnapshot(url, { root }), null);
});

test("Threads temporary error pages can be retried after cooldown", () => {
  const now = Date.now();
  const decision = discoveryScheduleRetryDecision({
    status: "failed_schedule",
    attempts: 1,
    discoveredAt: new Date(now - 60 * 60 * 1000).toISOString(),
    lastError: "Threads 페이지가 오류 상태라 미디어와 본문을 신뢰할 수 없습니다.",
  }, now);
  assert.equal(decision.retry, true);
  assert.equal(decision.reason, "transient_failure");
});
