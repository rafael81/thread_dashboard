# Automatic Comment Discovery on CDP 9224

## Goal

Move automatic-comment target discovery from the dedicated headed Chrome on
CDP port 9237 to the existing visible Chrome on CDP port 9224. Keep the user's
existing tabs intact and remove the persistent 9237 browser resource.

## Current Behavior

The prefill producer starts or reuses a dedicated offscreen headed Chrome on
port 9237. It copies X cookies from port 9224, verifies `@terafabXai`, visits
`https://x.com/home`, scrolls the home timeline, extracts candidate status
URLs, and closes only its work tab. The 9237 browser remains alive at
`about:blank` between runs.

This isolates discovery from port 9224 work, but it adds another headed Chrome
process and duplicates an authenticated X profile.

## Selected Design

### Browser ownership

Automatic-comment discovery will use port 9224 directly. It will create a new
disposable tab in the existing `@terafabXai` Chrome session, bring that tab to
the foreground so X reliably paints the timeline, and close that tab in a
`finally` block. It will never navigate, close, or reuse a user-owned tab.

The foreground work tab may be visible for roughly 5–10 seconds. Closing it
returns Chrome to the previously selected user tab.

### Concurrency

Discovery will run inside the existing global port-9224 lock with waiting
enabled. This serializes it with scheduling, manual posting, account-sensitive
work, and other port-9224 automation. The lock covers account verification,
home navigation, scrolling, extraction, and work-tab cleanup.

The port-9238 automatic-comment writer remains separate and persistent. Grok
and Gemini prefill workers also remain separate. They may continue processing
already-discovered targets while a later discovery waits for port 9224.

### Account and data flow

The disposable tab opens the required account profile, verifies that the
logged-in account is `@terafabXai`, then navigates to `https://x.com/home`.
Candidate filtering and FxTwitter metadata checks remain unchanged. Because
the tab already belongs to the port-9224 profile, cookie copying is removed
from this path.

### Resource removal

Remove the port-9237 constants, profile configuration, browser launcher and
closer, reader-specific lock file, reader resource status, cookie-copy setup,
and retry logic tied to restarting Chrome 9237. Existing data under the old
9237 profile may remain on disk unless an explicit cleanup operation is run;
runtime code will no longer use it.

The dashboard/runtime status will report discovery as a port-9224 activity,
not as a separate reader browser.

## Failure Handling

- If port 9224 is busy, discovery waits for the global lock instead of starting
  another Chrome.
- If CDP 9224 is unavailable, discovery fails without falling back to 9237.
- If account verification fails, no candidate is accepted.
- If X home fails to load, discovery retries once using a fresh disposable tab
  while retaining the same port-9224 locking policy.
- Every attempt closes its disposable tab in `finally`, including timeout,
  navigation, parsing, and API-check failures.
- User-owned tabs and the port-9224 Chrome process remain open.

## Tests

Tests will be written before production changes and must prove:

1. Automatic-comment discovery selects port 9224 and the global lock.
2. No port-9237 reader resource or headed-reader launch option remains.
3. Discovery creates and closes only a disposable work tab.
4. Account verification occurs before home-timeline navigation.
5. Retry handling opens a fresh work tab and does not restart port 9224.
6. Port 9238 remains the dedicated quick writer.
7. The existing full test suite passes.

Runtime verification will confirm that port 9237 is no longer listening after
server restart, port 9224 remains logged in as `@terafabXai`, and one discovery
run produces candidate logs while preserving pre-existing port-9224 tabs.

## Completion Conditions

- No project process listens on CDP port 9237.
- Automatic-comment target discovery succeeds through CDP port 9224.
- The required X account is verified before discovery.
- Pre-existing port-9224 tabs survive a discovery run.
- The disposable work tab is closed after success and failure.
- Automatic-comment posting continues through the port-9238 quick writer.
- Targeted tests and the full test suite pass.
