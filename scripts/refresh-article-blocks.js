#!/usr/bin/env node
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const WebSocket = require("ws");
const { ARTICLES_ROOT, listSavedArticles, articleDir } = require("../lib/saved-articles-page");

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (error) { reject(error); }
      });
    }).on("error", reject);
  });
}

function putNew(url) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: 9224,
      path: `/json/new?${encodeURIComponent(url)}`,
      method: "PUT",
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function closeTab(id) {
  return new Promise((resolve) => {
    http.get(`http://127.0.0.1:9224/json/close/${id}`, () => resolve()).on("error", () => resolve());
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mediaKey(url) {
  const text = String(url || "");
  const media = text.match(/\/media\/([^/?]+)/);
  if (media) return media[1];
  const thumb = text.match(/amplify_video_thumb\/(\d+)/);
  if (thumb) return thumb[1];
  return "";
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, {
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://x.com/" },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        fs.writeFileSync(dest, body);
        resolve(body.length);
      });
    });
    req.on("error", reject);
  });
}

const EXTRACT = `(() => {
  const root = document.querySelector('[data-testid="twitterArticleRichTextView"]');
  if (!root) return { error: "missing rich text", href: location.href };
  const nodes = [...root.querySelectorAll('[data-block="true"], [data-testid="tweetPhoto"], video')]
    .filter((el) => el.matches("video, [data-testid='tweetPhoto']") || /longform-/.test(String(el.className || "")));
  const blocks = [];
  for (const el of nodes) {
    if (el.matches("[data-testid='tweetPhoto']") && el.querySelector("video")) continue;
    if (el.tagName === "VIDEO") {
      blocks.push({ type: "video", poster: el.poster || "", src: el.currentSrc || el.src || "" });
      continue;
    }
    if (el.getAttribute("data-testid") === "tweetPhoto") {
      const img = el.querySelector("img");
      blocks.push({ type: "image", src: img ? (img.currentSrc || img.src || "") : "" });
      continue;
    }
    const cls = String(el.className || "");
    const type = cls.includes("header-one") ? "h1" : cls.includes("header-two") ? "h2" : "p";
    const spans = [];
    for (const node of el.querySelectorAll("[data-text='true']")) {
      if (node.tagName === "BR") continue;
      const text = node.textContent || "";
      if (!text) continue;
      let bold = false;
      let italic = false;
      let href = "";
      let parent = node.parentElement;
      while (parent && parent !== el) {
        const style = parent.getAttribute("style") || "";
        if (/font-weight:\\s*(bold|[6-9]00)/i.test(style)) bold = true;
        if (/font-style:\\s*italic/i.test(style)) italic = true;
        if (parent.tagName === "A" && parent.href) href = parent.href;
        parent = parent.parentElement;
      }
      const prev = spans[spans.length - 1];
      if (prev && prev.bold === bold && prev.italic === italic && prev.href === href) prev.text += text;
      else spans.push({ text, bold, italic, href });
    }
    blocks.push({ type, spans });
  }
  return { href: location.href, count: blocks.length, blocks };
})()`;

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  let id = 0;
  const pending = new Map();
  ws.on("message", (raw) => {
    const message = JSON.parse(raw);
    if (message.id && pending.has(message.id)) pending.get(message.id)(message);
  });
  const send = (method, params = {}) => new Promise((resolve) => {
    const next = ++id;
    pending.set(next, resolve);
    ws.send(JSON.stringify({ id: next, method, params }));
  });
  return { ws, send };
}

function fileForKey(media, key) {
  if (!key) return "";
  const hit = media.find((item) => mediaKey(item.sourceUrl).includes(key) || String(item.sourceUrl || "").includes(key));
  return hit?.file || "";
}

(async () => {
  const filterIds = new Set(process.argv.slice(2).filter((arg) => /^\d+$/.test(arg)));
  const articles = listSavedArticles().filter((entry) => !filterIds.size || filterIds.has(String(entry.id)));
  if (!articles.length) {
    throw new Error(`no matching saved articles for: ${[...filterIds].join(", ")}`);
  }
  for (const entry of articles) {
    const dir = articleDir(entry);
    const record = JSON.parse(fs.readFileSync(path.join(dir, "article.json"), "utf8"));
    const media = Array.isArray(record.media) ? record.media : [];
    const videos = media.filter((item) => item.type === "video");
    let videoCursor = 0;
    console.log("\\n===", entry.title);
    const tab = await putNew(entry.articleUrl || `https://x.com/mung99933/article/${entry.id}`);
    await sleep(7000);
    const tabs = await getJson("http://127.0.0.1:9224/json/list");
    const page = tabs.find((item) => item.id === tab.id) || tabs.find((item) => (item.url || "").includes(entry.id));
    const { ws, send } = await connect(page.webSocketDebuggerUrl);
    await send("Runtime.enable");
    for (let i = 0; i < 14; i += 1) {
      await send("Runtime.evaluate", { expression: "window.scrollBy(0, 1600); true" });
      await sleep(350);
    }
    await send("Runtime.evaluate", { expression: "window.scrollTo(0, 0); true" });
    await sleep(400);
    const extracted = await send("Runtime.evaluate", { expression: EXTRACT, returnByValue: true });
    const value = extracted.result?.result?.value;
    ws.close();
    await closeTab(page.id);
    if (!value?.blocks) throw new Error(value?.error || "extract failed");
    const mediaDir = path.join(dir, "media");
    fs.mkdirSync(mediaDir, { recursive: true });
    const blocks = [];
    let extra = 0;
    for (const block of value.blocks) {
      if (block.type === "image" || block.type === "video") {
        const key = mediaKey(block.type === "video" ? block.poster : block.src);
        let file = fileForKey(media, key);
        if (block.type === "video" && !file && videos[videoCursor]) {
          file = videos[videoCursor].file;
          videoCursor += 1;
        }
        if (!file && block.type === "video" && block.poster) {
          extra += 1;
          const name = `poster_${String(extra).padStart(2, "0")}.jpg`;
          file = `media/${name}`;
          try {
            const bytes = await download(block.poster, path.join(dir, file));
            console.log("  poster", name, bytes);
          } catch (error) {
            console.log("  poster fail", error.message);
            file = "";
          }
        }
        if (!file && block.type === "image" && block.src) {
          extra += 1;
          const ext = /format=png|\\.png/i.test(block.src) ? "png" : "jpg";
          const name = `inline_${String(extra).padStart(2, "0")}.${ext}`;
          file = `media/${name}`;
          const url = block.src.replace(/name=[^&]+/, "name=orig");
          try {
            const bytes = await download(url, path.join(dir, file));
            console.log("  image", name, bytes);
          } catch (error) {
            console.log("  image fail", error.message);
            file = "";
          }
        }
        if (file) blocks.push({ type: block.type === "video" && /\.mp4$/i.test(file) ? "video" : "image", file });
        continue;
      }
      blocks.push({
        type: block.type,
        spans: (block.spans || []).map((span) => ({
          text: span.text,
          ...(span.bold ? { bold: true } : {}),
          ...(span.italic ? { italic: true } : {}),
          ...(span.href ? { href: span.href } : {}),
        })),
      });
    }
    fs.writeFileSync(path.join(dir, "blocks.json"), JSON.stringify({
      extractedAt: new Date().toISOString(),
      href: value.href,
      blocks,
    }, null, 2));
    const bold = blocks.filter((block) => (block.spans || []).some((span) => span.bold)).length;
    const italic = blocks.filter((block) => (block.spans || []).some((span) => span.italic)).length;
    const images = blocks.filter((block) => block.type === "image" || block.type === "video").length;
    console.log("  blocks", blocks.length, "bold", bold, "italic", italic, "media", images);
    await sleep(800);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
