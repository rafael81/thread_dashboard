// Keep source time distinct from discovery/queue time. Never use queuedAt as post time.
function postTime(target = {}) {
  for (const value of [target.createdAt, target.created_at, target.postCreatedAt]) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return { ms, source: "post_metadata" };
  }
  for (const value of [target.createdTimestamp, target.created_timestamp]) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return { ms: n < 1e12 ? n * 1000 : n, source: "post_metadata" };
  }
  const id = String(target.targetId || target.id || String(target.url || target.targetUrl || "").match(/\/status\/(\d+)/)?.[1] || "");
  if (/^\d{15,20}$/.test(id)) {
    const ms = Number((BigInt(id) >> 22n) + 1288834974657n);
    if (Number.isFinite(ms) && ms <= 8640000000000000) return { ms, source: "x_status_id" };
  }
  return { ms: null, source: "unknown" };
}

function kstStamp(ms) {
  return new Date(ms + 9 * 3600000).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " KST");
}

function commentTimeContext(target = {}, nowMs = Date.now()) {
  const { ms, source } = postTime(target);
  const known = ms !== null && ms <= nowMs + 60000;
  return {
    now: new Date(nowMs).toISOString(),
    nowKst: kstStamp(nowMs),
    postAt: ms === null ? null : new Date(ms).toISOString(),
    postKst: ms === null ? "확인 불가" : kstStamp(ms),
    source,
    known,
    ageMinutes: known ? Math.floor((nowMs - ms) / 60000) : null,
  };
}

function commentTimePromptLines(target = {}, nowMs = Date.now()) {
  const time = commentTimeContext(target, nowMs);
  return [
    `댓글 판단 현재 시각: ${time.nowKst} (Asia/Seoul).`,
    `원글 작성 시각: ${time.postKst} (근거: ${time.source}).`,
    time.known ? `작성 후 경과: ${time.ageMinutes}분. 원글의 '오늘/내일/이번 주/연휴'는 원글 작성 시점을 기준으로 읽는다.`
      : "원글 작성 시각이 없거나 현재와 모순된다. 지금도 진행 중인 상황이라고 추측하지 마라.",
    "시간 맥락: 글 작성 시점, 본문 속 사건 시점, 댓글을 다는 현재 시점을 구분한다. 오래된 글의 예정·진행형 표현을 지금의 상태로 옮기지 마라.",
    "예: 추석에 쓴 귀경 글을 연휴가 지난 뒤 읽으면 '귀경 조심하세요/연휴 잘 보내세요'는 부적절하다. 이미 지난 출근·여행·시험·행사·식사·취침도 마찬가지다.",
    "시간이 지났다고 귀가 완료·시험 결과·행사 성공 등 후속 사실을 지어내지도 마라. 근거 있는 회고 반응만 가능하며 자연스러운 반응이 없으면 댓글을 포기한다.",
    "글이 오래됐어도 명시된 미래 일정이 아직 남았다면 그 일정 기준으로 판단한다. 추석 등 매년 변하는 날짜나 작성자 위치·현지 시각을 기억만으로 확정하지 마라. 일반 경험·유머 등 시간에 무관한 내용은 글 나이만으로 탈락시키지 않는다.",
  ];
}

module.exports = { postTime, kstStamp, commentTimeContext, commentTimePromptLines };
