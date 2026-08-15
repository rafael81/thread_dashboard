const assert = require("node:assert/strict");
const test = require("node:test");

const {
  parseScheduledAtFromDiscoveryError,
  shouldAutoRecoverXScheduledAnomaly,
} = require("../mirror_server.js");

test("post-verify failure errors expose scheduledAt for X-based reconcile", () => {
  const err = `X 예약 사후 검증 실패: ${JSON.stringify({
    scheduledAt: "2026-07-31T11:30:00.000Z",
    verificationError: "X schedule 사용량 제한 HTTP 429 code 1003",
  })}`;
  assert.equal(parseScheduledAtFromDiscoveryError(err), "2026-07-31T11:30:00.000Z");
  assert.equal(parseScheduledAtFromDiscoveryError("X 작성창을 찾지 못했습니다."), null);
});

test("missing schedule auto-recover still requires persistent missing and room on X", () => {
  assert.equal(shouldAutoRecoverXScheduledAnomaly({
    type: "missing",
    persistent: true,
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }, 3, 5), true);
  assert.equal(shouldAutoRecoverXScheduledAnomaly({
    type: "missing",
    persistent: false,
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }, 3, 5), false);
});
