# Windows test signing

This is the first step of [#181](https://github.com/EastSun5566/hackdesk/issues/181).
It signs only the packaged **HackDesk.exe** with a self-signed test certificate.
It does not sign an installer or uninstaller, create a GitHub Release, or publish updates.

The workflow first runs the full quality check on a GitHub-hosted Ubuntu runner,
matching the regular CI environment. After that succeeds, it builds on a
GitHub-hosted Windows runner, uploads the unsigned executable,
submits its artifact ID to SignPath, downloads the signed executable, verifies it,
and runs the existing packaged-startup test. Private keys remain in SignPath.

## One-time setup

1. Install the [SignPath GitHub App](https://github.com/apps/signpath) for
   `EastSun5566/hackdesk`. Link the GitHub.com trusted build system to project `hackdesk`
   in organization `17f28d05-3358-43ce-9547-e3509577e8fb`.
2. Create artifact configuration **windows-app-v1** using
   [the repository XML](https://github.com/EastSun5566/hackdesk/blob/main/build/signpath/windows-app-v1.xml).
   Allow **test-signing** to use it. Restrict this policy to this repository's `main`
   branch and GitHub-hosted builds. Its required `productVersion` and `fileVersion`
   parameters come from the packaged PE metadata, not the npm version string.
3. Create a CI API token with submitter permission for the test policy. Save it directly
   in GitHub Settings → Secrets and variables → Actions as secret **SIGNPATH_API_TOKEN**.
   Do not paste the token into an issue, pull request, or chat.
4. Export the test policy's **public** certificate as a binary DER `.cer`, without a
   private key. Set these repository variables:

   | Variable | Value |
   | --- | --- |
   | `SIGNPATH_TEST_CERTIFICATE_BASE64` | Base64 of the public DER certificate |
   | `SIGNPATH_TEST_CERT_SHA256` | SHA-256 of the certificate DER bytes; 64 hexadecimal characters without separators |

   For example, PowerShell can display the two public values from the exported file:

   ```powershell
   $bytes = [System.IO.File]::ReadAllBytes('test-certificate.cer')
   [Convert]::ToBase64String($bytes)
   [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($bytes))
   ```

## Run and inspect

After the workflow is merged and setup is complete, select **Windows SignPath test
signing** in GitHub Actions and choose **Run workflow** on `main`. It has no policy,
file, or ref inputs, and other branches and forks cannot run its signing job.

Approve the request in SignPath if the test policy requires approval. The workflow
waits up to 30 minutes for signing completion. Missing setup, refusal, timeout,
missing output, an unexpected signer, changed PE metadata, or invalid signatures
fail the job; an unsigned executable is never used as a fallback.

Verification temporarily trusts only the pinned self-signed certificate in the
ephemeral runner's LocalMachine Root store and removes that trust afterwards.
CurrentUser Root imports require interactive confirmation, which blocks unattended CI.
The scripts refuse to do this outside a GitHub-hosted Windows runner. Do not import the certificate
on your own machine merely to make a test download trusted.

The successful run provides a seven-day artifact named
**hackdesk-test-certificate-not-for-release-…** with:

- The complete unpacked app ZIP, with its signed main executable.
- `verification.json`: signature status, certificate fingerprint, PE metadata,
  unsigned/signed hashes, commit SHA, unsigned artifact ID, and signing request/run links.
- A warning that this uses a test certificate and is not a release installer.

The normal Windows package CI also exercises the verifier using an ephemeral local
fixture certificate, without SignPath credentials. It checks valid, missing, unsigned,
wrong-certificate, mismatched-metadata, and tampered executables.

Passing normal CI proves the verification scripts work. A successful **actual SignPath
workflow run** is still required to prove trusted build integration works. It does not
prove production certificate trust, installer signing, or automatic updates; those
remain later steps in #181 and the stable-release roadmap.

See [SignPath's GitHub integration](https://docs.signpath.io/trusted-build-systems/github)
and [artifact configuration examples](https://docs.signpath.io/artifact-configuration/examples).

## Complete installer test (step two)

The separate **Windows SignPath installer test** workflow builds the normal x64
NSIS installer, using a test-only signing hook. Each file pauses the builder until
the official Actions upload, SignPath request, and pinned-certificate verification
finish. The order is app → elevate helper → uninstaller → installer. The signed
uninstaller is embedded before the installer is signed; blockmaps and update
metadata are generated afterwards. The builder is locked to 26.15.3 in this test;
upgrading it requires checking that order again.

Keep the existing `windows-app-v1` configuration. Add these configurations to
project **hackdesk**, using the repository XML, and allow **test-signing** to use them:

| Slug | XML |
| --- | --- |
| `windows-elevate-v1` | [windows-elevate-v1.xml](https://github.com/EastSun5566/hackdesk/blob/main/build/signpath/windows-elevate-v1.xml) |
| `windows-uninstaller-v1` | [windows-uninstaller-v1.xml](https://github.com/EastSun5566/hackdesk/blob/main/build/signpath/windows-uninstaller-v1.xml) |
| `windows-installer-v1` | [windows-installer-v1.xml](https://github.com/EastSun5566/hackdesk/blob/main/build/signpath/windows-installer-v1.xml) |

Reuse the existing API token and public-certificate variables. Keep the same
main-only, GitHub-hosted origin restrictions. Each request uploads exactly one
executable. App/installer/uninstaller versions come from their individual PE
metadata. The helper is matched to the checksum-verified NSIS toolset instead of
requiring HackDesk product metadata.

Merge the workflow, finish this setup, then run it on **main**. If approval is
required, expect four sequential requests. Each request allows 30 minutes; the
builder hook allows 40 minutes and the Windows job allows 180 minutes overall.
Failures stop the build rather than packaging an unsigned fallback.

After signing, the workflow checks final installer hashes and recomputes its
blockmap, runs unpacked startup, silently installs to a dedicated temporary
directory, verifies the embedded signed files, checks installed fuses/startup,
and uninstalls. Certificate trust and installation changes occur only on the
ephemeral GitHub-hosted runner. Normal Windows CI exercises the bridge using a
local fixture certificate, without the SignPath token.

Seven-day artifacts include the test installer, complete app ZIP, signed
uninstaller copy, update metadata, blockmap, four signing reports/request links,
installation report, and builder logs. They are **test certificate / not for
release**. Update metadata is evidence only: nothing is published to a feed or
GitHub Release by this workflow, and automatic updating is not tested here.

Passing ordinary CI is not proof of SignPath integration. A real successful
four-request run with installation acceptance is required before preparing the
Foundation production-certificate review. Production signing/release integration
and Apple signing/notarization remain separate work; #181 stays open.
