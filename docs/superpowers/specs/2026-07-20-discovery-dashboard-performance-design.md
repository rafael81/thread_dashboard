# Discovery Dashboard Performance Design

## Goal

`발굴됨`, `게시예정`, `게시됨` 화면이 자동화 이력과 외부 실적 데이터를 기다리지 않고 목록 데이터만 받아 빠르게 표시되도록 한다. 동시에 3131 포트 리슨 실패 프로세스가 백그라운드 워커를 실행하지 못하게 한다.

## Architecture

- 일반 목록 뷰는 discovery 행과 상태별 개수에 더해 화면 하단 제어 패널에 필요한 정확한 자동화 요약·30일 집계·경량 TerafabX 상태만 반환한다.
- 일반 목록 뷰에서는 댓글 원문 타임라인, 검수 원문 배열, pending 원문과 모니터 전체 이력을 반환하지 않는다.
- `automation` 뷰에서만 TerafabX 상태, 자동댓글 타임라인, 하트 타임라인, 검수 큐와 avatar enrichment를 계산한다.
- 쿠팡 실적은 기존 전용 `/api/coupang/performance` 경로에서만 조회한다.
- 서버 시작은 HTTP 리슨 성공을 먼저 기다린다. 성공 콜백 이후에만 startup timeout과 반복 interval을 등록한다.
- 리슨 실패는 호출자에게 reject되어 통합 실행기가 종료 코드 1로 끝난다.

## Compatibility

- 일반 목록에 필요한 `summary.discoveredCount`, `scheduledCount`, `postedCount`, 실패 건수와 자동 발굴 설정은 유지한다.
- 일반 목록의 기존 자동화 패널은 정확한 댓글·하트·품질 수치와 ON/OFF 상태를 유지한다.
- `automation` 뷰의 기존 상세 응답 구조는 유지한다.

## Error Handling

- 자동화 상세 로딩 실패는 기존 개별 오류 처리 방식을 유지한다.
- HTTP 리슨 오류는 `server_listen_error`로 기록하고 서버 시작 Promise를 reject한다.
- 백그라운드 작업은 리슨 성공 전에는 등록되지 않는다.

## Tests

- 일반 뷰에서 자동화·TerafabX·쿠팡 로더가 호출되지 않는 회귀 테스트.
- 자동화 뷰에서 필요한 로더만 호출되고 기존 상세 필드가 반환되는 회귀 테스트.
- 리슨 실패 시 백그라운드 시작 콜백이 호출되지 않는 회귀 테스트.
- 리슨 성공 시 백그라운드 시작 콜백이 정확히 한 번 호출되는 회귀 테스트.
- 전체 Node 테스트, dashboard build, 실제 3131 API payload 및 agent-browser 단계별 로딩 실측.

## Success Criteria

- 일반 `discovered` 응답에서 `commentTimeline`, 댓글/모니터 이력 및 `coupang` 상세가 제외된다.
- 일반 응답 크기가 기존 약 10.66MB에서 1MB 미만으로 감소한다.
- 서버 리슨 실패 프로세스가 자동화 타이머나 Grok 워커를 시작하지 않는다.
- 기존 테스트와 신규 회귀 테스트가 통과한다.

## Verified Result

- 일반 `discovered` 응답: 10.66MB에서 약 327KB로 감소(약 97%).
- 정확도: 일반 화면도 자동화 상세 화면과 동일하게 댓글 2,000건, 하트 18건, 품질 A를 표시한다.
- agent-browser 최종 새 세션: HTML TTFB 9.6ms, first paint 164ms, FCP 312ms, API 427.6ms, navigation 이후 API 완료 576.7ms, 첫 페이지 12행 렌더 확인.
- 안정화된 서버의 직접 API 반복 측정은 TTFB 0.323~0.480초였다. 서버 재시작 직후 백그라운드 startup 작업과 겹치면 일시적으로 더 지연될 수 있으므로 payload 크기와 서버 대기 시간을 분리해 관측한다.
- 중복 서버 실행: `EADDRINUSE` 후 약 0.01초에 exit 1, 백그라운드 worker 미시작.
- Node 테스트 255개 통과, Vite production build 통과.
