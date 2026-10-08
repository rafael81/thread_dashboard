const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  normalizeGroupApprovalSettings,
  canApproveDiscoveryRow,
  canUnapproveDiscoveryRow,
  DISCOVERY_APPROVED_STATUS,
  DISCOVERY_AUTO_BATCH_LIMIT,
  discoveryAutoBatchAfterSave,
  effectiveGroupApprovalDailyCap,
  groupApprovalAllowsApprove,
  groupApprovalAllowsStanding,
  selectApprovedRowsForDrain,
  isGroupApprovalContentConstraint,
  isDiscoveryMediaExtractFailure,
} = require("../mirror_server.js");

test("normalizeGroupApprovalSettings applies defaults and validation", () => {
  const defaults = normalizeGroupApprovalSettings({});
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.rolloutStage, "shadow");
  assert.equal(defaults.dailyPostCap, 8);
  assert.equal(defaults.minIntervalMs, 2_400_000);
  assert.deepEqual(defaults.standingApprovedGroups, []);
  assert.equal(defaults.geminiAssistEnabled, true);

  const badStage = normalizeGroupApprovalSettings({ rolloutStage: "invalid" });
  assert.equal(badStage.rolloutStage, "shadow");

  const groups = normalizeGroupApprovalSettings({ standingApprovedGroups: ["A", "B", "C"] });
  assert.deepEqual(groups.standingApprovedGroups, ["A"]);

  const negativeCap = normalizeGroupApprovalSettings({ dailyPostCap: -3 });
  assert.equal(negativeCap.dailyPostCap, 8);
});

test("canApproveDiscoveryRow and canUnapproveDiscoveryRow gate transitions", () => {
  assert.equal(canApproveDiscoveryRow({ status: "review", candidateGroup: "A" }), true);
  assert.equal(canApproveDiscoveryRow({ status: "review", candidateGroup: "B" }), true);
  assert.equal(canApproveDiscoveryRow({ status: "review", candidateGroup: "C" }), false);
  assert.equal(canApproveDiscoveryRow({ status: "approved", candidateGroup: "A" }), false);

  assert.equal(canUnapproveDiscoveryRow({ status: DISCOVERY_APPROVED_STATUS }), true);
  assert.equal(canUnapproveDiscoveryRow({ status: "review" }), false);
});

test("group approval drain gates honor rollout stage, daily cap, and content constraints", () => {
  assert.equal(groupApprovalAllowsApprove({ enabled: false, rolloutStage: "manual_batch" }), false);
  assert.equal(groupApprovalAllowsApprove({ enabled: true, rolloutStage: "shadow" }), false);
  assert.equal(groupApprovalAllowsApprove({ enabled: true, rolloutStage: "manual_batch" }), true);
  assert.equal(groupApprovalAllowsStanding({ enabled: true, rolloutStage: "steady", standingApprovedGroups: ["A"] }), true);
  assert.equal(groupApprovalAllowsStanding({ enabled: true, rolloutStage: "manual_batch", standingApprovedGroups: ["A"] }), false);
  assert.equal(effectiveGroupApprovalDailyCap({ rolloutStage: "manual_batch", dailyPostCap: 8 }), 4);
  assert.equal(effectiveGroupApprovalDailyCap({ rolloutStage: "steady", dailyPostCap: 8 }), 8);
  assert.equal(selectApprovedRowsForDrain([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], { remaining: 2, maxPerTick: 3 }).length, 2);
  assert.equal(selectApprovedRowsForDrain([{ id: 1 }], { remaining: 0, maxPerTick: 3 }).length, 0);
  assert.equal(isGroupApprovalContentConstraint(new Error("삭제·비공개 게시글")), true);
  assert.equal(isGroupApprovalContentConstraint(new Error("network timeout")), false);
  assert.equal(isDiscoveryMediaExtractFailure(new Error("Threads 미디어 재추출 결과가 1개에서 0개로 감소해 자동예약을 중단했습니다.")), true);
  assert.equal(isDiscoveryMediaExtractFailure(new Error("network timeout")), false);
});

test("source wiring for group approval data contract and classifier queue", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "mirror_server.js"), "utf8");

  assert.match(source, /ADD COLUMN candidate_group TEXT/);
  assert.match(source, /ADD COLUMN approval_batch_id TEXT/);
  assert.match(source, /ADD COLUMN approved_at TEXT/);
  assert.match(source, /ADD COLUMN group_classified_at TEXT/);

  const dashboardBlock = source.slice(
    source.indexOf("async function getDiscoveryDashboardData"),
    source.indexOf("function scheduleParts"),
  );
  assert.match(dashboardBlock, /DISCOVERY_APPROVED_STATUS/);
  assert.match(dashboardBlock, /discoveredStatuses = new Set\(\["review", DISCOVERY_APPROVED_STATUS/);

  const saveBlock = source.slice(
    source.indexOf("async function saveDiscoveryCandidates"),
    source.indexOf("function isDiscoveryPlaceholderText"),
  );
  assert.match(saveBlock, /queueDiscoveryGroupClassify\(canonicalUrl\)/);

  const autoStyleBlock = source.slice(
    source.indexOf("async function queueAutoDiscoveredStyleCandidates"),
    source.indexOf("async function recoverRecentDiscoveryPlaceholders"),
  );
  assert.match(autoStyleBlock, /row\.status !== "review"/);

  const settingsBlock = source.slice(
    source.indexOf("function loadDiscoverySettings"),
    source.indexOf("function isAutoDiscoveryEnabled"),
  );
  assert.match(settingsBlock, /discovery_auto_style_schedule_disabled_by_group_approval/);
  assert.match(settingsBlock, /autoStyleScheduleEnabled = false/);

  assert.match(source, /"\/api\/discovery\/reclassify"/);

  const startupBlock = source.slice(
    source.indexOf("function startBackgroundWorkAfterBrowserCleanup"),
    source.indexOf("function startDiscoveryScanTimer"),
  );
  assert.match(startupBlock, /backfillDiscoveryCandidateGroups\(\)/);
  assert.match(startupBlock, /recoverApprovedDiscoveryQueue\(\)/);
  assert.match(startupBlock, /drainApprovedDiscoveryRows\(\)/);
  assert.match(source, /DISCOVERY_SCAN_CHROME_PORT/);
  assert.match(source, /primeDiscoveryScanHeadlessSession\(\)/);
  assert.match(source, /newDiscoveryScanPage\(url\)/);
  assert.match(source, /headless: true/);
  assert.match(source, /"\/api\/discovery\/approve-group"/);
  assert.match(source, /setInterval\(\(\) => \{\s*drainApprovedDiscoveryRows\(\)/);
});

test("auto discovery stops after 24 newly saved review items", () => {
  assert.equal(DISCOVERY_AUTO_BATCH_LIMIT, 24);
  assert.equal(discoveryAutoBatchAfterSave(0, 3).stop, false);
  assert.equal(discoveryAutoBatchAfterSave(9, 3).stop, false);
  assert.equal(discoveryAutoBatchAfterSave(21, 3).stop, true);
  assert.equal(discoveryAutoBatchAfterSave(21, 3).saved, 24);
  const source = fs.readFileSync(path.join(__dirname, "..", "mirror_server.js"), "utf8");
  const scanBlock = source.slice(
    source.indexOf("async function discoverThreadsTimeline"),
    source.indexOf("async function processDueDiscoveryPost"),
  );
  assert.match(scanBlock, /candidatesByUrl\.size >= Number\(options\.maxCandidates \|\| DISCOVERY_AUTO_BATCH_LIMIT\)\) break/);
  assert.match(source, /noteAutoDiscoveryBatchSaved\(saved\.inserted\)/);
});
