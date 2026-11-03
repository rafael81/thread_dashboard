"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { assertDailyStoryComprehensionReview: check } = require("../lib/daily-story-comprehension-review");
const sha = s => createHash("sha256").update(s).digest("hex");
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "story-reader-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const post = "내 친구가 식당 계산대에서 내게 밥값 전부를 내라고 했음.";
  const reply = "각자 먹은 값을 내기로 한 메시지를 보여줬음.";
  const policy = { enabled: true, version: "v1", effectiveOperatingDate: "2026-10-31", types: ["fiction", "curation"], regressionRootSha256: sha("누군지 맞혀봐") };
  const source = { type: "fiction", operatingDate: "2026-10-31", editorialQualityVersion: "v1" };
  const input = { items: [{ id: "A", root: post }, { id: "BAD", root: "누군지 맞혀봐" }] };
  const output = { items: [{ id: "A", pass: true, hasIncident: true, readableWithoutReply: true, needsImage: false, identityOnlyTeaser: false, prerequisites: [], rootSummary: "친구의 대납 요구", readerQuestion: "나는 어떻게 대응했나?", actorEvidence: "내 친구가", settingEvidence: "식당 계산대", incidentEvidence: "밥값 전부를 내라고 했음" }, { id: "BAD", pass: false }] };
  const review = { version: "v1", passed: true, postSha256: sha(post), replySha256: sha(reply), eligibility: { kind: "human_incident", passed: true, reason: "구체적 대납 요구" }, manual: { rootSelfContained: true, onlyResolutionWithheld: true, imageIndependent: true, replyResolvesRoot: true, sourceContextPreserved: true, reviewedAt: new Date().toISOString(), reason: "요구와 거절의 연결 확인" }, independentReader: { provider: "gemini_web_headless", inputFile: "input.json", responseFile: "output.json", id: "A", controlId: "BAD" } };
  const save = () => {
    fs.writeFileSync(path.join(dir, "input.json"), JSON.stringify(input));
    fs.writeFileSync(path.join(dir, "output.json"), JSON.stringify(output));
    review.independentReader.inputSha256 = sha(JSON.stringify(input));
    review.independentReader.responseSha256 = sha(JSON.stringify(output));
    fs.writeFileSync(path.join(dir, "comprehension-review.json"), JSON.stringify(review));
  };
  save();
  return { args: { policy, source, post, reply, dir }, input, output, review, save };
}
test("a grounded blind review permits a self-contained story", t => {
  const f = fixture(t); assert.doesNotThrow(() => check(f.args));
});
test("an unedited JSON array response retains every reader and calibration gate", t => {
  const f = fixture(t);
  const saveArray = () => {
    const raw = "JSON\n" + JSON.stringify(f.output.items);
    fs.writeFileSync(path.join(f.args.dir, "output.json"), raw);
    f.review.independentReader.responseSha256 = sha(raw);
    fs.writeFileSync(path.join(f.args.dir, "comprehension-review.json"), JSON.stringify(f.review));
    return raw;
  };
  const original = saveArray();
  assert.doesNotThrow(() => check(f.args));
  assert.equal(fs.readFileSync(path.join(f.args.dir, "output.json"), "utf8"), original);
  delete f.output.items[0].identityOnlyTeaser; saveArray();
  assert.throws(() => check(f.args), /blind reader failed/);
  f.output.items[0].identityOnlyTeaser = false;
  f.output.items[0].pass = false; saveArray();
  assert.throws(() => check(f.args), /blind reader failed/);
  f.output.items[0].pass = true; f.output.items[1].pass = true; saveArray();
  assert.throws(() => check(f.args), /calibration failed/);
});
test("reader pass cannot override contradictory incident or image findings", t => {
  const f = fixture(t);
  for (const change of [{ hasIncident: false }, { needsImage: true }, { identityOnlyTeaser: true }, { prerequisites: ["게임 지식"] }]) {
    const original = { ...f.output.items[0] };
    Object.assign(f.output.items[0], change); f.save();
    assert.throws(() => check(f.args), /blind reader failed/);
    f.output.items[0] = original;
  }
});
test("editing either final text invalidates the review", t => {
  const f = fixture(t);
  assert.throws(() => check({ ...f.args, post: f.args.post + " 수정" }), /exact final/);
  assert.throws(() => check({ ...f.args, reply: f.args.reply + " 수정" }), /exact final/);
});
test("visual gags are rejected even when a model marked them passed", t => {
  const f = fixture(t); f.review.eligibility.kind = "visual_gag"; f.save();
  assert.throws(() => check(f.args), /not a suitable/);
});
test("reader inputs cannot leak endings and calibration must reject known bad root", t => {
  const f = fixture(t); f.input.items[0].reply = f.args.reply; f.save();
  assert.throws(() => check(f.args), /roots only/);
  delete f.input.items[0].reply; f.output.items[1].pass = true; f.save();
  assert.throws(() => check(f.args), /calibration failed/);
});
test("unverified or invented reader evidence fails closed; existing roots remain recoverable", t => {
  const f = fixture(t); f.output.items[0].incidentEvidence = "없는 대사"; f.save();
  assert.throws(() => check(f.args), /not grounded/);
  assert.doesNotThrow(() => check({ ...f.args, alreadyPosted: true }));
  fs.unlinkSync(path.join(f.args.dir, "comprehension-review.json"));
  assert.throws(() => check(f.args), /ENOENT/);
});
test("a passed reader cannot omit or compose a setting quote; existing-root recovery is preserved", t => {
  const f = fixture(t);
  for (const value of [undefined, "", "식당 앞 계산대", "식당 / 계산대"]) {
    if (value === undefined) delete f.output.items[0].settingEvidence;
    else f.output.items[0].settingEvidence = value;
    f.save();
    assert.throws(() => check(f.args), /settingEvidence is not grounded/);
    assert.doesNotThrow(() => check({ ...f.args, alreadyPosted: true }));
  }
  f.output.items[0].settingEvidence = "식당 계산대"; f.save();
  assert.doesNotThrow(() => check(f.args));
});
test("the actual incomprehensible published root is rejected as a new candidate", t => {
  const dir = path.resolve(__dirname, "../.data/story-drafts/editorial-comprehension-2026-10-31");
  if (!fs.existsSync(path.join(dir, "root-reader-input.json"))) return t.skip("local editorial evidence unavailable");
  const input = JSON.parse(fs.readFileSync(path.join(dir, "root-reader-input.json"), "utf8"));
  const text = fs.readFileSync(path.join(dir, "root-reader-response.txt"), "utf8");
  const output = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  const bad = input.items.find(item => item.id === "R24");
  assert.ok(bad.root.includes("ZETTERIA"));
  const result = output.items.find(item => item.id === "R24");
  assert.equal(result.pass, false); assert.equal(result.identityOnlyTeaser, true);
});
