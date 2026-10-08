#!/usr/bin/env node
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const OUT = path.join(__dirname, "..", ".data", "mung99933-youtube-articles");
const ARTICLES = [
  {
    id: "2105980367979364617",
    title: "유튜브 기본강의 chapter3 (채널을 빠르게 키우는 방법)",
    publishedAt: "2026-10-02T11:17:01.000Z",
  },
  {
    id: "2101631962394099880",
    title: '유튜브 고급강의 chapter0. ("나"를 창조하는 브랜딩 feat.AI)',
    publishedAt: "2026-09-20T11:18:00.000Z",
  },
  {
    id: "2101220953573487043",
    title: "유튜브 기본강의 chapter2. (1천벽과 1만벽의 진실)",
    publishedAt: "2026-09-19T08:04:48.000Z",
  },
  {
    id: "2098026448049291607",
    title: "유튜브 중급강의chapter 1. (일본에서 살아남기)",
    publishedAt: "2026-09-10T12:30:59.000Z",
  },
  {
    id: "2096166195846389998",
    title: "유튜브 수익 파이프라인 (개날먹)",
    publishedAt: "2026-09-05T09:19:00.000Z",
  },
  {
    id: "2095742698028511326",
    title: "허수가 되지않기위한 영상제작의 기본기(Feat. 왜 내 AI영상은 조회수가 안나올까?)",
    publishedAt: "2026-09-04T05:16:10.000Z",
  },
  {
    id: "2095393568978522422",
    title: "유튜브 기초강의 CHAPTER 0.5 -시중의 잘못된 정보들",
    publishedAt: "2026-09-03T06:08:52.000Z",
  },
  {
    id: "2094383631523573981",
    title: "유튜브 기본강의 chapter 0",
    publishedAt: "2026-08-31T11:15:44.000Z",
  },
];

function getJson(url) {
  return new Promise((res, rej) => {
    http
      .get(url, (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => {
          try {
            res(JSON.parse(d));
          } catch (e) {
            rej(e);
          }
        });
      })
      .on("error", rej);
  });
}

function putNew(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 9224,
        path: `/json/new?${encodeURIComponent(url)}`,
        method: "PUT",
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function closeTab(id) {
  return new Promise((resolve) => {
    http
      .get(`http://127.0.0.1:9224/json/close/${id}`, () => resolve())
      .on("error", () => resolve());
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sanitize(name) {
  return String(name || "article")
    .replace(/[\/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function toOrig(url) {
  try {
    const u = new URL(url);
    if (!/pbs\.twimg\.com/.test(u.hostname)) return url;
    if (/\/media\//.test(u.pathname)) {
      u.searchParams.set("name", "orig");
      if (!u.searchParams.get("format")) {
        const m = u.pathname.match(/\.(jpg|jpeg|png|webp)/i);
        if (m) {
          u.searchParams.set(
            "format",
            m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase()
          );
        } else {
          u.searchParams.set("format", "jpg");
        }
      }
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: "https://x.com/",
          Accept: "*/*",
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return download(res.headers.location, dest).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          fs.writeFileSync(dest, buf);
          resolve({ bytes: buf.length, contentType: res.headers["content-type"] || "" });
        });
      }
    );
    req.on("error", reject);
  });
}

function extFrom(url, contentType) {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("png")) return ".png";
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("gif")) return ".gif";
  if (ct.includes("mp4")) return ".mp4";
  if (ct.includes("jpeg") || ct.includes("jpg")) return ".jpg";
  try {
    const u = new URL(url);
    const f = u.searchParams.get("format");
    if (f) return `.${f}`;
    const m = u.pathname.match(/\.(jpg|jpeg|png|webp|gif|mp4)(?:$|\?)/i);
    if (m) return `.${m[1].toLowerCase().replace("jpeg", "jpg")}`;
  } catch {}
  return ".jpg";
}

async function connectWs(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => {
    ws.once("open", r);
    ws.once("error", j);
  });
  let id = 0;
  const pending = new Map();
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) pending.get(m.id)(m);
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const i = ++id;
      pending.set(i, resolve);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return { ws, send };
}

async function extractArticle(send) {
  for (let i = 0; i < 12; i++) {
    await send("Runtime.evaluate", {
      expression: "window.scrollBy(0, Math.max(1000, window.innerHeight)); true",
    });
    await sleep(700);
  }
  await send("Runtime.evaluate", { expression: "window.scrollTo(0,0); true" });
  await sleep(500);
  const ev = await send("Runtime.evaluate", {
    expression: `(() => {
      const imgs = [];
      const seen = new Set();
      for (const img of document.querySelectorAll('img')) {
        const src = img.currentSrc || img.src || '';
        if (!src || !/pbs\\.twimg\\.com\\/media\\//.test(src)) continue;
        const key = src.split('?')[0];
        if (seen.has(key)) continue;
        seen.add(key);
        imgs.push({
          src,
          w: img.naturalWidth || 0,
          h: img.naturalHeight || 0,
          alt: (img.alt || '').slice(0, 120),
        });
      }
      const videos = [];
      for (const v of document.querySelectorAll('video')) {
        const src = v.currentSrc || v.src || '';
        if (!src) continue;
        videos.push({ src, poster: v.poster || '' });
      }
      const mediaLinks = [...document.querySelectorAll('a[href*="/media/"]')].map((a) => a.href);
      const yt = [...document.querySelectorAll('a[href*="youtu"]')].map((a) => a.href);
      const bodyText = document.body.innerText || '';
      let articleText = bodyText;
      const candidates = [
        document.querySelector('[data-testid="twitterArticleNote"]'),
        document.querySelector('article'),
        document.querySelector('[role="article"]'),
      ].filter(Boolean);
      if (candidates.length) {
        articleText = candidates.map((el) => el.innerText || '').join('\\n\\n');
      }
      articleText = articleText
        .replace(/키보드 단축키[\\s\\S]*?보기\\n?/g, '')
        .trim();
      return {
        href: location.href,
        title: document.title,
        images: imgs,
        videos,
        mediaLinks: [...new Set(mediaLinks)],
        youtubeLinks: [...new Set(yt)],
        text: articleText.slice(0, 120000),
        bodyLen: bodyText.length,
      };
    })()`,
    returnByValue: true,
  });
  return ev.result?.result?.value || null;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const filterIds = new Set(process.argv.slice(2).filter((arg) => /^\d+$/.test(arg)));
  const targets = filterIds.size
    ? ARTICLES.filter((art) => filterIds.has(art.id))
    : ARTICLES;
  if (!targets.length) {
    throw new Error(`no matching articles for: ${[...filterIds].join(", ")}`);
  }
  const index = [];
  for (const art of targets) {
    const folderName = `${art.id}_${sanitize(art.title)}`;
    const dir = path.join(OUT, folderName);
    const mediaDir = path.join(dir, "media");
    fs.mkdirSync(mediaDir, { recursive: true });
    const articleUrl = `https://x.com/mung99933/article/${art.id}`;
    console.log("\n===", art.title);
    console.log("open", articleUrl);
    let tab = null;
    try {
      tab = await putNew(articleUrl);
      await sleep(8000);
      const tabs = await getJson("http://127.0.0.1:9224/json/list");
      const page =
        tabs.find((t) => t.id === tab.id) ||
        tabs.find((t) => (t.url || "").includes(art.id));
      if (!page) throw new Error("tab not found after open");
      const { ws, send } = await connectWs(page.webSocketDebuggerUrl);
      await send("Runtime.enable");
      const cur = await send("Runtime.evaluate", {
        expression: "location.href",
        returnByValue: true,
      });
      const curHref = cur.result?.result?.value || "";
      if (!/\/article\//.test(curHref)) {
        await send("Page.enable");
        await send("Page.navigate", { url: articleUrl });
        await sleep(8000);
      }
      const data = await extractArticle(send);
      ws.close();
      if (!data) throw new Error("extract failed");

      const savedMedia = [];
      let i = 0;
      for (const img of data.images || []) {
        i += 1;
        const url = toOrig(img.src);
        const base = `img_${String(i).padStart(2, "0")}`;
        const tmp = path.join(mediaDir, base + ".tmp");
        try {
          const meta = await download(url, tmp);
          const ext = extFrom(url, meta.contentType);
          const finalPath = path.join(mediaDir, base + ext);
          fs.renameSync(tmp, finalPath);
          savedMedia.push({
            type: "image",
            file: path.relative(dir, finalPath),
            bytes: meta.bytes,
            sourceUrl: url,
            width: img.w,
            height: img.h,
          });
          console.log("  saved", path.basename(finalPath), meta.bytes);
        } catch (e) {
          console.log("  media fail", url, e.message);
          if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
        }
      }
      for (const v of data.videos || []) {
        i += 1;
        const url = v.src;
        if (!/^https?:/.test(url)) continue;
        const base = `vid_${String(i).padStart(2, "0")}`;
        const tmp = path.join(mediaDir, base + ".tmp");
        try {
          const meta = await download(url, tmp);
          const ext = extFrom(url, meta.contentType) || ".mp4";
          const finalPath = path.join(mediaDir, base + ext);
          fs.renameSync(tmp, finalPath);
          savedMedia.push({
            type: "video",
            file: path.relative(dir, finalPath),
            bytes: meta.bytes,
            sourceUrl: url,
            poster: v.poster || "",
          });
          console.log("  saved video", path.basename(finalPath), meta.bytes);
        } catch (e) {
          console.log("  video fail", url, e.message);
          if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
        }
      }

      let text = String(data.text || "");
      const dropRe =
        /^(홈|탐색하기|알림|채팅|Grok|Premium|역사|크리에이터 스튜디오|아티클|프로필|더 보기|게시하기|과즙루피|@terafabXai|기사|새 게시물 보기|대화|팔로우|키보드.*)$/;
      text = text
        .split("\n")
        .filter((line) => !dropRe.test(line.trim()))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      const record = {
        id: art.id,
        title: art.title,
        author: "mung99933",
        authorName: "야옹야옹",
        publishedAt: art.publishedAt,
        statusUrl: `https://x.com/mung99933/status/${art.id}`,
        articleUrl,
        extractedAt: new Date().toISOString(),
        youtubeLinks: data.youtubeLinks || [],
        mediaLinks: data.mediaLinks || [],
        media: savedMedia,
        text,
        pageTitle: data.title,
        href: data.href,
      };
      fs.writeFileSync(path.join(dir, "article.json"), JSON.stringify(record, null, 2));
      const md = [
        `# ${art.title}`,
        "",
        `- 작성자: 야옹야옹 (@mung99933)`,
        `- 발행: ${art.publishedAt}`,
        `- 아티클: ${articleUrl}`,
        `- 포스트: https://x.com/mung99933/status/${art.id}`,
        `- 미디어: ${savedMedia.length}개`,
        "",
        "## 본문",
        "",
        text,
        "",
        "## 미디어",
        "",
        ...savedMedia.map((m, idx) => `- [${idx + 1}] ${m.file} (${m.bytes} bytes)`),
        "",
        ...(record.youtubeLinks.length
          ? ["## YouTube 링크", "", ...record.youtubeLinks.map((u) => `- ${u}`), ""]
          : []),
      ].join("\n");
      fs.writeFileSync(path.join(dir, "article.md"), md);
      index.push({
        id: art.id,
        title: art.title,
        publishedAt: art.publishedAt,
        dir: folderName,
        mediaCount: savedMedia.length,
        textChars: text.length,
        articleUrl,
      });
      console.log("  text chars", text.length, "media", savedMedia.length);
    } catch (e) {
      console.error("FAIL", art.id, e.message);
      index.push({ id: art.id, title: art.title, error: e.message });
    } finally {
      if (tab?.id) await closeTab(tab.id);
      await sleep(1000);
    }
  }
  let articles = index;
  if (filterIds.size) {
    const indexPath = path.join(OUT, "index.json");
    const previous = fs.existsSync(indexPath)
      ? JSON.parse(fs.readFileSync(indexPath, "utf8"))
      : { articles: [] };
    const byId = new Map(
      (Array.isArray(previous.articles) ? previous.articles : [])
        .filter((item) => item && item.id && !item.error)
        .map((item) => [String(item.id), item])
    );
    for (const item of index) {
      if (item.error) continue;
      byId.set(String(item.id), item);
    }
    articles = [...byId.values()].sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")));
  }
  fs.writeFileSync(
    path.join(OUT, "index.json"),
    JSON.stringify({ savedAt: new Date().toISOString(), count: articles.length, articles }, null, 2)
  );
  console.log("\nDONE", OUT);
  console.log(JSON.stringify(articles, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
