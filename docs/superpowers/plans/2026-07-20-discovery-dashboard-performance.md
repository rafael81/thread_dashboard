# Discovery Dashboard Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일반 discovery 화면의 대용량 자동화 payload를 제거하고, HTTP 리슨 실패 시 백그라운드 워커가 시작되지 않게 한다.

**Architecture:** 일반 뷰는 원문 이력 없이 정확한 summary·flowDays·제어 상태만 계산하고 `automation`에서만 무거운 타임라인을 반환한다. 서버 시작은 Promise 기반 리슨 게이트를 통과한 뒤에만 기존 타이머 등록 코드를 실행한다.

**Tech Stack:** Node.js CommonJS, node:test, React/Vite, agent-browser

## Global Constraints

- 일반 목록 summary와 rows 계약을 유지한다.
- 자동화 상세 화면 계약을 유지한다.
- 리슨 성공 전에는 어떤 백그라운드 작업도 시작하지 않는다.
- 기존 사용자 변경을 보존한다.

---

### Task 1: View-scoped dashboard payload

**Files:**
- Modify: `mirror_server.js`
- Test: `test/discovery-dashboard-performance.test.js`

**Interfaces:**
- Produces: `loadDiscoveryDashboardDetails(activeView, allRows, nowMs, dependencies)`, `buildAutomationDashboardOverview`, `getTerafabxDashboardOverview`
- Consumes: 기존 `buildAutomationDashboardData`, `getTerafabxAutomationStatus`, `ensureTerafabxFxTwitterAvatars`

- [x] 일반 뷰가 정확한 경량 overview만 만들고 원문 타임라인을 제외하는 실패 테스트를 작성한다.
- [x] 테스트를 실행해 현재 구현에 helper가 없어 실패하는지 확인한다.
- [x] `automation` 뷰에만 상세 데이터를 로드하는 최소 helper와 API 조립 코드를 구현한다.
- [x] 신규 테스트와 기존 dashboard 테스트를 실행한다.

### Task 2: Listen-before-workers lifecycle gate

**Files:**
- Modify: `mirror_server.js`
- Modify: `scripts/start-mirror-server.js`
- Test: `test/start-mirror-server.test.js`

**Interfaces:**
- Produces: `listenBeforeStartingBackgroundWork(httpServer, options)` Promise
- Consumes: HTTP server의 `once`, `off`, `listen`

- [x] 리슨 실패 시 worker callback 0회, 성공 시 1회를 검증하는 실패 테스트를 작성한다.
- [x] 테스트를 실행해 helper 부재로 실패하는지 확인한다.
- [x] `startServer`를 async 리슨 게이트 구조로 변경하고 통합 실행기에서 await한다.
- [x] lifecycle 회귀 테스트를 실행한다.

### Task 3: Verification and prevention record

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-discovery-dashboard-performance-design.md` if measured thresholds differ
- Runtime record: AI memory

**Interfaces:**
- Consumes: `/api/discovery/dashboard?view=discovered`, agent-browser
- Produces: 검증 로그와 재발 방지 메모

- [x] 전체 `npm test`와 `npm run build:dashboard`를 실행한다.
- [x] 서버를 안전하게 재시작하고 API 크기/TTFB를 3회 측정한다.
- [x] agent-browser로 화면 뼈대, API, JSON parse, 첫 카드 렌더를 재측정한다.
- [x] 안정 규칙과 검증 결과를 AI memory에 기록한다.
