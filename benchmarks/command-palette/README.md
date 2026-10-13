# Command palette benchmark

Run sequentially from the repository root with the project's installed dependencies:

```sh
mkdir -p .local/benchmarks/command-palette
node scripts/benchmark-command-palette.ts --ref=HEAD --output=.local/benchmarks/command-palette/before.json
node scripts/benchmark-command-palette.ts --output=.local/benchmarks/command-palette/after.json
```

`--ref=HEAD` measures committed source; omitting `--ref` measures the working tree.
Use a different commit with `--ref` when needed. Compare the same fixtures and
installed dependencies without competing tests or builds.

The harness bundles the real palette in an isolated Electron window with synthetic
notes. It does not load personal settings, IPC, clipboard contents, or user notes.
Each of the 1,000- and 10,000-note cases has one warmup and five measured runs,
covering closed parent updates, opening, and queries.

React profiling measures subtree render CPU time. It excludes DOM commit, effects,
paint, and asynchronous follow-up renders; it is not physical keypress latency,
INP, or full-app performance. Production CSS is not loaded.

Keep raw samples, machine details, and comparison reports in `.local/`; do not commit
or publish them. Keep the reusable harness and synthetic fixtures in the repo.
