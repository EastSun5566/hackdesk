param(
    [Parameter(Mandatory)][System.Security.Cryptography.X509Certificates.X509Certificate2] $Certificate
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') {
    throw 'Installer fixture requires a GitHub-hosted Windows runner.'
}
$previous = @{}
foreach ($name in @('SIGNPATH_DIRECTORY', 'CERTIFICATE_BASE64', 'CERTIFICATE_SHA256', 'GITHUB_OUTPUT', 'GITHUB_ENV',
    'UNSIGNED_ARTIFACT_ID', 'SIGNING_REQUEST_ID', 'SIGNING_REQUEST_URL', 'HACKDESK_PACKAGED_BINARY', 'CSC_IDENTITY_AUTO_DISCOVERY')) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name)
}
$env:SIGNPATH_DIRECTORY = Join-Path $env:RUNNER_TEMP "signpath-installer-fixture-$([Guid]::NewGuid())"
$env:CERTIFICATE_BASE64 = [Convert]::ToBase64String($Certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
$env:CERTIFICATE_SHA256 = $Certificate.GetCertHashString([System.Security.Cryptography.HashAlgorithmName]::SHA256)
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
$env:UNSIGNED_ARTIFACT_ID = 'fixture'
$env:SIGNING_REQUEST_ID = 'fixture'
$env:SIGNING_REQUEST_URL = 'https://example.invalid/fixture'
function Invoke-Bridge([string] $Command, [string] $Role) {
    node scripts/signpath-bridge.cjs $Command $Role
    if ($LASTEXITCODE -ne 0) { throw "Signing bridge failed: $Command $Role" }
}
try {
    Invoke-Bridge 'start' ''
    $env:GITHUB_OUTPUT = Join-Path $env:SIGNPATH_DIRECTORY 'fixture-outputs'
    $env:GITHUB_ENV = Join-Path $env:SIGNPATH_DIRECTORY 'fixture-environment'
    $names = @('HackDesk.exe', 'elevate.exe', 'Uninstall-HackDesk.exe', 'HackDesk-Installer.exe')
    $roles = @('app', 'elevate', 'uninstaller', 'installer')
    for ($index = 0; $index -lt $roles.Count; $index++) {
        $role = $roles[$index]
        Invoke-Bridge 'prepare' $role
        $directory = Join-Path $env:SIGNPATH_DIRECTORY $role
        $signedDirectory = Join-Path $directory 'signed'
        New-Item -ItemType Directory -Path $signedDirectory | Out-Null
        $signed = Join-Path $signedDirectory $names[$index]
        Copy-Item -LiteralPath (Join-Path $directory "unsigned/$($names[$index])") -Destination $signed
        Set-AuthenticodeSignature -LiteralPath $signed -Certificate $Certificate -HashAlgorithm SHA256 | Out-Null
        Invoke-Bridge 'accept' $role
    }
    Invoke-Bridge 'finish' ''
    ./scripts/signpath-installer.ps1 -Action Install
    $env:HACKDESK_PACKAGED_BINARY = Join-Path $env:SIGNPATH_DIRECTORY 'installed/HackDesk.exe'
    node scripts/check-electron-fuses.ts $env:HACKDESK_PACKAGED_BINARY
    if ($LASTEXITCODE -ne 0) { throw 'Installed fixture fuses changed.' }
    pnpm exec playwright test --config electron/playwright.packaged.config.ts electron/e2e/packaged-startup.spec.ts
    if ($LASTEXITCODE -ne 0) { throw 'Installed fixture did not start.' }
    ./scripts/signpath-installer.ps1 -Action Uninstall
    ./scripts/signpath-installer.ps1 -Action Archive
    Write-Host 'Four-phase NSIS fixture, metadata, installation and startup passed.'
}
finally {
    if (Test-Path -LiteralPath (Join-Path $env:SIGNPATH_DIRECTORY 'session.json')) {
        node scripts/signpath-bridge.cjs cleanup
    }
    try {
        if (Test-Path -LiteralPath (Join-Path $env:SIGNPATH_DIRECTORY 'installed')) {
            ./scripts/signpath-installer.ps1 -Action Uninstall
        }
    }
    catch {
        # The success path checks uninstall; failed-run cleanup must not mask the original error.
        Write-Warning "Installer fixture cleanup failed: $($_.Exception.Message)"
    }
    finally {
        # Keep logs/reports in RUNNER_TEMP for failure diagnostics; never persist fixture private keys.
        foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name]) }
    }
}
