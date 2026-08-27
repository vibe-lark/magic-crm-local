$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$ProjectDir = Split-Path -Parent $PSScriptRoot
$CertDir = Join-Path $ProjectDir ".cert"
$CertFile = Join-Path $CertDir "localhost.pem"
$KeyFile = Join-Path $CertDir "localhost-key.pem"
$EnvFile = Join-Path $ProjectDir ".env.local"
$BaseUrl = "https://localhost:3000"
$CallbackUrl = "$BaseUrl/oauth/feishu/callback"
$McpUrl = "$BaseUrl/api/mcp"
$MkcertVersion = "1.4.4"
$SetupOnly = $false
$CheckOnly = $false
$ResetDatabase = $false
$OpenFeishu = $false

function Write-Info([string]$Message) {
  Write-Host "[local-demo] $Message" -ForegroundColor Cyan
}

function Write-Success([string]$Message) {
  Write-Host "[local-demo] $Message" -ForegroundColor Green
}

function Stop-WithError([string]$Message) {
  Write-Host "[local-demo] $Message" -ForegroundColor Red
  exit 1
}

function Show-Usage {
  @"
Usage: powershell.exe -File scripts\local-demo.ps1 [--setup-only] [--check] [--reset-db] [--open-feishu]

  --setup-only  Configure dependencies, environment, certificate and database.
  --check       Read-only validation of the local HTTPS deployment.
  --reset-db    Reset CRM demo data before starting (destructive to local demo data).
  --open-feishu Copy the callback and open this app's Feishu security settings.
"@ | Write-Host
}

foreach ($Argument in $args) {
  switch ($Argument) {
    "--setup-only" { $SetupOnly = $true }
    "--check" { $CheckOnly = $true }
    "--reset-db" { $ResetDatabase = $true }
    "--open-feishu" { $OpenFeishu = $true }
    "-h" { Show-Usage; exit 0 }
    "--help" { Show-Usage; exit 0 }
    default { Show-Usage; Stop-WithError "Unknown argument: $Argument" }
  }
}

if ($CheckOnly -and $ResetDatabase) {
  Stop-WithError "--check cannot be combined with --reset-db"
}
if ($CheckOnly -and $OpenFeishu) {
  Stop-WithError "--check cannot be combined with --open-feishu"
}
if ($CheckOnly -and $SetupOnly) {
  Stop-WithError "--check cannot be combined with --setup-only"
}

function Assert-SupportedWindows {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    Stop-WithError "This script only supports Windows. Use local-demo.sh on macOS or Linux."
  }

  $WindowsVersion = [Environment]::OSVersion.Version
  if ($WindowsVersion.Major -lt 10) {
    Stop-WithError "Windows 10 or Windows 11 is required."
  }

  $Architecture = $env:PROCESSOR_ARCHITECTURE
  if ($env:PROCESSOR_ARCHITEW6432) {
    $Architecture = $env:PROCESSOR_ARCHITEW6432
  }
  if ($Architecture -ne "AMD64") {
    Stop-WithError "Only Windows 10/11 x64 is supported. Detected architecture: $Architecture"
  }
}

function Enable-Tls12 {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
}

function Find-CommandPath([string]$Name) {
  $Command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $Command) {
    return $null
  }
  return $Command.Source
}

function Ensure-Bun {
  $BunPath = Find-CommandPath "bun.exe"
  if ($BunPath) {
    return $BunPath
  }
  if ($CheckOnly) {
    Stop-WithError "Bun is missing. Run the setup command first."
  }

  Write-Info "Installing Bun with the official Windows installer"
  Enable-Tls12
  try {
    $BunInstaller = Invoke-RestMethod -Uri "https://bun.sh/install.ps1" -UseBasicParsing
    Invoke-Expression $BunInstaller | Out-Host
  } catch {
    Stop-WithError "Bun installation failed: $($_.Exception.Message)"
  }
  $BunBin = Join-Path $env:USERPROFILE ".bun\bin"
  if ($env:Path -notlike "*$BunBin*") {
    $env:Path = "$BunBin;$env:Path"
  }
  $BunPath = Find-CommandPath "bun.exe"
  if (-not $BunPath) {
    Stop-WithError "Bun installation completed but bun.exe is not on PATH. Open a new terminal and retry."
  }
  return $BunPath
}

function Ensure-Mkcert {
  $MkcertPath = Find-CommandPath "mkcert.exe"
  if ($MkcertPath) {
    return $MkcertPath
  }

  $ToolDir = Join-Path $env:LOCALAPPDATA "MagicCrmDemo\bin"
  $DownloadedMkcert = Join-Path $ToolDir "mkcert.exe"
  if (Test-Path -LiteralPath $DownloadedMkcert) {
    return $DownloadedMkcert
  }
  if ($CheckOnly) {
    Stop-WithError "mkcert is missing. Run the setup command first."
  }

  Write-Info "Downloading mkcert v$MkcertVersion for Windows x64"
  New-Item -ItemType Directory -Force -Path $ToolDir | Out-Null
  $DownloadUrl = "https://github.com/FiloSottile/mkcert/releases/download/v$MkcertVersion/mkcert-v$MkcertVersion-windows-amd64.exe"
  Enable-Tls12
  try {
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $DownloadedMkcert -UseBasicParsing
  } catch {
    Remove-Item -LiteralPath $DownloadedMkcert -Force -ErrorAction SilentlyContinue
    Stop-WithError "mkcert download failed: $($_.Exception.Message)"
  }
  return $DownloadedMkcert
}

function Test-CertificateValid {
  if (-not (Test-Path -LiteralPath $CertFile) -or -not (Test-Path -LiteralPath $KeyFile)) {
    return $false
  }
  $Certificate = $null
  try {
    $Certificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CertFile)
    $MinimumExpiry = (Get-Date).AddDays(30)
    return $Certificate.NotAfter -gt $MinimumExpiry
  } catch {
    return $false
  } finally {
    if ($null -ne $Certificate) {
      $Certificate.Dispose()
    }
  }
}

function Protect-PrivateKey {
  $CurrentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls.exe $KeyFile "/inheritance:r" "/grant:r" "*$CurrentSid`:(F)" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Stop-WithError "Unable to restrict access to the certificate private key."
  }
}

function Test-PrivateKeyProtected {
  try {
    $Acl = Get-Acl -LiteralPath $KeyFile
    if (-not $Acl.AreAccessRulesProtected) {
      return $false
    }
    $CurrentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    foreach ($Rule in $Acl.Access) {
      $RuleSid = $Rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
      if ($RuleSid -eq $CurrentSid -and $Rule.AccessControlType -eq "Allow") {
        return $true
      }
    }
  } catch {
    return $false
  }
  return $false
}

function Ensure-Certificate([string]$MkcertPath) {
  if ($CheckOnly) {
    if (-not (Test-CertificateValid)) {
      Stop-WithError "Local certificate is missing, unreadable, or expires within 30 days."
    }
    if (-not (Test-PrivateKeyProtected)) {
      Stop-WithError "Certificate private key ACL must disable inheritance and grant the current user access."
    }
    return
  }

  Write-Info "Installing the local development CA (Windows may show a UAC confirmation)"
  & $MkcertPath -install
  if ($LASTEXITCODE -ne 0) {
    Stop-WithError "mkcert could not install its local certificate authority."
  }

  if (-not (Test-CertificateValid)) {
    Write-Info "Generating a localhost certificate"
    New-Item -ItemType Directory -Force -Path $CertDir | Out-Null
    & $MkcertPath -cert-file $CertFile -key-file $KeyFile localhost 127.0.0.1 ::1
    if ($LASTEXITCODE -ne 0) {
      Stop-WithError "mkcert could not generate the localhost certificate."
    }
  }
  Protect-PrivateKey
  Write-Success "Local certificate is ready"
}

function Read-EnvValue([string]$Key) {
  if (-not (Test-Path -LiteralPath $EnvFile)) {
    return ""
  }
  $Value = ""
  foreach ($Line in [IO.File]::ReadAllLines($EnvFile)) {
    if ($Line.StartsWith("$Key=")) {
      $Value = $Line.Substring($Key.Length + 1)
    }
  }
  return $Value
}

function Set-EnvValue([string]$Key, [string]$Value) {
  $Lines = New-Object System.Collections.Generic.List[string]
  if (Test-Path -LiteralPath $EnvFile) {
    foreach ($Line in [IO.File]::ReadAllLines($EnvFile)) {
      [void]$Lines.Add($Line)
    }
  }

  $Found = $false
  for ($Index = 0; $Index -lt $Lines.Count; $Index++) {
    if ($Lines[$Index].StartsWith("$Key=")) {
      $Lines[$Index] = "$Key=$Value"
      $Found = $true
    }
  }
  if (-not $Found) {
    if ($Lines.Count -gt 0 -and $Lines[$Lines.Count - 1] -ne "") {
      [void]$Lines.Add("")
    }
    [void]$Lines.Add("$Key=$Value")
  }

  $Utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllLines($EnvFile, $Lines.ToArray(), $Utf8WithoutBom)
}

function Convert-SecureStringToPlainText([Security.SecureString]$SecureValue) {
  $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)
  }
}

function Test-InteractiveConsole {
  if (-not [Environment]::UserInteractive) {
    return $false
  }
  try {
    return -not [Console]::IsInputRedirected
  } catch {
    return $true
  }
}

function Show-FeishuRedirectGuide([string]$AppId) {
  $SafeUrl = "https://open.feishu.cn/app/$AppId/safe"
  Write-Host ""
  Write-Host "Configure the Feishu redirect URL:"
  Write-Host "  1. Open: $SafeUrl"
  Write-Host "  2. Under Redirect URL, add and save: $CallbackUrl"
  Write-Host ""
  try {
    Set-Clipboard -Value $CallbackUrl
    Write-Success "Feishu callback copied to the clipboard"
  } catch {
    Write-Info "Clipboard is unavailable; copy the callback shown above"
  }
  try {
    Start-Process $SafeUrl
    Write-Success "Opened Feishu security settings"
  } catch {
    Write-Info "Could not open a browser; open the URL shown above manually"
  }
  [void](Read-Host "After adding and saving the redirect URL, press Enter to continue")
}

function Maybe-ShowFeishuRedirectGuide([string]$AppId, [bool]$FirstConfiguration) {
  if (-not (Test-InteractiveConsole)) {
    if ($OpenFeishu) {
      Write-Host ""
      Write-Host "Open this Feishu security settings page and register the callback:"
      Write-Host "  https://open.feishu.cn/app/$AppId/safe"
      Write-Host "  $CallbackUrl"
    }
    return
  }

  if (-not $FirstConfiguration -and -not $OpenFeishu) {
    $Answer = Read-Host "Open Feishu security settings to check the redirect URL again? [y/N]"
    if ($Answer -notmatch "^(y|yes)$") {
      return
    }
  }
  Show-FeishuRedirectGuide $AppId
}

function Configure-Environment {
  if ($CheckOnly) {
    if (-not (Test-Path -LiteralPath $EnvFile)) {
      Stop-WithError ".env.local is missing"
    }
    if ((Read-EnvValue "APP_BASE_URL") -ne $BaseUrl) {
      Stop-WithError "APP_BASE_URL must be $BaseUrl"
    }
    if ((Read-EnvValue "FEISHU_OAUTH_REDIRECT_URI") -ne $CallbackUrl) {
      Stop-WithError "FEISHU_OAUTH_REDIRECT_URI must be $CallbackUrl"
    }
    if (-not (Read-EnvValue "LARK_APP_ID")) {
      Stop-WithError "LARK_APP_ID is missing"
    }
    if (-not (Read-EnvValue "LARK_APP_SECRET")) {
      Stop-WithError "LARK_APP_SECRET is missing"
    }
    return
  }

  if (-not (Test-Path -LiteralPath $EnvFile)) {
    $ExampleFile = Join-Path $ProjectDir ".env.example"
    $Utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($EnvFile, [IO.File]::ReadAllText($ExampleFile), $Utf8WithoutBom)
  }
  Set-EnvValue "APP_BASE_URL" $BaseUrl
  Set-EnvValue "FEISHU_OAUTH_REDIRECT_URI" $CallbackUrl
  Set-EnvValue "MCP_ALLOWED_ORIGINS" "https://localhost:3000,https://127.0.0.1:3000"

  $AppId = Read-EnvValue "LARK_APP_ID"
  $AppSecret = Read-EnvValue "LARK_APP_SECRET"
  $FirstConfiguration = $false
  if (-not $AppId) {
    if (-not (Test-InteractiveConsole)) {
      Stop-WithError "LARK_APP_ID is missing; run setup interactively or edit .env.local"
    }
    $AppId = Read-Host "Feishu App ID"
    if (-not $AppId) {
      Stop-WithError "Feishu App ID cannot be empty"
    }
    Set-EnvValue "LARK_APP_ID" $AppId
    $FirstConfiguration = $true
  }
  if (-not $AppSecret) {
    if (-not (Test-InteractiveConsole)) {
      Stop-WithError "LARK_APP_SECRET is missing; run setup interactively or edit .env.local"
    }
    $SecureSecret = Read-Host "Feishu App Secret" -AsSecureString
    $AppSecret = Convert-SecureStringToPlainText $SecureSecret
    if (-not $AppSecret) {
      Stop-WithError "Feishu App Secret cannot be empty"
    }
    Set-EnvValue "LARK_APP_SECRET" $AppSecret
    $AppSecret = $null
    $FirstConfiguration = $true
  }

  Write-Success "Environment is configured without exposing credentials"
  Maybe-ShowFeishuRedirectGuide $AppId $FirstConfiguration
}

function Test-PortInUse([int]$Port) {
  $GetNetTcpConnection = Get-Command "Get-NetTCPConnection" -ErrorAction SilentlyContinue
  if ($GetNetTcpConnection) {
    $Connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return $null -ne $Connection
  }
  $Matches = & netstat.exe -ano -p tcp | Select-String -Pattern "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+\d+\s*$"
  return $null -ne $Matches
}

function Invoke-HealthRequest([string]$Url) {
  return Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
}

function Verify-RunningService {
  try {
    [void](Invoke-HealthRequest "$BaseUrl/api/health")
    $MetadataResponse = Invoke-HealthRequest "$BaseUrl/.well-known/oauth-authorization-server"
    $Metadata = $MetadataResponse.Content | ConvertFrom-Json
    if ($Metadata.authorization_endpoint -ne "$BaseUrl/oauth/authorize") {
      Stop-WithError "OAuth metadata is not using the expected HTTPS authorization endpoint"
    }
  } catch {
    Stop-WithError "HTTPS health or OAuth metadata check failed: $($_.Exception.Message)"
  }
  Write-Success "HTTPS certificate, health check and OAuth metadata are valid"
}

Assert-SupportedWindows
Set-Location $ProjectDir
$BunPath = Ensure-Bun
$MkcertPath = Ensure-Mkcert
Ensure-Certificate $MkcertPath
Configure-Environment

if ($CheckOnly) {
  Verify-RunningService
  Write-Host ""
  Write-Host "CRM:             $BaseUrl"
  Write-Host "MCP connector:   $McpUrl"
  Write-Host "Feishu callback: $CallbackUrl"
  exit 0
}

Write-Info "Installing project dependencies"
& $BunPath install --frozen-lockfile
if ($LASTEXITCODE -ne 0) {
  Stop-WithError "Dependency installation failed"
}

if ($ResetDatabase) {
  Write-Info "Resetting local CRM demo data"
  & $BunPath run db:reset
} else {
  & $BunPath run db:init
}
if ($LASTEXITCODE -ne 0) {
  Stop-WithError "Database initialization failed"
}

Write-Success "Local setup is complete"
Write-Host ""
Write-Host "Register this exact URL in Feishu Open Platform:"
Write-Host "  $CallbackUrl"
Write-Host "Use this connector URL in Doubao local MCP injection:"
Write-Host "  $McpUrl"
Write-Host ""

if ($SetupOnly) {
  exit 0
}
if (Test-PortInUse 3000) {
  Stop-WithError "Port 3000 is already in use. Stop the existing process, then rerun."
}

Write-Info "Starting the HTTPS demo server"
$ServerProcess = Start-Process -FilePath $BunPath -ArgumentList @("run", "dev") -WorkingDirectory $ProjectDir -NoNewWindow -PassThru
try {
  $Healthy = $false
  for ($Attempt = 0; $Attempt -lt 60; $Attempt++) {
    if ($ServerProcess.HasExited) {
      Stop-WithError "Next.js exited before becoming healthy (exit code $($ServerProcess.ExitCode))"
    }
    try {
      [void](Invoke-HealthRequest "$BaseUrl/api/health")
      $Healthy = $true
      break
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  if (-not $Healthy) {
    Stop-WithError "Timed out waiting for $BaseUrl"
  }

  Verify-RunningService
  Write-Host ""
  Write-Host "CRM:             $BaseUrl"
  Write-Host "Demo console:    $BaseUrl/demo"
  Write-Host "MCP connector:   $McpUrl"
  Write-Host "Feishu callback: $CallbackUrl"
  Write-Host ""
  while (-not $ServerProcess.HasExited) {
    Start-Sleep -Seconds 1
  }
  exit $ServerProcess.ExitCode
} finally {
  if ($null -ne $ServerProcess -and -not $ServerProcess.HasExited) {
    Stop-Process -Id $ServerProcess.Id -Force -ErrorAction SilentlyContinue
  }
}
