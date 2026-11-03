const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function normalizeAagagUrl(value) {
  const url = new URL(String(value || "").trim());
  if (!["http:", "https:"].includes(url.protocol)
    || !["aagag.com", "www.aagag.com"].includes(url.hostname)
    || url.username || url.password || url.port
    || !/^\/issue\/?$/.test(url.pathname)
    || !/^\d+(?:_\d+)?$/.test(url.searchParams.get("idx") || "")) {
    throw new Error("AAGAG 이슈 URL 형식이 아닙니다.");
  }
  return `https://aagag.com/issue/?idx=${url.searchParams.get("idx")}`;
}

function isAagagUrl(value) {
  try { normalizeAagagUrl(value); return true; } catch { return false; }
}

function aagagIssueId(value) {
  return new URL(normalizeAagagUrl(value)).searchParams.get("idx").split("_")[0];
}

function normalizeAagagMediaUrl(value) {
  const url = new URL(value, "https://aagag.com");
  if (url.protocol !== "https:" || url.hostname !== "i.aagag.com"
    || url.username || url.password || url.port
    || !/\.(?:jpg|jpeg|png|webp|gif|mp4)$/i.test(url.pathname)) {
    throw new Error("지원하지 않는 AAGAG 미디어 URL입니다.");
  }
  return url.href;
}

// Runs only in the rendered article. Never collect the surrounding ads/list/comments.
function readAagagDocument() {
  const root = document.querySelector("#vContent");
  const title = document.querySelector("h1.title")?.textContent?.trim();
  if (!root || !title) return null;
  const copy = root.cloneNode(true);
  copy.querySelectorAll("script,style,iframe,video,audio,img,.stag,.s_opt,#videoAction,button").forEach((el) => el.remove());
  copy.querySelectorAll("br").forEach((el) => el.replaceWith("\n"));
  copy.querySelectorAll("p,div").forEach((el) => el.append("\n"));
  const body = copy.textContent.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const media = Array.from(root.querySelectorAll("img,video")).map((el) => ({
    url: el.currentSrc || el.getAttribute("src") || el.querySelector("source")?.getAttribute("src") || el.getAttribute("data-src"),
    type: el.tagName === "VIDEO" ? "video" : "image",
  })).filter((item) => item.url);
  return { url: location.href, title, body, media };
}

function normalizeAagagArticle(raw, url) {
  const canonicalUrl = normalizeAagagUrl(url);
  if (!raw?.title || !Array.isArray(raw.media)
    || aagagIssueId(raw.url) !== aagagIssueId(canonicalUrl)) {
    throw new Error("AAGAG 본문을 확인하지 못했습니다. 삭제 또는 접근 차단 여부를 확인하세요.");
  }
  const seen = new Set();
  const media = raw.media.map((item) => ({
    url: normalizeAagagMediaUrl(item.url),
    type: item.type === "video" ? "video" : "image",
  })).filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
  const title = String(raw.title).trim();
  const body = String(raw.body || "").trim();
  return { canonicalUrl, title, body, text: [title, body].filter(Boolean).join("\n\n"), media: media.slice(0, 4), totalMediaCount: media.length };
}

function createAagagSource({ newPage, withChromeLock, mediaRoot, logEvent = () => {} }) {
  const pending = new Map();
  const keyFor = (url) => `aagag-${crypto.createHash("sha256").update(normalizeAagagUrl(url)).digest("hex").slice(0, 24)}`;
  const directoryFor = (url) => path.join(mediaRoot, keyFor(url));

  async function load(url) {
    const canonicalUrl = normalizeAagagUrl(url);
    const dir = directoryFor(canonicalUrl);
    let manifest;
    try { manifest = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8")); } catch { return null; }
    if (manifest.canonicalUrl !== canonicalUrl || !manifest.text || !Array.isArray(manifest.files)
      || manifest.files.length !== manifest.media?.length || manifest.files.length > 4) return null;
    for (const file of manifest.files) {
      if (!/^media-[1-4]\.(?:jpg|mp4)$/.test(file)) return null;
      try { if (!(await fs.stat(path.join(dir, file))).size) return null; } catch { return null; }
    }
    return { ...manifest, files: manifest.files.map((file) => path.join(dir, file)),
      previewUrls: manifest.files.map((file) => `/generated-media/${keyFor(url)}/${file}`) };
  }

  async function browserMedia(url) {
    // The article CDN forbids cross-origin fetch; read in an owned same-origin tab.
    const page = await newPage(url);
    try {
      await page.navigate(url, 1500);
      const result = await page.evalFast(`(async () => {
        const response = await fetch(${JSON.stringify(url)}, { signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw new Error('AAGAG media HTTP ' + response.status);
        const type = response.headers.get('content-type') || '';
        if (!/^(image|video)\\//.test(type)) throw new Error('AAGAG 미디어 대신 오류 페이지가 반환되었습니다.');
        if (Number(response.headers.get('content-length')) > 80 * 1024 * 1024) throw new Error('AAGAG 미디어는 파일당 80MB까지 지원합니다.');
        const blob = await response.blob();
        if (!blob.size || blob.size > 80 * 1024 * 1024) throw new Error('AAGAG 미디어 크기 오류');
        return await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onerror = () => reject(new Error('미디어 읽기 실패'));
          reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob);
        });
      })()`, 90000);
      return Buffer.from(result, "base64");
    } finally { await page.close(); }
  }

  async function collectOnce(url) {
    const canonicalUrl = normalizeAagagUrl(url);
    return withChromeLock("aagag_collect", async () => {
      const page = await newPage(canonicalUrl);
      let article;
      try {
        await page.navigate(canonicalUrl, 2000);
        let raw;
        for (let attempt = 0; attempt < 15; attempt += 1) {
          raw = await page.eval(`(${readAagagDocument.toString()})()`);
          if (raw) break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        article = normalizeAagagArticle(raw, canonicalUrl);
      } finally { await page.close(); }
      const dir = directoryFor(canonicalUrl);
      await fs.mkdir(mediaRoot, { recursive: true });
      const staging = await fs.mkdtemp(`${dir}-`);
      try {
        const files = [];
        for (let i = 0; i < article.media.length; i += 1) {
          const item = article.media[i];
          const buffer = await browserMedia(item.url);
          const file = `media-${i + 1}.${item.type === "video" ? "mp4" : "jpg"}`;
          if (item.type === "video") {
            if (buffer.subarray(4, 8).toString() !== "ftyp") throw new Error("AAGAG 영상이 올바른 MP4가 아닙니다.");
            await fs.writeFile(path.join(staging, file), buffer);
          } else {
            const sharp = (await import("sharp")).default;
            await sharp(buffer).rotate().flatten({ background: "#fff" }).jpeg({ quality: 92 }).toFile(path.join(staging, file));
          }
          files.push(file);
        }
        await fs.writeFile(path.join(staging, "manifest.json"), JSON.stringify({ ...article, files, savedAt: new Date().toISOString() }, null, 2));
        await fs.rm(dir, { recursive: true, force: true });
        await fs.rename(staging, dir);
        logEvent("aagag_media_saved", { canonicalUrl, mediaCount: files.length, totalMediaCount: article.totalMediaCount });
        return load(canonicalUrl);
      } finally { await fs.rm(staging, { recursive: true, force: true }); }
    });
  }

  function collect(url) {
    const canonicalUrl = normalizeAagagUrl(url);
    if (!pending.has(canonicalUrl)) {
      const job = collectOnce(canonicalUrl).finally(() => pending.delete(canonicalUrl));
      pending.set(canonicalUrl, job);
    }
    return pending.get(canonicalUrl);
  }

  return { load, collect };
}

module.exports = { normalizeAagagUrl, isAagagUrl, aagagIssueId, normalizeAagagMediaUrl, readAagagDocument, normalizeAagagArticle, createAagagSource };
