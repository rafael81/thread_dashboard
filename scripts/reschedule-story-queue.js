#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { planStoryReschedule, DAILY_STORY_LIMIT } = require("../lib/story-schedule");

const root = path.resolve(__dirname, "..");
const base = path.join(root, ".data/story-drafts");
const queuePath = path.join(base, "local-queue.json");
const historyPath = path.join(root, "mirror-history.json");
const policyPath = path.join(base, "operations-policy.json");
const backupDir = path.join(base, "2026-10-13-daily-15-reschedule-final");

function writeAtomic(filename, value) {
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(temporary, filename);
}

const queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
const history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
if (!Array.isArray(queue.items) || !Array.isArray(history)) throw new Error("Invalid queue or history");
const now = Date.now();
const externalReservations = history.filter(entry => entry.status === "scheduled"
  && !String(entry.canonicalUrl).startsWith("story:") && !entry.cancelledReason
  && Date.parse(entry.scheduledAt) > now).map(entry => {
  const local = new Date(Date.parse(entry.scheduledAt) + 9 * 3600000);
  if (local.getUTCHours() < 6) local.setUTCDate(local.getUTCDate() - 1);
  return { id: entry.canonicalUrl, scheduledAt: entry.scheduledAt, operatingDate: local.toISOString().slice(0, 10) };
});
const assignments = planStoryReschedule(queue.items, now, externalReservations);
const byId = new Map(queue.items.map(item => [item.id, item]));
const assigned = new Set(assignments.map(item => item.id));
if (assigned.size !== assignments.length) throw new Error("Duplicate reschedule assignment");
for (const assignment of assignments) {
  const row = byId.get(assignment.id);
  if (row.status !== "scheduled" || row.postUrl || row.intent || row.reviewRequired
    || row.scheduledAt !== assignment.from) throw new Error(`Story changed during planning: ${row.id}`);
  row.operatingDate = assignment.operatingDate;
  row.scheduledAt = assignment.scheduledAt;
  row.updatedAt = new Date(now).toISOString();
}
const future = queue.items.filter(item => item.status === "scheduled" && Date.parse(item.scheduledAt) > now);
if (future.length !== assignments.length) throw new Error("Some future reservations were not planned");
const perDay = new Map();
for (const row of queue.items.filter(item => !["cancelled", "deleted_by_user", "missed"].includes(item.status))) {
  perDay.set(row.operatingDate, (perDay.get(row.operatingDate) || 0) + 1);
}
for (const row of externalReservations) perDay.set(row.operatingDate, (perDay.get(row.operatingDate) || 0) + 1);
for (const [day, count] of perDay) {
  if (day >= new Date(now + 9 * 3600000).toISOString().slice(0, 10) && count > DAILY_STORY_LIMIT) {
    throw new Error(`Daily quota exceeded: ${day} = ${count}`);
  }
}
const uniqueTimes = new Set(future.map(item => item.scheduledAt));
if (uniqueTimes.size !== future.length || future.some(item => Date.parse(item.scheduledAt) <= now)) {
  throw new Error("Invalid future reservation times");
}
const historyByUrl = new Map(history.map((entry, index) => [entry.canonicalUrl, index]));
for (const row of future) {
  const entry = {
    canonicalUrl: `story:${row.id}`, status: "scheduled", scheduledAt: row.scheduledAt,
    postUrl: null, mediaCount: row.media.length, completedAt: new Date(now).toISOString(),
    scheduleDelivery: "local_post",
  };
  const index = historyByUrl.get(entry.canonicalUrl);
  if (index === undefined) {
    historyByUrl.set(entry.canonicalUrl, history.length);
    history.push(entry);
  } else {
    if (history[index].status === "posted" || history[index].postUrl) throw new Error(`History shows a posted story: ${row.id}`);
    history[index] = { ...history[index], ...entry };
  }
}
policy.dailyCount = DAILY_STORY_LIMIT;
policy.originalCount = DAILY_STORY_LIMIT - policy.curationCount;
policy.dailyLimitEffectiveDate = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
policy.dailyLimitE2EVerified = false;
policy.dailyLimitValidation = "Pending live dispatch E2E after rescheduling";
policy.updatedAt = new Date(now).toISOString();
if (policy.dailyContentMix) {
  policy.dailyContentMix.animeCount = DAILY_STORY_LIMIT;
  policy.dailyContentMix.twistCount = Math.floor(DAILY_STORY_LIMIT / 2);
  policy.dailyContentMix.generalAndCurationCount = DAILY_STORY_LIMIT - policy.dailyContentMix.twistCount;
  policy.dailyContentMix.carouselSuggestedPositions = [3, 8, 13];
  if (policy.dailyContentMix.recentIssueMix) policy.dailyContentMix.recentIssueMix.suggestedPositions = [3, 8, 13];
}
const summary = {
  plannedAt: new Date(now).toISOString(), limit: DAILY_STORY_LIMIT, count: assignments.length,
  externalReservations,
  first: assignments[0] || null, last: assignments.at(-1) || null,
  days: [...perDay].filter(([day]) => day >= policy.dailyLimitEffectiveDate).map(([day, count]) => ({ day, count })),
  assignments,
};
console.log(JSON.stringify({ plannedAt: summary.plannedAt, limit: summary.limit, count: summary.count,
  first: summary.first, last: summary.last, days: summary.days }, null, 2));
if (!process.argv.includes("--apply")) process.exit(0);
if (fs.existsSync(backupDir)) throw new Error(`Backup already exists: ${backupDir}`);
fs.mkdirSync(backupDir);
fs.copyFileSync(queuePath, path.join(backupDir, "local-queue.before.json"));
fs.copyFileSync(historyPath, path.join(backupDir, "mirror-history.before.json"));
fs.copyFileSync(policyPath, path.join(backupDir, "operations-policy.before.json"));
writeAtomic(queuePath, queue);
writeAtomic(historyPath, history);
writeAtomic(policyPath, policy);
writeAtomic(path.join(backupDir, "verification.json"), summary);
console.log(`Applied ${assignments.length} reservations; backup: ${backupDir}`);
