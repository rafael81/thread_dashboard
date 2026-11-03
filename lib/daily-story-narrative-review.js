"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const sha = text => createHash("sha256").update(text).digest("hex");

function assertDailyStoryNarrativeReview({ policy, alreadyPosted, source, post, reply, dir }) {
  if (!policy?.enabled || alreadyPosted || source.operatingDate < policy.effectiveOperatingDate) return;
  if (!policy.types?.includes(source.type)) return;
  if (source.narrativePolicyVersion !== policy.version
    || source.narrativePerspective !== "first_person_participant" || !source.narratorRole?.trim()) {
    throw new Error("All story types require the current first-person participant review");
  }
  const review = JSON.parse(fs.readFileSync(path.join(dir, "first-person-review.json"), "utf8"));
  if (!review.passed || review.narrativePolicyVersion !== policy.version || !review.noThirdPartyRetelling
    || review.postSha256 !== sha(post) || review.replySha256 !== sha(reply)) {
    throw new Error("Exact root and ending reply need a fresh first-person review");
  }
  const unquoted = post.split("\n").filter(line => !/^[“"'‘]/.test(line.trim())).join("\n");
  if (/글이 (?:있음|올라옴)|사진이 올라옴|문자 캡처임|짤을 봄|글쓴이는/.test(unquoted)) {
    throw new Error("Third-person source-summary framing remains in the story root");
  }
  if (source.type === "curation" && (source.originalFiction !== false
    || !source.sourceAdaptation?.sourceFactsPreserved
    || !source.sourceAdaptation?.noRealExperienceCertification
    || source.sourceAdaptation?.baseSourceUrl !== source.source?.url)) {
    throw new Error("First-person curation must retain its source and adaptation provenance");
  }
}
module.exports = { assertDailyStoryNarrativeReview };
