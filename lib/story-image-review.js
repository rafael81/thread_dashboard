"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const REQUIRED_CHECKS = ["limb_count", "limb_connections", "hands_and_grips"];

// This verifies a recorded visual inspection, not anatomy from pixels. A content
// approval or a successful image generation is not a visual inspection.
function assertStoryImageReview(root, row) {
  const policyFile = path.join(root, ".data/story-drafts/operations-policy.json");
  const policy = fs.existsSync(policyFile) ? JSON.parse(fs.readFileSync(policyFile, "utf8")) : {};
  if (policy.requireStoryImageReview !== true) return;
  const fail = reason => { throw new Error(`Story image visual review required: ${reason}`); };
  const base = fs.realpathSync(path.join(root, ".data/story-drafts")) + path.sep;
  const dir = fs.realpathSync(path.resolve(root, row.storyDir));
  if (!dir.startsWith(base)) fail("invalid story directory");
  let review;
  try {
    const file = fs.realpathSync(path.join(dir, "image-review.json"));
    if (!file.startsWith(dir + path.sep)) fail("invalid review path");
    review = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { fail("missing or unreadable inspection record"); }
  if (review.version !== 1 || review.status !== "passed" || review.method !== "visual_inspection"
    || !String(review.reviewer || "").trim() || !Number.isFinite(Date.parse(review.reviewedAt))
    || !REQUIRED_CHECKS.every(check => review.checks?.[check] === true)) fail("incomplete inspection");
  if (row.media?.length !== 1) fail("expected one root image");
  const media = row.media[0];
  const actualHash = crypto.createHash("sha256").update(fs.readFileSync(media.path)).digest("hex");
  if (review.rootImageSha256 !== media.sha256 || actualHash !== review.rootImageSha256) {
    fail("image changed after inspection");
  }
}

module.exports = { assertStoryImageReview, REQUIRED_CHECKS };
