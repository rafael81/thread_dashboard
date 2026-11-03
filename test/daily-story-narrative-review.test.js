"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), { createHash } = require("node:crypto");
const { assertDailyStoryNarrativeReview } = require("../lib/daily-story-narrative-review");
function setup(t, type = "curation") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "story-narrative-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const policy = { enabled: true, effectiveOperatingDate: "2026-10-31", version: "all-v1", types: ["fiction", "curation"] };
  const post = "내가 물건을 내놨는데 이상한 답장이 왔음.", reply = "상대가 자기 메시지를 내 답장으로 착각했음.";
  const source = { type, operatingDate: "2026-11-01", narrativePolicyVersion: policy.version, narrativePerspective: "first_person_participant", narratorRole: "판매자인 나", originalFiction: type === "fiction", source: { url: "https://aagag.com/issue/?idx=123" }, sourceAdaptation: { sourceFactsPreserved: true, noRealExperienceCertification: true, baseSourceUrl: "https://aagag.com/issue/?idx=123" } };
  const sha = s => createHash("sha256").update(s).digest("hex");
  fs.writeFileSync(path.join(dir, "first-person-review.json"), JSON.stringify({ passed: true, noThirdPartyRetelling: true, narrativePolicyVersion: policy.version, postSha256: sha(post), replySha256: sha(reply) }));
  return { policy, source, post, reply, dir };
}
test("applies participant narration to both fiction and source adaptations", t => {
  for (const type of ["fiction", "curation"]) assert.doesNotThrow(() => assertDailyStoryNarrativeReview(setup(t, type)));
});
test("curation cannot bypass the participant rule or discard source attribution", t => {
  const x = setup(t); x.source.narrativePerspective = "third_person";
  assert.throws(() => assertDailyStoryNarrativeReview(x), /All story types/);
  x.source.narrativePerspective = "first_person_participant"; x.source.sourceAdaptation.baseSourceUrl = "other";
  assert.throws(() => assertDailyStoryNarrativeReview(x), /retain its source/);
});
test("rejects edits to either reviewed manuscript", t => {
  const x = setup(t);
  assert.throws(() => assertDailyStoryNarrativeReview({ ...x, post: x.post + " 수정" }), /fresh first-person review/);
  assert.throws(() => assertDailyStoryNarrativeReview({ ...x, reply: x.reply + " 수정" }), /fresh first-person review/);
});
test("published manuscripts remain protected from later editorial rules", t => {
  const x = setup(t); x.source.narrativePerspective = "third_person";
  assert.doesNotThrow(() => assertDailyStoryNarrativeReview({ ...x, alreadyPosted: true }));
});
test("rejects the reported curation summary framing even with matching hashes", t => {
  const x = setup(t); x.post = "중고 거래를 하다 오해했다는 글이 있음";
  const file = path.join(x.dir, "first-person-review.json"), review = JSON.parse(fs.readFileSync(file));
  review.postSha256 = createHash("sha256").update(x.post).digest("hex"); fs.writeFileSync(file, JSON.stringify(review));
  assert.throws(() => assertDailyStoryNarrativeReview(x), /source-summary framing/);
});
