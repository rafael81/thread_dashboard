# Threads Dashboard

Threads discovery dashboard and Threads-to-X mirror server.

The server scans Threads, stores media posts for manual review, and can post a
selected card to X through a headed Chrome session. It also keeps the legacy
Threads video downloader script.

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
`thread_dashboard_runtime` 저장소의 GitHub Release에 저장한다. 기존 Mac에서 서버를
정상 종료한 뒤 다음 명령을 실행한다.

```sh
npm run migrate:mac -- upload
```

이 명령은 현재 브랜치를 `origin`에 push하고, SQLite DB를 온라인 백업한 뒤 체크섬과
함께 비공개 런타임 저장소에 업로드한다. 커밋하지 않은 소스 변경이 있으면 안전을 위해
중단한다.

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

Run the local server:

```sh
npm run mirror-server
```

The server expects a headed Chrome instance with remote debugging on port
`9224`, already logged in to X as `@terafabXai`.

Start Chrome manually on macOS if needed:

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
