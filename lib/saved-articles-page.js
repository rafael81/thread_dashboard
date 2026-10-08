const fs = require("node:fs");
const path = require("node:path");

const ARTICLES_ROOT = path.join(__dirname, "..", ".data", "mung99933-youtube-articles");
const MIN_IMAGE_BYTES = 12_000;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function listSavedArticles() {
  const indexPath = path.join(ARTICLES_ROOT, "index.json");
  if (!fs.existsSync(indexPath)) return [];
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  return Array.isArray(index.articles) ? index.articles : [];
}

function articleDir(entry) {
  const root = path.resolve(ARTICLES_ROOT);
  const dir = path.resolve(root, String(entry?.dir || ""));
  if (dir !== root && !dir.startsWith(`${root}${path.sep}`)) return null;
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  return dir;
}

function loadSavedArticle(id) {
  const entry = listSavedArticles().find((item) => item.id === String(id || ""));
  if (!entry) return null;
  const dir = articleDir(entry);
  if (!dir) return null;
  const recordPath = path.join(dir, "article.json");
  if (!fs.existsSync(recordPath)) return null;
  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  const media = (Array.isArray(record.media) ? record.media : []).filter((item) => {
    if (item?.type === "video") return true;
    return Number(item?.bytes || 0) >= MIN_IMAGE_BYTES;
  });
  const blocksPath = path.join(dir, "blocks.json");
  let blocks = null;
  if (fs.existsSync(blocksPath)) {
    const saved = JSON.parse(fs.readFileSync(blocksPath, "utf8"));
    blocks = Array.isArray(saved.blocks) ? saved.blocks : null;
  }
  return {
    ...record,
    dirName: entry.dir,
    mediaCount: media.length,
    media,
    blocks,
    displayText: stripSavedArticleChrome(record.text, record.title),
  };
}

function resolveSavedArticleMedia(id, file) {
  const entry = listSavedArticles().find((item) => item.id === String(id || ""));
  const dir = entry ? articleDir(entry) : null;
  if (!dir) return null;
  const relative = String(file || "").replace(/\\/g, "/");
  if (!relative || relative.split("/").some((part) => !part || part === "." || part === "..")) return null;
  const target = path.resolve(dir, relative);
  if (target !== dir && !target.startsWith(`${dir}${path.sep}`)) return null;
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
  return target;
}

function stripSavedArticleChrome(text, title) {
  const lines = String(text || "").split("\n");
  const kept = [];
  let started = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!started) {
      if (!line) continue;
      if (line === String(title || "").trim()) continue;
      if (isArticleChromeLine(line)) continue;
      started = true;
    }
    kept.push(raw);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isArticleChromeLine(line) {
  if (/^(야옹야옹|@mung99933|기사|대화|팔로우|·)$/.test(line)) return true;
  if (/^@\w+/.test(line)) return true;
  if (/^\d+(\.\d+)?만?$/.test(line)) return true;
  if (/^(\d+월|\d+시간|\d+일|\d+월 \d+일)$/.test(line)) return true;
  return false;
}

function linkify(escaped) {
  return escaped.replace(
    /https?:\/\/[^\s<]+/g,
    (url) => `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`,
  );
}

function renderBody(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((block) => `<p class="x-p">${linkify(escapeHtml(block)).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function renderSpans(spans) {
  const rendered = (Array.isArray(spans) ? spans : []).map((span) => {
    const text = String(span?.text || "");
    if (!text) return "";
    let html = escapeHtml(text);
    if (span.href) {
      html = `<a href="${escapeHtml(span.href)}" target="_blank" rel="noreferrer">${html}</a>`;
    }
    if (span.italic) html = `<em>${html}</em>`;
    if (span.bold) html = `<strong>${html}</strong>`;
    return html;
  }).join("");
  return rendered;
}

function renderArticleBlocks(blocks, articleId) {
  return (Array.isArray(blocks) ? blocks : []).map((block) => {
    if (block?.type === "image" || block?.type === "video") {
      if (!block.file) return "";
      const src = `/articles/media?id=${encodeURIComponent(articleId)}&file=${encodeURIComponent(block.file)}`;
      if (block.type === "video") {
        return `<figure class="x-media"><video controls preload="metadata" src="${src}"></video></figure>`;
      }
      return `<figure class="x-media"><img src="${src}" alt=""></figure>`;
    }
    const kind = block?.type === "h1" ? "x-h1" : block?.type === "h2" ? "x-h2" : "x-p";
    const tag = block?.type === "h1" ? "h2" : block?.type === "h2" ? "h3" : "p";
    const inner = renderSpans(block?.spans);
    return `<${tag} class="${kind}">${inner || "<br>"}</${tag}>`;
  }).join("\n");
}

function formatPublished(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function renderSavedArticlesPage(requestUrl = "/articles") {
  const parsed = new URL(requestUrl, "http://localhost");
  const articles = listSavedArticles();
  const selectedId = parsed.searchParams.get("id") || articles[0]?.id || "";
  const article = selectedId ? loadSavedArticle(selectedId) : null;
  const nav = articles.map((item) => {
    const active = item.id === selectedId;
    return `<a class="nav-item${active ? " active" : ""}" href="/articles?id=${encodeURIComponent(item.id)}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(formatPublished(item.publishedAt))} · 미디어 ${Number(item.mediaCount || 0)}</span>
    </a>`;
  }).join("");
  const body = article?.blocks?.length
    ? renderArticleBlocks(article.blocks, article.id)
    : renderBody(article?.displayText || "");
  const main = article
    ? `<article class="sheet">
        <h1 class="article-title">${escapeHtml(article.title)}</h1>
        <p class="byline">${escapeHtml(article.authorName || "")} <span>@${escapeHtml(article.author || "")}</span> · ${escapeHtml(formatPublished(article.publishedAt))} · <a href="${escapeHtml(article.articleUrl)}" target="_blank" rel="noreferrer">원문</a></p>
        <div class="body">${body}</div>
      </article>`
    : `<article class="sheet"><h1 class="article-title">저장된 아티클이 없습니다.</h1></article>`;
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(article?.title || "저장된 아티클")}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", sans-serif; background: #fff; color: #0f1419; }
    .layout { display: grid; grid-template-columns: 320px 1fr; min-height: 100vh; }
    nav { position: sticky; top: 0; height: 100vh; overflow: auto; padding: 20px 14px; background: #1c1917; color: #faf7f2; }
    nav h2 { margin: 0 12px 14px; font-size: 15px; }
    nav .back { display: inline-block; margin: 0 12px 16px; color: #d6d3d1; font-size: 13px; }
    .nav-item { display: block; margin: 0 0 6px; padding: 10px 12px; border-radius: 10px; color: inherit; text-decoration: none; }
    .nav-item strong { display: block; font-size: 14px; line-height: 1.35; }
    .nav-item span { display: block; margin-top: 4px; color: #a8a29e; font-size: 12px; }
    .nav-item.active, .nav-item:hover { background: #292524; }
    main { padding: 28px 24px 96px; background: #fff; }
    .sheet { max-width: 604px; margin: 0 auto; }
    .article-title { margin: 0 0 12px; font-size: 34px; line-height: 44px; font-weight: 800; letter-spacing: -0.02em; }
    .byline { margin: 0 0 28px; color: #536471; font-size: 15px; line-height: 20px; }
    .byline a { color: #536471; }
    .x-p { margin: 0 0 28px; font-size: 17px; line-height: 28px; font-weight: 400; }
    .x-h1 { margin: 0 0 28px; font-size: 31px; line-height: 40px; font-weight: 800; }
    .x-h2 { margin: 0 0 28px; font-size: 26px; line-height: 36px; font-weight: 800; }
    .x-p strong, .x-h1 strong, .x-h2 strong { font-weight: 800; }
    .x-media { margin: 0 0 28px; }
    .x-media img, .x-media video { width: 100%; height: auto; border-radius: 16px; display: block; background: #f7f9f9; }
    article a { color: #0f1419; text-decoration: underline; }
    @media (max-width: 860px) {
      .layout { grid-template-columns: 1fr; }
      nav { position: static; height: auto; }
      h1 { font-size: 26px; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <nav>
      <a class="back" href="/discovery">← 대시보드</a>
      <h2>야옹야옹 유튜브 아티클 ${articles.length}</h2>
      ${nav || "<p>없음</p>"}
    </nav>
    <main>${main}</main>
  </div>
</body>
</html>`;
}

module.exports = {
  ARTICLES_ROOT,
  listSavedArticles,
  articleDir,
  loadSavedArticle,
  resolveSavedArticleMedia,
  stripSavedArticleChrome,
  renderArticleBlocks,
  renderSavedArticlesPage,
};
