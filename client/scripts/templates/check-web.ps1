# ════════════════════════════════════════════════════════════════
#  사緣 Web 서버(IIS) 점검 — 화면 파일을 복사한 뒤 Web 서버에서 실행
#    PowerShell(관리자) →  powershell -ExecutionPolicy Bypass -File <사이트폴더>\_deploy\check-web.ps1
#  빌드할 때 servers.config.mjs 의 값으로 만들어졌다 (직접 고치지 말 것)
#  ✔ 정상  ⚠ 확인 권장  ✖ 이대로는 동작하지 않음
# ════════════════════════════════════════════════════════════════
$ErrorActionPreference = 'Continue'
# PowerShell 5.1 은 기본이 TLS 1.0 이라 https API 서버에 붙지 못한다
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$ApiUrl     = '__API_URL__'
$ApiPort    = __API_PORT__
$WebPort    = __WEB_PORT__
$EnvName    = '__ENV__'
$SsoMode    = '__SSO_MODE__'
$EmployeeUrl = '__EMPLOYEE_URL__'
$BuildId    = '__BUILD_ID__'
$PublicUrl  = '__PUBLIC_URL__'

$SiteRoot = Split-Path -Parent $PSScriptRoot
$script:ok = 0; $script:warn = 0; $script:fail = 0
function Ok($m) { $script:ok++; Write-Host "  [OK]   $m" -ForegroundColor Green }
function Warn($m, $why, $fix) { $script:warn++; Write-Host "  [주의] $m" -ForegroundColor Yellow; if ($why) { Write-Host "         원인: $why" }; foreach ($f in @($fix)) { if ($f) { Write-Host "         해결: $f" } } }
function Fail($m, $why, $fix) { $script:fail++; Write-Host "  [실패] $m" -ForegroundColor Red; if ($why) { Write-Host "         원인: $why" }; foreach ($f in @($fix)) { if ($f) { Write-Host "         해결: $f" } } }
function Info($m) { Write-Host "         · $m" }
function Section($t) { Write-Host ""; Write-Host "[$t]" -ForegroundColor Cyan }

Write-Host ""
Write-Host "사緣 Web 서버 점검 · 환경 $EnvName · 빌드 $BuildId" -ForegroundColor Cyan
Write-Host "  사이트 폴더 $SiteRoot"
Write-Host "  이 서버는 화면 파일만 내요. 사용자 PC 브라우저가 API 서버($ApiUrl)를 직접 불러요"

# ── 1. 서버 ───────────────────────────────────────────
Section '1 서버'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) { Ok '관리자 권한으로 실행 중' } else { Warn '관리자 권한이 아니에요' 'IIS 설정 일부를 읽지 못할 수 있어요.' 'PowerShell 을 "관리자 권한으로 실행" 한 뒤 다시 실행' }
Info "로그인 방식 $SsoMode — 화면이 사내 인사정보 URL 로 확인해요 (이 서버의 도메인 가입·Windows 인증은 필요 없음)"

# ── 2. IIS 구성 요소 ──────────────────────────────────
Section '2 IIS 구성 요소'
$w3 = Get-Service W3SVC -ErrorAction SilentlyContinue
if ($w3 -and $w3.Status -eq 'Running') { Ok 'IIS(W3SVC) 실행 중' } else { Fail 'IIS 가 설치·실행되어 있지 않아요' $null '서버 관리자 → 역할 추가 → 웹 서버(IIS)' }
Import-Module WebAdministration -ErrorAction SilentlyContinue
try {
  $sc = Get-WindowsFeature Web-Static-Content -ErrorAction Stop
  if ($sc.Installed) { Ok '정적 콘텐츠 기능 설치됨' } else { Fail '정적 콘텐츠 기능이 없어요' '화면 파일(.js · .css)을 내지 못해 하얀 화면이 떠요.' 'Install-WindowsFeature Web-Static-Content  (인터넷 없이 설치 가능)' }
} catch { Info '정적 콘텐츠 기능 설치 여부를 확인하지 못했어요 (서버 OS 가 아니면 Windows 기능 → IIS → 일반 HTTP 기능 → 정적 콘텐츠)' }
if (Test-Path "$env:windir\System32\inetsrv\rewrite.dll") { Ok 'URL Rewrite 설치됨' } else { Fail 'URL Rewrite 가 없어요' 'web.config 의 화면 주소 규칙을 쓰려면 필요해요. 없으면 사이트 전체가 500.19 오류' '개발 서버에서 IIS URL Rewrite 2.1 설치 파일(.msi)을 받아 복사해 설치' }
Info 'ARR(Application Request Routing)은 필요 없어요 — 이 서버는 /api 를 넘기지 않아요'

# ── 3. 사이트 ─────────────────────────────────────────
Section '3 IIS 사이트'
$site = $null
try {
  $site = Get-Website | Where-Object { [Environment]::ExpandEnvironmentVariables($_.physicalPath).TrimEnd('\') -ieq $SiteRoot.TrimEnd('\') } | Select-Object -First 1
} catch {}
if (-not $site) {
  Fail "이 폴더를 쓰는 IIS 사이트가 없어요" $null "New-Website -Name 'sayeon' -Port $WebPort -PhysicalPath '$SiteRoot'"
} else {
  Ok "사이트 '$($site.name)' · 상태 $($site.state)"
  if ($site.state -ne 'Started') { Fail '사이트가 멈춰 있어요' $null "Start-Website -Name '$($site.name)'" }
  $ports = @($site.bindings.Collection | ForEach-Object { ($_.bindingInformation -split ':')[1] })
  if ($ports -contains "$WebPort") { Ok "포트 $WebPort 바인딩" } else { Fail "포트 $WebPort 바인딩이 없어요 (지금: $($ports -join ', '))" $null "New-WebBinding -Name '$($site.name)' -Port $WebPort -Protocol http" }
}
try {
  $fw = Get-NetFirewallPortFilter -Protocol TCP -ErrorAction Stop | Where-Object { $_.LocalPort -eq "$WebPort" } | Get-NetFirewallRule | Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow' }
  if ($fw) { Ok "방화벽 인바운드 $WebPort 허용" } else { Warn "방화벽에 $WebPort 인바운드 허용 규칙이 안 보여요" '사내 PC 에서 접속하지 못할 수 있어요.' "New-NetFirewallRule -DisplayName 'sayeon web $WebPort' -Direction Inbound -Protocol TCP -LocalPort $WebPort -Action Allow" }
} catch { Info '방화벽 규칙을 확인하지 못했어요' }

# ── 4. 화면 파일 ──────────────────────────────────────
Section '4 화면 파일'
foreach ($f in @('index.html', 'web.config', 'sayeon.config.js')) {
  if (Test-Path (Join-Path $SiteRoot $f)) { Ok "$f 있음" } else { Fail "$f 가 없어요" '빌드 결과를 일부만 복사했어요.' '배포 패키지의 web 폴더 전체를 사이트 폴더에 복사' }
}
$manifestPath = Join-Path $PSScriptRoot 'manifest.json'
if (Test-Path $manifestPath) {
  $manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $bad = @()
  foreach ($p in $manifest.files.PSObject.Properties) {
    $full = Join-Path $SiteRoot ($p.Name -replace '/', '\')
    if (-not (Test-Path $full)) { $bad += "없음: $($p.Name)"; continue }
    if ((Get-FileHash $full -Algorithm SHA256).Hash.ToLower() -ne $p.Value) { $bad += "다름: $($p.Name)" }
  }
  if ($bad.Count -eq 0) { Ok "파일 $(@($manifest.files.PSObject.Properties).Count)개가 빌드와 같아요" } else { Fail "빌드와 다른 파일 $($bad.Count)개" (($bad | Select-Object -First 5) -join ' · ') '배포 패키지의 web 폴더를 다시 통째로 복사 (robocopy /MIR)' }
} else { Warn 'manifest.json 이 없어 파일 비교를 건너뛰어요' $null $null }
$cfg = Get-Content (Join-Path $SiteRoot 'sayeon.config.js') -Raw -ErrorAction SilentlyContinue
if ($SsoMode -eq 'browser') {
  if ($EmployeeUrl) { Ok "사내 인사정보 URL $EmployeeUrl" } else { Fail '사내 인사정보 URL 이 비어 있어요' '모든 사용자가 "임직원만 이용할 수 있어요" 화면으로 가요.' '개발 서버의 servers.config.mjs 에서 sso.employeeApi.url 을 채우고 다시 빌드·배포' }
  if ($cfg -and $EmployeeUrl -and -not $cfg.Contains($EmployeeUrl)) { Warn 'sayeon.config.js 의 인사정보 URL 이 빌드 기준과 달라요' '사이트 폴더에서 직접 고쳤다면 괜찮아요.' $null }
}
if ($cfg -and -not $cfg.Contains($ApiUrl)) { Fail "sayeon.config.js 에 API 주소($ApiUrl)가 없어요" '화면이 다른 주소로 API 를 불러요.' '배포 패키지의 web 폴더를 다시 통째로 복사 (사이트 폴더에서 직접 고쳤다면 apiBase 값 확인)' } elseif ($cfg) { Ok "화면이 부를 API 주소 $ApiUrl" }

# ── 5. 화면 응답 ──────────────────────────────────────
Section '5 화면 응답 (이 서버에서)'
try {
  $r = Invoke-WebRequest "http://localhost:$WebPort/" -UseBasicParsing -TimeoutSec 10
  if ($r.StatusCode -eq 200 -and $r.Content -match 'sayeon|사緣') { Ok "화면 열림 (http://localhost:$WebPort/)" } else { Warn "화면 응답 $($r.StatusCode)" $null $null }
} catch { Fail '이 서버에서 화면이 열리지 않아요' $_.Exception.Message '위 2·3 항목(IIS·URL Rewrite·사이트)을 먼저 해결' }
# 화면 스크립트가 진짜 스크립트로 오는지 — 파일이 없으면 화면 주소 규칙이 index.html 을 대신 돌려줘 하얀 화면이 된다
$js = Get-ChildItem (Join-Path $SiteRoot 'assets') -Filter '*.js' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($js) {
  try {
    $r = Invoke-WebRequest "http://localhost:$WebPort/assets/$($js.Name)" -UseBasicParsing -TimeoutSec 10
    if ($r.Headers['Content-Type'] -match 'javascript') { Ok "화면 스크립트 응답 정상 ($($r.Headers['Content-Type']))" } else { Fail "화면 스크립트가 $($r.Headers['Content-Type']) 로 와요" '브라우저가 실행하지 않아 하얀 화면이 떠요.' '정적 콘텐츠 기능 · .js MIME 형식(IIS 관리자 → MIME 형식) 확인' }
  } catch { Fail "화면 스크립트(/assets/$($js.Name))가 열리지 않아요" $_.Exception.Message '정적 콘텐츠 기능 확인' }
} else { Fail 'assets 폴더에 화면 스크립트가 없어요' $null '배포 패키지의 web 폴더를 다시 통째로 복사' }
try {
  $r = Invoke-WebRequest "http://localhost:$WebPort/saju" -UseBasicParsing -TimeoutSec 10
  if ($r.Content -match 'sayeon.config.js') { Ok '화면 주소 새로 고침 정상 (/saju → index.html)' } else { Warn '화면 주소 규칙 응답이 이상해요' $null $null }
} catch { Fail '화면 주소(/saju)를 새로 고치면 열리지 않아요' $_.Exception.Message 'URL Rewrite 설치 · web.config 확인' }

# ── 6. API 서버 — 사용자 PC 가 직접 부른다 ─────────────
Section '6 API 서버 (참고 — 이 서버와는 통신하지 않아요)'
Info "사용자 PC 대역 → API 서버 $ApiPort 가 열려 있어야 해요 (이 Web 서버 → API 는 필요 없음)"
try {
  $r = Invoke-WebRequest "$ApiUrl/api/health" -UseBasicParsing -TimeoutSec 5 -Headers @{ Origin = $PublicUrl }
  Ok "이 서버에서도 API 상태 확인됨 ($ApiUrl/api/health)"
  if ($r.Headers['Access-Control-Allow-Origin'] -eq $PublicUrl) { Ok "API 서버가 이 화면 주소($PublicUrl)의 호출을 허용해요" }
  else { Fail "API 서버가 화면 주소 $PublicUrl 를 허용하지 않아요" '브라우저가 API 응답을 막아 로그인할 수 없어요.' @('API 서버의 기준정보(servers.config.mjs 의 web) 확인 후 묶음 다시 만들기', "또는 API 서버 .env 에 CORS_ORIGINS=$PublicUrl → 앱 풀 재시작") }
} catch {
  Info "이 서버에서는 API 서버에 닿지 않아요 — 서버끼리 막혀 있으면 정상이에요 ($($_.Exception.Message))"
}
Info "사내 PC 브라우저에서 $ApiUrl/api/health 를 열어 {""ok"":true …} 가 보이는지 확인해 주세요"
if ($ApiUrl -like 'https:*') { Info '인증서 경고가 뜨면: 인증서 이름이 주소와 같은지 · 사내 인증 기관(루트) 인증서가 사용자 PC 에 배포됐는지' }
if ($SsoMode -eq 'browser' -and $EmployeeUrl) { Info "사내 인사정보 URL($EmployeeUrl)도 사용자 PC 브라우저가 직접 불러요" }

# ── 7. 로그인 ─────────────────────────────────────────
Section '7 로그인 — 사용자 PC 에서 확인'
Info '사내 PC 에서 사이트를 열어 확인해 주세요:'
Info '  임직원 → 바로 홈 / 아니면 "임직원만 이용할 수 있어요" 화면'
Info '  "서버에 연결하지 못했어요" 면: 브라우저 F12 → Console 의 CORS 오류(API 서버가 허용한 화면 주소) · Network 에서 API 주소가 열리는지(방화벽·인증서)'

Write-Host ""
Write-Host "────────────────────────────────────────"
Write-Host "  [OK] $($script:ok)   [주의] $($script:warn)   [실패] $($script:fail)"
if ($script:fail -gt 0) { Write-Host "  [실패] 항목을 고친 뒤 다시 실행해 주세요. (docs/GO-LIVE.md)" -ForegroundColor Red; exit 1 }
Write-Host "  Web 서버 준비 완료 — 사내 PC 에서 $PublicUrl 로 접속해 확인해 주세요." -ForegroundColor Green
exit 0
