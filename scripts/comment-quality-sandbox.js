#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  assessTerafabxCurrentCommentPolicy,
  assessTerafabxLanguageQuality,
} = require("../mirror_server");

const root = path.resolve(__dirname, "..");
const state = JSON.parse(fs.readFileSync(path.join(root, ".data/terafabx-automation-state.json"), "utf8"));
const start = Date.parse(process.env.SANDBOX_START || "2026-07-12T14:33:10.000Z");
const end = Date.parse(process.env.SANDBOX_END || "2026-07-12T20:33:10.999Z");
const combined = [...(state.commentHistory || []), ...(state.ownPostReplyHistory || [])]
  .filter((item) => {
    const at = Date.parse(item.postedAt || item.at || 0);
    return at >= start && at <= end;
  });
const unique = [...new Map(combined.map((item) => [
  `${item.targetUrl}|${item.comment}|${item.postedAt || item.at}`,
  item,
])).values()];

const rows = unique.map((record) => {
  const judge = record.geminiReview?.finalJudge || {};
  const score = Number(judge.score ?? record.geminiReview?.score);
  const baselinePassed = judge.fatalError !== true
    && Number(judge.dimensions?.context) >= 30
    && score >= 85;
  const languageQuality = assessTerafabxLanguageQuality(
    record.comment,
    judge.reason || record.geminiReview?.reason || "",
  );
  const improved = assessTerafabxCurrentCommentPolicy(record);
  return {
    at: record.postedAt || record.at,
    targetUrl: record.targetUrl,
    comment: record.comment,
    score,
    baselinePassed,
    improvedPassed: improved.ok,
    newlyBlocked: baselinePassed && !improved.ok,
    issues: [...languageQuality.errors, ...languageQuality.styleWarnings],
    judgeReason: judge.reason || "",
  };
});

const report = {
  sandbox: true,
  postedCommentsMutated: false,
  range: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
  total: rows.length,
  baselinePassed: rows.filter((row) => row.baselinePassed).length,
  improvedPassed: rows.filter((row) => row.improvedPassed).length,
  newlyBlocked: rows.filter((row) => row.newlyBlocked).length,
  caughtKnownBad: rows.filter((row) => row.newlyBlocked && row.issues.length > 0).length,
  blockedRows: rows.filter((row) => row.newlyBlocked),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
