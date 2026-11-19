# Renderer route startup

Both windows load the same renderer entry; the Quick Hack window renders `#/quick-capture` from
it. Two scripts show what each route costs.

## What a route loads

```sh
node scripts/route-chunks.ts            # eager bytes per route
node scripts/route-chunks.ts --modules  # and the src/ modules each route evaluates
```

It builds the renderer with the project's Vite config into a temporary directory (`dist/` is left
alone) and walks the chunk graph. "Eager" is the entry chunk, the route's own chunk, and their
static imports: what the window parses before the route renders. Chunks reached only through a
later `import()` (the Quick Hack editor, reveal.js) are reported as deferred.
`src/test/route-boundaries.test.ts` keeps the workbench out of the entry's static graph.

## Startup time and memory

```sh
pnpm run build
mkdir -p .local/benchmarks/route-startup
node scripts/benchmark-route-startup.ts --runs=7 --output=.local/benchmarks/route-startup/after.json
```

The harness launches the built app with Playwright, in a throwaway profile with a local vault,
and with background windows (`HACKDESK_E2E_BACKGROUND=1`), so nothing takes the screen or the
keyboard. Each run measures:

| Scenario | How |
| --- | --- |
| `main cold` / `main warm` | Launch; a new profile, then the same profile again (Chromium's code cache filled). |
| `quick-capture-launch cold` / `warm` | Launch with `--quick-capture`, so the popup loads alongside the main window. |
| `quick-capture-open first` / `again` | In a running app with its main window loaded, open a popup window the way `showQuickCaptureWindow` does (same preload, sandbox and URL), twice. The window manager does not know this window, so its IPC calls are refused; it loads and renders the same modules. |

Times are milliseconds from the window's navigation start, read from the renderer's own
performance timeline: `domContentLoaded`, `firstContentfulPaint`, and `ready`, when the route's
first meaningful element appears (the workspace switcher; the Quick Hack editor's `.cm-content`),
recorded by a MutationObserver that an init script installs before the page's scripts run.
Memory is read 1.5 s after `ready`: the renderer process's working set (`app.getAppMetrics()`) and
`performance.memory.usedJSHeapSize`. The summary reports medians.

To compare two commits, build and run each one in turn on the same machine, with as little else
running as you can manage: background windows are throttled less predictably than visible ones,
and other builds on the machine move the numbers more than most changes do. Keep results in
`.local/`.
