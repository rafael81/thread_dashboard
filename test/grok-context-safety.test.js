const test = require("node:test");
const assert = require("node:assert/strict");

const { assessTerafabxGrokContextSafety } = require("../mirror_server");

function context(summary, keyPoints = ["구체적인 핵심"]) {
  return {
    summary,
    keyPoints,
    rawPreview: "grok-json",
    provider: "web-context",
  };
}

test("confirmed ordinary Grok context is eligible for comment generation", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "계란 껍질이 잘게 깨져서 속상하다는 일상 글" },
    context("계란 껍질이 잘게 부서진 일상 상황에 공감할 수 있는 문맥이다."),
  ), { ok: true, reason: null });
});

test("sensitive facts discovered only by Grok block generation", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "수사 과정이 공개되어야 한다는 내용" },
    context("경찰 수사 중 드러난 성폭력과 살인 혐의를 다루는 사건이다."),
  ), { ok: false, reason: "sensitive_grok_context" });
});

test("investment context discovered only by Grok blocks generation", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "해외 가격 차이를 설명하는 글" },
    context("본주와 ADR 가격 차이를 이용한 주식 투자 관점을 설명한다."),
  ), { ok: false, reason: "sensitive_grok_context" });
});

test("unconfirmed Grok provider fails closed", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "평범한 일상 글" },
    { ...context("평범한 일상 상황을 설명하는 충분히 긴 문맥이다."), provider: "" },
  ), { ok: false, reason: "grok_context_unconfirmed" });
});

test("Grok context that explicitly cannot verify the video scene fails closed", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "골키퍼 실수인가 수비 실수인가" },
    context("축구 실점 영상을 두고 의견을 묻지만 비디오의 정확한 장면 흐름은 직접 확인이 불가하여 추정에 기반한다."),
  ), { ok: false, reason: "grok_context_insufficient" });
});

test("harassment discovered by Grok blocks generation", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "상대에게 대화를 요구하는 글" },
    context("특정인을 공개 저격하며 욕설과 신체 비하를 이어가는 개인 갈등이다."),
  ), { ok: false, reason: "harassment_grok_context" });
});

test("body shaming described without the exact harassment label is blocked", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "카페 손님에게 재치 있게 대응한 경험담" },
    context("술 취한 손님들이 직원의 체중을 반복해서 지적하는 무례한 말을 한 상황이다."),
  ), { ok: false, reason: "harassment_grok_context" });
});

test("promotion discovered by Grok blocks generation", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "세 번째 도전을 알리는 글" },
    context("다른 계정의 새로운 도전을 소개하면서 이용자들에게 팔로우를 요청하는 홍보 게시물이다."),
  ), { ok: false, reason: "promotional_grok_context" });
});

test("a fire post stays blocked even when Grok omits the generic disaster label", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "우리 동네에서 또 화재라니 큰 피해 없이 진화됐으면 좋겠다" },
    context("동네 카페 옆에서 불이 난 상황을 걱정하며 피해가 없기를 바라는 게시물이다."),
  ), { ok: false, reason: "sensitive_grok_context" });
});

test("medical and appearance surgery context is blocked", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "현재 옆얼굴 사진을 공유한 글" },
    context("턱 변형증 수술을 앞두고 얼굴 변화와 결과를 걱정하는 의료 관련 게시물이다."),
  ), { ok: false, reason: "sensitive_grok_context" });
});

test("body-shape evaluation is blocked even without an insult", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "사진 속 사람에 대한 반응" },
    context("사진 속 인물의 볼륨 체형과 복부 라인을 근육질로 평가하는 외모 중심 게시물이다."),
  ), { ok: false, reason: "sensitive_grok_context" });
});

test("mass reply challenges are blocked as engagement farming", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "내일은 답글 500개 도전" },
    context("오늘 많은 답글을 달았고 다음 날에는 답글 500개 작성에 도전한다는 활동 공유다."),
  ), { ok: false, reason: "engagement_farming_context" });
});

test("toxic profanity in the original post is blocked", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "출퇴근이 얼마나 좃같냐면 수험생활이 그립다" },
    context("직장인의 출퇴근 피로를 강한 속어와 과장된 비교로 토로하는 게시물이다."),
  ), { ok: false, reason: "sensitive_grok_context" });
});

test("gacha and e-cigarette retail context is blocked", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "동네 가게가 연달아 폐업했다" },
    context("폐업한 자리에 가챠 가게나 전담 가게가 들어서는 상권 변화를 다룬다."),
  ), { ok: false, reason: "sensitive_grok_context" });
});

test("high-school athlete health-risk context is blocked", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "투수가 7이닝 동안 232구를 던졌다" },
    context("일본 고교 야구에서 감독이 한 투수에게 과도한 투구를 시킨 결정을 비판하는 게시물이다."),
  ), { ok: false, reason: "sensitive_grok_context" });
});

test("pregnancy and abbreviated profanity contexts are blocked", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "그 사람이 임신한 건가?" },
    context("영상 속 인물의 배를 보고 임신 여부를 추측하는 외모 관련 게시물이다."),
  ), { ok: false, reason: "sensitive_grok_context" });
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "지나가는 사람들 ㅈㄴ 무서웠겠다" },
    context("영상 장면을 보고 주변 사람들이 무서웠을 것이라 반응하는 게시물이다."),
  ), { ok: false, reason: "sensitive_grok_context" });
});

test("fraud and scam dispute context is blocked", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "메뉴판을 오독한 상황" },
    context("메뉴판 가격을 잘못 읽고 가게를 사기라고 단정한 논란을 바로잡는 게시물이다."),
  ), { ok: false, reason: "sensitive_grok_context" });
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "메뉴판 오독을 바로잡는 글" },
    context("바이럴 영상이 식당을 스캠과 바가지라고 비판한 데 반박하는 게시물이다."),
  ), { ok: false, reason: "sensitive_grok_context" });
});

test("vehicle stunt and poisonous wildlife hazards are blocked", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "슈퍼카 두 대를 뛰어넘는 영상" },
    context("고속 차량에 근접해 점프하는 위험한 스턴트로 다칠 수 있다는 반응이 많은 영상이다."),
  ), { ok: false, reason: "sensitive_grok_context" });
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "산에서 이 물건을 열면 안 된다" },
    context("음식처럼 보이지만 실제로는 독성이 강한 독거미 알집이라 사고 위험을 경고하는 게시물이다."),
  ), { ok: false, reason: "sensitive_grok_context" });
});

test("injury challenges, face-shaping advice, and family-planning fantasies are blocked", () => {
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "스포츠 대회 영상" },
    context("160kg 중량을 버티며 극심한 고통을 겪고 부상 위험을 걱정하는 챌린지 영상이다."),
  ), { ok: false, reason: "sensitive_grok_context" });
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "따라 하는 운동 방법" },
    context("인중과 팔자 주름 부작용을 피하는 중안부 축소 및 얼굴 윤곽 뷰티 운동이다."),
  ), { ok: false, reason: "sensitive_grok_context" });
  assert.deepEqual(assessTerafabxGrokContextSafety(
    { targetText: "유명인을 만나는 상상" },
    context("8살 나이 차 연애와 결혼, 자녀 출산을 상상하는 가족 시나리오다."),
  ), { ok: false, reason: "sensitive_grok_context" });
});
