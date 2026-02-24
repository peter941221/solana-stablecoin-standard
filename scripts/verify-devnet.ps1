param(
  [string]$KeypairPath = $env:AUTHORITY_KEYPAIR_PATH,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

$devnetConfigPath = Join-Path $projectRoot "deployments\devnet.json"
if (-not (Test-Path $devnetConfigPath)) {
  throw "Missing deployments/devnet.json at $devnetConfigPath"
}

$config = Get-Content $devnetConfigPath -Raw | ConvertFrom-Json

function Get-ConfigKeypairPath {
  $configPath = Join-Path $HOME ".config\solana\cli\config.yml"
  if (-not (Test-Path $configPath)) {
    return $null
  }
  $line = Select-String -Path $configPath -Pattern "^keypair_path:\s*(.+)$" | Select-Object -First 1
  if (-not $line) {
    return $null
  }
  return $line.Matches[0].Groups[1].Value.Trim().Trim('"')
}

function Resolve-KeypairPath {
  param([string]$Override)

  if ($Override -and (Test-Path $Override)) {
    return $Override
  }

  $configKeypair = Get-ConfigKeypairPath
  if ($configKeypair -and (Test-Path $configKeypair)) {
    return $configKeypair
  }

  $fallback = Join-Path $HOME ".config\solana\id.json"
  if (Test-Path $fallback) {
    return $fallback
  }

  if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
    $wslKeypair = & wsl.exe -e bash -lc "test -f ~/.config/solana/id.json && echo found"
    if ($wslKeypair -eq "found") {
      $targetDir = Join-Path $HOME ".config\solana"
      New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
      & wsl.exe -e bash -lc "cat ~/.config/solana/id.json" | Set-Content -Path $fallback -Encoding utf8
      if (Test-Path $fallback) {
        return $fallback
      }
    }
  }

  throw "Keypair not found. Set AUTHORITY_KEYPAIR_PATH or copy a keypair to $fallback."
}

$keypairPath = Resolve-KeypairPath $KeypairPath

$env:SSS_CORE_PROGRAM_ID = $config.stablecoin_core_program_id
$env:SSS_TRANSFER_HOOK_PROGRAM_ID = $config.transfer_hook_program_id
if (-not $env:SOLANA_RPC_URL) {
  $env:SOLANA_RPC_URL = "https://api.devnet.solana.com"
}
if (-not $env:SOLANA_COMMITMENT) {
  $env:SOLANA_COMMITMENT = "confirmed"
}
if (-not $env:NODE_OPTIONS) {
  $env:NODE_OPTIONS = "--dns-result-order=ipv4first"
}
$env:DISABLE_AIRDROP = "1"
$env:AUTHORITY_KEYPAIR_PATH = $keypairPath

Write-Host "Using keypair: $keypairPath"
& solana-keygen pubkey $keypairPath

if ($DryRun) {
  Write-Host "DryRun enabled. Skipping demo scripts."
  exit 0
}

$env:PROOF_PATH = Join-Path $projectRoot "deployments\devnet-sss1-proof.json"
& npx tsx (Join-Path $projectRoot "scripts\demo-sss1.ts")

$env:PROOF_PATH = Join-Path $projectRoot "deployments\devnet-sss2-proof.json"
& npx tsx (Join-Path $projectRoot "scripts\demo-sss2.ts")
