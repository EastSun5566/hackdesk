# SignPath Foundation setup review

## Verified test build

- Repository: [EastSun5566/hackdesk](https://github.com/EastSun5566/hackdesk).
- Source commit: [`ccadfb3cc804ea8d9cbffaa5cc3d637b28234f49`](https://github.com/EastSun5566/hackdesk/commit/ccadfb3cc804ea8d9cbffaa5cc3d637b28234f49).
- Actual SignPath run: [38436758001](https://github.com/EastSun5566/hackdesk/actions/runs/38436758001), successful on October 13, 2026 UTC / October 14 Taipei time.
- Organization: `17f28d05-3358-43ce-9547-e3509577e8fb`; project: `hackdesk`; policy: `test-signing`.
- Test signer: `CN=Test certificate for 'HackDesk [OSS]'`.
- Certificate DER SHA-256: `C435F8A8A17E62C8557A775FAF4479CD234F2201124FDB2BF4B0F261159B7D18`.
- Build tools: Node 24, pnpm 11.26.0, locked electron-builder 26.15.3; GitHub-hosted Ubuntu quality checks and Windows x64 packaging.

The [compact evidence record](https://github.com/EastSun5566/hackdesk/blob/main/docs/signpath-test-evidence.json) preserves request IDs,
unsigned artifact IDs, signature results, PE metadata, and before/after SHA-256
hashes copied from the downloaded verification reports.

| Stage | Configuration | Signing request |
| --- | --- | --- |
| App | `windows-app-v1` | [5d0278d8-a790-4004-8b32-d3fbf21d8d23](https://app.signpath.io/Web/17f28d05-3358-43ce-9547-e3509577e8fb/SigningRequests/5d0278d8-a790-4004-8b32-d3fbf21d8d23) |
| Helper | `windows-elevate-v1` | [ba0999dc-aca2-4423-82cf-4d35c519785d](https://app.signpath.io/Web/17f28d05-3358-43ce-9547-e3509577e8fb/SigningRequests/ba0999dc-aca2-4423-82cf-4d35c519785d) |
| Uninstaller | `windows-uninstaller-v1` | [28d4582f-8f70-474a-8a7f-5597665b08ef](https://app.signpath.io/Web/17f28d05-3358-43ce-9547-e3509577e8fb/SigningRequests/28d4582f-8f70-474a-8a7f-5597665b08ef) |
| Installer | `windows-installer-v1` | [27c134d0-38a1-4877-9d64-325f2e8836a8](https://app.signpath.io/Web/17f28d05-3358-43ce-9547-e3509577e8fb/SigningRequests/27c134d0-38a1-4877-9d64-325f2e8836a8) |

SignPath request pages require authorized organization access. Source and workflow
links below are pinned to the reviewed commit.

## Acceptance results and retained artifacts

- All four signing requests succeeded; all four Authenticode results were `Valid`
  with the pinned test signer and unchanged PE metadata.
- Installed app, helper, and uninstaller hashes matched their verified signed copies.
- Electron fuses and the packaged-startup spec passed for both unpacked and installed apps.
- Silent uninstallation removed the installed program files. The verifier removed
  temporary test-certificate trust after each verification.
- Final installer size and SHA-512 matched `latest.yml`; its recomputed blockmap matched.
- This workflow created CI artifacts only. It did not publish a GitHub Release or
  update feed, and it did not test automatic updating or ordinary Windows certificate trust.

The output artifact is **hackdesk-installer-test-certificate-not-for-release-38436758001-1**
([artifact 11833069221](https://github.com/EastSun5566/hackdesk/actions/runs/38436758001/artifacts/11833069221)).
It expires on **2026-10-20 17:23:21 UTC / 2026-10-21 01:23:21 Asia/Taipei**.
An unchanged local copy is retained under the repository's ignored
`release/signpath-review/38436758001/` directory. It includes binaries, reports, and
builder logs; those large files are not committed. The JSON evidence remains in Git
after the GitHub artifact expires.

## Materials for Foundation review

- [Complete test workflow](https://github.com/EastSun5566/hackdesk/blob/ccadfb3cc804ea8d9cbffaa5cc3d637b28234f49/.github/workflows/windows-signpath-installer-test.yml)
  and [shared signing action](https://github.com/EastSun5566/hackdesk/blob/ccadfb3cc804ea8d9cbffaa5cc3d637b28234f49/.github/actions/signpath-test-file/action.yml).
- Artifact XML: [app](https://github.com/EastSun5566/hackdesk/blob/ccadfb3cc804ea8d9cbffaa5cc3d637b28234f49/build/signpath/windows-app-v1.xml),
  [helper](https://github.com/EastSun5566/hackdesk/blob/ccadfb3cc804ea8d9cbffaa5cc3d637b28234f49/build/signpath/windows-elevate-v1.xml),
  [uninstaller](https://github.com/EastSun5566/hackdesk/blob/ccadfb3cc804ea8d9cbffaa5cc3d637b28234f49/build/signpath/windows-uninstaller-v1.xml),
  [installer](https://github.com/EastSun5566/hackdesk/blob/ccadfb3cc804ea8d9cbffaa5cc3d637b28234f49/build/signpath/windows-installer-v1.xml).
- [Code signing policy](./code-signing-policy.md) and [email draft](./signpath-foundation-email.md).

## Questions requiring Foundation guidance

1. **Upstream helper:** `elevate.exe` comes from the checksum-verified, locked NSIS
   toolset downloaded by electron-builder. We do not maintain or build its source.
   The test hook checked its source hash before signing. Foundation's
   [terms](https://signpath.org/terms.html) restrict signing upstream binaries:
   how should we package and handle this helper for production?
2. **Electron executable:** HackDesk.exe starts with the downloaded Electron runtime.
   Packaging changes its executable name, product resources/metadata, and fuses,
   and includes HackDesk's app code. Does this packaging satisfy your requirements,
   or are additional source/build restrictions necessary?
3. **Version restrictions:** App ProductVersion is `2.0.0.0`, while installer and
   uninstaller ProductVersion are `2.0.0-beta.5`; all three FileVersion strings are
   `2.0.0-beta.5`. Is a shared PE ProductVersion required for these artifacts?
4. **Production policy:** Please confirm the certificate/Purpose, trusted-build
   restrictions, allowed release refs, and approval settings required for
   `release-signing`. Its existence alone is not proof that those settings are ready.

No production signing is enabled until these questions are resolved.

## Maintainer checklist

These items need confirmation in the portal and accounts; source inspection does
not establish them. Do not mark them complete without verification.

- [ ] All maintainers/reviewers/approvers use MFA for GitHub and SignPath.
- [ ] The role list in the public policy matches current repository permissions.
- [ ] Production certificate and signing policy both have the release Purpose.
- [ ] `release-signing` requires the linked GitHub trusted build system and origin verification.
- [ ] Allowed release refs are explicit and accepted by Foundation; no wildcard-all policy.
- [ ] CI builds has submitter permission only; @EastSun5566 is the manual approver.
- [ ] Upstream executable handling and PE version restrictions are accepted by Foundation.
- [ ] This documentation PR is merged and the policy is available on the homepage/download page before emailing the final links.

Follow [SignPath's policy configuration documentation](https://docs.signpath.io/projects).
Reply to the original Foundation email thread using the draft; do not include tokens
or private keys. Keep [#181](https://github.com/EastSun5566/hackdesk/issues/181) open.
Production signing, install/update acceptance, and release integration follow the
setup review; Apple signing/notarization remains a separate stable-release requirement.
