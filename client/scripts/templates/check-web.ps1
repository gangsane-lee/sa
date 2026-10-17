# ════════════════════════════════════════════════════════════════
#  사緣 Web 서버(IIS) 점검 — 화면 파일을 복사한 뒤 Web 서버에서 실행
#    PowerShell(관리자) →  powershell -ExecutionPolicy Bypass -File <사이트폴더>\_deploy\check-web.ps1
#  빌드할 때 servers.config.mjs 의 값으로 만들어졌다 (직접 고치지 말 것)
#  ✔ 정상  ⚠ 확인 권장  ✖ 이대로는 동작하지 않음
# ════════════════════════════════════════════════════════════════
$ErrorActionPreference = 'Continue'
$ApiUrl     = '__API_URL__'
$ApiHost    = '__API_HOST__'
$ApiPort    = __API_PORT__
$WebPort    = __WEB_PORT__
$ServerVar  = '__SERVER_VAR__'
$Domain     = '__DOMAIN__'
$EnvName    = '__ENV__'
$ServiceMode = '__SERVICE_MODE__'
$BuildId    = '__BUILD_ID__'

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

# ── 1. 서버 ───────────────────────────────────────────
Section '1 서버'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) { Ok '관리자 권한으로 실행 중' } else { Warn '관리자 권한이 아니에요' 'IIS 설정 일부를 읽지 못할 수 있어요.' 'PowerShell 을 "관리자 권한으로 실행" 한 뒤 다시 실행' }
$cs = Get-CimInstance Win32_ComputerSystem
if ($cs.PartOfDomain) { Ok "도메인 가입: $($cs.Domain)" } else { Fail '이 서버가 도메인에 가입돼 있지 않아요' 'Windows 인증(AD SSO)은 도메인에 가입된 서버에서만 동작해요.' "IT 부서에 $Domain 도메인 가입을 요청해 주세요" }

# ── 2. IIS 구성 요소 ──────────────────────────────────
Section '2 IIS 구성 요소'
$w3 = Get-Service W3SVC -ErrorAction SilentlyContinue
if ($w3 -and $w3.Status -eq 'Running') { Ok 'IIS(W3SVC) 실행 중' } else { Fail 'IIS 가 설치·실행되어 있지 않아요' $null '서버 관리자 → 역할 추가 → 웹 서버(IIS)' }
Import-Module WebAdministration -ErrorAction SilentlyContinue
try {
  $wa = Get-WindowsFeature Web-Windows-Auth -ErrorAction Stop
  if ($wa.Installed) { Ok 'Windows 인증 기능 설치됨' } else { Fail 'Windows 인증 기능이 없어요' $null 'Install-WindowsFeature Web-Windows-Auth  (인터넷 없이 설치 가능)' }
} catch { Info 'Windows 인증 기능 설치 여부를 확인하지 못했어요 (서버 OS 가 아니면 정상)' }
if (Test-Path "$env:windir\System32\inetsrv\rewrite.dll") { Ok 'URL Rewrite 설치됨' } else { Fail 'URL Rewrite 가 없어요' 'web.config 의 /api 전달·화면 주소 규칙을 쓰려면 필요해요. 없으면 사이트 전체가 500.19 오류' '개발 서버에서 IIS URL Rewrite 2.1 설치 파일(.msi)을 받아 복사해 설치' }
if (Test-Path "$env:ProgramFiles\IIS\Application Request Routing\requestRouter.dll") { Ok 'ARR(Application Request Routing) 설치됨' } else { Fail 'ARR 이 없어요' '/api 요청을 API 서버로 넘기려면 필요해요.' '개발 서버에서 ARR 3.0 설치 파일(.msi)을 받아 복사해 설치' }
try {
  $proxy = Get-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name enabled -ErrorAction Stop
  if ($proxy.Value -eq $true) { Ok 'ARR 프록시 켜짐' } else { Fail 'ARR 프록시가 꺼져 있어요' $null "Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name enabled -Value True" }
} catch { Warn 'ARR 프록시 설정을 읽지 못했어요' $_.Exception.Message 'ARR 설치 후 다시 실행' }
try {
  $vars = @(Get-WebConfiguration -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/rewrite/allowedServerVariables/add' -ErrorAction Stop | ForEach-Object { $_.name })
  if ($vars -contains $ServerVar) { Ok "로그인 헤더 변수 허용됨 ($ServerVar)" } else { Fail "로그인 헤더 변수($ServerVar)가 허용되어 있지 않아요" 'IIS 가 사용자 계정을 API 서버로 넘기지 못해 /api 가 500 오류가 나요.' "Add-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/rewrite/allowedServerVariables' -Name '.' -Value @{name='$ServerVar'}" }
} catch { Warn '허용된 서버 변수를 읽지 못했어요' $_.Exception.Message 'URL Rewrite 설치 후 다시 실행' }

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
  try {
    $win = (Get-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Location $site.name -Filter 'system.webServer/security/authentication/windowsAuthentication' -Name enabled).Value
    $anon = (Get-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Location $site.name -Filter 'system.webServer/security/authentication/anonymousAuthentication' -Name enabled).Value
    if ($win -eq $true) { Ok 'Windows 인증 켜짐' } else { Fail 'Windows 인증이 꺼져 있어요' '사용자 계정을 알 수 없어 모두 안내 화면으로 가요.' "Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Location '$($site.name)' -Filter 'system.webServer/security/authentication/windowsAuthentication' -Name enabled -Value True" }
    if ($anon -eq $false) { Ok '익명 인증 꺼짐' } else { Fail '익명 인증이 켜져 있어요' '브라우저가 Windows 계정을 보내지 않아요.' "Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Location '$($site.name)' -Filter 'system.webServer/security/authentication/anonymousAuthentication' -Name enabled -Value False" }
  } catch { Warn '인증 설정을 읽지 못했어요' $_.Exception.Message $null }
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
if ($cfg -and $cfg -match """mode"":""$ServiceMode""") { Ok "화면 모드 $ServiceMode" } elseif ($cfg) { Fail '화면 모드가 빌드 기준과 달라요' $cfg $null }

# ── 5. 연결 ───────────────────────────────────────────
Section '5 연결'
$t = Test-NetConnection $ApiHost -Port $ApiPort -WarningAction SilentlyContinue
if ($t.TcpTestSucceeded) { Ok "API 서버 $($ApiHost):$ApiPort 연결됨" } else { Fail "API 서버 $($ApiHost):$ApiPort 에 연결하지 못했어요" 'API 서버가 꺼져 있거나 방화벽에 막혔어요.' @('API 서버에서  pm2 status  ·  npm run check', "API 서버 방화벽에서 이 Web 서버 → $ApiPort 허용") }
try {
  $h = Invoke-RestMethod "$ApiUrl/api/health" -TimeoutSec 5
  if ($h.ok) { Ok "API 서버 상태 정상 (저장소 $($h.store))" } else { Fail 'API 서버 상태 이상' ($h | ConvertTo-Json -Compress) $null }
} catch { Fail 'API 서버 상태 확인 실패' $_.Exception.Message 'API 서버에서  pm2 logs sayeon-api' }
try {
  $r = Invoke-WebRequest "http://localhost:$WebPort/" -UseDefaultCredentials -UseBasicParsing -TimeoutSec 10
  if ($r.StatusCode -eq 200 -and $r.Content -match 'sayeon|사緣') { Ok "이 서버에서 화면 열림 (http://localhost:$WebPort/)" } else { Warn "화면 응답 $($r.StatusCode)" $null $null }
} catch { Fail '이 서버에서 화면이 열리지 않아요' $_.Exception.Message '위 2·3 항목(URL Rewrite·사이트·인증)을 먼저 해결' }
try {
  $h2 = Invoke-RestMethod "http://localhost:$WebPort/api/health" -UseDefaultCredentials -TimeoutSec 10
  if ($h2.ok) { Ok 'IIS → API 서버 전달(/api) 정상' } else { Fail 'IIS → API 전달 응답 이상' $null $null }
} catch { Fail 'IIS 가 /api 를 API 서버로 넘기지 못했어요' $_.Exception.Message @('ARR 설치·프록시 켜짐, 로그인 헤더 변수 허용 확인 (2단계)', "API 서버 방화벽: 이 서버 → $ApiPort") }

# ── 6. 로그인 (지금 Windows 사용자로) ──────────────────
Section "6 로그인 시험 — 지금 로그인한 Windows 계정($env:USERDOMAIN\$env:USERNAME)으로"
if ($ServiceMode -eq 'test') { Info 'test 모드라 로그인 시험을 건너뛰어요' } else {
  try {
    $sso = Invoke-RestMethod "http://localhost:$WebPort/api/auth/sso" -Method Post -Body '{}' -ContentType 'application/json' -Headers @{ 'X-Requested-With' = 'sayeon' } -UseDefaultCredentials -TimeoutSec 20
    Ok "로그인 성공 — 사번 $($sso.user.empNo) · $($sso.user.name)"
    Info '사용자 PC 에서도 같은 주소로 들어오면 바로 홈이 열려야 해요'
  } catch {
    $code = $null; if ($_.ErrorDetails -and $_.ErrorDetails.Message) { try { $code = ($_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction Stop).code } catch {} }
    switch ($code) {
      'SSO_FAILED' { Fail '이 계정이 확인되지 않았어요 (SSO_FAILED)' 'API 서버가 로그인 헤더를 못 받았거나(Web 서버 IP 불일치), AD·인사 API 에서 확인되지 않았어요.' @('API 서버  pm2 logs sayeon-api 의 [sso] 줄 확인', 'API 서버에서  npm run sso:test -- --user 이계정ID') }
      'SSO_UNAVAILABLE' { Fail 'AD 또는 사내 인사 API 연결 실패' $_.ErrorDetails.Message 'API 서버에서  npm run sso:test -- --user 이계정ID' }
      'NOT_ACTIVE_EMPLOYEE' { Warn '재직 중이 아닌 계정으로 확인됐어요' '연결은 정상이에요.' $null }
      default { Fail "로그인 시험 실패 ($code)" $_.Exception.Message 'API 서버  pm2 logs sayeon-api' }
    }
  }
}

Write-Host ""
Write-Host "────────────────────────────────────────"
Write-Host "  [OK] $($script:ok)   [주의] $($script:warn)   [실패] $($script:fail)"
if ($script:fail -gt 0) { Write-Host "  [실패] 항목을 고친 뒤 다시 실행해 주세요. (docs/GO-LIVE.md)" -ForegroundColor Red; exit 1 }
Write-Host "  Web 서버 준비 완료 — 사내 PC 에서 $('__PUBLIC_URL__') 로 접속해 확인해 주세요." -ForegroundColor Green
exit 0
