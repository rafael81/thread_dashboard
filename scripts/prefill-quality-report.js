#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const statePath = process.env.TERAFABX_STATE_PATH || path.join(root, ".data", "terafabx-automation-state.json");
const monitorPath = process.env.TERAFABX_COMMENT_MONITOR_STATE_PATH || path.join(root, ".data", "terafabx-comment-monitor-state.json");
const eventsPath = path.join(root, "mirror-events.jsonl");
const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const since = new Date(argValue("--since") || process.env.PREFILL_REPORT_SINCE || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
if (!Number.isFinite(since.getTime())) throw new Error("--since 값이 올바른 ISO 날짜가 아닙니다.");
const until = new Date(argValue("--until") || new Date().toISOString());
if (!Number.isFinite(until.getTime())) throw new Error("--until 값이 올바른 ISO 날짜가 아닙니다.");

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
};
const recordTime = (record) => new Date(record.postedAt || record.queuedAt || record.at || 0).getTime();
const inWindow = (record) => {
  const time = recordTime(record);
  return Number.isFinite(time) && time >= since.getTime() && time <= until.getTime();
};
const state = readJson(statePath, {});
const monitor = readJson(monitorPath, {});
const records = [
  ...(state.pendingCommentPosts || []),
  ...(state.commentHistory || []),
  ...(state.failedPendingCommentPosts || []),
].filter((record) => record?.source === "prefill" && inWindow(record));
const byKey = new Map(records.map((record) => [`${record.targetUrl || ""}|${record.queuedAt || record.at || ""}`, record]));
const unique = [...byKey.values()];
const posted = unique.filter((record) => record.posted || record.replyUrl || record.status === "posted");
const pending = unique.filter((record) => !record.posted && !record.replyUrl && record.status !== "error");
const failed = unique.filter((record) => record.status === "error" || record.failedReason);
const genericityRejected = failed.filter((record) => /genericity|source_anchor|cross_post|headline|specificity/i.test(`${record.lastError || ""} ${record.failedReason || ""}`));
const events = fs.existsSync(eventsPath)
  ? fs.readFileSync(eventsPath, "utf8").split("\n").flatMap((line) => {
      try {
        const event = JSON.parse(line);
        const time = new Date(event.ts || 0).getTime();
        return time >= since.getTime() && time <= until.getTime() ? [event] : [];
      } catch { return []; }
    })
  : [];
const eventCount = (type) => events.filter((event) => event.type === type).length;
const audit = monitor.prefillQualityAudit || {};
const lines = [
  "# Prefill 품질 모니터링 보고서",
  "",
  `- 기간: ${since.toISOString()} ~ ${until.toISOString()}`,
  `- 고유 Prefill: ${unique.length}개`,
  `- 게시: ${posted.length}개`,
  `- 대기: ${pending.length}개`,
  `- 격리/실패: ${failed.length}개`,
  `- 범용성·근거 게이트 격리: ${genericityRejected.length}개`,
  `- 최근 개별 감사: ${Number(audit.checkedCount || 0)}개 검사 / ${Number(audit.failedCount || 0)}개 탈락`,
  `- 생성 완료 이벤트: ${eventCount("terafabx_comment_prefill_queued")}회`,
  `- 품질 격리 이벤트: ${eventCount("terafabx_comment_monitor_prefill_quality_quarantined")}회`,
  `- Prefill 오류 이벤트: ${eventCount("terafabx_comment_prefill_error")}회`,
  "",
  "## 탈락 항목",
  "",
  ...(failed.slice(0, 100).length
    ? failed.slice(0, 100).map((record) => `- ${record.comment || "(댓글 없음)"} — ${record.lastError || record.failedReason || "unknown"} — ${record.targetUrl || ""}`)
    : ["- 없음"]),
];
const output = lines.join("\n");
const outputPath = argValue("--out");
if (outputPath) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${output}\n`);
}
process.stdout.write(`${output}\n`);
