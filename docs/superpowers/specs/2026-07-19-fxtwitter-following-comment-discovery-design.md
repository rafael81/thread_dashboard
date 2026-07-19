# FxTwitter Following Comment Discovery Design

## Goal

Replace automatic X home scanning for auto-comment target discovery with a stable FxTwitter pipeline based on `@terafabXai`'s following list and each followed account's posts from the most recent 24 hours. Keep X home discovery available only as an explicit one-shot diagnostic action in the dashboard.

## Scope

This change affects target discovery only. Existing FxTwitter status validation, Grok context analysis and draft generation, Gemini review, pending queue persistence, and X reply posting remain unchanged.

The automatic discovery path must not open `https://x.com/home`. It must not silently fall back to X home when FxTwitter is unavailable.

## Architecture

### Following synchronization

The server fetches all pages from:

```text
GET /2/profile/terafabXai/following?count=100
```

The response's bottom cursor drives pagination. The normalized following cache contains account ID, handle, display name, protected status, and the time it was fetched. It is refreshed every six hours. When refresh fails, the last successful cache remains usable.

### Timeline synchronization

The server fetches followed accounts through:

```text
GET /2/profile/{handle}/statuses?count=100&since={24-hour-cutoff}
```

Accounts are processed through a bounded worker pool rather than an unbounded `Promise.all`. Each account retains synchronization metadata and an independent retry time. A failed account does not fail the whole discovery cycle.

Only posts satisfying all of these rules enter the candidate reservoir:

- Created within the preceding 24 hours.
- Authored by the followed account.
- A root post rather than a reply.
- Not authored by `@terafabXai`.
- Not already present in seen targets, comment history, pending comments, or the reservoir.
- Not rejected by the existing promotional and sensitive-context filters.

FxTwitter's status payload remains the authoritative source for text, author, media, quote, and reply-parent metadata. Candidate URLs are stored in the existing `commentTargetBacklog`, preserving the downstream pipeline contract.

### Reservoir refill

Automatic prefill consumes the existing reservoir first. When it cannot satisfy the requested candidate count, it triggers an FxTwitter following/timeline synchronization and validates newly collected candidates. The reservoir remains capped by the existing backlog limit.

Following refresh is cache-aware, while timeline synchronization uses the rolling 24-hour cutoff and deduplication. This allows repeated safe synchronization without reopening X home.

### Manual X home diagnostic

The dashboard automation diagnostics section exposes one action named `X 홈 1회 스캔`. The action uses the existing headed Chrome session on port 9224, the required `@terafabXai` login verification, the global 9224 lock, a disposable work tab, and the current deep-scroll collector.

It runs only after an explicit dashboard request. It may append validated candidates to the same reservoir, reports HTTP 429 separately, and always closes its work tab. It does not enable periodic X home scanning and is never called as an FxTwitter fallback.

## State

The automation state stores:

- Last successful following sync time.
- Next following refresh time.
- Cached normalized following accounts.
- Per-handle last attempt, last success, last error, and retry time.
- Last FxTwitter discovery cycle status and counts.
- Number of candidates collected from the most recent 24-hour cycle.

Existing `commentTargetBacklog`, `seenTargets`, `commentHistory`, and pending-comment state remain the deduplication authority.

## Error Handling

- A following refresh failure uses the last successful following cache if one exists.
- If no following cache exists, discovery fails closed with an FxTwitter-specific error and does not open X home.
- Individual timeline failures are recorded per handle and skipped until their exponential retry time.
- Cursor repetition terminates pagination to prevent loops.
- Invalid or incomplete FxTwitter rows are skipped with diagnostic events.
- A cycle is `ok` when all attempted accounts succeed, `degraded` when at least one account fails but candidates or usable cache remain, and `error` when discovery cannot proceed.
- X home HTTP 429 backoff applies only to the manual diagnostic action and must not pause FxTwitter prefill.

## Dashboard

The automation diagnostics show:

- Discovery mode: `FxTwitter 팔로잉`.
- Cached following count.
- Last and next following synchronization times.
- Accounts attempted, succeeded, failed, and currently backed off.
- Candidates collected from the latest 24-hour cycle.
- Reservoir size.
- `X 홈 1회 스캔` diagnostic button and its last result.

The existing auto-comment on/off control continues to control the complete pipeline.

## Observability

Structured events distinguish the source and boundary of failures:

- Following sync start, page, success, and error.
- Per-account timeline start, success, skip, and error.
- FxTwitter discovery completion with counts and duration.
- Manual X home scan start, completion, HTTP 429, and error.

Each selected target records an FxTwitter-following collection source so dashboard and logs can distinguish it from manual X home results.

## Testing

Tests are written before production changes and cover:

- Following response normalization and cursor termination.
- Strict 24-hour cutoff.
- Root-post-only filtering.
- Deduplication against history, pending, seen, and reservoir state.
- Bounded concurrency and independent per-account failures.
- Cached following fallback without X home access.
- Automatic discovery source containing no X home navigation.
- Manual action using port 9224, the shared lock, and disposable-tab cleanup.
- Dashboard status fields and button wiring.

Verification includes the focused tests, the complete Node test suite, a live read-only FxTwitter following/status request, and a server API/dashboard smoke test. No X reply is required merely to verify target discovery; any live posting verification must still enforce the required `@terafabXai` login and existing quality gates.

## Completion Conditions

The work is complete when:

1. Automatic comment discovery can refill the reservoir from the following graph and recent 24-hour timelines without opening X home.
2. Partial FxTwitter failures do not stop successful accounts from supplying candidates.
3. X home is reachable only through the explicit one-shot dashboard diagnostic action.
4. Dashboard diagnostics expose the new source, cache, cycle, and failure state.
5. Focused tests and the full test suite pass.
6. A live read-only FxTwitter synchronization returns candidates through the server path.
