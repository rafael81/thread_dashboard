# Discovery List Auto-Schedule Button and X Schedule Recovery Design

## Goal

Make auto-scheduling directly accessible from every eligible discovery list row, and make X scheduling recover from a transient schedule-dialog shell instead of reporting that date/time fields do not exist.

## Scope

This change covers two connected user workflows:

1. A visible `자동예약` action beside the overflow menu in each eligible discovery list row.
2. Bounded recovery when X opens `/compose/post/schedule` but has not rendered its date/time controls.

It does not change slot spacing, scheduling policy, discovery ranking, manual scheduling semantics, or X account requirements.

## Dashboard Interaction Design

- Each discovery list row that can be posted shows a dedicated `자동예약` button outside the overflow menu.
- The existing overflow-menu `자동 예약` item is removed so there is one list-level entry point.
- The detail sheet keeps its existing auto-schedule action because it is a different context, not a duplicate within the list row.
- While a row is being accepted, only that row's button changes to `접수 중` and becomes disabled.
- Other rows remain actionable. Title editing and unrelated actions remain independent.
- Rows that are no longer eligible keep the button disabled or hidden according to the table's existing action-availability convention.
- The button calls the existing asynchronous `/api/discovery/auto-schedule-async` path; no new scheduling API is introduced.

## X Schedule Recovery State Machine

The scheduler distinguishes these states after clicking X's schedule option:

1. `ready`: the active schedule dialog contains the required date/time controls.
2. `loading_shell`: the schedule route/dialog exists but has no controls yet, commonly showing only `예약 게시물`.
3. `rate_limited`: a relevant X request returns HTTP 429 before usable controls appear.
4. `login_or_navigation_error`: the session is logged out or left the expected X compose flow.
5. `unsupported_dom`: the dialog has substantial interactive content but the required controls cannot be classified.

For `loading_shell`, automation waits by condition for up to 45 seconds. If controls still do not appear, it closes only the schedule dialog, returns to the existing populated composer, opens the schedule option once more, and waits again. Composer text and attached media must be verified before continuing.

The recovery is bounded to one dialog reopen. It never reloads the entire compose page because doing so could discard prepared text or media.

## Failure and Slot Handling

- A failure before the final X schedule submission releases the auto-allocated slot for that canonical URL.
- The discovery row returns to a retryable `failed_schedule` state with a detailed reason; it is not recorded in mirror history.
- A failure after the X submit click remains subject to existing post-submit reconciliation so an actual reservation is not duplicated.
- Logs include the recovery state, attempt/reopen count, URL, every visible dialog's field/button summary, and relevant X 429 response URL when present.
- Error messages distinguish loading timeout, rate limit, login/navigation failure, and unsupported DOM.

## Components and Data Flow

1. `dashboard/src/components/data-table.tsx` renders the independent row button and routes it through the existing `onAutoSchedule` callback.
2. `dashboard/src/main.jsx` retains row-scoped `autoScheduleSubmitting` state and the existing asynchronous request.
3. `mirror_server.js` classifies schedule-dialog readiness, performs bounded recovery, and releases reserved slots for confirmed pre-submit failures.
4. Existing queue processing preserves per-row concurrency semantics and must not globally disable unrelated row actions.

## Testing

- Component/source regression test: the list row contains a dedicated auto-schedule button and the overflow item is absent.
- State-classification tests: ready controls, loading shell, rate limited shell, login/navigation failure, and unsupported DOM.
- Recovery tests: controls appearing during the first wait, controls appearing after one reopen, and failure after the bounded second wait.
- Slot tests: pre-submit failure releases only the matching reserved slot; post-submit uncertainty does not release it or enqueue a duplicate.
- Full automated suite.
- Real E2E through the dashboard-equivalent request, local server, Chrome CDP 9224, logged-in `@terafabXai`, X date/time/minute controls, submission, schedule-list verification, work-tab cleanup, and media cleanup.

## Completion Criteria

- Eligible discovery rows expose a visible independent `자동예약` button.
- One row entering `접수 중` does not disable another row's auto-schedule or title actions.
- A transient X schedule shell recovers without losing composer content or media.
- A bounded pre-submit failure leaves no stale reserved slot.
- Successful X reservations are verified and recorded exactly once.
- Automated tests pass and the real X E2E completes; otherwise the implementation is reported as not E2E verified.

