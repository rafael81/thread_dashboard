const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const {
  isHomeVerifiedUpstreamPath,
  normalizeHomeVerifiedUpstream,
  proxyHomeVerifiedUpstream,
} = require("../lib/home-verified-upstream");

test("normalizeHomeVerifiedUpstream keeps origin only", () => {
  assert.equal(normalizeHomeVerifiedUpstream(""), "");
  assert.equal(normalizeHomeVerifiedUpstream("not-a-url"), "");
  assert.equal(normalizeHomeVerifiedUpstream("ftp://127.0.0.1:4131"), "");
  assert.equal(
    normalizeHomeVerifiedUpstream("http://127.0.0.1:4131/extra/"),
    "http://127.0.0.1:4131",
  );
});

test("isHomeVerifiedUpstreamPath only matches dashboard GET and action POST", () => {
  assert.equal(isHomeVerifiedUpstreamPath("GET", "/api/discovery/home-verified-dashboard?date=2026-08-16"), true);
  assert.equal(isHomeVerifiedUpstreamPath("POST", "/api/terafabx/home-verified-comment"), true);
  assert.equal(isHomeVerifiedUpstreamPath("GET", "/api/discovery/dashboard"), false);
  assert.equal(isHomeVerifiedUpstreamPath("POST", "/api/discovery/home-verified-dashboard"), false);
  assert.equal(isHomeVerifiedUpstreamPath("GET", "/api/terafabx/home-verified-comment"), false);
});

test("proxyHomeVerifiedUpstream forwards query and JSON body to the worker", async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      seen.push({
        method: req.method,
        url: req.url,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        ok: true,
        availableDates: ["2026-08-16"],
        status: { enabled: true, postedToday: 422 },
        timeline: [{ comment: "proxied" }],
        pending: [{ id: "p1" }],
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const upstream = `http://127.0.0.1:${port}`;
  try {
    const dashboard = await proxyHomeVerifiedUpstream({
      upstream,
      method: "GET",
      url: "/api/discovery/home-verified-dashboard?date=2026-08-16",
    });
    assert.equal(dashboard.statusCode, 200);
    const dashboardJson = JSON.parse(dashboard.body.toString("utf8"));
    assert.equal(dashboardJson.status.postedToday, 422);
    assert.equal(dashboardJson.timeline.length, 1);

    const action = await proxyHomeVerifiedUpstream({
      upstream,
      method: "POST",
      url: "/api/terafabx/home-verified-comment",
      body: JSON.stringify({ action: "status" }),
    });
    assert.equal(action.statusCode, 200);
    assert.equal(seen.length, 2);
    assert.equal(seen[0].method, "GET");
    assert.equal(seen[0].url, "/api/discovery/home-verified-dashboard?date=2026-08-16");
    assert.equal(seen[1].method, "POST");
    assert.equal(seen[1].body, JSON.stringify({ action: "status" }));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
