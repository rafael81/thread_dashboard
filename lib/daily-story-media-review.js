"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { dailyStoryMedia, dailyStoryDirectory } = require("./daily-publishing");
const { stripPngMetadata } = require("./story-upload-image");

// Validates evidence of an actual visual review; this does not judge pixels.
function assertDailyStoryMediaReview(root, key, source) {
  const media = source.rootMedia;
  if (!media) return;
  const validDate = value => typeof value === "string" && Number.isFinite(Date.parse(value));
  if (!media.review?.passed || media.review.spoilsResolution !== false || !media.review.reason) {
    throw new Error("Root image needs a verified non-spoiler review");
  }
  const file = dailyStoryMedia(root, key);
  const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (hash !== media.sha256) throw new Error("Reviewed root image hash changed");
  if (source.type === "curation") {
    if (media.kind === "ai_generated") throw new Error("AAGAG context images must be original source images");
    return;
  }
  if (source.type !== "fiction" || source.originalFiction !== true || media.kind !== "ai_generated") {
    throw new Error("Fiction root images must be identified as AI-generated illustrations");
  }
  const dir = dailyStoryDirectory(root, key);
  const policyFile = path.join(root, ".data/story-drafts/daily-ten-policy.json");
  const policy = fs.existsSync(policyFile) ? JSON.parse(fs.readFileSync(policyFile, "utf8")).fictionAiImagePolicy || {} : {};
  // Existing published assets remain immutable evidence. New assets follow the
  // user's current presentation policy while keeping their internal provenance.
  const currentPresentation = !fs.existsSync(path.join(dir, "root-receipt.json"))
    || media.presentationVersion === "2026-10-31-watermark-only-v1";
  const omitLabel = currentPresentation && policy.publicAiLabel === false;
  if (!validDate(media.review.viewedAt) || media.review.aiDisclosureVisible !== !omitLabel) {
    throw new Error("AI illustration needs a dated review matching the public AI disclosure policy");
  }
  if (currentPresentation && policy.uploadMetadataPolicy?.strip === true
    && stripPngMetadata(fs.readFileSync(file)).removed.length) {
    throw new Error("AI illustration upload still contains provenance/EXIF/text metadata");
  }
  const promptFile = fs.realpathSync(path.resolve(dir, media.generation?.promptFile || ""));
  if (!promptFile.startsWith(dir + path.sep) || !fs.statSync(promptFile).isFile()
    || !fs.readFileSync(promptFile, "utf8").trim() || !media.generation?.tool) {
    throw new Error("AI illustration generation prompt and tool are required");
  }
  const review = JSON.parse(fs.readFileSync(path.join(dir, "image-review.json"), "utf8"));
  if (review.version !== 1 || review.status !== "passed" || review.method !== "visual_inspection"
    || !String(review.reviewer || "").trim() || !validDate(review.reviewedAt)
    || review.rootImageSha256 !== hash
    || !["limb_count", "limb_connections", "hands_and_grips"].every(check => review.checks?.[check] === true)) {
    throw new Error("AI illustration anatomy inspection is missing, incomplete, or stale");
  }
  if (omitLabel && review.checks?.ai_label_absent !== true) {
    throw new Error("AI label removal needs visual inspection of the final image");
  }
  if (currentPresentation && policy.watermark?.requireVisualVerification
    && (media.review.watermarkVerified !== true || media.review.watermarkText !== policy.watermark.text
      || review.checks?.watermark_text !== true)) {
    throw new Error("Account watermark needs visual verification");
  }
}

module.exports = { assertDailyStoryMediaReview };
