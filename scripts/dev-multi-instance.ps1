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

$REDIS_HOST = "127.0.0.1"
$REDIS_PORT = 6379
$INSTANCES = @(
    @{ Id = "instance-1"; Port = 5000; Log = "instance-1.log" },
    @{ Id = "instance-2"; Port = 5001; Log = "instance-2.log" }
)

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
                Write-Host "[INFO] Port $port is already listening and healthy. Reusing instance ($id)." -ForegroundColor Yellow
                $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
                $existingPid = if ($conn) { $conn.OwningProcess } else { $null }
                $newState[$id] = @{
                    Id = $id
                    Port = $port
                    Pid = $existingPid
                    LogFile = $logFile
                    ErrFile = $errFile
                }
                continue
            } else {
                Write-Host "[ERROR] Port $port is already bound by an unknown process. Please free it." -ForegroundColor Red
                return
            }
        }

        Write-Host "[Start] Launching $id on port $port..." -ForegroundColor Cyan

        $redisUrl = "redis://$REDIS_HOST`:$REDIS_PORT"
        # cmd.exe wrapper with explicit output redirection, detached via WMI
        $cmdLine = "cmd.exe /c `"set PORT=$port& set INSTANCE_ID=$id& set MONGO_CONNECT_TIMEOUT_MS=2000& set REDIS_URL=$redisUrl& node src/server.js > `"`"$logFile`"`" 2> `"`"$errFile`"`"`""
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
                if ($h.IsHealthy) {
                    $ready[$id] = $true

                    # Record exact Node PID from the listening TCP socket
                    $conn = Get-NetTCPConnection -LocalPort $inst.Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
                    if ($conn -and $conn.OwningProcess) {
                        $newState[$id].Pid = $conn.OwningProcess
                    }

                    Write-Host "  [OK] $id is HEALTHY on port $($inst.Port) (PID: $($newState[$id].Pid), Uptime: $($h.Data.uptime)s, Redis: $($h.Data.redis.connected))" -ForegroundColor Green
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
            $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($conn -and $conn.OwningProcess) {
                $pidNum = $conn.OwningProcess
            }
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
        $conn = Get-NetTCPConnection -LocalPort $inst.Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($conn -and $conn.OwningProcess) {
            $p = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            if ($p -and $p.ProcessName -like "*node*") {
                Write-Host "[Stop] Stopping remaining listener on port $($inst.Port) (PID: $($conn.OwningProcess))..." -ForegroundColor Cyan
                Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
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
