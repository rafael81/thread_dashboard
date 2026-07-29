# Thread Android Share

Android share-target app for saving a Threads post to the local discovery
dashboard, with an optional share target that queues automatic X scheduling.

## Flow

1. In the Threads Android app, open a post and choose Share.
2. Select one of the share targets:

   - `대시보드 저장`
   - `자동 예약`

3. The app extracts the Threads post URL and sends it to the local dashboard server.

URL extraction checks Android text/title extras, `CharSequence` values, intent
data, stream extras, and every `ClipData` item so sender payload changes do not
silently drop a valid Threads link.
Full `/@user/post/id` links and current `/t/id` short share links are both
accepted. Short links are resolved to the canonical post URL before the app
sends its dashboard request.

`대시보드 저장` calls:

   `POST {dashboard server URL}/api/discovery/add-url-async`

Request body:

```json
{
  "url": "https://www.threads.com/@user/post/POST_ID",
  "origin": "android_share"
}
```

`자동 예약` calls:

   `POST {dashboard server URL}/api/discovery/auto-schedule-async`

Request body:

```json
{
  "url": "https://www.threads.com/@user/post/POST_ID",
  "origin": "android_share_auto_schedule"
}
```

The default dashboard server URL is `http://100.74.184.62:3131`, the current
Tailscale address for the local mirror server. For an Android emulator, change
the URL in the app to `http://10.0.2.2:3131`.

The dashboard server accepts the share quickly, immediately creates a review card
on `/discovery`, then enriches the card with text/media in the background. For
`자동 예약`, the server returns quickly and performs the real X schedule flow in
the background through the logged-in Chrome remote debugging session.

## Build

Requires a local Java runtime and Gradle/Android Gradle Plugin access.

```bash
cd /Users/user/Documents/thread_download/thread-android-share
gradle :app:assembleDebug
```

On this machine, Gradle exists only in the wrapper cache and no Java runtime is
currently available on PATH, so the build could not be completed from this
session.

## Server

Run the mirror server from the downloader workspace:

```bash
cd /Users/user/Documents/thread_download
npm run mirror-server
```

Before sharing from Android, make sure the dashboard server is running. Chrome
remote debugging is only needed later when you manually post or save drafts from
the dashboard.
