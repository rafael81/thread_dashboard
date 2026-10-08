const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  assignScheduleDelivery,
  canFulfillLocalScheduledMirror,
  shouldConvertScheduledRowToLocal,
  dashboardDiscoveryRow,
  isDueLocalScheduledRow,
  isLocalScheduleDelivery,
  isPublishedDiscoveryRow,
  mergeDiscoveryRowsWithMirrorHistory,
  mirrorHistoryDashboardRow,
  mirrorHistoryPublishedTime,
  normalizeScheduleDelivery,
  normalizeScheduleDeliveryMode,
  scheduleDeliveryOf,
  SCHEDULE_DELIVERY_AB,
  SCHEDULE_DELIVERY_LOCAL_POST,
  SCHEDULE_DELIVERY_X_NATIVE,
} = require("../mirror_server.js");

test("schedule delivery mode normalizes to ab by default", () => {
  assert.equal(normalizeScheduleDeliveryMode(""), SCHEDULE_DELIVERY_AB);
  assert.equal(normalizeScheduleDeliveryMode("ab"), SCHEDULE_DELIVERY_AB);
  assert.equal(normalizeScheduleDeliveryMode("x_native"), SCHEDULE_DELIVERY_X_NATIVE);
  assert.equal(normalizeScheduleDeliveryMode("local_post"), SCHEDULE_DELIVERY_LOCAL_POST);
  assert.equal(normalizeScheduleDelivery("local_post"), SCHEDULE_DELIVERY_LOCAL_POST);
  assert.equal(normalizeScheduleDelivery("x_native"), SCHEDULE_DELIVERY_X_NATIVE);
  assert.equal(normalizeScheduleDelivery(""), SCHEDULE_DELIVERY_X_NATIVE);
});

test("A/B assignment is sticky per URL and splits near 50/50", () => {
  const url = "https://www.threads.com/@demo/post/AbTestSticky";
  assert.equal(assignScheduleDelivery(url, "x_native"), SCHEDULE_DELIVERY_X_NATIVE);
  assert.equal(assignScheduleDelivery(url, "local_post"), SCHEDULE_DELIVERY_LOCAL_POST);
  const first = assignScheduleDelivery(url, "ab");
  assert.equal(assignScheduleDelivery(url, "ab"), first);
  assert.equal(assignScheduleDelivery(url, "ab"), first);

  let local = 0;
  let native = 0;
  for (let i = 0; i < 200; i += 1) {
    const assigned = assignScheduleDelivery(`https://www.threads.com/@demo/post/${i}`, "ab");
    if (assigned === SCHEDULE_DELIVERY_LOCAL_POST) local += 1;
    else native += 1;
  }
  assert.equal(local + native, 200);
  assert.ok(local >= 70 && native >= 70, `expected a split, got local=${local} native=${native}`);
});

test("assignment uses the first SHA-1 byte of the canonical URL", () => {
  const url = "https://www.threads.com/@demo/post/HashCheck";
  const expected = (crypto.createHash("sha1").update(url).digest()[0] & 1) === 0
    ? SCHEDULE_DELIVERY_X_NATIVE
    : SCHEDULE_DELIVERY_LOCAL_POST;
  assert.equal(assignScheduleDelivery(url, "ab"), expected);
});

test("due local rows are identified without treating X native due rows as due-local", () => {
  const now = Date.parse("2026-08-31T08:00:00.000Z");
  assert.equal(isDueLocalScheduledRow({
    status: "scheduled",
    scheduleDelivery: "local_post",
    scheduledPostAt: "2026-08-31T07:59:00.000Z",
  }, now), true);
  assert.equal(isDueLocalScheduledRow({
    status: "scheduled",
    scheduleDelivery: "local_post",
    scheduledPostAt: "2026-08-31T08:01:00.000Z",
  }, now), false);
  assert.equal(isDueLocalScheduledRow({
    status: "scheduled",
    scheduleDelivery: "x_native",
    scheduledPostAt: "2026-08-31T07:59:00.000Z",
  }, now), false);
  assert.equal(isDueLocalScheduledRow({
    status: "posted",
    scheduleDelivery: "local_post",
    scheduledPostAt: "2026-08-31T07:59:00.000Z",
  }, now), false);
});

test("local scheduled rows stay scheduled after the slot time until the dispatcher posts", () => {
  const now = Date.parse("2026-08-31T08:00:00.000Z");
  const row = {
    canonicalUrl: "https://www.threads.com/@demo/post/LocalDue",
    status: "scheduled",
    scheduleDelivery: "local_post",
    scheduledPostAt: "2026-08-31T07:40:00.000Z",
    postedAt: "2026-08-31T06:00:00.000Z",
  };
  assert.equal(isPublishedDiscoveryRow(row, now), false);
  assert.equal(dashboardDiscoveryRow(row, now).status, "scheduled");
  assert.equal(dashboardDiscoveryRow(row, now).scheduleDelivery, "local_post");
});

test("X native scheduled rows still appear posted after the slot time", () => {
  const now = Date.parse("2026-08-31T08:00:00.000Z");
  const row = {
    canonicalUrl: "https://www.threads.com/@demo/post/XDue",
    status: "scheduled",
    scheduleDelivery: "x_native",
    scheduledPostAt: "2026-08-31T07:40:00.000Z",
  };
  assert.equal(isPublishedDiscoveryRow(row, now), true);
  assert.equal(dashboardDiscoveryRow(row, now).status, "posted");
});

test("mirror history does not publish a local reservation when the slot time passes", () => {
  const now = Date.parse("2026-08-31T08:00:00.000Z");
  const entry = {
    canonicalUrl: "https://www.threads.com/@demo/post/LocalHistory",
    status: "scheduled",
    scheduleDelivery: "local_post",
    scheduledAt: "2026-08-31T07:40:00.000Z",
    mediaCount: 1,
    completedAt: "2026-08-31T06:00:00.000Z",
  };
  assert.equal(mirrorHistoryPublishedTime(entry, now), "");
  const row = mirrorHistoryDashboardRow(entry, now);
  assert.equal(row.status, "scheduled");
  assert.equal(row.scheduleDelivery, "local_post");
});

test("merge keeps a due local reservation in the scheduled view", () => {
  const now = Date.parse("2026-08-31T08:00:00.000Z");
  const merged = mergeDiscoveryRowsWithMirrorHistory([{
    canonicalUrl: "https://www.threads.com/@demo/post/LocalMerge",
    status: "scheduled",
    scheduleDelivery: "local_post",
    scheduledPostAt: "2026-08-31T07:40:00.000Z",
    postedAt: "2026-08-31T06:00:00.000Z",
    mediaCount: 2,
  }], now, [{
    canonicalUrl: "https://www.threads.com/@demo/post/LocalMerge",
    status: "scheduled",
    scheduleDelivery: "local_post",
    scheduledAt: "2026-08-31T07:40:00.000Z",
    mediaCount: 2,
    completedAt: "2026-08-31T06:00:00.000Z",
  }]);
  assert.equal(merged[0].status, "scheduled");
  assert.equal(merged[0].scheduledPostAt, "2026-08-31T07:40:00.000Z");
  assert.equal(isLocalScheduleDelivery(merged[0]), true);
});

test("local scheduled history can be fulfilled without treating it as a duplicate", () => {
  const completed = {
    canonicalUrl: "https://www.threads.com/@demo/post/Fulfill",
    status: "scheduled",
    scheduleDelivery: "local_post",
    scheduledAt: "2026-08-31T07:40:00.000Z",
  };
  assert.equal(canFulfillLocalScheduledMirror(completed, { fulfillLocalSchedule: true }), true);
  assert.equal(canFulfillLocalScheduledMirror(completed, {}), false);
  assert.equal(canFulfillLocalScheduledMirror({
    ...completed,
    scheduleDelivery: "x_native",
  }, { fulfillLocalSchedule: true }), false);
  assert.equal(canFulfillLocalScheduledMirror({
    ...completed,
    status: "posted",
  }, { fulfillLocalSchedule: true }), false);
});

test("scheduleDeliveryOf reads row, history, and nested criteria fields", () => {
  assert.equal(scheduleDeliveryOf({ scheduleDelivery: "local_post" }), SCHEDULE_DELIVERY_LOCAL_POST);
  assert.equal(scheduleDeliveryOf({ schedule_delivery: "local_post" }), SCHEDULE_DELIVERY_LOCAL_POST);
  assert.equal(scheduleDeliveryOf({ criteria: { scheduleDelivery: "local_post" } }), SCHEDULE_DELIVERY_LOCAL_POST);
  assert.equal(scheduleDeliveryOf({ status: "scheduled" }), SCHEDULE_DELIVERY_X_NATIVE);
});

test("only future X-native scheduled rows convert to local delivery", () => {
  const now = Date.parse("2026-08-31T09:00:00.000Z");
  assert.equal(shouldConvertScheduledRowToLocal({
    status: "scheduled",
    scheduleDelivery: "x_native",
    scheduledPostAt: "2026-08-31T10:00:00.000Z",
  }, now), true);
  assert.equal(shouldConvertScheduledRowToLocal({
    status: "scheduled",
    scheduleDelivery: "local_post",
    scheduledPostAt: "2026-08-31T10:00:00.000Z",
  }, now), false);
  assert.equal(shouldConvertScheduledRowToLocal({
    status: "scheduled",
    scheduleDelivery: "x_native",
    scheduledPostAt: "2026-08-31T08:00:00.000Z",
  }, now), false);
  assert.equal(shouldConvertScheduledRowToLocal({
    status: "posted",
    scheduleDelivery: "x_native",
    scheduledPostAt: "2026-08-31T10:00:00.000Z",
  }, now), false);
});

test("dashboard and server expose the local schedule A/B path", () => {
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "mirror_server.js"), "utf8");
  const dashboardSource = fs.readFileSync(path.join(__dirname, "..", "dashboard", "src", "main.jsx"), "utf8");
  const tableSource = fs.readFileSync(path.join(__dirname, "..", "dashboard", "src", "components", "data-table.tsx"), "utf8");

  assert.match(serverSource, /req\.url === "\/api\/discovery\/schedule-delivery-mode"/);
  assert.match(serverSource, /async function commitLocalDiscoverySchedule/);
  assert.match(serverSource, /async function maybeDispatchLocalScheduledPosts/);
  assert.match(serverSource, /fulfillLocalSchedule: true/);
  assert.match(serverSource, /COALESCE\(schedule_delivery, 'x_native'\) != 'local_post'/);
  assert.match(serverSource, /async function cancelLocalScheduledDiscoveryRow/);
  assert.match(serverSource, /req\.url === "\/api\/discovery\/convert-schedule-to-local"/);
  assert.match(serverSource, /async function convertScheduledDiscoveryRowsToLocal/);
  assert.match(dashboardSource, /\/api\/discovery\/schedule-delivery-mode/);
  assert.match(dashboardSource, /A\/B 50:50/);
  assert.match(dashboardSource, /로컬 직접게시만/);
  assert.match(tableSource, /로컬 직접게시/);
  assert.match(tableSource, /isLocalScheduleDelivery/);
});
