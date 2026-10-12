param([Parameter(Mandatory)][string] $UnsignedPath)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$verify = Join-Path $PSScriptRoot 'verify-signpath-test.ps1'
$temporary = Join-Path $env:RUNNER_TEMP ([Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $temporary | Out-Null
Write-Host 'Creating the ephemeral code-signing certificate.'
$certificate = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=HackDesk CI verification fixture' `
    -CertStoreLocation 'Cert:\CurrentUser\My' -HashAlgorithm SHA256 -KeyExportPolicy NonExportable

try {
    $signed = Join-Path $temporary 'HackDesk.exe'
    Copy-Item -LiteralPath $UnsignedPath -Destination $signed
    Write-Host 'Signing the packaged executable fixture.'
    Set-AuthenticodeSignature -LiteralPath $signed -Certificate $certificate -HashAlgorithm SHA256 | Out-Null
    $arguments = @{
        UnsignedPath = $UnsignedPath
        SignedPath = $signed
        CertificateBase64 = [Convert]::ToBase64String($certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
        ExpectedCertSha256 = $certificate.GetCertHashString([System.Security.Cryptography.HashAlgorithmName]::SHA256)
    }
    Write-Host 'Verifying the signed executable fixture.'
    $report = & $verify @arguments
    if ($report.status -ne 'Valid') { throw 'Signed fixture did not pass verification.' }

    function Assert-Rejected([string] $Name, [hashtable] $Overrides, [string] $ExpectedError) {
        $testArguments = $arguments.Clone()
        foreach ($key in $Overrides.Keys) { $testArguments[$key] = $Overrides[$key] }
        $rejected = $false
        try { & $verify @testArguments | Out-Null }
        catch {
            if ($_.Exception.Message -notlike "*$ExpectedError*") { throw }
            $rejected = $true
        }
        if (-not $rejected) { throw "Verification accepted $Name." }
        Write-Host "Rejected $Name as expected."
    }

    Assert-Rejected 'missing executable' @{ SignedPath = (Join-Path $temporary 'missing.exe') } 'Missing executable'
    Assert-Rejected 'unsigned executable' @{ SignedPath = $UnsignedPath } 'no Authenticode signer'
    Assert-Rejected 'incorrect configured fingerprint' @{ ExpectedCertSha256 = ('0' * 64) } 'does not match the expected SHA-256'

    $otherCertificate = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=Wrong HackDesk CI signer' `
        -CertStoreLocation 'Cert:\CurrentUser\My' -HashAlgorithm SHA256 -KeyExportPolicy NonExportable
    try {
        Assert-Rejected 'incorrect signer' @{
            CertificateBase64 = [Convert]::ToBase64String($otherCertificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
            ExpectedCertSha256 = $otherCertificate.GetCertHashString([System.Security.Cryptography.HashAlgorithmName]::SHA256)
        } 'signer does not match'
    }
    finally { Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($otherCertificate.Thumbprint)" }

    Assert-Rejected 'metadata from a different executable' @{ UnsignedPath = (Join-Path $env:WINDIR 'System32\notepad.exe') } 'metadata mismatch'
    $tampered = Join-Path $temporary 'tampered.exe'
    Copy-Item -LiteralPath $signed -Destination $tampered
    # DOS stub bytes are covered by Authenticode; keep the PE header intact.
    $file = [System.IO.File]::Open($tampered, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite)
    try {
        $file.Position = 0x20
        $original = $file.ReadByte()
        $file.Position = 0x20
        $file.WriteByte([byte]($original -bxor 1))
    }
    finally { $file.Dispose() }
    Assert-Rejected 'tampered executable' @{ SignedPath = $tampered } 'Authenticode verification failed'
    if (Test-Path -LiteralPath "Cert:\CurrentUser\Root\$($certificate.Thumbprint)") {
        throw 'Verification left test certificate trust installed.'
    }
    Write-Host 'SignPath verification checks passed.'
}
finally {
    Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($certificate.Thumbprint)"
    Remove-Item -LiteralPath $temporary -Recurse -Force
    $certificate.Dispose()
}
