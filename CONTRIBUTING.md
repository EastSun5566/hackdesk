# Contributing

## Run locally

Use Node.js 24 and the pnpm version specified in `package.json`.

```sh
pnpm install
pnpm approve-builds --all
pnpm run dev
```

## Check changes

Run `pnpm run check` before opening a pull request. This also type-checks tests,
Electron E2E, and docs.

Run `pnpm run test:coverage` once to generate a local report in `.local/coverage/`.

## Maintain workflows

Workflow actions use full commit SHAs. Dependabot opens weekly update PRs;
review the upstream changes and CI results before merging. Keep the version
comments next to each pin, and verify new pins belong to the action's official
repository. Keep signing uploads as ZIP archives to match the SignPath artifact
configurations.
