# ════════════════════════════════════════════════════════════════
#  사緣 API 서버 배포 (IIS + iisnode) — 배포 패키지의 api 폴더를 IIS 사이트 폴더로 옮기고 점검·재시작까지
#    PowerShell(관리자) →  powershell -ExecutionPolicy Bypass -File <패키지>\api\_deploy\deploy-api.ps1
#    사이트 폴더를 바꾸려면  -Target D:\sites\sasystem-api   (영문·숫자로만 된 경로)
#  하는 일: 확인 → (처음이면 앱 풀·사이트 만들기) → 백업 → 교체(.env·관리자 파일은 그대로) → npm run check
#           → 앱 풀 재시작 → 상태 확인. 점검·시작이 실패하면 백업으로 자동으로 되돌린다
#  되돌리기만:  ... deploy-api.ps1 -Rollback C:\sasystem-backup\__APP_NAME__\<시각>
#  직접 복사해도 된다: api 폴더 → 사이트 폴더 (.env · config\admins.js 는 덮어쓰지 말 것) → 앱 풀 재시작
#  빌드할 때 servers.config.mjs 값으로 만들어졌다 — 환경 __ENV__ · 사이트 __APP_NAME__ · 포트 __API_PORT__ · 빌드 __BUILD_ID__
# ════════════════════════════════════════════════════════════════
param(
  [string]$Target = 'C:\sites\__APP_NAME__',
  [string]$BackupRoot = 'C:\sasystem-backup\__APP_NAME__',
  [string]$Rollback = '',
  [switch]$NoAutoRollback
)
$ErrorActionPreference = 'Stop'
$Site = '__APP_NAME__'
$Pool = '__APP_NAME__'
$Port = __API_PORT__
# 이 API 를 부르는 곳 = 사용자 PC 브라우저 (Web 서버는 화면 파일만 내고 이 서버와 통신하지 않는다)
$Https = '__API_HTTPS__' -eq 'true'      # servers.config.mjs 의 api.https
$CertName = '__API_DNS__'                # 인증서에 적힌 DNS 이름 (api.dnsName)
$Proto = $(if ($Https) { 'https' } else { 'http' })
# 상태 확인 주소 — https 면 인증서 이름과 맞아야 하므로 localhost 대신 DNS 이름
$ApiUrl = $(if ($Https) { '__API_URL__' } else { "http://localhost:$Port" })
# PowerShell 5.1 은 기본이 TLS 1.0 이라 https 상태 확인이 실패한다
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$Package = Split-Path -Parent $PSScriptRoot   # 패키지의 api 폴더
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
# 교체할 때 건드리지 않는 것 (서버에만 있는 비밀값·관리자·로그·백업)
$Keep = @('.env', 'config\admins.js')
$KeepDirs = @('iisnode')

function Step($t) { Write-Host ""; Write-Host "▶ $t" -ForegroundColor Cyan }
function Good($m) { Write-Host "  [OK]   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [주의] $m" -ForegroundColor Yellow }
function Bad($m) { Write-Host "  [실패] $m" -ForegroundColor Red }
function Mirror($from, $to) {
  $rc = @($from, $to, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:2', '/W:2', '/XF') + ($Keep | ForEach-Object { Split-Path $_ -Leaf }) + @('/XD') + $KeepDirs
  robocopy @rc | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "복사 실패: $from → $to (robocopy $LASTEXITCODE)" }
}
function Wait-Health {
  for ($i = 0; $i -lt 20; $i++) {
    try { $h = Invoke-RestMethod "$ApiUrl/api/health" -TimeoutSec 5; if ($h.ok) { return $h } } catch {}
    Start-Sleep -Seconds 2
  }
  return $null
}
function Restart-Api {
  try { Restart-WebAppPool -Name $Pool -ErrorAction Stop } catch { Start-WebAppPool -Name $Pool -ErrorAction SilentlyContinue }
  # 첫 요청이 iisnode 로 서버를 띄운다
  try { Invoke-WebRequest "$ApiUrl/api/health" -UseBasicParsing -TimeoutSec 30 | Out-Null } catch {}
}
function Restore($from) {
  Step "되돌리기: $from → $Target"
  Mirror $from $Target
  Restart-Api
  if (Wait-Health) { Good '이전 버전으로 되돌렸고 정상 동작해요' } else { Bad "되돌렸지만 상태 확인이 안 돼요 — $Target\iisnode 의 최근 로그 확인" }
}

Import-Module WebAdministration -ErrorAction Stop
if ($Rollback) { Restore $Rollback; exit 0 }

# ── 1. 확인 ──────────────────────────────────────────
Step '1 확인'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'PowerShell 을 "관리자 권한으로 실행" 한 뒤 다시 실행해 주세요 (IIS 설정을 바꿔요)' }
$nodeV = (& node -v) 2>$null
if (-not $nodeV) { throw 'Node.js 가 없어요 — 개발 서버에서 받은 node-v22.12.0-x64.msi 를 먼저 설치해 주세요' }
if ($nodeV -ne 'v22.12.0') { Warn "Node.js $nodeV — 운영 표준은 v22.12.0" } else { Good "Node.js $nodeV" }
if (-not (Test-Path "$env:ProgramFiles\iisnode\iisnode.dll")) { throw 'iisnode 가 없어요 — 개발 서버에서 받은 iisnode-full-v0.2.26-x64.msi 를 먼저 설치해 주세요' }
Good 'iisnode 설치됨'
if (-not (Test-Path "$env:windir\System32\inetsrv\rewrite.dll")) { throw 'URL Rewrite 가 없어요 — rewrite_amd64 .msi 를 먼저 설치해 주세요' }
Good 'URL Rewrite 설치됨'
if ($Target -match '[^\x20-\x7E]') { throw "사이트 폴더에 한글 등 영문이 아닌 글자가 있어요: $Target (Node.js 22.12 가 강제 종료돼요)" }
if (-not (Test-Path (Join-Path $Package 'main.js'))) { throw "패키지가 아니에요: $Package" }
$first = -not (Test-Path (Join-Path $Target 'main.js'))
Good ("패키지 $Package → 사이트 폴더 $Target" + $(if ($first) { ' (처음 설치)' } else { ' (업데이트)' }))

# ── 2. 앱 풀 · 사이트 (없으면 만든다) ─────────────────
Step "2 IIS 앱 풀 · 사이트 ($Site, 포트 $Port)"
New-Item -ItemType Directory -Force -Path $Target | Out-Null
if (-not (Test-Path "IIS:\AppPools\$Pool")) {
  New-WebAppPool -Name $Pool | Out-Null
  Good "앱 풀 $Pool 만듦"
}
# 데이터를 메모리에 두는 구조 — 서버 프로세스는 반드시 1개, 겹치는 재생 사용 안 함·유휴 종료 끔
Set-ItemProperty "IIS:\AppPools\$Pool" -Name managedRuntimeVersion -Value ''
Set-ItemProperty "IIS:\AppPools\$Pool" -Name processModel.idleTimeout -Value ([TimeSpan]::Zero)
Set-ItemProperty "IIS:\AppPools\$Pool" -Name recycling.disallowOverlappingRotation -Value $true
Set-ItemProperty "IIS:\AppPools\$Pool" -Name recycling.periodicRestart.time -Value ([TimeSpan]::Zero)
Set-ItemProperty "IIS:\AppPools\$Pool" -Name processModel.maxProcesses -Value 1
Good "앱 풀 $Pool — 관리 코드 없음 · 유휴 종료 끔 · 겹치는 재생 사용 안 함 · 프로세스 1개"
$site = Get-Website -Name $Site -ErrorAction SilentlyContinue
if (-not $site) {
  New-Website -Name $Site -Port $Port -PhysicalPath $Target -ApplicationPool $Pool -Ssl:$Https | Out-Null
  Good "사이트 $Site 만듦 ($Proto 포트 $Port)"
} else {
  $ports = @($site.bindings.Collection | ForEach-Object { ($_.bindingInformation -split ':')[1] })
  if ($ports -notcontains "$Port") { New-WebBinding -Name $Site -Port $Port -Protocol $Proto; Warn "사이트 $Site 에 포트 $Port 바인딩을 더했어요 (지금: $($ports -join ', '))" }
  if ([Environment]::ExpandEnvironmentVariables($site.physicalPath).TrimEnd('\') -ine $Target.TrimEnd('\')) { Warn "사이트 $Site 의 폴더가 $($site.physicalPath) 예요 — 이 스크립트는 $Target 에 설치해요 (-Target 로 맞춰 주세요)" }
  Good "사이트 $Site 있음"
}
# https — 인증서(로컬 컴퓨터개인)를 이 포트 바인딩에 연결한다
if ($Https) {
  $cert = Get-ChildItem Cert:LocalMachineMy | Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) -and ($_.DnsNameList.Unicode -contains $CertName) } | Sort-Object NotAfter -Descending | Select-Object -First 1
  if (-not $cert) { throw "인증서가 없어요 — '$CertName' 이름의 인증서(개인 키 포함)를 '로컬 컴퓨터개인' 저장소에 가져온 뒤 다시 실행해 주세요" }
  $b = Get-WebBinding -Name $Site -Protocol https -Port $Port
  if (-not $b) { New-WebBinding -Name $Site -Port $Port -Protocol https; $b = Get-WebBinding -Name $Site -Protocol https -Port $Port }
  $b.AddSslCertificate($cert.Thumbprint, 'My')
  Good "https 인증서 연결: $CertName (만료 $($cert.NotAfter.ToString('yyyy-MM-dd')))"
  if ($cert.NotAfter -lt (Get-Date).AddDays(30)) { Warn "인증서가 30일 안에 만료돼요 — 갱신 후 이 스크립트를 다시 실행" }
  try { [void][Net.Dns]::GetHostAddresses($CertName) } catch { Warn "이 서버에서 $CertName 이름을 찾지 못해요 — 상태 확인을 위해 사내 DNS 등록 또는 hosts 파일에 '127.0.0.1 $CertName'" }
}
# iisnode 가 사이트 폴더에 로그를 쓰고(iisnode\), web.config 변경을 감지할 수 있게 앱 풀 계정에 권한
$acct = "IIS AppPool\$Pool"
& icacls $Target /grant "${acct}:(OI)(CI)M" /T /Q | Out-Null
Good "폴더 권한: $acct 수정 가능"
# 방화벽 — 사용자 PC 브라우저가 직접 부르므로 사내 PC 대역에서 이 포트로
if (-not (Get-NetFirewallRule -DisplayName "sasystem $Site $Port" -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName "sasystem $Site $Port" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
  Good "방화벽: → $Port 인바운드 허용 규칙을 만들었어요"; Warn "보안 정책상 범위를 좁혀야 하면 규칙 `"sasystem $Site $Port`" 의 원격 주소를 사내 PC 대역으로 (Set-NetFirewallRule -DisplayName ... -RemoteAddress 10.0.0.0/8 등)"
}

# ── 3. 백업 ──────────────────────────────────────────
$backup = ''
if (-not $first) {
  Step '3 지금 버전 백업'
  $backup = Join-Path $BackupRoot $stamp
  New-Item -ItemType Directory -Force -Path $backup | Out-Null
  robocopy $Target $backup /MIR /NFL /NDL /NJH /NJS /NP /XD iisnode | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "백업 실패 (robocopy $LASTEXITCODE)" }
  Good "백업: $backup"
}

# ── 4. 교체 (.env · config\admins.js · iisnode 로그는 건드리지 않는다) ──
Step '4 교체'
Stop-WebAppPool -Name $Pool -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Mirror $Package $Target
Good '교체 완료 (main.js · web.config · routes · src · shared · node_modules …)'
if (-not (Test-Path (Join-Path $Target '.env')) -or -not (Test-Path (Join-Path $Target 'config\admins.js'))) {
  Write-Host ""
  Write-Host "  처음 설치예요. 이어서:" -ForegroundColor Yellow
  Write-Host "   1) $Target 에서  copy .env.example .env  → DB 계정·비밀번호·키 채우기 (docs/GO-LIVE.md 1장 D)"
  Write-Host "   2) $Target\config 에서  copy admins.example.js admins.js  → 관리자 채우기"
  Write-Host "   3) web.config 의 환경·포트·DB 서버 확인 (지금: 환경 __ENV__ · 포트 $Port)"
  Write-Host "   4) 이 스크립트를 다시 실행"
  exit 2
}

# ── 5. 점검 ──────────────────────────────────────────
Step '5 점검 (npm run check)'
Push-Location $Target
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
Step "6 앱 풀 $Pool 시작"
Start-WebAppPool -Name $Pool -ErrorAction SilentlyContinue
Start-Website -Name $Site -ErrorAction SilentlyContinue
Restart-Api

# ── 7. 상태 확인 ─────────────────────────────────────
Step '7 상태 확인'
$h = Wait-Health
if ($h) {
  Good "$ApiUrl/api/health → 정상 (저장소 $($h.store))"
  Write-Host ""
  Write-Host "  API 서버 배포 완료 · 환경 __ENV__ · 빌드 __BUILD_ID__" -ForegroundColor Green
  Write-Host "  다음: Web 서버에서  _deploy\check-web.ps1"
  if ($backup) { Write-Host "  되돌리기:  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Rollback `"$backup`"" }
  exit 0
}
Bad "40초 안에 서버가 응답하지 않아요 — 브라우저로 $ApiUrl/api/health 를 열어 오류 확인 · $Target\iisnode 의 최근 로그"
if ($backup -and -not $NoAutoRollback) { Restore $backup }
exit 1
