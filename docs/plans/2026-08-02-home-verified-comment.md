# 홈 타임라인 인증 계정 자동댓글

## 격리

- 개발 위치: `/Users/macmini/project/thread_dashboard-home-verified-comment`
- 브랜치: `feature/home-verified-comment`
- 운영 위치: `/Users/macmini/project/thread_dashboard` (`main`, 포트 3131 등) — **여기 코드/프로세스에 손대지 않음**

실행·포트 규칙은 `docs/DEV_ISOLATION.md` 참고.

## 목적

내 글 대댓글(own-post-reply) 파이프라인을 **구조 클론**하고, 입력만 다음으로 바꾼다.

| 항목 | 값 |
| --- | --- |
| 대상 타임라인 | X 홈 (`https://x.com/home`) |
| 게시 유형 | **원글만** (답글·RT 제외; 인용은 원글로 보지 않음) |
| 작성자 | **파란 체크(verified)만** |
| LLM | **1단계 기본: Gemini headless text-only** (문맥+초안). Grok web/cli는 `TERAFABX_HOME_VERIFIED_CONTEXT_PROVIDER=web|cli` 폴백 |
| 검수/게시 | stage1 초안 우선 유지 → Gemini **judge만** (통과 시 rewrite/trim 없음). 탈락 시에만 rewrite 1회 |
| 범위 밖 | 기존 외부 prefill/FxTwitter following 경로 개량, 내 글 대댓글 5:1 섞기 |

## 문맥·초안 / 한도

- 기본 `TERAFABX_HOME_VERIFIED_CONTEXT_PROVIDER=gemini` → **Grok 쿼타 비사용**
- Grok 폴백 시에만 한도 시 **새 문맥·초안 생성 중지**, pending 게시는 유지
- 후보 필터: 개인 파란체크 원글 + 욕설/비난/논란/민감 원글 제외
- 초안 품질 관리: **LLM + 프롬프트만** (soft-trim/톤 polish/클리셰·길이 결정적 게이트 없음)
- 댓글: **stage1 초안 그대로**. judge 통과 시 rewrite로 덮지 않음. 게시 전 게이트는 안전 금칙 + LLM judge 결과만
- 후보 소스: **FxTwitter following 합성** (홈 DOM 아님)
- **일 목표 500** (`TERAFABX_HOME_VERIFIED_COMMENT_DAILY_TARGET`)
  - prepare 사이클 ~2.5분, 게시 최소 갭 ~3분, 배치 12, 작성자/일 3, 준비 버퍼 40, discover 80
  - 일 목표 달성 시 prepare/게시 중단, 다음 KST 일자에 리셋

## 구현 방침

1. own-post-reply 큐·상태·writer·검증 경로를 템플릿으로 복제
2. 후보 소스를 홈 원글+verified로 교체
3. 운영 서버와 포트·`.data`·Chrome CDP를 공유하지 않음
4. 기본 개발 모드는 shadow / prefill-only (실제 X 게시 off)

## 구현 현황 (worktree)

| 항목 | 상태 |
| --- | --- |
| 도메인 모듈 `lib/home-verified-comment.js` | 완료 |
| 상태·영속 write queue·prepare·pump·post | 완료 |
| 프롬프트/prepare/품질 게이트 | **대댓글과 완전 분리** (`lib/home-verified-comment-prompts.js`, `buildHomeVerifiedPreparedCommentRecord`) |
| Grok 한도 시 생성 pause | 완료 (Grok 폴백 시에만 적용) |
| Gemini text-only 1단계 + 길이/톤 polish | 완료 |
| 욕설·비난·논란 원글 제외 | 완료 |
| API `POST /api/terafabx/home-verified-comment` | 완료 |
| 대시보드 카드 (ON/OFF, prefill/live, prepare, pump) | 완료 |
| 단위 테스트 `test/home-verified-comment.test.js` | 완료 |
| 홈 DOM 자동 스크롤 수집 | **미완(선택)** — 현재 FxTwitter following / ingest |
| 실 X E2E | **완료** — post_one `https://x.com/terafabXai/status/2083926773847437540` (developermin1 입추 원글, 2026-08-02) |
| main 머지 | **미함** — worktree `feature/home-verified-comment` only |

### API actions

`status | enable | disable | prefill_only | live | ingest | prepare | pump | discard`

### 실행 (운영 영향 없음)

```bash
cd /Users/macmini/project/thread_dashboard-home-verified-comment
npm run start:isolated   # :4131
```
