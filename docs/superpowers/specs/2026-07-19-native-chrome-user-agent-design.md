# Native Chrome User-Agent Design

## Goal

Remove the fixed `Chrome/149` User-Agent from TerafabX browser launches so every worker uses the User-Agent supplied by its installed Chrome binary.

## Scope

- Delete the `TERAFABX_BROWSER_USER_AGENT` default/config constant.
- Remove the `--user-agent=...` argument from the shared Chrome launcher used by X and Gemini workers.
- Do not alter ports, profiles, headed/headless modes, cookie copying, or automation cadence.

## Behavior

Chrome owns its complete browser identity. After a Chrome update, the JavaScript User-Agent and the browser's other version signals remain consistent without application changes. No environment override will reintroduce a forged User-Agent.

## Error Handling

Existing browser startup, account verification, retry, and cleanup behavior remains unchanged. X readiness must continue to fail closed if the timeline does not render.

## Verification

1. Add a regression test proving the shared Chrome launch arguments contain no `--user-agent` option.
2. Observe that test fail before the production change and pass after it.
3. Run syntax checking and the full test suite.
4. Restart the server so existing 9237/9238 processes cannot retain the old launch arguments.
5. Verify 9237 reports the installed Chrome's native User-Agent, renders authenticated `x.com/home` articles, and shows `@terafabXai`.
6. Verify the server and automatic-comment pipeline remain healthy.

## Non-goals

- Changing anti-bot behavior by adding alternative fingerprint spoofing.
- Refactoring unrelated browser orchestration.
- Changing Grok, Gemini, X account, scheduling, or comment-quality policies.
