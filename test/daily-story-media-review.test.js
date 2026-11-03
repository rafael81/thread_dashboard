"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { assertDailyStoryMediaReview } = require("../lib/daily-story-media-review");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daily-ai-review-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, ".data/story-drafts/daily-ten/2026-11-01/08");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "image.png"), "image bytes");
  fs.writeFileSync(path.join(dir, "prompt.txt"), "An original fiction illustration.");
  const sha = crypto.createHash("sha256").update("image bytes").digest("hex");
  const source = { type: "fiction", originalFiction: true, rootMedia: {
    file: "image.png", sha256: sha, kind: "ai_generated",
    generation: { tool: "image_gen", promptFile: "prompt.txt" },
    review: { passed: true, spoilsResolution: false, reason: "Unresolved opening scene", viewedAt: "2026-10-31T00:00:00Z", aiDisclosureVisible: true },
  } };
  const review = { version: 1, status: "passed", method: "visual_inspection", reviewer: "test", reviewedAt: "2026-10-31T00:00:00Z",
    rootImageSha256: sha, checks: { limb_count: true, limb_connections: true, hands_and_grips: true } };
  function save() { fs.writeFileSync(path.join(dir, "source.json"), JSON.stringify(source)); fs.writeFileSync(path.join(dir, "image-review.json"), JSON.stringify(review)); }
  function check() { save(); assertDailyStoryMediaReview(root, "daily-ten:2026-11-01:08", source); }
  return { root, dir, source, review, check };
}

test("only a reviewed generated fiction image with generation provenance passes", t => {
  const f = fixture(t); assert.doesNotThrow(f.check);
  f.source.rootMedia.kind = "original";
  assert.throws(f.check, /AI-generated/);
  f.source.rootMedia.kind = "ai_generated";
  f.source.rootMedia.review.aiDisclosureVisible = false;
  assert.throws(f.check, /disclosure/);
});
test("changed images and incomplete or mismatched anatomy reviews are rejected", t => {
  const f = fixture(t);
  f.review.checks.hands_and_grips = false;
  assert.throws(f.check, /anatomy/);
  f.review.checks.hands_and_grips = true;
  f.review.rootImageSha256 = "old hash";
  assert.throws(f.check, /anatomy/);
  fs.writeFileSync(path.join(f.dir, "image.png"), "replacement");
  assert.throws(f.check, /hash changed/);
});
test("spoilers, missing generation prompts, and missing visual review are rejected", t => {
  const f = fixture(t);
  f.source.rootMedia.review.spoilsResolution = true;
  assert.throws(f.check, /non-spoiler/);
  f.source.rootMedia.review.spoilsResolution = false;
  f.source.rootMedia.generation.promptFile = "absent.txt";
  assert.throws(f.check, /ENOENT/);
  f.source.rootMedia.generation.promptFile = "prompt.txt";
  f.review.reviewedAt = "invalid";
  assert.throws(f.check, /anatomy/);
});
test("original curation images still pass and AI images cannot masquerade as AAGAG originals", t => {
  const f = fixture(t); f.source.type = "curation";
  delete f.source.rootMedia.kind; assert.doesNotThrow(f.check);
  f.source.rootMedia.kind = "ai_generated";
  assert.throws(f.check, /original source/);
  delete f.source.rootMedia; assert.doesNotThrow(f.check);
});

test("watermark-only policy accepts clean reviewed PNGs and rejects stale labels, metadata and watermark checks", async t => {
  const f = fixture(t);
  const policy = { fictionAiImagePolicy: { publicAiLabel: false, uploadMetadataPolicy: { strip: true }, watermark: { text: "@terafabXai", requireVisualVerification: true } } };
  fs.writeFileSync(path.join(f.root, ".data/story-drafts/daily-ten-policy.json"), JSON.stringify(policy));
  const png = await require("sharp")({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer();
  const replaceImage = bytes => {
    fs.writeFileSync(path.join(f.dir, "image.png"), bytes);
    f.source.rootMedia.sha256 = f.review.rootImageSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  };
  replaceImage(png);
  assert.throws(f.check, /disclosure/);
  Object.assign(f.source.rootMedia.review, { aiDisclosureVisible: false, watermarkVerified: true, watermarkText: "@terafabXai" });
  Object.assign(f.review.checks, { ai_label_absent: true, watermark_text: true });
  assert.doesNotThrow(f.check);
  f.review.checks.ai_label_absent = false;
  assert.throws(f.check, /label removal/);
  f.review.checks.ai_label_absent = true;
  f.source.rootMedia.review.watermarkVerified = false;
  assert.throws(f.check, /watermark/);
  f.source.rootMedia.review.watermarkVerified = true;
  const chunk = Buffer.alloc(16); chunk.writeUInt32BE(4); chunk.write("caBX", 4); chunk.write("c2pa", 8);
  replaceImage(Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]));
  assert.throws(f.check, /metadata/);
  // Previously published assets are not rewritten by the new presentation policy.
  fs.writeFileSync(path.join(f.dir, "root-receipt.json"), JSON.stringify({ id: "published" }));
  f.source.rootMedia.review.aiDisclosureVisible = true;
  assert.doesNotThrow(f.check);
});
