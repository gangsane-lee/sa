# ════════════════════════════════════════════════════════════════
#  사緣 Web 서버 배포 — 배포 패키지의 web 폴더를 IIS 사이트 폴더로 옮기고 점검까지
#    PowerShell(관리자) →  powershell -ExecutionPolicy Bypass -File <패키지>\web\_deploy\deploy-web.ps1 -SitePath D:\sites\sayeon
#  하는 일: 지금 사이트 폴더 백업 → 새 화면으로 교체(robocopy /MIR) → check-web.ps1 점검
#  되돌리기:  ... deploy-web.ps1 -SitePath D:\sites\sayeon -Rollback <백업 폴더>
# ════════════════════════════════════════════════════════════════
param(
  [Parameter(Mandatory = $true)][string]$SitePath,
  [string]$BackupRoot = 'C:\sayeon-backup\web',
  [string]$Rollback = ''
)
$ErrorActionPreference = 'Stop'
$Package = Split-Path -Parent $PSScriptRoot   # 패키지의 web 폴더
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

function Step($t) { Write-Host ""; Write-Host "▶ $t" -ForegroundColor Cyan }

if ($Rollback) {
  Step "되돌리기: $Rollback → $SitePath"
  if (-not (Test-Path $Rollback)) { throw "백업 폴더가 없어요: $Rollback" }
  robocopy $Rollback $SitePath /MIR /NFL /NDL /NJH /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "되돌리기 복사 실패 (robocopy $LASTEXITCODE)" }
  Write-Host "  되돌렸어요. 브라우저에서 Ctrl+F5" -ForegroundColor Green
  exit 0
}

Step '1 확인'
if (-not (Test-Path (Join-Path $Package 'index.html'))) { throw "패키지에 index.html 이 없어요: $Package" }
if ((Resolve-Path $Package).Path.TrimEnd('\') -ieq $SitePath.TrimEnd('\')) { throw '패키지 폴더와 사이트 폴더가 같아요. 패키지는 다른 곳에 풀어 두고 실행해 주세요.' }
Write-Host "  패키지 $Package"
Write-Host "  사이트 $SitePath"

if (Test-Path $SitePath) {
  Step '2 지금 사이트 백업'
  $backup = Join-Path $BackupRoot $stamp
  New-Item -ItemType Directory -Force -Path $backup | Out-Null
  robocopy $SitePath $backup /MIR /NFL /NDL /NJH /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "백업 실패 (robocopy $LASTEXITCODE)" }
  Write-Host "  백업: $backup"
} else {
  New-Item -ItemType Directory -Force -Path $SitePath | Out-Null
  $backup = ''
}

Step '3 새 화면으로 교체'
robocopy $Package $SitePath /MIR /NFL /NDL /NJH /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "복사 실패 (robocopy $LASTEXITCODE)" }
Write-Host '  교체 완료'

Step '4 점검'
& powershell -ExecutionPolicy Bypass -File (Join-Path $SitePath '_deploy\check-web.ps1')
$code = $LASTEXITCODE
if ($code -ne 0 -and $backup) {
  Write-Host ""
  Write-Host "  점검에 실패 항목이 있어요. 설정 문제면 고친 뒤 check-web.ps1 을 다시 실행하고," -ForegroundColor Yellow
  Write-Host "  새 화면 자체가 문제면 되돌리기:  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -SitePath `"$SitePath`" -Rollback `"$backup`"" -ForegroundColor Yellow
}
exit $code
