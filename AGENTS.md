## Core Rule

- Before substantial work in this project, search local AI memory with
  `npm run memory -- search "<task summary>" 5` and use relevant facts.
- When a stable rule, root cause, file location, or implementation decision is
  discovered, save it with `npm run memory -- add <kind> "<content>" <tags>`.
- For any change that affects Threads-to-X mirroring, run an end-to-end test before calling the work complete.
- E2E means exercising the real path through the Android share app or its equivalent request, this local mirror server, Chrome on remote debugging port 9224, and the logged-in X account.
- For X scheduling changes, E2E must include opening X compose, selecting schedule date/time/minute in the real X UI, confirming the schedule, and verifying the resulting server log.
- If E2E cannot be run, state clearly that the change is implemented but not E2E verified. Do not present it as complete.

## Threads-to-X Operating Rules

- Required X account is `@terafabXai`. Verify the logged-in X account before any post, draft, or schedule action. If verification fails, do not post.
- Chrome remote debugging port is `9224`; use the logged-in headed Chrome session for X/Threads automation.
- Server entrypoint is `mirror_server.js`, normally served on port `3131`.
- Android share app should send a Threads URL to the server asynchronously and return quickly. Server-side work must not block the Android share UI.
- After any X post/draft/schedule attempt, close work tabs and clean local media download directories. User-owned tabs should be left alone.
- Completed/scheduled posts must be recorded in `mirror-history.json` to prevent accidental duplicate posting.
- When a Threads post has multiple media items, send at most 4 media files to X.

## Discovery Dashboard Rules

- Discovery scans run every 5 minutes by default.
- Discovery mode is dashboard/manual-review first: collect Threads timeline posts with at least 1000 likes and confirmed media, save them as `review`, and show them on `/discovery`.
- Do not auto-post discovered items and do not auto-save them to X drafts.
- Dashboard `게시` posts immediately with no confirmation popup.
- Dashboard `초안 저장` is manual only; it uses X compose and marks the row `x_draft` only after X draft save succeeds.
- Dashboard `예약 게시` is manual only; it uses the real X schedule UI with the dashboard-selected time and marks the row `scheduled` only after X schedule confirmation succeeds.
- Dashboard `자동 예약` is manual only; it schedules at 30 minutes after the latest known future X scheduled slot and marks the row `scheduled` only after X schedule confirmation succeeds.
- Do not show stale `skipped` rows in the dashboard. Old timeline-only previews can differ from the real Threads post if detail extraction failed.
- Dashboard cards should include fixed-size media previews, playable video controls, posted time for processed rows, and collapsed diagnostics for real errors only.

## Extraction And Posting Guardrails

- Treat text extraction and media extraction separately. If `textOverride` is provided, an empty extracted Threads text must not discard valid media.
- For non-Korean or no-space text, do not assume a short single-token line is a handle/noise. Be careful not to clean the real original text away.
- Filter UI artifacts out of post text, including carousel/page counter lines like `1`, `/`, or `1 /`.
- Never include unrelated social handle-only lines such as `destination_now_` in mirrored text.
- If a Threads URL opens but detail extraction fails, inspect the page DOM/media candidates before concluding media extraction failed.
- If Threads redirects to an invalid/error state or the Chrome Threads session is logged out, report that as the root cause and do not invent content.
