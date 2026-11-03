# Threads Dashboard

Threads discovery dashboard and Threads-to-X mirror server.

The server scans Threads, stores media posts for manual review, and can post a
selected card to X through a headed Chrome session. It also keeps the legacy
Threads video downloader script.

## AAGAG 링크 수동 게시

`/discovery`의 **수동 추가**에 `https://aagag.com/issue/?idx=1621842_1` 같은
AAGAG 이슈 링크를 넣는다. 서버는 Chrome 9224에서 본문 영역만 읽고, 원문 순서대로
최대 4개의 이미지/영상을 저장한다. 광고·댓글·영상 컨트롤은 본문에서 제외하며
WebP 이미지는 X에 첨부할 JPEG로 변환한다. 링크 추가 요청은 즉시 반환된다.

수집된 행을 열어 본문과 미디어를 확인하고 **게시**를 누르면 `@terafabXai` 계정을
검증한 뒤 기존 X 작성창 경로로 게시한다. 추가만으로 자동 게시하거나 초안을 만들지 않는다.
같은 이슈의 다른 리비전(`_0`, `_1`)도 게시 이력에서 중복 확인한다.
수동 AAGAG 글에는 Threads 자동 발굴용 동물/조회수 필터와 자동 제목 재작성을 적용하지 않아,
서버를 재시작해도 검토 목록과 원문 본문이 유지된다.

수집 모듈은 `lib/aagag-source.js`, 보관 미디어는 `.data/generated-media/aagag-*/`에 있다.
미디어가 누락되면 텍스트만 게시하지 않고 재수집을 안내한다.

실제 게시 없이 작성창까지 확인하려면 수집 완료 후 아래 요청을 사용한다. 계정 확인,
본문 입력, 미디어 업로드와 게시 버튼 활성화를 검사하고 작업 탭·임시 파일을 정리한다.
이 검증은 실제 게시/예약 확정 E2E를 대체하지 않는다.

```sh
curl -H 'content-type: application/json' \
  -d '{"url":"https://aagag.com/issue/?idx=1621842_1"}' \
  http://127.0.0.1:3131/api/discovery/verify-compose
```

## Windows 운영

Requirements:

- Windows 10/11
- Node.js 20+
- Google Chrome
- Git

Clone and install:

```powershell
git clone https://github.com/rafael81/thread_dashboard.git
cd thread_dashboard
npm install
```

Start Chrome with remote debugging:

```powershell
.\windows\start-chrome.ps1
```

In that Chrome window, log in to:

- X as `@terafabXai`
- Threads with an account that can open the timeline and post URLs

Start the dashboard server:

```powershell
.\windows\start-server.ps1
```

Open:

```text
http://localhost:3131/discovery
```

LAN URL is available from another device if Windows Firewall allows port `3131`.

## 다른 Mac으로 이전

소스 코드는 공개 `thread_dashboard` 저장소에, DB와 운영 상태는 별도의 비공개
`thread_dashboard_runtime` 저장소의 GitHub Release에 저장한다. 기존 Mac에서 다음
명령을 실행한다.

```sh
npm run migrate:mac -- upload
```

이 명령은 현재 브랜치를 `origin`에 push하고, SQLite DB를 온라인 백업한 뒤 체크섬과
함께 비공개 런타임 저장소에 업로드한다. 커밋하지 않은 소스 변경이 있으면 안전을 위해
중단한다. `com.terafabx.mirror-server` LaunchAgent가 실행 중이면 DB 스냅샷 동안만
자동으로 정지하고 성공·실패 여부와 관계없이 다시 기동한다. 서버를 직접 실행한
환경에서는 업로드 전에 서버를 종료해야 한다.

새 Mac에서는 GitHub CLI 인증 후 소스를 받고 런타임을 복원한다.

```sh
gh auth login
gh repo clone rafael81/thread_dashboard
cd thread_dashboard
npm ci
npm run migrate:mac -- restore
```

복원 전 서버는 종료되어 있어야 한다. 기존 파일이 있으면 `.migration-backups/`에 먼저
백업된다. 아카이브에는 discovery DB, AI memory DB, 게시 이력, 예약 슬롯 및 자동화
상태가 포함된다. Chrome 프로필·쿠키, 로그인 정보, 로그, 다운로드 미디어와
`node_modules`는 포함하지 않는다. 새 Mac에서는 전용 Chrome 프로필로 X, Threads,
Grok, Gemini에 다시 로그인해야 한다.

로컬 파일로만 옮길 때는 `npm run export-runtime`과
`npm run import-runtime -- <zip>`을 사용할 수 있다.

## Threads Video Downloader

The downloader first tries `yt-dlp`. If `yt-dlp` cannot extract the post, it falls
back to scanning the public Threads page HTML for direct MP4 media URLs.

## Requirements

- Python 3
- `yt-dlp`

This machine already has `yt-dlp` installed. If you need to install or update it later:

```sh
brew install yt-dlp
brew upgrade yt-dlp
```

## Usage

```sh
python3 download_threads.py "https://www.threads.com/@username/post/POST_ID"
```

Files are saved into `downloads/`.

For posts that require login, use browser cookies:

```sh
python3 download_threads.py "https://www.threads.com/@username/post/POST_ID" --cookies-from-browser chrome
```

Safari is also supported by `yt-dlp` on macOS:

```sh
python3 download_threads.py "https://www.threads.com/@username/post/POST_ID" --cookies-from-browser safari
```

Note: Threads changes its web internals often. If both `yt-dlp` and the direct
HTML fallback fail, update `yt-dlp` first. Some posts may need a browser-based
extractor because the media URL is loaded only after client-side rendering.

## Options

```sh
python3 download_threads.py --help
```

Useful options:

- `-o downloads_folder`: change output directory
- `--audio-only`: save audio only
- `--dry-run`: print the command without downloading

## Threads to X Mirror Server

Run the local server and its dedicated headed Chrome together:

```sh
npm run mirror-server
```

`npm start` is an alias for the same command. The launcher starts Chrome with
remote debugging on port `9224` and the dedicated `Profile 1`, then starts the
dashboard/mirror server on port `3131`. If that exact Chrome is already open,
the launcher reuses it.

The equivalent manual Chrome command is:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9224 \
  --user-data-dir="$PWD/.data/chrome-profiles/gwajeuplupi-visible-9224" \
  --profile-directory="Profile 1"
```

The 9224 profile is the dedicated clone of the pink `과즙루피` Chrome
profile. Before any X action, confirm that X shows `@terafabXai`.

Endpoint:

```sh
POST http://localhost:3131/api/mirror-thread
```

Dashboard/app share endpoints accept Threads posts plus YouTube watch, Shorts,
and `youtu.be` links. YouTube rows use oEmbed metadata for the title, channel,
and thumbnail. Posting/scheduling downloads an H.264 MP4 with `yt-dlp`, uploads
the video to X, and removes hashtags and source links from the X title. Temporary
video files are deleted after every success or failure. `yt-dlp` and `ffmpeg`
must be installed.

```sh
POST http://localhost:3131/api/discovery/add-url-async
POST http://localhost:3131/api/discovery/auto-schedule-async
```

Body:

```json
{ "url": "https://www.threads.com/@user/post/POST_ID" }
```

The server refuses to post if it cannot verify the X account as `@terafabXai`.

Useful environment variables:

- `PORT` default `3131`
- `CHROME_PORT` default `9224`
- `X_HANDLE` default `terafabXai`
- `DISCOVERY_MIN_LIKES` default `1000`
- `DISCOVERY_SCAN_INTERVAL_MS` default `300000`
- `DISCOVERY_MAX_SCROLLS` default `20`

## AI Memory

This project includes a local Turso embedded database for agent memory. It stores
small, reusable facts and rules in `.memory/agent.db` and searches them with
Turso vector distance functions.

Initialize and seed the current project memory:

```sh
npm run memory -- init
npm run memory -- seed-current-project
```

Add a memory:

```sh
npm run memory -- add rule "Threads-to-X changes require E2E" e2e,rule
```

Search relevant memories:

```sh
npm run memory -- search "android app async mirror endpoint" 5
```

Keep memories concise. Store stable facts, decisions, rules, and root causes,
not full logs or long conversation transcripts.
