# Automation Live Board Design QA

- Source visual truth: `.tmp/design-qa/automation-option-1-source.png`
- Normalized source: `.tmp/design-qa/automation-source-normalized-1360x1024.png`
- Implementation screenshot: `.tmp/design-qa/automation-implementation-1360x1024.jpg`
- Side-by-side comparison: `.tmp/design-qa/automation-comparison-1360x1024.png`
- These screenshots are local QA artifacts and are intentionally not versioned.
- Route: `http://localhost:3131/discovery?view=automation#controls`
- State: light theme, automation enabled, SSE connected, recent activity collapsed
- CSS viewport: `1360 x 1024`
- Source pixels: `1487 x 1058`, normalized with contain-fit to `1360 x 1024`
- Implementation pixels: `1360 x 1024`
- Density normalization: source and implementation compared at 1x output

**Findings**

- No remaining P0, P1, or P2 visual or interaction mismatch.
- Fonts and typography: Geist Variable remains the product font. The implementation preserves the source hierarchy with 14–16px operating text, tabular counts, restrained weights, and truncation for long live items.
- Spacing and layout rhythm: the existing 288px sidebar and inset shell are preserved. The six-stage board, health strip, status summary, and recent-activity table follow the source composition without nested dashboard cards.
- Colors and visual tokens: the existing neutral shadcn tokens remain primary. Blue is limited to active work, amber to delay, green to successful completion/connection, and red to actual failures. Every state also has an icon and Korean text label.
- Image quality and asset fidelity: the selected design contains no custom raster imagery. Existing product marks and Lucide line icons are rendered natively; no placeholder art, custom SVG, CSS illustration, or emoji substitute was introduced.
- Copy and content: all visible stage counts, throughput, timestamps, queue details, and recent activities come from the live server snapshot. No mock operational data is displayed.
- Accessibility: the board has a named region and live connection status, the progress indicator exposes numeric values, row expansion uses `aria-expanded`, focus rings are visible, and animation respects reduced-motion preferences.

**Comparison History**

1. Initial comparison
   - [P2] The stage grid exceeded its scroller by 21px at the desktop QA viewport, exposing an unnecessary horizontal scrollbar.
   - [P2] A historical Gemini review error could appear as a current live failure.
   - Fixes: reduced the six-stage minimum grid width from 1020px to 960px; limited live failure activity to the most recent 24 hours; changed completed coverage scans from active to completed activity.
2. Post-fix comparison
   - Stage scroller measured `clientWidth=999`, `scrollWidth=999`, and page overflow `0`.
   - All six stages were present in the DOM at the same state.
   - The stale review error was absent.
   - Browser console warning/error count was `0`.
   - No actionable P0/P1/P2 differences remained.

**Focused Region Evidence**

- Pipeline region: the health strip, six stages, delayed queue emphasis, status totals, and throughput match the selected hierarchy.
- Recent activity region: selecting a live row changed `aria-expanded` to `true` and exposed the real target context plus a unique `X에서 확인` link.
- Activity filter: the filter opened and closed successfully without console errors.
- Pause control: rendered enabled with the current automation state; it was intentionally not activated during QA to avoid stopping production automation.

**Implementation Checklist**

- [x] SSE reconnect state and server heartbeat
- [x] SSE timer/response cleanup on disconnect
- [x] Six-stage live pipeline board
- [x] Actual queue, throughput, delay, and completion metrics
- [x] Expandable recent activity rows
- [x] Working filters and existing date/sort controls
- [x] Existing automation controls retained below the live board
- [x] Responsive board without page overflow
- [x] Build, regression tests, console check, and visual comparison

**Follow-up Polish**

- P3: a future iteration could add a user-controlled compact-density preference for operators who keep the page open on smaller monitors.

final result: passed
