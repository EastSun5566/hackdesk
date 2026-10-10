# Local Vault scanning benchmark

Issue #148 limits concurrent file reads and final stat checks to 16. Every Markdown
file is still read and hashed. Stable-scan checks, manifest publication, retries,
and conservative identity matching remain unchanged. A failed pass stops starting
new tasks and waits for started tasks before releasing the vault queue.

## Reproduce

From the repository root, using the project's Node 24 runtime and installed dependencies:

```sh
node scripts/benchmark-local-vault.ts --ref=75568020a4537fee2f936f4d9bd5ee983ff79e2d --output=/tmp/vault-before.json
node scripts/benchmark-local-vault.ts --output=/tmp/vault-after.json
```

The script bundles the production service with an isolated Electron stub. It
creates and removes its own temporary vaults; it never reads personal settings or
notes. `--ref` archives committed source, and omitting it measures current source.
No production dependency or settings option is added. `--bytes=65536` can test
larger notes; the recorded comparison uses roughly 1 KiB per note.

Each size (100, 1,000, 10,000 notes) uses a fresh Node process. A scan and save warm
the scanner, manifest, and filesystem cache. Five measured runs then perform a
full scan followed by a revision-checked save returning an updated snapshot.
Every run verifies note count, saved content, and note ID. Timing excludes fixture
creation, bundling, and cleanup.

## Recorded comparison

The raw runs, source SHA-256 values, and environment are in [results.json](./results.json).
Baseline is main after #134, `75568020`; after is the working-tree implementation
with concurrency 16. Measurements ran sequentially without unit tests or builds
competing for CPU. The selected runs repeated the initial comparison.

Values below are median / p95. With only five runs, p95 is the largest sample.

| Notes | Implementation | Scan ms | Save → snapshot ms | Peak RSS MiB | Maximum event-loop delay ms |
| ---: | --- | ---: | ---: | ---: | ---: |
| 100 | Before | 8.7 / 11.2 | 18.0 / 32.0 | 105.3 / 106.1 | 10.1 / 11.1 |
| 100 | After | 8.6 / 9.9 | 17.7 / 17.9 | 98.0 / 105.3 | 10.0 / 10.0 |
| 1,000 | Before | 72.5 / 79.4 | 81.8 / 89.0 | 187.8 / 243.2 | 13.0 / 13.7 |
| 1,000 | After | 64.5 / 75.6 | 79.3 / 82.8 | 155.5 / 171.4 | 10.9 / 11.2 |
| 10,000 | Before | 721.5 / 757.8 | 780.2 / 829.1 | 654.8 / 665.9 | 58.6 / 105.1 |
| 10,000 | After | 609.6 / 615.4 | 651.9 / 654.7 | 346.8 / 376.8 | 23.0 / 25.3 |

At 10,000 notes, both comparison rounds showed lower RSS and event-loop delay.
Scan medians were 722.8 → 607.2 ms initially and 721.5 → 609.6 ms on repetition;
save medians were 773.6 → 648.0 ms and 780.2 → 651.9 ms. Small-vault timing
differences are too small to claim a general speed improvement.

Exploratory limits, same 10,000-note fixture:

| Concurrent tasks | Scan median ms | Save median ms | Peak RSS median MiB |
| ---: | ---: | ---: | ---: |
| 4 | 1,080.0 | 1,143.4 | 323.9 |
| 8 | 753.7 | 794.1 | 336.0 |
| 16 | 609.6 | 651.9 | 346.8 |

16 retained most of the memory reduction while avoiding the throughput loss at
4 and 8. It is a fixed conservative bound, not a universal hardware optimum.

## Limits

- This measures the Node scanner, not complete Electron UI latency. Save timing
  ends at the mutation's returned snapshot; it excludes watcher debounce and IPC.
- RSS is sampled every 5 ms across scan and save. It includes runtime, imported
  modules, retained snapshots, and GC effects, and may miss brief peaks. Process
  lifetime peak RSS is also recorded separately. These are not leak measurements.
- Event-loop monitoring has 10 ms resolution. Values near 10 ms are its floor;
  the column summarizes each run's maximum, not individual keyboard events.
- Filesystem caches are warm. There is no timestamp-only or content cache in the
  implementation. Cold disks, network volumes, large notes, Windows, and Linux
  performance need separate measurements; their correctness still runs in CI.
- Final stat checks and hashing still cover the complete scan. This bounds work
  and memory; it does not turn scanning into an incremental algorithm.
