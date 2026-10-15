# Contributing

## Run locally

Use Node.js 24 and the pnpm version specified in `package.json`.

```sh
pnpm install
pnpm run dev
```

`pnpm install` uses the build-script allowlist in `pnpm-workspace.yaml`.
Review changes to that allowlist instead of approving every dependency's scripts.

## Check changes

Run `pnpm run check` before opening a pull request. This also type-checks tests,
Electron E2E, and docs.

Run `pnpm run test:coverage` once to generate a local report in `.local/coverage/`.

Keep pull requests focused and include how you checked the change. Report
security vulnerabilities privately using the [security policy](SECURITY.md).

## Maintain workflows

Workflow actions use full commit SHAs. Dependabot opens weekly update PRs;
review the upstream changes and CI results before merging. Keep the version
comments next to each pin, and verify new pins belong to the action's official
repository. Keep signing uploads as ZIP archives to match the SignPath artifact
configurations.
