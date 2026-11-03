"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const sha = value => createHash("sha256").update(value).digest("hex");
const normal = value => String(value || "").replace(/\s+/g, " ").trim();
const parseResponse = text => {
  const start = text.search(/[\[{]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  const parsed = JSON.parse(text.slice(start, end + 1));
  return Array.isArray(parsed) ? { items: parsed } : parsed;
};
const eligibleKinds = new Set(["fictional_interaction", "human_incident", "message_exchange", "question_answer"]);

function assertDailyStoryComprehensionReview({ policy, alreadyPosted, source, post, reply, dir }) {
  if (!policy?.enabled || alreadyPosted || source.operatingDate < policy.effectiveOperatingDate
    || !policy.types?.includes(source.type)) return;
  const fail = message => { throw new Error(`Story comprehension review: ${message}`); };
  const review = JSON.parse(fs.readFileSync(path.join(dir, "comprehension-review.json"), "utf8"));
  if (review.version !== policy.version || source.editorialQualityVersion !== policy.version
    || review.passed !== true || review.postSha256 !== sha(post) || review.replySha256 !== sha(reply)) {
    fail("exact final root and ending reply need a current passed review");
  }
  if (!eligibleKinds.has(review.eligibility?.kind) || review.eligibility?.passed !== true
    || !review.eligibility?.reason?.trim()) fail("source is not a suitable self-contained story");
  const manual = review.manual;
  if (!manual || ["rootSelfContained", "onlyResolutionWithheld", "imageIndependent", "replyResolvesRoot", "sourceContextPreserved"]
    .some(key => manual[key] !== true) || !manual.reviewedAt || !manual.reason?.trim()) fail("full-thread editorial review incomplete");
  const reader = review.independentReader;
  if (reader?.provider !== "gemini_web_headless") fail("independent blind reader missing");
  const inputText = fs.readFileSync(path.resolve(dir, reader.inputFile), "utf8");
  const responseText = fs.readFileSync(path.resolve(dir, reader.responseFile), "utf8");
  if (sha(inputText) !== reader.inputSha256 || sha(responseText) !== reader.responseSha256) fail("reader evidence changed");
  const input = JSON.parse(inputText);
  if (Object.keys(input).join() !== "items" || !Array.isArray(input.items)
    || input.items.some(item => Object.keys(item).sort().join() !== "id,root")
    || new Set(input.items.map(item => item.id)).size !== input.items.length) fail("reader input must contain roots only");
  const response = parseResponse(responseText);
  if (!Array.isArray(response.items) || new Set(response.items.map(item => item.id)).size !== response.items.length) fail("invalid reader response");
  const controlInput = input.items.find(item => item.id === reader.controlId);
  const control = response.items.find(item => item.id === reader.controlId);
  if (!controlInput || sha(controlInput.root) !== policy.regressionRootSha256 || control?.pass !== false) fail("known bad root calibration failed");
  if (input.items.find(item => item.id === reader.id)?.root !== post) fail("reader did not read the final root");
  const result = response.items.find(item => item.id === reader.id);
  if (!result || result.pass !== true || result.hasIncident !== true || result.readableWithoutReply !== true
    || result.needsImage !== false || result.identityOnlyTeaser !== false
    || !Array.isArray(result.prerequisites) || result.prerequisites.length
    || !result.rootSummary?.trim() || !result.readerQuestion?.trim()) fail("blind reader failed or returned contradictory findings");
  for (const key of ["actorEvidence", "settingEvidence", "incidentEvidence"]) {
    if (!normal(result[key]) || !normal(post).includes(normal(result[key]))) fail(`reader ${key} is not grounded in the root`);
  }
}
module.exports = { assertDailyStoryComprehensionReview };
