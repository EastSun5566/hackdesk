# Foundation review email draft

Reply to the existing Foundation email thread after this documentation PR is merged
and the policy is online. Review the maintainer checklist and leave unresolved items
pending, including those requiring Foundation's reply. This is a draft only; it has
not been sent.

**Subject:** HackDesk setup ready for review

Hello,

Thank you for accepting HackDesk into the SignPath Foundation program. Our complete
Windows test-signing workflow has now passed, including installation, application
startup, and uninstallation.

- Organization: `17f28d05-3358-43ce-9547-e3509577e8fb`
- Project: `hackdesk`
- Successful build: https://github.com/EastSun5566/hackdesk/actions/runs/38436758001
- Source commit: `ccadfb3cc804ea8d9cbffaa5cc3d637b28234f49`
- Workflow, artifact XML, and verification evidence: https://github.com/EastSun5566/hackdesk/blob/main/docs/signpath-foundation-review.md
- Code signing policy and privacy information: https://hackdesk.eastsun.me/code-signing-policy

The test policy signed HackDesk.exe, elevate.exe, the NSIS uninstaller, and the
installer. We verified their signatures and metadata, installed-file hashes,
Electron fuses, startup, uninstallation, and final installer hashes/blockmap.
These are test-certificate CI artifacts only; production signing is not enabled.

Could you review the setup and advise on these points before arranging the
production certificate?

1. `elevate.exe` is an upstream prebuilt helper from electron-builder's
   checksum-verified NSIS toolset. Since your terms restrict signing upstream
   binaries, what is the accepted production approach for this helper?
2. HackDesk.exe uses the prebuilt Electron runtime, with our executable name,
   product resources/metadata, fuses, and packaged app code. Is this acceptable,
   or do you require changes to how we build it?
3. App ProductVersion is `2.0.0.0`; installer/uninstaller ProductVersion is
   `2.0.0-beta.5`. All three FileVersion strings are `2.0.0-beta.5`. Should we
   enforce a shared ProductVersion?
4. Please confirm the required `release-signing` certificate/Purpose, allowed
   release refs, trusted-build checks, and manual approval settings. Michael Wang
   (@EastSun5566) is the designated release approver; production settings still
   need confirmation.

The GitHub test artifacts expire on October 20, 2026 at 17:23 UTC. We have retained
a local copy and committed the compact verification record.

Thank you!

Michael Wang
https://github.com/EastSun5566
