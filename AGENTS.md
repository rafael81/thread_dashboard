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
- The headed Chrome on port `9224` must use the dedicated clone of the pink
  `과즙루피` profile (`Profile 1`) at
  `.data/chrome-profiles/gwajeuplupi-visible-9224`. Its source profile is
  `~/project/personal/tweet-persona/.agent-browser/chrome-profile/Profile 1`.
  Do not substitute `Rafael` or any other Chrome profile. After every browser
  launch or restart, confirm that X shows `@terafabXai` before resuming work.
- Server entrypoint is `mirror_server.js`, normally served on port `3131`.
- Android share app should send a Threads URL to the server asynchronously and return quickly. Server-side work must not block the Android share UI.
- After any X post/draft/schedule attempt, close work tabs and clean local media download directories. User-owned tabs should be left alone.
- Completed/scheduled posts must be recorded in `mirror-history.json` to prevent accidental duplicate posting.
- When a Threads post has multiple media items, send at most 4 media files to X.

## Discovery Dashboard Rules

- Discovery scans run every 5 minutes by default, and auto discovery stops itself after 24 newly saved review items in the current enabled session. A scan also stops scrolling once 24 video candidates are collected.
- Discovery mode is dashboard/manual-review first: collect Threads timeline videos that are cute animal posts with engagement (views when available, otherwise likes) greater than 1000, whose caption context matches the existing posted style, save them as `review`, and show them on `/discovery`. Image-only, non-Korean, non-animal, and personal diary captions are not candidates. Duplicate URLs and duplicate posted text must not be posted again. Saved titles are a Gemini rewrite in the posted voice, not the Threads caption copied as-is.
- Do not auto-post discovered items and do not auto-save them to X drafts, except rows in an approved A/B candidate-group batch. Group approval is snapshot-only unless `groupApproval.standingApprovedGroups` includes `A` and `rolloutStage` is `steady`. C and unapproved rows must never be posted or scheduled automatically.
- Dashboard `게시` posts immediately with no confirmation popup.
- Dashboard `초안 저장` is manual only; it uses X compose and marks the row `x_draft` only after X draft save succeeds.
- Dashboard `예약 게시` is manual only. Delivery is controlled by `scheduleDeliveryMode` (`ab` / `x_native` / `local_post`, default `ab`): `x_native` uses the real X schedule UI and marks the row `scheduled` only after X schedule confirmation succeeds; `local_post` stores the slot locally and does not open X compose. In `ab` mode, assignment is a stable SHA-1 split of `canonicalUrl`.
- Dashboard `자동 예약` is manual only; it schedules at least 40 minutes after the latest known future X scheduled slot, with a random 5-minute offset that is never on the hour. The same `scheduleDeliveryMode` assignment applies. `x_native` marks `scheduled` only after X schedule confirmation succeeds; `local_post` marks `scheduled` immediately with `schedule_delivery=local_post`.
- Local scheduled rows are posted at due time by the dashboard `게시` path (`postDiscoveryRowToX` with `fulfillLocalSchedule`). Do not treat a due local reservation as posted until that dispatcher succeeds. X schedule monitor must ignore `local_post` rows so it does not recreate them on X.
- Do not show stale `skipped` rows in the dashboard. Old timeline-only previews can differ from the real Threads post if detail extraction failed.
- Dashboard cards should include fixed-size media previews, playable video controls, posted time for processed rows, and collapsed diagnostics for real errors only.

## Extraction And Posting Guardrails

- Treat text extraction and media extraction separately. If `textOverride` is provided, an empty extracted Threads text must not discard valid media.
- For non-Korean or no-space text, do not assume a short single-token line is a handle/noise. Be careful not to clean the real original text away.
- Filter UI artifacts out of post text, including carousel/page counter lines like `1`, `/`, or `1 /`.
- Never include unrelated social handle-only lines such as `destination_now_` in mirrored text.
- If a Threads URL opens but detail extraction fails, inspect the page DOM/media candidates before concluding media extraction failed.
- If Threads redirects to an invalid/error state or the Chrome Threads session is logged out, report that as the root cause and do not invent content.
