# 사緣 운영 가이드 — 최초 배포 · 기능 추가 배포 · 운영 중 변경

배포·운영 절차는 **이 문서 하나**에만 적는다. README·설계서에는 요약과 링크만 둔다.
각 단계 끝의 **확인** 을 통과해야 다음 단계로 넘어간다. 끝낸 항목은 `[ ]` → `[x]`.

---

## 한눈에

### 서버 구성 — 값은 `servers.config.mjs` 한 곳에서

| 역할 | 주소 (지금은 가짜 — 실제 IP 로 바꿀 것) | 인터넷 | 하는 일 |
|---|---|---|---|
| **개발 서버** | `12.123.321.13` | **됨** | 개발·시험, **빌드와 배포 패키지 만들기** (`npm run release`) |
| **Web 배포 운영 서버** | `10.123.321.12:8282` | 안 됨 | IIS. 화면 파일 · `/api` 를 API 서버로 전달 |
| **API 배포 운영/개발 서버** | `12.83.18.17:8292` (개발 API `:8293`) | 안 됨 | **IIS + iisnode** (사이트 2개: 운영 8292 · 개발 8293). 업무 처리 · (권장) 사내 인사 API 로 사번 재확인 |
| **DB 서버** | `10.166.101.127:1433` | 안 됨 | MSSQL — 운영 DB `sasystem` · 개발 DB `sasystem_dev` |

- 사용자(사내 PC)는 **Web 서버 주소 하나**로만 들어온다: `http://<Web 서버>:8282`, 관리자 `…/changeme`
- 모두 Windows 서버. 운영 서버 3대는 인터넷이 막혀 있어 **필요한 모든 파일을 개발 서버에서 만들어 복사**한다

```
[개발 서버] ── npm run release ──▶ release/<빌드번호>-production/
                                     ├ web/   ──(복사)──▶ [Web 서버] IIS 사이트 폴더   ← deploy-web.ps1 / check-web.ps1
                                     └ api/   ──(복사)──▶ [API 서버] IIS 사이트 폴더   ← deploy-api.ps1 (안에서 npm run check)
                                              (main.js · web.config · routes\ … 폴더째 복사하면 끝)

[사내 PC 브라우저] ──① 사내 인사정보 URL 호출 ──▶ [사내 인사정보 서버]   (사내 SSO 쿠키 함께, CORS 허용 필요)
      │               ② 응답을 localStorage 에 저장 · 사번·재직 여부 확인 → 아니면 "임직원만 이용할 수 있어요"
      │ http :8282
      ▼
[Web 서버 IIS] ── 화면 파일 · /api 만 API 서버로
      ▼
[API 서버 IIS + iisnode :8292] ── ③ 받은 인사정보 확인 (+ 권장: 사번으로 사내 인사 API 재확인) → 세션
      ▼
[DB 서버] sasystem
```

### 마스터 파일 `servers.config.mjs` (저장소 맨 위)

IP·포트·DB 이름·관리자 주소·로그인 방식은 **여기서만** 고친다. 아래가 이 값을 자동으로 따라간다.

| 따라가는 곳 | 무엇이 |
|---|---|
| API 서버 `web.config` (패키지가 만듦) | 환경 · API 포트 · DB 서버/이름 (`appSettings` — 서버에서 직접 고쳐도 된다) |
| API 서버 (`servers.config.mjs` 사본) | 사용자 접속 주소, 믿을 Web 서버 IP, 관리자 주소, 로그인 방식 |
| 화면 빌드 (`npm run build`) | Web 서버용 `web.config`(API 서버 주소로 전달), `sayeon.config.js`(관리자 주소 · **사내 인사정보 URL**), 점검·배포 스크립트 |
| 운영 빌드 미리보기 (`npm run preview`) | `/api` 를 개발 API 서버로 넘기는 주소 |
| 배포 패키지·점검 | 각 서버 주소·포트로 연결 확인 |

비밀번호·키는 마스터에 쓰지 않는다 → API 서버 사이트 폴더의 `.env` (git·패키지에 들어가지 않음).
IP 가 형식에 안 맞으면(예: `321`) 서버·빌드·패키지·점검이 모두 멈추고 알려 준다.

### 개발 모드 · 운영 모드 — 명령으로 자동

| 명령 | 모드 | 동작 |
|---|---|---|
| `npm run dev` (client) | **개발 모드** | 서버 없이 브라우저 안의 가짜 데이터. **로그인 화면 없이 만능 테스트 계정으로 바로 홈**. 로그아웃하면 다른 테스트 계정을 고를 수 있다. 화면 위에 '개발 모드' 띠 |
| `npm run build` (client) · `npm run release` | **운영 모드** | 실제 API(`/api`). 화면을 열 때 **사내 인사정보 URL** 로 임직원 확인. 가짜 데이터·테스트 계정 코드는 빌드에 들어가지 않는다(들어가면 빌드가 멈춘다) |

따로 바꿀 모드 설정은 없다.

### 운영 표준 버전 · 경로

| Node.js | npm | iisnode | URL Rewrite |
|---|---|---|---|
| **22.12.0** | **10.9.0** (Node 에 포함) | **0.2.26** (x64, API 서버) | **2.1** (Web·API 서버) |

> ⚠ **설치 경로는 영문·숫자로만** (예: `C:\apps\sa`, `C:\deploy\…`). Node.js 22.12.0 은 Windows 에서 한글이 들어간 경로의 패키지를 불러올 때 **메시지 없이 강제 종료**된다. 모든 스크립트가 먼저 확인하고 알려 준다.

---

## 0. 먼저 확인·요청할 것

| # | 확인할 것 | 누구에게 | 왜 |
|---|---|---|---|
| 1 | 4대 서버의 **실제 IP**, Web 서버의 **사내 DNS 이름**(있으면) | IT | 지금 IP 는 가짜(`321` 은 불가능한 값) |
| 2 | **사내 인사정보 URL** — 사내 PC 브라우저가 부를 주소, GET/POST, 보낼 값(예: 본문에 localStorage 의 `sabun`), 응답 JSON 예시, 사용자를 무엇으로 알아보는지(사내 SSO 쿠키 등) | 인사 시스템 담당 | `servers.config.mjs` 의 `sso.employeeApi` |
| 3 | 인사정보 서버의 **CORS 허용** — 사緣 화면 주소(`http://<Web 서버>:8282`)를 허용. 쿠키를 쓰면 `Access-Control-Allow-Credentials: true` 이고 허용 주소는 `*` 가 아닌 정확한 주소 | 인사 시스템 담당 | 없으면 브라우저가 응답을 읽지 못해 **모두 안내 화면**으로 감 |
| 4 | (권장) **서버용 사내 인사 API** — 사번으로 재직 조회, API 서버에서 접근 가능한지, API 키 | 인사 시스템 담당 | `sso.hrApi` — 브라우저가 보낸 정보를 서버가 다시 확인 |
| 5 | **IIS 확장 설치 허용** — Web 서버: URL Rewrite 2.1 · ARR 3.0 / API 서버: URL Rewrite 2.1 · **iisnode 0.2.26** (.msi, 오프라인 설치) | 보안·IT | Web: `/api` 전달 / API: IIS 가 Node.js(main.js)를 실행 |
| 6 | **방화벽** — 사내 PC → Web 8282 / 사내 PC → 인사정보 URL / Web → API 8292 / API → DB 1433 / API → 인사 API(4번) / 개발 서버 → API 8293·DB | 네트워크 | 사내 PC → API 8292 는 **막는 것을 권장** |
| 7 | 개발 API 를 **API 서버의 8293** 에서 돌려도 되는지 (그림의 "운영/개발" 겸용) | 본인 | 다르면 `servers.config.mjs` 의 `development` 수정 |
| 8 | https 인증서 계획, DB 백업 정책, `DATA_KEY` 보관 위치 | IT·보안 | 6장 |

> ⚠ **보안 한계**: 브라우저가 받은 인사정보는 사용자가 개발자 도구로 꾸며 보낼 수 있다. 4번(서버 재확인)을 켜면 **없는 사번·퇴직자**는 막지만 **다른 사람 사번을 입력하는 것**까지는 막지 못한다. 더 강한 확인이 필요해지면 4장의 iis 방식(Windows 인증)으로 바꿀 수 있다.

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
| IIS **ARR 3.0** (`requestRouter_amd64.msi`) | Web 서버 |

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

### D. API 서버 (12.83.18.17) — IIS + iisnode · 운영(8292)·개발(8293) 두 사이트

API 서버 폴더는 **그대로 IIS 사이트 폴더**다. 패키지의 `api` 폴더를 복사하면 끝이다.

```
C:\sites\sayeon-api\          ← IIS 사이트 'sayeon-api' (포트 8292, 운영)   ← api 폴더째 복사
  main.js                     iisnode 진입점
  web.config                  iisnode 설정 · 환경 · API 포트 · DB 서버/이름 (appSettings)
  routes\                     API 파일 (auth.js · applications.js · me.js · messages.js · saju.js · voc.js · admin.js …)
  src\  shared\  node_modules\ 설정·DB·로그인 / 업무 규칙(화면과 같은 파일) / 라이브러리
  servers.config.mjs          Web 서버 주소 · 관리자 주소 · 로그인 방식 (기준정보 사본)
  .env  config\admins.js      ★ 서버에만 — 비밀값·관리자 (복사할 때 덮어쓰지 않는다)
  iisnode\                    서버 로그 (자동 생성)
C:\sites\sayeon-api-dev\      ← 'sayeon-api-dev' (포트 8293, 개발) — 개발 패키지(npm run release -- --env development)의 api 폴더
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
   앱 풀 `sayeon-api`(관리 코드 없음 · 유휴 종료 끔 · 겹친 재활용 끔 · 프로세스 1개)과 사이트 `sayeon-api`(포트 8292, 폴더 `C:\sites\sayeon-api`), 방화벽(Web 서버 IP → 8292)을 만들고 파일을 놓은 뒤, **`.env`·관리자 파일을 만들라는 안내와 함께 멈춘다**
4. [ ] `C:\sites\sayeon-api\web.config` 의 `<appSettings>` 확인 — 패키지가 기준정보로 채워 둔다

   | 키 | 운영 | 개발 사이트 |
   |---|---|---|
   | `SAYEON_ENV` | `production` | `development` |
   | `API_PORT` | `8292` (IIS 사이트 포트와 같게) | `8293` |
   | `DB_HOST` · `DB_PORT` · `DB_NAME` | `10.166.101.127` · `1433` · `sasystem` | 같은 서버 · `sasystem_dev` |

5. [ ] `C:\sites\sayeon-api\.env` — `copy .env.example .env` 후 채우기

   | 항목 | 값 |
   |---|---|
   | `SESSION_SECRET` | 비워 두고 점검(`npm run check`)을 돌리면 예시 값을 만들어 준다 |
   | `DB_USER` / `DB_PASSWORD` | 앱 전용 계정 (`sayeon_app` + 새 비밀번호 — E 단계가 만든다) |
   | `DB_ADMIN_USER` / `DB_ADMIN_PASSWORD` | `sa` 등 — E 단계 동안만, 끝나면 지움 |
   | `DATA_KEY` | 점검이 만들어 주는 값. ⚠ **한 번 정하면 절대 바꾸지 말고 따로 보관** |
   | `SSO_API_KEY` | 서버 재확인용 인사 API 키 (있으면) |
6. [ ] `C:\sites\sayeon-api\config\admins.js` — `copy admins.example.js admins.js` → `accounts` 에 매칭 담당자 사번·계정 ID, 비밀번호 해시
   ```powershell
   cd C:\sites\sayeon-api
   npm run hash-password -- "새 관리자 비밀번호"
   ```
7. [ ] DB 준비 → **E 단계**
8. [ ] 다시 실행 — 이번에는 **점검(`npm run check`) → 앱 풀 재시작 → 상태 확인**까지 한다 (실패하면 이전 버전으로 자동 되돌림)
   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\deploy\<빌드번호>-production\api\_deploy\deploy-api.ps1
   ```
9. [ ] 개발 사이트도 같은 방법으로 — 개발 서버에서 `npm run release -- --env development` → 그 패키지의 `deploy-api.ps1` (사이트 `sayeon-api-dev`, 포트 8293, 폴더 `C:\sites\sayeon-api-dev`)

재부팅하면 IIS 가 사이트를 자동으로 시작하고, 첫 요청 때 iisnode 가 서버를 띄운다 (따로 할 일 없음).

- **확인**
  - `deploy-api.ps1` 마지막이 `API 서버 배포 완료` · `http://localhost:8292/api/health → 정상`
  - `cd C:\sites\sayeon-api` → `npm run check` 가 ✖ 0 ([7-1](#7-1-npm-run-check--api-서버) 읽는 법) — IIS·iisnode·URL Rewrite, web.config, 사이트·포트, DB, 관리자, 사내 로그인
  - 서버 재확인을 켰으면 `npm run sso:test -- --empno <내 사번>` → "바로 들어올 수 있어요"
  - 서버를 다시 띄우려면 `Restart-WebAppPool sayeon-api` (web.config 나 `.js` 파일을 바꾸면 iisnode 가 알아서 다시 띄운다)
  - 로그: `C:\sites\sayeon-api\iisnode\` (시작 실패도 "원인 / 해결" 로 남는다)

**직접 복사로 배포할 때** (스크립트 없이): 앱 풀 멈춤 → 패키지 `api` 폴더 내용을 사이트 폴더에 복사(**`.env` · `config\admins.js` 는 덮어쓰지 않음**) → 사이트 폴더에서 `npm run check` → `Start-WebAppPool sayeon-api` → `http://localhost:8292/api/health`

### E. DB (10.166.101.127) — 운영 `sasystem`, 개발 `sasystem_dev`

둘 중 하나. 둘 다 **여러 번 실행해도 안전**하다(있는 것은 건너뛴다).

**방법 A — `npm run db:setup` (API 서버에서, 권장)**
1. `.env` 에 앱 계정(`DB_USER`·`DB_PASSWORD`)과 관리 계정(`DB_ADMIN_USER=sa`·`DB_ADMIN_PASSWORD`)
2. 바꾸지 않고 할 일만 보기 → 실행
   ```powershell
   cd C:\sites\sayeon-api
   npm run db:setup -- --check
   npm run db:setup
   ```
   DB 만들기 → 앱 로그인(만료 없음) → DB 사용자 → 읽기·쓰기 권한(`db_datareader`·`db_datawriter`만) → 테이블 `dbo.SA_DOC` → **앱 계정으로 로그인·읽기·쓰기 시험**(되돌림)
3. 끝나면 `.env` 에서 `DB_ADMIN_*` 지우고 `DB_AUTO_CREATE=false`

**방법 B — `server\sql\setup.sql` (DB 담당자, SSMS)** — 맨 위 `@DbName`·`@AppLogin`·`@AppPass` 만 바꿔 실행(F5) → 결과 표 확인

**개발 DB** — 개발 사이트 폴더(`C:\sites\sayeon-api-dev`, web.config 의 `SAYEON_ENV=development`)에서 같은 방법을 한 번 더 (`sasystem_dev`)

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

### F. Web 서버 (10.123.321.12) — IIS

도메인 가입·Windows 인증은 **필요 없다** (로그인은 사용자 PC 브라우저가 사내 인사정보 URL 로 확인).

1. [ ] 서버 관리자 → 역할: **웹 서버(IIS)** (인터넷 없이 됨)
   ```powershell
   Install-WindowsFeature Web-Server -IncludeManagementTools
   ```
2. [ ] C 단계의 **URL Rewrite 2.1**, **ARR 3.0** 설치
3. [ ] ARR 프록시 켜기 (관리자 PowerShell)
   ```powershell
   Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name enabled -Value True
   ```
4. [ ] 사이트 만들기 (폴더는 영문 경로, 인증은 기본값 — 익명 인증 켜짐 그대로)
   ```powershell
   New-Item -ItemType Directory -Force D:\sites\sayeon
   New-Website -Name 'sayeon' -Port 8282 -PhysicalPath 'D:\sites\sayeon'
   New-NetFirewallRule -DisplayName 'sayeon web 8282' -Direction Inbound -Protocol TCP -LocalPort 8282 -Action Allow
   ```
5. [ ] 화면 배포 — 백업·교체·점검까지
   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\deploy\<빌드번호>-production\web\_deploy\deploy-web.ps1 -SitePath D:\sites\sayeon
   ```
- **확인**: `check-web.ps1` 이 `[실패] 0` ([7-2](#7-2-check-webps1--web-서버) 읽는 법) — 사내 인사정보 URL 설정, **IIS → API 전달** 정상. 로그인은 G 단계에서 사내 PC 로 확인

### G. 사내 PC 확인

- [ ] 사내 PC(사내 포털에 로그인한 상태)에서 `http://<Web 서버>:8282` → **로그인 화면 없이 홈**, 화면 위 이름·사업부
- [ ] "임직원만 이용할 수 있어요" 가 뜨면 → F12 → **Console** 에 CORS 오류가 있는지(0장 3번), **Network** 에서 인사정보 URL 응답 확인 → **애플리케이션 → 로컬 스토리지** 의 `sayeon.employee` 값을 파일로 저장해 API 서버에서 `npm run sso:test -- --file 응답.json`
- [ ] 사내망 밖·인사정보 없는 PC 에서는 안내 화면이 뜨는지
- [ ] 관리자 담당자 PC 에서 `…/changeme` → 관리자 비밀번호 → 대시보드
- [ ] 신청서 작성 → 하트 → 매칭 → 쪽지, 인연 사주 (리허설 계정 2개 이상)
- [ ] 리허설 데이터 정리: 관리자 화면에서 삭제, 또는 처음 상태로 — API 서버 `Stop-WebAppPool sayeon-api` → DB `DELETE FROM sasystem.dbo.SA_DOC;` → `Start-WebAppPool sayeon-api`

### H. 정식 오픈

- 운영 빌드는 늘 정식 운영이다 (가짜 데이터 시연은 개발 서버의 `npm run dev` 로만)
- 기준정보: 개발 모드 관리자 화면 → 기준정보 → **[엑셀로 내보내기]** → 운영 관리자 화면 → **[파일 가져오기]** → 미리보기 → **[적용]**
- G 리허설 데이터 정리 → 사용자 주소 공지 (관리자 주소는 공지하지 않음)

---

## 2. 기능 추가 배포 (반복)

| # | 어디서 | 할 일 | 확인 |
|---|---|---|---|
| 1 | 개발 서버 | 개발 → 개발 모드(`client` `npm run dev`, 만능 계정으로 바로)로 시험 → 개발 API(`SAYEON_ENV=development`, 8293, `sasystem_dev`)로 실제 DB 시험 | 새 기능 + 아래 6번 목록이 개발 환경에서 됨 |
| 2 | 개발 서버 | git 커밋 | `git status` 깨끗 |
| 3 | 개발 서버 | `npm run release` | 마지막 `배포 패키지 준비 완료`, ⚠ "커밋하지 않은 변경" 이 없을 것 |
| 4 | API 서버 | `deploy-api.ps1` (패키지의 `api\_deploy`) — **API 먼저** | `배포 완료` · `/api/health 정상`. 점검·시작이 실패하면 **자동으로 이전 버전으로 되돌린다** |
| 5 | Web 서버 | `deploy-web.ps1 -SitePath D:\sites\sayeon` | `check-web.ps1` `[실패] 0` |
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
| DB 서버·DB 이름 · API 포트 | API 서버 사이트 폴더의 `web.config` (`appSettings`) — 또는 `servers.config.mjs` 고쳐 다시 패키지 | 저장하면 iisnode 가 다시 띄움 → `npm run check` |
| DB 계정·비밀번호 | API 서버 사이트 폴더의 `.env` | `npm run check` → `Restart-WebAppPool sayeon-api` |
| 사내 인사정보 URL (브라우저가 부름) | `servers.config.mjs` 의 `sso.employeeApi` | release → Web 배포 (급하면 Web 서버의 `sayeon.config.js` 만 고쳐도 됨 — 다음 배포 때 덮어써짐) |
| 서버 재확인용 인사 API | `servers.config.mjs` 의 `sso.hrApi` | release → API 배포 → `npm run sso:test -- --empno …` |
| 인사 API 키 | API 서버 사이트 폴더 `.env` 의 `SSO_API_KEY` | `Restart-WebAppPool sayeon-api` |
| 응답 필드 이름·사업부 이름·재직 아님 값 | `client\src\utils\employeeInfo.js` 의 `FIELD`·`DIVISION_MAP`·`INACTIVE` (화면·서버 같이 씀) | release → API·Web 둘 다 배포 |
| 관리자 추가·삭제·비밀번호 | API 서버 사이트 폴더 `config\admins.js` | 자동 (3초) |
| 관리자 주소 | `servers.config.mjs` 의 `adminPath` | release → 둘 다 배포 |
| 기준정보(사업부·캠퍼스 등) | 관리자 화면 → 기준정보 → 엑셀 일괄 변경 | 바로 |
| https | Web 서버 IIS 인증서 바인딩 + API `.env` 의 `COOKIE_SECURE=true` | restart |

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

`servers.config.mjs` 의 `sso` 로 정한다. 로그인 화면은 없다. 개발 모드(`npm run dev`)는 로그인 없이 만능 테스트 계정으로 바로 들어간다.

### browser 방식 (기본, `sso.mode: 'browser'`)

1. **화면(라우터)** — 화면을 열 때 사용자 PC 브라우저가 `sso.employeeApi.url`(사내 인사정보 URL)을 부른다. 사내 SSO 쿠키를 함께 보낸다(`withCredentials`). 본문·주소에 `{ls:키}`(localStorage 값)·`{query:이름}`(주소창 값)을 쓸 수 있다
2. 정상 회신이면 응답을 **localStorage 의 `sayeon.employee`** 에 저장한다 (로그아웃하면 지움)
3. 응답을 읽는다 (`client/src/utils/employeeInfo.js`) — JSON 어디에 있든 사번이 든 객체를 찾고, 필드 이름은 대소문자·`_` 무시(`SABUN`·`USER_NM`·`DIV_NM`·`EMP_STAT` 등). 재직 상태가 퇴직·휴직이면 재직 아님
4. 임직원이면 그 정보를 **API 서버**(`/api/auth/sso`)로 보낸다 → API 서버가 같은 규칙으로 다시 읽고, `sso.hrApi.url` 이 있으면 **그 사번으로 사내 인사 API 에 다시 물어** 확인한 뒤 세션을 만든다 → 홈

| 결과 | 화면 |
|---|---|
| 인사정보에서 재직 확인 | 바로 홈 |
| 응답 없음(401·404) · 사번 없음 · 서버 재확인에서 없는 사번 | "임직원만 이용할 수 있어요" |
| 재직 상태 휴직·퇴직 (브라우저 또는 서버 재확인) | "재직 중인 임직원만 이용할 수 있어요" |
| 인사정보 서버 연결 실패·5xx · CORS 막힘 · 서버 재확인 인사 API 장애 | "사내 인사정보 서버에 연결하지 못했어요" |
| API 서버 꺼짐·응답 없음(20초) | "사緣 서버에 연결하지 못했어요" |
| `employeeApi.url` 비어 있음 | "서비스를 준비하고 있어요" |

- 시험: 사내 PC 화면 F12 → 애플리케이션 → 로컬 스토리지의 `sayeon.employee` 값을 파일로 저장 → API 서버에서 `npm run sso:test -- --file 응답.json` (어느 필드에서 무엇을 읽었는지, 서버 재확인 결과까지). 서버 재확인만: `npm run sso:test -- --empno 사번`
- ⚠ 브라우저가 보낸 정보는 꾸밀 수 있다 — `sso.hrApi` 재확인을 켜 두는 것을 권장 (0장 보안 한계)

### iis 방식 (`sso.mode: 'iis'`) — 더 강한 확인이 필요할 때

Web 서버 IIS 의 Windows 인증으로 `SECDS\아이디` 를 확인해 헤더로 넘기고(API 서버는 Web 서버 IP 에서 온 것만 믿음), API 서버가 AD(사번·이름·사용 여부)와 사내 인사 API 로 재직을 확인한다. 바꾸면 빌드가 `web.config` 에 계정 헤더를 넣고 `check-web.ps1` 이 Windows 인증·헤더 변수까지 점검한다. 필요: Web·API 서버 도메인 가입, Web 서버 `Web-Windows-Auth`·헤더 변수 `HTTP_X_SAYEON_USER` 허용, API 서버 IIS 앱 풀 ID 를 도메인 계정으로, 사내 PC 인트라넷 영역. 시험: `npm run sso:test -- --user 회사아이디`

---

## 5. 개발 환경

| 무엇 | 어디 | 설정 |
|---|---|---|
| 화면 개발 (가짜 데이터) | 개발 서버 `client` → `npm run dev` | 설정 없음 — 만능 계정으로 바로 홈, 로그아웃하면 테스트 계정 고르기 |
| 운영 빌드 + 개발 API | `client` → `npm run build` → `npm run preview` → `/api` 를 개발 API(`servers.config.mjs` 의 `development.api`, 또는 `DEV_API_PROXY`)로 | `dist\sayeon.config.js` 의 `employeeApi.url` 을 시험용 주소로 |
| 개발 API | API 서버의 IIS 사이트 `sayeon-api-dev` (8293) — web.config `SAYEON_ENV=development`, DB `sasystem_dev` | `npm run release -- --env development` 패키지의 `deploy-api.ps1` (폴더 `C:\sites\sayeon-api-dev`) |
| API 서버를 내 PC 에서 | `server` → `npm start` (node main.js) — IIS 없이 web.config 의 포트로 뜬다 | `server\.env` (`STORE=memory` 면 DB 없이) |

⚠ 운영과 개발은 **DB 이름·API 포트가 반드시 달라야 한다** (같으면 서로 데이터를 덮어쓴다 — 점검이 막는다).

---

## 6. 백업과 보안

- [ ] DB 정기 백업 — 데이터는 `sasystem.dbo.SA_DOC` 한 테이블
- [ ] `DATA_KEY` 를 DB 백업과 **다른 곳**에 보관 (없으면 이름·메일 복구 불가)
- [ ] API 서버 사이트 폴더의 `.env`, `config\admins.js` 백업 (git·패키지에 없음)
- [ ] DB 는 전용 계정(읽기·쓰기만), `.env` 에 `DB_ADMIN_*` 남기지 않기
- [ ] 관리자 비밀번호 해시, 관리자 주소 비공개
- [ ] API 8292 는 Web 서버 IP 에서만 (사내 PC 직접 접근 차단 권장)
- [ ] 서버 재확인(`sso.hrApi`) 켜기 — 브라우저가 보낸 인사정보를 서버가 다시 확인
- 개인정보 최소 수집: 생년월일은 **출생연도만** 저장한다. 인연 사주에 입력한 월·일·태어난 시간은 계산에만 쓰고 저장하지 않는다 (예전 데이터는 서버가 불러올 때 연도만 남기고 지운다)
- 들어 있는 보호: 비밀번호를 받지 않음 · 로그인 확인 1분 30회 제한 · 세션 재발급 · 관리자 5회 실패 잠금 · 열람 기록 · 이름·메일 암호화 · 인사정보 크기 제한

---

## 7. 점검 명령 읽는 법과 문제 해결

### 7-1. `npm run check` — API 서버

| 구역 | 확인하는 것 |
|---|---|
| 1 실행 환경 | Node 22.12.0 · npm · **IIS · iisnode · URL Rewrite** · node.exe 경로 · 설치 경로 한글 여부 |
| 2 설정 | **web.config**(환경·API 포트·DB 서버), `servers.config.mjs` 형식, 운영/개발 겹침, 관리자 주소, **이 서버가 기준정보의 API 서버가 맞는지** |
| 3 `.env` | 예전 항목·오타, `SESSION_SECRET`·`DATA_KEY`, 쿠키, 남은 관리 계정 |
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
| 1 서버 | 관리자 권한, 로그인 방식 (iis 방식이면 도메인 가입) |
| 2 IIS 구성 요소 | IIS 실행, URL Rewrite, ARR, ARR 프록시 켜짐 (iis 방식이면 Windows 인증 기능·계정 헤더 변수) |
| 3 사이트 | 이 폴더의 사이트, 8282 바인딩, 방화벽 (iis 방식이면 Windows 인증 켬·익명 끔) |
| 4 화면 파일 | 필수 파일, **모든 파일이 빌드와 같은지(해시 비교)**, 사내 인사정보 URL 설정 |
| 5 연결 | API 서버 포트·상태, 이 서버에서 화면 열림, **IIS → API 전달**, 인사정보 서버 연결(참고) |
| 6 로그인 | browser: 사내 PC 에서 확인하는 방법 안내 / iis: 지금 Windows 계정으로 로그인 시험 |

`[실패]` 마다 원인과 **그대로 실행할 PowerShell 명령**이 나온다.

### 7-3. 자주 나오는 문제

| 증상 | 원인 · 해결 |
|---|---|
| 명령이 메시지 없이 꺼짐 | Node 22.12 + 한글 경로 → 영문 경로로 |
| 화면 전체가 500.19 오류 | URL Rewrite 미설치 → C 단계 msi 설치 |
| "사緣 서버에 연결하지 못했어요" | IIS → API 전달 실패: ARR 프록시·API 방화벽·API 서버 꺼짐 (`check-web.ps1` 2·5번, API 서버 `http://localhost:8292/api/health` · 사이트 폴더 `iisnode\` 로그) |
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
