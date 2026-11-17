"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { assertDailyStoryHookReview: check, isDialogueOpening } = require("../lib/daily-story-hook-review");
const sha = s => createHash("sha256").update(s).digest("hex");
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "story-hook-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const post = "윗집 문을 두드렸더니 아저씨도 쪽지를 들고 서 있었음.";
  const reply = "아저씨 쪽지에도 새벽 2시 쿵 소리 얘기가 적혀 있었음.\n범인은 내 로봇청소기였음.";
  const policy = {
    enabled: true, version: "v1", effectiveOperatingDate: "2026-11-02", types: ["fiction"],
    endingTypeMaxPerDay: { reversal: 2, self_own: 1, punchline: 2, polite_refusal: 1 },
    dialogueOpeningEndingTypes: ["punchline", "polite_refusal"], maxDialogueOpeningsPerDay: 2,
  };
  const source = { type: "fiction", operatingDate: "2026-11-05" };
  const readerInput = { items: [{ id: "A", root: post }] };
  const readerOutput = { items: [{ id: "A", predictedEnding: "아저씨가 사과하고 조용히 하기로 함" }] };
  const judgeInput = { items: [{ id: "A", predictedEnding: readerOutput.items[0].predictedEnding, reply }] };
  const judgeOutput = { items: [{ id: "A", matches: false, reason: "실제 결말은 내가 범인이라는 반전" }] };
  const review = {
    version: "v1", passed: true, postSha256: sha(post), replySha256: sha(reply), endingType: "self_own",
    manual: { rootEndsOnConcreteMoment: true, stakesConcrete: true, lastLineIsPayoff: true, reviewedAt: new Date().toISOString(), reason: "쪽지 반전에서 끊김" },
    predictionReader: { provider: "gemini_web_headless", inputFile: "reader-in.json", responseFile: "reader-out.json", id: "A" },
    predictionJudge: { provider: "gemini_web_headless", inputFile: "judge-in.json", responseFile: "judge-out.json", id: "A" },
  };
  const save = () => {
    for (const [file, value, block, field] of [
      ["reader-in.json", readerInput, review.predictionReader, "inputSha256"],
      ["reader-out.json", readerOutput, review.predictionReader, "responseSha256"],
      ["judge-in.json", judgeInput, review.predictionJudge, "inputSha256"],
      ["judge-out.json", judgeOutput, review.predictionJudge, "responseSha256"],
    ]) {
      fs.writeFileSync(path.join(dir, file), JSON.stringify(value));
      block[field] = sha(JSON.stringify(value));
    }
    fs.writeFileSync(path.join(dir, "hook-review.json"), JSON.stringify(review));
  };
  save();
  return { args: { policy, source, post, reply, dir, key: "daily-ten:2026-11-05:01", siblings: [] }, readerInput, judgeOutput, review, save };
}
test("an unpredictable outcome-first ending passes", t => {
  const f = fixture(t); assert.doesNotThrow(() => check(f.args));
});
test("a blind reader who predicted the ending blocks the story", t => {
  const f = fixture(t); f.judgeOutput.items[0].matches = true; f.save();
  assert.throws(() => check(f.args), /predicted the ending/);
});
test("editing either final text invalidates the review", t => {
  const f = fixture(t);
  assert.throws(() => check({ ...f.args, post: f.args.post + " 수정" }), /exact final/);
  assert.throws(() => check({ ...f.args, reply: f.args.reply + " 수정" }), /exact final/);
});
test("quoted-line openings are rejected for outcome-first ending types", t => {
  const f = fixture(t);
  const reply = "“제 예약부터 할게요. 그건 따로 부탁하세요.”\n이웃이 연락처를 물었음.";
  f.review.replySha256 = sha(reply); f.review.endingType = "reversal"; f.save();
  assert.throws(() => check({ ...f.args, reply }), /must open with the outcome scene/);
  assert.equal(isDialogueOpening(reply), true);
  assert.equal(isDialogueOpening(f.args.reply), false);
});
test("per-day caps limit ending types and quoted-line openings", t => {
  const f = fixture(t);
  assert.throws(() => check({ ...f.args, siblings: [{ key: "daily-ten:2026-11-05:02", endingType: "self_own", reply: "결과 장면" }] }), /too many self_own/);
  assert.doesNotThrow(() => check({ ...f.args, siblings: [{ key: f.args.key, endingType: "self_own", reply: "자기 자신" }] }));
  const quoted = ["03", "04", "05"].map(n => ({ key: `daily-ten:2026-11-05:${n}`, endingType: "punchline", reply: "“한 줄 펀치”" }));
  assert.throws(() => check({ ...f.args, siblings: quoted }), /too many quoted-line/);
});
test("prediction input must contain roots only and match the final root", t => {
  const f = fixture(t); f.readerInput.items[0].reply = f.args.reply; f.save();
  assert.throws(() => check(f.args), /roots only/);
  delete f.readerInput.items[0].reply; f.readerInput.items[0].root = "다른 원글"; f.save();
  assert.throws(() => check(f.args), /did not read the final root/);
});
test("unknown types, missing manual checks and tampered evidence fail closed", t => {
  const f = fixture(t); f.review.endingType = "moral"; f.save();
  assert.throws(() => check(f.args), /unknown ending type/);
  f.review.endingType = "self_own"; f.review.manual.lastLineIsPayoff = false; f.save();
  assert.throws(() => check(f.args), /manual hook review incomplete/);
  f.review.manual.lastLineIsPayoff = true; f.save();
  fs.writeFileSync(path.join(f.args.dir, "judge-out.json"), JSON.stringify({ items: [{ id: "A", matches: false, reason: "변경" }] }));
  assert.throws(() => check(f.args), /evidence changed/);
});
test("posted roots, earlier dates and disabled policy bypass the gate", t => {
  const f = fixture(t); f.judgeOutput.items[0].matches = true; f.save();
  assert.doesNotThrow(() => check({ ...f.args, alreadyPosted: true }));
  assert.doesNotThrow(() => check({ ...f.args, source: { ...f.args.source, operatingDate: "2026-11-01" } }));
  assert.doesNotThrow(() => check({ ...f.args, policy: { ...f.args.policy, enabled: false } }));
});
