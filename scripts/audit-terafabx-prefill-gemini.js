#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const {
  enqueueTerafabxPendingCommentPost,
  quarantineTerafabxPendingCommentPost,
  reviewTerafabxPreparedReplyBatchWithGemini,
} = require("../mirror_server.js");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    args[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "true";
  }
  return args;
}

function targetFromPending(item) {
  return {
    url: item.targetUrl,
    targetId: item.targetId,
    targetText: item.targetText,
    rootPostUrl: item.rootPostUrl,
    rootPostText: item.rootPostText,
    mediaCount: item.mediaCount,
    visibleMediaCount: item.visibleMediaCount,
    quotePostUrl: item.quotePostUrl,
    quotePostText: item.quotePostText,
    quoteMediaCount: item.quoteMediaCount,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const statePath = path.resolve(args.state || path.join(__dirname, "..", ".data", "terafabx-automation-state.json"));
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const requestedIndexes = String(args.indexes || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter(Number.isInteger);
  const pending = Array.isArray(state.pendingCommentPosts) ? state.pendingCommentPosts : [];
  const selected = pending
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => item?.source === "prefill" && (!requestedIndexes.length || requestedIndexes.includes(index)));
  if (!selected.length) throw new Error("감사할 pending prefill이 없습니다.");

  const inputs = selected.map(({ item }) => ({
    ok: true,
    target: targetFromPending(item),
    prepared: item,
  }));
  const profileDir = path.resolve(args.profile || path.join(__dirname, "..", ".data", "chrome-profiles", "terafabx-gemini-review-prefill-audit"));
  const results = await reviewTerafabxPreparedReplyBatchWithGemini(inputs, {
    chromePort: Number(args.port || 9294),
    profileDir,
    priority: "comment",
    timeoutMs: Number(args.timeout || 300000),
    skipReview: args["skip-review"] === "true",
  });
  if (results.length !== selected.length) {
    throw new Error(`Gemini 감사 결과 개수 불일치: ${results.length}/${selected.length}`);
  }
  const compact = results.map((result, index) => ({
    index: selected[index].index,
    targetUrl: selected[index].item.targetUrl,
    before: selected[index].item.comment,
    after: result.prepared?.comment || null,
    ok: Boolean(result.ok),
    score: result.prepared?.geminiReview?.finalJudge?.score ?? null,
    flags: result.prepared?.geminiReview?.finalJudge?.qualityFlags || null,
    reason: result.prepared?.geminiReview?.finalJudge?.reason || result.error || result.prepared?.geminiReview?.reason || null,
  }));

  if (args.apply === "true") {
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      const original = selected[index].item;
      if (!result.ok) {
        quarantineTerafabxPendingCommentPost(original.targetUrl, `Gemini 수동 재감사 탈락: ${result.error || "품질 기준 미달"}`);
        compact[index].applied = "quarantined";
        continue;
      }
      enqueueTerafabxPendingCommentPost({
        ...result.prepared,
        queuedAt: original.queuedAt,
        attempts: original.attempts,
      }, {
        updateLastRun: false,
        source: "manual_prefill_quality_audit",
        eventType: "terafabx_comment_prefill_manual_audit_applied",
      });
      compact[index].applied = result.prepared.comment === original.comment ? "kept" : "rewritten";
    }
  }
  process.stdout.write(`${JSON.stringify({ ok: true, apply: args.apply === "true", count: compact.length, items: compact }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
