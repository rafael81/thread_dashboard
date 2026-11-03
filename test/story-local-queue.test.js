const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStoryQueue } = require("../lib/story-local-queue");
const { receiptFromResponse } = require("../lib/story-x-publisher");

function fixture(t, publish) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "story-queue-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, ".data/story-drafts/one"); fs.mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries({ "post.txt": "고유한 사연 제목", "body.txt": "도입 이야기", "reply_01.txt": "사연의 결말", "image.png": "image-fixture", "source.json": JSON.stringify({ type: "fiction" }) })) fs.writeFileSync(path.join(dir, name), text);
  let clock = Date.parse("2026-09-27T06:00:00+09:00");
  const history = [], calls = [];
  const args = { root, now: () => clock, verifyAccount: async () => {}, recordHistory: item => history.push(item),
    publish: async options => { calls.push(options.targetUrl); return publish(options, calls.length); } };
  const queue = createStoryQueue(args);
  const input = { id: "2026-09-27-01", storyDir: ".data/story-drafts/one", operatingDate: "2026-09-27", scheduledAt: "2026-09-27T06:05:00+09:00" };
  return { root, queue, args, input, history, calls, advance: ms => { clock += ms; } };
}

test("known root is checkpointed and only failed reply resumes", async t => {
  const f = fixture(t, async (o, n) => {
    if (n === 2) throw new Error("reply composer unavailable before submission");
    o.beforeSubmit(); o.onReceipt({ url: o.targetUrl ? "https://x.com/terafabXai/status/2" : "https://x.com/terafabXai/status/1" });
  });
  await f.queue.enqueue([f.input]); f.advance(300000);
  await f.queue.tick();
  assert.equal(f.queue.read().items[0].status, "continuing");
  assert.equal(f.history.at(-1).postUrl, "https://x.com/terafabXai/status/1");
  f.advance(60000); await f.queue.tick();
  assert.equal(f.queue.read().items[0].status, "posted");
  assert.deepEqual(f.calls, [null, "https://x.com/terafabXai/status/1", "https://x.com/terafabXai/status/1"]);
});

test("ambiguous submission is never blindly retried, including after restart", async t => {
  const f = fixture(t, async o => { o.beforeSubmit(); throw new Error("connection lost after click"); });
  await f.queue.enqueue([f.input]); f.advance(300000); await f.queue.tick();
  assert.equal(f.queue.read().items[0].status, "needs_review");
  const restarted = createStoryQueue(f.args); restarted.recover(); f.advance(3600000);
  await restarted.tick(); assert.equal(f.calls.length, 1);
});

test("root and all replies use one publishing session with checkpoints between sends", async t => {
  const f = fixture(t, async () => { throw new Error("Standalone publish must not be used"); });
  fs.writeFileSync(path.join(f.root, f.input.storyDir, "reply_02.txt"), "두 번째 결말");
  let sessions = 0, closed = 0;
  const targets = [];
  const queue = createStoryQueue({ ...f.args, withPublishSession: async run => {
    sessions++;
    try {
      await run(async o => {
        const row = queue.read().items[0];
        assert.equal(row.replyReceipts.length, Math.max(0, targets.length - 1));
        if (targets.length) assert.equal(row.postUrl, "https://x.com/terafabXai/status/1");
        targets.push(o.targetUrl);
        o.beforeSubmit();
        o.onReceipt({ url: `https://x.com/terafabXai/status/${targets.length}` });
      });
    } finally { closed++; }
  } });
  await queue.enqueue([f.input]); f.advance(300000);
  assert.equal((await queue.tick()).posted, f.input.id);
  assert.equal(sessions, 1); assert.equal(closed, 1);
  assert.deepEqual(targets, [null, "https://x.com/terafabXai/status/1", "https://x.com/terafabXai/status/2"]);
});

test("session closes on uncertain reply and preserves root without automatic resend", async t => {
  const f = fixture(t, async () => { throw new Error("Standalone publish must not be used"); });
  let closed = 0, calls = 0;
  const queue = createStoryQueue({ ...f.args, withPublishSession: async run => {
    try {
      await run(async o => {
        calls++; o.beforeSubmit();
        if (o.targetUrl) throw new Error("Reply response lost");
        o.onReceipt({ url: "https://x.com/terafabXai/status/1" });
      });
    } finally { closed++; }
  } });
  await queue.enqueue([f.input]); f.advance(300000);
  assert.equal((await queue.tick()).status, "needs_review");
  assert.equal(queue.read().items[0].postUrl, "https://x.com/terafabXai/status/1");
  assert.equal(closed, 1);
  f.advance(600000); await queue.tick(); assert.equal(calls, 2);
});

test("future entries are not posted; duplicate import is idempotent; late entries do not burst", async t => {
  const f = fixture(t, async () => { throw new Error("must not publish"); });
  await f.queue.enqueue([f.input]); assert.equal((await f.queue.enqueue([f.input])).existing.length, 1);
  await f.queue.tick(); assert.equal(f.calls.length, 0);
  f.advance(36 * 60000); await f.queue.tick();
  assert.equal(f.queue.read().items[0].status, "missed"); assert.equal(f.calls.length, 0);
});

test("concurrent dispatch only sends once and corrupt queue does not reset", async t => {
  const f = fixture(t, async o => {
    o.beforeSubmit(); await new Promise(resolve => setTimeout(resolve, 10));
    o.onReceipt({ url: o.targetUrl ? "https://x.com/terafabXai/status/2" : "https://x.com/terafabXai/status/1" });
  });
  await f.queue.enqueue([f.input]); f.advance(300000);
  await Promise.all([f.queue.tick(), f.queue.tick()]); assert.equal(f.calls.length, 2);
  fs.writeFileSync(path.join(f.root, ".data/story-drafts/local-queue.json"), "broken");
  assert.throws(() => f.queue.read());
});

test("receipt requires exact text, author, media count, and reply parent", () => {
  const tweet = { rest_id: "123", legacy: { full_text: "본문\n결말", in_reply_to_status_id_str: "100" }, core: { user_results: { result: { rest_id: "1371642956088627200" } } } };
  const expected = { text: "본문 결말", parentId: "100", mediaCount: 0 };
  assert.equal(receiptFromResponse({ data: { tweet } }, expected).id, "123");
  assert.equal(receiptFromResponse({ data: { tweet } }, { ...expected, parentId: "101" }), null);
  assert.equal(receiptFromResponse({ data: { tweet } }, { ...expected, text: "다른 내용" }), null);
  assert.equal(receiptFromResponse({ data: { tweet } }, { ...expected, mediaCount: 1 }), null);
  tweet.core.user_results.result.rest_id = "another";
  assert.equal(receiptFromResponse({ data: { tweet } }, expected), null);
});

test("media URL suffix is excluded from authored text in X receipt", () => {
  const tweet = { rest_id: "123", legacy: { full_text: "제목 https://t.co/abc", entities: { media: [{ url: "https://t.co/abc" }] }, extended_entities: { media: [{}] } }, core: { user_results: { result: { rest_id: "1371642956088627200" } } } };
  assert.equal(receiptFromResponse({ data: { tweet } }, { text: "제목", parentId: null, mediaCount: 1 }).id, "123");
});

test("same content under another ID and out-of-window slots are rejected atomically", async t => {
  const f = fixture(t, async () => {});
  await f.queue.enqueue([f.input]);
  await assert.rejects(f.queue.enqueue([{ ...f.input, id: "another-id", scheduledAt: "2026-09-27T06:30:00+09:00" }]), /Duplicate story/);
  await assert.rejects(f.queue.enqueue([{ ...f.input, id: "another-id", scheduledAt: "2026-09-28T02:00:00+09:00" }]), /Outside/);
  assert.equal(f.queue.read().items.length, 1);
});


test("daily cap blocks a 16th legacy root but permits the 15th root's reply", async t => {
  const f = fixture(t, async o => { o.beforeSubmit(); o.onReceipt({url: "https://x.com/terafabXai/status/101"}); });
  await f.queue.enqueue([f.input]); f.advance(300000);
  const file = path.join(f.root, ".data/story-drafts/local-queue.json");
  const state = f.queue.read();
  for (let i=0;i<15;i++) state.items.push({id: "done-"+i, operatingDate:f.input.operatingDate, status:"posted", postUrl:"https://x.com/terafabXai/status/"+(i+10)});
  fs.writeFileSync(file, JSON.stringify(state));
  assert.equal((await f.queue.tick()).skipped, "daily_limit");
  assert.equal(f.calls.length, 0);
  state.items.pop();
  Object.assign(state.items[0], {postUrl:"https://x.com/terafabXai/status/100",status:"continuing"});
  fs.writeFileSync(file, JSON.stringify(state));
  assert.equal((await f.queue.tick()).posted, f.input.id);
  assert.deepEqual(f.calls,["https://x.com/terafabXai/status/100"]);
});

test("fifteen originals are allowed when no curation is available; 16th import is rejected", async t => {
  const f=fixture(t,async()=>{});
  const file=path.join(f.root,".data/story-drafts/local-queue.json");
  const items=Array.from({length:14},(_,i)=>({id:"old-"+i,operatingDate:f.input.operatingDate,type:"fiction",status:"scheduled",text:"different-"+i,scheduledAt:new Date(Date.parse(f.input.scheduledAt)+(i+1)*60000).toISOString()}));
  fs.writeFileSync(file,JSON.stringify({version:1,items}));
  assert.equal((await f.queue.enqueue([f.input])).added.length,1);
  fs.writeFileSync(path.join(f.root,f.input.storyDir,"post.txt"),"별개의 사연");
  await assert.rejects(f.queue.enqueue([{...f.input,id:"sixteenth",scheduledAt:"2026-09-27T10:00:00+09:00"}]),/Daily 15/);
  assert.equal(f.queue.read().items.length,15);
});

function carousel(f, count = 3) {
  const dir = path.join(f.root, f.input.storyDir);
  const names = Array.from({length: count + 1}, (_, i) => `card-${i + 1}.png`);
  for (const name of names) fs.writeFileSync(path.join(dir, name), name + '-image-fixture');
  fs.writeFileSync(path.join(dir, 'thread.json'), JSON.stringify({version:1,format:'image_carousel',root:{text:'',media:names.slice(0,1)},replies:[{text:'',media:names.slice(1)}]}));
  return {dir,names};
}

test('carousel retains the X title with one root image and image-only replies, including resume', async t => {
  const sends = [];
  const f = fixture(t, async (o, n) => {
    sends.push({text:o.text,media:o.media.map(p=>path.basename(p)),target:o.targetUrl});
    if(n===2)throw new Error('upload unavailable before submit');
    o.beforeSubmit();o.onReceipt({url:`https://x.com/terafabXai/status/${n}`});
  });
  carousel(f);await f.queue.enqueue([f.input]);f.advance(300000);await f.queue.tick();
  assert.equal(f.queue.read().items[0].status,'continuing');
  f.advance(60000);await f.queue.tick();
  assert.equal(f.queue.read().items[0].status,'posted');
  assert.deepEqual(sends,[{text:'고유한 사연 제목',media:['card-1.png'],target:null},{text:'',media:['card-2.png','card-3.png','card-4.png'],target:'https://x.com/terafabXai/status/1'},{text:'',media:['card-2.png','card-3.png','card-4.png'],target:'https://x.com/terafabXai/status/1'}]);
  assert.equal(f.queue.read().items[0].replyTranscripts[0],'사연의 결말');
});

test('reply card modification blocks publishing before even the root is sent', async t => {
  const f=fixture(t,async()=>{throw new Error('Must not publish');});const c=carousel(f);
  await f.queue.enqueue([f.input]);fs.writeFileSync(path.join(c.dir,'card-3.png'),'changed');f.advance(300000);
  const result=await f.queue.tick();assert.equal(result.failed,f.input.id);assert.equal(f.calls.length,0);
  assert.match(f.queue.read().items[0].lastError,/Scheduled media changed/);
});

test('carousel rejects over-four attachments and path escape; distinct image-only stories are not false duplicates', async t=>{
  const f=fixture(t,async()=>{});carousel(f,5);
  await assert.rejects(f.queue.enqueue([f.input]),/1–4 images/);
  const c=carousel(f);const manifest=JSON.parse(fs.readFileSync(path.join(c.dir,'thread.json')));manifest.replies[0].media=['../image.png'];fs.writeFileSync(path.join(c.dir,'thread.json'),JSON.stringify(manifest));
  await assert.rejects(f.queue.enqueue([f.input]),/Invalid story media filename/);
  carousel(f);await f.queue.enqueue([f.input]);
  const other=path.join(f.root,'.data/story-drafts/two');fs.cpSync(c.dir,other,{recursive:true});fs.writeFileSync(path.join(other,'post.txt'),'다른 반전 사연');
  assert.equal((await f.queue.enqueue([{...f.input,id:'second',storyDir:'.data/story-drafts/two',scheduledAt:'2026-09-27T06:40:00+09:00'}])).added.length,1);
});

test('image-only reply receipt strips media link but requires exact parent and attachment count',()=>{
  const tweet={rest_id:'123',legacy:{full_text:'https://t.co/media',in_reply_to_status_id_str:'100',entities:{media:[{url:'https://t.co/media'}]},extended_entities:{media:[{},{}]}},core:{user_results:{result:{rest_id:'1371642956088627200'}}}};
  assert.equal(receiptFromResponse({data:{tweet}},{text:'',parentId:'100',mediaCount:2}).id,'123');
  assert.equal(receiptFromResponse({data:{tweet}},{text:'',parentId:'999',mediaCount:2}),null);
  assert.equal(receiptFromResponse({data:{tweet}},{text:'',parentId:'100',mediaCount:1}),null);
});

test('image carousel rejects a multi-image root even within X media limits',async t=>{
 const f=fixture(t,async()=>{}),c=carousel(f);const p=path.join(c.dir,'thread.json'),m=JSON.parse(fs.readFileSync(p));m.root.media=['card-1.png','card-2.png'];fs.writeFileSync(p,JSON.stringify(m));
 await assert.rejects(f.queue.enqueue([f.input]),/exactly one image/);
});

test('preview-required stories cannot dispatch before user approval, including stale scheduled status',async t=>{
 const f=fixture(t,async()=>{throw Error('Unapproved story must never post')});carousel(f);
 fs.writeFileSync(path.join(f.root,'.data/story-drafts/operations-policy.json'),JSON.stringify({previewApprovalRequiredForNewOrChangedStories:true}));
 const result=await f.queue.enqueue([f.input]);assert.equal(result.added[0].status,'awaiting_approval');assert.equal(f.history.at(-1).status,'awaiting_approval');
 f.advance(300000);assert.equal((await f.queue.tick()).processed,false);assert.equal(f.calls.length,0);
 const q=f.queue.read();q.items[0].status='scheduled';fs.writeFileSync(path.join(f.root,'.data/story-drafts/local-queue.json'),JSON.stringify(q));
 assert.equal((await f.queue.tick()).processed,false);assert.equal(f.calls.length,0);
});

test('separate stories wait a full minute after the previous story, even after restart', async t => {
  const f=fixture(t,async o=>{o.beforeSubmit();o.onReceipt({url:o.targetUrl?'https://x.com/terafabXai/status/202':'https://x.com/terafabXai/status/201'});});
  carousel(f);await f.queue.enqueue([f.input]);f.advance(300000);
  const q=f.queue.read();q.items.push({id:'previous',postUrl:'https://x.com/terafabXai/status/100',status:'posted',completedAt:'2026-09-27T06:05:00+09:00'});
  fs.writeFileSync(path.join(f.root,'.data/story-drafts/local-queue.json'),JSON.stringify(q));
  assert.equal((await f.queue.tick()).skipped,'story_post_interval');assert.equal(f.calls.length,0);
  f.advance(59999);const restarted=createStoryQueue(f.args);assert.equal((await restarted.tick()).skipped,'story_post_interval');
  f.advance(1);assert.equal((await restarted.tick()).posted,f.input.id);assert.equal(f.calls.length,2);
});

function enableImageReview(f) {
  fs.writeFileSync(path.join(f.root, ".data/story-drafts/operations-policy.json"), JSON.stringify({ requireStoryImageReview: true }));
}
function inspectFixtureImage(f) {
  const dir = path.join(f.root, f.input.storyDir);
  const rootImageSha256 = require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(dir, "image.png"))).digest("hex");
  fs.writeFileSync(path.join(dir, "image-review.json"), JSON.stringify({ version: 1, status: "passed", method: "visual_inspection",
    reviewer: "test fixture", reviewedAt: new Date().toISOString(), rootImageSha256,
    checks: { limb_count: true, limb_connections: true, hands_and_grips: true } }));
}
test("image review is required before queue registration", async t => {
  const f = fixture(t, async () => {}); enableImageReview(f);
  await assert.rejects(f.queue.enqueue([f.input]), /visual review required/);
  assert.equal(f.queue.read().items.length, 0);
  inspectFixtureImage(f); await f.queue.enqueue([f.input]);
  assert.equal(f.queue.read().items.length, 1);
});
test("changing an image and its queue hash does not reuse the old visual inspection", async t => {
  const f = fixture(t, async () => { throw new Error("must not publish"); });
  enableImageReview(f); inspectFixtureImage(f); await f.queue.enqueue([f.input]);
  const state = f.queue.read(), file = state.items[0].media[0].path;
  fs.writeFileSync(file, "replacement without visual review");
  state.items[0].media[0].sha256 = require("node:crypto").createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  fs.writeFileSync(path.join(f.root, ".data/story-drafts/local-queue.json"), JSON.stringify(state));
  f.advance(300000);
  assert.equal((await f.queue.tick()).reason, "image_visual_review");
  assert.equal(f.calls.length, 0); assert.equal(f.queue.read().items[0].status, "needs_review");
});
test("valid inspected image publishes and lost inspection does not prevent an existing root's reply", async t => {
  const f = fixture(t, async (o, n) => {
    if (n === 2) throw new Error("reply composer not ready");
    o.beforeSubmit(); o.onReceipt({ url: o.targetUrl ? "https://x.com/terafabXai/status/2" : "https://x.com/terafabXai/status/1" });
  });
  enableImageReview(f); inspectFixtureImage(f); await f.queue.enqueue([f.input]);
  f.advance(300000); await f.queue.tick();
  fs.unlinkSync(path.join(f.root, f.input.storyDir, "image-review.json"));
  f.advance(60000); assert.equal((await f.queue.tick()).posted, f.input.id);
  assert.deepEqual(f.calls, [null, "https://x.com/terafabXai/status/1", "https://x.com/terafabXai/status/1"]);
});

test("curation quota defaults to one and allows three only with configured policy", async t => {
  const f = fixture(t, async () => { throw new Error("must not publish"); });
  const base = path.join(f.root, ".data/story-drafts");
  const inputs = Array.from({ length: 4 }, (_, i) => {
    const dir = path.join(base, `issue-${i}`); fs.mkdirSync(dir);
    for (const [name, value] of Object.entries({
      "post.txt": `Recent issue ${i}`, "body.txt": `Opening ${i}`,
      "reply_01.txt": `Verified ending ${i}`, "image.png": "image-fixture",
      "source.json": JSON.stringify({ type: "curation", source: { url: `https://example.com/issue/${i}` } }),
    })) fs.writeFileSync(path.join(dir, name), value);
    return { ...f.input, id: `issue-${i}`, storyDir: path.relative(f.root, dir), scheduledAt: `2026-09-27T0${7 + i}:00:00+09:00`.replace("T010:", "T10:") };
  });
  await f.queue.enqueue([inputs[0]]);
  await assert.rejects(f.queue.enqueue([inputs[1]]), /maximum 1 curation/);
  fs.writeFileSync(path.join(base, "operations-policy.json"), JSON.stringify({ curationCount: 3 }));
  assert.equal((await f.queue.enqueue([inputs[1], inputs[2]])).added.length, 2);
  await assert.rejects(f.queue.enqueue([inputs[3]]), /maximum 3 curation/);
  assert.equal(f.queue.read().items.length, 3);
  assert.equal(f.calls.length, 0);
});
