const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyDiscoveryGroupByRules,
  isPersonalDiscoveryCaption,
  isCuteAnimalDiscoveryCaption,
  discoveryEngagementCount,
  buildGroupClassifierPrompt,
  parseGroupClassification,
  validateGroupClassification,
  DISCOVERY_TOPICS,
} = require("../lib/discovery-group-classifier");

function style(overrides = {}) {
  return {
    pass: false,
    score: 5,
    excluded: false,
    longInfoPost: false,
    hasStrongMedia: true,
    hasKorean: true,
    isCompactHook: true,
    animalCute: true,
    engagementOk: true,
    ...overrides,
  };
}

test("rules assign C for excluded, long info, missing style, images, and Chinese captions", () => {
  assert.equal(classifyDiscoveryGroupByRules({
    likeCount: 5000,
    mediaCount: 1,
    previewUrl: "https://cdn.example/o1/v/t16/f2/m84/clip.mp4",
    criteria: { terafabxStyle: style({ excluded: true }), hasVideo: true },
  }).group, "C");
  assert.equal(classifyDiscoveryGroupByRules({
    mediaCount: 1,
    previewUrl: "https://cdn.example/o1/v/t16/f2/m84/clip.mp4",
    criteria: { terafabxStyle: style({ longInfoPost: true }), hasVideo: true },
  }).reasons[0], "long_info_post");
  assert.equal(classifyDiscoveryGroupByRules({
    likeCount: 9000,
    mediaCount: 2,
    previewUrl: "https://cdn.example/v/t51.82787-15/image.jpg",
    textPreview: "可愛",
    criteria: { terafabxStyle: style({ hasKorean: false }) },
  }).reasons[0], "no_video");
  assert.equal(classifyDiscoveryGroupByRules({
    mediaCount: 1,
    previewUrl: "https://cdn.example/o1/v/t2/f2/m86/clip.mp4",
    textPreview: "好可愛喔",
    criteria: { terafabxStyle: style({ hasKorean: false }), hasVideo: true },
  }).reasons[0], "no_korean_caption");
  assert.equal(classifyDiscoveryGroupByRules({
    mediaCount: 1,
    previewUrl: "https://cdn.example/o1/v/t16/f2/m84/clip.mp4",
    criteria: { hasVideo: true },
  }).reasons[0], "no_style_assessment");
});

test("rules assign A from style pass on a Korean video, ignoring likes", () => {
  const result = classifyDiscoveryGroupByRules({
    likeCount: 12,
    mediaCount: 1,
    previewUrl: "https://cdn.example/o1/v/t16/f2/m84/clip.mp4",
    textPreview: "이 눈빛 진짜 심장 털림",
    criteria: { terafabxStyle: style({ pass: true, score: 6 }), hasVideo: true },
  });
  assert.equal(result.group, "A");
  assert.equal(result.borderline, false);

  const chineseHighLikes = classifyDiscoveryGroupByRules({
    likeCount: 18000,
    mediaCount: 1,
    previewUrl: "https://cdn.example/o1/v/t16/f2/m84/clip.mp4",
    textPreview: "好可愛喔",
    criteria: { terafabxStyle: style({ pass: false, hasKorean: false, score: 3 }), hasVideo: true },
  });
  assert.equal(chineseHighLikes.group, "C");
});

test("rules assign B only for Korean video style review, not likes", () => {
  assert.equal(classifyDiscoveryGroupByRules({
    likeCount: 9000,
    mediaCount: 1,
    previewUrl: "https://cdn.example/o1/v/t2/f2/m86/clip.mp4",
    textPreview: "귀여운 표정",
    criteria: {
      terafabxStyle: style({ score: 5, signals: { entertainment: true } }),
      hasVideo: true,
    },
  }).group, "B");
  assert.equal(classifyDiscoveryGroupByRules({
    likeCount: 15000,
    mediaCount: 1,
    previewUrl: "https://cdn.example/v/t51.82787-15/image.jpg",
    textPreview: "좋아요 많은 사진",
    criteria: { terafabxStyle: style({ score: 5 }), viralScore: 2 },
  }).group, "C");
  assert.equal(classifyDiscoveryGroupByRules({
    likeCount: 20,
    mediaCount: 1,
    previewUrl: "https://cdn.example/o1/v/t16/f2/m84/clip.mp4",
    textPreview: "야 왜 그래",
    criteria: { terafabxStyle: style({ pass: true, score: 5 }), hasVideo: true },
  }).group, "A");
});

test("score 6/7 on B path sets borderline; score 8 on B path does not", () => {
  const six = classifyDiscoveryGroupByRules({
    likeCount: 3500,
    mediaCount: 1,
    previewUrl: "https://cdn.example/o1/v/t16/f2/m84/clip.mp4",
    textPreview: "이 장면 보면 웃음",
    criteria: { terafabxStyle: style({ pass: false, score: 6, signals: { reaction: true } }), hasVideo: true },
  });
  assert.equal(six.group, "B");
  assert.equal(six.borderline, true);

  const seven = classifyDiscoveryGroupByRules({
    likeCount: 3500,
    mediaCount: 1,
    previewUrl: "https://cdn.example/o1/v/t16/f2/m84/clip.mp4",
    textPreview: "이 장면 보면 웃음",
    criteria: { terafabxStyle: style({ pass: false, score: 7, signals: { reaction: true } }), hasVideo: true },
  });
  assert.equal(seven.borderline, true);

  const eightNotB = classifyDiscoveryGroupByRules({
    likeCount: 12,
    mediaCount: 1,
    previewUrl: "https://cdn.example/o1/v/t16/f2/m84/clip.mp4",
    textPreview: "이 장면 보면 웃음",
    criteria: { terafabxStyle: style({ pass: true, score: 8 }), hasVideo: true },
  });
  assert.equal(eightNotB.group, "A");
});

test("personal diary captions are C even when the video has a style signal", () => {
  const diary = "운동이 인생 0순위인데 강인수 대표님 발 힘무게 1톤은 좀...";
  assert.equal(isPersonalDiscoveryCaption(diary), true);
  assert.equal(isPersonalDiscoveryCaption("나는 운동이 인생의 0순위에요. 어브덕션 무게 60키로"), true);
  assert.equal(isPersonalDiscoveryCaption("틀어진 골반 때문에 코끼리 다리 달고 살던 인생 끝남 ㅋㅋ"), false);
  assert.equal(isPersonalDiscoveryCaption("차에 치인 척하는 사람은 봤는데 고양이는 처음 봄ㅋㅋ"), false);
  assert.equal(isPersonalDiscoveryCaption("이 고양이가 10kg를 든다"), false);

  const result = classifyDiscoveryGroupByRules({
    likeCount: 8000,
    mediaCount: 1,
    previewUrl: "https://cdn.example/o1/v/t16/f2/m84/clip.mp4",
    textPreview: diary,
    criteria: {
      terafabxStyle: style({ score: 6, signals: { entertainment: true }, animalCute: false }),
      hasVideo: true,
    },
  });
  assert.equal(result.group, "C");
  assert.equal(result.reasons[0], "personal_commentary");
});

test("non-animal or low-engagement captions are C", () => {
  assert.equal(isCuteAnimalDiscoveryCaption("차에 치인 척하는 사람은 봤는데 고양이는 처음 봄ㅋㅋ"), true);
  assert.equal(isCuteAnimalDiscoveryCaption("리필통 안 씻고 팩 통째로 넣는 거 발견함ㅋㅋ"), false);
  assert.equal(discoveryEngagementCount({ likeCount: 1800, viewCount: 0 }), 1800);
  assert.equal(discoveryEngagementCount({ likeCount: 100, viewCount: 2500 }), 2500);

  assert.equal(classifyDiscoveryGroupByRules({
    likeCount: 9000,
    mediaCount: 1,
    previewUrl: "https://cdn.example/o1/v/t16/f2/m84/clip.mp4",
    textPreview: "리필통 안 씻고 팩 통째로 넣는 거 발견함ㅋㅋ",
    criteria: {
      terafabxStyle: style({ score: 6, animalCute: false, signals: { reaction: true } }),
      hasVideo: true,
    },
  }).reasons[0], "not_cute_animal");

  assert.equal(classifyDiscoveryGroupByRules({
    likeCount: 900,
    mediaCount: 1,
    previewUrl: "https://cdn.example/o1/v/t16/f2/m84/clip.mp4",
    textPreview: "고양이는 처음 봄ㅋㅋ",
    criteria: {
      terafabxStyle: style({ score: 6, animalCute: true, engagementOk: false, signals: { entertainment: true } }),
      hasVideo: true,
    },
  }).reasons[0], "below_view_threshold");
});

test("likes never promote a non-video or non-style post", () => {
  const image = classifyDiscoveryGroupByRules({
    likeCount: 2999,
    mediaCount: 1,
    previewUrl: "https://cdn.example/v/t51.82787-15/image.jpg",
    criteria: { terafabxStyle: style({ score: 5 }) },
  });
  assert.equal(image.group, "C");
  assert.equal(image.reasons[0], "no_video");

  const video = classifyDiscoveryGroupByRules({
    likeCount: 0,
    mediaCount: 1,
    previewUrl: "https://cdn.example/o1/v/t16/f2/m84/clip.mp4",
    textPreview: "보면 볼수록 웃김",
    criteria: { terafabxStyle: style({ score: 5, signals: { reaction: true } }), hasVideo: true },
  });
  assert.equal(video.group, "B");
});

test("prompt contains text preview, likes, and A/B definitions", () => {
  const prompt = buildGroupClassifierPrompt({
    textPreview: "귀여운 강아지 영상",
    likeCount: 4200,
    mediaCount: 2,
  }, { group: "B", reasons: ["high_likes"] });
  assert.match(prompt, /귀여운 강아지 영상/);
  assert.match(prompt, /4200/);
  assert.match(prompt, /바로 게시 추천/);
  assert.match(prompt, /검토 후 게시 가능/);
});

test("parse tolerates json fences and junk around the object", () => {
  const raw = '설명...\n```json\n{"group":"A","topic":"동물","reason":"귀여움"}\n```\n끝';
  assert.deepEqual(parseGroupClassification(raw), {
    group: "A",
    topic: "동물",
    reason: "귀여움",
  });
  assert.equal(parseGroupClassification("not json at all"), null);
});

test("validate rejects bad group/topic and C lift attempts", () => {
  assert.equal(validateGroupClassification({ group: "C", topic: "유머" }, { group: "B" }).ok, false);
  assert.equal(validateGroupClassification({ group: "Z", topic: "유머" }, { group: "B" }).ok, false);
  assert.equal(validateGroupClassification({ group: "A", topic: "없는토픽" }, { group: "C" }).ok, false);
  assert.equal(validateGroupClassification({ group: "A", topic: "없는토픽" }, { group: "C" }).reason, "rules_group_c");
});

test("validate blocks non-borderline B to A lift but allows A to B demotion", () => {
  const blocked = validateGroupClassification(
    { group: "A", topic: "유머", reason: "lift" },
    { group: "B", borderline: false },
  );
  assert.equal(blocked.ok, true);
  assert.equal(blocked.group, "B");
  assert.equal(blocked.topic, "유머");

  const allowed = validateGroupClassification(
    { group: "B", topic: "유머", reason: "demote" },
    { group: "A", borderline: false },
  );
  assert.equal(allowed.ok, true);
  assert.equal(allowed.group, "B");
});

test("validate uses topic fallback 기타 when missing", () => {
  const result = validateGroupClassification({ group: "B" }, { group: "B", borderline: true });
  assert.equal(result.ok, true);
  assert.equal(result.topic, "기타");
  assert.ok(DISCOVERY_TOPICS.includes(result.topic));
});
