# Native Chrome User-Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the fixed Chrome/149 User-Agent and verify that X automation uses the installed Chrome's native identity.

**Architecture:** Extract the shared Chrome argument construction into a pure helper so launch identity is regression-tested. The launcher will no longer add any `--user-agent` argument, leaving UA ownership to Chrome.

**Tech Stack:** Node.js, Chrome DevTools Protocol, node:test

## Global Constraints

- Do not change ports, profiles, cookie copying, headed/headless mode, cadence, or quality policy.
- Verify the authenticated X account is `@terafabXai` before accepting the live result.

---

### Task 1: Remove fixed User-Agent

**Files:**
- Modify: `mirror_server.js`
- Test: `test/own-post-reply.test.js`

**Interfaces:**
- Produces: `terafabxChromeLaunchArgs({ port, profileDir, headless }): string[]`

- [x] **Step 1: Write the failing test**

Assert that `terafabxChromeLaunchArgs(...)` is exported and no returned argument starts with `--user-agent=`.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test test/own-post-reply.test.js`
Expected: FAIL because `terafabxChromeLaunchArgs` is not exported.

- [x] **Step 3: Write minimal implementation**

Create the pure helper from the launcher's existing argument list, omit `--user-agent`, delete `TERAFABX_BROWSER_USER_AGENT`, and make the launcher use the helper.

- [x] **Step 4: Run verification**

Run: `node --test test/own-post-reply.test.js`, `node --check mirror_server.js`, `npm test`, and `git diff --check`.

- [x] **Step 5: Restart and live-test**

Gracefully restart port 3131, verify port 9237 launches without `--user-agent`, then confirm native Chrome/150 UA, `@terafabXai`, and at least one rendered X home article through CDP.
