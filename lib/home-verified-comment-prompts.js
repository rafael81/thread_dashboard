/**
 * 홈 타임라인 · 파란체크 · 원글 자동댓글 전용 프롬프트.
 * 내 글 대댓글(own-post-reply) 프롬프트와 문자열·규칙을 공유하지 않는다.
 * "부모 원글 / 답글 대상 댓글" 대댓글 프레임을 쓰지 않는다.
 *
 * 초안 품질은 LLM+프롬프트만 (결정적 trim/polish 없음).
 */

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function homeVerifiedQualityRules() {
  return [
    "톤: @terafabXai(과즙루피) 실제 X 대화체. 짧고 담백한 맞장구. 뉴스 요약·기자 톤·보도 문장 금지.",
    "길이: 한국어 한 줄 8~45자, 반드시 선호 12~30자. 30자를 넘기지 마라. 늘리기보다 한 포인트만.",
    "톤 상한: 조롱·과격 비난·징그럽다/지독하다/미쳤다 류 과장은 쓰지 마라. 담백 공감·가벼운 맞장구만.",
    "원문의 구체 장면·행동·감정 한 가지에만 자연스럽게 반응. 제목 읽기/정보 전달형 금지.",
    "reply에 고유 명사·브랜드·메뉴명을 일부러 끼워 넣지 마라. 원문 따라 읽기·키워드 박제 금지.",
    "인사·시간대 템플릿 금지(다른 글에도 붙일 수 있음): 좋은 아침, 잘 자, 굿나잇, 푹 쉬, 주말 고생, 한 주의 시작, 월요일, 좋은 하루 보내세요, 오늘도 잘 부탁.",
    "문장 시작을 습관적으로 '진짜'로 시작하지 마라. 가능하면 '진짜' 없이 써라. '진짜'를 두 번 이상 쓰지 마라.",
    "상투 표현 금지: 마음이 훈훈해지네요, 작성자님, 응원합니다, 인상적이네요, 대박, 와 진짜, 눈에 띄네요, 전해졌군요, 포함됐군요.",
    "원문에 없는 사실·감정·경험·색·장면·브랜드 변형을 만들지 마라. 미디어를 못 보면 장면을 지어내지 마라.",
    "의료·약·세금·전세·정치·투자 조언 원글에는 '정리 발언·해설 톤' 댓글을 쓰지 마라. 그런 글이면 무리한 맞장구 대신 매우 짧게 피하거나 일반 감정만.",
    "광고·상담·기사 문체, 해시태그, 링크, 이모지, 조롱, 단정 비난을 쓰지 마라.",
    "폭력·성·도박·정치·투자 조언 표현을 쓰지 마라.",
    "다른 글에도 붙일 수 있는 범용 감탄·인사·굿나잇 템플릿을 쓰지 마라. cross-post reusable이면 실패다.",
  ];
}

/** 원글 1건 문맥 블록 — 대댓글 규칙 없음 */
function homeVerifiedPromptContextLines(target = {}) {
  const url = clean(target.url || target.targetUrl || "");
  const text = clean(target.targetText || target.text || "");
  const author = clean(target.authorHandle || "").replace(/^@/, "");
  const explicitMedia = Number(target.mediaCount || 0);
  const derivedMedia = Math.max(0, Number(target.imageCount || 0) + Number(target.videoCount || 0));
  const mediaCount = explicitMedia > 0 ? explicitMedia : derivedMedia;
  return [
    "대상 유형: 홈 타임라인의 타인 원글(답글·RT·인용 아님). 대댓글이 아니다.",
    "이 원글 자체에 다는 짧은 공개 댓글을 만든다. 부모글-댓글 대화로 해석하지 마라.",
    url ? `원글 URL: ${url}` : null,
    author ? `원글 작성자: @${author}` : null,
    text ? `원글 본문: ${text.slice(0, 1800)}` : "원글 본문: (텍스트 약함 — 미디어/메타 위주)",
    mediaCount > 0 ? `첨부 미디어 수(참고): ${mediaCount}` : null,
    mediaCount > 0 ? "미디어가 있으면 본문에 확인되는 범위에서만 반응하고, 안 보이면 추측 장면을 쓰지 마라. 색·브랜드 변형 추정 금지." : null,
  ].filter(Boolean);
}

function homeVerifiedGrokContextPrompt(target = {}, extraRule = "", requestId = "hvc-req") {
  return [
    "역할: X 계정 @terafabXai(과즙루피)의 홈 타임라인 원글 공개 댓글 문맥 분석 + 초안 작성기.",
    "입력은 항상 '타인 개인 계정 원글 1건'이다. 내 글 아래 대댓글이 아니고, 기관/언론 기사 요약 댓글도 아니다.",
    "기본 모드는 원글 본문 텍스트-only다. URL을 열거나 미디어를 본 것처럼 쓰지 마라.",
    "한 번의 응답으로 문맥 분석과 공개 댓글 초안을 끝낸다. 추가 질문·추가 호출을 요구하지 마라.",
    "context_summary: 원글 주제·톤·안전하게 맞장구칠 포인트를 1~2문장.",
    "key_points: 관찰 포인트 2~4개. 주제·톤·맞장구 포인트 위주.",
    "reply: 자연스러운 한국어 한 줄, 12~30자 권장(최대 30 목표, 절대 45 초과 금지). 친구 타임라인 짧은 맞장구. 키워드 나열 금지.",
    "뉴스 헤드라인 따라 읽기·사실 재진술·'보도됐네요/포함됐군요/전해졌군요' 같은 보도 반응 금지.",
    "확신 없으면 context_summary에 추정이라고 쓰고 reply에는 단정하지 마라.",
    ...homeVerifiedQualityRules(),
    `request_id는 반드시 "${requestId}"로 그대로 써라.`,
    `반드시 JSON 한 줄만 출력: {"request_id":"${requestId}","context_summary":"...","key_points":["..."],"reply":"..."}`,
    extraRule,
    "",
    ...homeVerifiedPromptContextLines(target),
  ].filter(Boolean).join("\n");
}

function homeVerifiedGeminiReviewPrompt(target = {}, grokInput = {}, qualityFeedback = null) {
  const reply = clean(grokInput.reply || grokInput.comment || "");
  const summary = clean(grokInput.contextSummary || grokInput.context_summary || grokInput.summary || "");
  const keyPoints = Array.isArray(grokInput.keyPoints || grokInput.key_points)
    ? (grokInput.keyPoints || grokInput.key_points)
    : [];
  const points = keyPoints.length
    ? keyPoints.map((item) => `- ${clean(item)}`).join("\n")
    : "- 제공 없음";
  return [
    "역할: @terafabXai(과즙루피) 홈 원글 자동댓글 검수·재작성자. 대댓글 검수가 아니다.",
    "원글 본문 + 문맥 분석 + 후보 댓글을 보고, 공개해도 되는 최고 품질 한 줄 댓글만 반환한다.",
    "문맥 분석과 원문이 충돌하면 원글을 우선한다.",
    "후보가 과즙루피 대화체 맞장구로 충분하면 keep.",
    "다음이면 반드시 rewrite: 인사/굿나잇/주말 템플릿, 습관적 '진짜' 시작, cross-post 가능 범용문, 뉴스·보도 톤, 환각, 과격 톤, 의료·세금·정치 정리 발언.",
    "rewrite 때도 기사 문장·정보 전달체가 아니라 짧은 구어 맞장구로 쓴다. 그래도 안 되면 원문 한 포인트만 짧게.",
    "규칙: 한국어 한 줄, 12~30자 권장(최대 30 목표, 45 초과 금지). 조롱·과격 비난 톤 금지.",
    ...homeVerifiedQualityRules(),
    "점수는 매기지 않는다. decision과 final_reply만.",
    'JSON 한 줄: {"final_reply":"댓글","decision":"keep|rewrite","reason":"짧은 이유"}',
    "",
    ...homeVerifiedPromptContextLines(target),
    `문맥 요약: ${summary || "제공 없음"}`,
    `문맥 포인트:\n${points}`,
    `후보 댓글: ${reply}`,
    qualityFeedback ? `직전 심사 탈락 사유: ${clean(qualityFeedback)}` : null,
  ].filter(Boolean).join("\n");
}

function homeVerifiedFinalJudgePrompt(target = {}, grokInput = {}, finalReply = "") {
  const summary = clean(grokInput.contextSummary || grokInput.context_summary || grokInput.summary || "");
  return [
    "역할: 홈 타임라인 원글 자동댓글 독립 최종 심사자. 댓글을 고치거나 다시 쓰지 말고 평가만 한다.",
    "대댓글(부모글+대상댓글) 심사가 아니다. 타인 원글 1건에 대한 공개 댓글만 본다.",
    "항목별 정수 점수(필수): context 0~40, naturalness 0~25, specificity 0~15, concision 0~10, non_ai_style 0~10.",
    "context 최우선. 원글 장면과 맞으면 높게, 어긋나면 context를 낮춘다.",
    "원문에 없는 사실·경험·수치·색 확장, 범용 덕담, 번역체, 상담체, 광고체는 감점/플래그.",
    "다음이면 cross_post_reusable=true 필수: 좋은 아침/잘 자/굿나잇/푹 쉬/주말 고생/한 주의 시작/벌써 하루가 시작/월요일 인사만 하는 댓글, 다른 글에도 그대로 붙일 수 있는 안부.",
    "다음이면 context_error 또는 unsupported_claim=true: 외국어·링크만 있는 글에 대한 추측 반응, 원문에 없는 미디어 색·장면.",
    "다음이면 context를 크게 깎고 위험: 의료·약 부작용, 세금·전세, 정치 논쟁에 대한 '정리 발언·해설 톤' 댓글.",
    "boolean 플래그(모두 필수): fatal_error, language_error, awkward_korean, translation_tone, cliche, context_error, unsupported_claim, semantic_role_error, direct_response_error, logical_leap_error, cross_post_reusable, headline_tone, specificity_error.",
    "source_anchor: 원글에 실제로 있는 구절(없으면 짧은 요지). reason: 짧은 한국어 이유.",
    "cross_post_reusable=true 이거나 context_error=true 이거나 unsupported_claim=true 이면 고득점이어도 실질 탈락 취지다. reason에 명시.",
    "반드시 JSON 한 줄만 출력. 예시 키를 빠짐없이 포함:",
    '{"context":0,"naturalness":0,"specificity":0,"concision":0,"non_ai_style":0,"fatal_error":false,"language_error":false,"awkward_korean":false,"translation_tone":false,"cliche":false,"context_error":false,"unsupported_claim":false,"semantic_role_error":false,"direct_response_error":false,"logical_leap_error":false,"cross_post_reusable":false,"headline_tone":false,"specificity_error":false,"source_anchor":"원글 구절","reason":"짧은 이유"}',
    "",
    ...homeVerifiedPromptContextLines(target),
    `문맥 요약: ${summary || "제공 없음"}`,
    `심사 대상 댓글: ${clean(finalReply)}`,
  ].filter(Boolean).join("\n");
}

module.exports = {
  homeVerifiedQualityRules,
  homeVerifiedPromptContextLines,
  homeVerifiedGrokContextPrompt,
  homeVerifiedGeminiReviewPrompt,
  homeVerifiedFinalJudgePrompt,
};
