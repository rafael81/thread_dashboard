"use strict";

const THREADS_HOSTS = new Set([
  "threads.com",
  "www.threads.com",
  "threads.net",
  "www.threads.net",
]);

function parsedThreadsUrl(value) {
  const parsed = new URL(String(value || "").trim());
  if (parsed.protocol !== "https:") {
    throw new Error("Threads 공유 URL은 HTTPS만 허용됩니다.");
  }
  if (!THREADS_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("threads.com 또는 threads.net URL만 허용됩니다.");
  }
  return parsed;
}

function normalizeCanonicalThreadsUrl(value) {
  const parsed = parsedThreadsUrl(value);
  const match = parsed.pathname.match(/^\/@([^/]+)\/post\/([^/]+)/);
  if (!match) throw new Error("Threads 원글 URL 형식이 아닙니다.");
  return `https://www.threads.com/@${match[1]}/post/${match[2]}`;
}

function normalizeThreadsSharedInput(value) {
  const parsed = parsedThreadsUrl(value);
  const canonicalMatch = parsed.pathname.match(/^\/@([^/]+)\/post\/([^/]+)/);
  if (canonicalMatch) {
    return `https://www.threads.com/@${canonicalMatch[1]}/post/${canonicalMatch[2]}`;
  }
  const redirectMatch = parsed.pathname.match(/^\/(t|share)\/([A-Za-z0-9_-]{1,200})\/?$/);
  if (!redirectMatch) {
    throw new Error("Threads 원글 또는 공유 URL 형식이 아닙니다.");
  }
  return redirectMatch[1] === "share"
    ? `https://www.threads.com/share/${redirectMatch[2]}/`
    : `https://www.threads.com/t/${redirectMatch[2]}`;
}

async function resolveThreadsSharedUrl(value, options = {}) {
  const normalizedInput = normalizeThreadsSharedInput(value);
  try {
    return normalizeCanonicalThreadsUrl(normalizedInput);
  } catch {
    // Redirect-style share URL; resolve it below.
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("Threads 공유 URL 해석에 사용할 fetch가 없습니다.");
  const maxRedirects = Math.max(1, Math.min(8, Number(options.maxRedirects || 4)));
  const timeoutMs = Math.max(1_000, Number(options.timeoutMs || 12_000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let currentUrl = normalizedInput;

  try {
    for (let attempt = 1; attempt <= maxRedirects; attempt += 1) {
      const response = await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "curl/8.7.1",
        },
      });
      const location = response.headers?.get?.("location") || "";
      if (response.body?.cancel) {
        Promise.resolve(response.body.cancel()).catch(() => {});
      }
      if (response.status < 300 || response.status >= 400 || !location) {
        throw new Error(`Threads 공유 URL이 원문으로 이동하지 않았습니다. HTTP ${response.status}`);
      }
      const nextUrl = new URL(location, currentUrl).toString();
      parsedThreadsUrl(nextUrl);
      try {
        return normalizeCanonicalThreadsUrl(nextUrl);
      } catch {
        currentUrl = normalizeThreadsSharedInput(nextUrl);
      }
    }
    throw new Error(`Threads 공유 URL 리다이렉트가 ${maxRedirects}회를 초과했습니다.`);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Threads 공유 URL 해석 시간이 초과되었습니다.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  normalizeCanonicalThreadsUrl,
  normalizeThreadsSharedInput,
  resolveThreadsSharedUrl,
};
