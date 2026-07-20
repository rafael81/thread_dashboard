# Threads Single-Token Caption Preservation Design

## Problem

Threads post `@doorlock_videopone/DbASteVEwvG` contains the sequence `BTS / 만나 / 신나하는 / 아이쇼스피드`, but extraction stopped at `BTS`. The generic `looksLikeSocialHandle` heuristic treats a bare Latin token as an unrelated account and terminates post-text collection. The truncated text was persisted and reused as the X scheduling title.

## Behavior

- Preserve bare single-token caption lines such as `BTS`, `NASA`, and foreign-language words.
- Remove a line as a social handle only when DOM evidence identifies it as an unrelated profile/account link, or when it is explicitly `@`-prefixed.
- Continue excluding the expected post author's own handle and known DOM-confirmed media attribution labels.
- Keep existing UI-artifact, counter, timestamp, carousel, and reply-boundary filtering unchanged.

## Implementation

- Add a pure decision helper for whether a text line is a removable social handle, accepting DOM-confirmed handle lines as evidence.
- Use the helper in both browser-side root text collection and server-side `cleanThreadText` cleanup.
- Ensure extraction diagnostics record the preserved full caption used for scheduling.

## Tests

- Regression: the complete `BTS / 만나 / 신나하는 / 아이쇼스피드` caption remains intact.
- Regression: an unrelated DOM-confirmed handle-only line such as `destination_now_` is still removed.
- Regression: an explicit `@other_account` line remains removable.
- Run the full test suite and dashboard build.
- Run the real Threads-to-X scheduling path through the local server, Chrome CDP 9224, and `@terafabXai`; verify the X schedule UI and resulting server log. If X rate limiting prevents this, report implementation as not E2E verified.

## Success Criteria

The stored discovery title and the X compose title match the complete Threads caption up to the normal X weighted-length limit, without reintroducing unrelated account attribution lines.
