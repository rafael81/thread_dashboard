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

## Runtime State 이전

Git does not store runtime state such as discovery DB, posted history, scheduled
slot files, logs, downloads, or local memory. To move the current dashboard state
to another Windows machine, export a zip from the old machine:

```sh
npm run export-runtime
```

Move the generated `thread-dashboard-runtime-*.zip` to the new clone and import:

```sh
npm run import-runtime -- ./thread-dashboard-runtime-YYYYMMDD-HHMMSS.zip
```

The archive includes:

- `.data/thread-discovery.db`
- `mirror-history.json`
- `x-scheduled-slots.json`

It intentionally excludes `node_modules`, logs, downloaded media, and AI memory.

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
  --remote-debugging-port=9224 \
  --user-data-dir="$HOME/.thread-x-chrome"
```

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
- `DISCOVERY_MIN_LIKES` default `500`
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
