const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isTerafabxTodayRootPostMetadata,
  terafabxOwnPostHeartTargets,
} = require("../mirror_server");

test("own-post heart targets include all third-party direct replies only once", () => {
  const targets = terafabxOwnPostHeartTargets({
    directReplies: [
      { id: "1", url: "https://x.com/user1/status/1", authorHandle: "user1", authorVerified: false },
      { id: "2", url: "https://x.com/terafabXai/status/2", authorHandle: "terafabXai", authorVerified: true },
      { id: "1", url: "https://x.com/user1/status/1", authorHandle: "user1", authorVerified: false },
      { id: "3", url: "https://x.com/user2/status/3", authorHandle: "user2", authorVerified: true },
    ],
  });

  assert.deepEqual(targets.map((item) => item.id), ["1", "3"]);
});

test("own-post heart discovery accepts only today's @terafabXai root posts", () => {
  const metadata = {
    id: "1",
    authorHandle: "terafabXai",
    replyingToStatus: "",
    createdAt: "2026-07-13T03:00:00.000Z",
  };
  assert.equal(isTerafabxTodayRootPostMetadata(metadata, "2026-07-13"), true);
  assert.equal(isTerafabxTodayRootPostMetadata({ ...metadata, replyingToStatus: "99" }, "2026-07-13"), false);
  assert.equal(isTerafabxTodayRootPostMetadata({ ...metadata, authorHandle: "other" }, "2026-07-13"), false);
});
