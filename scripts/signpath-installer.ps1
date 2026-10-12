param(
    [Parameter(Mandatory)][ValidateSet('Metadata', 'Install', 'Uninstall', 'Archive')][string] $Action,
    [string] $Path
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') {
    throw 'Installer tests require a GitHub-hosted Windows runner.'
}
if ($Action -eq 'Metadata') {
    $metadata = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($Path)
    @{ productName = $metadata.ProductName; productVersion = $metadata.ProductVersion; fileVersion = $metadata.FileVersion } | ConvertTo-Json -Compress
    exit
}
$root = $env:SIGNPATH_DIRECTORY
$session = Get-Content -LiteralPath (Join-Path $root 'session.json') -Raw | ConvertFrom-Json
$installation = Join-Path $root 'installed'
function Invoke-BoundedProcess([string] $Executable, [string] $Arguments) {
    $process = Start-Process -FilePath $Executable -ArgumentList $Arguments -PassThru
    if (-not $process.WaitForExit(120000)) {
        Stop-Process -Id $process.Id -Force
        throw 'Installer process timed out.'
    }
    $process.Refresh()
    if ($process.ExitCode -ne 0) { throw "Installer process failed: $($process.ExitCode)" }
}
if ($Action -eq 'Install') {
    if (Test-Path -LiteralPath $installation) { throw 'Expected a fresh installation directory.' }
    "HACKDESK_PACKAGED_BINARY=$(Join-Path $installation 'HackDesk.exe')" >> $env:GITHUB_ENV
    # NSIS requires /D to be the last argument, without quotes even when it contains spaces.
    Invoke-BoundedProcess $session.installer "/S /D=$installation"
    $files = @(
        @{ role = 'app'; relative = 'HackDesk.exe'; staged = 'HackDesk.exe' },
        @{ role = 'elevate'; relative = 'resources\elevate.exe'; staged = 'elevate.exe' },
        @{ role = 'uninstaller'; relative = 'Uninstall HackDesk.exe'; staged = 'Uninstall-HackDesk.exe' }
    )
    foreach ($file in $files) {
        $installed = Join-Path $installation $file.relative
        $directory = Join-Path $root $file.role
        $signed = Join-Path $directory "signed/$($file.staged)"
        if ((Get-FileHash -LiteralPath $installed -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $signed -Algorithm SHA256).Hash) {
            throw "Installed file does not match verified signature: $($file.role)"
        }
        ./scripts/verify-signpath-test.ps1 -UnsignedPath (Join-Path $directory "unsigned/$($file.staged)") `
            -SignedPath $installed -CertificateBase64 $env:CERTIFICATE_BASE64 -ExpectedCertSha256 $env:CERTIFICATE_SHA256 `
            -Role $file.role -ReportPath (Join-Path $directory 'installed-verification.json')
    }
}
elseif ($Action -eq 'Uninstall') {
    $uninstaller = Join-Path $installation 'Uninstall HackDesk.exe'
    if (Test-Path -LiteralPath $uninstaller) {
        # _?= runs in place instead of spawning an unobserved temporary uninstaller.
        Invoke-BoundedProcess $uninstaller "/S _?=$installation"
        # Running in place leaves the uninstaller itself; remove it only after other files disappear.
        foreach ($relative in @('HackDesk.exe', 'resources\elevate.exe', 'resources\app.asar')) {
            if (Test-Path -LiteralPath (Join-Path $installation $relative)) { throw "Uninstall left $relative behind." }
        }
        Remove-Item -LiteralPath $uninstaller -Force
        if (@(Get-ChildItem -LiteralPath $installation -Recurse -File).Count -ne 0) { throw 'Uninstall left application files behind.' }
        Remove-Item -LiteralPath $installation -Recurse -Force
        @{ status = 'uninstalled'; directory = $installation } | ConvertTo-Json | Set-Content (Join-Path $root 'installation-verification.json')
    }
    elseif (Test-Path -LiteralPath $installation) { throw 'Partial installation is missing its uninstaller.' }
}
elseif ($Action -eq 'Archive') {
    if (-not (Test-Path -LiteralPath (Join-Path $root 'installation-verification.json'))) { throw 'Missing installation acceptance.' }
    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        (Join-Path $session.output 'win-unpacked'), (Join-Path $root 'HackDesk-test-certificate-not-for-release.zip'),
        [System.IO.Compression.CompressionLevel]::Optimal, $true
    )
    'TEST CERTIFICATE / NOT FOR RELEASE. This installer is for signing integration tests only; it is not trusted by normal Windows installations.' | Set-Content (Join-Path $root 'README.txt')
}
