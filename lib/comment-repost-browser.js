"use strict";
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const WebSocket = require("ws");

function repostBrowserResource(root) {
  return { port: 9445, authSourcePort: 9224, headless: true,
    profileDir: path.resolve(root, ".data/chrome-profiles/terafabx-comment-repost-9445"),
    lockPath: path.join(os.tmpdir(), "terafabx-comment-repost-9445.lock") };
}
function assertRepostBrowserProcess(command, resource) {
  const args = command.trim().split(/\s+/);
  if (!args.includes(`--remote-debugging-port=${resource.port}`)
    || !args.includes(`--user-data-dir=${resource.profileDir}`)
    || !/(?:^|\s)--headless(?:=new)?(?:\s|$)/.test(command)) {
    throw new Error("Repost browser must use its dedicated headless profile and port");
  }
}
async function browserConnection(port) {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(10000) })).json();
  const w = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { w.once("open", resolve); w.once("error", reject); });
  let sequence = 0; const pending = new Map();
  w.on("message", raw => { const m = JSON.parse(raw); const item = pending.get(m.id); if (!item) return;
    pending.delete(m.id); clearTimeout(item.timer); m.error ? item.reject(new Error(m.error.message)) : item.resolve(m.result); });
  return { close: () => w.close(), send: (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)); }, 10000);
    pending.set(id, { resolve, reject, timer }); w.send(JSON.stringify({ id, method, params }));
  }) };
}
async function acquireHeadlessRepostBrowser(root) {
  const resource = repostBrowserResource(root);
  const fd = fs.openSync(resource.lockPath, "wx");
  fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), action: "comment_repost_headless", port: resource.port })); fs.closeSync(fd);
  const release = () => {
    if (fs.existsSync(resource.lockPath) && JSON.parse(fs.readFileSync(resource.lockPath)).pid === process.pid) fs.unlinkSync(resource.lockPath);
  };
  try {
    const server = require(path.join(root, "mirror_server"));
    await server.ensureTerafabxGeminiHeadlessBrowser({ port: resource.port, profileDir: resource.profileDir, headless: true, seedProfile: false });
    const command = execFileSync("ps", ["-axo", "command="], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).split("\n")
      .find(line => line.includes(`--remote-debugging-port=${resource.port}`) && !line.includes("--type=")) || "";
    assertRepostBrowserProcess(command, resource);
    // Browser-level CDP copies the existing 9224 login without opening or activating a visible tab.
    let source, target;
    try {
      source = await browserConnection(resource.authSourcePort); target = await browserConnection(resource.port);
      const all = await source.send("Storage.getCookies");
      const cookies = (all.cookies || []).filter(c => /(^|\.)(?:x\.com|twitter\.com|twimg\.com)$/.test(c.domain))
        .map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path || "/", secure: Boolean(c.secure),
          httpOnly: Boolean(c.httpOnly), ...(c.sameSite ? { sameSite: c.sameSite } : {}), ...(c.expires > 0 ? { expires: c.expires } : {}) }));
      if (!cookies.some(c => c.name === "auth_token")) throw new Error("Dedicated 9224 X authentication source is missing");
      await target.send("Storage.setCookies", { cookies });
      resource.authCookieCount = cookies.length;
    } finally { source?.close(); target?.close(); }
    return { ...resource, release };
  } catch (error) {
    try {
      await require(path.join(root, "mirror_server")).closeTerafabxGeminiHeadlessBrowser({
        port: resource.port, profileDir: resource.profileDir,
      });
    } catch {} finally { release(); }
    throw error;
  }
}
module.exports = { repostBrowserResource, assertRepostBrowserProcess, acquireHeadlessRepostBrowser };
