# ════════════════════════════════════════════════════════════════
#  사緣 API 서버 배포 — 배포 패키지의 api 폴더를 설치 폴더로 옮기고 점검·시작까지
#    PowerShell →  powershell -ExecutionPolicy Bypass -File <패키지>\api\_deploy\deploy-api.ps1
#    설치 폴더를 바꾸려면  -Target D:\apps\sa   (영문·숫자로만 된 경로)
#  하는 일: 확인 → 백업 → PM2 멈춤 → 교체(.env·관리자 파일은 그대로) → npm run check → 시작 → 상태 확인
#           점검·시작이 실패하면 백업으로 자동으로 되돌린다
#  되돌리기만:  ... deploy-api.ps1 -Rollback C:\sayeon-backup\api\<시각>
#  빌드할 때 servers.config.mjs 값으로 만들어졌다 — 환경 __ENV__ · 앱 __APP_NAME__ · 포트 __API_PORT__ · 빌드 __BUILD_ID__
# ════════════════════════════════════════════════════════════════
param(
  [string]$Target = 'C:\apps\sa',
  [string]$BackupRoot = 'C:\sayeon-backup\api',
  [string]$Rollback = '',
  [switch]$NoAutoRollback
)
$ErrorActionPreference = 'Stop'
$AppName = '__APP_NAME__'
$Port = __API_PORT__
$Package = Split-Path -Parent $PSScriptRoot   # 패키지의 api 폴더
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Pm2 = Join-Path $Target 'server\node_modules\pm2\bin\pm2'

function Step($t) { Write-Host ""; Write-Host "▶ $t" -ForegroundColor Cyan }
function Good($m) { Write-Host "  [OK]   $m" -ForegroundColor Green }
function Bad($m) { Write-Host "  [실패] $m" -ForegroundColor Red }
# PM2 는 처음 부를 때 백그라운드 데몬을 띄운다. 출력을 파이프로 받으면 데몬이 파이프를 붙잡아 끝나지 않으므로
# 새 프로세스로 실행하고 그 프로세스만 기다린다 (화면 출력은 그대로 보인다)
function Pm2 {
  $p = Start-Process -FilePath 'node' -ArgumentList (@(('"' + $Pm2 + '"')) + $args) -NoNewWindow -PassThru
  $p.WaitForExit()
  return $p.ExitCode
}
function Copy-Dir($from, $to, [switch]$Mirror) {
  if (-not (Test-Path $from)) { return }
  $rc = @($from, $to, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:2', '/W:2')
  if ($Mirror) { $rc += "/PURGE" }
  robocopy @rc | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "복사 실패: $from → $to (robocopy $LASTEXITCODE)" }
}
function Wait-Health {
  for ($i = 0; $i -lt 20; $i++) {
    try { $h = Invoke-RestMethod "http://localhost:$Port/api/health" -TimeoutSec 3; if ($h.ok) { return $h } } catch {}
    Start-Sleep -Seconds 2
  }
  return $null
}
function Restore($from) {
  Step "되돌리기: $from → $Target"
  if (Test-Path $Pm2) { [void](Pm2 stop $AppName) }
  robocopy $from $Target /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "되돌리기 복사 실패 (robocopy $LASTEXITCODE)" }
  Push-Location (Join-Path $Target 'server'); [void](Pm2 restart $AppName); Pop-Location
  if (Wait-Health) { Good '이전 버전으로 되돌렸고 정상 동작해요' } else { Bad '되돌렸지만 상태 확인이 안 돼요 — npm run pm2 -- logs ' + $AppName }
}

if ($Rollback) { Restore $Rollback; exit 0 }

# ── 1. 확인 ──────────────────────────────────────────
Step '1 확인'
$nodeV = (& node -v) 2>$null
if (-not $nodeV) { throw 'Node.js 가 없어요 — 개발 서버에서 받은 node-v22.12.0-x64.msi 를 먼저 설치해 주세요' }
if ($nodeV -ne 'v22.12.0') { Write-Host "  [주의] Node.js $nodeV — 운영 표준은 v22.12.0" -ForegroundColor Yellow } else { Good "Node.js $nodeV" }
if ($Target -match '[^\x20-\x7E]') { throw "설치 경로에 한글 등 영문이 아닌 글자가 있어요: $Target (Node.js 22.12 가 강제 종료돼요)" }
if (-not (Test-Path (Join-Path $Package 'server\start.cjs'))) { throw "패키지가 아니에요: $Package" }
$first = -not (Test-Path (Join-Path $Target 'server\start.cjs'))
Good ("패키지 $Package → 설치 폴더 $Target" + $(if ($first) { ' (처음 설치)' } else { ' (업데이트)' }))

# ── 2. 백업 ──────────────────────────────────────────
$backup = ''
if (-not $first) {
  Step '2 지금 버전 백업'
  $backup = Join-Path $BackupRoot $stamp
  New-Item -ItemType Directory -Force -Path $backup | Out-Null
  robocopy $Target $backup /MIR /NFL /NDL /NJH /NJS /NP /XD logs | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "백업 실패 (robocopy $LASTEXITCODE)" }
  Good "백업: $backup"
}

# ── 3. 멈춤 ──────────────────────────────────────────
if (-not $first) {
  Step "3 $AppName 멈춤"
  Push-Location (Join-Path $Target 'server'); [void](Pm2 stop $AppName); Pop-Location
}

# ── 4. 교체 (.env · config\admins.js · 라이선스 키는 건드리지 않는다) ──
Step '4 교체'
New-Item -ItemType Directory -Force -Path $Target | Out-Null
Copy-Item (Join-Path $Package 'servers.config.mjs') $Target -Force
foreach ($d in @('tools', 'server\src', 'server\scripts', 'server\sql', 'server\node_modules', 'client\src\api', 'client\src\constants', 'client\src\utils', 'client\node_modules')) {
  Copy-Dir (Join-Path $Package $d) (Join-Path $Target $d) -Mirror
}
Copy-Dir (Join-Path $Package 'server\config') (Join-Path $Target 'server\config')   # admins.js 는 남긴다
Get-ChildItem (Join-Path $Package 'server') -File | ForEach-Object { Copy-Item $_.FullName (Join-Path $Target 'server') -Force }
Copy-Item (Join-Path $Package 'client\package.json') (Join-Path $Target 'client') -Force
Copy-Dir (Join-Path $Package '_deploy') (Join-Path $Target '_deploy') -Mirror
Good '교체 완료'

if (-not (Test-Path (Join-Path $Target 'server\.env'))) {
  Write-Host ""
  Write-Host "  처음 설치예요. 이어서:" -ForegroundColor Yellow
  Write-Host "   1) $Target\server 에서  copy .env.example .env  → 비밀번호·키 채우기 (docs/GO-LIVE.md)"
  Write-Host "   2) $Target\server\config 에서  copy admins.example.js admins.js  → 관리자 채우기"
  Write-Host "   3) 이 스크립트를 다시 실행"
  exit 2
}

# ── 5. 점검 ──────────────────────────────────────────
Step '5 점검 (npm run check)'
Push-Location (Join-Path $Target 'server')
& node scripts\run.mjs check
$checkCode = $LASTEXITCODE
Pop-Location
if ($checkCode -ne 0) {
  Bad '점검에 실패 항목이 있어요 (위 [✖] 항목)'
  if ($backup -and -not $NoAutoRollback) { Restore $backup; exit 1 }
  Write-Host "  고친 뒤 이 스크립트를 다시 실행해 주세요." -ForegroundColor Yellow
  exit 1
}

# ── 6. 시작 ──────────────────────────────────────────
Step "6 $AppName 시작"
Push-Location (Join-Path $Target 'server')
[void](Pm2 ping)   # 데몬을 먼저 띄워 둔다 (아래 목록 조회가 데몬을 띄우며 멈추지 않게)
$listed = (& node $Pm2 jlist 2>$null | Out-String)
if ($listed -match """name"":""$AppName""") { [void](Pm2 restart $AppName --update-env) } else { [void](Pm2 start ecosystem.config.cjs) }
[void](Pm2 save)
Pop-Location

# ── 7. 상태 확인 ─────────────────────────────────────
Step '7 상태 확인'
$h = Wait-Health
if ($h) {
  Good "http://localhost:$Port/api/health → 정상 (저장소 $($h.store))"
  Write-Host ""
  Write-Host "  API 서버 배포 완료 · 빌드 __BUILD_ID__" -ForegroundColor Green
  Write-Host "  다음: Web 서버에서  _deploy\check-web.ps1  (로그인 시험까지)"
  if ($backup) { Write-Host "  되돌리기:  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Rollback `"$backup`"" }
  exit 0
}
Bad "40초 안에 서버가 응답하지 않아요 — npm run pm2 -- logs $AppName"
if ($backup -and -not $NoAutoRollback) { Restore $backup }
exit 1
