const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const m = require('../lib/comment-media-context');
const target = () => ({ url: 'https://x.com/a/status/123', targetText: '고양이가 상자를 열었다' });
function fixture(kind = 'image') {
  const t = target();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-media-test-'));
  const file = path.join(dir, 'media-1.jpg'); fs.writeFileSync(file, 'original');
  t.mediaReview = { version: m.VERSION, verified: true, sourceBinding: m.sourceBinding(t), dir, sources: [{url: t.url, text: t.targetText}], files: [{ index: 0, path: file, sha256: m.hash('original'), kind }], manifestHash: 'manifest' };
  return t;
}
const check = { index: 0, verified: true, observations: ['고양이가 앞발로 상자 뚜껑을 연다'] };
const observation = checks => ({context_summary: '고양이가 실제로 앞발로 상자 뚜껑을 열고 안을 들여다보는 장면이다.', key_points: ['상자 열기'], media_checks: checks});
test('publication cannot bypass automatic speech policy with all-true model verdicts', () => {
  const t = fixture();
  t.commentSpeechVersion = require('../lib/comment-speech').COMMENT_SPEECH_VERSION;
  const verdict = Object.fromEntries(['source_grounded', 'media_verified', 'conversation_role_ok', 'direct_response_ok', 'context_complete', 'source_eligible', 'naturalness_ok', 'non_tautological'].map(k => [k, true]));
  try { assert.throws(() => m.validateJudge(verdict, t, '상자를 열었네요ㅋㅋ'), /speech_commentary_ending/); }
  finally { fs.rmSync(t.mediaReview.dir, { recursive: true, force: true }); }
});
test('speech guidance preserves the publication judge schema discriminator and verdict fields', () => {
  const t = fixture();
  try {
    t.recentReplyTexts = ['그것도 제한?'];
    // The CLI runner selects its structured-output schema from this leading role.
    const prompt = m.judgePrompt(t, '손은 공손하게');
    const schema = m.reviewSchema(prompt.startsWith('Codex의 읽기 전용 X 댓글 게시 직전'));
    for (const field of ['source_grounded', 'media_verified', 'conversation_role_ok', 'direct_response_ok', 'context_complete', 'source_eligible', 'naturalness_ok', 'non_tautological']) {
      assert.ok(schema.required.includes(field), field);
    }
    assert.ok(!schema.required.includes('context_summary'));
    assert.ok(prompt.includes('댓글 말투 기준'));
    assert.ok(prompt.includes('최근 댓글(JSON)'));
  } finally { fs.rmSync(t.mediaReview.dir, { recursive: true, force: true }); }
});
test('Gemini writing input retains verified timeline and uncertainty without local media inspection metadata', () => {
  const t = fixture('video');
  try {
    t.mediaReview.observations = ['고양이가 상자를 연다'];
    t.mediaReview.checks = [{ ...check, timeline: ['처음 닫힘', '앞발로 열기', '안을 보기'], audio_status: 'no_speech', audio_note: '음악만 확인' }];
    t.mediaReview.uncertainties = ['안쪽 물건은 보이지 않음'];
    const prompt = m.generationContextLines(t).join('\n');
    for (const fact of ['고양이가 상자를 열었다', '고양이가 상자를 연다', '처음 닫힘', '음악만 확인', '안쪽 물건은 보이지 않음']) assert.ok(prompt.includes(fact));
    assert.equal(prompt.includes(t.mediaReview.files[0].path), false);
    t.targetText = '원문이 바뀜';
    assert.throws(() => m.generationContextLines(t), /변경됨/);
    t.mediaReview.verified = false;
    assert.throws(() => m.generationContextLines(t), /검증되지/);
  } finally { fs.rmSync(t.mediaReview.dir, { recursive: true, force: true }); }
});
test('independent full text repairs a false non-note truncation and invalidates the stale draft source', async () => {
  const short = '예시 10개\n1. study\n6. I had studied E:';
  const full = short + ' 공부했었다\n7. 진행\n10. 완료';
  const status = {id:'123',url:'https://x.com/a/status/123',author:{screen_name:'a'},text:short,is_note_tweet:false,media:{all:[]}};
  const merged=m.reconcileSourceText(status,{tweetID:'123',user_screen_name:'A',text:full});
  assert.equal(merged.text,full);
  assert.equal(merged.comment_text_verification.extended,true);
  assert.equal(merged.media,status.media);
  await assert.rejects(()=>m.collectSources({url:status.url,targetText:short},{fetchStatus:async()=>merged}), /본문이 변경/);
  assert.equal((await m.collectSources({url:status.url,targetText:full},{fetchStatus:async()=>merged}))[0].text,full);
});
test('independent text cannot replace another status, another author, or contradictory prose', () => {
  const s={id:'123',url:'https://x.com/a/status/123',author:{screen_name:'a'},text:'원문 전체 문장'};
  const alt={tweetID:'123',user_screen_name:'a',text:s.text};
  assert.throws(()=>m.reconcileSourceText(s,{...alt,tweetID:'456'}),/ID\/작성자/);
  assert.throws(()=>m.reconcileSourceText(s,{...alt,user_screen_name:'b'}),/ID\/작성자/);
  assert.throws(()=>m.reconcileSourceText(s,{...alt,text:'서로 다른 본문'}),/본문 불일치/);
  assert.throws(()=>m.reconcileSourceText(s,{...alt,text:''}),/유무 불일치/);
  assert.equal(m.reconcileSourceText(s,{...alt,text:'원문 전체'}).text,s.text);
});
test('media-only permalinks and non-Korean text remain intact during full-text comparison', () => {
  const media={id:'123',url:'https://x.com/a/status/123',author:{screen_name:'a'},text:'',media:{all:[{type:'photo',url:'https://pbs.twimg.com/a.jpg'}]}};
  assert.equal(m.reconcileSourceText(media,{tweetID:'123',user_screen_name:'a',text:'https://t.co/media'}).text,'');
  const s={...media,text:'ありがとう🙂'};
  assert.equal(m.reconcileSourceText(s,{tweetID:'123',user_screen_name:'a',text:'ありがとう🙂 https://t.co/media'}).text,s.text);
});
test('source timestamps preserve the Korean midnight boundary used for relative dates', () => {
  assert.equal(m.seoulTime('2026-10-27T14:59:59Z'), '2026-10-27 23:59:59 KST');
  assert.equal(m.seoulTime('2026-10-27T15:00:00Z'), '2026-10-28 00:00:00 KST');
  assert.equal(m.seoulTime('Tue Oct 27 12:55:53 +0000 2026'), '2026-10-27 21:55:53 KST');
  assert.equal(m.seoulTime('Tue Oct 27 22:44:13 +0000 2026'), '2026-10-28 07:44:13 KST');
  assert.equal(m.seoulTime(null), '미상');
  assert.equal(m.seoulTime('unknown'), '미상');
});
test('missing/duplicate visual checks fail even if a model reports success', () => {
  const t=fixture();
  try {
    assert.throws(()=>m.validateObservation(observation([]), t.mediaReview), /누락/);
    assert.throws(()=>m.validateObservation(observation([{...check,index: 2}]), t.mediaReview), /실패/);
    assert.throws(()=>m.validateObservation(observation([{...check,verified: false}]), t.mediaReview), /실패/);
    assert.equal(m.validateObservation(observation([check]), t.mediaReview).verified,true);
  } finally {fs.rmSync(t.mediaReview.dir,{recursive:true,force:true});}
});
test('video requires temporal coverage and an audio result; poster-only evidence cannot pass', () => {
  const t=fixture('video');
  try {
    assert.throws(()=>m.validateObservation(observation([check]), t.mediaReview), /영상/);
    assert.throws(()=>m.validateObservation(observation([{...check,timeline:['시작','중간','끝'],audio_status:'unavailable'}]), t.mediaReview), /영상/);
    assert.equal(m.validateObservation(observation([{...check,timeline:['시작','중간','끝'],audio_status:'no_speech'}]),t.mediaReview).verified,true);
  } finally {fs.rmSync(t.mediaReview.dir,{recursive:true,force:true});}
});
test('own-post replies pass a frame-verified video with uncertain speech and keep the speech out of the reply', () => {
  const t=fixture('video');
  const uncertain={...check,verified:false,visual_verified:true,timeline:['시작','중간','끝'],audio_status:'understood'};
  try {
    assert.throws(()=>m.validateObservation(observation([uncertain]), t.mediaReview), /실패/);
    assert.throws(()=>m.validateObservation(observation([{...uncertain,verified:true,audio_status:'unavailable'}]), t.mediaReview), /영상/);
    assert.throws(()=>m.validateObservation(observation([{...uncertain,visual_verified:false}]), t.mediaReview, {ownPost:true}), /실패/);
    assert.throws(()=>m.validateObservation(observation([{...uncertain,timeline:['시작']}]), t.mediaReview, {ownPost:true}), /영상/);
    const review=m.validateObservation(observation([uncertain]), t.mediaReview, {ownPost:true});
    assert.equal(review.verified,true); assert.equal(review.audioUncertain,true);
    assert.match(review.uncertainties.join(' '), /음성 전사 불확실/);
    assert.equal(m.validateObservation(observation([{...uncertain,audio_status:'unavailable'}]), t.mediaReview, {ownPost:true}).audioUncertain,true);
    assert.equal(m.validateObservation(observation([{...check,timeline:['시작','중간','끝'],audio_status:'no_speech'}]), t.mediaReview, {ownPost:true}).audioUncertain,false);
    const own={...t,rootPostUrl:'https://x.com/terafabXai/status/10'}; own.mediaReview={...review,sourceBinding:m.sourceBinding(own)};
    assert.match(m.generationContextLines(own).join('\n'), /음성·대사 내용은 답글 근거로 쓰지 말고/);
    assert.match(m.contextPrompt(own), /내 글 대댓글 예외/);
    assert.doesNotMatch(m.contextPrompt(t), /내 글 대댓글 예외/);
    assert.match(m.judgePrompt(own,'눈 동그랗게 뜬 게 귀엽죠'), /내 글 대댓글 예외/);
    assert.doesNotMatch(m.judgePrompt(t,'눈 동그랗게 뜬 게 귀엽죠'), /내 글 대댓글 예외/);
  } finally {fs.rmSync(t.mediaReview.dir,{recursive:true,force:true});}
});
test('source edits and replaced files invalidate the actual media approval', () => {
  const t=fixture();
  try {
    m.assertReview(t); t.targetText='다른 원문'; assert.throws(()=>m.assertReview(t), /변경/);
    t.targetText=target().targetText; fs.writeFileSync(t.mediaReview.files[0].path,'replacement'); assert.throws(()=>m.assertReview(t), /파일/);
  } finally {fs.rmSync(t.mediaReview.dir,{recursive:true,force:true});}
});
test('independent direct-response and role failure block publication regardless of other approvals', () => {
  const t=fixture();
  const good={source_grounded:true, media_verified:true,conversation_role_ok:true,direct_response_ok:true,context_complete:true,source_eligible:true,naturalness_ok:true,non_tautological:true,media_checks:[check],reason:'대상에 직접 응답'};
  try {
    for(const flag of ['source_grounded','media_verified','conversation_role_ok','direct_response_ok','context_complete','source_eligible','naturalness_ok','non_tautological']) assert.throws(()=>m.validateJudge({...good,[flag]:false},t,'상자 열고 들어가려나'), /탈락/);
    assert.equal(m.validateJudge(good,t,'상자 열고 들어가려나').replyHash,m.hash('상자 열고 들어가려나'));
  } finally {fs.rmSync(t.mediaReview.dir,{recursive:true,force:true});}
});
test('missing known attachments and changed original text fail closed', async () => {
  const t={...target(),mediaCount:1};
  await assert.rejects(()=>m.collectSources(t,{fetchStatus:async()=>({id:'123',text:t.targetText})}), /미디어/);
  await assert.rejects(()=>m.collectSources(target(),{fetchStatus:async()=>({id:'123',text:'글 수정됨'})}), /변경/);
});
test('uncollected YouTube videos cannot pass as attachment-free text, including parent and quote links', async () => {
  for (const link of ['https://youtube.com/shorts/azDE6caCwjU', 'https://youtu.be/azDE6caCwjU?t=1', 'https://www.youtube.com/watch?v=azDE6caCwjU&feature=share']) {
    const t={...target(),targetText:`천재 아이디어 ${link}`};
    await assert.rejects(()=>m.collectSources(t,{fetchStatus:async()=>({id:'123',text:t.targetText,media:{all:[]}})}), /외부 YouTube 영상 미검수/);
  }
  await assert.rejects(()=>m.collectSources(target(),{fetchStatus:async()=>({id:'123',text:target().targetText,quote:{id:'456',url:'https://x.com/b/status/456',text:'https://youtube.com/embed/azDE6caCwjU'}})}), /외부 YouTube 영상 미검수/);
  const t={...target(),rootPostUrl:'https://x.com/b/status/456',rootPostText:'https://youtube.com/live/azDE6caCwjU'};
  await assert.rejects(()=>m.collectSources(t,{fetchStatus:async url=>({id:url.split('/').pop(),text:t.rootPostText})}), /외부 YouTube 영상 미검수/);
  await assert.rejects(()=>m.collectSources(target(),{fetchStatus:async()=>({id:'123',text:target().targetText,raw_text:{facets:[{replacement:'https://youtu.be/azDE6caCwjU'}]}})}), /외부 YouTube 영상 미검수/);
});
test('ordinary text, channel links, and X native media remain available without following arbitrary URLs', async () => {
  for (const text of ['멈추는 것도 나를 지키는 방법', '채널 https://youtube.com/@example', 'https://notyoutube.com/watch?v=azDE6caCwjU']) {
    const t={...target(),targetText:text};
    const sources=await m.collectSources(t,{fetchStatus:async()=>({id:'123',text,media:{all:[{type:'photo',url:'https://pbs.twimg.com/example.jpg'}]}})});
    assert.equal(sources[0].media.length,1);
  }
});
test('quotes are inspected and original video URL is preserved rather than its thumbnail', async () => {
  const sources=await m.collectSources(target(),{fetchStatus:async()=>({id:'123',text:target().targetText,media:{videos:[{type:'video',url:'https://video.twimg.com/a.mp4',thumbnail_url:'https://pbs.twimg.com/poster.jpg'}]},quote:{id:'456',url:'https://x.com/b/status/456',text:'인용문',media:{photos:[{type:'photo',url:'https://pbs.twimg.com/b.jpg'}]}}})});
  assert.equal(sources.length,2); assert.equal(sources[0].media[0].url,'https://video.twimg.com/a.mp4'); assert.equal(sources[1].quote,true);
});

test('external Korean JSON survives a UTF-8 character split across network chunks', async () => {
  const http = require('node:http');
  const { requestExternalJson } = require('../mirror_server');
  const bytes = Buffer.from(JSON.stringify({text:'귤을 같이 주웠다'}));
  const server = http.createServer((_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.write(bytes.subarray(0,11));setTimeout(()=>{res.end(bytes.subarray(11));},5);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {assert.deepEqual(await requestExternalJson(`http://127.0.0.1:${server.address().port}`),{text:'귤을 같이 주웠다'});}
  finally {await new Promise(resolve=>server.close(resolve));}
});

test('own story continuation media match status ID across handle case changes', () => {
  const items=[{postUrl:'https://x.com/terafabXai/status/123',replyReceipts:[{url:'https://x.com/terafabXai/status/456'}]}];
  assert.deepEqual(m.continuationUrls(items,'https://x.com/terafabxai/status/123'),['https://x.com/terafabXai/status/456']);
});

test('a sign-off greeting in an external original does not force a generic greeting reply', () => {
  const external=fixture();
  try {
    assert.match(m.judgePrompt(external,'상자 여는 앞발이 야무지네'), /맺음말 안부에 답하지 않았다는 이유만으로 탈락시키지 마라/);
    assert.doesNotMatch(m.judgePrompt({...external,rootPostUrl:'https://x.com/terafabXai/status/10'},'봐주셔서 감사해요'), /맺음말 안부에 답하지 않았다는 이유만으로 탈락시키지 마라/);
  } finally {fs.rmSync(external.mediaReview.dir,{recursive:true,force:true});}
});

test('Codex output schema constrains audio verdicts independently of free-form explanations', () => {
  const schema=m.reviewSchema(true);
  const item=schema.properties.media_checks.items;
  assert.equal(schema.additionalProperties,false);
  assert.ok(item.required.includes('audio_note'));
  assert.ok(item.properties.audio_status.enum.includes('no_speech'));
  assert.ok(item.required.includes('timeline'));
});
