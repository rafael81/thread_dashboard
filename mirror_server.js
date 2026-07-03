const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { URL } = require("url");
const { execFile } = require("child_process");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT || 3131);
const CHROME_PORT = Number(process.env.CHROME_PORT || 9224);
const REQUIRED_X_HANDLE = (process.env.X_HANDLE || "terafabXai").toLowerCase();
const MAX_MEDIA = 4;
const LOG_PATH = path.join(__dirname, "mirror-events.jsonl");
const SCHEDULE_SLOTS_PATH = path.join(__dirname, "x-scheduled-slots.json");
const MIRROR_HISTORY_PATH = path.join(__dirname, "mirror-history.json");
const DISCOVERY_SETTINGS_PATH = path.join(__dirname, "discovery-settings.json");
const SCHEDULE_SPACING_MS = 15 * 60 * 1000;
const DISCOVERY_DB_PATH = process.env.DISCOVERY_DB_PATH || path.join(__dirname, ".data", "thread-discovery.db");
const DASHBOARD_DIST_DIR = path.join(__dirname, "dashboard", "dist");
const DASHBOARD_INDEX_PATH = path.join(DASHBOARD_DIST_DIR, "index.html");
const DISCOVERY_MIN_LIKES = Number(process.env.DISCOVERY_MIN_LIKES || 1000);
const DISCOVERY_POST_INTERVAL_MS = Number(process.env.DISCOVERY_POST_INTERVAL_MS || 10 * 60 * 1000);
const DISCOVERY_WORKER_INTERVAL_MS = Number(process.env.DISCOVERY_WORKER_INTERVAL_MS || 60 * 1000);
const DISCOVERY_SCAN_INTERVAL_MS = Number(process.env.DISCOVERY_SCAN_INTERVAL_MS || 5 * 60 * 1000);
const DISCOVERY_MIN_VIRAL_SCORE = Number(process.env.DISCOVERY_MIN_VIRAL_SCORE || 3);
const DISCOVERY_MAX_SCROLLS = Number(process.env.DISCOVERY_MAX_SCROLLS || 20);
const GROK_BIN = process.env.GROK_BIN || "/Users/user/.local/bin/grok";
const TERAFABX_STATE_PATH = process.env.TERAFABX_STATE_PATH || path.join(__dirname, ".data", "terafabx-automation-state.json");
const TERAFABX_LOCK_PATH = process.env.TERAFABX_LOCK_PATH || path.join(os.tmpdir(), "terafabx-cdp9224.lock");
const TERAFABX_COMMENT_INTERVAL_MS = Number(process.env.TERAFABX_COMMENT_INTERVAL_MS || 20 * 60 * 1000);
const TERAFABX_HEART_INTERVAL_MS = Number(process.env.TERAFABX_HEART_INTERVAL_MS || 10 * 60 * 1000);
const TERAFABX_HEART_LIMIT = Number(process.env.TERAFABX_HEART_LIMIT || 5);
const TERAFABX_JOB_GAP_MS = Number(process.env.TERAFABX_JOB_GAP_MS || 90 * 1000);

let busy = false;
let discoveryScanBusy = false;
let discoveryDbPromise = null;
let terafabxBusy = false;
let terafabxSchedulerBusy = false;

function loadDiscoverySettings() {
  try {
    const settings = JSON.parse(fs.readFileSync(DISCOVERY_SETTINGS_PATH, "utf8"));
    return {
      autoDiscoveryEnabled: settings.autoDiscoveryEnabled !== false,
    };
  } catch {
    return { autoDiscoveryEnabled: true };
  }
}

function saveDiscoverySettings(settings) {
  fs.writeFileSync(DISCOVERY_SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function isAutoDiscoveryEnabled() {
  return loadDiscoverySettings().autoDiscoveryEnabled;
}

function setAutoDiscoveryEnabled(enabled) {
  const settings = loadDiscoverySettings();
  settings.autoDiscoveryEnabled = Boolean(enabled);
  saveDiscoverySettings(settings);
  logEvent("discovery_auto_scan_setting_changed", { autoDiscoveryEnabled: settings.autoDiscoveryEnabled });
  return settings;
}

function logEvent(type, data = {}) {
  const entry = {
    ts: new Date().toISOString(),
    type,
    ...data,
  };
  try {
    fs.appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`);
  } catch (error) {
    console.error("failed to write mirror event log", error.message);
  }
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function html(res, status, body) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function serveFile(res, filePath) {
  const body = fs.readFileSync(filePath);
  res.writeHead(200, { "content-type": contentTypeFor(filePath) });
  res.end(body);
}

function tryServeDashboardAsset(req, res) {
  if (!req.url.startsWith("/assets/")) return false;
  const requested = decodeURIComponent(new URL(req.url, "http://localhost").pathname.slice(1));
  const fullPath = path.resolve(DASHBOARD_DIST_DIR, requested);
  const rootPath = path.resolve(DASHBOARD_DIST_DIR);
  if (!fullPath.startsWith(rootPath + path.sep) || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return false;
  }
  serveFile(res, fullPath);
  return true;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function requestJson(method, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: CHROME_PORT, method, path: pathname }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(data || `Chrome returned HTTP ${res.statusCode}`));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

class CdpPage {
  constructor(tab) {
    this.tab = tab;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.ws = new WebSocket(tab.webSocketDebuggerUrl);
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
    this.ws.on("message", (raw) => {
      const msg = JSON.parse(raw);
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id).resolve(msg.result);
        this.pending.delete(msg.id);
        return;
      }
      this.events.push(msg);
    });
    await this.send("Network.enable");
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("DOM.enable");
  }

  send(method, params = {}, timeoutMs = 45000) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, timeoutMs);
    });
  }

  async eval(expression, awaitPromise = true) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
    }
    return result.result.value;
  }

  async navigate(url, waitMs = 6000) {
    try {
      await this.send("Page.navigate", { url }, 12000);
    } catch (error) {
      if (!/Page\.navigate timed out/.test(error.message)) throw error;
      logEvent("cdp_navigate_timeout_ignored", { url });
    }
    await sleep(waitMs);
  }

  async close() {
    try {
      this.ws.close();
    } catch {}
    try {
      await requestJson("PUT", `/json/close/${this.tab.id}`);
    } catch {}
  }
}

class DuplicateMirrorError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DuplicateMirrorError";
    this.details = details;
  }
}

async function newPage(url = "about:blank") {
  const tab = await requestJson("PUT", `/json/new?${encodeURIComponent(url)}`);
  const page = new CdpPage(tab);
  await page.open();
  return page;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJsonFile(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function loadTerafabxState() {
  const defaults = {
    commentEnabled: false,
    heartEnabled: false,
    lastCommentRunAt: null,
    lastCommentStatus: null,
    lastCommentError: null,
    lastComment: null,
    lastCommentTarget: null,
    lastReplyUrl: null,
    commentHistory: [],
    seenTargets: [],
    lastHeartRunAt: null,
    lastHeartStatus: null,
    lastHeartError: null,
    lastHeartCount: 0,
    heartHistory: [],
  };
  return { ...defaults, ...readJsonFile(TERAFABX_STATE_PATH, defaults) };
}

function saveTerafabxState(patchValue) {
  const next = { ...loadTerafabxState(), ...patchValue, updatedAt: new Date().toISOString() };
  writeJsonFile(TERAFABX_STATE_PATH, next);
  return next;
}

function getTerafabxLockState() {
  try {
    const raw = fs.readFileSync(TERAFABX_LOCK_PATH, "utf8");
    const lock = JSON.parse(raw);
    const ageMs = Date.now() - new Date(lock.at || 0).getTime();
    return { busy: true, path: TERAFABX_LOCK_PATH, ageMs, ...lock };
  } catch {
    return { busy: false, path: TERAFABX_LOCK_PATH };
  }
}

async function withTerafabxLock(action, fn) {
  const existing = getTerafabxLockState();
  if (existing.busy && Number(existing.ageMs || 0) < 10 * 60 * 1000) {
    throw new Error(`9224 CDP lock 사용 중: ${existing.action || "unknown"}`);
  }
  fs.writeFileSync(TERAFABX_LOCK_PATH, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, action }, null, 2));
  try {
    return await fn();
  } finally {
    try { fs.unlinkSync(TERAFABX_LOCK_PATH); } catch {}
  }
}

function cleanSocialText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function validateTerafabxReply(value) {
  const text = cleanSocialText(value).replace(/^['"“”‘’]+|['"“”‘’]+$/g, "");
  if (!text) throw new Error("Grok 댓글이 비어 있습니다.");
  if (text.length < 6 || text.length > 80) throw new Error(`댓글 길이 부적합: ${text.length}`);
  if (/[\r\n]/.test(text)) throw new Error("댓글은 한 줄이어야 합니다.");
  if (/(감정 회계|가성비 최고|독특하네요|훈훈하다|선남선녀|와 진짜|대박|ㄷㄷ|저격수|때려야|죽이네요|보고서|분석)/i.test(text)) {
    throw new Error(`금지/저품질 표현 감지: ${text}`);
  }
  if (/(죽|살인|칼|총|전쟁|성폭|강간|자살|마약|카지노|도박|코인|에어드랍)/i.test(text)) {
    throw new Error(`민감 표현 감지: ${text}`);
  }
  return text;
}

async function getExistingXPage(url = "https://x.com/home") {
  const tab = await requestJson("PUT", `/json/new?${encodeURIComponent(url)}`);
  const page = new CdpPage(tab);
  await page.open();
  await sleep(2500);
  return page;
}

async function closeXDialogs(page) {
  await page.eval(`(() => {
    for (const el of Array.from(document.querySelectorAll('[role="dialog"] [aria-label="Close"], [role="dialog"] [aria-label="닫기"], [data-testid="app-bar-close"], [aria-label="Back"], [aria-label="뒤로"]'))) {
      try { el.click(); } catch {}
    }
    return true;
  })()`).catch(() => false);
}

async function discoverTerafabxCommentTarget() {
  const state = loadTerafabxState();
  const seen = new Set([...(state.seenTargets || []), ...(state.commentHistory || []).map((item) => item.targetUrl)].filter(Boolean).map((url) => String(url).split("?")[0]));
  logEvent("terafabx_comment_target_discovery_start", { seenCount: seen.size });
  const page = await getExistingXPage("https://x.com/home");
  try {
    await closeXDialogs(page);
    await verifyXAccount(page);
    await page.navigate("https://x.com/home", 8000);
    for (let i = 0; i < 4; i++) {
      await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 500, y: 700, deltaX: 0, deltaY: 650 }).catch(() => {});
      await sleep(900);
    }
    const articles = await page.eval(`(() => {
      function clean(s) { return (s || "").replace(/\\s+/g, " ").trim(); }
      return Array.from(document.querySelectorAll("article")).map((article, idx) => {
        const links = Array.from(article.querySelectorAll('a[href*="/status/"]')).map((a) => a.href).filter((href) => !href.includes('/photo/') && !href.includes('/analytics'));
        const url = links.find((href) => /x\\.com\\/[^/]+\\/status\\/\\d+/.test(href));
        const text = clean(article.innerText || "");
        return {
          idx,
          url: url ? url.split("?")[0] : null,
          text: text.slice(0, 1200),
          replyCtx: /Replying to|님에게 보내는 답글|답글 대상|멘션/.test(text),
          promoted: /프로모션|Promoted|광고/.test(text),
        };
      }).filter((item) => item.url);
    })()`);
    const banned = /(crypto|airdrop|카지노|도박|정치|대통령|국회|살인|사망|참사|재난|전쟁|섹스|성관계|야동|미성년|중학생|초등|아동|성폭|강간|자살|폭행|칼|총|마약|투자권유|코인|비트코인|에어드랍)/i;
    const candidates = articles.filter((item) => !item.replyCtx && !item.promoted && item.url && !item.url.includes("/terafabXai/status/") && !seen.has(item.url) && !banned.test(item.text));
    logEvent("terafabx_comment_target_candidates", { articleCount: articles.length, candidateCount: candidates.length });
    for (const candidate of candidates.slice(0, 12)) {
      logEvent("terafabx_comment_target_check", { url: candidate.url });
      await page.navigate(candidate.url, 6500);
      const id = (candidate.url.match(/status\/(\d+)/) || [])[1] || "";
      const root = await page.eval(`(() => {
        const id = ${JSON.stringify(id)};
        function clean(s) { return (s || "").replace(/\\s+/g, " ").trim(); }
        const articles = Array.from(document.querySelectorAll("article"));
        const rows = articles.map((article, idx) => ({
          idx,
          text: clean(article.innerText || "").slice(0, 1200),
          hrefs: Array.from(article.querySelectorAll('a[href*="/status/"]')).map((a) => a.href),
        }));
        const match = rows.find((row) => row.hrefs.some((href) => href.includes('/status/' + id)));
        return { match, first: rows[0] || null, url: location.href };
      })()`);
      if (root.match && root.match.idx === 0 && root.first && !/Replying to|님에게 보내는 답글|답글 대상|멘션/.test(root.first.text)) {
        logEvent("terafabx_comment_target_selected", { url: candidate.url, targetId: id, textPreview: root.first.text.slice(0, 180) });
        return { ...candidate, targetId: id, targetText: root.first.text };
      }
    }
    throw new Error(`댓글 후보 없음: seen=${articles.length}, candidates=${candidates.length}`);
  } finally {
    await page.close();
  }
}

function runGrokCli(prompt, timeout = 90_000) {
  return new Promise((resolve, reject) => {
    execFile(GROK_BIN, ["--no-alt-screen", "--disable-web-search", "--output-format", "plain", "-p", prompt], {
      cwd: __dirname,
      timeout,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      const output = `${stdout || ""}${stderr ? `\n${stderr}` : ""}`.trim();
      if (error) {
        error.message = `${error.message}${output ? `\n${output}` : ""}`;
        reject(error);
        return;
      }
      resolve(output);
    });
  });
}

async function generateTerafabxReplyWithGrok(target) {
  logEvent("terafabx_grok_reply_start", { targetUrl: target.url, textLength: String(target.targetText || target.text || "").length });
  const buildPrompt = (extraRule = "") => [
    "너는 X 계정 @terafabXai(과즙루피)의 한국어 답글 작성기다.",
    "아래 원문에 공개 답글 1개만 작성해라.",
    "규칙: 자연스러운 한국어, 한 줄, 6~80자, 과장/밈 남발 금지, 분석 보고서 말투 금지, 폭력/무기/성/도박/정치/투자 표현 금지.",
    "금지어: 감정 회계, 가성비 최고네요, 독특하네요, 훈훈하다, 선남선녀, 와 진짜, 대박, ㄷㄷ, 저격수, 때려야죠, 죽이네요.",
    "출력은 답글 문장만. 따옴표, 설명, 후보 목록, 번호를 쓰지 마라.",
    extraRule,
    "",
    `원문: ${target.targetText || target.text}`,
  ].filter(Boolean).join("\n");
  const parseReply = (raw) => {
    const firstLine = String(raw || "").split("\n").map((line) => line.trim()).filter(Boolean).find((line) => !/^```/.test(line)) || raw;
    return validateTerafabxReply(String(firstLine || "").replace(/^[-*\d.)\s]+/, ""));
  };
  for (const [attempt, extraRule] of [
    [1, ""],
    [2, "원문 내용이 민감하거나 판단이 어렵다면 중립적인 짧은 공감 답글을 써라."],
  ]) {
    try {
      const raw = await runGrokCli(buildPrompt(extraRule));
      const reply = parseReply(raw);
      logEvent("terafabx_grok_reply_ok", { attempt, reply });
      return reply;
    } catch (error) {
      logEvent("terafabx_grok_reply_attempt_failed", { attempt, error: error.message });
    }
  }
  const fallback = /\?/.test(String(target.targetText || target.text || ""))
    ? "이 관점은 한번 더 볼 만하네요"
    : "이건 한번 더 생각해볼 만하네요";
  logEvent("terafabx_grok_reply_fallback", { fallback });
  return validateTerafabxReply(fallback);
}

async function postTerafabxReply(targetUrl, comment) {
  logEvent("terafabx_reply_post_start", { targetUrl, comment });
  const page = await getExistingXPage(targetUrl);
  try {
    await closeXDialogs(page);
    await verifyXAccount(page);
    await page.navigate(targetUrl, 7500);
    const id = (targetUrl.match(/status\/(\d+)/) || [])[1] || "";
    const pre = await page.eval(`(() => {
      const id = ${JSON.stringify(id)};
      const article = document.querySelector("article");
      function clean(s) { return (s || "").replace(/\\s+/g, " ").trim(); }
      return { ok: Boolean(article && Array.from(article.querySelectorAll('a[href*="/status/"]')).some((a) => a.href.includes('/status/' + id))), text: article ? clean(article.innerText).slice(0, 900) : "", url: location.href };
    })()`);
    if (!pre.ok) throw new Error(`target root 검증 실패: ${JSON.stringify(pre)}`);
    logEvent("terafabx_reply_target_verified", { targetUrl, url: pre.url, textPreview: pre.text.slice(0, 180) });
    const clickedReply = await page.eval(`(() => {
      const article = document.querySelector("article");
      const button = article && (article.querySelector('[data-testid="reply"]') || Array.from(article.querySelectorAll('button, [role="button"]')).find((el) => /Reply|답글/.test(el.getAttribute("aria-label") || el.innerText || "")));
      if (!button) return false;
      button.scrollIntoView({ block: "center" });
      button.click();
      return true;
    })()`);
    if (!clickedReply) throw new Error("답글 버튼을 찾지 못했습니다.");
    logEvent("terafabx_reply_button_clicked", { targetUrl });
    await sleep(1400);
    const focused = await page.eval(`(() => {
      const editors = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"], [contenteditable="true"]')).filter((el) => el.offsetWidth && el.offsetHeight);
      const editor = editors.pop();
      if (!editor) return false;
      editor.scrollIntoView({ block: "center" });
      editor.click();
      editor.focus();
      return true;
    })()`);
    if (!focused) throw new Error("답글 입력창을 찾지 못했습니다.");
    await page.send("Input.insertText", { text: comment });
    await sleep(700);
    let typed = await page.eval(`(() => {
      const editors = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"], [contenteditable="true"]')).filter((el) => el.offsetWidth && el.offsetHeight);
      const editor = editors.pop();
      return editor ? (editor.innerText || editor.textContent || "") : "";
    })()`);
    if (cleanSocialText(typed) !== cleanSocialText(comment)) {
      typed = await page.eval(`((comment) => {
        const editors = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"], [contenteditable="true"]')).filter((el) => el.offsetWidth && el.offsetHeight);
        const editor = editors.pop();
        if (!editor) return "";
        editor.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("insertText", false, comment);
        editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: comment }));
        return editor.innerText || editor.textContent || "";
      })(${JSON.stringify(comment)})`);
      await sleep(700);
    }
    if (cleanSocialText(typed) !== cleanSocialText(comment)) throw new Error(`입력 텍스트 불일치: ${typed}`);
    logEvent("terafabx_reply_text_typed", { targetUrl, comment });
    validateTerafabxReply(typed);
    const clickedPost = await page.eval(`(() => {
      const buttons = Array.from(document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'))
        .filter((el) => el.offsetWidth && el.offsetHeight && !(el.disabled || el.getAttribute("aria-disabled") === "true"));
      const button = buttons.pop();
      if (!button) {
        return {
          clicked: false,
          candidates: Array.from(document.querySelectorAll('button, [role="button"]')).map((el) => ({
            text: el.innerText || "",
            label: el.getAttribute("aria-label") || "",
            testid: el.getAttribute("data-testid") || "",
            disabled: Boolean(el.disabled || el.getAttribute("aria-disabled") === "true"),
          })).slice(-12),
        };
      }
      button.click();
      return { clicked: true, text: button.innerText || button.getAttribute("aria-label") || "" };
    })()`);
    if (!clickedPost.clicked) throw new Error("활성화된 답글 게시 버튼을 찾지 못했습니다.");
    logEvent("terafabx_reply_submit_clicked", { targetUrl, button: clickedPost.text });
    await sleep(5000);
    logEvent("terafabx_reply_verify_start", { targetUrl });
    await page.navigate("https://x.com/terafabXai/with_replies", 7000);
    const verify = await page.eval(`(() => {
      const want = ${JSON.stringify(comment)};
      function clean(s) { return (s || "").replace(/\\s+/g, " ").trim(); }
      for (const article of Array.from(document.querySelectorAll("article"))) {
        const text = clean(article.innerText || "");
        if (text.includes(want)) {
          const href = Array.from(article.querySelectorAll('a[href*="/status/"]')).map((a) => a.href).find((href) => href.includes('/terafabXai/status/'));
          return { found: true, href: href ? href.split("?")[0] : null, text: text.slice(0, 800), url: location.href };
        }
      }
      return { found: false, url: location.href };
    })()`);
    if (!verify.found || !verify.href) throw new Error(`답글 게시 검증 실패: ${JSON.stringify(verify)}`);
    logEvent("terafabx_reply_verified", { targetUrl, replyUrl: verify.href });
    return { ok: true, replyUrl: verify.href, verify };
  } finally {
    logEvent("terafabx_reply_page_close_start", { targetUrl });
    await page.close();
    logEvent("terafabx_reply_page_closed", { targetUrl });
  }
}

async function runTerafabxCommentOnce({ manual = false } = {}) {
  if (terafabxBusy) throw new Error("다른 과즙루피 자동화 작업이 진행 중입니다.");
  terafabxBusy = true;
  try {
    return await withTerafabxLock("comment", async () => {
      const target = await discoverTerafabxCommentTarget();
      const comment = await generateTerafabxReplyWithGrok(target);
      const posted = await postTerafabxReply(target.url, comment);
      const previous = loadTerafabxState();
      const record = { at: new Date().toISOString(), targetUrl: target.url, targetId: target.targetId, targetText: target.targetText, comment, replyUrl: posted.replyUrl, generator: "grok-cli", manual };
      const nextHistory = [record, ...(previous.commentHistory || [])].slice(0, 100);
      const seenTargets = Array.from(new Set([target.url, ...(previous.seenTargets || [])])).slice(0, 300);
      saveTerafabxState({ lastCommentRunAt: record.at, lastCommentStatus: "ok", lastCommentError: null, lastComment: comment, lastCommentTarget: target.url, lastReplyUrl: posted.replyUrl, commentHistory: nextHistory, seenTargets });
      logEvent("terafabx_comment_posted", record);
      return { ok: true, action: "comment", ...record };
    });
  } catch (error) {
    saveTerafabxState({ lastCommentRunAt: new Date().toISOString(), lastCommentStatus: "error", lastCommentError: error.message });
    logEvent("terafabx_comment_error", { error: error.message });
    throw error;
  } finally {
    terafabxBusy = false;
  }
}

async function runTerafabxHeartOnce({ limit = TERAFABX_HEART_LIMIT, manual = false } = {}) {
  if (terafabxBusy) throw new Error("다른 과즙루피 자동화 작업이 진행 중입니다.");
  terafabxBusy = true;
  try {
    return await withTerafabxLock("heart", async () => {
      const page = await getExistingXPage("https://x.com/home");
      try {
        await closeXDialogs(page);
        await verifyXAccount(page);
        await page.navigate("https://x.com/home", 8000);
        let liked = [];
        for (let round = 0; round < 5 && liked.length < limit; round++) {
          const batch = await page.eval(`(() => {
            function clean(s) { return (s || "").replace(/\\s+/g, " ").trim(); }
            const out = [];
            for (const article of Array.from(document.querySelectorAll("article"))) {
              if (out.length >= ${Number(limit)}) break;
              const text = clean(article.innerText || "");
              if (/Replying to|님에게 보내는 답글|답글 대상|프로모션|Promoted|광고/.test(text)) continue;
              const unlike = article.querySelector('[data-testid="unlike"]');
              if (unlike) continue;
              const like = article.querySelector('[data-testid="like"]');
              if (!like || like.disabled || like.getAttribute("aria-disabled") === "true") continue;
              const href = Array.from(article.querySelectorAll('a[href*="/status/"]')).map((a) => a.href).find((href) => /x\\.com\\/[^/]+\\/status\\/\\d+/.test(href));
              if (!href || href.includes('/terafabXai/status/')) continue;
              like.scrollIntoView({ block: "center" });
              like.click();
              out.push({ url: href.split("?")[0], text: text.slice(0, 240) });
            }
            return out;
          })()`);
          liked = liked.concat(batch || []);
          if (liked.length >= limit) break;
          await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 500, y: 700, deltaX: 0, deltaY: 650 }).catch(() => {});
          await sleep(1000);
        }
        const now = new Date().toISOString();
        const previous = loadTerafabxState();
        const record = { at: now, count: liked.length, liked, manual };
        saveTerafabxState({ lastHeartRunAt: now, lastHeartStatus: "ok", lastHeartError: null, lastHeartCount: liked.length, heartHistory: [record, ...(previous.heartHistory || [])].slice(0, 100) });
        logEvent("terafabx_heart_done", record);
        return { ok: true, action: "heart", ...record };
      } finally {
        await page.close();
      }
    });
  } catch (error) {
    saveTerafabxState({ lastHeartRunAt: new Date().toISOString(), lastHeartStatus: "error", lastHeartError: error.message });
    logEvent("terafabx_heart_error", { error: error.message });
    throw error;
  } finally {
    terafabxBusy = false;
  }
}

function getTerafabxAutomationStatus() {
  const state = loadTerafabxState();
  const now = Date.now();
  const lastCommentMs = state.lastCommentRunAt ? new Date(state.lastCommentRunAt).getTime() : 0;
  const lastHeartMs = state.lastHeartRunAt ? new Date(state.lastHeartRunAt).getTime() : 0;
  return {
    ok: true,
    grokBin: GROK_BIN,
    chromePort: CHROME_PORT,
    requiredXHandle: REQUIRED_X_HANDLE,
    busy: terafabxBusy,
    schedulerBusy: terafabxSchedulerBusy,
    jobGapMs: TERAFABX_JOB_GAP_MS,
    lock: getTerafabxLockState(),
    comment: {
      enabled: Boolean(state.commentEnabled),
      intervalMs: TERAFABX_COMMENT_INTERVAL_MS,
      nextRunAt: state.commentEnabled ? new Date(Math.max(now, lastCommentMs + TERAFABX_COMMENT_INTERVAL_MS)).toISOString() : null,
      lastRunAt: state.lastCommentRunAt,
      lastStatus: state.lastCommentStatus,
      lastError: state.lastCommentError,
      lastComment: state.lastComment,
      lastTarget: state.lastCommentTarget,
      lastReplyUrl: state.lastReplyUrl,
      history: (state.commentHistory || []).slice(0, 5),
    },
    heart: {
      enabled: Boolean(state.heartEnabled),
      intervalMs: TERAFABX_HEART_INTERVAL_MS,
      nextRunAt: state.heartEnabled ? new Date(Math.max(now, lastHeartMs + TERAFABX_HEART_INTERVAL_MS)).toISOString() : null,
      lastRunAt: state.lastHeartRunAt,
      lastStatus: state.lastHeartStatus,
      lastError: state.lastHeartError,
      lastCount: state.lastHeartCount || 0,
      history: (state.heartHistory || []).slice(0, 5),
    },
  };
}

async function maybeRunTerafabxAutomation() {
  if (terafabxSchedulerBusy || terafabxBusy) return;
  terafabxSchedulerBusy = true;
  const runStartedAt = new Date().toISOString();
  const jobs = [];
  const state = loadTerafabxState();
  const now = Date.now();
  const lastCommentMs = state.lastCommentRunAt ? new Date(state.lastCommentRunAt).getTime() : 0;
  const lastHeartMs = state.lastHeartRunAt ? new Date(state.lastHeartRunAt).getTime() : 0;
  if (state.commentEnabled && now - lastCommentMs >= TERAFABX_COMMENT_INTERVAL_MS) {
    jobs.push({ name: "comment", overdueMs: now - lastCommentMs - TERAFABX_COMMENT_INTERVAL_MS });
  }
  if (state.heartEnabled && now - lastHeartMs >= TERAFABX_HEART_INTERVAL_MS) {
    jobs.push({ name: "heart", overdueMs: now - lastHeartMs - TERAFABX_HEART_INTERVAL_MS });
  }
  jobs.sort((a, b) => b.overdueMs - a.overdueMs);
  if (!jobs.length) {
    terafabxSchedulerBusy = false;
    return;
  }
  logEvent("terafabx_auto_queue_start", { runStartedAt, jobs });
  try {
    for (let index = 0; index < jobs.length; index += 1) {
      const job = jobs[index];
      try {
        logEvent("terafabx_auto_job_start", { job: job.name, index, total: jobs.length });
        if (job.name === "comment") {
          await runTerafabxCommentOnce({ manual: false });
        } else {
          await runTerafabxHeartOnce({ manual: false });
        }
        logEvent("terafabx_auto_job_done", { job: job.name, index, total: jobs.length });
      } catch (error) {
        logEvent(`terafabx_auto_${job.name}_error`, { error: error.message });
      }
      if (index < jobs.length - 1) {
        logEvent("terafabx_auto_job_gap", { after: job.name, gapMs: TERAFABX_JOB_GAP_MS });
        await sleep(TERAFABX_JOB_GAP_MS);
      }
    }
  } finally {
    terafabxSchedulerBusy = false;
    logEvent("terafabx_auto_queue_done", { runStartedAt });
  }
}

function validateThreadsUrl(value) {
  const parsed = new URL(value);
  if (!/^www\.threads\.(com|net)$|^threads\.(com|net)$/.test(parsed.hostname)) {
    throw new Error("threads.com 또는 threads.net URL만 허용됩니다.");
  }
  const match = parsed.pathname.match(/^\/@([^/]+)\/post\/([^/]+)/);
  if (!match) throw new Error("Threads 원글 URL 형식이 아닙니다.");
  return `https://www.threads.com/@${match[1]}/post/${match[2]}`;
}

function parseCompactCount(value) {
  const text = String(value || "").trim().replace(/,/g, "");
  const match = text.match(/^(\d+(?:\.\d+)?)\s*([천만kKmM]?)$/);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  const unit = match[2].toLowerCase();
  if (unit === "천" || unit === "k") return Math.round(number * 1000);
  if (unit === "만") return Math.round(number * 10000);
  if (unit === "m") return Math.round(number * 1000000);
  return Math.round(number);
}

function assessDiscoveryCandidate(candidate, post) {
  const text = String(post.text || candidate.textPreview || "").trim();
  const compactText = text.replace(/\s+/g, " ");
  const mediaCandidates = post.diagnostics?.mediaCandidates || [];
  const firstMedia = mediaCandidates[0] || {};
  const hasStrongMedia = post.mediaUrls.length > 0 && (
    post.mediaUrls.length >= 2 ||
    ((firstMedia.width || 0) >= 240 && (firstMedia.height || 0) >= 240)
  );
  const isShortHook = compactText.length >= 8 && compactText.length <= 120 && text.split("\n").filter(Boolean).length <= 4;
  const controversyPattern = /(논란|민폐|이해|어디까지|vs|VS|맞다|틀리|최악|충격|소름|욕|왜|뭐가|가능|해야|말아|남편|아내|직장|회사|상사|알바|손님|부모|시댁|결혼|연애|이혼|돈|월급|사장|아이|엄마|아빠|교사|학생|빌런|개념|무개념|진상|사퇴|아웃|선넘|꼰대|갑질|을질|차별|불륜|바람|싸움|분노|황당|실화|ㄷㄷ|ㅋㅋ|\\?)/;
  const hasControversy = controversyPattern.test(compactText);
  const isLongInfoPost = /(정리했|방법|꿀팁|전자책|프로젝트|오픈소스|깃허브|1\\.|2\\.|3\\.|4\\.|5\\.)/.test(compactText) || compactText.length > 140;
  let viralScore = 0;
  if (isShortHook) viralScore += 1;
  if (hasStrongMedia) viralScore += 1;
  if (hasControversy) viralScore += 1;
  if (candidate.likeCount >= 3000) viralScore += 1;
  if (isLongInfoPost) viralScore -= 2;
  const pass = viralScore >= DISCOVERY_MIN_VIRAL_SCORE && isShortHook && hasStrongMedia && hasControversy && !isLongInfoPost;
  const reasons = [];
  if (!isShortHook) reasons.push("not_short_hook");
  if (!hasStrongMedia) reasons.push("not_strong_media");
  if (!hasControversy) reasons.push("not_controversial");
  if (isLongInfoPost) reasons.push("long_info_post");
  return {
    pass,
    viralScore,
    reasons,
    isShortHook,
    hasStrongMedia,
    hasControversy,
  };
}

function looksLikeSocialHandle(line) {
  return /^@?[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9_])$/i.test(String(line || "").trim());
}

function looksLikeLocationLine(line) {
  const text = String(line || "").trim();
  if (!text || text.length > 80) return false;
  if (/^[A-Z][A-Za-z .'-]{1,40},\s*(?:A[LKSZR]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEHINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AIT]|W[AIVY])$/.test(text)) return true;
  return /^[A-Z][A-Za-z .'-]{1,40},\s*[A-Z][A-Za-z .'-]{1,40}$/.test(text);
}

function cleanDiscoveryPreviewText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  let lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 1 && looksLikeSocialHandle(lines[0])) return "";
  lines = lines.filter((line) => !looksLikeSocialHandle(line) && !looksLikeLocationLine(line));
  const normalizeComparableLine = (line) => line
    .replace(/[.。!！?？"'“”‘’()[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  while (lines.length >= 2 && normalizeComparableLine(lines[0]) && normalizeComparableLine(lines[0]) === normalizeComparableLine(lines[1])) {
    lines = lines.slice(1);
  }
  return lines.join("\n").trim();
}

function cleanThreadText(raw, expectedHandle = "") {
  const lines = String(raw || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const skipped = new Set(["로그인", "스레드", "인기순", "활동 보기"]);
  const normalizedExpectedHandle = String(expectedHandle || "").replace(/^@/, "").toLowerCase();
  const kept = [];
  for (const line of lines) {
    if (skipped.has(line)) continue;
    const normalizedLine = line.replace(/^@/, "").toLowerCase();
    if (looksLikeSocialHandle(line)) {
      if (normalizedLine === normalizedExpectedHandle) continue;
      if (kept.length > 0) break;
    }
    if (/^\d+$/.test(line)) {
      if (kept.length > 0) break;
      continue;
    }
    if (/^\d+\s*\/?$/.test(line)) continue;
    if (/^\d+\s*\/\s*\d+$/.test(line)) continue;
    if (line === "/") continue;
    if (/^\d+[.,]?\d*[천만]?$/.test(line)) {
      if (kept.length > 0) break;
      continue;
    }
    if (/^\d+\s*(초|분|시간|일)$/.test(line)) continue;
    if (/님에게 답글 남기기/.test(line)) break;
    if (looksLikeLocationLine(line)) continue;
    if (/^\S+$/.test(line) && kept.length === 0) continue;
    if (/^\d+\s*(초|분|시간|일)전?$/.test(line)) continue;
    if (line === "·" || line === "작성자") continue;
    kept.push(line);
    if (kept.length >= 12) break;
  }
  let text = kept.join("\n").trim();
  if (text.length > 280) text = `${text.slice(0, 279)}…`;
  return text;
}

async function extractThreadPost(sourceUrl, options = {}) {
  const page = await newPage(sourceUrl);
  try {
    const expectedHandle = new URL(sourceUrl).pathname.split("/")[1].replace("@", "");
    await sleep(9000);
    await page.eval(`(() => {
      const video = document.querySelector("video");
      if (video) {
        video.scrollIntoView({ block: "center" });
        video.muted = true;
        video.play().catch(() => {});
      }
      return true;
    })()`);
    await sleep(5000);
    const data = await page.eval(`(() => {
      const expectedHandle = "${expectedHandle}";
      const looksLikeSocialHandle = (value) => /^@?[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9_])$/i.test((value || "").trim());
      const article = document.querySelector('div[role="article"]') || document.body;
      const rectOk = (el) => {
        const r = el.getBoundingClientRect();
        return r.width >= 120 && r.height >= 120;
      };
      const handleNode = Array.from(article.querySelectorAll("span, a, div"))
        .find((el) => (el.innerText || "").trim().replace(/^@/, "") === expectedHandle);
      const handleRect = handleNode ? handleNode.getBoundingClientRect() : null;
      const mediaInfo = (el, kind) => {
        const r = el.getBoundingClientRect();
        return {
          kind,
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
          src: kind === "video" ? (el.currentSrc || el.src) : (el.currentSrc || el.src),
        };
      };
      const allMedia = [
        ...Array.from(article.querySelectorAll("video")).map((el) => mediaInfo(el, "video")),
        ...Array.from(article.querySelectorAll("img")).filter(rectOk).map((el) => mediaInfo(el, "image")),
      ]
        .filter((item) => item.src && (item.kind === "video" || /cdninstagram|fbcdn/.test(item.src)))
        .filter((item) => !handleRect || item.top > handleRect.bottom)
        .sort((a, b) => a.top - b.top || a.left - b.left);
      const firstMediaTop = allMedia[0]?.top;
      const mediaBand = Number.isFinite(firstMediaTop)
        ? allMedia.filter((item) => item.top <= firstMediaTop + 260)
        : [];
      const getPostText = () => {
        const text = article.innerText || "";
        const lines = text.split("\\n").map((line) => line.trim()).filter(Boolean);
        const handleIndex = lines.findIndex((line) => /^@?[^\\s]+$/.test(line) && line.replace(/^@/, "") === "${new URL(sourceUrl).pathname.split("/")[1].replace("@", "")}");
        const start = handleIndex >= 0 ? handleIndex + 1 : 0;
        const out = [];
        for (let i = start; i < lines.length; i++) {
          const line = lines[i];
          if (/^\\d+$/.test(line) && out.length > 0) break;
          if (/^\\d+[.,]?\\d*[천만]?$/.test(line) && out.length > 0) break;
          if (/^\\d+\\s*(초|분|시간|일)$/.test(line)) continue;
          if (/^\\d+\\s*(초|분|시간|일)전?$/.test(line)) continue;
          if (line === "·" || line === "작성자") continue;
          if (looksLikeSocialHandle(line)) {
            if (line.replace(/^@/, "").toLowerCase() === expectedHandle.toLowerCase()) continue;
            if (out.length > 0) break;
          }
          out.push(line);
          if (out.length >= 10) break;
        }
        return out.join("\\n");
      };
      const getActionCounts = () => {
        const lines = (document.body.innerText || "").split("\\n").map((line) => line.trim()).filter(Boolean);
        const handleIndex = lines.findIndex((line) => line.replace(/^@/, "") === expectedHandle);
        const counts = [];
        for (let i = Math.max(0, handleIndex + 1); i < lines.length; i++) {
          const line = lines[i];
          if (/인기순|활동 보기|님에게 답글 남기기/.test(line)) break;
          if (/^\\d+(?:\\.\\d+)?\\s*([천만kKmM]?)$/.test(line.replace(/,/g, ""))) counts.push(line);
          if (counts.length >= 4) break;
        }
        return counts;
      };
      const selectedMedia = [];
      for (const item of mediaBand) {
        if (selectedMedia.length >= ${MAX_MEDIA}) break;
        const duplicateSlot = selectedMedia.some((existing) =>
          Math.abs(existing.top - item.top) < 8 &&
          Math.abs(existing.left - item.left) < 8 &&
          Math.abs(existing.width - item.width) < 8 &&
          Math.abs(existing.height - item.height) < 8
        );
        if (duplicateSlot && item.kind === "image") continue;
        selectedMedia.push(item);
      }
      const videos = mediaBand.filter((item) => item.kind === "video").map((item) => item.src);
      const images = mediaBand.filter((item) => item.kind === "image").map((item) => item.src);
      const links = Array.from(article.querySelectorAll("a[href]"))
        .map((a) => a.href)
        .filter((href) => href && !href.includes("threads.com") && !href.includes("instagram.com"))
        .slice(0, 3);
      return {
        text: getPostText(),
        selectedMedia: selectedMedia.map((item) => ({ kind: item.kind, src: item.src })),
        actionCounts: getActionCounts(),
        videos,
        images,
        links,
        diagnostics: {
          handleFound: Boolean(handleRect),
          mediaCandidateCount: allMedia.length,
          mediaBandCount: mediaBand.length,
          mediaCandidates: allMedia.slice(0, 8).map((item) => ({
            kind: item.kind,
            top: Math.round(item.top),
            width: Math.round(item.width),
            height: Math.round(item.height),
            src: item.src.slice(0, 160),
          })),
        },
      };
    })()`);
    const videoUrls = unique(data.videos || []);
    const imageUrls = unique(data.images || []);
    const mediaUrls = unique((data.selectedMedia || []).map((item) => item.src)).slice(0, MAX_MEDIA);
    const actionCounts = Array.isArray(data.actionCounts) ? data.actionCounts : [];
    const detailLikeCount = parseCompactCount(actionCounts[0]);
    const extraLinks = unique(data.links || []);
    let text = cleanThreadText(data.text, expectedHandle);
    if (extraLinks.length) {
      const linkText = extraLinks.join("\n");
      text = text ? `${text}\n\n${linkText}` : linkText;
    }
    if (!text && !options.allowEmptyText) throw new Error("Threads 원문 텍스트를 추출하지 못했습니다.");
    return {
      text,
      mediaUrls,
      imageMediaUrls: imageUrls.slice(0, MAX_MEDIA),
      videoMediaUrls: videoUrls.slice(0, MAX_MEDIA),
      likeCount: Number.isFinite(detailLikeCount) ? detailLikeCount : null,
      diagnostics: {
        ...(data.diagnostics || {}),
        actionCounts,
        videoCount: videoUrls.length,
        imageCount: imageUrls.length,
        selectedMediaCount: mediaUrls.length,
        selectedMedia: mediaUrls.map((url) => url.slice(0, 160)),
      },
    };
  } finally {
    await page.close();
  }
}

async function discoverThreadsTimeline(options = {}) {
  const minLikes = Number(options.minLikes || DISCOVERY_MIN_LIKES);
  const maxScrolls = Number(options.maxScrolls || DISCOVERY_MAX_SCROLLS);
  const page = await newPage("https://www.threads.com/");
  try {
    await sleep(9000);
    const candidatesByUrl = new Map();
    for (let scroll = 0; scroll <= maxScrolls; scroll += 1) {
      const batch = await page.eval(`((minLikes) => {
        const parseCompactCount = (value) => {
          const text = String(value || "").trim().replace(/,/g, "");
          const match = text.match(/^(\\d+(?:\\.\\d+)?)\\s*([천만kKmM]?)$/);
          if (!match) return null;
          const number = Number(match[1]);
          if (!Number.isFinite(number)) return null;
          const unit = match[2].toLowerCase();
          if (unit === "천" || unit === "k") return Math.round(number * 1000);
          if (unit === "만") return Math.round(number * 10000);
          if (unit === "m") return Math.round(number * 1000000);
          return Math.round(number);
        };
        const canonical = (href) => {
          try {
            const url = new URL(href);
            const match = url.pathname.match(/^\\/@([^/]+)\\/post\\/([^/]+)/);
            if (!match) return null;
            return "https://www.threads.com/@" + match[1] + "/post/" + match[2];
          } catch {
            return null;
          }
        };
      const linesOf = (node) => String(node?.innerText || "")
          .split("\\n")
          .map((line) => line.trim())
          .filter(Boolean);
        const looksLikeLocationLine = (line) => {
          const text = String(line || "").trim();
          if (!text || text.length > 80) return false;
          if (/^[A-Z][A-Za-z .'-]{1,40},\\s*(?:A[LKSZR]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEHINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AIT]|W[AIVY])$/.test(text)) return true;
          return /^[A-Z][A-Za-z .'-]{1,40},\\s*[A-Z][A-Za-z .'-]{1,40}$/.test(text);
        };
        const looksLikeSocialHandle = (line) => /^@?[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9_])$/i.test(String(line || "").trim());
        const mediaCountOf = (node) => Array.from(node.querySelectorAll("img, video"))
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            const src = el.currentSrc || el.src || "";
            return rect.width >= 100 && rect.height >= 100 && /cdninstagram|fbcdn/.test(src);
          }).length;
        const postLinks = Array.from(document.querySelectorAll('a[href*="/post/"]'))
          .map((link) => ({ link, canonicalUrl: canonical(link.href) }))
          .filter((item) => item.canonicalUrl);
        const seen = new Set();
        const out = [];
        for (const item of postLinks) {
          if (seen.has(item.canonicalUrl)) continue;
          seen.add(item.canonicalUrl);
          const parsed = item.canonicalUrl.match(/\\/(@[^/]+)\\/post\\//);
          const author = parsed ? parsed[1].slice(1) : "";
          let best = null;
          let node = item.link;
          for (let depth = 0; node && depth < 14; depth += 1, node = node.parentElement) {
            const rect = node.getBoundingClientRect();
            if (rect.width < 240 || rect.height < 40 || rect.height > 1800) continue;
            const lines = linesOf(node);
            if (!lines.includes(author)) continue;
            const postLinkCount = new Set(Array.from(node.querySelectorAll('a[href*="/post/"]'))
              .map((link) => canonical(link.href))
              .filter(Boolean)).size;
            if (postLinkCount !== 1) continue;
            const mediaCount = mediaCountOf(node);
            const buttons = Array.from(node.querySelectorAll('button, [role="button"]'))
              .map((button) => linesOf(button).join(""))
              .filter(Boolean);
            const likeCount = parseCompactCount(buttons[0]);
            best = {
              lines,
              mediaCount,
              likeCount,
              buttonTexts: buttons,
            };
            if (mediaCount > 0 && likeCount !== null) break;
          }
          if (!best || best.mediaCount <= 0 || !Number.isFinite(best.likeCount) || best.likeCount < minLikes) continue;
          const stopIndex = best.lines.findIndex((line) => parseCompactCount(line) !== null && best.buttonTexts.includes(line));
          const textLines = best.lines
            .slice(0, stopIndex >= 0 ? stopIndex : Math.min(best.lines.length, 8))
            .filter((line) => line !== author && !/^\\d+\\s*(초|분|시간|일|주|개월|년)$/.test(line))
            .filter((line) => !/^\\d+\\s*\\/?$/.test(line) && line !== "/" && !/^\\d+\\s*\\/\\s*\\d+$/.test(line))
            .filter((line) => !looksLikeLocationLine(line))
            .filter((line) => !looksLikeSocialHandle(line))
            .slice(0, 5);
          out.push({
            canonicalUrl: item.canonicalUrl,
            author,
            textPreview: textLines.join("\\n").slice(0, 240),
            likeCount: best.likeCount,
            mediaCount: Math.min(best.mediaCount, 4),
          });
        }
        return out;
      })(${minLikes})`);
      for (const item of batch) {
        const current = candidatesByUrl.get(item.canonicalUrl);
        if (!current || item.likeCount > current.likeCount) {
          candidatesByUrl.set(item.canonicalUrl, item);
        }
      }
      await page.eval(`window.scrollBy(0, Math.max(900, window.innerHeight * 1.5)); true`);
      await sleep(1800);
    }
    const candidates = Array.from(candidatesByUrl.values())
      .sort((a, b) => b.likeCount - a.likeCount);
    logEvent("discovery_scan_done", { found: candidates.length, minLikes, maxScrolls });
    return candidates;
  } finally {
    await page.close();
  }
}

async function processDueDiscoveryPost(options = {}) {
  return { ok: true, processed: false, disabled: true, reason: "discovery_requires_manual_dashboard_post" };
}

async function processDiscoveryDraft(options = {}) {
  if (busy) return { ok: false, skipped: true, reason: "busy" };
  const db = await getDiscoveryDb();
  const row = await db.prepare(`
    SELECT canonical_url AS canonicalUrl, attempts
    FROM thread_discoveries
    WHERE status IN ('draft', 'failed_draft')
    ORDER BY discovered_at ASC
    LIMIT 1
  `).get();
  if (!row) return { ok: true, processed: false };

  busy = true;
  await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'drafting', attempts = attempts + 1, last_error = NULL
    WHERE canonical_url = ?
  `).run(row.canonicalUrl);
  logEvent("discovery_x_draft_start", { canonicalUrl: row.canonicalUrl, source: options.source || null });
  try {
    const result = await createXDraftFromThread(row.canonicalUrl);
    await db.prepare(`
      UPDATE thread_discoveries
      SET status = 'x_draft', posted_at = CURRENT_TIMESTAMP, last_error = NULL
      WHERE canonical_url = ?
    `).run(row.canonicalUrl);
    logEvent("discovery_x_draft_success", { canonicalUrl: row.canonicalUrl, mediaCount: result.mediaCount });
    return { ok: true, processed: true, canonicalUrl: row.canonicalUrl, result };
  } catch (error) {
    await db.prepare(`
      UPDATE thread_discoveries
      SET status = 'failed_draft', last_error = ?
      WHERE canonical_url = ?
    `).run(error.message, row.canonicalUrl);
    logEvent("discovery_x_draft_error", { canonicalUrl: row.canonicalUrl, error: error.message });
    return { ok: false, processed: true, canonicalUrl: row.canonicalUrl, error: error.message };
  } finally {
    busy = false;
  }
}

async function runDiscoveryScan(options = {}) {
  if (!options.manual && !isAutoDiscoveryEnabled()) {
    return { ok: true, skipped: true, reason: "auto_discovery_disabled" };
  }
  if (discoveryScanBusy) return { ok: true, skipped: true, reason: "scan_busy" };
  discoveryScanBusy = true;
  try {
    const candidates = await discoverThreadsTimeline({
      minLikes: options.minLikes || DISCOVERY_MIN_LIKES,
      maxScrolls: options.maxScrolls || DISCOVERY_MAX_SCROLLS,
    });
    const validated = [];
    const rejected = [];
    for (const candidate of candidates) {
      try {
        const post = await extractThreadPost(candidate.canonicalUrl, { allowEmptyText: true });
        if (post.mediaUrls.length <= 0) {
          rejected.push({ canonicalUrl: candidate.canonicalUrl, reason: "no_media_after_detail_extract" });
          continue;
        }
        const assessment = assessDiscoveryCandidate(candidate, post);
        const likeCount = Number.isFinite(post.likeCount) ? post.likeCount : candidate.likeCount;
        if (!Number.isFinite(likeCount) || likeCount < (options.minLikes || DISCOVERY_MIN_LIKES)) {
          rejected.push({ canonicalUrl: candidate.canonicalUrl, reason: "detail_like_count_below_threshold", likeCount });
          continue;
        }
        const textPreview = cleanDiscoveryPreviewText(post.text || candidate.textPreview || "");
        if (!textPreview) {
          rejected.push({ canonicalUrl: candidate.canonicalUrl, reason: "no_valid_text_after_detail_extract" });
          continue;
        }
        validated.push({
          ...candidate,
          likeCount,
          textPreview: textPreview.slice(0, 240),
          mediaPreviewUrl: post.mediaUrls[0] || post.imageMediaUrls?.[0] || "",
          mediaCount: post.mediaUrls.length,
          viralScore: assessment.viralScore,
          criteria: JSON.stringify({
            minLikes: true,
            hasMedia: true,
            shortHook: assessment.isShortHook,
            strongMedia: assessment.hasStrongMedia,
            controversy: assessment.hasControversy,
            reasons: assessment.reasons,
          }),
        });
      } catch (error) {
        rejected.push({ canonicalUrl: candidate.canonicalUrl, reason: error.message });
      }
    }
    const saved = await saveDiscoveryCandidates(validated);
    logEvent("discovery_saved", { found: candidates.length, validated: validated.length, rejected: rejected.length, ...saved });
    return { ok: true, found: candidates.length, validated: validated.length, rejected, saved, candidates: validated };
  } finally {
    discoveryScanBusy = false;
  }
}

function unique(values) {
  return Array.from(new Set(values.filter((value) => {
    if (!value) return false;
    return /^https?:\/\//i.test(value);
  })));
}

async function downloadMedia(urls) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "thread-mirror-"));
  const files = [];
  for (let i = 0; i < urls.length; i++) {
    const parsed = new URL(urls[i]);
    const ext = parsed.pathname.includes(".mp4") ? ".mp4" : ".jpg";
    const file = path.join(dir, `media-${i + 1}${ext}`);
    await downloadFile(urls[i], file);
    files.push(file);
  }
  return { dir, files };
}

function downloadFile(url, file) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? require("https") : require("http");
    const req = client.get(url, { headers: { "user-agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, file).then(resolve, reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`media download failed: HTTP ${res.statusCode}`));
        return;
      }
      const out = fs.createWriteStream(file);
      res.pipe(out);
      out.on("finish", () => out.close(resolve));
      out.on("error", reject);
    });
    req.on("error", reject);
  });
}

async function verifyXAccount(page) {
  await page.navigate("https://x.com/home", 7000);
  const accountState = await page.eval(`(() => {
    const button = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    const profileLink = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
    const avatar = document.querySelector('[data-testid^="UserAvatar-Container-"]');
    return {
      accountText: button?.innerText || "",
      profileHref: profileLink?.href || "",
      avatarTestId: avatar?.getAttribute("data-testid") || "",
      bodyText: document.body.innerText || "",
    };
  })()`);
  const haystack = [
    accountState.accountText,
    accountState.profileHref,
    accountState.avatarTestId,
  ].join("\n").toLowerCase();
  if (
    !haystack.includes(`@${REQUIRED_X_HANDLE}`) &&
    !haystack.includes(`/${REQUIRED_X_HANDLE}`) &&
    !haystack.includes(`-${REQUIRED_X_HANDLE}`)
  ) {
    throw new Error(`X 로그인 계정 검증 실패: @${REQUIRED_X_HANDLE}가 아닙니다.`);
  }
}

async function waitForComposer(page) {
  for (let i = 0; i < 20; i++) {
    const ok = await page.eval(`Boolean(document.querySelector('[data-testid="tweetTextarea_0"]'))`);
    if (ok) return;
    await sleep(500);
  }
  throw new Error("X 작성창을 찾지 못했습니다.");
}

async function postToX(threadPost, mediaFiles, options = {}) {
  const page = await newPage("https://x.com/home");
  try {
    await verifyXAccount(page);
    await page.navigate("https://x.com/compose/post", 5000);
    await waitForComposer(page);
    await page.eval(`(() => {
      const box = document.querySelector('[data-testid="tweetTextarea_0"]');
      box.focus();
      return true;
    })()`);
    await page.send("Input.insertText", { text: threadPost.text });
    await sleep(1000);

    if (mediaFiles.length) {
      const root = await page.send("DOM.getDocument", { depth: -1, pierce: true });
      const node = await page.send("DOM.querySelector", {
        nodeId: root.root.nodeId,
        selector: 'input[type="file"]',
      });
      if (!node.nodeId) throw new Error("X 미디어 업로드 input을 찾지 못했습니다.");
      await page.send("DOM.setFileInputFiles", { nodeId: node.nodeId, files: mediaFiles });
      await waitForUploadToSettle(page, mediaFiles.length, mediaFiles);
    }

    let scheduledAt = null;
    if (options.schedule) {
      scheduledAt = options.scheduledAt || nextAvailableScheduleTime();
      await setXSchedule(page, scheduledAt);
    }

    const canPost = await waitForPostButton(page, mediaFiles.length);
    if (!canPost.ok) {
      throw new Error(`X 게시 버튼이 활성화되지 않았습니다: ${canPost.reason}`);
    }
    await page.eval(`(() => {
      const buttons = Array.from(document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'));
      const button = buttons.find((btn) => btn.getAttribute("aria-disabled") !== "true" && !btn.disabled);
      button.click();
      return true;
    })()`);
    await sleep(5000);
    if (scheduledAt) recordScheduleSlot(scheduledAt);
    return { scheduledAt };
  } finally {
    await page.close();
    logEvent("x_tab_closed", {});
  }
}

async function saveComposeAsXDraft(page) {
  const closeClicked = await page.eval(`(() => {
    const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
    const closeButton = candidates.find((el) => {
      const label = (el.getAttribute("aria-label") || el.innerText || "").trim();
      return /^(Close|닫기|Back|뒤로)$/i.test(label);
    });
    if (!closeButton) return false;
    closeButton.click();
    return true;
  })()`);
  if (!closeClicked) {
    throw new Error("X 초안 저장용 닫기 버튼을 찾지 못했습니다.");
  }
  await sleep(1000);
  const saved = await page.eval(`(() => {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    const saveButton = buttons.find((el) => {
      const text = (el.innerText || el.getAttribute("aria-label") || "").trim();
      return /^(Save|저장|초안 저장|Save draft)$/i.test(text);
    });
    if (!saveButton) return false;
    saveButton.click();
    return true;
  })()`);
  if (!saved) {
    const state = await page.eval(`(() => ({
      bodyText: (document.body.innerText || "").slice(0, 1000),
      buttons: Array.from(document.querySelectorAll('button, [role="button"]')).map((el) => ({
        text: (el.innerText || "").trim(),
        label: (el.getAttribute("aria-label") || "").trim(),
      })).slice(0, 40),
    }))()`);
    throw new Error(`X 초안 저장 버튼을 찾지 못했습니다: ${JSON.stringify(state)}`);
  }
  await sleep(1500);
}

async function createXDraft(threadPost, mediaFiles) {
  const page = await newPage("https://x.com/home");
  try {
    await verifyXAccount(page);
    await page.navigate("https://x.com/compose/post", 5000);
    await waitForComposer(page);
    await page.eval(`(() => {
      const box = document.querySelector('[data-testid="tweetTextarea_0"]');
      box.focus();
      return true;
    })()`);
    await page.send("Input.insertText", { text: threadPost.text });
    await sleep(1000);

    if (mediaFiles.length) {
      const root = await page.send("DOM.getDocument", { depth: -1, pierce: true });
      const node = await page.send("DOM.querySelector", {
        nodeId: root.root.nodeId,
        selector: 'input[type="file"]',
      });
      if (!node.nodeId) throw new Error("X 미디어 업로드 input을 찾지 못했습니다.");
      await page.send("DOM.setFileInputFiles", { nodeId: node.nodeId, files: mediaFiles });
      await waitForUploadToSettle(page, mediaFiles.length, mediaFiles);
    }

    const canPost = await waitForPostButton(page, mediaFiles.length);
    if (!canPost.ok) {
      throw new Error(`X 초안 저장 전 작성 상태가 준비되지 않았습니다: ${canPost.reason}`);
    }
    await saveComposeAsXDraft(page);
    return {};
  } finally {
    await page.close();
    logEvent("x_tab_closed", { draft: true });
  }
}

function loadScheduleSlots() {
  try {
    const raw = fs.readFileSync(SCHEDULE_SLOTS_PATH, "utf8");
    const slots = JSON.parse(raw);
    return Array.isArray(slots) ? slots : [];
  } catch {
    return [];
  }
}

function saveScheduleSlots(slots) {
  fs.writeFileSync(SCHEDULE_SLOTS_PATH, JSON.stringify(slots.slice(-200), null, 2));
}

function nextAvailableScheduleTime() {
  const now = new Date();
  let candidate = new Date(now.getTime() + 20 * 60 * 1000);
  candidate.setSeconds(0, 0);
  const minute = candidate.getMinutes();
  candidate.setMinutes(Math.ceil(minute / 5) * 5);
  const slots = loadScheduleSlots()
    .map((entry) => new Date(entry.scheduledAt).getTime())
    .filter((time) => Number.isFinite(time) && time > now.getTime() - 24 * 60 * 60 * 1000);
  let changed;
  do {
    changed = false;
    for (const slot of slots) {
      if (Math.abs(slot - candidate.getTime()) < SCHEDULE_SPACING_MS) {
        candidate = new Date(slot + SCHEDULE_SPACING_MS);
        changed = true;
      }
    }
  } while (changed);
  return candidate;
}

async function nextAutoScheduleTime() {
  const now = Date.now();
  const times = [
    ...loadScheduleSlots().map((entry) => entry.scheduledAt),
    ...loadMirrorHistory().filter((entry) => entry.status === "scheduled").map((entry) => entry.scheduledAt),
  ]
    .map((value) => new Date(value).getTime())
    .filter((time) => Number.isFinite(time) && time > now);
  try {
    const db = await getDiscoveryDb();
    const rows = await db.prepare(`
      SELECT scheduled_post_at AS scheduledAt
      FROM thread_discoveries
      WHERE scheduled_post_at IS NOT NULL
    `).all();
    for (const row of rows) {
      const time = new Date(row.scheduledAt).getTime();
      if (Number.isFinite(time) && time > now) times.push(time);
    }
  } catch (error) {
    logEvent("auto_schedule_time_db_error", { error: error.message });
  }
  const latest = times.length ? Math.max(...times) : 0;
  const candidate = new Date(Math.max(latest, now) + 30 * 60 * 1000);
  if (candidate.getSeconds() || candidate.getMilliseconds()) {
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  candidate.setSeconds(0, 0);
  return candidate;
}

function recordScheduleSlot(scheduledAt) {
  const slots = loadScheduleSlots();
  slots.push({ scheduledAt: scheduledAt.toISOString(), recordedAt: new Date().toISOString() });
  saveScheduleSlots(slots);
}

function loadMirrorHistory() {
  try {
    const raw = fs.readFileSync(MIRROR_HISTORY_PATH, "utf8");
    const history = JSON.parse(raw);
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function saveMirrorHistory(history) {
  fs.writeFileSync(MIRROR_HISTORY_PATH, JSON.stringify(history.slice(-500), null, 2));
}

function findCompletedMirror(canonicalUrl) {
  return loadMirrorHistory()
    .slice()
    .reverse()
    .find((entry) => entry.canonicalUrl === canonicalUrl && ["posted", "scheduled"].includes(entry.status));
}

function recordCompletedMirror(entry) {
  const history = loadMirrorHistory();
  const withoutSameUrl = history.filter((item) => item.canonicalUrl !== entry.canonicalUrl);
  withoutSameUrl.push({
    canonicalUrl: entry.canonicalUrl,
    status: entry.status,
    scheduledAt: entry.scheduledAt || null,
    mediaCount: entry.mediaCount,
    completedAt: new Date().toISOString(),
  });
  saveMirrorHistory(withoutSameUrl);
}

async function getDiscoveryDb() {
  if (!discoveryDbPromise) {
    discoveryDbPromise = (async () => {
      fs.mkdirSync(path.dirname(DISCOVERY_DB_PATH), { recursive: true });
      const { connect } = await import("@tursodatabase/database");
      const db = await connect(DISCOVERY_DB_PATH);
      await db.exec(`
        CREATE TABLE IF NOT EXISTS thread_discoveries (
          canonical_url TEXT PRIMARY KEY,
          author TEXT NOT NULL,
          text_preview TEXT NOT NULL DEFAULT '',
          media_preview_url TEXT NOT NULL DEFAULT '',
          like_count INTEGER NOT NULL DEFAULT 0,
          media_count INTEGER NOT NULL DEFAULT 0,
          viral_score INTEGER NOT NULL DEFAULT 0,
          criteria TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'queued',
          scheduled_post_at TEXT,
          discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          posted_at TEXT,
          last_error TEXT,
          attempts INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_thread_discoveries_status_time
          ON thread_discoveries(status, scheduled_post_at);
      `);
      const columns = await db.prepare(`PRAGMA table_info(thread_discoveries)`).all();
      const columnNames = new Set(columns.map((column) => column.name));
      if (!columnNames.has("viral_score")) {
        await db.exec(`ALTER TABLE thread_discoveries ADD COLUMN viral_score INTEGER NOT NULL DEFAULT 0`);
      }
      if (!columnNames.has("criteria")) {
        await db.exec(`ALTER TABLE thread_discoveries ADD COLUMN criteria TEXT NOT NULL DEFAULT ''`);
      }
      if (!columnNames.has("media_preview_url")) {
        await db.exec(`ALTER TABLE thread_discoveries ADD COLUMN media_preview_url TEXT NOT NULL DEFAULT ''`);
      }
      return db;
    })();
  }
  return discoveryDbPromise;
}

async function getNextDiscoveryPostTime(db) {
  const row = await db.prepare(`
    SELECT scheduled_post_at, posted_at
    FROM thread_discoveries
    WHERE scheduled_post_at IS NOT NULL OR posted_at IS NOT NULL
    ORDER BY COALESCE(posted_at, scheduled_post_at) DESC
    LIMIT 1
  `).get();
  const now = Date.now();
  const base = row ? new Date(row.posted_at || row.scheduled_post_at).getTime() : 0;
  const next = Math.max(now, Number.isFinite(base) ? base + DISCOVERY_POST_INTERVAL_MS : now);
  return new Date(next);
}

async function saveDiscoveryCandidates(candidates) {
  const db = await getDiscoveryDb();
  let inserted = 0;
  let updated = 0;
  let skippedCompleted = 0;
  for (const candidate of candidates) {
    if (findCompletedMirror(candidate.canonicalUrl)) {
      skippedCompleted += 1;
      continue;
    }
    const existing = await db.prepare(`
      SELECT canonical_url, status FROM thread_discoveries WHERE canonical_url = ?
    `).get(candidate.canonicalUrl);
    if (existing) {
      await db.prepare(`
        UPDATE thread_discoveries
        SET author = ?, text_preview = ?, media_preview_url = COALESCE(NULLIF(?, ''), media_preview_url), like_count = ?,
            media_count = ?, viral_score = ?, status = 'review',
            criteria = ?, discovered_at = CURRENT_TIMESTAMP
        WHERE canonical_url = ? AND status IN ('review', 'draft', 'queued', 'failed', 'failed_post', 'failed_draft', 'failed_schedule', 'discovered', 'skipped')
      `).run(candidate.author, candidate.textPreview, candidate.mediaPreviewUrl || "", candidate.likeCount, candidate.mediaCount, candidate.viralScore || 0, candidate.criteria || "", candidate.canonicalUrl);
      updated += 1;
      continue;
    }
    await db.prepare(`
      INSERT INTO thread_discoveries
        (canonical_url, author, text_preview, media_preview_url, like_count, media_count, viral_score, criteria, status, scheduled_post_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'review', NULL)
    `).run(
      candidate.canonicalUrl,
      candidate.author,
      candidate.textPreview,
      candidate.mediaPreviewUrl || "",
      candidate.likeCount,
      candidate.mediaCount,
      candidate.viralScore || 0,
      candidate.criteria || "",
    );
    inserted += 1;
  }
  return { inserted, updated, skippedCompleted };
}

async function addDiscoveryPlaceholder(url, options = {}) {
  const canonicalUrl = validateThreadsUrl(url);
  const db = await getDiscoveryDb();
  const author = new URL(canonicalUrl).pathname.split("/")[1].replace("@", "");
  const textPreview = String(options.text || "").trim() || "수집 중";
  const criteria = JSON.stringify({ pendingDetailExtract: true, source: options.origin || "manual" });
  const existing = await db.prepare(`
    SELECT canonical_url, status FROM thread_discoveries WHERE canonical_url = ?
  `).get(canonicalUrl);
  if (existing) {
    await db.prepare(`
      UPDATE thread_discoveries
      SET author = ?,
          text_preview = CASE
            WHEN text_preview = '' OR text_preview = '수집 중' OR text_preview = '(본문 없음)' THEN ?
            ELSE text_preview
          END,
          criteria = CASE WHEN criteria = '' THEN ? ELSE criteria END,
          status = 'review',
          last_error = NULL,
          discovered_at = CURRENT_TIMESTAMP
      WHERE canonical_url = ? AND status IN ('review', 'draft', 'queued', 'failed', 'failed_post', 'failed_draft', 'failed_schedule', 'discovered', 'skipped')
    `).run(author, textPreview, criteria, canonicalUrl);
    return { canonicalUrl, inserted: 0, updated: 1, skippedCompleted: 0 };
  }
  if (findCompletedMirror(canonicalUrl)) {
    return { canonicalUrl, inserted: 0, updated: 0, skippedCompleted: 1 };
  }
  await db.prepare(`
    INSERT INTO thread_discoveries
      (canonical_url, author, text_preview, media_preview_url, like_count, media_count, viral_score, criteria, status, scheduled_post_at)
    VALUES (?, ?, ?, '', 0, 0, 0, ?, 'review', NULL)
  `).run(canonicalUrl, author, textPreview, criteria);
  logEvent("discovery_placeholder_added", { canonicalUrl, origin: options.origin || null });
  return { canonicalUrl, inserted: 1, updated: 0, skippedCompleted: 0 };
}

async function markDiscoveryDetailError(canonicalUrl, error) {
  const db = await getDiscoveryDb();
  await db.prepare(`
    UPDATE thread_discoveries
    SET last_error = ?, attempts = attempts + 1
    WHERE canonical_url = ? AND status IN ('review', 'draft', 'queued', 'failed', 'failed_post', 'failed_draft', 'failed_schedule', 'discovered', 'skipped')
  `).run(error.message || String(error), canonicalUrl);
}

async function addThreadToDiscoveryReview(url, options = {}) {
  const canonicalUrl = validateThreadsUrl(url);
  const post = await extractThreadPost(canonicalUrl, { allowEmptyText: true });
  if (post.mediaUrls.length <= 0) {
    throw new Error("Threads 원글에서 미디어를 찾지 못해 대시보드에 추가하지 않았습니다.");
  }
  const author = new URL(canonicalUrl).pathname.split("/")[1].replace("@", "");
  const textPreview = String(options.text || post.text || "").trim() || "(본문 없음)";
  const likeCount = Number.isFinite(post.likeCount) ? post.likeCount : 0;
  const assessment = assessDiscoveryCandidate({
    canonicalUrl,
    author,
    textPreview,
    likeCount,
    mediaCount: post.mediaUrls.length,
  }, post);
  const saved = await saveDiscoveryCandidates([{
    canonicalUrl,
    author,
    textPreview: textPreview.slice(0, 240),
    mediaPreviewUrl: post.mediaUrls[0] || post.imageMediaUrls?.[0] || "",
    likeCount,
    mediaCount: post.mediaUrls.length,
    viralScore: assessment.viralScore,
    criteria: JSON.stringify({
      manualShare: true,
      minLikes: likeCount >= DISCOVERY_MIN_LIKES,
      hasMedia: true,
      shortHook: assessment.isShortHook,
      strongMedia: assessment.hasStrongMedia,
      controversy: assessment.hasControversy,
      reasons: assessment.reasons,
    }),
  }]);
  logEvent("share_added_to_discovery", { canonicalUrl, likeCount, mediaCount: post.mediaUrls.length, ...saved });
  return {
    canonicalUrl,
    likeCount,
    mediaCount: post.mediaUrls.length,
    saved,
    message: "대시보드에 추가됨",
  };
}

async function listDiscoveryRows(limit = 20) {
  const db = await getDiscoveryDb();
  return db.prepare(`
    SELECT canonical_url AS canonicalUrl, author, text_preview AS textPreview,
      media_preview_url AS mediaPreviewUrl, like_count AS likeCount, media_count AS mediaCount, viral_score AS viralScore,
      criteria, status,
      scheduled_post_at AS scheduledPostAt, discovered_at AS discoveredAt,
      posted_at AS postedAt, last_error AS lastError, attempts
    FROM thread_discoveries
    WHERE status != 'skipped'
    ORDER BY discovered_at DESC
    LIMIT ?
  `).all(limit);
}

async function markDiscoveryPosted(canonicalUrl, mediaCount) {
  const db = await getDiscoveryDb();
  await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'posted', posted_at = CURRENT_TIMESTAMP, last_error = NULL, media_count = MAX(media_count, ?)
    WHERE canonical_url = ?
  `).run(mediaCount || 0, canonicalUrl);
}

async function markDiscoveryPostFailed(canonicalUrl, error) {
  const db = await getDiscoveryDb();
  await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'failed_post', last_error = ?, attempts = attempts + 1
    WHERE canonical_url = ?
  `).run(error.message || String(error), canonicalUrl);
}

async function markDiscoveryDrafted(canonicalUrl, mediaCount) {
  const db = await getDiscoveryDb();
  await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'x_draft', posted_at = CURRENT_TIMESTAMP, last_error = NULL, media_count = MAX(media_count, ?)
    WHERE canonical_url = ?
  `).run(mediaCount || 0, canonicalUrl);
}

async function markDiscoveryDraftFailed(canonicalUrl, error) {
  const db = await getDiscoveryDb();
  await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'failed_draft', last_error = ?, attempts = attempts + 1
    WHERE canonical_url = ?
  `).run(error.message || String(error), canonicalUrl);
}

async function markDiscoveryScheduled(canonicalUrl, mediaCount, scheduledAt) {
  const db = await getDiscoveryDb();
  await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'scheduled', scheduled_post_at = ?, posted_at = CURRENT_TIMESTAMP,
        last_error = NULL, media_count = MAX(media_count, ?)
    WHERE canonical_url = ?
  `).run(scheduledAt || null, mediaCount || 0, canonicalUrl);
}

async function markDiscoveryScheduleFailed(canonicalUrl, error) {
  const db = await getDiscoveryDb();
  await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'failed_schedule', last_error = ?, attempts = attempts + 1
    WHERE canonical_url = ?
  `).run(error.message || String(error), canonicalUrl);
}

async function discardDiscoveredRows() {
  const db = await getDiscoveryDb();
  const result = await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'skipped', last_error = 'discarded_by_user'
    WHERE status IN ('review', 'draft', 'failed_post', 'failed_draft', 'failed_schedule')
  `).run();
  logEvent("discovery_discovered_rows_discarded", { changes: result.changes || 0 });
  return { discarded: result.changes || 0 };
}

async function updateDiscoveryTitle(canonicalUrl, text) {
  const title = String(text || "").trim();
  if (!title) {
    throw new Error("제목을 비워둘 수 없습니다.");
  }
  if (title.length > 280) {
    throw new Error("제목은 280자 이하로 입력해 주세요.");
  }
  const db = await getDiscoveryDb();
  const result = await db.prepare(`
    UPDATE thread_discoveries
    SET text_preview = ?, last_error = NULL
    WHERE canonical_url = ? AND status != 'skipped'
  `).run(title, canonicalUrl);
  if (!result.changes) {
    throw new Error("대시보드 항목을 찾지 못했습니다.");
  }
  logEvent("discovery_title_updated", { canonicalUrl, length: title.length });
  return { canonicalUrl, text: title };
}

async function refreshDiscoveryPreviews(limit = 20) {
  const db = await getDiscoveryDb();
  const rows = await db.prepare(`
    SELECT canonical_url AS canonicalUrl
    FROM thread_discoveries
    WHERE media_preview_url = '' OR text_preview LIKE '%\\n1\\n/%' OR text_preview LIKE '%\\n/%'
    ORDER BY discovered_at DESC
    LIMIT ?
  `).all(limit);
  const refreshed = [];
  const failed = [];
  for (const row of rows) {
    try {
      const post = await extractThreadPost(row.canonicalUrl);
      await db.prepare(`
        UPDATE thread_discoveries
        SET text_preview = ?, media_preview_url = COALESCE(NULLIF(?, ''), media_preview_url),
            media_count = ?, last_error = NULL
        WHERE canonical_url = ?
      `).run(post.text.slice(0, 240), post.mediaUrls[0] || post.imageMediaUrls?.[0] || "", post.mediaUrls.length, row.canonicalUrl);
      refreshed.push(row.canonicalUrl);
    } catch (error) {
      failed.push({ canonicalUrl: row.canonicalUrl, error: error.message });
    }
  }
  return { refreshed, failed };
}

function formatDashboardDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return parts.replace("T", " ");
}

async function renderDiscoveryDashboard(requestUrl = "/discovery") {
  const parsedUrl = new URL(requestUrl, "http://localhost");
  const activeView = parsedUrl.searchParams.get("view") || "discovered";
  const autoDiscoveryEnabled = isAutoDiscoveryEnabled();
  const terafabx = getTerafabxAutomationStatus();
  const allRows = await listDiscoveryRows(300);
  const nowMs = Date.now();
  const discoveredStatuses = new Set(["review", "draft", "failed_post", "failed_draft", "failed_schedule"]);
  const viewRows = {
    discovered: allRows.filter((row) => discoveredStatuses.has(row.status)),
    scheduled: allRows.filter((row) => {
      const time = new Date(row.scheduledPostAt || 0).getTime();
      return row.status === "scheduled" && Number.isFinite(time) && time > nowMs;
    }),
    posted: allRows.filter((row) => row.status === "posted"),
  };
  const rows = (viewRows[activeView] || viewRows.discovered).sort((a, b) => {
    if (activeView === "scheduled") {
      return new Date(a.scheduledPostAt || 0).getTime() - new Date(b.scheduledPostAt || 0).getTime();
    }
    if (activeView === "posted") {
      return new Date(b.postedAt || 0).getTime() - new Date(a.postedAt || 0).getTime();
    }
    return new Date(b.discoveredAt || 0).getTime() - new Date(a.discoveredAt || 0).getTime();
  });
  const counts = allRows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const discoveredCount = viewRows.discovered.length;
  const scheduledCount = viewRows.scheduled.length;
  const postedCount = viewRows.posted.length;
  const failedCount = Number((counts.failed_post || 0) + (counts.failed_draft || 0) + (counts.failed_schedule || 0));
  const nextScheduledAt = viewRows.scheduled
    .map((row) => new Date(row.scheduledPostAt || 0).getTime())
    .filter((time) => Number.isFinite(time) && time > nowMs)
    .sort((a, b) => a - b)[0];
  const latestPostedAt = viewRows.posted
    .map((row) => new Date(row.postedAt || 0).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => b - a)[0];
  const activeViewLabel = {
    discovered: "발굴됨",
    scheduled: "게시예정",
    posted: "게시됨",
  }[activeView] || "발굴됨";
  const cards = rows.map((row) => {
    const canPost = ["review", "draft", "failed_post", "failed_draft", "failed_schedule"].includes(row.status);
    const criteria = (() => {
      try {
        return JSON.parse(row.criteria || "{}");
      } catch {
        return {};
      }
    })();
    const badges = [
      `좋아요 ${Number(row.likeCount || 0).toLocaleString("ko-KR")}`,
      `미디어 ${row.mediaCount}`,
      `점수 ${row.viralScore}`,
      row.status,
    ];
    if (row.scheduledPostAt) badges.push(`예약 ${formatDashboardDateTime(row.scheduledPostAt)}`);
    if (row.postedAt && !row.scheduledPostAt) badges.push(`게시 ${formatDashboardDateTime(row.postedAt)}`);
    const timelineTime = row.scheduledPostAt || row.postedAt || row.discoveredAt;
    const timelineLabel = row.scheduledPostAt ? "예약" : row.postedAt ? "처리" : "발굴";
    const timelineText = `${timelineLabel} ${formatDashboardDateTime(timelineTime)}`;
    const timelineState = row.scheduledPostAt ? "is-scheduled" : row.postedAt ? "is-posted" : "is-review";
    const publishTimeHtml = row.scheduledPostAt
      ? `<div class="publish-time is-scheduled"><span>게시 예정 시간</span><strong>${escapeHtml(formatDashboardDateTime(row.scheduledPostAt))}</strong></div>`
      : row.postedAt
        ? `<div class="publish-time is-posted"><span>게시된 시간</span><strong>${escapeHtml(formatDashboardDateTime(row.postedAt))}</strong></div>`
        : "";
    const mediaPreview = row.mediaPreviewUrl
      ? (/\.mp4|\/o1\/v\/t16\//i.test(row.mediaPreviewUrl)
        ? `<video class="media-preview" src="${escapeHtml(row.mediaPreviewUrl)}" muted playsinline controls loop preload="metadata"></video>`
        : `<img class="media-preview" src="${escapeHtml(row.mediaPreviewUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`)
      : `<a class="media-empty" href="${escapeHtml(row.canonicalUrl)}" target="_blank" rel="noreferrer">미리보기 보강 필요</a>`;
    const previewText = row.textPreview || "(본문 없음)";
    const previewNeedsMore = previewText.split("\n").length > 2 || previewText.length > 54;
    const previewHtml = previewNeedsMore
      ? `<details class="preview-box">
          <summary><span class="preview">${escapeHtml(previewText)}</span><span class="more">더보기</span></summary>
          <p>${escapeHtml(previewText)}</p>
        </details>`
      : `<div class="preview-box"><p class="preview-full">${escapeHtml(previewText)}</p></div>`;
    const titleEditor = `
      <label class="title-editor">
        <span>게시 제목</span>
        <textarea data-title-input="${escapeHtml(row.canonicalUrl)}" maxlength="280" rows="3">${escapeHtml(previewText)}</textarea>
      </label>
      <button class="save-title" data-save-title="${escapeHtml(row.canonicalUrl)}">제목 저장</button>
    `;
    return `
      <article class="card ${timelineState}" data-url="${escapeHtml(row.canonicalUrl)}" data-time="${escapeHtml(timelineText)}">
        <div class="media-frame">${mediaPreview}</div>
        <div class="meta">
          ${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}
        </div>
        ${publishTimeHtml}
        <h2>@${escapeHtml(row.author)}</h2>
        ${previewHtml}
        ${titleEditor}
        <div class="criteria">
          <span>짧은 훅: ${criteria.shortHook ? "Y" : "N"}</span>
          <span>강한 미디어: ${criteria.strongMedia ? "Y" : "N"}</span>
          <span>논쟁성: ${criteria.controversy ? "Y" : "N"}</span>
        </div>
        <div class="actions">
          <a class="source-link" href="${escapeHtml(row.canonicalUrl)}" target="_blank" rel="noreferrer">원문 열기</a>
          <button ${canPost ? "" : "disabled"} data-post="${escapeHtml(row.canonicalUrl)}">${canPost ? "게시" : "처리됨"}</button>
          <button ${canPost ? "" : "disabled"} data-draft="${escapeHtml(row.canonicalUrl)}">${canPost ? "초안 저장" : "처리됨"}</button>
          <input ${canPost ? "" : "disabled"} class="schedule-input" data-schedule-input="${escapeHtml(row.canonicalUrl)}" type="datetime-local" />
          <button ${canPost ? "" : "disabled"} data-schedule="${escapeHtml(row.canonicalUrl)}">${canPost ? "예약 게시" : "처리됨"}</button>
          <button ${canPost ? "" : "disabled"} class="auto-schedule" data-auto-schedule="${escapeHtml(row.canonicalUrl)}">${canPost ? "자동 예약" : "처리됨"}</button>
        </div>
        ${row.lastError && !/superseded by short_hook_strong_media_controversy filter/i.test(row.lastError) ? `<details class="diagnostic"><summary>오류 로그</summary><p>${escapeHtml(row.lastError)}</p></details>` : ""}
      </article>
    `;
  }).join("");
  const terafabxPanel = `
    <section class="terafabx-panel" id="terafabx-automation">
      <div class="terafabx-head">
        <div>
          <h2>과즙루피 자동화</h2>
          <p>Hermes CLI 미사용 · 댓글 생성: Grok CLI · 댓글/하트 실행: mirror_server.js CDP 코드 · Chrome ${escapeHtml(CHROME_PORT)}</p>
        </div>
        <button type="button" id="terafabx-refresh">상태 새로고침</button>
      </div>
      <div class="terafabx-grid">
        <article class="terafabx-card">
          <div class="terafabx-title"><strong>자동댓글</strong><span>${terafabx.comment.enabled ? "ON" : "OFF"}</span></div>
          <p>엔진: ${escapeHtml(path.basename(GROK_BIN))} · 상태: ${escapeHtml(terafabx.comment.lastStatus || "대기")}</p>
          <p>최근 실행: ${escapeHtml(terafabx.comment.lastRunAt ? formatDashboardDateTime(terafabx.comment.lastRunAt) : "-")}</p>
          <p>다음 자동: ${escapeHtml(terafabx.comment.nextRunAt ? formatDashboardDateTime(terafabx.comment.nextRunAt) : "OFF")}</p>
          <p class="terafabx-last">최근 댓글: ${escapeHtml(terafabx.comment.lastComment || "-")}</p>
          ${terafabx.comment.lastReplyUrl ? `<a href="${escapeHtml(terafabx.comment.lastReplyUrl)}" target="_blank" rel="noreferrer">최근 답글 열기</a>` : ""}
          ${terafabx.comment.lastError ? `<p class="terafabx-error">오류: ${escapeHtml(terafabx.comment.lastError)}</p>` : ""}
          <div class="terafabx-actions">
            <button type="button" data-terafabx-action="run" data-terafabx-job="comment">지금 댓글 1회</button>
            <button type="button" data-terafabx-action="enable" data-terafabx-job="comment">ON</button>
            <button type="button" data-terafabx-action="disable" data-terafabx-job="comment">OFF</button>
          </div>
        </article>
        <article class="terafabx-card">
          <div class="terafabx-title"><strong>하트</strong><span>${terafabx.heart.enabled ? "ON" : "OFF"}</span></div>
          <p>엔진: 로컬 CDP 스크립트 · 상태: ${escapeHtml(terafabx.heart.lastStatus || "대기")}</p>
          <p>최근 실행: ${escapeHtml(terafabx.heart.lastRunAt ? formatDashboardDateTime(terafabx.heart.lastRunAt) : "-")} · 최근 ${Number(terafabx.heart.lastCount || 0)}개</p>
          <p>다음 자동: ${escapeHtml(terafabx.heart.nextRunAt ? formatDashboardDateTime(terafabx.heart.nextRunAt) : "OFF")}</p>
          <p class="terafabx-last">대상: X 홈/For You/Following 공개 타임라인</p>
          ${terafabx.heart.lastError ? `<p class="terafabx-error">오류: ${escapeHtml(terafabx.heart.lastError)}</p>` : ""}
          <div class="terafabx-actions">
            <button type="button" data-terafabx-action="run" data-terafabx-job="heart">지금 하트 1회</button>
            <button type="button" data-terafabx-action="enable" data-terafabx-job="heart">ON</button>
            <button type="button" data-terafabx-action="disable" data-terafabx-job="heart">OFF</button>
          </div>
        </article>
      </div>
      <pre id="terafabx-result">락: ${terafabx.lock.busy ? `사용 중 ${escapeHtml(terafabx.lock.action || "")}` : "대기"}</pre>
    </section>
  `;
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Threads 발굴 대시보드</title>
  <style>
    :root { --bg: #f8fafc; --card: #fff; --border: #e5e7eb; --muted: #64748b; --soft: #f1f5f9; --ink: #0f172a; --primary: #111827; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); }
    header { position: sticky; top: 0; z-index: 3; background: rgba(255,255,255,.94); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    h1 { margin: 0; font-size: 18px; }
    .summary { color: var(--muted); font-size: 13px; }
    .add-url { max-width: 1180px; margin: 0 auto; padding: 14px 16px 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
    .add-url input { min-width: 0; border: 1px solid var(--border); border-radius: 8px; padding: 9px 10px; font-size: 14px; background: var(--card); }
    .add-url button { flex: none; }
    .timeline-summary { max-width: 1180px; margin: 0 auto; padding: 14px 16px 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .summary-card { min-width: 0; border: 1px solid var(--border); border-radius: 14px; background: var(--card); padding: 14px; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
    .summary-card span { display: block; color: var(--muted); font-size: 12px; }
    .summary-card strong { display: block; margin-top: 6px; font-size: 22px; line-height: 1.1; }
    .posting-timeline { max-width: 1180px; margin: 14px auto 24px; border: 1px solid var(--border); border-radius: 16px; background: var(--card); color: var(--ink); overflow: hidden; }
    .view-tabs { max-width: 1180px; margin: 0 auto; padding: 14px 16px 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .view-tab { flex: 0 0 auto; border: 1px solid var(--border); border-radius: 999px; padding: 8px 12px; background: var(--card); color: var(--ink); font-size: 13px; text-decoration: none; }
    .view-tab[aria-current="page"] { background: var(--primary); border-color: var(--primary); color: #fff; }
    .timeline-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 1px solid var(--border); padding: 12px 16px; }
    .toolbar-badges { display: flex; flex-wrap: wrap; gap: 8px; }
    .toolbar-badges span, .meta span, .criteria span { background: var(--soft); border: 1px solid transparent; border-radius: 999px; padding: 4px 8px; color: #334155; font-size: 12px; }
    main { padding: 0 16px 16px; display: flex; flex-direction: column; }
    .card { position: relative; min-width: 0; display: grid; grid-template-columns: minmax(7.5rem, .24fr) 2.5rem minmax(0, 1fr); gap: 12px; padding: 16px 0; background: linear-gradient(to right, transparent calc(24% + 1.25rem - .5px), var(--border) calc(24% + 1.25rem - .5px), var(--border) calc(24% + 1.25rem + .5px), transparent calc(24% + 1.25rem + .5px)); border: 0; }
    .card::before { content: attr(data-time); grid-column: 1; align-self: start; padding-top: 4px; color: var(--muted); font-size: 12px; line-height: 1.45; text-align: right; }
    .card::after { content: ""; grid-column: 2; grid-row: 1; width: 36px; height: 36px; border-radius: 999px; border: 1px solid var(--border); background: var(--soft); box-shadow: inset 0 0 0 9px var(--card); justify-self: center; align-self: start; z-index: 1; }
    .card.is-scheduled::after { border-color: var(--primary); background: var(--primary); box-shadow: inset 0 0 0 10px var(--primary); }
    .card.is-posted::after { background: #e2e8f0; }
    .card.is-review::after { background: #fff; }
    .card > * { grid-column: 3; min-width: 0; }
    .card > .media-frame, .card > .meta, .card > h2, .card > .preview-box, .card > .title-editor, .card > .save-title, .card > .criteria, .card > .actions, .card > .diagnostic { background: var(--card); }
    .card > .media-frame { border-top-left-radius: 14px; border-top-right-radius: 14px; }
    .card > .meta { order: -1; border: 1px solid var(--border); border-bottom: 0; border-radius: 14px 14px 0 0; padding: 14px 14px 0; }
    .card > h2 { margin: 0; border-left: 1px solid var(--border); border-right: 1px solid var(--border); padding: 10px 14px 0; font-size: 15px; }
    .card > .preview-box, .card > .title-editor, .card > .save-title, .card > .criteria, .card > .actions, .card > .diagnostic { border-left: 1px solid var(--border); border-right: 1px solid var(--border); padding-left: 14px; padding-right: 14px; }
    .card > .actions, .card > .diagnostic { border-bottom: 1px solid var(--border); }
    .card > .actions { border-radius: 0 0 14px 14px; padding-bottom: 14px; }
    .card > .diagnostic { border-radius: 0 0 14px 14px; padding-bottom: 14px; }
    .media-frame { width: 100%; height: clamp(260px, 28vw, 420px); background: #111; overflow: hidden; display: grid; place-items: center; border-left: 1px solid var(--border); border-right: 1px solid var(--border); }
    .media-preview { width: 100%; height: 100%; object-fit: contain; display: block; background: #111; }
    .media-empty { color: #555; font-size: 12px; border: 0; padding: 0; background: transparent; text-decoration: underline; }
    .meta, .criteria { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; }
    .publish-time { display: grid; gap: 3px; border: 1px solid #d8dee8; border-radius: 6px; background: #f8fafc; padding: 7px 8px; overflow-wrap: anywhere; }
    .publish-time span { color: var(--muted); font-size: 11px; line-height: 1.2; }
    .publish-time strong { color: #0f172a; font-size: 13px; line-height: 1.25; white-space: normal; }
    .publish-time.is-scheduled { border-color: #111827; background: #eef2ff; }
    .publish-time.is-posted { background: #f1f5f9; }
    .preview-box { min-height: 48px; font-size: 13px; }
    .preview-box summary { list-style: none; cursor: pointer; display: flex; flex-direction: column; gap: 3px; }
    .preview-box summary::-webkit-details-marker { display: none; }
    .preview { white-space: pre-wrap; line-height: 1.4; margin: 0; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 36px; }
    .more { color: #555; font-size: 12px; text-decoration: underline; }
    .preview-box:not([open]) .more::after { content: ""; }
    .preview-box[open] summary { display: none; }
    .preview-box p { white-space: pre-wrap; line-height: 1.4; margin: 0; overflow-wrap: anywhere; }
    .preview-full { min-height: 36px; }
    .title-editor { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
    .title-editor textarea { width: 100%; box-sizing: border-box; resize: vertical; min-height: 76px; max-height: 160px; border: 1px solid var(--border); border-radius: 8px; padding: 8px 9px; font: inherit; font-size: 13px; color: #111; line-height: 1.45; background: #fff; }
    .save-title { background: #fff; color: #111; }
    .diagnostic { color: #8a1f11; font-size: 12px; }
    .diagnostic p { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 10px; }
    a, button { flex: 0 0 auto; min-width: 0; border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px; font-size: 12px; line-height: 1.3; text-align: center; text-decoration: none; color: #111; background: #fff; cursor: pointer; }
    .schedule-input { min-width: 190px; box-sizing: border-box; border: 1px solid var(--border); border-radius: 8px; padding: 7px 9px; font: inherit; font-size: 12px; color: #111; background: #fff; }
    .schedule-input:disabled { opacity: .45; cursor: not-allowed; }
    .auto-schedule { background: #111; color: #fff; }
    button { background: #111; color: #fff; border-color: #111; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    #scan, #refresh, #auto-refresh-toggle, #auto-discovery-toggle { background: #fff; color: #111; }
    #auto-refresh-toggle[data-enabled="false"] { background: #111; color: #fff; }
    #auto-discovery-toggle[data-enabled="false"] { background: #111; color: #fff; }
    .header-actions { display: flex; gap: 8px; }
    .header-actions button { flex: none; }
    .dashboard-overview { max-width: 1800px; margin: 0 auto; padding: 12px 14px 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .terafabx-panel { max-width: 1800px; margin: 12px auto 0; padding: 14px; border: 1px solid var(--border); border-radius: 10px; background: #fff; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
    .terafabx-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .terafabx-head h2 { margin: 0; font-size: 16px; }
    .terafabx-head p, .terafabx-card p { margin: 5px 0 0; color: var(--muted); font-size: 12px; line-height: 1.35; }
    .terafabx-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .terafabx-card { min-width: 0; border: 1px solid var(--border); border-radius: 8px; padding: 12px; background: #f8fafc; }
    .terafabx-title { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .terafabx-title strong { font-size: 14px; }
    .terafabx-title span { border-radius: 999px; background: #111; color: #fff; font-size: 11px; padding: 3px 7px; }
    .terafabx-last { overflow-wrap: anywhere; }
    .terafabx-error { color: #b42318 !important; }
    .terafabx-actions { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; }
    .terafabx-actions button, #terafabx-refresh { flex: 0 0 auto; }
    #terafabx-result { margin: 12px 0 0; max-height: 180px; overflow: auto; border: 1px solid var(--border); border-radius: 8px; background: #0f172a; color: #e2e8f0; padding: 10px; font-size: 12px; white-space: pre-wrap; }
    .metric-card { min-width: 0; border: 1px solid var(--border); border-radius: 8px; background: #fff; padding: 14px; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
    .metric-card span { display: block; color: var(--muted); font-size: 12px; font-weight: 600; }
    .metric-card strong { display: block; margin-top: 8px; color: var(--ink); font-size: 24px; line-height: 1; letter-spacing: 0; }
    .metric-card p { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
    .empty-state { grid-column: 1 / -1; margin: 0; border: 1px dashed var(--border); border-radius: 8px; background: #fff; padding: 32px 16px; color: var(--muted); text-align: center; font-size: 14px; }
    .view-tabs, .timeline-summary, .add-url { max-width: 1800px; }
    header { padding: 12px 18px; }
    header h1 { font-size: 17px; font-weight: 700; letter-spacing: 0; }
    .add-url { padding-top: 12px; }
    .add-url input { border-radius: 8px; box-shadow: 0 1px 2px rgba(15, 23, 42, .03); }
    .view-tabs { padding-top: 12px; border: 0; }
    .view-tab { border-radius: 8px; padding: 8px 11px; box-shadow: 0 1px 2px rgba(15, 23, 42, .03); }
    .posting-timeline { max-width: 1800px; margin: 12px auto 24px; border: 0; border-radius: 0; background: transparent; overflow: visible; }
    .timeline-toolbar { display: none; }
    main { max-width: 1800px; margin: 0 auto; padding: 0 14px 14px; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; align-items: start; }
    .card { min-width: 0; min-height: 430px; display: flex; flex-direction: column; gap: 8px; padding: 10px; background: #fff; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
    .card:hover { box-shadow: 0 4px 12px rgba(15, 23, 42, .07); }
    .card::before, .card::after { content: none; display: none; }
    .card > * { grid-column: auto; min-width: 0; }
    .card > .media-frame, .card > .meta, .card > .publish-time, .card > h2, .card > .preview-box, .card > .title-editor, .card > .save-title, .card > .criteria, .card > .actions, .card > .diagnostic { border: 0; padding-left: 0; padding-right: 0; background: transparent; }
    .card > .publish-time { border: 1px solid #d8dee8; padding: 7px 8px; background: #f8fafc; }
    .card > .publish-time.is-scheduled { border-color: #111827; background: #eef2ff; }
    .card > .publish-time.is-posted { background: #f1f5f9; }
    .card > .meta { order: 0; padding: 0; }
    .card > h2 { padding: 0; }
    .card > .actions, .card > .diagnostic { border: 0; }
    .card > .actions { border-radius: 0; padding-bottom: 0; }
    .card > .diagnostic { border-radius: 0; padding-bottom: 0; }
    .media-frame { border: 0; border-radius: 6px; height: clamp(220px, 18vw, 320px); }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: auto; padding-top: 0; }
    .schedule-input { min-width: 0; width: 100%; }
    .source-link, .auto-schedule { grid-column: 1 / -1; }
    a, button { flex: 1; padding: 8px 8px; font-size: 13px; }
    .meta span, .criteria span { border-radius: 6px; padding: 4px 7px; font-size: 11px; font-weight: 500; }
    .preview-box { color: #111827; }
    .title-editor span { font-weight: 600; }
    .save-title { border-color: var(--border); }
    .actions button, .actions a { border-radius: 6px; font-weight: 600; }
    .actions a, .save-title { background: #fff; color: #111827; border-color: var(--border); }
    @media (max-width: 1400px) { main { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
    @media (max-width: 1100px) { main { grid-template-columns: repeat(3, minmax(0, 1fr)); } .dashboard-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) {
      header { align-items: flex-start; flex-direction: column; }
      .add-url { grid-template-columns: 1fr; padding: 10px 10px 0; }
      .dashboard-overview { grid-template-columns: 1fr 1fr; padding: 10px 10px 0; gap: 8px; }
      .timeline-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 10px 10px 0; }
      .view-tabs { padding: 10px 10px 0; }
      .posting-timeline { margin: 10px 10px 20px; }
      main { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 0 10px 10px; }
      .actions { display: grid; grid-template-columns: 1fr 1fr; }
      .source-link, .schedule-input, .auto-schedule { grid-column: 1 / -1; width: 100%; }
    }
    @media (max-width: 520px) { .timeline-summary, .dashboard-overview { grid-template-columns: 1fr; } main { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Threads 발굴 대시보드</h1>
      <div class="summary">5분마다 스캔 · 좋아요 1000+ · 미디어 포함 · X 초안 저장 안 함 · ${escapeHtml(JSON.stringify(counts))}</div>
    </div>
    <div class="header-actions">
      <button id="auto-discovery-toggle" type="button" aria-pressed="${autoDiscoveryEnabled ? "true" : "false"}" data-enabled="${autoDiscoveryEnabled ? "true" : "false"}">${autoDiscoveryEnabled ? "자동 발굴 중지" : "자동 발굴 재개"}</button>
      <button id="auto-refresh-toggle" type="button" aria-pressed="true" data-enabled="true">자동새로고침 끄기</button>
      <button id="refresh">미리보기 보강</button>
      <button id="scan">지금 스캔</button>
    </div>
  </header>
  <form class="add-url" id="add-url-form">
    <input id="add-url-input" type="url" placeholder="Threads URL 추가" autocomplete="off" />
    <button id="add-url-button" type="submit">추가</button>
  </form>
  <section class="dashboard-overview" aria-label="대시보드 요약">
    <article class="metric-card">
      <span>발굴 대기</span>
      <strong>${Number(discoveredCount).toLocaleString("ko-KR")}</strong>
      <p>수동 검토 대상</p>
    </article>
    <article class="metric-card">
      <span>게시 예정</span>
      <strong>${Number(scheduledCount).toLocaleString("ko-KR")}</strong>
      <p>다음 ${nextScheduledAt ? escapeHtml(formatDashboardDateTime(nextScheduledAt)) : "-"}</p>
    </article>
    <article class="metric-card">
      <span>게시됨</span>
      <strong>${Number(postedCount).toLocaleString("ko-KR")}</strong>
      <p>최근 ${latestPostedAt ? escapeHtml(formatDashboardDateTime(latestPostedAt)) : "-"}</p>
    </article>
    <article class="metric-card">
      <span>자동 발굴</span>
      <strong>${autoDiscoveryEnabled ? "ON" : "OFF"}</strong>
      <p>${failedCount ? `재시도 ${Number(failedCount).toLocaleString("ko-KR")}개` : "오류 없음"}</p>
    </article>
  </section>
  ${terafabxPanel}
  <nav class="view-tabs" aria-label="대시보드 보기">
    <a class="view-tab" href="/discovery?view=discovered" ${activeView === "discovered" ? 'aria-current="page"' : ""}>발굴됨 ${Number(discoveredCount).toLocaleString("ko-KR")}</a>
    <a class="view-tab" href="/discovery?view=scheduled" ${activeView === "scheduled" ? 'aria-current="page"' : ""}>게시예정 ${Number(scheduledCount).toLocaleString("ko-KR")}</a>
    <a class="view-tab" href="/discovery?view=posted" ${activeView === "posted" ? 'aria-current="page"' : ""}>게시됨 ${Number(postedCount).toLocaleString("ko-KR")}</a>
  </nav>
  <section class="posting-timeline" aria-label="게시 타임라인">
    <div class="timeline-toolbar">
      <div class="toolbar-badges">
        <span>예약 예정 ${Number(counts.scheduled || 0).toLocaleString("ko-KR")}</span>
        <span>게시 완료 ${Number(counts.posted || 0).toLocaleString("ko-KR")}</span>
      </div>
      <span class="summary">예약은 위, 최신 발굴은 아래 흐름으로 확인합니다.</span>
    </div>
    <main>${cards || `<p class="empty-state">${escapeHtml(activeViewLabel)} 항목이 없습니다.</p>`}</main>
  </section>
  <script>
    const initialDashboardState = {
      firstUrl: ${JSON.stringify(allRows[0]?.canonicalUrl || "")},
      rowCount: ${allRows.length},
      view: ${JSON.stringify(activeView)}
    };
    const autoRefreshStorageKey = "threadDashboard.autoRefreshEnabled";
    const autoRefreshToggle = document.getElementById("auto-refresh-toggle");
    const autoDiscoveryToggle = document.getElementById("auto-discovery-toggle");
    function isAutoRefreshEnabled() {
      return localStorage.getItem(autoRefreshStorageKey) !== "false";
    }
    function renderAutoRefreshToggle() {
      const enabled = isAutoRefreshEnabled();
      autoRefreshToggle.dataset.enabled = String(enabled);
      autoRefreshToggle.setAttribute("aria-pressed", String(enabled));
      autoRefreshToggle.textContent = enabled ? "자동새로고침 끄기" : "자동새로고침 켜기";
    }
    renderAutoRefreshToggle();
    autoRefreshToggle.addEventListener("click", () => {
      localStorage.setItem(autoRefreshStorageKey, String(!isAutoRefreshEnabled()));
      renderAutoRefreshToggle();
    });
    function renderAutoDiscoveryToggle(enabled) {
      autoDiscoveryToggle.dataset.enabled = String(enabled);
      autoDiscoveryToggle.setAttribute("aria-pressed", String(enabled));
      autoDiscoveryToggle.textContent = enabled ? "자동 발굴 중지" : "자동 발굴 재개";
    }
    autoDiscoveryToggle.addEventListener("click", async () => {
      const nextEnabled = autoDiscoveryToggle.dataset.enabled !== "true";
      autoDiscoveryToggle.disabled = true;
      autoDiscoveryToggle.textContent = nextEnabled ? "재개 중" : "중지 중";
      try {
        const data = await postJson("/api/discovery/auto-scan", { enabled: nextEnabled });
        renderAutoDiscoveryToggle(data.autoDiscoveryEnabled);
      } catch (error) {
        alert(error.message);
      } finally {
        autoDiscoveryToggle.disabled = false;
      }
    });
    async function postJson(url, body) {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "요청 실패");
      return data;
    }
    async function getJson(url) {
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "요청 실패");
      return data;
    }
    function setTerafabxResult(value) {
      const el = document.getElementById("terafabx-result");
      if (el) el.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    }
    document.getElementById("terafabx-refresh")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "조회 중";
      try {
        setTerafabxResult(await getJson("/api/terafabx/automation"));
      } catch (error) {
        setTerafabxResult(error.message);
      } finally {
        button.disabled = false;
        button.textContent = "상태 새로고침";
      }
    });
    document.querySelectorAll("[data-terafabx-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.terafabxAction;
        const job = button.dataset.terafabxJob;
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "요청 중";
        try {
          const result = await postJson("/api/terafabx/automation", { action, job });
          setTerafabxResult(result);
          setTimeout(() => location.reload(), action === "run" ? 1500 : 600);
        } catch (error) {
          setTerafabxResult(error.message);
          button.disabled = false;
          button.textContent = originalText;
        }
      });
    });
    function toDatetimeLocalValue(date) {
      const pad = (value) => String(value).padStart(2, "0");
      return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
      ].join("-") + "T" + [pad(date.getHours()), pad(date.getMinutes())].join(":");
    }
    const defaultScheduleTime = new Date(Date.now() + 15 * 60 * 1000);
    const minScheduleTime = new Date(Date.now() + 5 * 60 * 1000);
    document.querySelectorAll("[data-schedule-input]").forEach((input) => {
      input.min = toDatetimeLocalValue(minScheduleTime);
      if (!input.value) input.value = toDatetimeLocalValue(defaultScheduleTime);
    });
    document.getElementById("add-url-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = document.getElementById("add-url-input");
      const button = document.getElementById("add-url-button");
      const url = input.value.trim();
      if (!url) return;
      button.disabled = true;
      button.textContent = "추가 중";
      try {
        await postJson("/api/discovery/add-url-async", { url, origin: "dashboard" });
        location.reload();
      } catch (error) {
        alert(error.message);
        button.disabled = false;
        button.textContent = "추가";
      }
    });
    document.getElementById("scan").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "스캔 중";
      try {
        await postJson("/api/discovery/run", { minLikes: 1000, maxScrolls: 20 });
        location.reload();
      } catch (error) {
        alert(error.message);
        button.disabled = false;
        button.textContent = "지금 스캔";
      }
    });
    document.getElementById("refresh").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "보강 중";
      try {
        await postJson("/api/discovery/refresh-previews", { limit: 5 });
        location.reload();
      } catch (error) {
        alert(error.message);
        button.disabled = false;
        button.textContent = "미리보기 보강";
      }
    });
    document.querySelectorAll("[data-save-title]").forEach((button) => {
      button.addEventListener("click", async () => {
        const url = button.dataset.saveTitle;
        const input = document.querySelector('[data-title-input="' + CSS.escape(url) + '"]');
        const text = input ? input.value.trim() : "";
        if (!text) {
          alert("제목을 입력해 주세요.");
          return;
        }
        button.disabled = true;
        button.textContent = "저장 중";
        try {
          await postJson("/api/discovery/title", { url, text });
          button.textContent = "저장됨";
          setTimeout(() => {
            button.disabled = false;
            button.textContent = "제목 저장";
          }, 900);
        } catch (error) {
          alert(error.message);
          button.disabled = false;
          button.textContent = "제목 저장";
        }
      });
    });
    document.querySelectorAll("[data-post]").forEach((button) => {
      button.addEventListener("click", async () => {
        const input = document.querySelector('[data-title-input="' + CSS.escape(button.dataset.post) + '"]');
        const text = input ? input.value.trim() : "";
        button.disabled = true;
        button.textContent = "게시 중";
        try {
          await postJson("/api/discovery/post", { url: button.dataset.post, text });
          location.reload();
        } catch (error) {
          alert(error.message);
          button.disabled = false;
          button.textContent = "게시";
        }
      });
    });
    document.querySelectorAll("[data-draft]").forEach((button) => {
      button.addEventListener("click", async () => {
        const input = document.querySelector('[data-title-input="' + CSS.escape(button.dataset.draft) + '"]');
        const text = input ? input.value.trim() : "";
        button.disabled = true;
        button.textContent = "초안 저장 중";
        try {
          await postJson("/api/discovery/draft", { url: button.dataset.draft, text });
          location.reload();
        } catch (error) {
          alert(error.message);
          button.disabled = false;
          button.textContent = "초안 저장";
        }
      });
    });
    document.querySelectorAll("[data-schedule]").forEach((button) => {
      button.addEventListener("click", async () => {
        const titleInput = document.querySelector('[data-title-input="' + CSS.escape(button.dataset.schedule) + '"]');
        const scheduleInput = document.querySelector('[data-schedule-input="' + CSS.escape(button.dataset.schedule) + '"]');
        const text = titleInput ? titleInput.value.trim() : "";
        const scheduledAt = scheduleInput ? scheduleInput.value : "";
        if (!scheduledAt) {
          alert("예약 시간을 선택해 주세요.");
          return;
        }
        button.disabled = true;
        button.textContent = "예약 중";
        try {
          await postJson("/api/discovery/schedule", {
            url: button.dataset.schedule,
            text,
            scheduledAt,
            scheduledAtTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            scheduledAtOffsetMinutes: new Date(scheduledAt).getTimezoneOffset(),
          });
          location.reload();
        } catch (error) {
          alert(error.message);
          button.disabled = false;
          button.textContent = "예약 게시";
        }
      });
    });
    document.querySelectorAll("[data-auto-schedule]").forEach((button) => {
      button.addEventListener("click", async () => {
        const titleInput = document.querySelector('[data-title-input="' + CSS.escape(button.dataset.autoSchedule) + '"]');
        const text = titleInput ? titleInput.value.trim() : "";
        button.disabled = true;
        button.textContent = "자동 예약 중";
        try {
          await postJson("/api/discovery/auto-schedule", { url: button.dataset.autoSchedule, text });
          location.reload();
        } catch (error) {
          alert(error.message);
          button.disabled = false;
          button.textContent = "자동 예약";
        }
      });
    });
    setInterval(async () => {
      if (!isAutoRefreshEnabled()) return;
      try {
        const res = await fetch("/api/discovery/status", { cache: "no-store" });
        const data = await res.json();
        if (!data.ok) return;
        const firstUrl = data.rows && data.rows[0] ? data.rows[0].canonicalUrl : "";
        if (data.rows.length !== initialDashboardState.rowCount || firstUrl !== initialDashboardState.firstUrl) {
          location.reload();
        }
      } catch {}
    }, 30000);
  </script>
</body>
</html>`;
}

async function getDiscoveryDashboardData(requestUrl = "/api/discovery/dashboard") {
  const parsedUrl = new URL(requestUrl, "http://localhost");
  const activeView = parsedUrl.searchParams.get("view") || "discovered";
  const autoDiscoveryEnabled = isAutoDiscoveryEnabled();
  const allRows = await listDiscoveryRows(300);
  const nowMs = Date.now();
  const discoveredStatuses = new Set(["review", "draft", "failed_post", "failed_draft", "failed_schedule"]);
  const viewRows = {
    discovered: allRows.filter((row) => discoveredStatuses.has(row.status)),
    scheduled: allRows.filter((row) => {
      const time = new Date(row.scheduledPostAt || 0).getTime();
      return row.status === "scheduled" && Number.isFinite(time) && time > nowMs;
    }),
    posted: allRows.filter((row) => row.status === "posted"),
  };
  const rows = (viewRows[activeView] || viewRows.discovered).sort((a, b) => {
    if (activeView === "scheduled") {
      return new Date(a.scheduledPostAt || 0).getTime() - new Date(b.scheduledPostAt || 0).getTime();
    }
    if (activeView === "posted") {
      return new Date(b.postedAt || 0).getTime() - new Date(a.postedAt || 0).getTime();
    }
    return new Date(b.discoveredAt || 0).getTime() - new Date(a.discoveredAt || 0).getTime();
  });
  const counts = allRows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const failedCount = Number((counts.failed_post || 0) + (counts.failed_draft || 0) + (counts.failed_schedule || 0));
  const nextScheduledAt = viewRows.scheduled
    .map((row) => new Date(row.scheduledPostAt || 0).getTime())
    .filter((time) => Number.isFinite(time) && time > nowMs)
    .sort((a, b) => a - b)[0];
  const latestPostedAt = viewRows.posted
    .map((row) => new Date(row.postedAt || 0).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => b - a)[0];
  return {
    ok: true,
    view: activeView,
    terafabx: getTerafabxAutomationStatus(),
    summary: {
      discoveredCount: viewRows.discovered.length,
      scheduledCount: viewRows.scheduled.length,
      postedCount: viewRows.posted.length,
      failedCount,
      autoDiscoveryEnabled,
      nextScheduledAt: nextScheduledAt ? new Date(nextScheduledAt).toISOString() : null,
      latestPostedAt: latestPostedAt ? new Date(latestPostedAt).toISOString() : null,
    },
    rows: rows.map((row) => {
      let criteria = {};
      try {
        criteria = JSON.parse(row.criteria || "{}");
      } catch {}
      return {
        ...row,
        criteria,
        canPost: ["review", "draft", "failed_post", "failed_draft", "failed_schedule"].includes(row.status),
      };
    }),
  };
}

function scheduleParts(date) {
  let hour = date.getHours();
  const ampm = hour >= 12 ? "PM" : "AM";
  hour %= 12;
  if (hour === 0) hour = 12;
  return {
    month: String(date.getMonth() + 1),
    day: String(date.getDate()),
    year: String(date.getFullYear()),
    hour: String(hour),
    minute: String(date.getMinutes()).padStart(2, "0"),
    ampm,
  };
}

async function setXSchedule(page, scheduledAt) {
  const parts = scheduleParts(scheduledAt);
  logEvent("schedule_start", { scheduledAt: scheduledAt.toISOString(), parts });
  const opened = await page.eval(`(() => {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    const scheduleButton = buttons.find((button) => {
      const text = [
        button.innerText || "",
        button.getAttribute("aria-label") || "",
        button.getAttribute("data-testid") || "",
      ].join(" ");
      return /schedule|예약/i.test(text);
    });
    if (!scheduleButton) return false;
    scheduleButton.click();
    return true;
  })()`);
  if (!opened) throw new Error("X 예약 버튼을 찾지 못했습니다.");
  await sleep(1200);

  const filled = await page.eval(`((parts) => {
    const setValue = (el, value) => {
      if (el.tagName === "SELECT") {
        el.value = value;
      } else {
        const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value")?.set;
        if (setter) setter.call(el, value);
        else el.value = value;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const fields = Array.from(document.querySelectorAll('input, select'));
    const selects = Array.from(document.querySelectorAll('select'));
    const find = (patterns) => fields.find((field) => {
      const label = [
        field.getAttribute("aria-label") || "",
        field.getAttribute("name") || "",
        field.getAttribute("placeholder") || "",
        field.id || "",
      ].join(" ");
      return patterns.some((pattern) => pattern.test(label));
    });
    const month = find([/month/i, /월/]) || selects[0];
    const day = find([/day/i, /일/]) || selects[1];
    const year = find([/year/i, /년/]) || selects[2];
    const hour = find([/hour/i, /시/]) || selects[3];
    const minute = find([/minute/i, /분/]) || selects[4];
    const ampm = find([/am\\/?pm/i, /오전|오후/]) || selects[5];
    const required = [month, day, year, hour, minute];
    if (required.some((field) => !field)) {
      return { ok: false, reason: "예약 날짜/시간 입력 필드를 찾지 못했습니다.", fieldCount: fields.length, selectCount: selects.length };
    }
    setValue(month, parts.month);
    setValue(day, parts.day);
    setValue(year, parts.year);
    setValue(hour, parts.hour);
    setValue(minute, parts.minute);
    if (ampm) setValue(ampm, parts.ampm.toLowerCase());
    return {
      ok: true,
      fieldCount: fields.length,
      selectCount: selects.length,
      values: {
        month: month.value,
        day: day.value,
        year: year.value,
        hour: hour.value,
        minute: minute.value,
        ampm: ampm?.value || "",
      },
    };
  })(${JSON.stringify(parts)})`);
  if (!filled.ok) throw new Error(filled.reason || "X 예약 시간을 입력하지 못했습니다.");
  logEvent("schedule_fields_filled", { scheduledAt: scheduledAt.toISOString(), filled });
  let scheduleReady = null;
  for (let i = 0; i < 10; i++) {
    scheduleReady = await page.eval(`((parts) => {
      const selects = Array.from(document.querySelectorAll('select'));
      const setSelect = (index, value) => {
        const el = selects[index];
        if (!el) return;
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      setSelect(0, parts.month);
      setSelect(1, parts.day);
      setSelect(2, parts.year);
      setSelect(3, parts.hour);
      setSelect(4, String(Number(parts.minute)));
      setSelect(5, parts.ampm.toLowerCase());
      const button = document.querySelector('[data-testid="scheduledConfirmationPrimaryAction"]');
      return {
        values: selects.map((select) => select.value),
        hasButton: Boolean(button),
        disabled: button ? (button.disabled || button.getAttribute("aria-disabled") === "true") : true,
        buttonText: button?.innerText || "",
      };
    })(${JSON.stringify(parts)})`);
    logEvent("schedule_fields_state", { scheduledAt: scheduledAt.toISOString(), state: scheduleReady });
    if (scheduleReady.hasButton && !scheduleReady.disabled) break;
    await sleep(500);
  }
  if (!scheduleReady || scheduleReady.disabled) {
    throw new Error(`X 예약 확인 버튼이 활성화되지 않았습니다: ${JSON.stringify(scheduleReady)}`);
  }

  const confirmed = await page.eval(`(() => {
    const confirmButton = document.querySelector('[data-testid="scheduledConfirmationPrimaryAction"]');
    if (!confirmButton) return false;
    if (confirmButton.disabled || confirmButton.getAttribute("aria-disabled") === "true") return false;
    confirmButton.click();
    return true;
  })()`);
  if (!confirmed) throw new Error("X 예약 확인 버튼을 찾지 못했습니다.");
  await sleep(1600);
  logEvent("schedule_set", { scheduledAt: scheduledAt.toISOString() });
}

async function getComposerState(page) {
  return page.eval(`(() => {
    const attachmentNodes = Array.from(document.querySelectorAll(
      '[data-testid="attachments"] img, [data-testid="attachments"] video, [data-testid="media"] img, [data-testid="media"] video'
    ));
    const busyNodes = Array.from(document.querySelectorAll('[role="progressbar"], [aria-busy="true"]'));
    const busy = busyNodes.some((node) => {
      const text = node.innerText || node.getAttribute("aria-label") || "";
      return !/트렌드|timeline|feed/i.test(text);
    });
    const errorText = Array.from(document.querySelectorAll('[role="alert"]'))
      .map((el) => el.innerText)
      .filter((text) => text && !/게시물을 전송했습니다|posted|sent/i.test(text))
      .filter(Boolean)
      .join("\\n");
    const readyText = /준비 완료|ready|uploaded|업로드 완료/i.test(document.body.innerText || "");
    const activePostButton = Array.from(document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'))
      .some((btn) => btn.getAttribute("aria-disabled") !== "true" && !btn.disabled);
    return {
      busy,
      errorText,
      readyText,
      activePostButton,
      attachmentCount: attachmentNodes.length,
      attachmentKinds: attachmentNodes.map((node) => node.tagName.toLowerCase()),
    };
  })()`);
}

async function waitForUploadToSettle(page, expectedMediaCount, mediaFiles = []) {
  let stableReadyTicks = 0;
  let sawExpectedAttachment = false;
  let lastState = null;
  const hasVideo = mediaFiles.some((file) => /\.mp4$/i.test(file));
  for (let i = 0; i < 120; i++) {
    const state = await getComposerState(page);
    lastState = state;
    if (i % 5 === 0) logEvent("upload_wait_state", state);
    if (state.errorText) throw new Error(`X 미디어 업로드 실패: ${state.errorText}`);
    if (state.attachmentCount >= expectedMediaCount) sawExpectedAttachment = true;
    if (sawExpectedAttachment && state.attachmentCount < expectedMediaCount) {
      throw new Error(`X가 업로드된 미디어를 제거했습니다: ${JSON.stringify(state)}`);
    }
    if (state.attachmentCount >= expectedMediaCount && state.readyText && state.activePostButton) {
      stableReadyTicks += 1;
      if (stableReadyTicks >= 2) return;
    } else if (!hasVideo && state.attachmentCount >= expectedMediaCount && state.activePostButton) {
      stableReadyTicks += 1;
      if (stableReadyTicks >= 3) return;
    } else if (state.attachmentCount >= expectedMediaCount && !state.busy && state.activePostButton) {
      stableReadyTicks += 1;
      if (stableReadyTicks >= 5) return;
    } else {
      stableReadyTicks = 0;
    }
    await sleep(1000);
  }
  throw new Error(`X 미디어 업로드 완료를 확인하지 못했습니다: ${JSON.stringify(lastState)}`);
}

async function waitForPostButton(page, expectedMediaCount = 0) {
  let lastState = null;
  for (let i = 0; i < 120; i++) {
    const buttonState = await page.eval(`(() => {
      const buttons = Array.from(document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'));
      const button = buttons[0] || null;
      const textbox = document.querySelector('[data-testid="tweetTextarea_0"]');
      const alerts = Array.from(document.querySelectorAll('[role="alert"]')).map((el) => el.innerText).filter(Boolean);
      return {
        hasButton: Boolean(button),
        disabled: button ? (button.getAttribute("aria-disabled") === "true" || button.disabled) : true,
        buttonText: button?.innerText || "",
        textLength: textbox?.innerText?.length || 0,
        textbox: textbox?.innerText || "",
        alerts,
      };
    })()`);
    const composerState = await getComposerState(page);
    const state = { ...buttonState, ...composerState };
    lastState = state;
    if (expectedMediaCount > 0 && state.attachmentCount < expectedMediaCount) {
      await sleep(1000);
      continue;
    }
    if (state.hasButton && !state.disabled) return { ok: true };
    await sleep(1000);
  }
  return { ok: false, reason: JSON.stringify(lastState) };
}

async function mirrorThread(url, options = {}) {
  const canonicalUrl = validateThreadsUrl(url);
  const requestedScheduledAt = parseRequestedScheduleTime(options.scheduledAt);
  const completed = findCompletedMirror(canonicalUrl);
  if (completed) {
    throw new DuplicateMirrorError("이미 X에 게시 또는 예약된 Threads URL입니다.", {
      canonicalUrl,
      previousStatus: completed.status,
      previousScheduledAt: completed.scheduledAt,
      previousCompletedAt: completed.completedAt,
    });
  }
  logEvent("mirror_start", {
    canonicalUrl,
    hasTextOverride: Boolean(options.textOverride && String(options.textOverride).trim()),
    schedule: Boolean(options.schedule),
    requestedScheduledAt: requestedScheduledAt?.toISOString(),
  });
  const threadPost = await extractThreadPost(canonicalUrl, {
    allowEmptyText: Boolean(options.textOverride && String(options.textOverride).trim()),
  });
  logEvent("thread_extracted", {
    canonicalUrl,
    textPreview: threadPost.text.slice(0, 120),
    mediaCount: threadPost.mediaUrls.length,
    diagnostics: threadPost.diagnostics,
  });
  if ((threadPost.diagnostics?.mediaCandidateCount || 0) > 0 && threadPost.mediaUrls.length === 0) {
    throw new Error("Threads 원글에서 미디어 후보를 발견했지만 첨부 대상으로 확정하지 못해 게시를 중단했습니다.");
  }
  if (options.textOverride && String(options.textOverride).trim()) {
    threadPost.text = String(options.textOverride).trim().slice(0, 280);
  }
  if (options.schedule) {
    logEvent("schedule_media_strategy", {
      canonicalUrl,
      reason: "keep_original_media_for_x_scheduled_post",
      mediaCount: threadPost.mediaUrls.length,
      videoCount: threadPost.videoMediaUrls?.length || 0,
      imageCount: threadPost.imageMediaUrls.length,
    });
  }
  const media = await downloadMedia(threadPost.mediaUrls);
  try {
    logEvent("media_downloaded", {
      canonicalUrl,
      downloadedCount: media.files.length,
      files: media.files.map((file) => path.basename(file)),
    });
    const postResult = await postToX(threadPost, media.files, {
      schedule: Boolean(options.schedule),
      scheduledAt: requestedScheduledAt,
    });
    recordCompletedMirror({
      canonicalUrl,
      status: postResult.scheduledAt ? "scheduled" : "posted",
      scheduledAt: postResult.scheduledAt?.toISOString(),
      mediaCount: media.files.length,
    });
    logEvent("mirror_success", { canonicalUrl, mediaCount: media.files.length, scheduledAt: postResult.scheduledAt?.toISOString() });
    return {
      canonicalUrl,
      mediaCount: media.files.length,
      scheduledAt: postResult.scheduledAt?.toISOString(),
      message: postResult.scheduledAt ? `X 예약됨 · ${postResult.scheduledAt.toLocaleString("ko-KR")}` : "X 게시됨",
    };
  } finally {
    fs.rmSync(media.dir, { recursive: true, force: true });
    logEvent("cleanup_done", { canonicalUrl, dir: media.dir });
  }
}

async function createXDraftFromThread(url, options = {}) {
  const canonicalUrl = validateThreadsUrl(url);
  logEvent("x_draft_start", {
    canonicalUrl,
    hasTextOverride: Boolean(options.textOverride && String(options.textOverride).trim()),
  });
  const threadPost = await extractThreadPost(canonicalUrl, {
    allowEmptyText: Boolean(options.textOverride && String(options.textOverride).trim()),
  });
  logEvent("thread_extracted_for_draft", {
    canonicalUrl,
    textPreview: threadPost.text.slice(0, 120),
    mediaCount: threadPost.mediaUrls.length,
    diagnostics: threadPost.diagnostics,
  });
  if ((threadPost.diagnostics?.mediaCandidateCount || 0) > 0 && threadPost.mediaUrls.length === 0) {
    throw new Error("Threads 원글에서 미디어 후보를 발견했지만 첨부 대상으로 확정하지 못해 초안 저장을 중단했습니다.");
  }
  if (options.textOverride && String(options.textOverride).trim()) {
    threadPost.text = String(options.textOverride).trim().slice(0, 280);
  }
  const media = await downloadMedia(threadPost.mediaUrls);
  try {
    logEvent("media_downloaded_for_draft", {
      canonicalUrl,
      downloadedCount: media.files.length,
      files: media.files.map((file) => path.basename(file)),
    });
    await createXDraft(threadPost, media.files);
    logEvent("x_draft_success", { canonicalUrl, mediaCount: media.files.length });
    return {
      canonicalUrl,
      mediaCount: media.files.length,
      message: "X 초안 저장됨",
    };
  } finally {
    fs.rmSync(media.dir, { recursive: true, force: true });
    logEvent("cleanup_done", { canonicalUrl, dir: media.dir, draft: true });
  }
}

function parseRequestedScheduleTime(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw new Error(`예약 시간을 해석하지 못했습니다: ${value}`);
    }
    if (value.getTime() <= Date.now() + 5 * 60 * 1000) {
      throw new Error("예약 시간은 현재보다 최소 5분 이후여야 합니다.");
    }
    return value;
  }
  const raw = String(value).trim();
  const localMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!localMatch && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    throw new Error(`예약 시간은 대시보드 로컬 시간 형식이어야 합니다. 시간대가 포함된 값은 거부합니다: ${raw}`);
  }
  const date = localMatch
    ? new Date(
      Number(localMatch[1]),
      Number(localMatch[2]) - 1,
      Number(localMatch[3]),
      Number(localMatch[4]),
      Number(localMatch[5]),
      Number(localMatch[6] || 0),
    )
    : new Date(raw);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`예약 시간을 해석하지 못했습니다: ${value}`);
  }
  if (date.getTime() <= Date.now() + 5 * 60 * 1000) {
    throw new Error("예약 시간은 현재보다 최소 5분 이후여야 합니다.");
  }
  return date;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && tryServeDashboardAsset(req, res)) {
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, { ok: true, chromePort: CHROME_PORT, requiredXHandle: REQUIRED_X_HANDLE });
    return;
  }
  if (req.method === "GET" && req.url === "/api/terafabx/automation") {
    try {
      json(res, 200, getTerafabxAutomationStatus());
    } catch (error) {
      logEvent("terafabx_status_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/terafabx/automation") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const job = String(payload.job || "");
      const action = String(payload.action || "");
      if (!["comment", "heart"].includes(job)) throw new Error("job은 comment 또는 heart만 가능합니다.");
      if (!["run", "enable", "disable"].includes(action)) throw new Error("action은 run, enable, disable만 가능합니다.");
      let result;
      if (action === "enable") {
        result = saveTerafabxState(job === "comment" ? { commentEnabled: true } : { heartEnabled: true });
      } else if (action === "disable") {
        result = saveTerafabxState(job === "comment" ? { commentEnabled: false } : { heartEnabled: false });
      } else if (job === "comment") {
        result = await runTerafabxCommentOnce({ manual: true });
      } else {
        result = await runTerafabxHeartOnce({ manual: true });
      }
      json(res, 200, { ok: true, job, action, result, status: getTerafabxAutomationStatus() });
    } catch (error) {
      logEvent("terafabx_action_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/discovery")) {
    try {
      if (fs.existsSync(DASHBOARD_INDEX_PATH)) {
        serveFile(res, DASHBOARD_INDEX_PATH);
      } else {
        html(res, 200, await renderDiscoveryDashboard(req.url));
      }
    } catch (error) {
      logEvent("discovery_dashboard_error", { error: error.message });
      html(res, 500, `<pre>${escapeHtml(error.message)}</pre>`);
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/inspect-thread") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const canonicalUrl = validateThreadsUrl(payload.url);
      const threadPost = await extractThreadPost(canonicalUrl);
      json(res, 200, {
        ok: true,
        canonicalUrl,
        text: threadPost.text,
        likeCount: threadPost.likeCount,
        mediaCount: threadPost.mediaUrls.length,
        mediaUrls: threadPost.mediaUrls,
        diagnostics: threadPost.diagnostics,
      });
    } catch (error) {
      logEvent("inspect_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/run") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const result = await runDiscoveryScan({
        manual: true,
        minLikes: payload.minLikes || DISCOVERY_MIN_LIKES,
        maxScrolls: payload.maxScrolls || DISCOVERY_MAX_SCROLLS,
      });
      json(res, 200, {
        ok: true,
        found: result.found || 0,
        validated: result.validated || 0,
        saved: result.saved,
        rejected: result.rejected || [],
        candidates: (result.candidates || []).slice(0, 20),
      });
    } catch (error) {
      logEvent("discovery_run_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/process-due") {
    try {
      const result = await processDueDiscoveryPost();
      json(res, result.ok ? 200 : 500, result);
    } catch (error) {
      logEvent("discovery_process_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/refresh-previews") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const result = await refreshDiscoveryPreviews(Number(payload.limit || 20));
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      logEvent("discovery_refresh_previews_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/add-url") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const placeholder = await addDiscoveryPlaceholder(payload.url, { text: payload.text, origin: payload.origin || "sync_api" });
      json(res, 202, {
        ok: true,
        accepted: true,
        canonicalUrl: placeholder.canonicalUrl,
        saved: placeholder,
        message: "대시보드에 즉시 추가됨. 미리보기는 백그라운드에서 보강 중입니다.",
      });
      setImmediate(async () => {
        try {
          await addThreadToDiscoveryReview(placeholder.canonicalUrl, { text: payload.text });
        } catch (error) {
          await markDiscoveryDetailError(placeholder.canonicalUrl, error).catch(() => {});
          logEvent("discovery_add_url_async_error", {
            canonicalUrl: placeholder.canonicalUrl,
            origin: payload.origin || "sync_api",
            error: error.message,
          });
        }
      });
    } catch (error) {
      logEvent("discovery_add_url_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/add-url-async") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const placeholder = await addDiscoveryPlaceholder(payload.url, { text: payload.text, origin: payload.origin || "async_api" });
      json(res, 202, {
        ok: true,
        accepted: true,
        canonicalUrl: placeholder.canonicalUrl,
        saved: placeholder,
        message: "대시보드에 즉시 추가됨. 미리보기는 백그라운드에서 보강 중입니다.",
      });
      setImmediate(async () => {
        try {
          await addThreadToDiscoveryReview(placeholder.canonicalUrl, { text: payload.text });
        } catch (error) {
          await markDiscoveryDetailError(placeholder.canonicalUrl, error).catch(() => {});
          logEvent("discovery_add_url_async_error", {
            canonicalUrl: placeholder.canonicalUrl,
            origin: payload.origin || null,
            error: error.message,
          });
        }
      });
    } catch (error) {
      logEvent("discovery_add_url_async_accept_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/title") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const canonicalUrl = validateThreadsUrl(payload.url);
      const result = await updateDiscoveryTitle(canonicalUrl, payload.text);
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      logEvent("discovery_title_update_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/post") {
    if (busy) {
      json(res, 429, { ok: false, error: "다른 미러링 작업이 진행 중입니다." });
      return;
    }
    let canonicalUrl = "";
    busy = true;
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      canonicalUrl = validateThreadsUrl(payload.url);
      if (payload.text && String(payload.text).trim()) {
        await updateDiscoveryTitle(canonicalUrl, payload.text);
      }
      const result = await mirrorThread(canonicalUrl, {
        textOverride: payload.text,
        schedule: false,
      });
      await markDiscoveryPosted(canonicalUrl, result.mediaCount);
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      if (canonicalUrl) await markDiscoveryPostFailed(canonicalUrl, error);
      if (error instanceof DuplicateMirrorError) {
        logEvent("discovery_manual_post_duplicate", { error: error.message, ...error.details });
        json(res, 409, { ok: false, duplicate: true, error: error.message, ...error.details });
      } else {
        logEvent("discovery_manual_post_error", { canonicalUrl, error: error.message });
        json(res, 500, { ok: false, error: error.message });
      }
    } finally {
      busy = false;
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/draft") {
    if (busy) {
      json(res, 429, { ok: false, error: "다른 미러링 작업이 진행 중입니다." });
      return;
    }
    let canonicalUrl = "";
    busy = true;
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      canonicalUrl = validateThreadsUrl(payload.url);
      if (payload.text && String(payload.text).trim()) {
        await updateDiscoveryTitle(canonicalUrl, payload.text);
      }
      const result = await createXDraftFromThread(canonicalUrl, {
        textOverride: payload.text,
      });
      await markDiscoveryDrafted(canonicalUrl, result.mediaCount);
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      if (canonicalUrl) await markDiscoveryDraftFailed(canonicalUrl, error);
      logEvent("discovery_manual_draft_error", { canonicalUrl, error: error.message });
      json(res, 500, { ok: false, error: error.message });
    } finally {
      busy = false;
    }
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/api/discovery/dashboard")) {
    try {
      json(res, 200, await getDiscoveryDashboardData(req.url));
    } catch (error) {
      logEvent("discovery_dashboard_api_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/auto-scan") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const settings = setAutoDiscoveryEnabled(payload.enabled === true);
      json(res, 200, { ok: true, autoDiscoveryEnabled: settings.autoDiscoveryEnabled });
    } catch (error) {
      logEvent("discovery_auto_scan_setting_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/discard-discovered") {
    try {
      const result = await discardDiscoveredRows();
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      logEvent("discovery_discard_discovered_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/schedule") {
    if (busy) {
      json(res, 429, { ok: false, error: "다른 미러링 작업이 진행 중입니다." });
      return;
    }
    let canonicalUrl = "";
    busy = true;
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      canonicalUrl = validateThreadsUrl(payload.url);
      if (payload.text && String(payload.text).trim()) {
        await updateDiscoveryTitle(canonicalUrl, payload.text);
      }
      logEvent("discovery_manual_schedule_request", {
        canonicalUrl,
        scheduledAtRaw: payload.scheduledAt || null,
        browserTimezone: payload.scheduledAtTimezone || null,
        browserOffsetMinutes: Number.isFinite(Number(payload.scheduledAtOffsetMinutes)) ? Number(payload.scheduledAtOffsetMinutes) : null,
      });
      const result = await mirrorThread(canonicalUrl, {
        textOverride: payload.text,
        schedule: true,
        scheduledAt: payload.scheduledAt,
      });
      await markDiscoveryScheduled(canonicalUrl, result.mediaCount, result.scheduledAt);
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      if (canonicalUrl) await markDiscoveryScheduleFailed(canonicalUrl, error);
      if (error instanceof DuplicateMirrorError) {
        logEvent("discovery_manual_schedule_duplicate", { error: error.message, ...error.details });
        json(res, 409, { ok: false, duplicate: true, error: error.message, ...error.details });
      } else {
        logEvent("discovery_manual_schedule_error", { canonicalUrl, error: error.message });
        json(res, 500, { ok: false, error: error.message });
      }
    } finally {
      busy = false;
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/auto-schedule") {
    if (busy) {
      json(res, 429, { ok: false, error: "다른 미러링 작업이 진행 중입니다." });
      return;
    }
    let canonicalUrl = "";
    busy = true;
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      canonicalUrl = validateThreadsUrl(payload.url);
      if (payload.text && String(payload.text).trim()) {
        await updateDiscoveryTitle(canonicalUrl, payload.text);
      }
      const scheduledAt = await nextAutoScheduleTime();
      logEvent("discovery_auto_schedule_request", {
        canonicalUrl,
        scheduledAt: scheduledAt.toISOString(),
      });
      const result = await mirrorThread(canonicalUrl, {
        textOverride: payload.text,
        schedule: true,
        scheduledAt,
      });
      await markDiscoveryScheduled(canonicalUrl, result.mediaCount, result.scheduledAt);
      json(res, 200, { ok: true, autoScheduled: true, ...result });
    } catch (error) {
      if (canonicalUrl) await markDiscoveryScheduleFailed(canonicalUrl, error);
      if (error instanceof DuplicateMirrorError) {
        logEvent("discovery_auto_schedule_duplicate", { error: error.message, ...error.details });
        json(res, 409, { ok: false, duplicate: true, error: error.message, ...error.details });
      } else {
        logEvent("discovery_auto_schedule_error", { canonicalUrl, error: error.message });
        json(res, 500, { ok: false, error: error.message });
      }
    } finally {
      busy = false;
    }
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/api/discovery/status")) {
    try {
      const rows = await listDiscoveryRows(50);
      json(res, 200, {
        ok: true,
        mode: "dashboard_manual_post",
        xDraftOnly: false,
        autoDiscoveryEnabled: isAutoDiscoveryEnabled(),
        minLikes: DISCOVERY_MIN_LIKES,
        maxScrolls: DISCOVERY_MAX_SCROLLS,
        scanIntervalMs: DISCOVERY_SCAN_INTERVAL_MS,
        rows,
      });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/mirror-thread-async") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const canonicalUrl = validateThreadsUrl(payload.url);
      json(res, 202, { ok: true, accepted: true, canonicalUrl, message: "대시보드 추가 접수됨" });
      setImmediate(async () => {
        try {
          await addThreadToDiscoveryReview(canonicalUrl, { text: payload.text });
        } catch (error) {
          logEvent("share_add_to_discovery_error", { canonicalUrl, error: error.message });
        }
      });
    } catch (error) {
      logEvent("share_accept_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method !== "POST" || req.url !== "/api/mirror-thread") {
    json(res, 404, { ok: false, error: "not found" });
    return;
  }
  if (busy) {
    json(res, 429, { ok: false, error: "다른 미러링 작업이 진행 중입니다." });
    return;
  }
  busy = true;
  try {
    const body = await readRequestBody(req);
    const payload = JSON.parse(body || "{}");
    const result = await mirrorThread(payload.url, {
      textOverride: payload.text,
      schedule: Boolean(payload.schedule),
      scheduledAt: payload.scheduledAt,
    });
    json(res, 200, { ok: true, ...result });
  } catch (error) {
    if (error instanceof DuplicateMirrorError) {
      logEvent("mirror_duplicate", { error: error.message, ...error.details });
      json(res, 409, { ok: false, duplicate: true, error: error.message, ...error.details });
      return;
    }
    logEvent("mirror_error", { error: error.message });
    json(res, 500, { ok: false, error: error.message });
  } finally {
    busy = false;
  }
});

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`thread mirror server listening on http://0.0.0.0:${PORT}`);
  console.log(`using Chrome remote debugging port ${CHROME_PORT}; required X account @${REQUIRED_X_HANDLE}`);
});

setInterval(() => {
  runDiscoveryScan().catch((error) => {
    logEvent("discovery_auto_scan_error", { error: error.message });
  });
}, DISCOVERY_SCAN_INTERVAL_MS);

setInterval(() => {
  maybeRunTerafabxAutomation().catch((error) => {
    logEvent("terafabx_auto_tick_error", { error: error.message });
  });
}, 60 * 1000);
