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
