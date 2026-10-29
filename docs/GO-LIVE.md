# 사緣 운영 가이드 — 최초 배포 · 기능 추가 배포 · 운영 중 변경

배포·운영 절차는 **이 문서 하나**에만 적는다. README·설계서에는 요약과 링크만 둔다.
각 단계 끝의 **확인** 을 통과해야 다음 단계로 넘어간다. 끝낸 항목은 `[ ]` → `[x]`.

---

## 한눈에

### 서버 구성 — 값은 `servers.config.mjs` 한 곳에서

| 역할 | 주소 | 종류 | 인터넷 | 하는 일 |
|---|---|---|---|---|
| **Web 서버** | `https://oncloud9.samsungds.net:8282` (`10.122.122.1`) | 클라우드 · Windows Server | 차단 | IIS + URL Rewrite + 사내 인증서. **화면 파일만** (`dist` 를 풀어 놓는다) |
| **API 서버** | `https://alfadev.samsungds.net:8292/sasystem` (`10.122.122.2`) | 물리 · Windows Server | 차단 | **이미 운영 중인 IIS-iisnode 앱의 `routes` 폴더에 `routes\sasystem` 을 복사** (설치 없음, [D-2](#d-2-사이트를-새로-만들기-어려울-때--회사의-다른-iisnode-앱-routes-폴더에-끼워-넣기)). **https 로만** 받는다 |
| **DB 서버** | `10.166.101.127:1433` · DB `sasystem` | 클라우드 · Windows Server | 차단 | MSSQL — **운영·개발이 같은 DB** · 목적별 표(`SA_APPLICANT` · `SA_MATCH` …) |
| **개발 서버** | `10.122.122.10` (개인 PC) | 물리 | **연결** | 개발(`npm run dev`) · 빌드(`npm run build`) · API 묶음(`npm run plugin`) |

```
[개인 PC 브라우저] ──① 사내 인사 데이터 URL (GET) ──▶ sabun · user_name  → localStorage
      │            ──② 임직원 확인 URL (POST sabun · user_name) ──▶ 임직원이면 계속, 아니면 "임직원만 이용할 수 있어요"
      │
      ├── https :8282 ───▶ [Web 서버 IIS] 화면 파일만
      │
      └── https :8292 ───▶ [API 서버 — 회사 iisnode 앱 /sasystem] ── 1433 ──▶ [DB 서버] sasystem
           (화면 JS 가 직접 호출 · CORS: oncloud9 화면만 · 세션은 X-Sasystem-Session 헤더 · http 는 거절)

[개발 PC 10.122.122.10] npm run dev (5173) ── vite 프록시 /api ── https :8292 ──▶ 같은 API · 같은 DB (테스트 사번)

  Web 서버 ↔ API·DB 서버 통신 없음
  방화벽: 사용자 PC → Web 8282 · 사용자 PC → API 8292 · 개발 PC → API 8292 · 사용자 PC → 인사 URL 2개 · API → DB 1433
```

### 개발 단계

1. API · DB 서버는 미리 셋업해 둔다 (API: 그 앱 `main.js` 에 한 줄 + `routes\sasystem` · DB: 표는 처음 시작할 때 자동, 또는 `sql\setup.sql`)
2. 개발 서버에서 `npm run dev` — 화면 5173 이 **운영 API 서버를 부르고 운영 DB 를 함께 쓴다**. 로그인 없이 **테스트 사번**으로 바로 들어간다
3. 개발이 끝나면 개발 서버에서 `npm run build` → `client\dist` 를 압축해 Web 서버로
4. Web 서버에서 압축을 풀고 IIS(URL Rewrite · 사내 인증서 · https 8282)로 낸다 — `dist\web.config` 가 들어 있다
5. API 코드가 바뀌었으면 개발 서버에서 `npm run plugin` → `release\routes-production\routes\sasystem` 을 API 서버 그 앱의 `routes\sasystem` 에 덮어쓰고 앱 풀 재시작

### 화면 모드 — 명령으로 자동

| 명령 (client) | 모드 | 동작 |
|---|---|---|
| `npm run dev` | **개발 모드 · 운영 데이터** | vite 프록시로 **운영 API 서버(같은 DB)** 를 부른다. 로그인 없이 `servers.config.mjs` 의 **테스트 사번**(`devLogin`)으로 바로 홈, 로그아웃하면 다른 테스트 사번을 고른다. 화면 위 '개발 모드 · 운영 데이터' 띠 |
| `npm run dev:mock` | **가짜 데이터 모드** | 서버 없이 브라우저 안의 가짜 데이터. 만능 테스트 계정으로 바로 홈 |
| `npm run build` | **운영 모드** | 화면을 열 때 인사정보 2단계 확인. 가짜 데이터·테스트 사번 코드는 빌드에 들어가지 않는다(들어가면 빌드가 멈춘다) |

**테스트 사번 로그인 (npm run dev)** — 운영 API 가 아래 셋이 모두 맞을 때만 받는다. 아니면 없는 API 처럼 404

| 조건 | 어디서 |
|---|---|
| 호출한 PC 가 개발 PC | `servers.config.mjs` 의 `devServer.host` (`10.122.122.10`) — 그 앱 web.config 의 `promoteServerVars` 에 `REMOTE_ADDR` 필요 |
| 개발 키가 같다 | API 서버 `routes\sasystem\.env` 의 `DEV_LOGIN_KEY` = 개발 PC `client\.env.development.local` 의 `SASYSTEM_DEV_KEY` (16자 이상, git 에 올리지 않는다 — 키는 브라우저로 내려가지 않고 vite 프록시만 붙인다) |
| 사번이 목록에 있다 | `servers.config.mjs` 의 `devLogin.accounts` (`TEST0001` 남 · `TEST0002` 여 · `TEST0003` 관리자 시험용) |

테스트 사번으로 만든 신청서에는 **'테스트' 표시**가 붙고, 일반 사용자의 후보·하트·사주·매칭·통계에 **나오지 않는다**(테스트 사번은 운영 데이터를 함께 본다). 관리자 화면 **DB 표 → 테스트 데이터 지우기**로 한 번에 지운다.

### DB 표 — 목적별

`sasystem` 안의 표 (정의: `server/shared/db/tables.js` · SSMS 에서 표·열 설명이 보인다)

| 표 | 내용 | 표 | 내용 |
|---|---|---|---|
| `SA_APPLICANT` | 신청서 | `SA_DAILY_PICK` | 오늘의 후보 |
| `SA_EMPLOYEE` | 임직원(로그인한 사람) | `SA_SEEN` | 이미 본 후보 |
| `SA_MATCH` | 매칭 | `SA_SAJU_PICK` | 오늘의 사주 인연 |
| `SA_HEART` | 하트 | `SA_PENALTY` | 싫어요 누적(탈퇴자) |
| `SA_REVIEW` | 후기 | `SA_ADMIN_LOCK` | 관리자 인증 잠금 |
| `SA_MESSAGE` | 쪽지 | `SA_AUDIT_LOG` | 열람·작업 기록 |
| `SA_VOC` | 개선의 소리 | `SA_CODE` | 기준정보(선택 목록) |
| `SA_BLACKLIST` | 블랙리스트 | `SA_SETTING` · `SA_SEQUENCE` | 설정 · 번호 발급 |

- 앞쪽 열(ID · 사번 · 상태 · 시각 …)은 **보기용**, `DATA_JSON` 이 행 전체 원본이다. 이름·메일은 `DATA_KEY` 로 암호화된다
- **값을 고칠 때는 관리자 화면 `DB 표`** 에서 (행 추가·수정·삭제, 열람 기록에 남는다). SSMS 에서 직접 고치면 서버가 메모리 기준으로 다시 저장할 때 덮어쓴다
- 예전 한 표(`SA_DOC`)에 데이터가 있고 새 표가 비어 있으면 처음 시작할 때 **자동으로 옮긴다** (`SA_DOC` 은 백업으로 남는다)
- ⚠ 서버가 데이터를 메모리에 두고 저장하므로 **이 DB 를 쓰는 사緣 API 는 하나만** (그 앱 `nodeProcessCountPerApplication="1"`, 같은 DB 로 다른 사緣 서버를 띄우지 않는다)

### 보안

| 구간 | 조치 |
|---|---|
| 화면 빌드 | 소스맵 없음 · 주석·console·debugger 제거 · 이름 압축 · 파일 이름 해시(`assets/해시.js`) · 가짜 데이터·테스트 사번 코드 제외 (빌드가 검사) |
| 화면 (운영) | 개발자 도구 단축키(F12 · Ctrl+Shift+I/J/C · Ctrl+U)·오른쪽 클릭 막기 (`servers.config.mjs` 의 `security.blockDevtools` — 보조 조치, 브라우저 메뉴로 여는 것은 못 막는다) |
| Web 서버 (`dist\web.config`) | CSP(부를 수 있는 곳: 자기 · API · 인사 URL) · Server 헤더 비움 · X-Powered-By 제거 · `.map`·`.config`·`.json`·`.ps1` 차단 · GET/HEAD 만 · 디렉터리 목록 끔 · 다른 사이트에 끼워 보이기 금지 |
| API | https 로 온 호출만 · CORS 는 oncloud9 화면만 · IP 당 1분 600회 · 응답 캐시 금지 · 오류에 서버 정보 없음 · 점검(`/api/health`)은 ok 만 · 관리자는 비밀번호 + 실패 잠금 · 모든 관리자 열람·수정 기록 |
| 비밀값 | 화면에는 없다 — DB 계정(그 앱 main.js) · 키(`routes\sasystem\.env`) · 관리자 비밀번호(`config\admins.js`) 는 API 서버에만 |

> ⚠ **보안 한계**: 화면 코드는 사용자 PC 로 내려가므로 읽는 것 자체를 완전히 막을 수는 없다 — 그래서 권한 판단은 모두 API 서버가 한다. 인사정보 2단계 확인은 브라우저가 하므로 사용자가 결과를 꾸밀 수 있다. API 서버에서 인사 서버로 통신이 되면 `sso.hrApi` 로 서버 재확인을 켤 수 있다.

### 운영 표준 버전 · 경로

| Node.js | npm | iisnode | URL Rewrite |
|---|---|---|---|
| **22** (API 서버 그 앱과 같은 것) | **10.9.0** (Node 에 포함) | 그 앱 것 | **2.1** (Web 서버) |

> ⚠ **설치 경로는 영문·숫자로만** (예: `C:\apps\sa`, `C:\deploy\…`). Node.js 22.12.0 은 Windows 에서 한글이 들어간 경로의 패키지를 불러올 때 **메시지 없이 강제 종료**된다. 모든 스크립트가 먼저 확인하고 알려 준다.

---

## 0. 먼저 확인·요청할 것

| # | 확인할 것 | 누구에게 | 상태 |
|---|---|---|---|
| 1 | 서버 IP · DNS 이름 (Web `oncloud9.samsungds.net` · API `alfadev.samsungds.net`) | IT | ✅ |
| 2 | **사내 인사 데이터 URL**(1단계) — 응답 JSON 예시(`sabun` · `user_name` 위치), 사용자를 무엇으로 알아보는지(사내 SSO 쿠키 등) | 인사 시스템 담당 | `sso.employeeApi.url` 비어 있음 |
| 3 | **임직원 확인 URL**(2단계) — POST 본문 형식, 임직원일 때 응답(예: `result: 'Y'`) | 인사 시스템 담당 | `sso.employeeCheck` 비어 있음 |
| 4 | 두 인사 서버의 **CORS 허용** — `https://oncloud9.samsungds.net:8282`. 쿠키를 쓰면 `Access-Control-Allow-Credentials: true`, 허용 주소는 `*` 가 아닌 정확한 주소. **두 URL 모두 https** | 인사 시스템 담당 | 없으면 모두 안내 화면으로 감 |
| 5 | 방화벽 — 사용자 PC → Web 8282 · 사용자 PC → API 8292 · 개발 PC → API 8292 · API → DB 1433 | 네트워크 | ✅ (8292 열림) |
| 6 | 그 앱 web.config — `nodeProcessCountPerApplication="1"` · `promoteServerVars="REMOTE_ADDR,HTTPS"` | API 서버 담당 | ✅ 가능 |
| 7 | 그 앱 `main.js` — 사緣 줄을 **CORS 미들웨어보다 앞에**, mssql 설정을 넘긴다 | API 서버 담당 | D-2 |
| 8 | DB 백업 정책 · `DATA_KEY` 보관 위치 · 개발 키(`DEV_LOGIN_KEY`) 보관 | IT·보안 | |

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

- [ ] `C:\apps\sa\servers.config.mjs` 에 0장 1·2·4·7번 값을 넣는다
  - `environments.production.web.host` / `api.host` / `db.host`, 포트, `db.name: 'sasystem'`
  - Web 서버 사내 DNS 이름이 있으면 `web.dnsName`
  - `sso.employeeApi.url` · `method` · `body`(예: `{ sabun: '{ls:sabun}' }`) · `resultPath`(비우면 자동)
  - (권장) `sso.hrApi.url` · `method` · `body`(예: `{ sabun: '{empNo}' }`)
- **확인**: `cd C:\apps\sa\server` → `npm run release` 의 `[1] 준비` 가 ✔ 로 지나가는지 (IP·포트·DB 이름 형식, 운영/개발 DB 겹침을 확인)
- [ ] 바꾼 기준정보를 git 에 커밋 (배포한 값을 나중에 다시 찾을 수 있게)

### C. 오프라인 설치 파일 (개발 서버에서 받아 USB·공유 폴더로)

| 파일 | 설치할 서버 |
|---|---|
| `node-v22.12.0-x64.msi` (nodejs.org) | API 서버 |
| **iisnode** `iisnode-full-v0.2.26-x64.msi` (github.com/Azure/iisnode/releases) | API 서버 |
| IIS **URL Rewrite 2.1** (`rewrite_amd64_ko-KR.msi` 등) | Web 서버 · API 서버 |

IIS 는 Windows Server 에 들어 있어 인터넷 없이 켤 수 있다. DB 드라이버·사주 라이브러리 등 Node 라이브러리는 배포 패키지의 `api\node_modules` 에 들어간다 (서버에서 `npm install` 할 일 없음).

### 패키지 만들기 (개발 서버)

```powershell
cd C:\apps\sa\server
npm run release
```

| 단계 | 확인하는 것 | 멈추는 경우 |
|---|---|---|
| 1 준비 | Node 버전·경로, 기준정보, git 상태, 패키지 설치 | IP·DB 이름 형식, 운영/개발 DB 겹침 |
| 2 화면 빌드 | 운영 모드(가짜 데이터·테스트 계정 자동 제외), 라이선스 포함, 사내 인사정보 URL | 빌드 실패, 가짜 데이터 섞임 |
| 3 패키지 | `release\<빌드번호>-production\web` · `api`(main.js · 이 환경의 web.config · routes · src · shared · node_modules) · `배포안내.txt` | — |
| 4 패키지 점검 | `.env`·관리자 파일·라이선스 키가 **안 들어갔는지**, 필수 파일, **패키지 안에서 서버 코드를 실제로 불러 보고 web.config 환경이 맞는지** | 비밀 파일 섞임, 라이브러리 빠짐, 환경 불일치 |

- **확인**: 마지막 줄 `배포 패키지 준비 완료`. `release\<빌드번호>-production` 폴더 통째로 운영 서버에 복사 (`--zip` 을 붙이면 zip 도 만든다)

### D. API 서버 — 사緣 전용 IIS 사이트로 낼 때 (지금은 쓰지 않음 → D-2)

> 지금 API 서버(`10.122.122.2`)는 **이미 운영 중인 iisnode 앱의 `routes` 폴더에 끼워 넣는 방식(아래 D-2)** 이다. 이 D 는 사緣 전용 사이트를 따로 만들 때만 참고한다 (`servers.config.mjs` 의 `api.basePath: ''`).

API 서버 폴더는 **그대로 IIS 사이트 폴더**다. 패키지의 `api` 폴더를 복사하면 끝이다.

```
C:\sites\sasystem-api\          ← IIS 사이트 'sasystem-api' (포트 8292, 운영)   ← api 폴더째 복사
  main.js                     iisnode 진입점
  web.config                  iisnode 설정 · 환경 · API 포트 · DB 서버/이름 (appSettings)
  routes\                     API 파일 (auth.js · applications.js · me.js · messages.js · saju.js · voc.js · admin.js …)
  src\  shared\  node_modules\ 설정·DB·로그인 / 업무 규칙(화면과 같은 파일) / 라이브러리
  servers.config.mjs          Web 서버 주소 · 관리자 주소 · 로그인 방식 (기준정보 사본)
  .env  config\admins.js      ★ 서버에만 — 비밀값·관리자 (복사할 때 덮어쓰지 않는다)
  iisnode\                    서버 로그 (자동 생성)
C:\sites\sasystem-api-dev\      ← 'sasystem-api-dev' (포트 8293, 개발) — 개발 패키지(npm run release -- --env development)의 api 폴더
```

1. [ ] `node-v22.12.0-x64.msi` 설치(기본 경로 `C:\Program Files\nodejs`) → **확인** `node -v` = `v22.12.0`
2. [ ] IIS + iisnode + URL Rewrite (관리자 PowerShell)
   ```powershell
   Install-WindowsFeature Web-Server -IncludeManagementTools
   msiexec /i iisnode-full-v0.2.26-x64.msi /qb
   msiexec /i rewrite_amd64_ko-KR.msi /qb
   ```
   **확인**: `Test-Path "$env:ProgramFiles\iisnode\iisnode.dll"` · `Test-Path "$env:windir\System32\inetsrv\rewrite.dll"` 둘 다 `True`
3. [ ] 패키지를 `C:\deploy\<빌드번호>-production` 에 복사 → **관리자** PowerShell
   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\deploy\<빌드번호>-production\api\_deploy\deploy-api.ps1
   ```
   앱 풀 `sasystem-api`(관리 코드 없음 · 유휴 종료 끔 · 겹친 재활용 끔 · 프로세스 1개)과 사이트 `sasystem-api`(포트 8292, 폴더 `C:\sites\sasystem-api`), 방화벽(→ 8292 인바운드 — 사용자 PC 브라우저가 직접 부른다)을 만들고 파일을 놓은 뒤, **`.env`·관리자 파일을 만들라는 안내와 함께 멈춘다**
4. [ ] `C:\sites\sasystem-api\web.config` 의 `<appSettings>` 확인 — 패키지가 기준정보로 채워 둔다

   | 키 | 운영 | 개발 사이트 |
   |---|---|---|
   | `SASYSTEM_ENV` | `production` | `development` |
   | `API_PORT` | `8292` (IIS 사이트 포트와 같게) | `8293` |
   | `DB_HOST` · `DB_PORT` · `DB_NAME` | `10.166.101.127` · `1433` · `sasystem` | 같은 서버 · `sasystem_dev` |

5. [ ] `C:\sites\sasystem-api\.env` — `copy .env.example .env` 후 채우기

   | 항목 | 값 |
   |---|---|
   | `SESSION_SECRET` | 비워 두고 점검(`npm run check`)을 돌리면 예시 값을 만들어 준다 |
   | `DB_USER` / `DB_PASSWORD` | 앱 전용 계정 (`sasystem_app` + 새 비밀번호 — E 단계가 만든다) |
   | `DB_ADMIN_USER` / `DB_ADMIN_PASSWORD` | `sa` 등 — E 단계 동안만, 끝나면 지움 |
   | `DATA_KEY` | 점검이 만들어 주는 값. ⚠ **한 번 정하면 절대 바꾸지 말고 따로 보관** |
   | `SSO_API_KEY` | 서버 재확인용 인사 API 키 (있으면) |
6. [ ] `C:\sites\sasystem-api\config\admins.js` — `copy admins.example.js admins.js` → `accounts` 에 매칭 담당자 사번·계정 ID, 비밀번호 해시
   ```powershell
   cd C:\sites\sasystem-api
   npm run hash-password -- "새 관리자 비밀번호"
   ```
7. [ ] DB 준비 → **E 단계**
8. [ ] 다시 실행 — 이번에는 **점검(`npm run check`) → 앱 풀 재시작 → 상태 확인**까지 한다 (실패하면 이전 버전으로 자동 되돌림)
   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\deploy\<빌드번호>-production\api\_deploy\deploy-api.ps1
   ```
9. [ ] 개발 사이트도 같은 방법으로 — 개발 서버에서 `npm run release -- --env development` → 그 패키지의 `deploy-api.ps1` (사이트 `sasystem-api-dev`, 포트 8293, 폴더 `C:\sites\sasystem-api-dev`)

재부팅하면 IIS 가 사이트를 자동으로 시작하고, 첫 요청 때 iisnode 가 서버를 띄운다 (따로 할 일 없음).

- **확인**
  - `deploy-api.ps1` 마지막이 `API 서버 배포 완료` · `http://localhost:8292/api/health → 정상`
  - `cd C:\sites\sasystem-api` → `npm run check` 가 ✖ 0 ([7-1](#7-1-npm-run-check--api-서버) 읽는 법) — IIS·iisnode·URL Rewrite, web.config, 사이트·포트, DB, 관리자, 사내 로그인
  - 서버 재확인을 켰으면 `npm run sso:test -- --empno <내 사번>` → "바로 들어올 수 있어요"
  - 서버를 다시 띄우려면 `Restart-WebAppPool sasystem-api` (web.config 나 `.js` 파일을 바꾸면 iisnode 가 알아서 다시 띄운다)
  - 로그: `C:\sites\sasystem-api\iisnode\` (시작 실패도 "원인 / 해결" 로 남는다)

**직접 복사로 배포할 때** (스크립트 없이): 앱 풀 멈춤 → 패키지 `api` 폴더 내용을 사이트 폴더에 복사(**`.env` · `config\admins.js` 는 덮어쓰지 않음**) → 사이트 폴더에서 `npm run check` → `Start-WebAppPool sasystem-api` → `http://localhost:8292/api/health`

#### D-2. 사이트를 새로 만들기 어려울 때 — 회사의 다른 iisnode 앱 `routes` 폴더에 끼워 넣기

> **지금 배포 방식이다** — API 서버 `10.122.122.2` 의 운영 중인 IIS-iisnode 앱(https 8292, 인증서 `alfadev.samsungds.net`, Node 22, `require` 방식) `routes` 폴더에 `routes\sasystem` 을 복사한다. 사緣 전용 사이트(위 D)로 돌아가려면 `basePath: ''`.

API 서버가 오프라인이라 Node·iisnode 설치나 사이트 생성이 어려우면, 이미 돌고 있는 다른 iisnode(Express) 앱에 사緣 API 를 **폴더 하나**로 넣는다. 라이브러리까지 한 파일(`index.js`)에 묶여 있어 `npm install` 이 필요 없다.

1. [ ] `servers.config.mjs` 의 `api` — `dnsName: 'alfadev.samsungds.net'`(인증서 이름), `port: 8292`(그 앱 IIS 사이트의 https 포트), `https: true`, `basePath: '/sasystem'` (개발 화면도 같은 API 를 쓴다 — 개발용 경로를 따로 두지 않는다)
   - **사용자 PC 브라우저**가 `https://<dnsName>/sasystem/api/…` 를 직접 부른다 → 사내 PC 가 그 이름을 찾을 수 있어야 하고(사내 DNS 등록), 인증서를 발급한 **사내 인증 기관(루트) 인증서를 사내 PC 가 신뢰**해야 한다 (보통 사내 PC 에는 배포돼 있다)
   - 그 앱 IIS 사이트에 https 8292 바인딩 + `alfadev.samsungds.net` 인증서, 방화벽 **사용자 PC 대역 · 개발 PC → 8292**
   - API 는 `web`(IP · DNS 이름)에서 연 화면의 호출만 받는다(CORS). 다른 주소로도 화면을 열면 묶음 `.env` 의 `CORS_ORIGINS` 에 더한다
   - 로그인 세션은 쿠키가 아니라 `X-Sasystem-Session` 헤더로 주고받는다 — 화면과 API 의 주소가 달라도 회사 브라우저의 제3자 쿠키 정책과 상관없다. 탭마다 따로이고, 탭을 닫으면 끝난다(다시 열면 인사정보로 자동 재확인)
2. [ ] 개발 PC 에서 `npm run release` — `basePath` 가 있으면 `api\` 대신 `routes\sasystem\` 을 만든다 (묶음만: server 폴더에서 `npm run plugin`)
   화면 설정 `sasystem.config.js` 의 `apiBase` 에 `https://<dnsName>/sasystem` 이 들어간다 (Web 서버 web.config 에는 `/api` 전달이 없다)
3. [ ] `routes\sasystem` 폴더를 그 앱의 `routes` 폴더에 복사 → 그 앱 `main.js` 에 한 줄 — **그 앱의 CORS·로그인 미들웨어보다 앞에**, 그 앱의 mssql 설정(계정 포함)을 넘긴다
   ```js
   // 그 앱 main.js 에 이미 있는 mssql 설정 변수를 넘긴다 (변수 이름은 그 앱에 맞게). DB 이름은 사緣 것(sasystem)을 쓴다
   app.use('/sasystem', require('./routes/sasystem')({ db: dbConfig }));
   // 그 앱 계정 대신 사緣 전용 계정을 쓰려면 위 대신 아래 + routes\sasystem\.env 의 DB_USER · DB_PASSWORD
   // app.use('/sasystem', require('./routes/sasystem'));
   ```
   - 그 앱 계정이 `sasystem` DB 에 읽기·쓰기(처음 한 번은 표 만들기) 권한이 있어야 한다. 표 만들기 권한이 없으면 DB 담당자가 `sql\setup.sql` 로 표를 미리 만든다
4. [ ] 그 앱 web.config 의 `<iisnode>` — **`nodeProcessCountPerApplication="1"` 필수**(사緣은 데이터를 메모리에 두고 저장한다), **`promoteServerVars="REMOTE_ADDR,HTTPS"` 필요** (REMOTE_ADDR: 사용자 IP — 열람 기록 · 로그인 확인 횟수 제한 · 개발 PC 확인 / HTTPS: http 로 온 호출 거절). Node.js 22 이상
   그 앱이 모든 요청에 로그인 확인 · CORS 를 먼저 거는 구조면 사緣 줄을 그보다 **앞에** 둔다 (OPTIONS 사전 확인 요청이 사緣까지 와야 한다)
5. [ ] `routes\sasystem\.env` 채우기 — `SESSION_SECRET` · `DATA_KEY` (DB 계정은 3번에서 넘겼으면 비워 둔다) · 개발 화면을 쓸 거면 `DEV_LOGIN_KEY`(16자 이상, 개발 PC `client\.env.development.local` 의 `SASYSTEM_DEV_KEY` 와 같게) → `config\admins.js` → 그 앱의 앱 풀 재시작
6. [ ] **확인** — **사내 PC 브라우저**에서 `https://alfadev.samsungds.net:8292/sasystem/api/health` (인증서 이름과 맞아야 하므로 DNS 이름으로) → `{"ok":true …}` · 이어서 화면 로그인 · 실패하면 그 앱 iisnode 로그의 `[sasystem]` 줄 (허용하지 않은 화면 주소에서 부르면 `[sasystem] 허용하지 않은 화면 주소 …` 가 남는다)

순서 전체는 묶음 안의 `설치안내.txt`. 사緣이 시작에 실패해도 **그 앱은 그대로 돈다**(사緣 API 만 503, 30초 뒤 다시 시도). 설정은 묶음 폴더의 `.env` 에서만 읽고 그 앱의 환경 변수·세션과 섞지 않는다. 업데이트는 `index.js` 등을 덮어쓰고(`.env` · `config\admins.js` 는 그대로) 앱 풀 재시작 — `routes` 아래 파일은 iisnode 가 바뀐 것을 알아채지 못한다.

### E. DB (10.166.101.127) — `sasystem` (운영·개발 같이 씀)

둘 중 하나. 둘 다 **여러 번 실행해도 안전**하다(있는 것은 건너뛴다).

**방법 A — `npm run db:setup` (API 서버에서, 권장)**
1. `.env` 에 앱 계정(`DB_USER`·`DB_PASSWORD`)과 관리 계정(`DB_ADMIN_USER=sa`·`DB_ADMIN_PASSWORD`)
2. 바꾸지 않고 할 일만 보기 → 실행
   ```powershell
   cd C:\sites\sasystem-api
   npm run db:setup -- --check
   npm run db:setup
   ```
   DB 만들기 → 앱 로그인(만료 없음) → DB 사용자 → 읽기·쓰기 권한(`db_datareader`·`db_datawriter`만) → 목적별 표 17개(`SA_APPLICANT` …, 표·열 설명 포함) → **앱 계정으로 로그인·읽기·쓰기 시험**(되돌림)
3. 끝나면 `.env` 에서 `DB_ADMIN_*` 지우고 `DB_AUTO_CREATE=false`

**방법 B — `server\sql\setup.sql` (DB 담당자, SSMS)** — 맨 위 `@DbName`·`@AppLogin`·`@AppPass` 만 바꿔 실행(F5) → 결과 표 확인

**개발 DB 는 따로 없다** — 개발 화면(`npm run dev`)도 같은 API · 같은 DB 를 쓰고, 테스트 사번으로 만든 데이터는 '테스트' 표시로 가린다

**그 앱 DB 계정을 넘겨받으면**(D-2 3번) 서버가 처음 시작할 때 없는 표만 만든다 (그 계정에 표 만들기 권한이 없으면 방법 B 로 표를 미리 만든다)

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

서버가 시작에 실패하면 `/api` 가 500 오류를 내고, 다음 요청 때 iisnode 가 다시 띄워 본다. 원인은 사이트 폴더의 `iisnode\` 로그에 "원인 / 해결" 로 남는다.

### F. Web 서버 (10.122.122.1) — IIS · https 8282 (`oncloud9.samsungds.net`)

도메인 가입·Windows 인증은 **필요 없다** (로그인은 사용자 PC 브라우저가 사내 인사정보 URL 로 확인).

1. [ ] 서버 관리자 → 역할: **웹 서버(IIS)** (인터넷 없이 됨)
   ```powershell
   Install-WindowsFeature Web-Server -IncludeManagementTools
   ```
2. [ ] C 단계의 **URL Rewrite 2.1** 설치 (ARR 은 필요 없다 — 이 서버는 `/api` 를 넘기지 않는다)
3. [ ] 사이트 만들기 (폴더는 영문 경로, 인증은 기본값 — 익명 인증 켜짐 그대로)
   ```powershell
   New-Item -ItemType Directory -Force D:\sites\sasystem
   New-Website -Name 'sasystem' -Port 8282 -Ssl -PhysicalPath 'D:\sites\sasystem'
   # IIS 관리자 → 사이트 'sasystem' → 바인딩 → https 8282 에 사내 인증서 'oncloud9.samsungds.net' 선택
   New-NetFirewallRule -DisplayName 'sasystem web 8282' -Direction Inbound -Protocol TCP -LocalPort 8282 -Action Allow
   ```
4. [ ] 화면 배포 — 개발 서버의 `client\dist` 압축을 풀어 사이트 폴더에 (또는 패키지의 스크립트로 백업·교체·점검까지)
   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\deploy\<빌드번호>-production\web\_deploy\deploy-web.ps1 -SitePath D:\sites\sasystem
   ```
- **확인**: `check-web.ps1` 이 `[실패] 0` ([7-2](#7-2-check-webps1--web-서버) 읽는 법) — 정적 파일·화면 스크립트 응답, 화면 설정의 API 주소, 사내 인사정보 URL 설정. API 연결·로그인은 G 단계에서 **사내 PC** 로 확인 (Web 서버에서 API 에 닿지 않아도 정상)

### G. 사내 PC 확인

- [ ] 사내 PC(사내 포털에 로그인한 상태)에서 `https://oncloud9.samsungds.net:8282` → **로그인 화면 없이 홈**, 화면 위 이름·사업부
- [ ] "임직원만 이용할 수 있어요" 가 뜨면 → F12 → **Console** 에 CORS 오류가 있는지(0장 3번), **Network** 에서 인사정보 URL 응답 확인 → **애플리케이션 → 로컬 스토리지** 의 `sasystem.employee` 값을 파일로 저장해 API 서버에서 `npm run sso:test -- --file 응답.json`
- [ ] 사내망 밖·인사정보 없는 PC 에서는 안내 화면이 뜨는지
- [ ] 관리자 담당자 PC 에서 `…/changeme` → 관리자 비밀번호 → 대시보드
- [ ] 신청서 작성 → 하트 → 매칭 → 쪽지, 인연 사주 (리허설 계정 2개 이상)
- [ ] 리허설 데이터 정리: 관리자 화면 **DB 표** 에서 행 삭제 · 개발 테스트 데이터는 **DB 표 → 테스트 데이터 지우기**

### H. 정식 오픈

- 운영 빌드는 늘 정식 운영이다 (가짜 데이터 시연은 개발 서버의 `npm run dev:mock` 로만)
- 기준정보: 개발 모드 관리자 화면 → 기준정보 → **[엑셀로 내보내기]** → 운영 관리자 화면 → **[파일 가져오기]** → 미리보기 → **[적용]**
- G 리허설 데이터 정리 → 사용자 주소 공지 (관리자 주소는 공지하지 않음)

---

## 2. 기능 추가 배포 (반복)

| # | 어디서 | 할 일 | 확인 |
|---|---|---|---|
| 1 | 개발 서버 | 개발 → `npm run dev:mock`(가짜 데이터)로 화면 시험 → `npm run dev`(운영 API · 테스트 사번)로 실제 데이터 시험. API 코드를 바꿨으면 먼저 묶음을 API 서버에 올린다 | 새 기능 + 아래 6번 목록이 개발 환경에서 됨 |
| 2 | 개발 서버 | git 커밋 | `git status` 깨끗 |
| 3 | 개발 서버 | `npm run release` | 마지막 `배포 패키지 준비 완료`, ⚠ "커밋하지 않은 변경" 이 없을 것 |
| 4 | API 서버 | `deploy-api.ps1` (패키지의 `api\_deploy`) — **API 먼저** | `배포 완료` · `/api/health 정상`. 점검·시작이 실패하면 **자동으로 이전 버전으로 되돌린다** |
| 5 | Web 서버 | `deploy-web.ps1 -SitePath D:\sites\sasystem` | `check-web.ps1` `[실패] 0` |
| 6 | 사내 PC | Ctrl+F5 → **새 기능** + 기본 흐름: 홈 진입 · 인연 사주 · 신청서 저장 · 쪽지 · 관리자 대시보드 | 모두 됨 |
| 7 | 문제 시 | 되돌리기 — 각 스크립트가 마지막에 보여주는 `-Rollback <백업 폴더>` (API·Web 각각) | 이전 화면·기능으로 동작 |

- DB 표의 원본은 `DATA_JSON` 이라 **기능 추가로 항목이 늘어도 표를 바꿀 일이 없다** — 코드만 바꾼다. 보기용 열을 더하려면 `server/shared/db/tables.js` 와 `npm run sql:tables`(setup.sql) 를 함께 바꾸고, 운영 DB 에는 `ALTER TABLE … ADD` 를 직접 한다
- 기준정보(선택 목록)를 추가했다면 배포 후 관리자 화면 → 기준정보 → 엑셀 가져오기
- API 를 먼저 배포하는 이유: 새 화면이 새 API 를 부를 수 있어서. 화면만 바뀐 경우 5번만 해도 된다 (패키지는 늘 통째로 만든다)
- 백업 위치: API `C:\sasystem-backup\api\<시각>`, Web `C:\sasystem-backup\web\<시각>` — 가끔 오래된 것을 지운다

---

## 3. 운영 중 바꿀 때

| 바꿀 것 | 고칠 곳 (개발 서버) | 반영 |
|---|---|---|
| 서버 IP·포트 | `servers.config.mjs` | `npm run release` → API·Web 둘 다 배포 (+ 방화벽) |
| Web 서버 DNS 이름 | `servers.config.mjs` 의 `web.dnsName` | release → 둘 다 배포 |
| DB 서버 IP / DB 이름 | `servers.config.mjs` 의 `db` (+ DB 백업·복원 → `npm run db:setup`) | release → API 배포 |
| DB 서버·DB 이름 · API 포트 | API 서버 사이트 폴더의 `web.config` (`appSettings`) — 또는 `servers.config.mjs` 고쳐 다시 패키지 | 저장하면 iisnode 가 다시 띄움 → `npm run check` |
| DB 계정·비밀번호 | API 서버 사이트 폴더의 `.env` | `npm run check` → `Restart-WebAppPool sasystem-api` |
| 사내 인사정보 URL (브라우저가 부름) | `servers.config.mjs` 의 `sso.employeeApi` | release → Web 배포 (급하면 Web 서버의 `sasystem.config.js` 만 고쳐도 됨 — 다음 배포 때 덮어써짐) |
| 서버 재확인용 인사 API | `servers.config.mjs` 의 `sso.hrApi` | release → API 배포 → `npm run sso:test -- --empno …` |
| 인사 API 키 | API 서버 사이트 폴더 `.env` 의 `SSO_API_KEY` | `Restart-WebAppPool sasystem-api` |
| 응답 필드 이름·사업부 이름·재직 아님 값 | `client\src\utils\employeeInfo.js` 의 `FIELD`·`DIVISION_MAP`·`INACTIVE` (화면·서버 같이 씀) | release → API·Web 둘 다 배포 |
| 관리자 추가·삭제·비밀번호 | API 서버 사이트 폴더 `config\admins.js` | 자동 (3초) |
| 관리자 주소 | `servers.config.mjs` 의 `adminPath` | release → 둘 다 배포 |
| 기준정보(사업부·캠퍼스 등) | 관리자 화면 → 기준정보 → 엑셀 일괄 변경 | 바로 |
| Web 서버 https | Web 서버 IIS 인증서 바인딩 + `servers.config.mjs` 의 `web.https: true` (API·인사정보 URL 도 https 여야 함) | release → 둘 다 배포 |
| 화면을 다른 주소로도 열 때 | API 서버 묶음 `.env` 의 `CORS_ORIGINS` (쉼표로 여러 개) — 또는 `servers.config.mjs` 의 `web` | 앱 풀 재시작 |

- 운영 서버에서 `servers.config.mjs` 를 직접 고쳐도 동작은 하지만, **다음 배포 때 패키지 값으로 덮어써진다**. 늘 개발 서버에서 고치고 커밋한다
- 앱 풀을 재시작하면 접속 중인 사용자는 다시 확인 과정을 거친다(자동이라 대부분 모름)
- 화면을 열 때마다(새로 고침 포함) 사내 인사정보로 다시 확인한다 — 퇴직·휴직이 바로 반영된다

### 기준정보 일괄 변경 (엑셀)

관리자 → 기준정보 → **[엑셀로 내보내기]** → '기준정보' 시트 고치기(한 줄 = 한 항목) → **[파일 가져오기]** → 미리보기 → **[적용]**
- 코드 값은 바꾸지 않는다 (신청서가 참조) — 새 코드로 줄 추가 + 예전 줄 삭제
- 지운 줄: 아무도 안 쓰면 삭제, 쓰고 있으면 '사용 안 함' / 파일에 없는 그룹은 그대로
- 틀린 곳이 있으면 적용 버튼이 막히고 몇 행이 틀렸는지 보여준다. 적용하면 열람 기록에 남는다

---

## 4. 사내 로그인 구조

`servers.config.mjs` 의 `sso` 로 정한다. 로그인 화면은 없다. 개발 화면(`npm run dev`)은 테스트 사번, `npm run dev:mock` 은 가짜 데이터 계정으로 바로 들어간다.

### browser 방식 (`sso.mode: 'browser'`) — 인사정보 2단계 확인

1. **사내 인사 데이터 URL** (`sso.employeeApi`) — 화면을 열 때 사용자 PC 브라우저가 부른다. 사내 SSO 쿠키를 함께 보낸다(`withCredentials`). 주소·본문에 `{ls:키}`(localStorage 값)·`{query:이름}`(주소창 값)을 쓸 수 있다
   - 정상 회신이면 응답을 **localStorage 의 `sasystem.employee`** 에 저장하고 `sabun` · `user_name` 등을 읽는다 (`server/shared/utils/employeeInfo.js` — JSON 어디에 있든 사번이 든 객체를 찾고, 필드 이름은 대소문자·`_` 무시)
2. **임직원 확인 URL** (`sso.employeeCheck`) — 1)에서 읽은 값으로 POST. 본문 `{ sabun: '{sabun}', user_name: '{user_name}' }` (`{필드}` = 1) 응답의 같은 이름 값)
   - `okPath` 를 정하면 응답의 그 값이 `okValues`(예: `Y` · `true`) 중 하나일 때 임직원 · 비우면 응답에서 같은 사번을 찾고 재직 상태로 판단
   - 응답에 같은 사람의 성별·사업부 등이 더 있으면 1)의 정보와 합친다 · 응답은 `sasystem.employee.check` 에 저장
   - 비워 두면 1)만으로 확인한다
3. 임직원이면 그 정보를 **API 서버**(`/api/auth/sso`)로 보낸다 → 세션 → 홈. (선택) `sso.hrApi.url` 이 있으면 API 서버가 그 사번을 인사 API 에 한 번 더 묻는다 (API 서버 → 인사 서버 통신이 될 때만)

| 결과 | 화면 |
|---|---|
| 1)·2) 모두 확인 | 바로 홈 |
| 1) 응답 없음(401·404) · 사번 없음 / 2) 임직원 아님 | "임직원만 이용할 수 있어요" |
| 재직 상태 휴직·퇴직 | "재직 중인 임직원만 이용할 수 있어요" |
| 인사 서버 연결 실패·5xx · CORS 막힘 | "사내 인사정보 서버에 연결하지 못했어요" |
| API 서버 꺼짐·응답 없음(20초) | "사緣 서버에 연결하지 못했어요" |
| `employeeApi.url` 비어 있음 | "서비스를 준비하고 있어요" |

- 두 인사 서버 모두 `https://oncloud9.samsungds.net:8282` 에 CORS 를 허용하고 **https** 여야 한다 (Web 화면이 https)
- 시험: 사내 PC 화면 F12 → Network 에서 두 호출의 응답 확인 · 애플리케이션 → 로컬 스토리지의 `sasystem.employee` · `sasystem.employee.check`
- ⚠ 브라우저가 확인한 결과는 사용자가 꾸밀 수 있다 (0장 보안 한계)

---

## 5. 개발 환경

| 무엇 | 어디 | 설정 |
|---|---|---|
| 화면 개발 + 운영 데이터 | 개발 서버 `client` → `npm run dev` (5173) | `client\.env.development.local` 에 `SASYSTEM_DEV_KEY` (= API 서버 `routes\sasystem\.env` 의 `DEV_LOGIN_KEY`). 예시: `client\.env.development.local.example` |
| 화면 개발 (가짜 데이터) | `client` → `npm run dev:mock` | 설정 없음 — 만능 계정으로 바로 홈, 로그아웃하면 테스트 계정 고르기 |
| 운영 빌드 미리보기 | `client` → `npm run build` → `npm run preview` → `/api` 를 운영 API(또는 `DEV_API_PROXY`)로 | 로그인은 인사정보 2단계 (`dist\sasystem.config.js` 의 URL) |
| API 를 내 PC 에서 | `server` → `npm start` (node main.js) | `server\.env` (`STORE=memory` 면 DB 없이). ⚠ **운영 DB 를 넣고 띄우지 않는다** — 운영 API 와 서로 덮어쓴다 |

⚠ 이 DB 를 쓰는 사緣 API 는 **API 서버의 하나뿐**이다. 개발 화면도 그 API 를 부른다.

## 6. 백업과 보안

- [ ] DB 정기 백업 — 데이터는 `sasystem.dbo.SA_*` 표들 (`SA_DOC` 은 옮기기 전 백업 — 확인 뒤 지워도 된다)
- [ ] `DATA_KEY` 를 DB 백업과 **다른 곳**에 보관 (없으면 이름·메일 복구 불가)
- [ ] API 서버 사이트 폴더의 `.env`, `config\admins.js` 백업 (git·패키지에 없음)
- [ ] DB 는 전용 계정(읽기·쓰기만), `.env` 에 `DB_ADMIN_*` 남기지 않기
- [ ] 관리자 비밀번호 해시, 관리자 주소 비공개
- [ ] API 서버 포트는 **사내 PC 대역**에서만 (브라우저가 직접 부른다 — 외부·다른 망은 차단). 호출은 Web 서버 화면 주소에서 온 것만 받는다(CORS)
- [ ] (API 서버 → 인사 서버 통신이 되면) 서버 재확인(`sso.hrApi`) 켜기 — 브라우저가 보낸 인사정보를 서버가 다시 확인
- [ ] 개발 키(`DEV_LOGIN_KEY`)는 개발 PC 와 API 서버에만. 개발을 쉬는 동안은 API 서버 `.env` 에서 지워 테스트 사번 로그인을 끈다
- [ ] 그 앱 web.config `promoteServerVars="REMOTE_ADDR,HTTPS"` — http 로 온 호출 거절 · 개발 PC 확인 · IP 기록
- 개인정보 최소 수집: 생년월일은 **출생연도만** 저장한다. 인연 사주에 입력한 월·일·태어난 시간은 계산에만 쓰고 저장하지 않는다 (예전 데이터는 서버가 불러올 때 연도만 남기고 지운다)
- 들어 있는 보호: 비밀번호를 받지 않음 · 로그인 확인 1분 30회 · API 1분 600회 제한 · https 만 · 세션 재발급 · 관리자 5회 실패 잠금 · 열람 기록(DB 표 수정 포함) · 이름·메일 암호화 · 인사정보 크기 제한 · 화면 빌드 난독화·소스맵 없음 · Web 보안 헤더(CSP 등) — 자세히는 맨 위 [보안](#보안)

---

## 7. 점검 명령 읽는 법과 문제 해결

### 7-1. `npm run check` — API 서버

| 구역 | 확인하는 것 |
|---|---|
| 1 실행 환경 | Node 22.12.0 · npm · **IIS · iisnode · URL Rewrite** · node.exe 경로 · 설치 경로 한글 여부 |
| 2 설정 | **web.config**(환경·API 포트·DB 서버), `servers.config.mjs` 형식, 운영/개발 겹침, 관리자 주소, **이 서버가 기준정보의 API 서버가 맞는지** |
| 3 `.env` | 예전 항목·오타, `SESSION_SECRET`·`DATA_KEY`, 이 API 를 부를 수 있는 화면 주소(CORS), 남은 관리 계정 |
| 4 패키지 | 라이브러리 · main.js · routes · shared(업무 규칙) |
| 5 화면 빌드 | API 서버가 화면도 낼 때(`CLIENT_DIST`)만 — 보통은 건너뜀 |
| 6 IIS 사이트 · 포트 | 이 폴더를 쓰는 IIS 사이트 · 포트가 web.config 의 API_PORT 와 같은지 · `/api/health` 응답 |
| 7 DB | 네트워크 → 로그인 → DB → 테이블 → 권한 → `DATA_KEY` |
| 8 관리자 | `admins.js`, 계정, 해시 |
| 9 사내 로그인 | browser: 인사정보 URL 설정, 서버 재확인 인사 API 주소·연결 / iis: Web 서버 IP 신뢰, 도메인 가입, 지금 계정으로 AD 조회 / Web 서버 응답 |

✔ 정상 · ⚠ 운영 전 정리 권장 · ✖ 이대로는 안 됨(종료 코드 1). 모든 ⚠·✖ 에 원인·해결이 나온다. `--skip-db`, `--skip-net` 옵션.

### 7-2. `check-web.ps1` — Web 서버

| 구역 | 확인하는 것 |
|---|---|
| 1 서버 | 관리자 권한, 로그인 방식 |
| 2 IIS 구성 요소 | IIS 실행, 정적 콘텐츠 기능, URL Rewrite (ARR 은 필요 없음) |
| 3 사이트 | 이 폴더의 사이트, 8282 바인딩, 방화벽 |
| 4 화면 파일 | 필수 파일, **모든 파일이 빌드와 같은지(해시 비교)**, 사내 인사정보 URL · **API 주소** 설정 |
| 5 화면 응답 | 이 서버에서 화면 열림, **화면 스크립트가 javascript 로 오는지**(아니면 하얀 화면), 화면 주소 새로 고침 |
| 6 API 서버 (참고) | 이 서버에서 닿으면 상태·**CORS 허용**까지 확인, 닿지 않아도 정상(서버끼리 통신 없음) — 사내 PC 에서 확인하는 방법 안내 |
| 7 로그인 | 사내 PC 에서 확인하는 방법 안내 |

`[실패]` 마다 원인과 **그대로 실행할 PowerShell 명령**이 나온다.

### 7-3. 자주 나오는 문제

| 증상 | 원인 · 해결 |
|---|---|
| 명령이 메시지 없이 꺼짐 | Node 22.12 + 한글 경로 → 영문 경로로 |
| 화면 전체가 500.19 오류 | URL Rewrite 미설치 → C 단계 msi 설치 |
| "사緣 서버에 연결하지 못했어요" | 브라우저가 API 서버에 닿지 못함. 사내 PC F12 → Console 에 **CORS 오류**면 화면 주소가 API 의 허용 목록에 없음(묶음 `.env` 의 `CORS_ORIGINS` · 그 앱 iisnode 로그의 `[sasystem] 허용하지 않은 화면 주소`) / Network 에서 API 요청이 실패면 사내 PC → API 443 방화벽 · DNS 이름 · 인증서 신뢰 (사내 PC 브라우저에서 `https://<dnsName>/sasystem/api/health`) / 503 이면 사緣 시작 실패(그 앱 iisnode 로그) |
| 화면이 하얗게만 나옴 | F12 → Console 에 `MIME type "text/html"` 이면 화면 파일 누락·하위 경로 배포·정적 콘텐츠 기능 없음 (`check-web.ps1` 2·4·5번) / 주소창에 IE 아이콘이면 Edge IE 모드 → 사이트 목록에서 제외 요청 |
| 모두 "임직원만 이용할 수 있어요" | 사내 PC F12 → Console 에 **CORS 오류**면 인사정보 서버에 CORS 허용 요청(0장 3번) / Network 에서 인사정보 URL 응답이 401·302 면 사내 포털 로그인·쿠키 / 응답은 오는데 안 되면 `npm run sso:test -- --file 응답.json` |
| "사내 인사정보 서버에 연결하지 못했어요" | 사내 PC → 인사정보 URL 네트워크·주소, 인사정보 서버 5xx / 서버 재확인을 켰으면 API 서버 → 인사 API 방화벽·`SSO_API_KEY` |
| "서비스를 준비하고 있어요" | `sso.employeeApi.url` 비어 있음 → 채우고 다시 빌드·배포 |
| 사번은 맞는데 거절 | 재직 상태 값 → `client\src\utils\employeeInfo.js` 의 `INACTIVE` |
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
