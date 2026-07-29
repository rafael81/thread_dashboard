## Core Rule

- For any change that affects Threads-to-X mirroring, run an end-to-end test before calling the work complete.
- E2E means exercising the real path through the Android share app or its equivalent request, this app's queue/request flow, the local mirror server, Chrome on remote debugging port 9224, and the logged-in X account.
- For X scheduling changes, E2E must include opening X compose, selecting schedule date/time/minute in the real X UI, confirming the schedule, and verifying the resulting server log.
- If E2E cannot be run, state clearly that the change is implemented but not E2E verified. Do not present it as complete.
