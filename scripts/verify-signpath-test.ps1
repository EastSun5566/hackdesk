param(
    [Parameter(Mandatory)][string] $UnsignedPath,
    [Parameter(Mandatory)][string] $SignedPath,
    [Parameter(Mandatory)][string] $CertificateBase64,
    [Parameter(Mandatory)][string] $ExpectedCertSha256,
    [ValidateSet('app', 'elevate', 'uninstaller', 'installer')][string] $Role = 'app',
    [string] $ReportPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# This script temporarily trusts a test certificate only on an ephemeral hosted runner.
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') {
    throw 'Test certificate verification requires a GitHub-hosted Windows runner.'
}
if ($ExpectedCertSha256 -notmatch '^[0-9a-fA-F]{64}$') {
    throw 'Expected certificate SHA-256 must contain exactly 64 hexadecimal characters.'
}
foreach ($path in @($UnsignedPath, $SignedPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Missing executable: $path"
    }
}

$certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
    [Convert]::FromBase64String($CertificateBase64)
)
# CurrentUser Root imports show an interactive Windows confirmation dialog.
$store = [System.Security.Cryptography.X509Certificates.X509Store]::new('Root', 'LocalMachine')
$addedTrust = $false
try {
    $fingerprint = $certificate.GetCertHashString([System.Security.Cryptography.HashAlgorithmName]::SHA256)
    if ($fingerprint -ne $ExpectedCertSha256) {
        throw 'Configured public certificate does not match the expected SHA-256.'
    }
    if ($certificate.HasPrivateKey -or $certificate.Subject -ne $certificate.Issuer) {
        throw 'Expected a public self-signed test certificate.'
    }

    $signature = Get-AuthenticodeSignature -LiteralPath $SignedPath
    if ($null -eq $signature.SignerCertificate) {
        throw 'Executable has no Authenticode signer.'
    }
    if ($signature.SignerCertificate.GetCertHashString([System.Security.Cryptography.HashAlgorithmName]::SHA256) -ne $fingerprint) {
        throw 'Executable signer does not match the expected test certificate.'
    }

    $expected = [System.Diagnostics.FileVersionInfo]::GetVersionInfo((Resolve-Path -LiteralPath $UnsignedPath).Path)
    $actual = [System.Diagnostics.FileVersionInfo]::GetVersionInfo((Resolve-Path -LiteralPath $SignedPath).Path)
    foreach ($field in @('ProductName', 'ProductVersion', 'FileVersion')) {
        if (($Role -ne 'elevate' -and [string]::IsNullOrWhiteSpace($expected.$field)) -or
            $expected.$field -cne $actual.$field) {
            throw "Executable metadata mismatch: $field"
        }
    }
    if ($Role -ne 'elevate' -and $actual.ProductName -cne 'HackDesk') {
        throw 'Executable product name must be HackDesk.'
    }

    $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $existing = $store.Certificates.Find(
        [System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
        $certificate.Thumbprint, $false
    )
    if ($existing.Count -eq 0) {
        Write-Host 'Temporarily trusting the pinned test certificate on the hosted runner.'
        $store.Add($certificate)
        $addedTrust = $true
    }
    Write-Host 'Checking Authenticode integrity and trust.'
    $signature = Get-AuthenticodeSignature -LiteralPath $SignedPath
    if ($signature.Status -ne 'Valid') {
        throw "Authenticode verification failed: $($signature.Status)"
    }

    $report = [ordered]@{
        warning = 'Test certificate / not for release'
        commit = $env:GITHUB_SHA
        status = [string]$signature.Status
        certificateSha256 = $fingerprint
        publisher = $signature.SignerCertificate.Subject
        productName = $actual.ProductName
        productVersion = $actual.ProductVersion
        fileVersion = $actual.FileVersion
        unsignedSha256 = (Get-FileHash -LiteralPath $UnsignedPath -Algorithm SHA256).Hash
        signedSha256 = (Get-FileHash -LiteralPath $SignedPath -Algorithm SHA256).Hash
    }
    if ($ReportPath) { $report | ConvertTo-Json | Set-Content -LiteralPath $ReportPath }
    else { $report }
}
finally {
    if ($addedTrust) { $store.Remove($certificate) }
    $store.Dispose()
    $certificate.Dispose()
}
