#!/usr/bin/env node
/**
 * P2: recent home-verified history A–D style flags (heuristic sample report).
 * Usage: node scripts/hvc-quality-sample-report.js [limit]
 */
const fs = require("fs");
const path = require("path");
const {
  isHomeVerifiedGreetingOnlyReply,
  isHomeVerifiedForeignLanguageDominant,
} = require("../lib/home-verified-comment");

const root = path.resolve(__dirname, "..");
const statePath = path.join(root, ".data", "terafabx-automation-state.json");
const limit = Math.max(5, Number(process.argv[2] || 30));

function gradeComment(comment, targetText = "") {
  const c = String(comment || "");
  if (/분홍|없는 색|환각/.test(c)) return "D";
  if (isHomeVerifiedGreetingOnlyReply(c)) return "C";
  if (/^(진짜)\s/.test(c) && (c.match(/진짜/g) || []).length >= 2) return "C";
  if (isHomeVerifiedForeignLanguageDominant(targetText)) return "D";
  if (/확률 싸움|부담은 약한|피곤하게 구네|선 넘었/.test(c)) return "D";
  if (c.length >= 12 && c.length <= 30 && !isHomeVerifiedGreetingOnlyReply(c)) return "A";
  return "B";
}

function main() {
  if (!fs.existsSync(statePath)) {
    console.log(JSON.stringify({ ok: false, error: "no state" }));
    process.exit(1);
  }
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const hist = (state.homeVerifiedCommentHistory || []).slice(0, limit);
  const rows = hist.map((h) => {
    const comment = h.comment || h.prepared?.comment || "";
    const targetText = h.targetText || h.prepared?.targetText || "";
    return {
      at: h.at,
      author: h.authorHandle,
      comment,
      grade: gradeComment(comment, targetText),
      replyUrl: h.replyUrl,
    };
  });
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const r of rows) counts[r.grade] = (counts[r.grade] || 0) + 1;
  const out = { at: new Date().toISOString(), n: rows.length, counts, rows };
  console.log(JSON.stringify(out, null, 2));
}

main();
