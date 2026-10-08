# Threads 자동발굴 → 3개 후보군 분류 → 승인 그룹 자동게시 개발 계획

## 목적과 범위

`https://www.threads.com/` 타임라인에서 자동으로 발굴한 게시글을 **3개 후보군**으로
분류해 대시보드에 보여 주고, 운영자가 **후보군 단위로 승인**한 항목만 `@terafabXai`
X 계정에 자동 예약·게시한다.

지금 구현은 "발굴은 자동, 게시는 행 단위 수동"이다. 이 계획은 승인 단위를 행에서
그룹으로 올리고, 승인 이후 예약·게시·검증을 사람 개입 없이 끝내는 것이 목표다.
타인 게시글 자동댓글, 내 글 대댓글, 자동 하트는 이 파이프라인과 별개로 유지한다.

### 고정 운영 원칙

- 승인되지 않은 후보군은 어떤 경우에도 X에 게시·초안 저장·예약되지 않는다.
- 승인은 **승인 시점의 행 스냅샷**에만 적용된다. 승인 뒤 새로 발굴된 행은 다음 승인
  회차에 다시 검토한다. (그룹별 "상시 승인"은 4단계에서 명시적 토글로만 켠다.)
- 분류기 실패(Gemini 타임아웃, 파싱 실패, 원문 재추출 실패)는 항상 **C 그룹(보류)**
  으로 귀결된다. 실패를 A/B로 승격하지 않는다.
- 미디어가 한 번이라도 확인된 행은 이후 추출 0건으로 낮추지 않고 fail-closed 한다.
  (기존 규칙 유지)
- 게시 전 `mirror-history.json` 중복 확인, `@terafabXai` 로그인 확인, 최대 4개 미디어,
  KST 01–07 quiet hours, 일일 게시 상한을 모두 통과해야 한다.
- 실제 X 조작은 기존 경로(`postDiscoveryRowToX` → `mirrorThread`)만 사용한다.
  새 게시 코드를 만들지 않는다.

## 현재 구조 요약 (재사용 대상)

| 단계 | 현재 구현 | 위치 |
| --- | --- | --- |
| 스캔 타이머 (5분) | `runDiscoveryScan` → `discoverThreadsTimeline` | `mirror_server.js:17374`, `:17210` |
| 저장 (`review`) | `saveDiscoveryCandidates` → SQLite `.data/thread-discovery.db` | `:18984` |
| 점수 | `assessDiscoveryCandidate`(viralScore), `assessTerafabxDiscoveryStyle`(style score) | `:16592`, `:16627` |
| 스타일 자동예약 | `queueAutoDiscoveredStyleCandidates` (style pass → 자동예약, 스캔당 1건) | `:23800` |
| 예약 슬롯 계산 | `nextAutoScheduleTime` / `reserveNextAutoScheduleTime` (40분 간격, 5분 단위 랜덤, quiet hours) | `:18725`, `:18759` |
| 예약 처리 | `processDiscoveryAutoScheduleJob` → `runDiscoveryAutoSchedule` (`local_post` / `x_native`) | `:23197` |
| 로컬 예약 발송 (15초) | `maybeDispatchLocalScheduledPosts` → `fulfillLocalScheduledDiscoveryPost` | `:23332`, `:23294` |
| Gemini Web 호출 | `runTerafabxGeminiScript` + `ensureTerafabxGeminiHeadlessBrowser` (제목 다듬기에서 사용) | `:20340` |
| 설정 | `discovery-settings.json` (`autoDiscoveryEnabled`, `autoStyleScheduleEnabled`, `scheduleDeliveryMode`) | `:509-602` |
| 대시보드 | `dashboard/src/main.jsx`, `components/data-table.tsx` (발굴됨/게시예정/게시됨 탭) | |

`autoStyleScheduleEnabled`는 이미 "점수 통과 → 자동예약"을 한다. 이번 계획은 이 경로를
**분류 → 그룹 승인 → 예약**으로 일반화하고, 기존 스타일 자동예약은 승인 없는 자동게시
경로이므로 새 파이프라인 도입 후 제거(또는 A그룹 상시 승인으로 흡수)한다.

## 목표 아키텍처

```text
[5분 타이머] runDiscoveryScan (threads.com 타임라인, 1000+ 좋아요, 미디어 확인)
        |
        v
 saveDiscoveryCandidates  → status=review, criteria(viralScore, terafabxStyle)
        |
        v
 [분류기] classifyDiscoveryCandidateGroup
   1) 결정적 규칙 (기존 점수 + 제외 패턴)  → 즉시 A/B/C 가안
   2) Gemini Web 보조 판정 (선택, 실패 시 C 유지) → topic 라벨, 경계 사례 재판정
        |
        v
 candidate_group ∈ {A, B, C} + criteria.candidateGroup {score, reasons, topic, classifiedAt, version}
        |
        v
 [대시보드 /discovery] 3개 그룹 탭 + 건수 + "이 그룹 승인(N건)" / 행 단위 제외
        |
        v
 POST /api/discovery/approve-group {group, canonicalUrls, batchId}
   → status=approved, approval_batch_id, approved_at
        |
        v
 [승인 소비자] drainApprovedDiscoveryRows (1분 타이머 + 승인 직후 1회)
   - 일일 상한·시간 간격·quiet hours 확인
   - reserveNextAutoScheduleTime → processDiscoveryAutoScheduleJob (기존 경로)
   - scheduleDeliveryMode(local_post / x_native / ab) 그대로 적용
        |
        v
 scheduled → [15초 타이머] maybeDispatchLocalScheduledPosts → postDiscoveryRowToX → posted
        |
        v
 mirror-history.json 기록, 미디어 스냅샷 정리, 작업 탭 닫기
```

## 3개 후보군 정의

후보군은 "무엇을 게시할지"를 고르는 기준이므로 **주제**가 아니라 **게시 적합도**로
나눈다. 주제(`topic`)는 보조 라벨로만 붙여 그룹 안에서 필터링에 쓴다.

| 그룹 | 이름 | 기준 (결정적) | 기본 동작 |
| --- | --- | --- | --- |
| **A** | 바로 게시 추천 | `terafabxStyle.pass === true` **그리고** `score >= 8`, 한국어 훅, 강한 미디어, 제외 주제 없음, 좋아요 ≥ 2000 | 승인 시 우선 예약 |
| **B** | 화제성 우선 · 검토 권장 | A 미달이지만 좋아요 ≥ 3000 **또는** `viralScore >= 2`, 제외 주제 없음, 텍스트가 짧거나 비한국어여도 미디어만으로 전달 가능 | 승인 시 A 다음 순서로 예약 |
| **C** | 보류 | 제외 주제(정치·혐오·의학·투자·광고 등) 감지, `longInfoPost`, 미디어 약함, 분류기 실패, 원문 재추출 실패, 이미 게시된 URL | 승인 불가(개별 행을 B로 수동 승격만 허용) |

Gemini 보조 판정은 다음 두 곳에서만 쓴다.

1. A/B 경계(`score` 6–7) 행을 A로 올릴지 B에 둘지 결정.
2. `topic` 라벨(예: `동물`, `유머`, `일상공감`, `스포츠`, `기타`) 부여.

Gemini 출력은 `lib/discovery-group-classifier.js`의 `parseGroupClassification` /
`validateGroupClassification`으로 JSON 스키마·허용값을 검사하고, 실패하면 결정적
결과를 유지한다. Gemini는 결정적 규칙이 C로 판정한 행을 A/B로 바꿀 수 없다.

## 단계별 개발 계획

### 0. 데이터 계약과 상태 고정

1. `thread_discoveries`에 컬럼 추가: `candidate_group TEXT`, `approval_batch_id TEXT`,
   `approved_at TEXT`, `group_classified_at TEXT`. `getDiscoveryDb`의 기존 마이그레이션
   패턴(`schedule_delivery` 추가 방식, `:18951`)을 따른다.
2. 새 상태 `approved` 추가. 전이 규칙:
   - `review → approved` (승인), `approved → review` (승인 취소, 슬롯 미예약 시만)
   - `approved → queued_schedule → scheduling → scheduled → posted` (기존 경로)
   - `approved → failed_schedule` (기존 실패 처리, attempts 증가)
   - `review/approved → skipped` (행 단위 제외)
3. `criteria.candidateGroup` JSON: `{ group, score, reasons[], topic, classifier:
   "rules" | "rules+gemini", version, classifiedAt }`. 재분류 시 이전 결과는
   `criteria.candidateGroupHistory[]`에 최대 3개 보존한다.
4. 대시보드 "발굴됨" 상태 목록(`getDiscoveryDashboardData`)과 `listDiscoveryRows`,
   `dashboardDiscoveryRow`, 미디어 스냅샷 TTL 정리에 `approved`를 포함한다.
5. `discovery-settings.json` 확장:
   ```json
   {
     "groupApproval": {
       "enabled": true,
       "dailyPostCap": 8,
       "minIntervalMs": 2400000,
       "standingApprovedGroups": [],
       "geminiAssistEnabled": true
     }
   }
   ```
   기존 `autoStyleScheduleEnabled`는 마이그레이션 시 `false`로 강제하고 UI에서 숨긴다.

완료 조건: 서버 재시작 후 `approved` 행과 배치 ID가 그대로 복원되고, `approved`
행이 어떤 기존 타이머(스타일 자동예약, due-post)에도 잡히지 않는다.

### 1. 분류기 구현

1. `lib/discovery-group-classifier.js` (순수 함수, 테스트 가능):
   - `classifyDiscoveryGroupByRules({ likeCount, mediaCount, criteria, textPreview })`
     → `{ group, score, reasons }`. 기존 `terafabxStyle`/`viralScore` 결과만 입력으로
     받아 재계산하지 않는다.
   - `buildGroupClassifierPrompt(row, rulesResult)` → Gemini 프롬프트(JSON only).
   - `parseGroupClassification(raw)`, `validateGroupClassification(parsed, rulesResult)`
     → 허용 그룹/토픽만 통과, C→A/B 승격 금지.
2. `mirror_server.js`:
   - `classifyDiscoveryCandidateGroup(canonicalUrl, options)`: 규칙 판정 → DB 갱신 →
     경계 사례이고 `geminiAssistEnabled`면 `refineDiscoveryTitleOnce`와 같은 방식으로
     `runTerafabxGeminiScript` 호출(별도 profileDir `-group-classify-1`, 우선순위 `low`).
   - `saveDiscoveryCandidates` 직후 새로 삽입/갱신된 `review` 행에 대해 큐잉.
     기존 `queueDiscoveryTitleRefine`과 같은 in-process 큐 패턴 사용, 동시 1개.
   - 수동 재분류 API `POST /api/discovery/reclassify { canonicalUrls[] }`.
   - 마이그레이션 시 기존 `review` 행 일괄 분류(배치 50건, 규칙만).
3. 분류 결과는 `logEvent("discovery_group_classified", …)`로 남기고, 그룹 분포는
   `/api/discovery/status`에 포함한다.

완료 조건: 같은 입력에 같은 그룹이 나오고(결정적), Gemini 실패/파싱 실패/타임아웃이
모두 규칙 결과 유지 + `reasons`에 `gemini_unavailable`로 기록된다.

### 2. 대시보드 후보군 화면과 승인 API

1. `data-table.tsx` 발굴됨 뷰에 그룹 서브탭 `A 추천 (n)` / `B 검토 (n)` / `C 보류 (n)`
   추가. `?view=discovered&group=A` URL 상태 유지. 각 행 카드에 그룹 배지·`topic`·
   `reasons` 요약(접힘)을 표시한다.
2. 그룹 헤더 액션:
   - **이 그룹 승인 (N건)**: 현재 화면에 보이는 `review` 행 스냅샷 URL 목록을 보내
     `POST /api/discovery/approve-group { group, canonicalUrls }`. 서버는 요청 URL이
     실제로 해당 그룹·`review` 상태인지 다시 확인하고 불일치 행은 결과에 `rejected`로
     돌려준다.
   - **승인 취소**: `POST /api/discovery/unapprove { canonicalUrls }` — `approved`이고
     아직 `queued_schedule`로 넘어가지 않은 행만 `review`로 되돌린다.
   - 행 단위 **제외**(기존 discard), **B로 승격/C로 내리기**(`POST /api/discovery/
     set-group { canonicalUrl, group, reason: "manual" }`; 수동 지정은 재분류 시 덮어쓰지
     않음).
3. 승인 배치 요약 카드: 배치 ID, 승인 시각(KST), 건수, 예약 완료/게시 완료/실패 수,
   다음 예약 슬롯. `GET /api/discovery/approval-batches?limit=10`.
4. 설정 패널: `groupApproval.enabled` 토글, 일일 상한, 최소 간격, Gemini 보조 토글.
   기존 `자동 발굴`, `예약 전달 모드`는 유지, `스타일 자동예약`은 제거.
5. 레거시 HTML 대시보드(`mirror_server.js` ~`:20557`)는 그룹 배지와 승인 버튼만
   최소 추가하거나, React 대시보드로 리다이렉트한다(결정: React만 지원, 레거시는 읽기 전용).

완료 조건: 승인 버튼 한 번으로 스냅샷 행이 `approved`가 되고, 승인 후 들어온 신규
행은 여전히 `review`로 남는다.

### 3. 승인 행 → 자동 예약·게시 소비자

1. `drainApprovedDiscoveryRows()`:
   - `groupApproval.enabled`가 아니면 no-op.
   - `approved` 행을 `approved_at ASC, group(A 먼저), score DESC` 순으로 조회.
   - 일일 상한(KST 날짜 기준, `posted`+`scheduled` 합산), `minIntervalMs`,
     `nextAutoScheduleTime`의 quiet hours, `DISCOVERY_AUTO_STYLE_MAX_FUTURE_HOURS`
     (18시간) 지평선을 확인. 초과분은 `approved`로 두고 다음 틱에 처리한다.
   - 통과 행은 `markDiscoveryScheduleQueueState(url, "queued_schedule")` 후
     `enqueueDiscoveryAutoScheduleJob(url, "group_approval:<batchId>", …)`로 기존
     `processDiscoveryAutoScheduleJob`에 넘긴다. 한 틱에 최대 3건.
2. 타이머: 1분 간격 `setInterval` + `approve-group` 성공 직후 즉시 1회 실행.
   재진입 방지 플래그를 두고, 서버 시작 시 `recoverRecentDiscoveryPlaceholders`와
   같은 위치에서 `approved`/`queued_schedule` 잔여 행을 재큐잉한다.
3. 실패 처리는 기존 규칙 재사용:
   - 컨텐츠 제약(삭제/비공개/미디어 0건)은 `failed_schedule` + 재시도 없음.
   - X UI/로그인/네트워크 오류는 attempts < 3까지 `approved`로 되돌려 재시도, 이후
     `failed_schedule`. 실패 사유는 배치 요약에 집계된다.
4. `local_post` 발송(`maybeDispatchLocalScheduledPosts`)과 `x_native` 예약은 그대로
   사용한다. 게시 성공 시 `recordCompletedMirror`, 스냅샷 정리, 탭 닫기까지 기존 경로.
5. `approve-group` 요청 및 소비자에서 `findCompletedMirror` 중복을 다시 확인한다.

완료 조건: 승인 → 예약 → 게시가 사람 개입 없이 끝나고, 상한·간격·quiet hours를 넘는
행은 절대 예약되지 않으며, 같은 URL이 두 번 게시되지 않는다.

### 4. 운영 제어와 안전장치

1. 전역 정지: `groupApproval.enabled=false`는 새 예약만 막고 이미 `scheduled`인 행은
   유지한다(기존 예약 취소 UI로 별도 취소).
2. 그룹 상시 승인(`standingApprovedGroups`): 켜면 해당 그룹으로 분류되는 신규 행이
   자동으로 `approved`가 된다. 기본 비활성. 켜기 전 최소 3회 스냅샷 승인 회차를
   운영자가 직접 검토한 뒤 활성화하도록 UI에 안내 문구를 둔다. A그룹만 허용한다.
3. 예산 지표: 일일 게시 수 / 상한, 그룹별 승인률(승인 / 분류), 그룹별 게시 후 삭제·
   취소율, Gemini 보조 성공률, 예약 실패 사유 분포를 `/api/discovery/status`와
   요약 카드에 노출한다.
4. AGENTS.md의 "Do not auto-post discovered items" 규칙을 "승인된 후보군 배치만
   자동 예약·게시한다"로 갱신하고, 그룹 정의·상한 기본값을 기록한다.
5. 로그 이벤트: `discovery_group_classified`, `discovery_group_approved`,
   `discovery_group_unapproved`, `discovery_group_drain`, `discovery_group_post_failed`.

완료 조건: 운영자가 대시보드만 보고 "어느 그룹에 몇 건이 있고, 승인한 것 중 무엇이
언제 나가는지, 왜 아직 안 나갔는지"를 알 수 있다.

### 5. 검증과 점진 롤아웃

1. 단위 테스트 (`node --test`, `test/discovery-group-*.test.js`):
   - 규칙 분류의 경계값(score 6/7/8, 좋아요 1999/2000/2999/3000, 제외 패턴).
   - Gemini 응답 파싱·검증: 잘못된 JSON, 허용 외 그룹, C→A 승격 시도 거부.
   - 승인 스냅샷: 요청 URL 중 그룹/상태 불일치 행 거부, 승인 후 신규 행 미포함.
   - 소비자: 일일 상한, 최소 간격, quiet hours, 한 틱 3건 제한, 중복 URL 차단,
     `enabled=false` no-op, 재시작 후 `approved` 재큐잉.
   - 소스 와이어링 검사(기존 관례): 스캔 뒤 분류 큐잉, 승인 후 drain 즉시 호출,
     `autoStyleScheduleEnabled` 경로 제거 확인.
2. 통합(로컬): `scheduleDeliveryMode=local_post`로 승인 → `scheduled` → 15초 발송기
   호출까지 DB 상태 전이를 확인한다(실제 X 게시는 이 단계에서 막고 상태만 검증).
3. 실제 E2E (AGENTS.md 규칙):
   - 9224 Chrome에서 `@terafabXai` 로그인 확인.
   - 수동 스캔 1회 → A그룹 1건 승인 → `x_native` 모드에서 실제 X compose·일시 선택·
     예약 확인·서버 로그 확인. `local_post` 모드에서 due 시각 도달 → 실제 게시 →
     `mirror-history.json` 기록·탭 정리 확인.
   - 실제 게시 승인이 없는 환경이면 `x_native` 예약 직전까지만 수행하고 "E2E 미검증"
     으로 명시한다.
4. 롤아웃:
   - `shadow`: 분류만 켜고 승인 UI 비활성. 3일간 그룹 분포와 오분류를 수동 검토.
   - `manual batch`: 스냅샷 승인만 허용, 일일 상한 4.
   - `steady`: 일일 상한 8, A그룹 상시 승인은 운영자 판단으로 별도 활성화.

## 테스트 매트릭스

| 위험 | 자동 검증 | 운영 검증 |
| --- | --- | --- |
| 승인 없는 게시 | `approved` 없는 행은 drain에서 제외, 스타일 자동예약 경로 제거 | 승인 배치 ID 없는 `scheduled` 0건 |
| 오분류로 민감 주제 게시 | 제외 패턴 → C 고정, Gemini C→A 승격 거부 | shadow 기간 그룹별 표본 검토 |
| 같은 글 재게시 | `findCompletedMirror` 두 번 확인, URL idempotency | `mirror-history.json` 대조 |
| 과다 게시 | 일일 상한·최소 간격·quiet hours 테스트 | 일일 게시 수 카드 |
| 승인 뒤 원문 변경/삭제 | 예약 직전 재추출 fail-closed, 컨텐츠 제약은 재시도 없음 | 실패 사유 분포 |
| 재시작 유실 | `approved`/`queued_schedule` 재큐잉 테스트 | 재시작 후 배치 요약 일치 |
| Gemini 장애 | 규칙 결과 유지 + `gemini_unavailable` | Gemini 보조 성공률 |

## 주요 결정 사항 (변경 시 운영자 확인 필요)

- 후보군은 **게시 적합도 A/B/C**로 나누고 주제는 보조 라벨이다. 주제별 3그룹으로 바꾸려면
  1단계 규칙 함수만 교체하면 되도록 분류기를 분리한다.
- 승인은 **스냅샷 단위**가 기본이고, 상시 승인은 A그룹 한정 옵트인이다.
- 게시 경로는 기존 `processDiscoveryAutoScheduleJob` / `postDiscoveryRowToX`를 그대로
  쓰고, `scheduleDeliveryMode`도 기존 설정을 따른다.
- 기존 `autoStyleScheduleEnabled`(승인 없는 자동예약)는 제거한다.

## 최종 완료 기준

- threads.com 자동 스캔 → 3그룹 분류 → 대시보드 표시가 5분 주기로 사람 개입 없이 돈다.
- 승인한 그룹 스냅샷의 행만 예약·게시되고, 승인 없는 행·C그룹·중복 URL은 X에 도달할 수 없다.
- 일일 상한·간격·quiet hours가 테스트와 실제 상태 모두에서 지켜진다.
- 자동 테스트가 통과하고, `x_native` 예약과 `local_post` 실제 게시 각각 1건 이상 E2E가
  로그·`mirror-history.json`·탭 정리까지 확인된다.
