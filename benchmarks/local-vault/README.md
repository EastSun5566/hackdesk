# Local Vault scanning benchmark

Run from the repository root using the project's Node runtime and dependencies:

```sh
mkdir -p .local/benchmarks/local-vault
node scripts/benchmark-local-vault.ts --ref=HEAD --output=.local/benchmarks/local-vault/before.json
node scripts/benchmark-local-vault.ts --output=.local/benchmarks/local-vault/after.json
```

`--ref=HEAD` measures committed source; omitting `--ref` measures the working tree.
Use a different commit with `--ref` when needed. Run comparisons sequentially with
identical dependencies. `--bytes=65536` selects larger synthetic notes.

The harness bundles the production service with an Electron stub, creates its own
temporary vaults, and removes them afterwards. It does not read personal settings
or notes. Each of the 100-, 1,000-, and 10,000-note cases uses a fresh Node process,
one warmup and five measured scan/save runs. Note count, content and ID are checked.

Timing excludes fixture creation, bundling, and cleanup. Save timing ends at the
returned snapshot and excludes watcher debounce, IPC, and UI work. RSS sampling and
warm filesystem caches limit conclusions; these are not leak measurements or
cross-platform performance guarantees. With five runs, p95 is the largest sample.

Keep raw results, machine details, and comparison reports in `.local/`; do not commit
or publish them. Keep the reusable harness in the repo.
