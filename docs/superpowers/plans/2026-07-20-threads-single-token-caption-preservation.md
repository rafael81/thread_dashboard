# Threads Single-Token Caption Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task-by-task.

**Goal:** Preserve legitimate bare Latin tokens such as `BTS` in Threads captions and prevent successful X schedules from being left as local failures when the post-submit schedule-list check is temporarily unhealthy.

**Architecture:** Separate textual evidence from DOM evidence. Caption cleanup may remove an explicit `@handle`, the expected author, or a line confirmed by the Threads DOM as an attribution link; it must preserve a bare Latin token otherwise. Scheduling remains success-after-verification, but a verification error must perform a focused reconciliation against the intended X slot before writing `failed_schedule`.

**Tech Stack:** Node.js, built-in `node:test`, Chrome CDP on port 9224, X scheduled-post UI.

## Global Constraints

- Preserve the existing dirty worktree and unrelated user changes.
- Use test-driven development: observe each regression test fail before changing production code.
- Verify `@terafabXai` before any real X action.
- Close only work tabs and clean work media after browser checks.
- Do not create a duplicate X reservation for the supplied Threads URL.

### Task 1: Lock down the title truncation regression

**Files:**
- Modify: `test/inssider-dashboard.test.js`
- Modify: `mirror_server.js`

1. Add a regression test using the full `@doorlock_videopone` caption containing the standalone line `BTS`.
2. Update the unrelated-handle fixture so the bare attribution is removed only when supplied as DOM-confirmed evidence.
3. Run the focused test and confirm it fails because cleanup stops at `BTS`.
4. Introduce a shared, pure social-line disposition helper.
5. Make `cleanThreadText` and discovery preview cleanup preserve unconfirmed bare tokens while still removing explicit and DOM-confirmed handles.
6. Run focused tests and confirm they pass.

### Task 2: Keep browser extraction behavior identical

**Files:**
- Modify: `mirror_server.js`
- Modify: `test/inssider-dashboard.test.js`

1. Add tests for the shared helper covering expected author, explicit `@handle`, DOM-confirmed attribution, and bare `BTS`.
2. Inject/use the same helper in the Threads browser evaluation code instead of its independent broad regex stop rule.
3. Run the extraction and dashboard test subset.

### Task 3: Reconcile X success after verifier failure

**Files:**
- Modify: `mirror_server.js`
- Modify: `test/inssider-dashboard.test.js`

1. Add a pure decision test for a schedule attempt where submit occurred, the normal verifier errored, and a focused slot lookup finds the expected title/media.
2. Confirm the test fails before implementation.
3. Add bounded reconciliation using the intended scheduled time and expected content before marking the discovery row failed.
4. Ensure a confirmed existing reservation is recorded as `scheduled` and does not retry or duplicate.
5. Run focused scheduling tests.

### Task 4: Verify the real path without duplicating the reservation

**Files:**
- Verify runtime state and logs only.

1. Run the complete automated test suite.
2. Restart the server if required and confirm port 3131 health.
3. Verify Chrome 9224 is logged in as `@terafabXai`.
4. Exercise the equivalent Threads share/extraction request in a non-posting or already-scheduled-safe path and confirm the complete caption is returned.
5. Reconcile the already-existing 2026-07-21 00:35 X reservation into local state; do not create another reservation.
6. Verify the X schedule list contains exactly one matching entry and capture the server evidence.

