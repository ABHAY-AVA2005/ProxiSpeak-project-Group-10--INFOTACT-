<#
.SYNOPSIS
    ProxiSpeak Multi-Instance Development Workflow Manager
.DESCRIPTION
    Manages dual backend server instances for local multi-instance development and testing.
    - Instance 1: Port 5000, ID 'instance-1'
    - Instance 2: Port 5001, ID 'instance-2'
    Supports start, status, test, stop, and restart commands.
.EXAMPLE
    .\scripts\dev-multi-instance.ps1 start
    .\scripts\dev-multi-instance.ps1 status
    .\scripts\dev-multi-instance.ps1 test
    .\scripts\dev-multi-instance.ps1 stop
#>

[CmdletBinding()]
param (
    [Parameter(Position = 0, Mandatory = $false)]
    [ValidateSet("start", "status", "test", "stop", "restart", "help")]
    [string]$Command = "status"
)

$ErrorActionPreference = "Continue"

# Resolve directories
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Split-Path -Parent $ScriptDir
$ServerDir = Join-Path $RootDir "server"
$LogsDir = Join-Path $ServerDir "logs"
$StateFile = Join-Path $ScriptDir ".instances.json"
$DockerComposeFile = Join-Path $RootDir "docker-compose.yml"

# Parse .env if available in RootDir or ServerDir
$EnvFileCandidates = @(
    (Join-Path $RootDir ".env"),
    (Join-Path $ServerDir ".env")
)
$parsedEnv = @{}
foreach ($envPath in $EnvFileCandidates) {
    if (Test-Path $envPath) {
        Get-Content $envPath | ForEach-Object {
            $rawLine = $_.Trim()
            if ($rawLine -and -not $rawLine.StartsWith("#") -and $rawLine.Contains("=")) {
                $parts = $rawLine.Split("=", 2)
                $k = $parts[0].Trim()
                $v = $parts[1].Trim()
                if ($v -and -not $parsedEnv.ContainsKey($k)) {
                    $parsedEnv[$k] = $v
                }
            }
        }
    }
}

# Resolve Redis configuration (precedence: process env > .env file > default)
$resolvedRedisUrl = if ($env:REDIS_URL) {
    $env:REDIS_URL
} elseif ($parsedEnv["REDIS_URL"]) {
    $parsedEnv["REDIS_URL"]
} else {
    $null
}

if ($resolvedRedisUrl) {
    try {
        $uriObj = [System.Uri]$resolvedRedisUrl
        $REDIS_HOST = if ($uriObj.Host) { $uriObj.Host } else { "127.0.0.1" }
        $REDIS_PORT = if ($uriObj.Port -gt 0) { $uriObj.Port } else { 6379 }
    } catch {
        $REDIS_HOST = "127.0.0.1"
        $REDIS_PORT = 6379
    }
} else {
    $REDIS_HOST = if ($env:REDIS_HOST) { $env:REDIS_HOST } elseif ($parsedEnv["REDIS_HOST"]) { $parsedEnv["REDIS_HOST"] } else { "127.0.0.1" }
    $REDIS_PORT = if ($env:REDIS_PORT) { [int]$env:REDIS_PORT } elseif ($parsedEnv["REDIS_PORT"]) { [int]$parsedEnv["REDIS_PORT"] } else { 6379 }
}

$REDIS_ENABLED = if ($env:REDIS_ENABLED) { $env:REDIS_ENABLED } elseif ($parsedEnv["REDIS_ENABLED"]) { $parsedEnv["REDIS_ENABLED"] } else { "true" }
$DEFAULT_REDIS_URL = if ($resolvedRedisUrl) { $resolvedRedisUrl } else { "redis://${REDIS_HOST}:${REDIS_PORT}" }

$INSTANCES = @(
    @{ Id = "instance-1"; Port = 5000; Log = "instance-1.log" },
    @{ Id = "instance-2"; Port = 5001; Log = "instance-2.log" }
)

# ---------------------------------------------------------------------------
# Helper: Extract PID listening on a given port reliably on Windows
# ---------------------------------------------------------------------------
function Get-PortPid {
    param ([int]$Port)
    try {
        $h = Get-InstanceHealth -Port $Port -TimeoutSec 1
        if ($h.IsHealthy -and $h.Data.pid) {
            return [int]$h.Data.pid
        }
    } catch {}
    try {
        $lines = netstat -ano | findstr ":$Port"
        foreach ($line in $lines) {
            $trimmed = $line.Trim()
            if ($trimmed -match "LISTENING\s+(\d+)$") {
                $p = [int]$matches[1]
                if ($p -gt 0) {
                    return $p
                }
            }
        }
    } catch {}
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($conn -and $conn.OwningProcess -and $conn.OwningProcess -gt 0) {
            return $conn.OwningProcess
        }
    } catch {}
    return $null
}

# ---------------------------------------------------------------------------
# Helper: Check if a TCP port is responding
# ---------------------------------------------------------------------------
function Test-TcpPort {
    param (
        [string]$HostName = "127.0.0.1",
        [int]$Port,
        [int]$TimeoutMs = 1500
    )
    $client = $null
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect($HostName, $Port, $null, $null)
        $wh = $iar.AsyncWaitHandle
        $connected = $wh.WaitOne($TimeoutMs, $false)
        if ($connected) {
            $client.EndConnect($iar)
            return $true
        }
        return $false
    } catch {
        return $false
    } finally {
        if ($client) {
            $client.Close()
        }
    }
}

# ---------------------------------------------------------------------------
# Helper: Verify Redis responds to PING command with PONG
# ---------------------------------------------------------------------------
function Test-RedisPing {
    param (
        [string]$HostName = "127.0.0.1",
        [int]$Port = 6379,
        [int]$TimeoutMs = 1500
    )
    $client = $null
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect($HostName, $Port, $null, $null)
        $wh = $iar.AsyncWaitHandle
        if (-not $wh.WaitOne($TimeoutMs, $false)) {
            return $false
        }
        $client.EndConnect($iar)
        $stream = $client.GetStream()
        $stream.ReadTimeout = $TimeoutMs
        $stream.WriteTimeout = $TimeoutMs
        $writer = New-Object System.IO.StreamWriter($stream, [System.Text.Encoding]::ASCII)
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII)
        $writer.WriteLine("PING")
        $writer.Flush()
        $resp = $reader.ReadLine()
        return ($resp -like "*PONG*")
    } catch {
        return $false
    } finally {
        if ($client) {
            $client.Close()
        }
    }
}

# ---------------------------------------------------------------------------
# Helper: Ensure Redis is available or start it via Docker Compose
# ---------------------------------------------------------------------------
function Ensure-Redis {
    Write-Host "[Redis] Checking Redis availability on $REDIS_HOST port $REDIS_PORT..." -ForegroundColor Cyan

    if (Test-RedisPing -HostName $REDIS_HOST -Port $REDIS_PORT -TimeoutMs 1500) {
        Write-Host "[Redis] Redis is already running and reachable on port $REDIS_PORT." -ForegroundColor Green
        return $true
    }

    Write-Host "[Redis] Redis is not responding to PING on port $REDIS_PORT. Checking Docker..." -ForegroundColor Yellow

    $dockerCmd = Get-Command "docker" -ErrorAction SilentlyContinue
    if (-not $dockerCmd) {
        Write-Host "[ERROR] Docker CLI not found in PATH and Redis is offline." -ForegroundColor Red
        Write-Host "        Please start Redis manually or install Docker Desktop." -ForegroundColor Yellow
        return $false
    }

    # Verify Docker daemon is running
    & docker info --format "{{.ServerVersion}}" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Docker Desktop daemon is not running." -ForegroundColor Red
        Write-Host "        Please launch Docker Desktop and retry." -ForegroundColor Yellow
        return $false
    }

    Write-Host "[Redis] Starting Redis container via existing Docker Compose..." -ForegroundColor Cyan
    & docker compose -f $DockerComposeFile up -d redis 2>&1 | Out-Null

    # Wait for Redis to become available and respond to PING (up to 12s)
    $attempts = 0
    while ($attempts -lt 12) {
        Start-Sleep -Seconds 1
        $attempts++
        if (Test-RedisPing -HostName $REDIS_HOST -Port $REDIS_PORT -TimeoutMs 1000) {
            Write-Host "[Redis] Redis container started and ready on port $REDIS_PORT!" -ForegroundColor Green
            return $true
        }
    }

    Write-Host "[ERROR] Redis container failed to respond on port $REDIS_PORT within timeout." -ForegroundColor Red
    return $false
}

# ---------------------------------------------------------------------------
# Helper: Query HTTP health endpoint
# ---------------------------------------------------------------------------
function Get-InstanceHealth {
    param ([int]$Port, [int]$TimeoutSec = 2)
    try {
        $uri = "http://127.0.0.1:$Port/health"
        $response = Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec $TimeoutSec -ErrorAction Stop
        return @{
            IsHealthy = $true
            Data = $response
            RawError = $null
        }
    } catch {
        return @{
            IsHealthy = $false
            Data = $null
            RawError = $_.Exception.Message
        }
    }
}

# ---------------------------------------------------------------------------
# Helper: Read saved state
# ---------------------------------------------------------------------------
function Read-State {
    if (Test-Path $StateFile) {
        try {
            $content = Get-Content -Path $StateFile -Raw -ErrorAction Stop
            return ($content | ConvertFrom-Json)
        } catch {
            return $null
        }
    }
    return $null
}

# ---------------------------------------------------------------------------
# Helper: Write saved state
# ---------------------------------------------------------------------------
function Write-State {
    param ($StateObj)
    $json = $StateObj | ConvertTo-Json -Depth 4
    Set-Content -Path $StateFile -Value $json -Force
}

# ---------------------------------------------------------------------------
# Command: START
# ---------------------------------------------------------------------------
function Start-Instances {
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host " Starting ProxiSpeak Multi-Instance Backend Workflow" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan

    # 1. Check Redis
    $redisReady = Ensure-Redis
    if (-not $redisReady) {
        Write-Host "[WARN] Redis is unreachable. Instances will start in standalone offline mode." -ForegroundColor Yellow
    }

    # 2. Check if already running
    $state = Read-State
    $allRunning = $true
    if ($state) {
        foreach ($inst in $INSTANCES) {
            $key = $inst.Id
            $entry = $state.$key
            if ($entry -and $entry.Pid) {
                $proc = Get-Process -Id $entry.Pid -ErrorAction SilentlyContinue
                $health = Get-InstanceHealth -Port $inst.Port -TimeoutSec 1
                if (-not ($proc -and $health.IsHealthy)) {
                    $allRunning = $false
                }
                # If Redis is online, instance must have Redis connected
                if ($redisReady -and $health.IsHealthy -and -not $health.Data.redis.connected) {
                    $allRunning = $false
                }
            } else {
                $allRunning = $false
            }
        }

        if ($allRunning) {
            Write-Host "[INFO] All instances are already running and healthy." -ForegroundColor Green
            Get-InstancesStatus
            return
        }
    }

    # Ensure logs directory exists
    if (-not (Test-Path $LogsDir)) {
        New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
    }

    $newState = @{}

    # 3. Launch each instance using WMI (truly detached, survives terminal closure)
    $wmiProcess = [wmiclass]"Win32_Process"

    foreach ($inst in $INSTANCES) {
        $id = $inst.Id
        $port = $inst.Port
        $logFile = Join-Path $LogsDir "$id.log"
        $errFile = Join-Path $LogsDir "$id.err.log"

        # Check if port is already bound
        if (Test-TcpPort -Port $port -TimeoutMs 500) {
            $health = Get-InstanceHealth -Port $port -TimeoutSec 1
            if ($health.IsHealthy) {
                # If Redis is online, but this instance is in standalone mode (redis.connected == false),
                # do NOT reuse the degraded instance. Stop it and launch a fresh one with Redis!
                if ($redisReady -and -not $health.Data.redis.connected) {
                    Write-Host "[WARN] Port $port is running in standalone mode without Redis. Restarting $id with Redis..." -ForegroundColor Yellow
                    $stalePid = Get-PortPid -Port $port
                    if ($stalePid) {
                        Stop-Process -Id $stalePid -Force -ErrorAction SilentlyContinue
                        Start-Sleep -Milliseconds 600
                    }
                } else {
                    Write-Host "[INFO] Port $port is already listening and healthy. Reusing instance ($id)." -ForegroundColor Yellow
                    $existingPid = Get-PortPid -Port $port
                    $newState[$id] = @{
                        Id = $id
                        Port = $port
                        Pid = $existingPid
                        LogFile = $logFile
                        ErrFile = $errFile
                    }
                    continue
                }
            } else {
                Write-Host "[ERROR] Port $port is already bound by an unknown process. Please free it." -ForegroundColor Red
                return
            }
        }

        Write-Host "[Start] Launching $id on port $port..." -ForegroundColor Cyan

        $redisUrl = $DEFAULT_REDIS_URL
        # cmd.exe wrapper with explicit output redirection, detached via WMI
        $cmdLine = "cmd.exe /c `"set PORT=$port& set INSTANCE_ID=$id& set MONGO_CONNECT_TIMEOUT_MS=2000& set REDIS_URL=$redisUrl& set REDIS_ENABLED=$REDIS_ENABLED& node src/server.js > `"`"$logFile`"`" 2> `"`"$errFile`"`"`""
        $res = $wmiProcess.Create($cmdLine, $ServerDir, $null)

        if ($res.ReturnValue -ne 0) {
            Write-Host "[ERROR] Failed to spawn process for $id (WMI ReturnCode: $($res.ReturnValue))" -ForegroundColor Red
            return
        }

        $newState[$id] = @{
            Id = $id
            Port = $port
            Pid = $null
            LogFile = $logFile
            ErrFile = $errFile
        }
        Write-Host "  -> Spawned detached worker for $id" -ForegroundColor Gray
    }

    # 4. Wait for health checks
    Write-Host "[Health] Awaiting HTTP readiness on ports 5000 and 5001..." -ForegroundColor Cyan
    $timeoutSeconds = 25
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    $ready = @{}
    foreach ($inst in $INSTANCES) { $ready[$inst.Id] = $false }

    while ($sw.Elapsed.TotalSeconds -lt $timeoutSeconds) {
        $allReady = $true
        foreach ($inst in $INSTANCES) {
            $id = $inst.Id
            if (-not $ready[$id]) {
                $h = Get-InstanceHealth -Port $inst.Port -TimeoutSec 1
                $isRedisReady = if ($redisReady) { [bool]$h.Data.redis.connected } else { $true }
                if ($h.IsHealthy -and $isRedisReady) {
                    $ready[$id] = $true

                    # Record exact Node PID from the listening TCP socket
                    $actualPid = Get-PortPid -Port $inst.Port
                    if ($actualPid) {
                        $newState[$id].Pid = $actualPid
                    }

                    Write-Host "  [OK] $id is HEALTHY on port $($inst.Port) (PID: $($newState[$id].Pid), Uptime: $($h.Data.uptime)s, Redis: $($h.Data.redis.connected))" -ForegroundColor Green
                } elseif ($h.IsHealthy -and -not $isRedisReady) {
                    $allReady = $false
                } else {
                    $allReady = $false
                }
            }
        }

        if ($allReady) {
            break
        }
        Start-Sleep -Milliseconds 800
    }

    $sw.Stop()

    # Save state with recorded Node PIDs
    Write-State -StateObj $newState

    # 5. Check if startup succeeded
    $failed = @()
    foreach ($inst in $INSTANCES) {
        if (-not $ready[$inst.Id]) {
            $failed += $inst
        }
    }

    if ($failed.Count -eq 0) {
        Write-Host "==========================================================" -ForegroundColor Green
        Write-Host " [OK] ProxiSpeak Multi-Instance Startup Complete!" -ForegroundColor Green
        Write-Host "==========================================================" -ForegroundColor Green
        Get-InstancesStatus
    } else {
        Write-Host "[ERROR] The following instances failed to report healthy:" -ForegroundColor Red
        foreach ($f in $failed) {
            Write-Host "   - $($f.Id) on port $($f.Port)" -ForegroundColor Red
            $logPath = Join-Path $LogsDir "$($f.Id).log"
            $errPath = Join-Path $LogsDir "$($f.Id).err.log"
            if (Test-Path $logPath) {
                Write-Host "   --- Last 10 lines of $logPath ---" -ForegroundColor Yellow
                Get-Content -Path $logPath -Tail 10 | ForEach-Object { Write-Host "     $_" -ForegroundColor Gray }
            }
            if (Test-Path $errPath) {
                Write-Host "   --- Last 10 lines of $errPath ---" -ForegroundColor Yellow
                Get-Content -Path $errPath -Tail 10 | ForEach-Object { Write-Host "     $_" -ForegroundColor Gray }
            }
        }
        exit 1
    }
}

# ---------------------------------------------------------------------------
# Command: STATUS
# ---------------------------------------------------------------------------
function Get-InstancesStatus {
    Write-Host "`n=== ProxiSpeak System Status ===" -ForegroundColor Cyan

    # Redis Check
    $redisOk = Test-RedisPing -HostName $REDIS_HOST -Port $REDIS_PORT -TimeoutMs 1000
    if ($redisOk) {
        Write-Host "Redis Service:      ONLINE (Port $REDIS_PORT)" -ForegroundColor Green
    } else {
        Write-Host "Redis Service:      OFFLINE (Port $REDIS_PORT)" -ForegroundColor Red
    }

    # Instances Check
    $state = Read-State
    $allHealthy = $true

    foreach ($inst in $INSTANCES) {
        $id = $inst.Id
        $port = $inst.Port
        $entry = if ($state) { $state.$id } else { $null }
        $pidNum = if ($entry) { $entry.Pid } else { $null }

        # If PID wasn't saved or needs verification, check listening socket
        if (-not $pidNum) {
            $pidNum = Get-PortPid -Port $port
        }

        $isProcAlive = $false
        if ($pidNum) {
            $p = Get-Process -Id $pidNum -ErrorAction SilentlyContinue
            if ($p) { $isProcAlive = $true }
        }

        $health = Get-InstanceHealth -Port $port -TimeoutSec 1

        $pidDisplay = if ($pidNum) { $pidNum } else { "N/A" }
        Write-Host "`n[$id]" -ForegroundColor White
        Write-Host "  Port:             $port"
        Write-Host "  Process PID:      $pidDisplay (Alive: $isProcAlive)"
        if ($health.IsHealthy) {
            $d = $health.Data
            $redisColor = if ($d.redis.connected) { "Green" } else { "Yellow" }
            $dbColor = if ($d.database.connected) { "Green" } else { "Gray" }
            Write-Host "  Health Status:    UP (HTTP 200)" -ForegroundColor Green
            Write-Host "  Instance ID:      $($d.instanceId)"
            Write-Host "  Redis Connected:  $($d.redis.connected)" -ForegroundColor $redisColor
            Write-Host "  DB Connected:     $($d.database.connected)" -ForegroundColor $dbColor
            Write-Host "  Active Users:     $($d.activeUsers)"
            Write-Host "  Uptime:           $($d.uptime)s"
        } else {
            Write-Host "  Health Status:    DOWN ($($health.RawError))" -ForegroundColor Red
            $allHealthy = $false
        }
    }

    Write-Host "`n================================`n" -ForegroundColor Cyan
    if (-not $allHealthy) {
        return $false
    }
    return $true
}

# ---------------------------------------------------------------------------
# Command: TEST
# ---------------------------------------------------------------------------
function Run-Tests {
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host " Running ProxiSpeak Verification Test Suite" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan

    # 1. Pre-check Redis
    Write-Host "`n[1/3] Checking Redis Availability..." -ForegroundColor Cyan
    $redisOk = Test-RedisPing -HostName $REDIS_HOST -Port $REDIS_PORT -TimeoutMs 1500
    if (-not $redisOk) {
        Write-Host "[ERROR] Redis is offline on port $REDIS_PORT." -ForegroundColor Red
        Write-Host "        Live integration tests require Redis. Run: docker compose up -d redis" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "[OK] Redis is available and responsive." -ForegroundColor Green

    # 2. Run unit tests
    Write-Host "`n[2/3] Running Backend Unit Test Suite..." -ForegroundColor Cyan
    & npm.cmd --prefix $ServerDir run test:unit
    $unitExit = $LASTEXITCODE

    if ($unitExit -ne 0) {
        Write-Host "[ERROR] Unit tests failed (Exit Code: $unitExit)!" -ForegroundColor Red
    } else {
        Write-Host "[OK] Unit tests completed successfully!" -ForegroundColor Green
    }

    # 3. Run live Redis integration test
    Write-Host "`n[3/3] Running Live Redis Integration Test Suite..." -ForegroundColor Cyan
    & npm.cmd --prefix $ServerDir run test:integration
    $intExit = $LASTEXITCODE

    if ($intExit -ne 0) {
        Write-Host "[ERROR] Live Redis integration test failed (Exit Code: $intExit)!" -ForegroundColor Red
    } else {
        Write-Host "[OK] Live Redis integration test completed successfully!" -ForegroundColor Green
    }

    # Report summary
    $unitLabel = if ($unitExit -eq 0) { "PASSED" } else { "FAILED" }
    $unitColor = if ($unitExit -eq 0) { "Green" } else { "Red" }
    $intLabel  = if ($intExit -eq 0) { "PASSED" } else { "FAILED" }
    $intColor  = if ($intExit -eq 0) { "Green" } else { "Red" }

    Write-Host "`n==========================================================" -ForegroundColor Cyan
    Write-Host " Test Execution Summary" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  Unit Tests:        $unitLabel" -ForegroundColor $unitColor
    Write-Host "  Integration Tests: $intLabel" -ForegroundColor $intColor
    Write-Host "==========================================================" -ForegroundColor Cyan

    if ($unitExit -ne 0 -or $intExit -ne 0) {
        exit 1
    }
}

# ---------------------------------------------------------------------------
# Command: STOP
# ---------------------------------------------------------------------------
function Stop-Instances {
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host " Stopping ProxiSpeak Managed Instances" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan

    $state = Read-State

    # First check state file PIDs
    if ($state) {
        foreach ($inst in $INSTANCES) {
            $id = $inst.Id
            $entry = $state.$id
            if ($entry -and $entry.Pid) {
                $pidNum = $entry.Pid
                $p = Get-Process -Id $pidNum -ErrorAction SilentlyContinue
                if ($p) {
                    if ($p.ProcessName -like "*node*") {
                        Write-Host "[Stop] Terminating managed process $id (PID: $pidNum)..." -ForegroundColor Cyan
                        Stop-Process -Id $pidNum -Force -ErrorAction SilentlyContinue
                        $p.WaitForExit(3000)
                        Write-Host "  [OK] Stopped $id (PID: $pidNum)" -ForegroundColor Green
                    } else {
                        Write-Host "[WARN] Safety guard: Process $pidNum is '$($p.ProcessName)', not Node.js. Skipping." -ForegroundColor Yellow
                    }
                } else {
                    Write-Host "[INFO] Process for $id (PID: $pidNum) is already terminated." -ForegroundColor Gray
                }
            }
        }
    }

    # Safety check: if ports 5000 or 5001 are still listening and belong to node, stop them
    foreach ($inst in $INSTANCES) {
        $portPid = Get-PortPid -Port $inst.Port
        if ($portPid) {
            $p = Get-Process -Id $portPid -ErrorAction SilentlyContinue
            if ($p -and $p.ProcessName -like "*node*") {
                Write-Host "[Stop] Stopping remaining listener on port $($inst.Port) (PID: $portPid)..." -ForegroundColor Cyan
                Stop-Process -Id $portPid -Force -ErrorAction SilentlyContinue
            }
        }
    }

    # Remove state file
    if (Test-Path $StateFile) {
        Remove-Item -Path $StateFile -Force -ErrorAction SilentlyContinue
    }

    Write-Host "[OK] Stop completed. Managed instances stopped." -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Main Router
# ---------------------------------------------------------------------------
switch ($Command) {
    "start" {
        Start-Instances
    }
    "status" {
        Get-InstancesStatus
    }
    "test" {
        Run-Tests
    }
    "stop" {
        Stop-Instances
    }
    "restart" {
        Stop-Instances
        Start-Sleep -Seconds 1
        Start-Instances
    }
    default {
        Write-Host 'Usage: .\scripts\dev-multi-instance.ps1 [start | status | test | stop | restart]' -ForegroundColor Yellow
    }
}
