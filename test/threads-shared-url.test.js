const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeCanonicalThreadsUrl,
  normalizeThreadsSharedInput,
  resolveThreadsSharedUrl,
} = require("../lib/threads-shared-url");

function redirectResponse(location, status = 302) {
  return {
    status,
    headers: new Headers({ location }),
    body: { cancel: async () => {} },
  };
}

test("canonical Threads URL is normalized without a network request", async () => {
  let fetchCount = 0;
  const result = await resolveThreadsSharedUrl(
    "https://threads.com/@user.name/post/DbExample?xmt=ignored",
    { fetchImpl: async () => { fetchCount += 1; } },
  );

  assert.equal(result, "https://www.threads.com/@user.name/post/DbExample");
  assert.equal(fetchCount, 0);
});

test("current /share/token/ URL resolves to the canonical post", async () => {
  const requests = [];
  const result = await resolveThreadsSharedUrl(
    "https://www.threads.com/share/BAOz5GWDCK/?xmt=ignored",
    {
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return redirectResponse("https://www.threads.com/@han_sm____/post/DbWlSS0EweX?xmt=abc");
      },
    },
  );

  assert.equal(result, "https://www.threads.com/@han_sm____/post/DbWlSS0EweX");
  assert.equal(requests[0].url, "https://www.threads.com/share/BAOz5GWDCK/");
  assert.equal(requests[0].options.redirect, "manual");
});

test("legacy /t/id URL is still resolved by the server", async () => {
  const result = await resolveThreadsSharedUrl(
    "https://www.threads.com/t/DbExample",
    {
      fetchImpl: async () => redirectResponse(
        "https://www.threads.com/@legacy/post/DbExample",
      ),
    },
  );

  assert.equal(result, "https://www.threads.com/@legacy/post/DbExample");
});

test("redirects outside Threads are rejected before following them", async () => {
  await assert.rejects(
    () => resolveThreadsSharedUrl(
      "https://www.threads.com/share/BadRedirect/",
      { fetchImpl: async () => redirectResponse("https://example.com/steal") },
    ),
    /threads\.com 또는 threads\.net URL만 허용/,
  );
});

test("non-post Threads paths and insecure URLs are rejected", () => {
  assert.throws(
    () => normalizeThreadsSharedInput("https://www.threads.com/home"),
    /원글 또는 공유 URL 형식/,
  );
  assert.throws(
    () => normalizeCanonicalThreadsUrl("http://www.threads.com/@user/post/id"),
    /HTTPS만 허용/,
  );
});
