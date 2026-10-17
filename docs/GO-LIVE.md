# 사緣 운영 가이드 — 최초 배포 · 기능 추가 배포 · 운영 중 변경

배포·운영 절차는 **이 문서 하나**에만 적는다. README·설계서에는 요약과 링크만 둔다.
각 단계 끝의 **확인** 을 통과해야 다음 단계로 넘어간다. 끝낸 항목은 `[ ]` → `[x]`.

---

## 한눈에

### 서버 구성 — 값은 `servers.config.mjs` 한 곳에서

| 역할 | 주소 (지금은 가짜 — 실제 IP 로 바꿀 것) | 인터넷 | 하는 일 |
|---|---|---|---|
| **개발 서버** | `12.123.321.13` | **됨** | 개발·시험, **빌드와 배포 패키지 만들기** (`npm run release`) |
| **Web 배포 운영 서버** | `10.123.321.12:8282` | 안 됨 | IIS. 화면 파일 · Windows 인증(AD SSO) · `/api` 를 API 서버로 전달 |
| **API 배포 운영/개발 서버** | `12.83.18.17:8292` (개발 API `:8293`) | 안 됨 | Node.js + PM2. 업무 처리 · AD 조회 · 사내 인사 API 호출 |
| **DB 서버** | `10.166.101.127:1433` | 안 됨 | MSSQL — 운영 DB `sasystem` · 개발 DB `sasystem_dev` |

- 사용자(사내 PC)는 **Web 서버 주소 하나**로만 들어온다: `http://<Web 서버>:8282`, 관리자 `…/changeme`
- 모두 Windows 서버. 운영 서버 3대는 인터넷이 막혀 있어 **필요한 모든 파일을 개발 서버에서 만들어 복사**한다

```
[개발 서버] ── npm run release ──▶ release/<빌드번호>-production/
                                     ├ web/   ──(복사)──▶ [Web 서버] IIS 사이트 폴더   ← deploy-web.ps1 / check-web.ps1
                                     └ api/   ──(복사)──▶ [API 서버] C:\apps\sa         ← deploy-api.ps1 (안에서 npm run check)

[사내 PC] ──http :8282──▶ [Web 서버 IIS] ──Windows 인증으로 SECDS\아이디 확인
                              │  /api 만 API 서버로 넘기며 계정 헤더(x-sayeon-user)를 붙임
                              ▼
                         [API 서버 Node :8292] ── 그 헤더는 Web 서버 IP 에서 온 것만 믿음
                              │  ① AD 에서 사번·이름·부서 ② 사내 인사 API(사번) → 재직 확인
                              ▼
                         [DB 서버] sasystem
```

### 마스터 파일 `servers.config.mjs` (저장소 맨 위)

IP·포트·DB 이름·관리자 주소·로그인 방식은 **여기서만** 고친다. 아래가 이 값을 자동으로 따라간다.

| 따라가는 곳 | 무엇이 |
|---|---|
| API 서버 (`server/src/config.js`) | 포트, 사용자 접속 주소, DB 서버/이름, 믿을 Web 서버 IP, 로그인 방식 |
| 화면 빌드 (`npm run build`) | Web 서버용 `web.config`(API 서버 주소로 전달), `sayeon.config.js`, 점검·배포 스크립트 |
| 개발 화면 (`npm run dev`) | `/api` 를 개발 API 서버로 넘기는 주소 |
| 배포 패키지·점검 | 각 서버 주소·포트로 연결 확인 |

비밀번호·키는 마스터에 쓰지 않는다 → API 서버의 `server/.env` (git·패키지에 들어가지 않음).
IP 가 형식에 안 맞으면(예: `321`) 서버·빌드·패키지·점검이 모두 멈추고 알려 준다.

### 운영 표준 버전 · 경로

| Node.js | npm | PM2 |
|---|---|---|
| **22.12.0** | **10.9.0** (Node 에 포함) | **5.3.0** (서버 패키지에 포함 — 따로 설치 안 함) |

> ⚠ **설치 경로는 영문·숫자로만** (예: `C:\apps\sa`, `C:\deploy\…`). Node.js 22.12.0 은 Windows 에서 한글이 들어간 경로의 패키지를 불러올 때 **메시지 없이 강제 종료**된다. 모든 스크립트가 먼저 확인하고 알려 준다.

---

## 0. 먼저 확인·요청할 것

| # | 확인할 것 | 누구에게 | 왜 |
|---|---|---|---|
| 1 | 4대 서버의 **실제 IP**, Web 서버의 **사내 DNS 이름**(있으면) | IT | 지금 IP 는 가짜(`321` 은 불가능한 값) |
| 2 | **Web·API 서버가 `SECDS` 도메인에 가입**돼 있는지 | IT | Web: Windows 인증이 도메인 가입 서버에서만 됨 / API: AD 조회 |
| 3 | API 서버에서 PM2 를 돌릴 **SECDS 도메인 서비스 계정** (비밀번호 만료 없음) | IT | 로컬 계정으로 돌리면 AD 를 조회하지 못함 |
| 4 | **사내 인사 API** — 주소, POST 본문 필드(`sabun`?), 응답 JSON 예시, API 키, API 서버에서 접근 가능한지 | 인사 시스템 담당 | `servers.config.mjs` 의 `sso.hrApi` |
| 5 | **AD 계정에 사번 속성**이 있는지 (아래 명령으로 바로 확인) | 본인 | 인사 API 에 넣을 사번을 AD 에서 얻음 |
| 6 | Web 서버에 **IIS 확장 설치 허용** — URL Rewrite 2.1, ARR 3.0 (.msi, 오프라인 설치) | 보안·IT | `/api` 전달에 필요 |
| 7 | **방화벽** — 사내 PC → Web 8282 / Web → API 8292 / API → DB 1433 / API → 인사 API / 개발 서버 → API 8293·DB | 네트워크 | 사내 PC → API 8292 는 **막는 것을 권장** (지금은 열려 있다고 함 — 열려 있어도 계정 헤더는 Web 서버 IP 에서 온 것만 믿음) |
| 8 | 사내 PC 브라우저가 Web 서버 주소를 **로컬 인트라넷**으로 보도록 그룹 정책 등록, Kerberos SPN | IT | 안 하면 접속할 때 Windows 로그인 창이 뜰 수 있음 (IP 주소 접속은 특히) |
| 9 | 개발 API 를 **API 서버의 8293** 에서 돌려도 되는지 (그림의 "운영/개발" 겸용) | 본인 | 다르면 `servers.config.mjs` 의 `development` 수정 |
| 10 | https 인증서 계획, DB 백업 정책, `DATA_KEY` 보관 위치 | IT·보안 | 9장 |

5번 확인 — 사내 PC PowerShell 에서 (내 계정 정보만 나온다):

```powershell
$p = ([adsisearcher]"(sAMAccountName=$env:USERNAME)").FindOne().Properties; $p.PropertyNames | Sort-Object | ForEach-Object { "{0} = {1}" -f $_, ($p[$_] -join ', ') }
```

`employeeid`·`employeenumber` 중 사번이 든 것이 있으면 그대로 된다. 다른 이름이면 알려 주면 맞춘다.

---

## 1. 최초 배포

순서: **A 개발 서버 → B 기준정보 → C 오프라인 설치 파일 → D API 서버 → E DB → F Web 서버 → G 사내 PC 확인 → H 정식 전환**

### A. 개발 서버 준비 (인터넷 됨)

- [ ] Node.js **22.12.0** 설치, git 설치
- [ ] 코드 받기 — **영문 경로**
  ```powershell
  mkdir C:\apps
  cd C:\apps
  git clone -b <배포할 브랜치> https://github.com/gangsane-lee/sa.git
  ```
- [ ] 패키지 설치
  ```powershell
  cd C:\apps\sa\client
  npm ci
  cd ..\server
  npm ci
  ```
- [ ] DevExtreme 라이선스 키 파일 `client\src\.devextreme\license-key.js` (작업 PC 에서 복사하거나 [8-1](#8-1-devextreme-라이선스))
- **확인**: `node -v` → `v22.12.0` · `cd C:\apps\sa\client` → `npm run build` 가 `[postbuild] … ✔ web.config …` 로 끝나는지 (라이선스 없음 ⚠ 이 없어야 함)

### B. 기준정보 — 실제 IP 넣기

- [ ] `C:\apps\sa\servers.config.mjs` 에 0장 1·4·9번 값을 넣는다
  - `environments.production.web.host` / `api.host` / `db.host`, 포트, `db.name: 'sasystem'`
  - Web 서버 사내 DNS 이름이 있으면 `web.dnsName`
  - `sso.hrApi.url` · `method` · `body`(예: `{ sabun: '{empNo}' }`)
- **확인**: `cd C:\apps\sa\server` → `npm run release` 의 `[1] 준비` 가 ✔ 로 지나가는지 (IP·포트·DB 이름 형식, 운영/개발 DB 겹침을 확인)
- [ ] 바꾼 기준정보를 git 에 커밋 (배포한 값을 나중에 다시 찾을 수 있게)

### C. 오프라인 설치 파일 (개발 서버에서 받아 USB·공유 폴더로)

| 파일 | 설치할 서버 |
|---|---|
| `node-v22.12.0-x64.msi` (nodejs.org) | API 서버 |
| IIS **URL Rewrite 2.1** (`rewrite_amd64_ko-KR.msi` 등) | Web 서버 |
| IIS **ARR 3.0** (`requestRouter_amd64.msi`) | Web 서버 |

IIS · Windows 인증은 Windows Server 에 들어 있어 인터넷 없이 켤 수 있다. PM2·DB 드라이버 등 Node 라이브러리는 배포 패키지에 들어간다.

### 패키지 만들기 (개발 서버)

```powershell
cd C:\apps\sa\server
npm run release
```

| 단계 | 확인하는 것 | 멈추는 경우 |
|---|---|---|
| 1 준비 | Node 버전·경로, 기준정보, git 상태, 패키지 설치 | IP·DB 이름 형식, 운영/개발 DB 겹침 |
| 2 화면 빌드 | 정식(open)이면 시연 코드 자동 제외, 라이선스 포함 | 빌드 실패, 빌드 종류 불일치 |
| 3 패키지 | `release\<빌드번호>-production\web` · `api` · `배포안내.txt` | — |
| 4 패키지 점검 | `.env`·관리자 파일·라이선스 키가 **안 들어갔는지**, 필수 파일, **패키지 안에서 서버 코드를 실제로 불러 봄** | 비밀 파일 섞임, 라이브러리 빠짐 |

- **확인**: 마지막 줄 `배포 패키지 준비 완료`. `release\<빌드번호>-production` 폴더 통째로 운영 서버에 복사 (`--zip` 을 붙이면 zip 도 만든다)

### D. API 서버 (12.83.18.17)

1. [ ] `node-v22.12.0-x64.msi` 설치 → **확인** `node -v` = `v22.12.0`
2. [ ] **0장 3번의 도메인 서비스 계정으로 로그인**해서 이후 작업 (PM2 가 이 계정으로 돈다 — AD 조회 권한)
3. [ ] 패키지를 `C:\deploy\<빌드번호>-production` 에 복사 → PowerShell
   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\deploy\<빌드번호>-production\api\_deploy\deploy-api.ps1
   ```
   처음이면 `C:\apps\sa` 에 파일을 놓고 **`.env`·관리자 파일을 만들라는 안내와 함께 멈춘다**
4. [ ] `C:\apps\sa\server\.env` — `copy .env.example .env` 후 채우기

   | 항목 | 값 |
   |---|---|
   | `SAYEON_ENV` | `production` |
   | `SESSION_SECRET` | 비워 두고 5번의 점검을 돌리면 예시 값을 만들어 준다 |
   | `DB_USER` / `DB_PASSWORD` | 앱 전용 계정 (`sayeon_app` + 새 비밀번호 — E 단계가 만든다) |
   | `DB_ADMIN_USER` / `DB_ADMIN_PASSWORD` | `sa` 등 — E 단계 동안만, 끝나면 지움 |
   | `DATA_KEY` | 점검이 만들어 주는 값. ⚠ **한 번 정하면 절대 바꾸지 말고 따로 보관** |
   | `SSO_API_KEY` | 인사 API 키 (있으면) |
5. [ ] `C:\apps\sa\server\config\admins.js` — `copy admins.example.js admins.js` → `accounts` 에 매칭 담당자 사번·계정 ID, 비밀번호 해시
   ```powershell
   cd C:\apps\sa\server
   npm run hash-password -- "새 관리자 비밀번호"
   ```
6. [ ] DB 준비 → **E 단계**
7. [ ] 방화벽: 8292 인바운드를 **Web 서버 IP 에서만** 허용
   ```powershell
   New-NetFirewallRule -DisplayName "sayeon api 8292" -Direction Inbound -Protocol TCP -LocalPort 8292 -RemoteAddress <Web서버IP> -Action Allow
   ```
8. [ ] 다시 실행 — 이번에는 **점검(`npm run check`) → PM2 시작 → 상태 확인**까지 한다
   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\deploy\<빌드번호>-production\api\_deploy\deploy-api.ps1
   ```
9. [ ] 재부팅 후 자동 시작 — 작업 스케줄러 (도메인 서비스 계정으로)
   ```powershell
   schtasks /Create /TN "sayeon-api" /SC ONSTART /RU "SECDS\<서비스계정>" /RP * /TR "cmd /c cd /d C:\apps\sa\server && npm run pm2 -- resurrect"
   ```
- **확인**
  - `deploy-api.ps1` 마지막이 `API 서버 배포 완료` · `http://localhost:8292/api/health → 정상`
  - `cd C:\apps\sa\server` → `npm run check` 가 ✖ 0 ([7-1](#7-1-npm-run-check--api-서버) 읽는 법)
  - `npm run sso:test -- --user <내 회사아이디>` → AD 조회 → 인사 API → "바로 들어올 수 있어요"
  - 재부팅 후 `npm run pm2 -- status` 에 `sayeon-api` online

### E. DB (10.166.101.127) — 운영 `sasystem`, 개발 `sasystem_dev`

둘 중 하나. 둘 다 **여러 번 실행해도 안전**하다(있는 것은 건너뛴다).

**방법 A — `npm run db:setup` (API 서버에서, 권장)**
1. `.env` 에 앱 계정(`DB_USER`·`DB_PASSWORD`)과 관리 계정(`DB_ADMIN_USER=sa`·`DB_ADMIN_PASSWORD`)
2. 바꾸지 않고 할 일만 보기 → 실행
   ```powershell
   cd C:\apps\sa\server
   npm run db:setup -- --check
   npm run db:setup
   ```
   DB 만들기 → 앱 로그인(만료 없음) → DB 사용자 → 읽기·쓰기 권한(`db_datareader`·`db_datawriter`만) → 테이블 `dbo.SA_DOC` → **앱 계정으로 로그인·읽기·쓰기 시험**(되돌림)
3. 끝나면 `.env` 에서 `DB_ADMIN_*` 지우고 `DB_AUTO_CREATE=false`

**방법 B — `server\sql\setup.sql` (DB 담당자, SSMS)** — 맨 위 `@DbName`·`@AppLogin`·`@AppPass` 만 바꿔 실행(F5) → 결과 표 확인

**개발 DB** — 개발 API(`SAYEON_ENV=development`)의 `.env` 로 같은 방법을 한 번 더 (`sasystem_dev`)

- **확인**: `db:setup` 마지막 `✖ 0` 또는 `setup.sql` 결과 표가 "정상 · 읽기·쓰기 · 있음"

| 상황 | `db:setup` · `setup.sql` | 서버 시작 |
|---|---|---|
| DB 없음 | 만든다 (권한 없으면 ✖ + 안내) | `DB_AUTO_CREATE=true` 면 만든다 / 아니면 멈추고 안내 |
| DB OFFLINE · 읽기 전용 | ✖ + 안내 | 멈추고 안내 |
| 앱 로그인 없음 / 사용 중지 | 만든다 / 사용으로 바꾼다 | 로그인 실패 원인 안내 |
| 로그인 있음 · 비밀번호 다름 | `--reset-password` (SQL: `@ResetPassword = 1`) | — |
| 비밀번호가 암호 정책 위반 | ✖ + 조건 안내 | — |
| DB 사용자 없음 / 로그인과 연결 끊김(DB 복원) | 만든다 / 다시 잇는다 | "DB를 열 수 없어요" 안내 |
| 권한 없음 | 읽기·쓰기 권한을 준다 | 저장할 때 오류 + 안내 |
| 테이블 없음 / 구조 다름 | 만든다 / ✖ (자동으로 고치지 않음) | 권한 있으면 만든다 / 멈추고 안내 |
| `DATA_KEY` 가 저장된 데이터와 다름 | — | 멈추고 "처음 쓰던 키" 안내 |

서버가 시작에 실패하면 PM2 가 10초 간격으로 최대 15번 다시 시도하고 멈춘다. 원인은 `npm run pm2 -- logs sayeon-api` 에 "원인 / 해결" 로 남는다.

### F. Web 서버 (10.123.321.12) — IIS

1. [ ] 서버 관리자 → 역할: **웹 서버(IIS)**, 기능: **Windows 인증** (인터넷 없이 됨)
   ```powershell
   Install-WindowsFeature Web-Server, Web-Windows-Auth -IncludeManagementTools
   ```
2. [ ] C 단계의 **URL Rewrite 2.1**, **ARR 3.0** 설치
3. [ ] ARR 프록시 켜기, 계정 헤더 변수 허용 (관리자 PowerShell)
   ```powershell
   Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name enabled -Value True
   Add-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/rewrite/allowedServerVariables' -Name '.' -Value @{name='HTTP_X_SAYEON_USER'}
   ```
4. [ ] 사이트 만들기 (폴더는 영문 경로) · 인증: Windows 켬, 익명 끔
   ```powershell
   New-Item -ItemType Directory -Force D:\sites\sayeon
   New-Website -Name 'sayeon' -Port 8282 -PhysicalPath 'D:\sites\sayeon'
   Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Location 'sayeon' -Filter 'system.webServer/security/authentication/windowsAuthentication' -Name enabled -Value True
   Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Location 'sayeon' -Filter 'system.webServer/security/authentication/anonymousAuthentication' -Name enabled -Value False
   New-NetFirewallRule -DisplayName 'sayeon web 8282' -Direction Inbound -Protocol TCP -LocalPort 8282 -Action Allow
   ```
5. [ ] 화면 배포 — 백업·교체·점검까지
   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\deploy\<빌드번호>-production\web\_deploy\deploy-web.ps1 -SitePath D:\sites\sayeon
   ```
- **확인**: `check-web.ps1` 이 `[실패] 0` ([7-2](#7-2-check-webps1--web-서버) 읽는 법). 마지막 **로그인 시험**에서 지금 Windows 계정으로 `로그인 성공 — 사번 …` 이 나와야 한다 (Web→API→AD→인사 API→DB 전체가 이어졌다는 뜻)

### G. 사내 PC 확인

- [ ] 사내 PC(회사 계정 Windows 로그인)에서 `http://<Web 서버>:8282` → **로그인 화면 없이 홈**, 화면 위 이름·사업부
- [ ] Windows 로그인 창이 뜨면 → 0장 8번(인트라넷 영역) 요청
- [ ] 관리자 담당자 PC 에서 `…/changeme` → 관리자 비밀번호 → 대시보드
- [ ] 신청서 작성 → 하트 → 매칭 → 쪽지, 인연 사주 (리허설 계정 2개 이상)
- [ ] 리허설 데이터 정리: 관리자 화면에서 삭제, 또는 처음 상태로 — API 서버 `npm run pm2 -- stop sayeon-api` → DB `DELETE FROM sasystem.dbo.SA_DOC;` → `npm run pm2 -- start sayeon-api`

### H. 시연 → 정식 전환

- 시연 기간: `servers.config.mjs` 의 `production.serviceMode: 'test'` → 패키지 → 배포. 데이터는 각자 브라우저에만 저장된다
- 기준정보 옮기기: 시연 화면 관리자 → 기준정보 → **[엑셀로 내보내기]** → 정식 전환 후 운영 관리자 화면 → **[파일 가져오기]** → 미리보기 → **[적용]**
- 정식: `serviceMode: 'open'` → `npm run release` (시연 코드 자동 제외) → D·F 의 배포 스크립트 → G 확인 → 사용자 주소 공지 (관리자 주소는 공지하지 않음)

---

## 2. 기능 추가 배포 (반복)

| # | 어디서 | 할 일 | 확인 |
|---|---|---|---|
| 1 | 개발 서버 | 개발 → test 모드(`client` `npm run dev`)로 시험 → 개발 API(`SAYEON_ENV=development`, 8293, `sasystem_dev`)로 실제 DB 시험 | 새 기능 + 아래 6번 목록이 개발 환경에서 됨 |
| 2 | 개발 서버 | git 커밋 | `git status` 깨끗 |
| 3 | 개발 서버 | `npm run release` | 마지막 `배포 패키지 준비 완료`, ⚠ "커밋하지 않은 변경" 이 없을 것 |
| 4 | API 서버 | `deploy-api.ps1` (패키지의 `api\_deploy`) — **API 먼저** | `배포 완료` · `/api/health 정상`. 점검·시작이 실패하면 **자동으로 이전 버전으로 되돌린다** |
| 5 | Web 서버 | `deploy-web.ps1 -SitePath D:\sites\sayeon` | `check-web.ps1` `[실패] 0` · 로그인 시험 성공 |
| 6 | 사내 PC | Ctrl+F5 → **새 기능** + 기본 흐름: 홈 진입 · 인연 사주 · 신청서 저장 · 쪽지 · 관리자 대시보드 | 모두 됨 |
| 7 | 문제 시 | 되돌리기 — 각 스크립트가 마지막에 보여주는 `-Rollback <백업 폴더>` (API·Web 각각) | 이전 화면·기능으로 동작 |

- DB 는 문서 한 테이블(`SA_DOC`) 구조라 **기능 추가로 DB 구조를 바꿀 일이 없다** — 코드만 바꾼다
- 기준정보(선택 목록)를 추가했다면 배포 후 관리자 화면 → 기준정보 → 엑셀 가져오기
- API 를 먼저 배포하는 이유: 새 화면이 새 API 를 부를 수 있어서. 화면만 바뀐 경우 5번만 해도 된다 (패키지는 늘 통째로 만든다)
- 백업 위치: API `C:\sayeon-backup\api\<시각>`, Web `C:\sayeon-backup\web\<시각>` — 가끔 오래된 것을 지운다

---

## 3. 운영 중 바꿀 때

| 바꿀 것 | 고칠 곳 (개발 서버) | 반영 |
|---|---|---|
| 서버 IP·포트 | `servers.config.mjs` | `npm run release` → API·Web 둘 다 배포 (+ 방화벽) |
| Web 서버 DNS 이름 | `servers.config.mjs` 의 `web.dnsName` | release → 둘 다 배포 |
| DB 서버 IP / DB 이름 | `servers.config.mjs` 의 `db` (+ DB 백업·복원 → `npm run db:setup`) | release → API 배포 |
| DB 계정·비밀번호 | API 서버 `server\.env` | `npm run check` → `npm run pm2 -- restart sayeon-api` |
| 사내 인사 API 주소·본문 | `servers.config.mjs` 의 `sso.hrApi` | release → API 배포 → `npm run sso:test -- --user …` |
| 인사 API 키 | API 서버 `server\.env` 의 `SSO_API_KEY` | `npm run pm2 -- restart sayeon-api` |
| 응답 필드 이름·사업부 이름 | `server\src\sso.js` 의 `FIELD`·`DIVISION_MAP` | release → API 배포 |
| 관리자 추가·삭제·비밀번호 | API 서버 `server\config\admins.js` | 자동 (3초) |
| 관리자 주소 | `servers.config.mjs` 의 `adminPath` | release → 둘 다 배포 |
| 기준정보(사업부·캠퍼스 등) | 관리자 화면 → 기준정보 → 엑셀 일괄 변경 | 바로 |
| https | Web 서버 IIS 인증서 바인딩 + API `.env` 의 `COOKIE_SECURE=true` | restart |

- 운영 서버에서 `servers.config.mjs` 를 직접 고쳐도 동작은 하지만, **다음 배포 때 패키지 값으로 덮어써진다**. 늘 개발 서버에서 고치고 커밋한다
- `pm2 restart` 를 하면 접속 중인 사용자는 다시 확인 과정을 거친다(자동이라 대부분 모름)

### 기준정보 일괄 변경 (엑셀)

관리자 → 기준정보 → **[엑셀로 내보내기]** → '기준정보' 시트 고치기(한 줄 = 한 항목) → **[파일 가져오기]** → 미리보기 → **[적용]**
- 코드 값은 바꾸지 않는다 (신청서가 참조) — 새 코드로 줄 추가 + 예전 줄 삭제
- 지운 줄: 아무도 안 쓰면 삭제, 쓰고 있으면 '사용 안 함' / 파일에 없는 그룹은 그대로
- 틀린 곳이 있으면 적용 버튼이 막히고 몇 행이 틀렸는지 보여준다. 적용하면 열람 기록에 남는다

---

## 4. 사내 로그인 (AD SSO) 구조

`servers.config.mjs` 의 `sso` 로 정한다. 로그인 화면은 없다.

1. **Web 서버 IIS** — Windows 인증으로 `SECDS\아이디` 확인 → `/api` 요청에 `x-sayeon-user` 헤더로 붙여 API 서버로 (사용자가 같은 헤더를 보내도 IIS 가 덮어쓴다)
2. **API 서버** — 이 헤더를 **Web 서버 IP(`web.host`)에서 온 요청일 때만** 믿는다. 다른 도메인 계정은 거절
3. **AD 조회**(`adLookup: true`) — API 서버가 PowerShell 로 그 계정의 `employeeID`·`employeeNumber`·`displayName`·`department`·`mail`·사용 여부를 읽는다 (10분 캐시). 사용 중지 계정 = 재직 아님
4. **사내 인사 API**(`hrApi.url`) — 본문의 `{id}`(계정)·`{empNo}`(AD 사번)·`{domain}` 을 채워 호출. 응답 JSON 어디에 있든 사번이 든 객체를 찾고, 필드 이름은 대소문자·`_` 무시(`SABUN`·`USER_NM`·`DIV_NM`·`EMP_STAT` 등). 재직 상태가 퇴직·휴직이면 거절. 비우면 AD 정보만 쓴다
5. 결과 → 확인되면 바로 홈 / 아니면 "AD SSO로 확인된 임직원만 이용할 수 있어요" 안내 화면

| 결과 | 화면 |
|---|---|
| AD·인사 API 에서 재직 확인 | 바로 홈 |
| 헤더 없음 · AD 에 없음 · 인사 API 404 · 사번 없음 | "AD SSO로 확인된 임직원만" |
| AD 사용 중지 · 인사 API 휴직/퇴직 | "재직 중인 임직원만 이용할 수 있어요" |
| AD 조회 불가 · 인사 API 5xx/연결 실패 | "사내 인증 서버에 연결하지 못했어요" |

- 시험: API 서버에서 `npm run sso:test -- --user 회사아이디` — AD 에서 읽은 속성, 인사 API 요청·응답, 사緣에 들어올 정보를 단계별로 보여준다
- 개발 환경: IIS 없이 `server\.env` 의 `DEV_SSO_USER=회사아이디` 로 그 계정처럼 시험 (`SAYEON_ENV=development` 일 때만 동작)

---

## 5. 개발 환경

| 무엇 | 어디 | 설정 |
|---|---|---|
| 화면 개발 (가짜 데이터) | 개발 서버 `client` → `npm run dev` | `client\public\sayeon.config.js` 의 `mode: 'test'` — 테스트 계정 골라 들어가기 |
| 화면 + 개발 API | 개발 서버 `npm run dev` → `/api` 를 개발 API(`servers.config.mjs` 의 `development.api`)로 | `mode: 'open'` |
| 개발 API | API 서버 8293 (또는 개발 서버) — `SAYEON_ENV=development`, DB `sasystem_dev`, PM2 이름 `sayeon-api-dev` | `npm run release -- --env development` 패키지를 다른 폴더(`C:\apps\sa-dev`)에 `deploy-api.ps1 -Target C:\apps\sa-dev` |

⚠ 운영과 개발은 **DB 이름·API 포트가 반드시 달라야 한다** (같으면 서로 데이터를 덮어쓴다 — 점검이 막는다).

---

## 6. 백업과 보안

- [ ] DB 정기 백업 — 데이터는 `sasystem.dbo.SA_DOC` 한 테이블
- [ ] `DATA_KEY` 를 DB 백업과 **다른 곳**에 보관 (없으면 이름·메일 복구 불가)
- [ ] API 서버 `server\.env`, `server\config\admins.js` 백업 (git·패키지에 없음)
- [ ] DB 는 전용 계정(읽기·쓰기만), `.env` 에 `DB_ADMIN_*` 남기지 않기
- [ ] 관리자 비밀번호 해시, 관리자 주소 비공개
- [ ] API 8292 는 Web 서버 IP 에서만 (사내 PC 직접 접근 차단 권장)
- 들어 있는 보호: 비밀번호를 받지 않음(SSO 만) · 계정 헤더는 Web 서버 IP 에서만 · SSO 확인 1분 30회 제한 · 세션 재발급 · 관리자 5회 실패 잠금 · 열람 기록 · 이름·메일 암호화

---

## 7. 점검 명령 읽는 법과 문제 해결

### 7-1. `npm run check` — API 서버

| 구역 | 확인하는 것 |
|---|---|
| 1 실행 환경 | Node 22.12.0 · npm · PM2 5.3.0(내장) · 설치 경로 한글 여부 |
| 2 서버 기준정보 | `servers.config.mjs` 형식(IP·포트·DB 이름), 운영/개발 겹침, 관리자 주소, **이 서버가 기준정보의 API 서버가 맞는지** |
| 2-1 `.env` | 예전 항목·오타, `SESSION_SECRET`·`DATA_KEY`, 쿠키, 남은 관리 계정 |
| 3 패키지 | server · 사주 라이브러리 |
| 5 포트 | 비었는지 / 사緣이 이미 쓰는지 / 다른 프로그램 |
| 6 DB | 네트워크 → 로그인 → DB → 테이블 → 권한 → `DATA_KEY` |
| 7 관리자 | `admins.js`, 계정, 해시 |
| 8 사내 로그인 | Web 서버 IP 신뢰, 도메인 가입, **지금 계정으로 AD 조회 시험**, 인사 API 주소·연결, Web 서버 응답 |

✔ 정상 · ⚠ 운영 전 정리 권장 · ✖ 이대로는 안 됨(종료 코드 1). 모든 ⚠·✖ 에 원인·해결이 나온다. `--skip-db`, `--skip-net` 옵션.

### 7-2. `check-web.ps1` — Web 서버

| 구역 | 확인하는 것 |
|---|---|
| 1 서버 | 관리자 권한, 도메인 가입 |
| 2 IIS 구성 요소 | IIS 실행, Windows 인증 기능, URL Rewrite, ARR, ARR 프록시 켜짐, 계정 헤더 변수 허용 |
| 3 사이트 | 이 폴더의 사이트, 8282 바인딩, Windows 인증 켬·익명 끔, 방화벽 |
| 4 화면 파일 | 필수 파일, **모든 파일이 빌드와 같은지(해시 비교)**, 화면 모드 |
| 5 연결 | API 서버 포트·상태, 이 서버에서 화면 열림, **IIS → API 전달** |
| 6 로그인 시험 | 지금 Windows 계정으로 `/api/auth/sso` → 사번·이름이 오면 전체 연결 정상 |

`[실패]` 마다 원인과 **그대로 실행할 PowerShell 명령**이 나온다.

### 7-3. 자주 나오는 문제

| 증상 | 원인 · 해결 |
|---|---|
| 명령이 메시지 없이 꺼짐 | Node 22.12 + 한글 경로 → 영문 경로로 |
| 화면 전체가 500.19 오류 | URL Rewrite 미설치 → C 단계 msi 설치 |
| 화면은 열리는데 "서버에 연결하지 못했어요" | IIS → API 전달 실패: ARR 프록시·헤더 변수·API 방화벽 (`check-web.ps1` 2·5번) |
| 사내 PC 에서 Windows 로그인 창이 뜸 | 인트라넷 영역 미등록 (0장 8번), IP 대신 DNS 이름 권장 |
| 모두 "AD SSO로 확인된 임직원만" | `check-web.ps1` 6번 → API `npm run pm2 -- logs sayeon-api` 의 `[sso]` 줄: "Web 서버가 아닌 … 에서 로그인 헤더" 면 `web.host` IP 확인 / "IIS 가 계정을 넘기지 않았어요" 면 Windows 인증·헤더 변수 / 그 밖은 `npm run sso:test -- --user …` |
| "사내 계정 정보(AD)를 확인하지 못했어요" | API 서버 도메인 가입·PM2 실행 계정이 도메인 계정인지 (`npm run check` 8번) |
| "사내 인사정보 서버가 응답하지 않아요" | 인사 API 주소·방화벽·`SSO_API_KEY` |
| 사번은 맞는데 거절 | 인사 API 재직 상태 값 → `server\src\sso.js` 의 `INACTIVE` |
| `deploy-api.ps1` 이 되돌렸다고 함 | 점검·시작 실패 → 출력의 ✖ 항목 해결 후 다시 실행 |
| DB 관련 ✖ | 1장 E 의 상황별 표, 원인·해결 문구 |
| 평가판 배너 | 개발 서버에 라이선스 키 파일 → 다시 패키지 |
| 화면이 예전 그대로 | Web 배포 확인(`check-web.ps1` 4번 해시) → Ctrl+F5 |

---

## 8. 참고

### 8-1. DevExtreme 라이선스

개발 서버에서: 키를 환경 변수 `DevExpress_License` 또는 `%APPDATA%\DevExpress\DevExpress_License.txt` 에 두고 `client` 폴더에서

```powershell
npx devextreme-license --out src/.devextreme/license-key.js --no-gitignore --force
```

키 파일은 git·배포 패키지에 들어가지 않는다(빌드 결과에만 반영). 파일이 없으면 평가판으로 빌드되고 `npm run release` 가 ⚠ 로 알려 준다.
