"use strict";
const fs = require("node:fs");
const path = require("node:path");

const legacySchedule = {
  dailyCount: 10, fictionCount: 5, aagagCount: 5,
  hoursKst: ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "00:00+1"],
  slotTypes: Array.from({ length: 10 }, (_, i) => i % 2 ? "curation" : "fiction"),
};
function scheduleFor(date, policy = legacySchedule) {
  let schedule = policy;
  while (schedule.effectiveOperatingDate && date < schedule.effectiveOperatingDate) {
    schedule = schedule.previousSchedule || legacySchedule;
  }
  return schedule;
}
function slotsFor(date, policy = legacySchedule) {
  const schedule = scheduleFor(date, policy);
  return schedule.hoursKst.map((time, i) => {
    const [clock, days = "0"] = time.split("+");
    return { operatingDate: date, slotNumber: i + 1, type: schedule.slotTypes[i],
      scheduledAt: new Date(Date.parse(`${date}T${clock}:00+09:00`) + Number(days) * 86400000).toISOString() };
  });
}
function slotAt(now = Date.now(), policy = legacySchedule) {
  const date = new Date(now + 9 * 3600000);
  if (date.getUTCHours() < 6) date.setUTCDate(date.getUTCDate() - 1);
  return slotsFor(date.toISOString().slice(0, 10), policy).findLast(slot =>
    now >= Date.parse(slot.scheduledAt) && now < Date.parse(slot.scheduledAt) + 3600000) || null;
}
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
function dailyStoryDirectory(root, key) {
  const match = /^daily-ten:(\d{4}-\d{2}-\d{2}):(\d{2})$/.exec(key);
  if (!match) throw new Error("Invalid daily story key");
  const base = fs.realpathSync(path.join(root, ".data/story-drafts/daily-ten"));
  const dir = fs.realpathSync(path.join(base, match[1], match[2]));
  if (!dir.startsWith(base + path.sep)) throw new Error("Story directory escapes daily content");
  return dir;
}
function dailyStoryMedia(root, key) {
  const dir = dailyStoryDirectory(root, key), source = readJson(path.join(dir, "source.json"));
  if (!source.rootMedia?.file) throw new Error("No root image");
  const file = fs.realpathSync(path.resolve(dir, source.rootMedia.file));
  if (!file.startsWith(dir + path.sep) || !fs.statSync(file).isFile()) throw new Error("Invalid root image path");
  return file;
}
function mergeDailyDashboardRows(rows, root, nowMs = Date.now(), { dispatchActive = true } = {}) {
  const byKey = new Map(rows.map(row => [row.canonicalUrl, row]));
  let history = [];
  try { history = readJson(path.join(root, "mirror-history.json")); } catch {}
  let plans = [];
  try { plans = readJson(path.join(root, ".data/story-drafts/daily-ten/lineup.json")).items || []; } catch {}
  for (const plan of plans) {
    if (!byKey.has(plan.key) && !["cancelled", "missed"].includes(plan.status)) byKey.set(plan.key, {
      canonicalUrl: plan.key, status: "scheduled", scheduledPostAt: plan.scheduledAt, discoveredAt: plan.createdAt,
      postedAt: null, xPostUrl: null, lastError: null,
    });
  }
  for (const [key, row] of byKey) {
    if (!key.startsWith("daily-ten:") && !key.startsWith("creative:")) continue;
    try {
      let dir;
      if (key.startsWith("daily-ten:")) dir = dailyStoryDirectory(root, key);
      else {
        const entry = history.find(item => item.canonicalUrl === key);
        const base = fs.realpathSync(path.join(root, ".data/story-drafts"));
        dir = fs.realpathSync(path.resolve(root, entry?.storyDir || ""));
        if (!dir.startsWith(base + path.sep)) throw new Error("Invalid archived story path");
      }
      const source = readJson(path.join(dir, "source.json"));
      const readText = name => { try { return fs.readFileSync(path.join(dir, name), "utf8").trim(); } catch { return ""; } };
      const body = readText("post.txt"), reply = readText("reply_01.txt");
      let receipt = {}; try { receipt = readJson(path.join(dir, "reply-receipt.json")); } catch {}
      const image = source.rootMedia?.file ? `/api/daily-stories/media?key=${encodeURIComponent(key)}` : "";
      const pendingReview = !source.review?.passed;
      const missed = row.status !== "posted" && Date.parse(row.scheduledPostAt) + 45 * 60000 < nowMs;
      // Stopped or missed lineup slots are not going to publish, so they leave the scheduled view.
      const status = row.status === "posted" || (dispatchActive && !missed) ? row.status : "review";
      byKey.set(key, { ...row, status, author: "terafabXai", textPreview: body.split("\n")[0] || source.title || "편성 원고 준비 중",
        mediaPreviewUrl: image, mediaCount: image ? 1 : 0, likeCount: 0, viralScore: 0,
        criteria: JSON.stringify({ source: "daily_publishing" }), scheduleDelivery: "local_post", canPost: false,
        story: { id: key, type: source.type, category: source.type === "curation" ? "curation" : "twist",
          body, replies: reply ? [reply] : [], replyFormat: "text", format: image ? "root_image_then_reply" : "root_text_then_reply",
          status: row.status === "posted" ? (receipt.url ? "posted" : "continuing") :
            Date.parse(row.scheduledPostAt) + 45 * 60000 < nowMs ? "missed" : pendingReview ? "preparing" : "planned",
          completedReplyCount: receipt.url ? 1 : 0, replyUrls: receipt.url ? [receipt.url] : [],
          sourceUrl: source.source?.url || null, operatingDate: source.operatingDate },
      });
    } catch { /* A missing archive must not hide an actual publication receipt. */ }
  }
  return [...byKey.values()];
}
module.exports = { legacySchedule, scheduleFor, slotsFor, slotAt, dailyStoryDirectory, dailyStoryMedia, mergeDailyDashboardRows };
