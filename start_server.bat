@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
	"$ErrorActionPreference = 'SilentlyContinue';" ^
	"$root = Get-Location;" ^
	"Write-Host ('Serving folder: ' + $root.Path);" ^
	"$py = Get-Command python -ErrorAction SilentlyContinue;" ^
	"if (-not $py) { Write-Host 'Python is not installed or not in PATH.'; Read-Host 'Press Enter to exit'; exit 1 };" ^
	"$ports = @(8080, 8081, 5500, 9000);" ^
	"$selectedPort = $null;" ^
	"foreach ($p in $ports) {" ^
	"  $listeners = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue;" ^
	"  if ($listeners) {" ^
	"    foreach ($l in $listeners) {" ^
	"      $proc = Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue;" ^
	"      if ($proc -and $proc.ProcessName -like 'python*') {" ^
	"        Write-Host ('Stopping old Python server on port ' + $p + ' (PID ' + $l.OwningProcess + ')...');" ^
	"        Stop-Process -Id $l.OwningProcess -Force -ErrorAction SilentlyContinue;" ^
	"      }" ^
	"    }" ^
	"    $listeners = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue;" ^
	"  }" ^
	"  if (-not $listeners) { $selectedPort = $p; break }" ^
	"};" ^
	"if (-not $selectedPort) { Write-Host 'Could not find an available port in: 8080, 8081, 5500, 9000'; Read-Host 'Press Enter to exit'; exit 1 };" ^
	"$url = 'http://127.0.0.1:' + $selectedPort + '/login.html';" ^
	"Write-Host ('Starting local server on ' + $url);" ^
	"Start-Process $url;" ^
	"python -m http.server $selectedPort --bind 127.0.0.1"

if errorlevel 1 (
	pause
	exit /b 1
)

pause
