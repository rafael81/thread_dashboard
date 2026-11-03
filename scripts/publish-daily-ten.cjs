"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const base = path.join(root, ".data/story-drafts");
let policy;
const args = process.argv.slice(2);
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const normal = value => String(value || "").replace(/\s+/g, " ").trim();
const idOf = url => /aagag\.com\/issue\/\?idx=(\d+)/.exec(url || "")?.[1];
const { slotAt, slotsFor, scheduleFor } = require("../lib/daily-publishing");
const { assertDailyStoryMediaReview } = require("../lib/daily-story-media-review");
const { assertDailyStoryNarrativeReview } = require("../lib/daily-story-narrative-review");
const { assertDailyStoryComprehensionReview } = require("../lib/daily-story-comprehension-review");
function assertCurationFreshness(source, policy, { planning = false, alreadyPosted = false, now = Date.now() } = {}) {
  const rule = policy.curationFreshnessPolicy;
  if (planning || alreadyPosted || source.type !== "curation" || !rule?.enabled) return;
  const original = source.source?.originalStartedAt
    || (source.source?.originalStartedDate && `${source.source.originalStartedDate}T00:00:00+09:00`);
  const started = Date.parse(original);
  if (!Number.isFinite(started) || started > now || now - started > rule.originalStartMaxAgeHours * 3600000) {
    throw new Error("AAGAG original S: start must be verified within 48 hours; recent recirculation E: is insufficient");
  }
}
function runTool(name, dir) {
  const result = spawnSync(process.execPath, [path.join(base, "daily-ten-tools", name), dir], { cwd: root, stdio: "inherit", timeout: 150000 });
  if (result.status !== 0) throw new Error(`${name} failed; inspect receipts and X before retrying: ${result.error?.message || result.status}`);
}
function main() {
  policy = read(path.join(base, "daily-ten-policy.json"));
  const due = slotAt(Date.now(), policy);
  if (args[0] === "status") {
    console.log(JSON.stringify({ policy, due, eligible: policy.enabled && due?.operatingDate >= policy.firstOperatingDate }, null, 2));
    return;
  }
  const mode = args[0], dir = fs.realpathSync(path.resolve(root, args[1] || "."));
  if (!["plan-check", "check", "publish", "verify"].includes(mode)) throw new Error("Usage: node scripts/publish-daily-ten.cjs status | plan-check/check/publish/verify STORY_DIR");
  if (!dir.startsWith(fs.realpathSync(base) + path.sep)) throw new Error("Story directory must be under .data/story-drafts");
  const source = read(path.join(dir, "source.json"));
  if (mode === "verify") { runTool("verify-thread.cjs", dir); return; }
  const planning = mode === "plan-check";
  const expected = planning ? slotsFor(source.operatingDate, policy).find(slot => slot.slotNumber === source.slotNumber) : due;
  const schedule = scheduleFor(source.operatingDate, policy);
  if (!policy.enabled || !expected || expected.operatingDate < policy.firstOperatingDate) throw new Error("Daily publishing is disabled or has not started yet");
  if (source.operatingDate !== expected.operatingDate || source.slotNumber !== expected.slotNumber || source.type !== expected.type || (source.scheduledAt && source.scheduledAt !== expected.scheduledAt)) throw new Error("Story does not match the expected slot/type/time");
  if (!planning && Date.now() - Date.parse(expected.scheduledAt) > 45 * 60000) throw new Error("Slot is more than 45 minutes late; do not burst-post missed slots");
  const post = fs.readFileSync(path.join(dir, "post.txt"), "utf8").trim();
  const reply = fs.readFileSync(path.join(dir, "reply_01.txt"), "utf8").trim();
  if (!post || !reply || !source.review?.passed || !source.review?.rootQuestion || !source.review?.replyResolution) throw new Error("Complete reviewed root and ending reply are required");
  const sha = text => crypto.createHash("sha256").update(text).digest("hex");
  if ((source.review.postSha256 && source.review.postSha256 !== sha(post)) || (source.review.replySha256 && source.review.replySha256 !== sha(reply))) throw new Error("Reviewed draft changed; review the exact text again");
  if (source.type === "curation" && (!idOf(source.source?.url) || !source.source?.popularityCheckedAt || !source.source?.contentVerifiedAt || !source.source?.evidenceFile || !fs.existsSync(path.resolve(dir, source.source.evidenceFile)))) throw new Error("AAGAG curation needs original URL, popularity/content checks, and saved evidence");
  if (!planning && source.publicationRecheckRequired && (source.source?.publicationRecheckedAt == null || Date.now() - Date.parse(source.source.publicationRecheckedAt) > 45 * 60000 || !Number.isFinite(Date.parse(source.source.publicationRecheckedAt)))) throw new Error("Preplanned AAGAG needs a fresh live popularity/content recheck before publication");
  const key = `daily-ten:${source.operatingDate}:${String(source.slotNumber).padStart(2, "0")}`;
  assertDailyStoryMediaReview(root, key, source);
  const history = read(path.join(root, "mirror-history.json"));
  const owned = history.find(item => item.canonicalUrl === key);
  const receiptFile = path.join(dir, "root-receipt.json");
  assertDailyStoryNarrativeReview({ policy: policy.narrativePolicy, alreadyPosted: Boolean(owned), source, post, reply, dir });
  assertDailyStoryComprehensionReview({ policy: policy.editorialQualityPolicy, alreadyPosted: Boolean(owned), source, post, reply, dir });
  assertCurationFreshness(source, policy, { planning, alreadyPosted: Boolean(owned) });
  if (owned && (!fs.existsSync(receiptFile) || read(receiptFile).url !== owned.postUrl)) throw new Error("This slot already has a different or uncheckpointed root; reconcile instead of reposting");
  const start = Date.parse(`${source.operatingDate}T06:00:00+09:00`), end = start + 24 * 3600000;
  const today = history.filter(item => item.status === "posted" && item.postUrl && Date.parse(item.completedAt) >= start && Date.parse(item.completedAt) < end);
  if (!owned && today.length >= schedule.dailyCount) throw new Error("Daily root post limit reached");
  if (!owned && today.filter(item => item.operatingDate === source.operatingDate && item.type === source.type && item.dailyTenSlot).length >= (source.type === "fiction" ? schedule.fictionCount : schedule.aagagCount)) throw new Error("Daily type limit reached");
  const textHash = crypto.createHash("sha256").update(post).digest("hex");
  if (history.some(item => item.canonicalUrl !== key && (item.textSha256 === textHash || (source.type === "curation" && idOf(item.sourceUrl || item.canonicalUrl) === idOf(source.source.url))))) throw new Error("Duplicate text or AAGAG source");
  const queue = read(path.join(base, "local-queue.json"));
  if (queue.items.some(item => normal(item.text) === normal(post) || (source.type === "curation" && idOf(item.sourceUrl) === idOf(source.source.url)))) throw new Error("Story already exists in legacy queue");
  console.log(JSON.stringify({ ok: true, due: expected, existingRoot: owned?.postUrl || null, dailyPosted: today.length, mode }));
  if (mode === "check" || planning) return;
  const lockFile = path.join(base, "daily-ten-publish.lock");
  const lock = fs.openSync(lockFile, "wx");
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), key })); fs.closeSync(lock);
  try {
    if (!fs.existsSync(receiptFile)) {
      if (fs.existsSync(path.join(dir, "root-submit-intent.json"))) throw new Error("Unconfirmed root submission exists; reconcile X before retrying");
      runTool("publish-root.cjs", dir);
    }
    if (!fs.existsSync(path.join(dir, "reply-receipt.json"))) runTool("publish-reply.cjs", dir);
    runTool("verify-thread.cjs", dir);
    const rootReceipt = read(receiptFile), replyReceipt = read(path.join(dir, "reply-receipt.json"));
    const proof = read(path.join(dir, "thread-x-verification.json"));
    const liveRoot = proof.tweets.find(item => item.id === rootReceipt.id);
    const live = proof.tweets.find(item => item.id === replyReceipt.id);
    if (proof.state?.profile?.toLowerCase() !== "/terafabxai" || !liveRoot || liveRoot.parentId || liveRoot.text !== post || rootReceipt.text !== post || liveRoot.mediaCount !== (source.rootMedia ? 1 : 0)) throw new Error("Live X root account/text/media verification failed; reconcile without resending");
    if (!live || live.parentId !== rootReceipt.id || live.text !== replyReceipt.text || replyReceipt.text !== reply) throw new Error("Live X reply text or parent verification failed; reconcile without resending");
    const latest = read(path.join(root, "mirror-history.json")), entry = latest.find(item => item.canonicalUrl === key);
    if (!entry) throw new Error("Root history checkpoint missing");
    Object.assign(entry, { replyUrls: [replyReceipt.url], replyReceipts: [replyReceipt], threadCompletedAt: replyReceipt.verifiedAt });
    const temporary = path.join(root, "mirror-history.json.daily-ten.tmp");
    fs.writeFileSync(temporary, JSON.stringify(latest, null, 2) + "\n"); fs.renameSync(temporary, path.join(root, "mirror-history.json"));
    fs.writeFileSync(path.join(dir, "final-verification.json"), JSON.stringify({ verifiedAt: new Date().toISOString(), postUrl: rootReceipt.url, replyUrl: replyReceipt.url, parentMatches: true, textMatches: true, rootTextMatches: true, rootMediaCount: liveRoot.mediaCount, account: "terafabXai", operatingDate: source.operatingDate, slotNumber: source.slotNumber, type: source.type }, null, 2) + "\n");
    console.log(JSON.stringify({ posted: true, postUrl: rootReceipt.url, replyUrl: replyReceipt.url }));
  } finally { fs.unlinkSync(lockFile); }
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { slotAt, assertCurationFreshness };
