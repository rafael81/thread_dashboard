const http = require("http");
const https = require("https");
const { URL } = require("url");

const HOME_VERIFIED_DASHBOARD_PATH = "/api/discovery/home-verified-dashboard";
const HOME_VERIFIED_ACTION_PATH = "/api/terafabx/home-verified-comment";

function normalizeHomeVerifiedUpstream(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function homeVerifiedRequestPathname(requestUrl) {
  const raw = String(requestUrl || "");
  return raw.split("?")[0] || "";
}

function isHomeVerifiedUpstreamPath(method, requestUrl) {
  const pathname = homeVerifiedRequestPathname(requestUrl);
  if (method === "GET" && pathname === HOME_VERIFIED_DASHBOARD_PATH) return true;
  if (method === "POST" && pathname === HOME_VERIFIED_ACTION_PATH) return true;
  return false;
}

function proxyHomeVerifiedUpstream(options = {}) {
  const upstream = normalizeHomeVerifiedUpstream(options.upstream);
  if (!upstream) {
    return Promise.reject(new Error("HOME_VERIFIED_UPSTREAM이 없습니다."));
  }
  const method = String(options.method || "GET").toUpperCase();
  const requestUrl = String(options.url || HOME_VERIFIED_DASHBOARD_PATH);
  const timeoutMs = Math.max(
    1_000,
    Number(options.timeoutMs || (method === "POST" ? 10 * 60_000 : 30_000)),
  );
  const body = options.body == null ? null : Buffer.isBuffer(options.body)
    ? options.body
    : Buffer.from(String(options.body), "utf8");
  const target = new URL(requestUrl, `${upstream}/`);
  const lib = target.protocol === "https:" ? https : http;
  const headers = {
    accept: "application/json",
    "user-agent": "thread-dashboard-home-verified-proxy/1.0",
  };
  const incomingType = options.headers?.["content-type"] || options.headers?.["Content-Type"];
  if (incomingType) headers["content-type"] = incomingType;
  else if (body) headers["content-type"] = "application/json";
  if (body) headers["content-length"] = String(body.length);

  return new Promise((resolve, reject) => {
    const req = lib.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method,
      path: `${target.pathname}${target.search}`,
      headers,
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          statusCode: Number(res.statusCode || 502),
          headers: res.headers || {},
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error(`home-verified upstream timeout after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

module.exports = {
  HOME_VERIFIED_ACTION_PATH,
  HOME_VERIFIED_DASHBOARD_PATH,
  isHomeVerifiedUpstreamPath,
  normalizeHomeVerifiedUpstream,
  proxyHomeVerifiedUpstream,
};
