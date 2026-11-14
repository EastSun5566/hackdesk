# Agent guide

HackDesk is the Electron desktop app for HackMD. The renderer is React + Vite (`src/`), and the
main process lives in `electron/src/`. See `CONTRIBUTING.md` for setup.

## Verify changes without the full E2E suite

CI runs everything on every push (`.github/workflows/build.yml`, "Quality and package smoke"), and
a run usually takes about 6 minutes: three E2E shards of about 3 minutes each, with the unit job
(about 4 minutes) as the slowest. So don't run the whole Playwright suite or the whole `pnpm test`
locally to "be safe"; let CI do that.

Locally, while iterating, run only what the change touches:

- Unit tests for the files you changed: `pnpm exec vitest run src/components/hackmd-live-preview`
  (a directory or file path). Don't pipe test output through `tail`; it cuts off the failure names.
- One E2E spec when the change needs it: `pnpm exec playwright test --config electron/playwright.config.ts electron/e2e/<spec>.spec.ts`.
  Run `pnpm run build` first; specs launch the built app.

**Before every push**, run `pnpm run check:static` (under a minute). It is what CI's `static` job
runs: all `typecheck:*` projects, `lint:ts`, knip (`check:deps`, unused exports and dependencies),
the workflow lint and the HackMD contract check. Knip is the one most often missed; it has failed
CI for an export only a test used.

Waiting for CI: `gh pr checks <pr>` shows the state; don't block on `gh pr checks --watch` in the
foreground (it outlives tool timeouts, and exits early while checks are still queued). A PR is
ready when every check is green. macOS runners are scarce: a macOS job can wait 10 minutes for one,
and a job that no runner picked up ("The job was not acquired by Runner") is not a code failure.
Rerun it with `gh run rerun <run-id> --failed`.

Test timeouts while other agents or builds are running on the machine are load, not flakiness.
`SettingsDialog.*.test.tsx` renders the whole dialog in every test (about a second each), so it is
the first to time out. Rerun the file alone before concluding a test is flaky.

Two cases need more than that:

- A change to an app-wide flow (startup, workspace scope, tabs, settings) can break specs that look
  unrelated, so passing a subset does not make it done. It is done when the whole suite passes, in CI
  or locally (`pnpm run build`, then the Playwright command above without a spec, about seven minutes).
- Refactoring a flow: land its characterization tests first, and show each one fails when the code it
  pins is removed. Then the refactor is checked by tests known to catch a regression.

## See a rendering change in the running app

`pnpm render:preview` (`scripts/render-preview.ts`) opens a note in a throwaway profile and writes
editor screenshots, in light and dark mode, to `.local/render-preview/`. It starts its own Vite dev
server, so every run reflects the current source; it never touches your real settings or windows.

- The default note, `scripts/fixtures/render-preview/Render Preview.md`, covers every live-preview
  feature (lists, images and sizes, inline HTML, code fences, alerts, containers, tables, math).
  Add a section there when you add a rendering feature.
- `--scroll-to "<source text>"` starts the shot where that markdown appears, `--click "<source text>"`
  puts the cursor there (to see that line's source revealed), `--modes dark`, `--note <file.md>`, `--eval "<js>"` to print DOM facts.
- Look at both screenshots before calling a visual change done.

Gotcha: the dev server must be reached as `localhost`, not `127.0.0.1` (Vite may listen on `::1` only),
or the window stays blank.

The default shots are page screenshots of the editor. They never include what macOS draws behind
the page: the vibrancy material of a translucent window or sidebar, the frame and traffic lights.
For any change to translucency, the sidebar's sticky rows or the window frame, use
`pnpm render:preview --window --translucency <subtle|medium|clear>`. It shows the window on screen
and captures it as the screen shows it; it needs an awake, unlocked screen and Screen Recording
permission. Don't explain away a difference in a page screenshot as "the real window will look
softer". If you cannot capture the real window, say so in the handoff, and the PR is not ready to
merge until someone has looked at it on a real Mac.

## Running the app from a T3 worktree

A new worktree needs its own `pnpm install`. If Electron fails to launch with a missing binary or
`Library not loaded: @rpath/Electron Framework`, its download is missing or truncated: run
`rm -rf node_modules/electron/dist && node node_modules/electron/install.js`. The macOS-only
`app-lifecycle.spec.ts` needs a window that can take focus, so it doesn't pass in a background or
sandboxed agent session; leave it to CI (it runs in the macOS package-smoke job).

## The editor's rendering pipeline

The note editor is a CodeMirror 6 live preview, not an HTML renderer: the markdown source stays in
the document and is decorated in place. markdown-it is only used for slides (`src/pages/presentation`).
Everything is in `src/components/hackmd-live-preview/`:

- `inline-preview.ts`: the viewport-only ViewPlugin. It adds line classes (headings, quotes, code),
  inline marks, and hides syntax on lines without the cursor ("active lines" show source).
- `hfm-*.ts`: HackMD-flavoured recognizers (alerts, containers, `[name=]` tags, fence options,
  HackMD inline marks) run per line; `hfm-document-index.ts` caches per-document results.
- `hfm-blocks.ts` (images), `rich-preview-widgets.ts` (math, mermaid, csvpreview, emoji, icons),
  `hackmd-tables.ts`, `task-list-widgets.ts` (bullets, ordered markers, checkboxes): widgets.
  Block widgets must come from a StateField, not a ViewPlugin.
- `hackmd-preview-theme-sections.ts`: all editor CSS (as `EditorView.theme` objects);
  `hackmd-syntax.ts`: the highlight style. Colours come from theme tokens in `src/lib/themes.ts`
  (`--text-*`, `--background-*`, `--code-*`); never hard-code a colour that must work in both modes.

Widgets build DOM with `createElement`/`textContent`. Never assign note content to `innerHTML`
except output from a renderer that sanitizes it (KaTeX, Mermaid with its strict config).

## HackMD compatibility

The same notes open in the HackMD web app, so HackMD-specific syntax must mean the same thing here.
How a note renders on hackmd.io (and in HackMD's public docs) is the reference; where HackDesk shows
something differently, it must still accept the same source. Examples: the image size grammar
(`![alt](src "title" =WxH)`, the `x` is required, `%` allowed) and code fence options
(`=` / `=N` / `=+` line numbers, `!` wrapping).

## Constraints

- This repository is public. Don't reference private HackMD code, repositories or internal paths in
  code, comments, docs or commit messages; describe HackMD behaviour as it is publicly observable.

- Ask before large design changes (a new code-block theme, the typography scale, new chrome).
- Keep commits small and focused, with tests for testable behaviour.
- Don't push or open PRs unless asked.
