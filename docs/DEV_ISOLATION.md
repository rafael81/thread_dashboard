# 개발 격리 (운영 대시보드 보호)

## 디렉터리

| 역할 | 경로 | 브랜치 |
| --- | --- | --- |
| **운영 (건드리지 않음)** | `/Users/macmini/project/thread_dashboard` | `main` |
| **이 기능 개발** | `/Users/macmini/project/thread_dashboard-home-verified-comment` | `feature/home-verified-comment` |

운영 워크스페이스의 미커밋 변경·실행 중 `mirror_server`(3131)·CDP 9224 세션은 이 워크트리와 분리한다.

## 기본 규칙

1. **코드 수정은 개발 워크트리에서만** 한다.
2. 개발 서버는 **PORT=4131** (운영 3131과 겹치지 않음).
3. 상태·프로필은 개발 워크트리의 **`.data/`** 만 사용 (`__dirname` 기준 — 운영 `.data`와 자동 분리).
4. **운영 CDP 9224 / writer 9238 등에 붙이지 않는다.**  
   잘못 붙으면 로그인 세션·탭·게시가 운영과 충돌한다.
5. 기본값은 **실제 X 게시 끔** (shadow / prefill-only). 실게시 E2E는 운영자 승인 후에만.

## 실행

```bash
cd /Users/macmini/project/thread_dashboard-home-verified-comment
cp env.isolated.example .env   # 최초 1회, 필요 시 수정
npm install
npm run start:isolated
```

대시보드: `http://127.0.0.1:4131` (빌드된 static 기준; Vite dev는 별도).

## 포트 맵 (개발 기본)

| 용도 | 운영 | 개발(격리) |
| --- | --- | --- |
| HTTP | 3131 | **4131** |
| 가시 Chrome CDP | 9224 | **사용 안 함** (또는 승인 후 전용 프로필) |
| auto-comment writer | 9238 | **9338** |
| own-post-reply X | 9239 | **9339** |
| comment headless X | 9236 | **9336** |
| Gemini port base | 9264 | **9364** |

락 파일도 포트 접미사가 달라 tmp 락 충돌을 피한다.

## 운영에 영향 주는 실수

- 개발 서버를 `PORT=3131`로 기동
- `CHROME_PORT=9224`로 운영 Chrome에 연결
- 운영 디렉터리의 `.data` 경로를 env로 강제 지정
- 개발 중 live 게시를 켠 채 공유 계정 세션 사용

## git

```bash
# 개발 브랜치 작업
cd /Users/macmini/project/thread_dashboard-home-verified-comment

# 운영 트리 상태 확인 (수정하지 말 것)
cd /Users/macmini/project/thread_dashboard && git status
```

워크트리 제거 (개발 종료 후):

```bash
cd /Users/macmini/project/thread_dashboard
git worktree remove ../thread_dashboard-home-verified-comment
```
