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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch {
      if (attempt < 2) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  return fallback;
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
const recordRank = (record) => record.posted || record.replyUrl || record.status === "posted"
  ? 3
  : (record.status !== "error" && !record.failedReason ? 2 : 1);
const byKey = new Map();
for (const record of records) {
  const key = `${record.targetUrl || ""}|${record.queuedAt || record.at || ""}`;
  const existing = byKey.get(key);
  if (!existing || recordRank(record) >= recordRank(existing)) byKey.set(key, record);
}
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
const eventSum = (type, field = "count") => events
  .filter((event) => event.type === type)
  .reduce((sum, event) => sum + Number(event[field] || 0), 0);
const batchStarts = events.filter((event) => event.type === "terafabx_grok_context_batch_start");
const batchFailures = events.filter((event) => event.type === "terafabx_grok_context_batch_failed");
const batchLimitFailures = batchFailures.filter((event) => /limit 문구|reached your limit/i.test(String(event.error || "")));
const xHomeFailures = events.filter((event) => event.type === "terafabx_comment_prefill_error" && /X home 로딩 실패/i.test(String(event.error || "")));
const statusOf = (record) => record.posted || record.replyUrl || record.status === "posted"
  ? "게시"
  : (record.status === "error" || record.failedReason ? "격리/실패" : "대기");
const qualityIssueText = (record) => {
  const judge = record?.geminiReview?.finalJudge || {};
  const flags = judge.qualityFlags || {};
  const issues = Object.entries(flags).filter(([, value]) => value === true).map(([key]) => key);
  return issues.length ? issues.join(", ") : "없음";
};
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
  `- 품질 격리: ${eventCount("terafabx_comment_monitor_prefill_quality_quarantined")}회 / ${eventSum("terafabx_comment_monitor_prefill_quality_quarantined")}개`,
  `- 일시 오류 복구: ${eventCount("terafabx_comment_monitor_transient_prefill_recovered")}회 / ${eventSum("terafabx_comment_monitor_transient_prefill_recovered")}개`,
  `- Prefill 오류 이벤트: ${eventCount("terafabx_comment_prefill_error")}회`,
  `- X 홈 로딩 실패: ${xHomeFailures.length}회`,
  `- Grok 묶음 호출: ${batchStarts.length}회 / ${batchStarts.reduce((sum, event) => sum + Number(event.count || 0), 0)}개 문맥`,
  `- Grok 한도 응답: ${batchLimitFailures.length}회 / ${batchLimitFailures.reduce((sum, event) => sum + Number(event.count || 0), 0)}개 미생성`,
  "",
  "## 항목별 감사",
  "",
  ...(unique.length
    ? unique.slice(0, 200).map((record) => {
      const judge = record?.geminiReview?.finalJudge || {};
      return `- [${statusOf(record)}] ${record.comment || "(댓글 없음)"} — 점수 ${Number.isFinite(Number(judge.score)) ? Number(judge.score) : "없음"}, 근거 ${judge.sourceAnchor || "없음"}, 근거확인 ${judge.sourceAnchorGrounded === true ? "통과" : "미확인"}, 품질이슈 ${qualityIssueText(record)} — ${record.targetUrl || ""}`;
    })
    : ["- 없음"]),
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
