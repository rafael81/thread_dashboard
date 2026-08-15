#!/usr/bin/env node
/**
 * 10-minute quality monitor for home-verified live/prefill.
 * Writes tick JSON under OUT_DIR (default: .data/experiments/home-verified-monitor).
 *
 * Usage:
 *   node scripts/hvc-quality-monitor.js
 *   HVC_MONITOR_INTERVAL_MS=600000 HVC_MONITOR_TICKS=3 node scripts/hvc-quality-monitor.js
 *   HVC_MONITOR_OUT=/path node scripts/hvc-quality-monitor.js
 */
const fs = require("fs");
const path = require("path");
const {
  isHomeVerifiedGreetingOnlyReply,
  isHomeVerifiedForeignLanguageDominant,
  homeVerifiedJudgeHardFail,
} = require("../lib/home-verified-comment");

const ROOT = path.resolve(__dirname, "..");
const API = process.env.HVC_API || "http://127.0.0.1:4131/api/terafabx/home-verified-comment";
const INTERVAL_MS = Math.max(30_000, Number(process.env.HVC_MONITOR_INTERVAL_MS || 10 * 60 * 1000));
const TICKS = Math.max(1, Number(process.env.HVC_MONITOR_TICKS || 12));
const OUT = process.env.HVC_MONITOR_OUT
  || path.join(ROOT, ".data", "experiments", "home-verified-monitor");

function grade(comment) {
  const c = String(comment || "");
  if (isHomeVerifiedGreetingOnlyReply(c)) return "C";
  if (/^진짜\s/.test(c) && (c.match(/진짜/g) || []).length >= 2) return "C";
  if (/확률 싸움|부담은 약한|피곤하게 구네|선 넘었|분홍이/.test(c)) return "D";
  if (c.length >= 12 && c.length <= 32) return "A";
  return "B";
}

async function api(action, body = {}) {
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function loadLocal() {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(ROOT, ".data", "terafabx-automation-state.json"), "utf8"));
    const q = JSON.parse(fs.readFileSync(path.join(ROOT, ".data", "terafabx-home-verified-comment-write-queue.json"), "utf8"));
    const hist = (state.homeVerifiedCommentHistory || []).slice(0, 25).map((h) => ({
      at: h.at,
      author: h.authorHandle,
      comment: h.comment,
      grade: grade(h.comment),
      replyUrl: h.replyUrl,
    }));
    const counts = { A: 0, B: 0, C: 0, D: 0 };
    for (const r of hist) counts[r.grade] = (counts[r.grade] || 0) + 1;
    const patterns = {
      greeting: hist.filter((r) => isHomeVerifiedGreetingOnlyReply(r.comment)).length,
      leadingJinzza: hist.filter((r) => /^진짜\s/.test(String(r.comment || ""))).length,
      multiJinzza: hist.filter((r) => (String(r.comment || "").match(/진짜/g) || []).length >= 2).length,
    };
    return {
      queueN: q.length,
      queueSample: q.slice(0, 8).map((r) => ({
        a: r.authorHandle,
        s: r.status,
        c: r.prepared?.comment,
        hard: homeVerifiedJudgeHardFail(r.prepared?.geminiReview?.finalJudge || { passed: true }, r.prepared?.comment || ""),
      })),
      histCounts: counts,
      patterns,
      recent: hist.slice(0, 12),
    };
  } catch (e) {
    return { error: e.message };
  }
}

function findRecurringPattern(local) {
  const p = local.patterns || {};
  if ((p.greeting || 0) >= 2) return { kind: "greeting_template", n: p.greeting };
  if ((p.leadingJinzza || 0) >= 4) return { kind: "leading_jinzza", n: p.leadingJinzza };
  if ((local.histCounts?.C || 0) + (local.histCounts?.D || 0) >= 5) {
    return { kind: "high_cd_ratio", n: (local.histCounts.C || 0) + (local.histCounts.D || 0) };
  }
  return null;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`hvc-quality-monitor ticks=${TICKS} intervalMs=${INTERVAL_MS} out=${OUT}`);
  for (let i = 1; i <= TICKS; i += 1) {
    const started = Date.now();
    const status = await api("status");
    const local = loadLocal();
    const pattern = findRecurringPattern(local);
    const tick = {
      tick: i,
      at: new Date().toISOString(),
      statusOk: status.ok,
      statusError: status.error || null,
      daily: status.result?.daily || null,
      enabled: status.result?.enabled,
      prefillOnly: status.result?.prefillOnly,
      pending: status.result?.pendingCount,
      backlog: status.result?.backlogCount,
      local,
      pattern,
    };
    const tickPath = path.join(OUT, `hvc-monitor-tick-${Date.now()}.json`);
    fs.writeFileSync(tickPath, JSON.stringify(tick, null, 2));
    fs.writeFileSync(path.join(OUT, "hvc-monitor-latest.json"), JSON.stringify(tick, null, 2));
    console.log(
      `[${i}/${TICKS}] posted=${tick.daily?.postedToday}/${tick.daily?.dailyTarget}`
      + ` pending=${tick.pending} backlog=${tick.backlog}`
      + ` grades=${JSON.stringify(local.histCounts || {})}`
      + ` pattern=${pattern ? pattern.kind : "-"}`
      + ` file=${path.basename(tickPath)}`,
    );
    if (i < TICKS) {
      const wait = Math.max(0, INTERVAL_MS - (Date.now() - started));
      await new Promise((r) => setTimeout(r, wait));
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
