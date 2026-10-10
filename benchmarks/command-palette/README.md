# Command palette benchmark

Run sequentially from the repository root with the project's installed dependencies:

```sh
node scripts/benchmark-command-palette.ts --ref=3a83c1d8ce9441617414f7086ad7be16140845de --output=/tmp/palette-before.json
node scripts/benchmark-command-palette.ts --output=/tmp/palette-after.json
```

The harness bundles the real `CommandPaletteDialog` and launches an isolated
Electron window. It never loads production settings, IPC, clipboard or user notes.
`--ref` archives the requested source and uses the same fixture and dependencies
for both builds. The recorded files include raw samples and the SHA-256 of the
three changed production modules. No dependencies are added.

React's production profiling renderer measures subtree **render CPU time**, using
the same renderer for `createRoot`, `flushSync` and portals. This excludes DOM
commit, effects, paint and asynchronous follow-up renders. It is not physical
keypress latency, INP or the complete Home screen's cost. Production CSS is not
loaded; existing Electron smoke tests cover actual layout and interactions.

The fixture uses 1,000 and 10,000 notes in one folder, distinct update times,
project tags and two recent records. Each size has one warmup and five measured
runs. A run performs 30 closed parent updates with stable data references, opens
with an empty query, then performs 30 queries cycling through `note`, `project`,
`plan`, `not`, `planning` and `note 99`. Two animation frames separate open/query
updates but are excluded from render timing. Closing between runs releases the
cached searches. First-query index construction is included.

## Recorded comparison

2026-10-10, Apple M1, macOS arm64, Electron 44.4.5 / Chromium 152 / React 18.3.1.
Baseline is main `3a83c1d`; after is this change. Measurements ran sequentially
without tests or builds competing for CPU. Values are median / p95 in ms;
opening has five samples, so its p95 is the largest sample.

| Notes | Closed before → after | Open before → after | Query before → after |
| ---: | --- | --- | --- |
| 1,000 | 0.1 / 0.2 → 0.0 / 0.1 | 2.3 / 2.5 → 2.3 / 2.7 | 6.3 / 8.2 → 5.4 / 7.6 |
| 10,000 | 0.2 / 0.4 → 0.0 / 0.1 | 1.8 / 1.9 → 2.7 / 3.4 | 43.7 / 64.6 → 32.6 / 51.9 |

Across the five runs, 10,000-note query medians ranged from 43.2–45.5 ms before
and 32.4–33.9 ms after. Differences
for 1,000 notes and opening are small; no general speedup is claimed there.
Closed samples are near Chromium's timer resolution: `0.0` does not mean no work.
Unit tests directly verify that closed updates do not sort notes or prepare
searches, and opening after hidden data changes displays current results.

Query cost still scales with note count: matching, fuzzy scoring and sorting
results remain. This change skips hidden calculations and reuses normalized
records and the Fuse index while inputs are unchanged. Draft updates, backups
and workspace persistence are unchanged. Windows/Linux performance and
full-app input latency require separate measurements.
