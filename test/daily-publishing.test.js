const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { legacySchedule, slotsFor, slotAt, scheduleFor, mergeDailyDashboardRows, dailyStoryMedia } = require("../lib/daily-publishing");
const policy = { ...legacySchedule, effectiveOperatingDate: "2026-10-30", previousSchedule: legacySchedule,
  dailyCount: 20, fictionCount: 12, aagagCount: 8,
  hoursKst: [...Array.from({length:18}, (_,i) => `${String(i+6).padStart(2,"0")}:00`), "00:00+1", "01:00+1"],
  slotTypes: Array.from({length:20}, (_,i) => [3,5,7,10,12,14,17,19].includes(i+1) ? "curation" : "fiction") };
test("transition preserves today's slots and starts 12+8 only next operating day", () => {
  assert.equal(slotsFor("2026-10-29", policy).length,10);
  const slots=slotsFor("2026-10-30",policy);
  assert.equal(slots.length,20); assert.equal(slots.filter(x=>x.type==="curation").length,8);
  assert.equal(slots.filter(x=>x.type==="fiction").length,12);
  assert.equal(slotAt(Date.parse("2026-10-31T01:44:00+09:00"),policy).slotNumber,20);
  assert.equal(slotAt(Date.parse("2026-10-31T02:00:00+09:00"),policy),null);
  assert.equal(scheduleFor("2026-10-29",policy).dailyCount,10);
});
test("new fiction-only production retains both historical schedules and the existing AAGAG day", () => {
  const fictionOnly = { ...policy, effectiveOperatingDate: "2026-11-02", previousSchedule: policy,
    fictionCount: 20, aagagCount: 0, slotTypes: Array(20).fill("fiction") };
  assert.equal(slotsFor("2026-10-29", fictionOnly).length, 10);
  for (const day of ["2026-10-30", "2026-10-31", "2026-11-01"]) {
    assert.equal(slotsFor(day, fictionOnly).filter(slot => slot.type === "curation").length, 8);
  }
  assert.equal(slotAt(Date.parse("2026-11-01T17:00:00+09:00"), fictionOnly).type, "curation");
  const slots = slotsFor("2026-11-02", fictionOnly);
  assert.equal(slots.length, 20);
  assert.ok(slots.every(slot => slot.type === "fiction"));
  assert.equal(slots.at(-1).scheduledAt, "2026-11-02T16:00:00.000Z");
  assert.equal(slotAt(Date.parse("2026-11-03T01:30:00+09:00"), fictionOnly).slotNumber, 20);
  assert.equal(slotAt(Date.parse("2026-11-03T02:00:00+09:00"), fictionOnly), null);
});
test("daily posted archive supplies body, replies, provenance, and real receipt count; plan never invents a post", t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"daily-dashboard-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const base=path.join(root,".data/story-drafts/daily-ten"), dir=path.join(base,"2026-10-30/03");fs.mkdirSync(dir,{recursive:true});
  const key="daily-ten:2026-10-30:03";
  fs.writeFileSync(path.join(dir,"post.txt"),"첫 문장\n\n문단");fs.writeFileSync(path.join(dir,"reply_01.txt"),"반전");
  fs.writeFileSync(path.join(dir,"source.json"),JSON.stringify({type:"curation",operatingDate:"2026-10-30",source:{url:"https://aagag.com/issue/?idx=123"},review:{passed:true}}));
  fs.writeFileSync(path.join(base,"lineup.json"),JSON.stringify({items:[{key,scheduledAt:"2026-10-29T23:00:00Z"}]}));
  let rows=mergeDailyDashboardRows([],root,Date.parse("2026-10-29T00:00:00Z"));
  assert.equal(rows[0].status,"scheduled");assert.equal(rows[0].xPostUrl,null);assert.equal(rows[0].story.completedReplyCount,0);
  fs.writeFileSync(path.join(dir,"reply-receipt.json"),JSON.stringify({url:"https://x.com/terafabXai/status/2"}));
  rows=mergeDailyDashboardRows([{canonicalUrl:key,status:"posted",postedAt:"2026-10-29T23:01:00Z",xPostUrl:"https://x.com/terafabXai/status/1"}],root);
  assert.equal(rows.length,1);assert.equal(rows[0].story.body,"첫 문장\n\n문단");assert.deepEqual(rows[0].story.replies,["반전"]);
  assert.equal(rows[0].story.completedReplyCount,1);assert.equal(rows[0].status,"posted");assert.equal(rows[0].mediaPreviewUrl,"");
  assert.equal(rows[0].story.sourceUrl,"https://aagag.com/issue/?idx=123");
  assert.throws(()=>dailyStoryMedia(root,"daily-ten:../../etc:01"),/Invalid/);
});
test("stopped or missed lineup slots leave the scheduled view while posts stay posted", t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"daily-stopped-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const base=path.join(root,".data/story-drafts/daily-ten"), dir=path.join(base,"2026-10-30/03");fs.mkdirSync(dir,{recursive:true});
  const key="daily-ten:2026-10-30:03";
  fs.writeFileSync(path.join(dir,"post.txt"),"첫 문장");fs.writeFileSync(path.join(dir,"source.json"),JSON.stringify({type:"fiction",review:{passed:true}}));
  fs.writeFileSync(path.join(base,"lineup.json"),JSON.stringify({items:[{key,scheduledAt:"2026-10-29T23:00:00Z"}]}));
  const early=Date.parse("2026-10-29T00:00:00Z");
  assert.equal(mergeDailyDashboardRows([],root,early,{dispatchActive:false})[0].status,"review");
  assert.equal(mergeDailyDashboardRows([],root,Date.parse("2026-10-31T00:00:00Z"))[0].status,"review");
  assert.equal(mergeDailyDashboardRows([{canonicalUrl:key,status:"posted",xPostUrl:"https://x.com/terafabXai/status/1"}],root,early,{dispatchActive:false})[0].status,"posted");
});
test("one-off publication stays linked to its archived text and own reply", t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"oneoff-dashboard-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const dir=path.join(root,".data/story-drafts/oneoff");fs.mkdirSync(dir,{recursive:true});
  const key="creative:oneoff";
  fs.writeFileSync(path.join(root,"mirror-history.json"),JSON.stringify([{canonicalUrl:key,storyDir:".data/story-drafts/oneoff"}]));
  fs.writeFileSync(path.join(dir,"source.json"),JSON.stringify({type:"fiction"}));
  fs.writeFileSync(path.join(dir,"post.txt"),"실제 게시된 첫글");fs.writeFileSync(path.join(dir,"reply_01.txt"),"실제 결말");
  fs.writeFileSync(path.join(dir,"reply-receipt.json"),JSON.stringify({url:"https://x.com/terafabXai/status/2"}));
  const [row]=mergeDailyDashboardRows([{canonicalUrl:key,status:"posted",xPostUrl:"https://x.com/terafabXai/status/1"}],root);
  assert.equal(row.textPreview,"실제 게시된 첫글");assert.equal(row.story.status,"posted");assert.deepEqual(row.story.replyUrls,["https://x.com/terafabXai/status/2"]);
});
test("image endpoint never follows a media path or symlink outside the story", t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"daily-media-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const dir=path.join(root,".data/story-drafts/daily-ten/2026-10-30/03");fs.mkdirSync(dir,{recursive:true});
  const outside=path.join(root,"private.txt");fs.writeFileSync(outside,"private");
  const source=path.join(dir,"source.json"),key="daily-ten:2026-10-30:03";
  fs.writeFileSync(source,JSON.stringify({rootMedia:{file:outside}}));assert.throws(()=>dailyStoryMedia(root,key),/Invalid/);
  fs.symlinkSync(outside,path.join(dir,"root.webp"));fs.writeFileSync(source,JSON.stringify({rootMedia:{file:"root.webp"}}));assert.throws(()=>dailyStoryMedia(root,key),/Invalid/);
  fs.unlinkSync(path.join(dir,"root.webp"));fs.writeFileSync(path.join(dir,"root.webp"),"image");assert.equal(dailyStoryMedia(root,key),fs.realpathSync(path.join(dir,"root.webp")));
});
