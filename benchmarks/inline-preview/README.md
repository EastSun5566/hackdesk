# Inline Preview benchmark

Run from the repository root with the project's installed development dependencies:

```sh
mkdir -p .local/benchmarks/inline-preview
node scripts/benchmark-inline-preview.ts --ref=HEAD --output=.local/benchmarks/inline-preview/before.json --artifacts=.local/benchmarks/inline-preview/before
node scripts/benchmark-inline-preview.ts --output=.local/benchmarks/inline-preview/after.json --artifacts=.local/benchmarks/inline-preview/after
```

`--ref=HEAD` measures committed source; omitting `--ref` measures the working tree.
Use a different commit with `--ref` when needed. Run comparisons sequentially with
identical dependencies and fixtures. Add `--profile` to capture a CPU profile.

The harness uses an isolated Electron process, temporary app data, synthetic
Markdown, and a fixed image response. It does not load personal settings, IPC,
clipboard contents, or a user vault. It measures 100, 1,000, and 10,000 lines with
one warmup and five measured runs, including input, cursor changes, and scrolling.

Synchronous dispatch and elapsed animation-frame timings are not physical keypress
latency or INP. The editor-only fixture excludes full-app persistence and production
CSS. Programmatic checks do not establish real IME or cross-platform behavior.

Keep raw results, screenshots, recordings, profiles, and comparison reports in
`.local/`; do not commit or publish them. Keep this reusable harness in the repo.
