#Requires -Version 5.1
<#
.SYNOPSIS
  Start PurrScription (API + Web) with one command.

.USAGE
  powershell -ExecutionPolicy Bypass -File .\start.ps1
  .\start.ps1 -Docker
  .\start.ps1 -Postgres
#>
param(
    [switch]$Docker,
    [switch]$Postgres,
    [switch]$NoBrowser,
    [int]$ApiPort = 8000,
    [int]$WebPort = 5173
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
Set-Location $Root

function Write-Step([string]$Message) {
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "    $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "    $Message" -ForegroundColor Yellow
}

function Read-DatabaseUrlFromEnv([string]$EnvPath) {
    if (-not (Test-Path $EnvPath)) { return $null }
    foreach ($line in Get-Content $EnvPath) {
        if ($line -match '^\s*DATABASE_URL=(.+)$') {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
}

function Test-DatabaseUrl([hashtable]$Py, [string]$DatabaseUrl) {
    if ($DatabaseUrl -match '^sqlite') { return $true }
    $probePath = Join-Path $env:TEMP "purr-db-probe.py"
    @"
import asyncio
import sys
from sqlalchemy.ext.asyncio import create_async_engine

async def main() -> int:
    engine = create_async_engine(sys.argv[1])
    try:
        async with engine.connect():
            return 0
    except Exception:
        return 1
    finally:
        await engine.dispose()

raise SystemExit(asyncio.run(main()))
"@ | Set-Content -Path $probePath -Encoding UTF8
    try {
        if ($Py.Command -eq 'py') {
            & py @($Py.Args + $probePath, $DatabaseUrl) 2>$null
        } else {
            & python @($probePath, $DatabaseUrl) 2>$null
        }
        return $LASTEXITCODE -eq 0
    } finally {
        Remove-Item $probePath -Force -ErrorAction SilentlyContinue
    }
}

function Resolve-NativeDatabaseUrl([hashtable]$Py, [string]$Root) {
    $sqlite = 'sqlite+aiosqlite:///./purrscription.db'
    $configured = $env:DATABASE_URL
    if (-not $configured) {
        $configured = Read-DatabaseUrlFromEnv (Join-Path $Root '.env')
    }
    if (-not $configured) { return $sqlite }
    if ($configured -match 'postgres' -and -not (Test-DatabaseUrl $Py $configured)) {
        Write-Warn 'PostgreSQL unavailable. Falling back to SQLite (apps\api\purrscription.db).'
        Write-Warn 'For Postgres use: .\start.ps1 -Docker'
        return $sqlite
    }
    return $configured
}

function Find-Python312 {
    foreach ($pyArgs in @(@('-3.12'), @('-3'))) {
        try {
            $version = & py @pyArgs -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
            if ($version -match '^3\.(1[2-9]|[2-9][0-9])$') {
                return @{ Command = 'py'; Args = $pyArgs }
            }
        } catch {}
    }
    try {
        $version = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        if ($version -match '^3\.(1[2-9]|[2-9][0-9])$') {
            return @{ Command = 'python'; Args = @() }
        }
    } catch {}
    return $null
}

function Invoke-PythonCommand([hashtable]$Py, [string[]]$CommandArgs) {
    if ($Py.Command -eq 'py') {
        & py @($Py.Args + $CommandArgs)
    } else {
        & python @CommandArgs
    }
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        $cmd = ($Py.Command + ' ' + ($Py.Args -join ' ') + ' ' + ($CommandArgs -join ' ')).Trim()
        throw "Command failed (${LASTEXITCODE}): $cmd"
    }
}

function Test-Tool([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Wait-Health([string]$Url, [int]$Seconds = 45) {
    for ($i = 0; $i -lt $Seconds; $i++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return $true }
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    return $false
}

Write-Host ''
Write-Host 'PurrScription - local dev startup' -ForegroundColor White
Write-Host "Root: $Root"
Write-Host ''

if (-not (Test-Tool npm)) {
    throw 'npm not found. Install Node.js 18+ from https://nodejs.org/'
}

try {
    $nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
    if ($nodeMajor -lt 18) {
        throw 'Node.js 18+ required.'
    }
    Write-Ok ("Node.js: $(node -v)")
} catch {
    throw 'Node.js 18+ required. Install from https://nodejs.org/'
}

if (-not (Test-Path (Join-Path $Root '.env'))) {
    if (Test-Path (Join-Path $Root '.env.example')) {
        Copy-Item (Join-Path $Root '.env.example') (Join-Path $Root '.env')
        Write-Ok 'Created .env from .env.example'
    }
}

if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
    Write-Step 'Installing npm dependencies...'
    npm install
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
}

if ($Docker) {
    if (-not (Test-Tool docker)) {
        throw 'Docker not found. Install Docker Desktop, start it, then run .\start.ps1 -Docker again.'
    }
    try {
        docker info 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'daemon not running' }
    } catch {
        throw 'Docker Desktop is not running. Start Docker Desktop, wait until it is ready, then run .\start.ps1 -Docker.'
    }
    Write-Step 'Starting Docker Compose...'
    docker compose up -d --build
    if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed' }

    $healthUrl = "http://127.0.0.1:${ApiPort}/health"
    Write-Step "Waiting for API at $healthUrl ..."
    if (Wait-Health $healthUrl) {
        Write-Ok 'API is ready'
    } else {
        Write-Warn 'API is not ready yet. Check: docker compose logs -f api'
    }

    Write-Host ''
    Write-Ok "Web: http://localhost:${WebPort}"
    Write-Ok "API: http://localhost:${ApiPort}"
    Write-Ok 'Login: admin@purrscription.dev / demo123'
    Write-Host ''
    if (-not $NoBrowser) {
        Start-Process "http://localhost:${WebPort}"
    }
    exit 0
}

$Py = Find-Python312
if (-not $Py) {
    throw 'Python 3.12+ not found. Install Python and use py -3.12.'
}
Write-Ok ("Python: {0} {1}" -f $Py.Command, ($Py.Args -join ' '))

Write-Step 'Installing Python API dependencies...'
Invoke-PythonCommand $Py @('-m', 'pip', 'install', '-e', 'apps/api[dev]', '-q')

$databaseUrl = if ($Postgres) {
    Resolve-NativeDatabaseUrl $Py $Root
} else {
    'sqlite+aiosqlite:///./purrscription.db'
}
$env:DATABASE_URL = $databaseUrl
if (-not $Postgres) {
    Write-Ok 'Native dev uses SQLite (apps\api\purrscription.db). Pass -Postgres to use DATABASE_URL from .env.'
}
Write-Ok ("Database: {0}" -f ($databaseUrl -replace '://.*@', '://***@'))

Write-Step 'Running migrations and seed...'
Push-Location (Join-Path $Root 'apps\api')
try {
    Invoke-PythonCommand $Py @('-m', 'alembic', 'upgrade', 'head')
    Invoke-PythonCommand $Py @('-m', 'api.seed')
} finally {
    Pop-Location
}

$apiDir = Join-Path $Root 'apps\api'
$pyLaunch = if ($Py.Args.Count) { "py $($Py.Args -join ' ')" } else { 'python' }

$apiCommand = @"
`$host.UI.RawUI.WindowTitle = 'PurrScription API :$ApiPort'
Set-Location '$apiDir'
`$env:DATABASE_URL = '$databaseUrl'
$pyLaunch -m uvicorn api.main:app --host 127.0.0.1 --port $ApiPort --reload
"@

$webCommand = @"
`$host.UI.RawUI.WindowTitle = 'PurrScription Web :$WebPort'
Set-Location '$Root'
npm run dev -w apps/web -- --host 127.0.0.1 --port $WebPort
"@

Write-Step 'Starting API and Web in separate windows...'
$healthUrl = "http://127.0.0.1:${ApiPort}/health"
$webUrl = "http://127.0.0.1:${WebPort}"
$apiAlreadyRunning = Wait-Health $healthUrl 2
$webAlreadyRunning = Wait-Health $webUrl 2

if ($apiAlreadyRunning) {
    Write-Ok "API already running on port ${ApiPort}; reusing it"
} elseif (Get-NetTCPConnection -State Listen -LocalPort $ApiPort -ErrorAction SilentlyContinue) {
    throw "Port ${ApiPort} is occupied by an unresponsive process. Stop that process and run start.ps1 again."
} else {
    Start-Process powershell -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $apiCommand) | Out-Null
}

if ($webAlreadyRunning) {
    Write-Ok "Web already running on port ${WebPort}; reusing it"
} elseif (Get-NetTCPConnection -State Listen -LocalPort $WebPort -ErrorAction SilentlyContinue) {
    throw "Port ${WebPort} is occupied by an unresponsive process. Stop that process and run start.ps1 again."
} else {
    Start-Process powershell -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $webCommand) | Out-Null
}

Write-Step "Waiting for API at $healthUrl ..."
if (Wait-Health $healthUrl) {
    Write-Ok 'API is ready'
} else {
    Write-Warn 'API is not ready yet. Check the PurrScription API window.'
}

Write-Host ''
Write-Ok "Web: http://localhost:${WebPort}"
Write-Ok "API: http://localhost:${ApiPort}/health"
Write-Ok 'Login: admin@purrscription.dev / demo123'
Write-Host ''
Write-Host 'Stop: close API and Web windows.' -ForegroundColor DarkGray
Write-Host ''

if (-not $NoBrowser) {
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:${WebPort}"
}
