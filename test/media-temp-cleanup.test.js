const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  cleanupMediaTempDir,
  cleanupOrphanedMediaTempDirs,
  createMediaTempDir,
  downloadMedia,
} = require("../mirror_server");

function setDirectoryAge(dir, now, ageMs) {
  const date = new Date(now - ageMs);
  fs.utimesSync(dir, date, date);
}

test("startup media cleanup removes only stale owned temp directories", (t) => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "media-orphan-cleanup-test-"));
  const now = Date.now();
  const oldThread = fs.mkdtempSync(path.join(tmpRoot, "thread-mirror-"));
  const oldYouTube = fs.mkdtempSync(path.join(tmpRoot, "youtube-x-upload-"));
  const freshThread = fs.mkdtempSync(path.join(tmpRoot, "thread-mirror-"));
  const unrelated = fs.mkdtempSync(path.join(tmpRoot, "unrelated-"));
  const active = createMediaTempDir("thread-mirror-", { tmpRoot });
  t.after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

  fs.writeFileSync(path.join(oldThread, "media-1.mp4"), "old");
  fs.writeFileSync(path.join(oldYouTube, "video.mp4"), "old");
  setDirectoryAge(oldThread, now, 2 * 60 * 60 * 1000);
  setDirectoryAge(oldYouTube, now, 2 * 60 * 60 * 1000);
  setDirectoryAge(freshThread, now, 5 * 60 * 1000);
  setDirectoryAge(active, now, 2 * 60 * 60 * 1000);

  const result = cleanupOrphanedMediaTempDirs({
    tmpRoot,
    now,
    minAgeMs: 60 * 60 * 1000,
  });

  assert.equal(result.removedCount, 2);
  assert.equal(result.skippedActiveCount, 1);
  assert.equal(result.skippedFreshCount, 1);
  assert.equal(fs.existsSync(oldThread), false);
  assert.equal(fs.existsSync(oldYouTube), false);
  assert.equal(fs.existsSync(freshThread), true);
  assert.equal(fs.existsSync(active), true);
  assert.equal(fs.existsSync(unrelated), true);

  cleanupMediaTempDir(active);
  assert.equal(fs.existsSync(active), false);
});

test("partial Threads media download failure removes its temp directory immediately", async (t) => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "media-download-failure-test-"));
  t.after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));
  let attempts = 0;

  await assert.rejects(
    downloadMedia([
      "https://example.com/first.mp4",
      "https://example.com/second.mp4",
    ], {
      tmpRoot,
      downloadFile: async (_url, file) => {
        attempts += 1;
        if (attempts === 2) throw new Error("simulated download failure");
        fs.writeFileSync(file, "partial");
      },
    }),
    /simulated download failure/,
  );

  assert.equal(attempts, 2);
  assert.deepEqual(fs.readdirSync(tmpRoot), []);
});
