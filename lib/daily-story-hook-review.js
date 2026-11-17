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

// The 2026-11-02~04 lineup opened 37 of 44 endings with a quoted line ("제 건 제가 할게요. 그건 따로 부탁하세요."),
// so the reader already knew the reply. Outcome-first endings open with a scene instead.
function isDialogueOpening(reply) {
  const first = normal(String(reply || "").split(/\n/).find(line => line.trim()) || "");
  return /^[“"‘'「『]/.test(first);
}

function readEvidence(dir, block, label, fail) {
  if (block?.provider !== "gemini_web_headless") fail(`${label} independent reader missing`);
  const inputText = fs.readFileSync(path.resolve(dir, block.inputFile), "utf8");
  const responseText = fs.readFileSync(path.resolve(dir, block.responseFile), "utf8");
  if (sha(inputText) !== block.inputSha256 || sha(responseText) !== block.responseSha256) fail(`${label} evidence changed`);
  const response = parseResponse(responseText);
  if (!Array.isArray(response.items) || new Set(response.items.map(item => item.id)).size !== response.items.length) fail(`invalid ${label} response`);
  return { input: JSON.parse(inputText), response };
}

function assertDailyStoryHookReview({ policy, alreadyPosted, source, post, reply, dir, key, siblings = [] }) {
  if (!policy?.enabled || alreadyPosted || source.operatingDate < policy.effectiveOperatingDate
    || !policy.types?.includes(source.type)) return;
  const fail = message => { throw new Error(`Story hook review: ${message}`); };
  const review = JSON.parse(fs.readFileSync(path.join(dir, "hook-review.json"), "utf8"));
  if (review.version !== policy.version || review.passed !== true
    || review.postSha256 !== sha(post) || review.replySha256 !== sha(reply)) {
    fail("exact final root and ending reply need a current passed hook review");
  }
  const max = policy.endingTypeMaxPerDay || {};
  if (!Object.hasOwn(max, review.endingType)) fail(`unknown ending type ${review.endingType}`);
  const manual = review.manual;
  if (!manual || ["rootEndsOnConcreteMoment", "stakesConcrete", "lastLineIsPayoff"]
    .some(key => manual[key] !== true) || !manual.reviewedAt || !manual.reason?.trim()) fail("manual hook review incomplete");
  if (isDialogueOpening(reply) && !policy.dialogueOpeningEndingTypes?.includes(review.endingType)) {
    fail(`${review.endingType} ending must open with the outcome scene, not a quoted line`);
  }

  // Blind prediction: a reader sees only the root and guesses the ending in one line.
  const prediction = readEvidence(dir, review.predictionReader, "prediction", fail);
  if (Object.keys(prediction.input).join() !== "items" || !Array.isArray(prediction.input.items)
    || prediction.input.items.some(item => Object.keys(item).sort().join() !== "id,root")) fail("prediction input must contain roots only");
  if (prediction.input.items.find(item => item.id === review.predictionReader.id)?.root !== post) fail("prediction reader did not read the final root");
  const predicted = prediction.response.items.find(item => item.id === review.predictionReader.id);
  if (!normal(predicted?.predictedEnding)) fail("prediction reader returned no predicted ending");

  // A separate judge compares that guess with the real reply; a match means the ending is predictable.
  const judge = readEvidence(dir, review.predictionJudge, "prediction judge", fail);
  const judged = judge.input.items?.find(item => item.id === review.predictionJudge.id);
  if (!judged || normal(judged.predictedEnding) !== normal(predicted.predictedEnding) || judged.reply !== reply) {
    fail("prediction judge must compare the recorded prediction with the final reply");
  }
  const verdict = judge.response.items.find(item => item.id === review.predictionJudge.id);
  if (typeof verdict?.matches !== "boolean" || !normal(verdict.reason)) fail("prediction judge returned no verdict");
  if (verdict.matches) fail("blind reader predicted the ending; rewrite the root or the ending");

  // Same-day variety across the remaining lineup.
  const sameDay = siblings.filter(item => item.key !== key);
  const sameType = sameDay.filter(item => item.endingType === review.endingType).length;
  if (sameType + 1 > max[review.endingType]) fail(`too many ${review.endingType} endings on ${source.operatingDate}`);
  const dialogue = sameDay.filter(item => isDialogueOpening(item.reply)).length + (isDialogueOpening(reply) ? 1 : 0);
  if (dialogue > policy.maxDialogueOpeningsPerDay) fail(`too many quoted-line reply openings on ${source.operatingDate}`);
}

module.exports = { assertDailyStoryHookReview, isDialogueOpening };
