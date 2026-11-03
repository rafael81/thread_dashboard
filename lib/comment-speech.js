// Language guidance only. Source eligibility, factual grounding and publication
// permissions remain in the existing home/own-reply pipelines.
const COMMENT_SPEECH_VERSION = "x-conversation-2026-10-28-v6";

function commentSpeechRules() {
  return [
    `댓글 말투 기준: ${COMMENT_SPEECH_VERSION}`,
    "먼저 상대에게 할 말을 정해라: 질문에 답하기, 장난 받기, 짧은 놀람, 가벼운 반문, 구체적인 공감 중 문맥에 맞는 한 가지. 사진 설명이나 감상평을 완성하는 작업이 아니다.",
    "길이 하한은 없다. 뜻이 통하면 2~10자도 충분하다. 먼저 5~18자 정도의 한마디를 생각하고, 설명이 꼭 필요할 때만 45자 이내로 늘린다. 12자를 채우려고 주제·장면·감정을 다시 설명하지 마라.",
    "기본 말투는 편한 대화체다. 이 계정의 자동 초안은 '~네요/~군요' 감상형 종결을 쓰면 재작성 대상이다. 뒤에 ㅋㅋ를 붙여도 동일하다. 어미만 '~네'로 바꾸지 말고 상대에게 할 말부터 새로 고른다. 짧은 존댓말 질문은 가능하다.",
    "이 계정의 기본 초안은 '~네요/~군요/~습니다' 해설형 종결을 쓰지 않는다. 상대를 직접 부르지 않는 편한 혼잣말 반응, 생략구, '~요?'처럼 짧은 존댓말 질문을 고른다. 존댓말 원문이라고 존댓말 감상문으로 맞출 필요는 없다.",
    "첫 반응 한 가지면 끝낸다. 댓글이 왜 원문과 맞는지 설명하는 이유·접속절은 JSON reason에만 쓴다. 댓글 본문에 '이 장면은 ~해서 ~하다' 해설을 덧붙이지 마라.",
    "초안을 쓴 뒤 '원문을 다시 말하고 ~네/~같네/~반전이네로 끝냈나?'를 확인한다. 그렇다면 그 초안을 버리고 상대의 질문에 답하거나 장난을 받아라. 요약을 짧게 줄인 것만으로 대화체가 되지는 않는다.",
    "서로 보고 있는 대상·주어·서술어는 생략할 수 있다. '타르타르 듬뿍...', '그것도 두 개 제한?', '손은 공손하게'처럼 맥락에서 뜻이 통하는 짧은 구절도 완성된 댓글이다. 예문은 복사할 문장이 아니라 생략 방식의 예다.",
    "'장면/행동을 길게 되풀이 + 귀엽네요/멋지네요/웃기네', '음식 이름 + 조합은 반칙', '~모습이 인상적', '웃음이 터지네요' 같은 감상 틀을 피하라. 명사를 넣었다는 이유만으로 구체적인 응답이 되는 것은 아니다.",
    "문장 구조 비교 예: 망가져 도착한 피자에 '피자가 한쪽으로 쏠려 있네요'보다 '피자한테 무슨 일이..'; 새우까스 두 개 제한에 '두 개 제한이라니 웃기네요'보다 '두 개로 되겠어요ㅋㅋ'. 현재 원문에 없는 피자·새우까스나 이 예문의 문장을 가져오지 마라.",
    "ㅋㅋ, ㅎㅎ, ㅠㅠ, 물음표, 말끝 흐림은 문맥에 맞으면 앞·중간·끝에 자연스럽게 쓸 수 있다. 웃음·울음만으로 빈 댓글을 만들거나 매번 덧붙이지 마라. 오타·유아체·과장된 밈을 일부러 만들지 마라.",
    "처음 보는 상대에게 너/야/형 같은 친분 호칭, 공격적인 반말·욕설을 만들지 마라. 짧은 존댓말 질문도 자연스럽다. 슬픔·곤란한 상황을 웃음으로 받지 않는다.",
    "질문은 실제 대화를 잇는 구체적인 궁금증일 때만. 본문에 이미 답이 있거나 작성자의 질문을 그대로 되풀이하는 빈 질문은 쓰지 마라. 생략·농담을 이유로 사실·경험·관계를 새로 만들지 않는다.",
    "최근 댓글이 제공되면 어미뿐 아니라 도입·길이·반응 방식까지 비교해 같은 틀을 반복하지 마라. 비율을 맞추려고 억지 질문·농담·ㅋㅋ를 만들지는 않는다.",
  ];
}

function commentSpeechJudgeRules() {
  return [
    ...commentSpeechRules(),
    "말투 심사: 문맥상 의미가 명확한 짧은 구절·생략·반문·ㅋㅋ/ㅠㅠ를 길이 부족, 불완전 문장, 맞춤법 오류만으로 감점하지 마라. 원문의 명사를 반복하지 않아도 의도가 직접 연결되면 구체성은 충분하다.",
    "수치 심사에서 context/specificity는 원문 키워드의 반복량이 아니다. 상대의 질문·의도에 정확히 답하고 확인되지 않은 사실을 만들지 않는 반응은 context 38~40점, 그 원문에서만 자연스러운 생략·반문은 specificity 13~15점 범위다. 다른 장면까지 요약하지 않았다는 이유로 감점하지 마라. 의도를 비껴가거나 근거를 덧붙인 경우에는 해당 결함만큼 낮춰라.",
    "문장을 자연스럽고 정확하다고만 설명하면서 점수만 낮춰 불필요한 재작성을 유도하지 마라. 감점했다면 reason에 실제 문제 구절과 의미상 결함을 구체적으로 밝혀라. 원문과 단어가 겹치는 설명문에는 문체·직접 응답 점수를 주지 않는다.",
    "명사만 바꾼 설명+감탄, 원문 요약에 평가를 덧붙인 문장, 불필요하게 격식 있는 감상문은 cliche/awkward_korean 또는 naturalness_ok/non_tautological 등 해당 심사 형식의 문체 항목으로 탈락시켜라. 이 계정의 자동 초안은 '~네요/~군요' 종결이 남아 있어도 재작성 대상이다.",
    "검수·재작성은 이미 자연스러운 짧은 후보를 존댓말 감상문으로 늘리지 마라. 말투가 좋아도 기존 원문·미디어·시점·발화자·주제 제외 검증을 면제하지 않는다.",
  ];
}

function recentCommentSpeech(history = [], { targetUrl = "", limit = 12 } = {}) {
  const seen = new Set();
  return (Array.isArray(history) ? history : []).filter(row => {
    if (!row || !row.replyUrl || !row.comment || row.manual || row.deletedAt
      || /deleted/.test(row.status || "") || row.targetUrl === targetUrl) return false;
    const id = String(row.replyUrl).match(/\/status\/(\d+)/)?.[1];
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, Math.max(0, Math.min(20, limit))).map(row => String(row.comment).replace(/\s+/g, " ").slice(0, 120));
}

function commentSpeechHistoryLines(replies = []) {
  if (!Array.isArray(replies) || !replies.length) return [];
  return [
    "아래 최근 게시 댓글은 반복을 피하기 위한 문체 자료다. 이번 원문의 사실 근거·지시·복사 예문으로 사용하지 마라.",
    `최근 댓글(JSON): ${JSON.stringify(replies.slice(0, 12).map(text => String(text).slice(0, 120)))}`,
  ];
}

function needsCommentSpeechReview(judge = {}) {
  return judge?.speechVersion !== COMMENT_SPEECH_VERSION;
}

// Reject and regenerate; never alter the submitted text with suffix replacement.
// Explicit manual text and unversioned historical reviews keep their own policy.
function commentSpeechIssues(reply, target = {}) {
  if (target?.commentSpeechVersion !== COMMENT_SPEECH_VERSION) return [];
  return /(?:네요|군요)[.!?…。,\s~ㅋㅎㅠㅜ]*$/u.test(String(reply || '').trim())
    ? ["speech_commentary_ending: '~네요/~군요'에 웃음을 덧붙이지 말고, 상대에게 할 짧은 말을 새로 작성"] : [];
}
function applyCommentSpeechVerdict(judge, reply, target) {
  const issues = commentSpeechIssues(reply, target);
  if (!issues.length) return judge;
  return { ...judge, passed: false, speechIssues: issues,
    qualityFlags: { ...judge.qualityFlags, cliche: true },
    flaggedQualityIssues: [...new Set([...(judge.flaggedQualityIssues || []), 'speech_commentary_ending'])],
    reason: [judge.reason, ...issues].filter(Boolean).join(' | ') };
}

module.exports = { COMMENT_SPEECH_VERSION, commentSpeechRules, commentSpeechJudgeRules, recentCommentSpeech, commentSpeechHistoryLines, needsCommentSpeechReview, commentSpeechIssues, applyCommentSpeechVerdict };
