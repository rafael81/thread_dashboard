const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cleanThreadText,
  assessXScheduledEntry,
  assessTerafabxCurrentCommentPolicy,
  dashboardDiscoveryRow,
  deriveTerafabxCommentQualityFeedback,
  DuplicateMirrorError,
  evaluateTerafabxCommentWorkflow,
  shouldTerafabxCommentMonitorRequestPrefill,
  isPublishedDiscoveryRow,
  isTerafabxQuietPostingTime,
  terafabxDailyCommentProgress,
  parseTerafabxFinalJudge,
  scoreTerafabxClichePenalty,
  selectRootPostMediaCandidates,
  shouldAutoRecoverXScheduledAnomaly,
  findXScheduledEntry,
  terafabxGeminiReviewPrompt,
  terafabxGrokContextBatchPrompt,
  parseTerafabxGrokContextBatch,
  isDiscoveryAutoScheduleSource,
  ensureComposerText,
  mergeDiscoveryRowsWithMirrorHistory,
  mirrorHistoryDashboardRow,
  shouldMarkDiscoveryScheduleFailed,
  shouldRecoverDiscoveryPlaceholder,
  splitInssiderReplyChunks,
  truncateXText,
  verifyComposerText,
  xWeightedLength,
  xScheduledTimeNeedles,
} = require('../mirror_server.js');
const { DEFAULT_GROK_URL, agentBrowserInvocation, buildGrokBatchCommandChunks, buildGrokBatchCommands, parseDoneMarker } = require('../scripts/terafabx-grok-web-agent.js');

test('sharp runtime dependency is importable', async () => {
  const sharp = await import('sharp');
  assert.equal(typeof sharp.default, 'function');
});

test('TerafabX Grok context batch keeps target indexes isolated', () => {
  const targets = [
    { url: 'https://x.com/a/status/1', targetText: '의정부고 졸업사진에서 손흥민 닮은 학생' },
    { url: 'https://x.com/b/status/2', targetText: '댓글 백 개도 어렵다는 이야기' },
  ];
  const prompt = terafabxGrokContextBatchPrompt(targets);
  assert.match(prompt, /### index=0/);
  assert.match(prompt, /### index=1/);
  assert.match(prompt, /서로 내용을 섞지 마라/);

  const parsed = parseTerafabxGrokContextBatch(JSON.stringify([
    { index: 1, context_summary: '댓글을 백 개 작성하기도 어렵다며 다른 이용자들의 작성 방식을 궁금해하는 가벼운 하소연이다.', key_points: ['백 개 작성', '가벼운 하소연'] },
    { index: 0, context_summary: '의정부고 졸업사진 속 손흥민 닮은 학생을 보고 놀라는 유머 글이다.', key_points: ['의정부고 졸업사진', '손흥민 닮은 학생'] },
  ]), targets);

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].ok, true);
  assert.match(parsed[0].context.contextSummary, /손흥민/);
  assert.equal(parsed[1].ok, true);
  assert.match(parsed[1].context.contextSummary, /백 개/);
});

test('TerafabX Grok context batch fails closed for a missing index', () => {
  const targets = [
    { url: 'https://x.com/a/status/1', targetText: '첫 글' },
    { url: 'https://x.com/b/status/2', targetText: '둘째 글' },
  ];
  const parsed = parseTerafabxGrokContextBatch(JSON.stringify([
    { index: 0, context_summary: '첫 번째 글의 주제와 감정 및 안전하게 반응할 지점을 충분히 자세히 분석한 결과다.', key_points: ['첫 글'] },
  ]), targets);
  assert.equal(parsed[0].ok, true);
  assert.equal(parsed[1].ok, false);
});

test('past scheduled discovery row is treated as posted on dashboard', () => {
  const now = Date.parse('2026-07-05T08:00:00.000Z');
  const row = {
    canonicalUrl: 'https://inssider.kr/posts/003001/73202',
    status: 'scheduled',
    scheduledPostAt: '2026-07-05T07:40:00.000Z',
    postedAt: '2026-07-05 07:17:34',
  };
  assert.equal(isPublishedDiscoveryRow(row, now), true);
  assert.deepEqual(dashboardDiscoveryRow(row, now), {
    ...row,
    status: 'posted',
    postedAt: '2026-07-05T07:40:00.000Z',
    scheduledPostAt: null,
  });
});

test('future scheduled discovery row remains scheduled', () => {
  const now = Date.parse('2026-07-05T07:00:00.000Z');
  const row = {
    canonicalUrl: 'https://inssider.kr/posts/003001/73202',
    status: 'scheduled',
    scheduledPostAt: '2026-07-05T07:40:00.000Z',
    postedAt: '2026-07-05 07:17:34',
  };
  assert.equal(isPublishedDiscoveryRow(row, now), false);
  assert.equal(dashboardDiscoveryRow(row, now).status, 'scheduled');
});

test('mirror-history can backfill a missing posted dashboard row', () => {
  const now = Date.parse('2026-07-05T08:00:00.000Z');
  const entry = {
    canonicalUrl: 'https://inssider.kr/posts/003001/73202',
    status: 'scheduled',
    scheduledAt: '2026-07-05T07:40:00.000Z',
    mediaCount: 1,
    completedAt: '2026-07-05T07:17:34.351Z',
  };
  const row = mirrorHistoryDashboardRow(entry, now);
  assert.equal(row.status, 'posted');
  assert.equal(row.postedAt, '2026-07-05T07:40:00.000Z');
});

test('mergeDiscoveryRowsWithMirrorHistory promotes existing scheduled row after publish time', () => {
  const now = Date.parse('2026-07-05T08:00:00.000Z');
  const rows = [{
    canonicalUrl: 'https://inssider.kr/posts/003001/73202',
    status: 'scheduled',
    scheduledPostAt: '2026-07-05T07:40:00.000Z',
    postedAt: '2026-07-05 07:17:34',
    mediaCount: 0,
  }];
  const historyEntries = [{
    canonicalUrl: 'https://inssider.kr/posts/003001/73202',
    status: 'scheduled',
    scheduledAt: '2026-07-05T07:40:00.000Z',
    mediaCount: 1,
    completedAt: '2026-07-05T07:17:34.351Z',
  }];
  const merged = mergeDiscoveryRowsWithMirrorHistory(rows, now, historyEntries);
  assert.equal(merged[0].status, 'posted');
  assert.equal(merged[0].scheduledPostAt, null);
  assert.equal(merged[0].mediaCount, 1);
});

test('inssider reply chunks stay below X weighted length budget', () => {
  const text = '거래처별 특징, 실수하기 쉬운 부분, 업무 순서, 엑셀 함수, 자주 쓰는 메일 문구까지 5년 동안 틈틈이 정리했습니다. 회사에서 시킨 적은 없고, 전부 제가 편하려고 만든 자료였습니다. 그런데 퇴사 소식을 들은 팀장님이 갑자기 말씀하시더라고요.';
  const chunks = splitInssiderReplyChunks(text, 180);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => xWeightedLength(chunk) <= 180));
});

test('TerafabX quiet posting window blocks 01:00-07:00 KST only', () => {
  assert.equal(isTerafabxQuietPostingTime(new Date('2026-07-04T15:59:00.000Z')), false); // 00:59 KST
  assert.equal(isTerafabxQuietPostingTime(new Date('2026-07-04T16:00:00.000Z')), true); // 01:00 KST
  assert.equal(isTerafabxQuietPostingTime(new Date('2026-07-04T21:59:00.000Z')), true); // 06:59 KST
  assert.equal(isTerafabxQuietPostingTime(new Date('2026-07-04T22:00:00.000Z')), false); // 07:00 KST
});

test('TerafabX final judge lets structured Gemini cliche flags override a perfect score', () => {
  const reply = '주말 출근하시는 분들을 향한 따뜻한 응원에 마음이 훈훈해지네요 작성자님도 재충전의 시간 보내세요';
  const result = parseTerafabxFinalJudge(JSON.stringify({
    context: 40,
    naturalness: 25,
    specificity: 15,
    concision: 10,
    non_ai_style: 10,
    fatal_error: false,
    language_error: false, awkward_korean: false, translation_tone: false, cliche: true, context_error: false,
    reason: '모델 평가는 만점',
  }), reply);

  assert.equal(scoreTerafabxClichePenalty(reply).penalty, 42);
  assert.equal(result.rawScore, 100);
  assert.equal(result.score, 100);
  assert.equal(result.passed, false);
  assert.deepEqual(result.flaggedQualityIssues, ['cliche']);

  const repeatedOwnPostReply = '진짜 신기하게 딱 보이지 않나요ㅋㅋ';
  const repeatedResult = parseTerafabxFinalJudge(JSON.stringify({
    context: 40,
    naturalness: 25,
    specificity: 15,
    concision: 10,
    non_ai_style: 10,
    fatal_error: false,
    language_error: false, awkward_korean: false, translation_tone: false, cliche: true, context_error: false,
    reason: '문맥은 맞지만 반복 감탄 템플릿',
  }), repeatedOwnPostReply);
  assert.equal(scoreTerafabxClichePenalty(repeatedOwnPostReply).penalty, 16);
  assert.equal(repeatedResult.rawScore, 100);
  assert.equal(repeatedResult.score, 100);
  assert.equal(repeatedResult.passed, false);
});

test('TerafabX Gemini rewrite prompt does not ask the rewriting model to score itself', () => {
  const prompt = terafabxGeminiReviewPrompt(
    { url: 'https://x.com/example/status/1', targetText: '주말 출근자들을 응원합니다.' },
    { reply: '주말에도 힘내세요', contextSummary: '주말 출근자 응원', keyPoints: ['응원'] },
  );

  assert.doesNotMatch(prompt, /"score"\s*:/);
  assert.match(prompt, /이 단계에서 점수를 매기지 않는다/);
  assert.match(prompt, /8~45자/);
  assert.match(prompt, /길이를 늘리기보다 원문의 구체적인/);
});

test('TerafabX final judge passes a natural specific reply at the quality threshold', () => {
  const result = parseTerafabxFinalJudge(JSON.stringify({
    context: 36,
    naturalness: 23,
    specificity: 13,
    concision: 9,
    non_ai_style: 9,
    fatal_error: false,
    language_error: false, awkward_korean: false, translation_tone: false, cliche: false, context_error: false,
    cross_post_reusable: false, headline_tone: false, specificity_error: false,
    source_anchor: '주말 출근자들',
    reason: '원문의 주말 출근 응원에 짧고 자연스럽게 반응함',
  }), '주말 출근자들에게 건넨 커피 응원이 딱 힘이 되겠네요', {
    targetText: '주말 출근자들에게 커피 한 잔과 함께 힘내라는 응원을 보냅니다',
  });

  assert.equal(result.score, 90);
  assert.equal(result.passed, true);
});

test('TerafabX final judge blocks a reusable headline-style prefill despite a perfect score', () => {
  const result = parseTerafabxFinalJudge(JSON.stringify({
    context: 40, naturalness: 25, specificity: 15, concision: 10, non_ai_style: 10,
    fatal_error: false,
    language_error: false, awkward_korean: false, translation_tone: false, cliche: false, context_error: false,
    cross_post_reusable: true, headline_tone: true, specificity_error: true,
    source_anchor: '결혼 사기 의혹',
    reason: '다른 스캔들 글에도 붙는 기사 제목형 일반론',
  }), '폭로성 스캔들은 사실 확인이 먼저 필요합니다', {
    targetText: '결혼 사기 의혹과 임신 기간 중 교제 논란',
  });

  assert.equal(result.rawScore, 100);
  assert.equal(result.passed, false);
  assert.deepEqual(result.flaggedQualityIssues, ['cross_post_reusable', 'headline_tone', 'specificity_error']);
});

test('TerafabX final judge rejects a high total score when context is below the hard gate', () => {
  const result = parseTerafabxFinalJudge(JSON.stringify({
    context: 29,
    naturalness: 25,
    specificity: 15,
    concision: 10,
    non_ai_style: 10,
    fatal_error: false,
    language_error: false, awkward_korean: false, translation_tone: false, cliche: false, context_error: false,
    reason: '문장은 자연스럽지만 원문 맥락 반영이 부족함',
  }), '짧고 자연스럽지만 다른 글에도 붙일 수 있는 댓글');

  assert.equal(result.rawScore, 89);
  assert.equal(result.contextPassed, false);
  assert.equal(result.passed, false);
});

test('TerafabX daily comment cadence targets 600 and accelerates when behind pace', () => {
  const now = new Date('2026-07-11T00:18:00.000Z'); // 09:18 KST
  const commentHistory = Array.from({ length: 45 }, (_, index) => ({
    at: new Date(now.getTime() - index * 60_000).toISOString(),
    replyUrl: `https://x.com/terafabXai/status/${index + 1}`,
  }));
  const result = terafabxDailyCommentProgress({ commentHistory }, now);

  assert.equal(result.dailyTarget, 600);
  assert.equal(result.postedToday, 45);
  assert.equal(result.baseIntervalMs, 108000);
  assert.ok(result.requiredIntervalMs < result.baseIntervalMs);
  assert.ok(result.behindBy > 0);
  assert.equal(result.reached, false);
});

test('TerafabX pending comments must satisfy the new short context-first policy', () => {
  const accepted = assessTerafabxCurrentCommentPolicy({
    comment: '종각역 안내판은 외국인 눈엔 더 복잡해 보이겠네요',
    geminiReview: { finalJudge: { passed: true, fatalError: false, qualityFlagsComplete: true, flaggedQualityIssues: [], dimensions: { context: 36 } } },
  });
  const stale = assessTerafabxCurrentCommentPolicy({
    comment: '따뜻한 응원에 마음이 훈훈해지네요 작성자님도 행복한 하루 보내시고 여유롭게 재충전하는 시간 되세요',
    geminiReview: { finalJudge: { passed: true, fatalError: false, qualityFlagsComplete: true, flaggedQualityIssues: [], dimensions: { context: 28 } } },
  });

  assert.equal(accepted.ok, true);
  assert.equal(stale.ok, false);
  assert.ok(stale.errors.some((error) => error.startsWith('comment_too_long')));
  assert.ok(stale.errors.some((error) => error.startsWith('context_gate_failed')));
});

test('TerafabX pending comments reject Grok text fallback even for legacy prefill', () => {
  const result = assessTerafabxCurrentCommentPolicy({
    at: '2026-07-12T05:00:00.000Z',
    comment: '원문만 보고 만든 댓글은 게시하지 않아요',
    grokContext: {
      summary: 'Grok 문맥 분석 실패 후 원문 텍스트를 직접 사용한다. 원문: 테스트',
      keyPoints: ['원문 핵심 문장: 테스트'],
      rawPreview: 'local_text_context_after_grok_failure',
    },
    geminiReview: {
      finalJudge: {
        passed: true,
        fatalError: false,
        dimensions: { context: 40 },
      },
    },
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('grok_context_fallback'));
});

test('TerafabX comment monitor detects a 10-minute throughput shortfall and independent judge failure', () => {
  const now = new Date('2026-07-11T00:00:00.000Z'); // 09:00 KST
  const state = {
    commentEnabled: true,
    lastCommentRunAt: '2026-07-10T23:59:00.000Z',
    lastCommentStatus: 'ok',
    pendingCommentPosts: [{ targetUrl: 'https://x.com/example/status/3', queuedAt: '2026-07-10T23:58:00.000Z' }],
    commentHistory: [
      { comment: '원문의 구체적인 장면을 잘 짚은 답글', replyUrl: 'https://x.com/terafabXai/status/2', postedAt: '2026-07-10T23:58:00.000Z', geminiReview: { score: 100, finalJudge: { score: 82 } } },
      { comment: '두 번째 자연스러운 답글', replyUrl: 'https://x.com/terafabXai/status/1', postedAt: '2026-07-10T23:54:00.000Z', geminiReview: { score: 10, finalJudge: { score: 95 } } },
    ],
  };

  const result = evaluateTerafabxCommentWorkflow(state, { now, windowMs: 10 * 60 * 1000, quiet: false });

  assert.equal(result.targetInWindow, 6);
  assert.equal(result.postedInWindow, 2);
  assert.equal(result.status, 'degraded');
  assert.ok(result.findings.some((item) => item.type === 'throughput_below_target'));
  assert.ok(result.findings.some((item) => item.type === 'daily_pace_below_target'));
  assert.ok(result.findings.some((item) => item.type === 'independent_judge_failures'));
});

test('TerafabX comment quality feedback ignores Gemini self score and learns deterministic cliche rules', () => {
  const feedback = deriveTerafabxCommentQualityFeedback([{
    comment: '작성자님도 재충전의 시간 보내세요',
    geminiReview: { score: 10, finalJudge: { score: 94 } },
  }]);

  assert.equal(feedback.averageIndependentScore, 94);
  assert.equal(feedback.clicheCommentCount, 1);
  assert.ok(feedback.rules.some((rule) => rule.includes('작성자님')));
  assert.ok(feedback.rules.some((rule) => rule.includes('재충전의 시간')));
});

test('TerafabX comment monitor suspends throughput alerts during quiet posting hours', () => {
  const result = evaluateTerafabxCommentWorkflow({ commentEnabled: true, pendingCommentPosts: [], commentHistory: [] }, {
    now: new Date('2026-07-10T17:00:00.000Z'), // 02:00 KST
  });

  assert.equal(result.quiet, true);
  assert.equal(result.targetInWindow, 0);
  assert.equal(result.status, 'quiet');
  assert.ok(!result.findings.some((item) => item.type === 'throughput_below_target'));
});

test('TerafabX comment monitor still requests prefill during quiet posting hours', () => {
  const result = evaluateTerafabxCommentWorkflow({ commentEnabled: true, pendingCommentPosts: [], commentHistory: [] }, {
    now: new Date('2026-07-10T17:00:00.000Z'), // 02:00 KST
  });

  assert.equal(result.quiet, true);
  assert.equal(shouldTerafabxCommentMonitorRequestPrefill(
    { commentEnabled: true },
    result,
    { targetCount: 200, prefillBusy: false, manualActionPending: false },
  ), true);
});

test('Grok final judge uses one native X Grok batch with semantic fill and Enter submission', () => {
  const commands = buildGrokBatchCommands('한 줄\n심사', 'https://x.com/i/grok', 60000, () => 0);

  assert.deepEqual(commands.slice(0, 6), [
    'batch',
    '--bail',
    'open https://x.com/i/grok',
    'wait 1800',
    'reload',
    'wait 4200',
  ]);
  assert.ok(commands[6].startsWith('eval -b '));
  const submitCommand = commands.find((command) => command.startsWith('eval -b ') && Buffer.from(command.slice('eval -b '.length), 'base64').toString('utf8').includes('contenteditable'));
  assert.ok(submitCommand);
  const submitScript = Buffer.from(submitCommand.slice('eval -b '.length), 'base64').toString('utf8');
  assert.match(submitScript, /contenteditable/);
  assert.match(submitScript, /한 줄\\n심사/);
  const responseReadCommand = commands.find((command) => command.startsWith('eval -b ') && Buffer.from(command.slice('eval -b '.length), 'base64').toString('utf8').includes('stableCount'));
  assert.ok(responseReadCommand);
  const responseReadScript = Buffer.from(responseReadCommand.slice('eval -b '.length), 'base64').toString('utf8');
  assert.match(responseReadScript, /'\[class\*="r-bnwqim"\]\[class\*="r-11niif6"\]'/);
  assert.match(responseReadScript, /text\.includes\(prompt\.slice/);
  assert.ok(commands.includes('press Control+a'));
  assert.ok(commands.some((command) => command.startsWith('keyboard inserttext ') && command.includes('한 줄\\n심사')));
  assert.ok(commands.includes('press Enter'));
  assert.ok(commands.some((command) => command.startsWith('eval -b ')));
  assert.ok(!commands.some((command) => command.startsWith('find placeholder ')));
  assert.ok(!commands.some((command) => command.includes('grok.com/')));
});

test('TerafabX Grok context automation defaults to grok.com headless', () => {
  assert.equal(DEFAULT_GROK_URL, 'https://grok.com/');
  assert.equal(require('../mirror_server.js').TERAFABX_GROK_WEB_URL, 'https://grok.com/');
});

test('Grok headless browser uses the regular Chrome identity and system Chrome binary', () => {
  const invocation = agentBrowserInvocation(['open', 'https://x.com/i/grok'], { session: 'ua-test' });
  const userAgentIndex = invocation.args.indexOf('--user-agent');
  const executableIndex = invocation.args.indexOf('--executable-path');

  assert.ok(userAgentIndex >= 0);
  assert.match(invocation.args[userAgentIndex + 1], /Chrome\/149\.0\.0\.0/);
  assert.doesNotMatch(invocation.args[userAgentIndex + 1], /HeadlessChrome|Chrome for Testing/);
  assert.equal(invocation.args[executableIndex + 1], '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  assert.ok(invocation.args.includes('--lang=ko-KR,--window-size=1440,900'));
});

test('Grok final judge chunks long polling so the browser command line stays bounded', () => {
  const chunks = buildGrokBatchCommandChunks('긴 심사', 'https://x.com/i/grok', 180000);

  assert.equal(chunks.length, 24);
  assert.equal(chunks[0][2], 'open https://x.com/i/grok');
  assert.ok(chunks.slice(1).every((commands) => commands.slice(0, 2).join(' ') === 'batch --bail'));
  assert.ok(chunks.every((commands, index) => commands.filter((command) => command.startsWith('eval -b ')).length <= (index === 0 ? 3 : 2)));
  assert.equal(chunks.flat().filter((command) => command.startsWith('eval -b ')).length, 49);
});

test('Grok final judge parses a done marker containing an apostrophe in the reason', () => {
  const payload = { response: '{"reason":"\'마음씨까지 예쁜\' 표현"}' };
  const raw = `Error: TERAFABX_GROK_DONE:${encodeURIComponent(JSON.stringify(payload))}`;

  assert.deepEqual(parseDoneMarker(raw), payload);
});

test('Threads text cleanup preserves short Korean no-space captions', () => {
  assert.equal(cleanThreadText('aa_size\n끌고가라\n1\n/', 'aa_size'), '끌고가라');
});

test('Threads text cleanup still drops unrelated handle-only recommendations', () => {
  assert.equal(cleanThreadText('aa_size\n끌고가라\ndestination_now_\n1\n/', 'aa_size'), '끌고가라');
});

// Regression: a Threads topic/community label was included in an auto-scheduled title.
// Found by /investigate on 2026-07-10.
test('Threads text cleanup removes DOM-confirmed topic labels', () => {
  const raw = 'kbap_star\n유머\n여행가서 역관광하는 빠니보틀ㅋㅋ\n출처:빠니보틀';

  assert.equal(
    cleanThreadText(raw, 'kbap_star', ['유머']),
    '여행가서 역관광하는 빠니보틀ㅋㅋ\n출처:빠니보틀',
  );
});

test('Threads text cleanup preserves the same text when it is not a DOM topic label', () => {
  assert.equal(cleanThreadText('kbap_star\n유머', 'kbap_star'), '유머');
});

test('Threads text cleanup removes multiple normalized topic labels', () => {
  const raw = 'sample_author\n  여행   이야기  \n오늘 다녀온 곳';

  assert.equal(cleanThreadText(raw, 'sample_author', ['여행 이야기']), '오늘 다녀온 곳');
});

test('Threads text cleanup removes translation UI labels from translated titles', () => {
  const raw = 'foreign_author\n번역 보기\n한국어로 번역된 제목입니다\n원본 보기\nAI 정보';

  assert.equal(cleanThreadText(raw, 'foreign_author'), '한국어로 번역된 제목입니다');
});

test('Threads text cleanup removes media playback song metadata from the title', () => {
  const caption = '요즘 수저 개념이래~! 😉😉\n난 어차피 그지라ㅋㅋㅋㅋㅋㅋㅋㅋ';
  const raw = `${caption}\n듣기만 해도 부자 되는 음악 · 조빈`;

  assert.equal(
    cleanThreadText(raw, 'sample_author'),
    caption,
  );
});

// Regression: video-only repost attribution was treated as the post title.
// @bloneattheroots/Dal3tqdDMPM links mingliu0107 inside the media card.
test('Threads text cleanup removes DOM-confirmed media source attribution', () => {
  assert.equal(
    cleanThreadText('bloneattheroots\nmingliu0107', 'bloneattheroots', ['mingliu0107']),
    '',
  );
});

test('Threads text cleanup preserves a single-token foreign caption without DOM attribution evidence', () => {
  assert.equal(cleanThreadText('sample_author\nBeautiful', 'sample_author'), 'Beautiful');
});

// Regression: Threads body fallback included the post date between the handle and caption.
// Found on @artunni_ DaKXT38GS7U on 2026-07-11.
test('Threads text cleanup removes standalone ISO post-date metadata', () => {
  assert.equal(
    cleanThreadText('artunni_\n2026-06-29\n울 집에 이렁거 있음', 'artunni_'),
    '울 집에 이렁거 있음',
  );
});

test('Threads text cleanup preserves dates that are part of the actual caption', () => {
  assert.equal(
    cleanThreadText('artunni_\n2026-06-29에 이사했어요', 'artunni_'),
    '2026-06-29에 이사했어요',
  );
});

test('Threads media extraction rejects images owned by nested reply articles', () => {
  const rootImage = {
    kind: 'image', src: 'https://cdninstagram.com/root.jpg', top: 300, left: 0,
    width: 640, height: 480, rootOwned: true, matchesTargetPost: true, belowHandle: true,
  };
  const replyImage = {
    kind: 'image', src: 'https://cdninstagram.com/reply.jpg', top: 900, left: 0,
    width: 461, height: 250, rootOwned: false, matchesTargetPost: false, belowHandle: true,
  };

  const result = selectRootPostMediaCandidates([replyImage, rootImage]);

  assert.deepEqual(result.selectedMedia.map((item) => item.src), [rootImage.src]);
});

test('Threads text-only post does not borrow a related reply image', () => {
  const replyImage = {
    kind: 'image', src: 'https://cdninstagram.com/reply.jpg', top: 919, left: 0,
    width: 461, height: 250, rootOwned: false, matchesTargetPost: false, belowHandle: true,
  };

  const result = selectRootPostMediaCandidates([replyImage]);

  assert.equal(result.rootCandidates.length, 0);
  assert.equal(result.selectedMedia.length, 0);
});

test('Threads body fallback rejects media below the root reply boundary', () => {
  const belowReplyComposer = {
    kind: 'image', src: 'https://cdninstagram.com/reply.jpg', top: 919, left: 0,
    width: 461, height: 250, rootOwned: true, matchesTargetPost: true,
    belowHandle: true, beforeRootBoundary: false,
  };

  const result = selectRootPostMediaCandidates([belowReplyComposer]);

  assert.equal(result.selectedMedia.length, 0);
});

test('X schedule monitor finds the exact KST slot and accepts its title', () => {
  const scheduledAt = '2026-07-11T05:30:00.000Z';
  const entries = [{
    text: '2026년 7월 11일 (토) 오후 2:30에 전송 예정\n‘팀장님‘이라는 신기한 단어.\n0:08',
  }];

  assert.deepEqual(xScheduledTimeNeedles(scheduledAt), ['2026년 7월 11일', '오후 2:30에 전송 예정']);
  const entry = findXScheduledEntry(entries, scheduledAt);
  const result = assessXScheduledEntry({ textPreview: '‘팀장님‘이라는 신기한 단어.' }, entry);

  assert.equal(result.status, 'ok');
});

test('X schedule verification selects the matching title when a slot has multiple posts', () => {
  const scheduledAt = '2026-07-13T22:00:00.000Z';
  const entries = [
    { text: '2026년 7월 14일 (화) 오전 7:00에 전송 예정\n일론머스크가 말했다..' },
    { text: '2026년 7월 14일 (화) 오전 7:00에 전송 예정\n아 ..ㄹㅇ 눈물 버튼 눌림ㅠㅠ' },
    { text: '2026년 7월 14일 (화) 오전 7:00에 전송 예정\nㅋㅋ진짜 순수 그 자체?' },
  ];

  const entry = findXScheduledEntry(entries, scheduledAt, {
    textPreview: '아 ..ㄹㅇ 눈물 버튼 눌림ㅠㅠ',
    mediaCount: 2,
  });

  assert.equal(entry.text.includes('눈물 버튼'), true);
});

test('X schedule monitor rejects an unexpected standalone ISO date before the expected title', () => {
  const result = assessXScheduledEntry(
    { textPreview: '울 집에 이렁거 있음' },
    { text: '2026년 7월 11일 (토) 오후 3:30에 전송 예정\n2026-06-29\n울 집에 이렁거 있음' },
  );

  assert.equal(result.status, 'title_mismatch');
  assert.equal(result.unexpectedIsoDate, '2026-06-29');
});

test('X schedule monitor distinguishes a media-only row from a mismatched title', () => {
  const mediaOnly = assessXScheduledEntry(
    { textPreview: '예약 제목 테스트' },
    { text: '2026년 7월 11일 (토) 오전 8:00에 전송 예정\n0:08' },
  );
  const mismatch = assessXScheduledEntry(
    { textPreview: '예약 제목 테스트' },
    { text: '2026년 7월 11일 (토) 오전 8:00에 전송 예정\n사용자가 직접 바꾼 제목' },
  );

  assert.equal(mediaOnly.status, 'title_missing');
  assert.equal(mediaOnly.blankTitle, true);
  assert.equal(mismatch.status, 'title_mismatch');
  assert.equal(mismatch.blankTitle, false);
});

test('X schedule monitor accepts a true media-only reservation and rejects an injected attribution title', () => {
  const mediaOnly = assessXScheduledEntry(
    { textPreview: '', mediaCount: 1 },
    { text: '2026년 7월 11일 (토) 오후 8:00에 전송 예정\n0:08' },
  );
  const polluted = assessXScheduledEntry(
    { textPreview: '', mediaCount: 1 },
    { text: '2026년 7월 11일 (토) 오후 8:00에 전송 예정\nmingliu0107\n0:08' },
  );

  assert.equal(mediaOnly.status, 'ok');
  assert.equal(mediaOnly.expectsMediaOnly, true);
  assert.equal(polluted.status, 'title_mismatch');
});

test('X schedule monitor auto-recovers only persistent future missing slots', () => {
  const now = Date.parse('2026-07-11T00:00:00.000Z');
  const missing = {
    type: 'missing',
    persistent: true,
    scheduledAt: '2026-07-11T00:30:00.000Z',
  };

  assert.equal(shouldAutoRecoverXScheduledAnomaly(missing, 14, 15, now), true);
  assert.equal(shouldAutoRecoverXScheduledAnomaly({ ...missing, persistent: false }, 14, 15, now), false);
  assert.equal(shouldAutoRecoverXScheduledAnomaly(missing, 15, 15, now), false);
  assert.equal(shouldAutoRecoverXScheduledAnomaly({ ...missing, scheduledAt: '2026-07-11T00:04:00.000Z' }, 14, 15, now), false);
});

test('X text truncation respects weighted length for long Korean Threads posts', () => {
  const text = "1. 일본의 인디 개발팀이 만든 게임 ’메챠카멜레온(meccha chameleon)‘이 스팀에서 1,500만장의 판매고를 올림\n"
    + "2. 스팀에서 게임이 한화 6,550원에 팔리고 있어 총 982억의 매출을 기록했을 것으로 추정됨\n"
    + "3. 여기서 스팀 수수료를 30%가량 제외하더라도 688억원의 수익을 거둔셈\n"
    + "4. 흥미로운 점은 메챠카멜레온을 단 2명이 언리얼엔진을 활용해 2개월만에 만들었다는 점\n"
    + "5. 게임은 캐릭터에 색을 칠하고 배경을 탐험하는 방식임";
  const truncated = truncateXText(text);

  assert.ok(xWeightedLength(text) > 280);
  assert.ok(xWeightedLength(truncated) <= 270);
  assert.ok(truncated.endsWith('…'));
  assert.match(truncated, /^1\. 일본의 인디 개발팀/);
});

// Regression: X auto-schedule accepted a media-only post after losing the title.
// Found by /qa on 2026-07-10.
// Report: .gstack/qa-reports/qa-report-localhost-2026-07-10.md
for (const { name, expected, actual, normalized } of [
  {
    name: 'Korean title with repeated whitespace',
    expected: '예약 제목 테스트',
    actual: '  예약   제목\n테스트  ',
    normalized: '예약 제목 테스트',
  },
  {
    name: 'English title with line breaks',
    expected: 'Scheduled post title',
    actual: 'Scheduled\npost   title',
    normalized: 'Scheduled post title',
  },
  {
    name: 'short Korean title without spaces',
    expected: '제목확인',
    actual: '제목확인',
    normalized: '제목확인',
  },
]) {
  test(`X compose verification accepts normalized text: ${name}`, async () => {
    const page = {
      eval: async () => ({ found: true, text: actual }),
    };

    const result = await verifyComposerText(page, expected, 'before_schedule_submit', () => {});

    assert.deepEqual(result, { ok: true, actual: normalized });
  });
}

for (const { name, found, actual } of [
  { name: 'media-only compose', found: true, actual: '' },
  { name: 'missing compose editor', found: false, actual: '' },
  { name: 'different title', found: true, actual: '전혀 다른 제목' },
]) {
  test(`X compose verification blocks schedule submit: ${name}`, async () => {
    const page = {
      eval: async () => ({ found, text: actual }),
    };

    await assert.rejects(
      verifyComposerText(page, '예약 제목 테스트', 'before_schedule_submit', () => {}),
      /X 작성창 텍스트 입력 검증 실패\(before_schedule_submit\)/,
    );
  });
}

// Regression: after selecting X schedule time, the composer text could be
// reported as empty and leave the discovery row failed_schedule.
// Found by x-5 monitor on 2026-07-10 for @tuzagaboneup/DajrRo4E_3m.
test('X compose verification checks visible candidates after schedule UI changes', async () => {
  const expected = '주식으로 우울할 땐 홀란을 보자 ⚽️🧔🏼‍♀️ 홀란 재밌는 거 모음';
  const page = {
    eval: async () => ({
      found: true,
      text: '',
      candidates: [
        { visible: false, text: '' },
        { visible: true, text: '주식으로 우울할 땐 홀란을 보자\n⚽️🧔🏼‍♀️\n홀란 재밌는 거 모음' },
      ],
    }),
  };

  const result = await verifyComposerText(page, expected, 'after_schedule_set', () => {});

  assert.equal(result.ok, true);
  assert.equal(result.actual, expected);
});

test('X compose verification rejects text that exists only in an inactive background composer', async () => {
  const page = {
    eval: async () => ({
      found: true,
      text: '',
      candidates: [
        { visible: true, active: true, text: '' },
        { visible: true, active: false, text: '예약 제목 테스트' },
      ],
    }),
  };

  await assert.rejects(
    verifyComposerText(page, '예약 제목 테스트', 'before_schedule_submit', () => {}),
    /X 작성창 텍스트 입력 검증 실패/,
  );
});

test('X compose text is repaired when schedule confirmation clears the title', async () => {
  const expected = '주식으로 우울할 땐 홀란을 보자 ⚽️🧔🏼‍♀️ 홀란 재밌는 거 모음';
  let composerText = '';
  const events = [];
  const page = {
    eval: async (script) => {
      if (script.includes('document.querySelectorAll')) {
        return {
          found: true,
          text: composerText,
          candidates: [{ visible: true, text: composerText }],
        };
      }
      return true;
    },
    send: async (method, payload) => {
      if (method === 'Input.insertText') composerText = payload.text;
    },
  };

  const result = await ensureComposerText(page, expected, 'after_schedule_set', (event, data) => {
    events.push({ event, data });
  });

  assert.equal(result.ok, true);
  assert.equal(result.actual, expected);
  assert.equal(composerText, expected);
  assert.ok(events.some((entry) => entry.event === 'x_compose_text_verified' && entry.data.stage === 'after_schedule_set'));
});

// Regression: a duplicate auto-schedule retry left a failure on a successful row.
// Found by /qa on 2026-07-10.
// Report: .gstack/qa-reports/qa-report-localhost-2026-07-10.md
test('duplicate auto-schedule retries do not overwrite successful schedule state', () => {
  const duplicate = new DuplicateMirrorError('이미 X에 게시 또는 예약된 Threads URL입니다.');

  assert.equal(shouldMarkDiscoveryScheduleFailed(duplicate), false);
  assert.equal(shouldMarkDiscoveryScheduleFailed(new Error('X 예약 버튼을 찾지 못했습니다.')), true);
});

test('startup recovery accepts only incomplete placeholders from the last 24 hours', () => {
  const now = Date.parse('2026-07-10T02:00:00.000Z');
  const row = {
    status: 'review',
    textPreview: '수집 중',
    mediaCount: 0,
    discoveredAt: '2026-07-09 02:00:01',
    criteria: JSON.stringify({ pendingDetailExtract: true, source: 'android_share_auto_schedule' }),
  };

  assert.equal(shouldRecoverDiscoveryPlaceholder(row, now), true);
  assert.equal(shouldRecoverDiscoveryPlaceholder({ ...row, discoveredAt: '2026-07-09 01:59:59' }, now), false);
});

test('startup recovery rejects rows that are no longer incomplete placeholders', () => {
  const now = Date.parse('2026-07-10T02:00:00.000Z');
  const row = {
    status: 'review',
    textPreview: '수집 중',
    mediaCount: 0,
    discoveredAt: '2026-07-10 01:30:00',
    criteria: JSON.stringify({ pendingDetailExtract: true, source: 'android_share_auto_schedule' }),
  };

  assert.equal(shouldRecoverDiscoveryPlaceholder({ ...row, status: 'scheduled' }, now), false);
  assert.equal(shouldRecoverDiscoveryPlaceholder({ ...row, textPreview: '(본문 없음)' }, now), false);
  assert.equal(shouldRecoverDiscoveryPlaceholder({ ...row, mediaCount: 1 }, now), false);
  assert.equal(shouldRecoverDiscoveryPlaceholder({ ...row, criteria: '{}' }, now), false);
});

test('startup recovery resumes scheduling only for auto-schedule sources', () => {
  assert.equal(isDiscoveryAutoScheduleSource('android_share_auto_schedule'), true);
  assert.equal(isDiscoveryAutoScheduleSource('auto-schedule-async'), true);
  assert.equal(isDiscoveryAutoScheduleSource('android_share'), false);
  assert.equal(isDiscoveryAutoScheduleSource('manual'), false);
});
