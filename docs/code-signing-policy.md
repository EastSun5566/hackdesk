# Code signing policy

## Current status

Published v2 betas and main previews are unsigned and use manual updates.
Windows test signing has passed; the Foundation production certificate is pending
setup review. Test-certificate artifacts are not release downloads.

Free code signing provided by [SignPath.io](https://signpath.io), certificate by
[SignPath Foundation](https://signpath.org). Production use is subject to Foundation
review and certificate availability.

## Responsibilities and release approval

| Role | Member | Responsibility |
| --- | --- | --- |
| Committer and reviewer | [Michael Wang (@EastSun5566)](https://github.com/EastSun5566) | Maintain the repository and review contributor changes, including dependencies, build scripts, and CI configuration. |
| Release approver | [Michael Wang (@EastSun5566)](https://github.com/EastSun5566) | Review the source commit and signing request, then manually approve production signing in SignPath. |

The intended production policy requires trusted builds from this repository and
manual approval by the release approver. Production signing is not enabled yet.

## Privacy and network behavior

This describes the current v2 desktop app and the separate documentation website. A local vault does not upload its Markdown files merely
because it is opened. Using a local vault is not a guarantee of no network traffic:

- **HackMD:** Connecting an account sends its API token to `api.hackmd.io` for
  authentication. With a token configured, HackDesk can automatically fetch account
  and team information, including while a local vault is selected. Remote workspace
  browsing fetches notes and folders; saving remote notes and uploading images sends
  the selected content to HackMD. Its [privacy policy](https://hackmd.io/s/privacy)
  applies. You can disconnect the account by forgetting the configured token.
- **Remote images and links:** Rendering a note's HTTPS image or a workspace avatar
  or team logo can contact its host without a separate click. That host receives the
  image request and network information such as the IP address. Following external
  links opens the system browser. The destination's privacy policy applies; no single
  policy covers arbitrary image hosts or links.
- **Updates:** In non-beta packaged v2 builds, choosing **Check for Updates** contacts
  GitHub's release service. Downloading an available update requires confirmation.
  V2 betas and main previews use manual downloads. The
  [GitHub privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)
  applies to release downloads, update requests, and GitHub interactions.
- **Diagnostics:** The desktop app keeps logs and crash dumps on the local machine;
  crash-report uploads are disabled. Exporting a debug archive saves it locally.
  Sharing that archive or attaching files to an issue is the user's choice; inspect
  its contents before sharing. No desktop analytics integration is configured in
  the current v2 source.
- **Documentation website:** `hackdesk.eastsun.me` loads Google Analytics in the
  browser. This is separate from the desktop app; visiting the website can send
  browsing information to Google. See
  [Google's explanation of partner-site data](https://policies.google.com/technologies/partner-sites).
