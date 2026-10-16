# 사緣 운영 전환 가이드 — 시연(test)에서 정식 운영(open)으로

배포·운영 절차는 **이 문서 하나**에만 적는다. README와 설계서(DESIGN.md)에는 요약과 링크만 둔다.
위에서부터 순서대로 진행하고, 끝낸 항목은 `[ ]`를 `[x]`로 바꿔 둔다.

---

## 한눈에

### 서버 구성

| 역할 | 서버 | 내용 |
|---|---|---|
| **웹 화면 + API** | `12.83.18.17` | Node.js 서버 하나(포트 3000, PM2)가 빌드한 화면(`client/dist`)과 `/api`를 함께 내보낸다. IIS 같은 별도 웹 서버는 필요 없다 |
| **DB** | `10.166.101.127` | MSSQL · 데이터베이스 `SAYEON` · 테이블 `dbo.SA_DOC` 1개 |

- 사용자: `http://12.83.18.17:3000`
- 관리자: `http://12.83.18.17:3000/changeme` (주소는 `server/.env`의 `ADMIN_PATH`)
- 상태 확인: `http://12.83.18.17:3000/api/health`

### 운영 표준 버전

| Node.js | npm | PM2 |
|---|---|---|
| **22.12.0** | **10.9.0** (Node.js 22.12.0에 들어 있음) | **5.3.0** |

`npm run check`가 세 가지를 모두 확인한다. 패키지 설치는 잠금 파일 그대로 설치하는 `npm ci`를 쓴다.

> ### ⚠ 설치 경로는 영문·숫자로만
> Node.js 22.12.0은 Windows에서 **한글 등 영문이 아닌 글자가 들어간 경로**(예: `C:\Users\홍길동\바탕 화면\sa`)의 패키지를 불러올 때 **오류 메시지 없이 강제 종료**된다. 서버 시작·화면 빌드·점검이 모두 안 된다.
> - 코드는 `C:\apps\sa`처럼 영문 경로에 받는다.
> - 윈도우 사용자 이름이 한글이면 전역 npm 폴더(PM2 설치 위치)도 한글 경로가 된다 → [1-1](#1-1-설치)의 `npm config set prefix`를 먼저 한다.
> - `npm run check` · `npm run build` · 서버 시작(`start.cjs`)이 이 상황을 먼저 확인하고 원인·해결을 알려 준다.

### 전체 순서

| 순서 | 어디서 | 할 일 | 끝났는지 확인 |
|---|---|---|---|
| 0 | 메일 | [사전 협조 요청](#0-사전-협조-요청--가장-먼저) — 방화벽·DB·사내 인증 API | 회신 |
| 1 | 12.83.18.17 | [설치 · 코드 받기](#1-api-서버-준비--12831817) | `node -v` = v22.12.0 |
| 2 | server | [패키지 설치 · `.env` 작성](#2-server--패키지와-설정) | `.env` 저장 |
| 3 | DB | [DB 준비](#3-db--데이터베이스-계정-권한-테이블) — `npm run db:setup` 또는 `setup.sql` | 결과 ✖ 0 |
| 4 | server | [관리자 계정 · 사내 로그인 연결](#4-server--관리자-계정과-사내-로그인) | — |
| 5 | client | [패키지 · 라이선스 · 화면 빌드](#5-client--화면-빌드) | `client/dist` |
| 6 | server | [점검 · PM2 시작 · 자동 시작](#6-server--점검과-시작) | `npm run check` ✖ 0, `/api/health` |
| 7 | 전체 | [시연 → 정식 오픈 전환](#7-시연test--정식-운영open-전환) — 기준정보 옮기기 포함 | 리허설 |
| 8 | 전체 | [운영 중 바꿀 때](#8-운영-중-바꿀-때--ip포트dbapi기준정보) — IP·포트·DB·API·기준정보 | — |
| 9 | 전체 | [백업 · 보안](#9-백업과-보안) | — |
| 10 | — | [npm run check 읽는 법 · 문제 해결](#10-npm-run-check-읽는-법과-문제-해결) | — |

---

## 0. 사전 협조 요청 — 가장 먼저

처리에 며칠 걸리는 일이라 먼저 요청해 둔다.

**인프라(방화벽)**
- [ ] 사용자 PC(DS부문 사내망) → `12.83.18.17:3000` TCP 허용
- [ ] `12.83.18.17` → `10.166.101.127:1433` TCP 허용 (DB는 API 서버에서만 열면 된다)
- [ ] `12.83.18.17` → 사내 인증·인사 API 서버 (받은 URL의 호스트·포트)
- [ ] (선택) `12.83.18.17` → `github.com:443`, 사내 npm 미러 — 막혀 있으면 [1-2](#1-2-코드-받기)의 반입 방법을 쓴다

**DB 담당 (10.166.101.127)**
- [ ] SQL Server 인증(혼합 모드) 사용, TCP/IP 1433 사용
- [ ] 둘 중 하나: ① `sa`(또는 sysadmin) 계정을 [3단계](#3-db--데이터베이스-계정-권한-테이블)에서 한 번만 쓰도록 허락 ② DB 담당자가 `server/sql/setup.sql`을 직접 실행

**사내 인증(SSO/AD) 담당** — **실제 응답 JSON 예시**를 꼭 받는다 ([4-2](#4-2-사내-로그인-sso--ad-연결)에서 필드 이름을 맞춘다)

| 받을 정보 | 넣을 곳 |
|---|---|
| ID/비밀번호 확인 API 주소 · 요청 형식 · 응답 예시 | `.env`의 `AUTH_LOGIN_URL`, `server/src/sso.js` |
| SSO 방식: ① 앞단이 사용자 ID를 헤더로 넘김 ② 토큰 쿠키를 확인 API로 검증 | `.env`의 `SSO_MODE` 외 |
| 인사정보 조회 API(사번 → 이름·성별·사업부·팀·재직 상태) | `HR_LOOKUP_URL` |
| 임직원 검색 API (관리자 블랙리스트 등록용, 선택) | `HR_SEARCH_URL` |
| API 키와 키를 넣는 헤더 이름 | `SSO_API_KEY`, `SSO_API_KEY_HEADER` |

**개인정보·보안 담당**
- [ ] 화면의 '개인정보 처리 안내'와 신청서 동의 문구 검토

---

## 1. API 서버 준비 — 12.83.18.17

### 1-1. 설치

- [ ] **Node.js 22.12.0** 설치 (npm 10.9.0이 함께 설치된다)
- [ ] (윈도우 사용자 이름이 한글이면) 전역 npm 폴더를 영문 경로로:
  ```powershell
  npm config set prefix C:\apps\npm-global
  ```
  그리고 시스템 환경 변수 `Path`에 `C:\apps\npm-global`을 추가한 뒤 **새 창**을 연다
- [ ] **PM2 5.3.0**
  ```powershell
  npm install -g pm2@5.3.0
  ```
- [ ] **git** (없으면 zip 반입으로 대신한다)
- [ ] 버전 확인 — `node -v` → `v22.12.0`, `npm -v` → `10.9.0`, `pm2 -v` → `5.3.0`

참고
- 사내 npm 미러를 써야 하면 먼저 `npm config set registry <사내 미러 주소>`
- PowerShell에서 `pm2`·`npm`이 "스크립트를 실행할 수 없습니다"로 막히면 `pm2.cmd`·`npm.cmd`로 실행한다

### 1-2. 코드 받기

영문 경로(예: `C:\apps`)에 받는다. 비공개 저장소라 GitHub 로그인(개인 액세스 토큰)이 필요하다.

```powershell
mkdir C:\apps
cd C:\apps
git clone -b <배포할 브랜치> https://github.com/gangsane-lee/sa.git
```

→ `C:\apps\sa\client`, `C:\apps\sa\server`

- 사내망에서 GitHub가 막혀 있으면 밖의 PC에서 받은 폴더(또는 GitHub의 Code → Download ZIP)를 `C:\apps\sa`로 반입한다
- ⚠ **`server` 폴더만 따로 두면 안 된다.** 서버가 `client/src`의 업무 규칙 코드와 `client/node_modules`(사주 계산 라이브러리)를 함께 쓴다

---

## 2. server — 패키지와 설정

### 2-1. 패키지 설치

```powershell
cd C:\apps\sa\server
npm ci
```

- 인터넷이 안 되면 밖에서 같은 OS·같은 Node.js 버전으로 `npm ci`까지 끝낸 폴더를 반입한다 (`server/node_modules`)

### 2-2. `server/.env` 작성

```powershell
copy .env.example .env
```

`.env.example`에는 두 서버 주소가 이미 들어 있다. 아래 표에서 **굵은 항목**은 반드시 채운다.

| 항목 | 넣을 값 | 비고 |
|---|---|---|
| `PORT` | `3000` | 바꾸면 `PUBLIC_URL`·방화벽도 같이 |
| `PUBLIC_URL` | `http://12.83.18.17:3000` | |
| `SERVICE_MODE` | `open` (정식) · `test` (시연) | [7단계](#7-시연test--정식-운영open-전환) |
| `ADMIN_PATH` | `/changeme` | 사용자 화면 주소(`/login`·`/saju` 등)와 겹치면 안 된다 |
| **`SESSION_SECRET`** | 긴 무작위 문자열 | 비워 두고 `npm run check`를 실행하면 예시 값을 만들어 준다 |
| `COOKIE_SECURE` | `false` | https로 접속할 때만 `true` (http에서 `true`면 로그인이 바로 풀린다) |
| `TRUST_PROXY` | `false` | 앞단에 IIS·Nginx가 있으면 `true` |
| `STORE` | `mssql` | |
| `DB_HOST` / `DB_PORT` / `DB_NAME` | `10.166.101.127` / `1433` / `SAYEON` | |
| **`DB_USER` / `DB_PASSWORD`** | 서버가 평소에 쓸 **앱 계정** | 권장: `sayeon_app` + 새 비밀번호 ([3단계](#3-db--데이터베이스-계정-권한-테이블)가 만든다) |
| `DB_ADMIN_USER` / `DB_ADMIN_PASSWORD` | `sa` 등 관리 계정 | `npm run db:setup` 때만. **끝나면 지운다** |
| `DB_AUTO_CREATE` | 3단계를 했으면 `false` | `true`면 서버가 처음 켤 때 DB·테이블을 만든다(앱 계정에 권한이 있을 때만) |
| `DB_ENCRYPT` / `DB_TRUST_CERT` | `false` / `true` | DB가 TLS를 요구하면 `DB_ENCRYPT=true` |
| **`DATA_KEY`** | base64 32바이트 | 비워 두고 `npm run check`를 실행하면 예시 값을 만들어 준다. ⚠ **한 번 정하면 절대 바꾸지 말고 따로 보관** — 잃어버리면 DB의 이름·메일을 복구할 수 없다 |
| `SSO_*` · `AUTH_LOGIN_URL` · `HR_*` | | [4-2](#4-2-사내-로그인-sso--ad-연결) |

> 작업 PC의 `server/.env`에는 두 서버 주소, DB 계정, 세션·암호화 키가 이미 채워져 있다. git에 올라가지 않는 파일이므로, 안전한 경로로 서버에 복사해서 써도 된다 (**`DATA_KEY`가 같아야** 같은 DB를 읽을 수 있다).

---

## 3. DB — 데이터베이스, 계정, 권한, 테이블

DB 서버 `10.166.101.127`. 두 방법 중 하나만 하면 된다. 둘 다 **여러 번 실행해도 안전하다** — 이미 있는 것은 건너뛰고 없는 것만 만든다.

| | 방법 A — `npm run db:setup` (권장) | 방법 B — `server/sql/setup.sql` |
|---|---|---|
| 누가 | 운영 담당자 (API 서버에서) | DB 담당자 (SSMS에서) |
| 필요한 것 | `.env`에 관리 계정(`DB_ADMIN_USER`) 한 번 | DB 담당자의 sysadmin 계정 |
| 끝에 확인 | 앱 계정으로 로그인·읽기·쓰기까지 자동 시험 | 결과 표 (로그인·사용자·권한·테이블) |

### 3-1. 방법 A — `npm run db:setup`

1. `server/.env`에 **앱 계정**(`DB_USER`·`DB_PASSWORD`)과 **관리 계정**(`DB_ADMIN_USER=sa`, `DB_ADMIN_PASSWORD=...`)을 넣는다
   - 앱 계정 비밀번호: 8자 이상, 대문자·소문자·숫자·특수문자 중 3종류 이상 (DB 서버 암호 정책)
   - 관리 계정을 비워 두면 `DB_USER`로 진행한다 (`DB_USER`가 `sa`처럼 권한이 큰 계정일 때)
2. 무엇을 할지 먼저 본다 (아무것도 바꾸지 않음)
   ```powershell
   npm run db:setup -- --check
   ```
3. 실행
   ```powershell
   npm run db:setup
   ```
   차례로 진행한다: 설정 확인 → 관리 계정 연결 → **DB 만들기** → **앱 로그인 만들기**(비밀번호 만료 없음) → **DB 사용자·권한**(`db_datareader`·`db_datawriter`만) → **테이블 만들기·구조 확인** → **앱 계정으로 로그인·읽기·쓰기 시험**(시험 내용은 되돌림)
4. 끝나면 화면 안내대로
   - [ ] `.env`에서 `DB_ADMIN_USER`·`DB_ADMIN_PASSWORD` 지우기
   - [ ] `.env`의 `DB_AUTO_CREATE=false`

### 3-2. 방법 B — `server/sql/setup.sql` (DB 담당자)

1. SSMS에서 sysadmin 계정으로 `10.166.101.127`에 접속한다
2. `server/sql/setup.sql`을 열고 맨 위 세 값을 바꾼다 — `@DbName`(`SAYEON`), `@AppLogin`(`sayeon_app`), `@AppPass`(새 비밀번호)
3. 전체 실행(F5) → 메시지 탭의 ✔와 마지막 결과 표(로그인 정상 · DB 사용자 · 권한 읽기·쓰기 · 테이블 있음)를 확인한다
4. API 서버의 `server/.env`에 `DB_USER`·`DB_PASSWORD`를 같은 값으로, `DB_AUTO_CREATE=false`

### 3-3. 상황별 처리 (예외)

| 상황 | `db:setup` · `setup.sql` | 서버 시작(`pm2 start`) |
|---|---|---|
| DB가 없음 | 만든다. 관리 계정에 권한이 없으면 ✖ + 안내 | `DB_AUTO_CREATE=true`면 만든다 / `false`면 멈추고 "`npm run db:setup`" 안내 |
| DB가 OFFLINE · 읽기 전용 | ✖ + DB 담당자 요청 안내 | 멈추고 원인 안내 |
| 앱 로그인이 없음 | 만든다 (`CHECK_POLICY=ON`, 만료 없음, 기본 DB 지정) | 로그인 실패 원인 안내 |
| 로그인이 이미 있음 | 건너뛴다. 비밀번호가 `.env`와 다르면 `--reset-password` (SQL: `@ResetPassword = 1`) | — |
| 로그인이 사용 중지 | 사용으로 바꾼다 | — |
| 비밀번호가 암호 정책에 안 맞음 | ✖ + 비밀번호 조건 안내 | — |
| DB 사용자가 없음 | 만든다 | "DB를 열 수 없어요" + 안내 |
| 사용자-로그인 연결이 끊김 (다른 서버에서 DB 복원) | 다시 잇는다 | — |
| 로그인이 DB 소유자(dbo) | 권한 부여를 건너뛴다 (이미 전체 권한) | — |
| 읽기·쓰기 권한이 없음 | `db_datareader`·`db_datawriter`를 준다 | 저장할 때 오류 + 안내 |
| 테이블이 없음 | 만든다 | 권한이 있으면 만든다 / 없으면 멈추고 안내 |
| 같은 이름 테이블의 구조가 다름 | ✖ — **자동으로 고치지 않는다** (다른 용도 테이블일 수 있음) | 멈추고 안내 |
| `DATA_KEY`가 저장된 데이터와 다름 | — | 멈추고 "처음 쓰던 키를 넣으세요" 안내 |
| Windows 인증만 켜져 있음 / 방화벽 / 인증서 | 원인과 해결 방법 안내 | 같음 |

- 서버가 시작에 실패하면 PM2가 **10초 간격으로 최대 15번** 다시 시도하고 멈춘다. 원인은 `pm2 logs sayeon-api`에 "원인: … / 해결: …"으로 남는다
- 관리 계정 없이 앱 계정에 DB·테이블 생성 권한까지 주는 방식은 권장하지 않는다 (필요하면 `db_ddladmin`)

---

## 4. server — 관리자 계정과 사내 로그인

### 4-1. 관리자 계정 (`server/config/admins.js`)

```powershell
cd C:\apps\sa\server\config
copy admins.example.js admins.js
```

- [ ] `accounts`에 매칭 담당자의 **사번(`empNo`) 또는 사내 계정 ID(`adId`)** — 둘 중 하나만 맞아도 관리자
- [ ] 관리자 비밀번호를 해시로 — `server` 폴더에서 아래를 실행해 출력값을 `passwordHash`에 붙여 넣고 `password`는 비운다
  ```powershell
  npm run hash-password -- "새 관리자 비밀번호"
  ```
- 저장하면 서버를 다시 켜지 않아도 3초 안에 반영된다
- 관리자 진입: `http://12.83.18.17:3000/changeme` → 사내 계정 확인 → `accounts`에 있는지 → 관리자 비밀번호 (5번 틀리면 10분 잠금, 30분 동안 동작이 없으면 자동 종료)

### 4-2. 사내 로그인 (SSO / AD) 연결

손댈 곳은 `server/.env`와 `server/src/sso.js` 두 군데뿐이다.

**① 연결 방식 (`SSO_MODE`)**

| 사내 환경 | `SSO_MODE` | 채울 값 |
|---|---|---|
| 앞단(IIS·웹서버 SSO 에이전트)이 로그인한 사용자 ID를 헤더로 넘겨 준다 | `header` | `SSO_HEADER`, `SSO_PROXY_SECRET`, `SSO_PROXY_SECRET_HEADER`, `HR_LOOKUP_URL` |
| 브라우저에 사내 SSO 토큰 쿠키가 있고, 토큰 확인 API가 있다 | `api` | `SSO_TOKEN_COOKIE`, `SSO_VERIFY_URL` |
| SSO 없이 ID/비밀번호만 | `off` | `AUTH_LOGIN_URL`만 |

- **로그인 화면(ID/비밀번호)은 모드와 상관없이 `AUTH_LOGIN_URL`로 확인한다.** SSO가 안 되면 이 화면으로 넘어가므로 꼭 채운다
- `header`: 앞단 프록시가 사용자 ID 헤더와 함께 **`SSO_PROXY_SECRET`과 같은 값**을 비밀값 헤더로 붙여야 한다. 비어 있거나 다르면 아무도 통과시키지 않는다. 3000번 포트는 프록시에서만 접근하도록 방화벽을 제한하는 것을 권장한다
- `api`: 브라우저는 쿠키를 같은 도메인으로만 보낸다. **IP(`12.83.18.17`)로 접속하면 사내 SSO 쿠키가 오지 않는다** → 사내 DNS 이름을 받아 그 주소로 접속한다

**② 요청 형식 (`server/src/sso.js`)**

| 호출 | 지금 보내는 형식 | 다르면 고칠 곳 |
|---|---|---|
| 로그인 (`AUTH_LOGIN_URL`) | `POST` JSON `{ "userId": "...", "password": "..." }` | `directory.authenticate()`의 `body` |
| SSO 토큰 확인 (`SSO_VERIFY_URL`) | `POST` JSON `{ "token": "..." }` | `directory.identify()`의 `api` 부분 |
| 인사 조회 (`HR_LOOKUP_URL`) | `GET` — 주소의 `{empNo}` 자리에 사번·계정 | `.env` 주소만 |
| 임직원 검색 (`HR_SEARCH_URL`) | `GET` — 주소의 `{q}` 자리에 검색어, 배열 응답 | `.env` 주소만 |
| API 키 | `SSO_API_KEY_HEADER: SSO_API_KEY` 헤더 | `.env` |

- 응답이 401·403·404면 "계정 없음/비밀번호 틀림", 그 밖의 오류·연결 실패는 "사내 인증 서버에 연결하지 못했어요"(503)
- form 전송 등 형식이 많이 다르면 `callApi()`를 고친다

**③ 응답 맞추기 (`server/src/sso.js` 위쪽)**

- [ ] **`SSO_RESULT_PATH`**(.env): 사용자 정보가 응답 안쪽에 있으면 그 위치. 예: `{ "result": { "user": { … } } }` → `result.user`
- [ ] **`FIELD`**: 항목별 필드 이름 후보에 사내 필드 이름을 추가한다 (`'org.deptName'`처럼 점으로 안쪽 값도 가능). **사번(`empNo`)은 필수** — 못 찾으면 로그인이 실패한다
- [ ] **`DIVISION_MAP`**: 사내 사업부 이름 → 사緣 코드(`MEMORY`·`LSI`·`FOUNDRY`·`COMMON`)
- [ ] **`INACTIVE`**: '재직 아님'으로 볼 상태 값 — 해당하면 로그인을 막는다

예: 사내 응답이 `{ "data": { "SABUN": "12345678", "USER_NM": "홍길동", "BIZ_NM": "메모리사업부" } }`라면

```js
// .env:  SSO_RESULT_PATH=data
const FIELD = {
  empNo: ['empNo', 'employeeNo', 'EMP_NO', 'sabun', 'SABUN'],     // ← SABUN 추가
  name: ['name', 'userName', 'displayName', 'EMP_NM', 'USER_NM'],   // ← USER_NM 추가
  division: ['division', 'divisionName', 'bizUnit', 'DIVISION_NM', 'BIZ_NM'],
  // …
};
```

**④ 확인** — [6단계](#6-server--점검과-시작)에서 서버를 띄운 뒤
- [ ] 본인 계정으로 로그인 → 화면 위쪽 이름이 맞는지
- [ ] 비밀번호가 맞는데 "사내 계정 또는 비밀번호가 맞지 않아요" → 응답은 왔지만 사번을 못 찾은 것 → `SSO_RESULT_PATH`·`FIELD.empNo`
- [ ] 문제가 있으면 `pm2 logs sayeon-api`의 `[sso]` 줄

---

## 5. client — 화면 빌드

화면은 API 서버(`12.83.18.17`)에서 빌드하고, 서버가 `client/dist`를 그대로 내보낸다. 화면 코드에는 서버 주소가 들어 있지 않다(같은 주소의 `/api`를 부른다).

### 5-1. 패키지 설치

```powershell
cd C:\apps\sa\client
npm ci
```

서버도 이 패키지를 함께 쓰므로 **화면을 다른 PC에서 빌드하더라도 API 서버에 `client/node_modules`가 있어야 한다.**

### 5-2. DevExtreme 라이선스

등록하지 않으면 화면 맨 위에 평가판 배너가 뜬다. **빌드하기 전에** 한다.

- [ ] 둘 중 하나
  - 작업 PC에서 만든 `client/src/.devextreme/license-key.js`를 서버의 같은 위치에 복사한다
  - 또는 서버에서 키를 환경 변수 `DevExpress_License`에 넣거나 `%APPDATA%\DevExpress\DevExpress_License.txt`에 저장한 뒤 `client` 폴더에서
    ```powershell
    npx devextreme-license --out src/.devextreme/license-key.js --no-gitignore --force
    ```
- 키 파일은 git에 올리지 않는다(`.gitignore` 대상). `src/main.js`가 파일이 있으면 자동으로 등록하고, 없으면 평가판으로 빌드된다

### 5-3. 빌드 종류 정하기 (`client/.env.production`)

| 운영 단계 | `client/.env.production` | `server/.env` |
|---|---|---|
| 시연 (오픈 전 체험) | `VITE_INCLUDE_MOCK=true` | `SERVICE_MODE=test` |
| **정식 운영** | **`VITE_INCLUDE_MOCK=false`** (테스트 계정·가짜 데이터 코드가 빠진다) | **`SERVICE_MODE=open`** |

두 값이 어긋나면 `npm run check`가 알려 준다 (`test`인데 가짜 데이터가 빠진 빌드면 ✖, `open`인데 들어 있으면 ⚠).

### 5-4. 빌드

```powershell
npm run build
```

- 빌드 전에 Node.js 버전·설치 경로를 먼저 확인한다(`prebuild`)
- [ ] `client/dist/index.html`이 생겼는지
- **화면만 다시 빌드한 경우 서버를 다시 켤 필요 없다.** 사용자는 새로 고침(Ctrl+F5)하면 된다

---

## 6. server — 점검과 시작

### 6-1. 점검

```powershell
cd C:\apps\sa\server
npm run check
```

- [ ] 마지막 줄이 **"시작할 준비가 됐어요"** (✖ 0개). ⚠는 운영 전에 정리를 권장하는 항목
- 읽는 법은 [10단계](#10-npm-run-check-읽는-법과-문제-해결)

### 6-2. 시작

```powershell
pm2 start ecosystem.config.cjs
pm2 save
```

- [ ] `pm2 logs sayeon-api`에 `[server] 사緣 서버 시작 · http://12.83.18.17:3000 (저장소: mssql, 화면 모드: open, 관리자 주소: /changeme)`
- [ ] `http://12.83.18.17:3000/api/health` → `{"ok":true,"store":"mssql",…}`
- ⚠ 인스턴스는 **반드시 1개**(설정 파일에 고정). cluster 모드나 `-i max`로 바꾸지 않는다 — 데이터를 메모리에 두고 DB에 저장하는 구조라 여러 개면 데이터가 어긋난다

### 6-3. 재부팅 후 자동 시작

- **Windows** (PM2 5.3.0의 `pm2 startup`은 Windows를 지원하지 않는다)
  ```powershell
  npm install -g pm2-windows-startup
  pm2-startup install
  pm2 save
  ```
  서비스로 돌려야 하면 pm2-installer를 쓴다
- **Linux**: `pm2 startup` → 출력된 명령을 그대로 실행 → `pm2 save`

---

## 7. 시연(test) → 정식 운영(open) 전환

### 7-1. (선택) 시연 운영

- `server/.env`의 `SERVICE_MODE=test` + 시연용 빌드(`VITE_INCLUDE_MOCK=true`)
- 화면에 '테스트 운영 중' 띠가 뜨고, **데이터는 각 사용자의 브라우저에만** 저장된다 (DB를 쓰지 않음). 실제 개인정보를 넣지 않는다
- 테스트 계정은 `client/src/api/mock/accounts.js` — 관리자 화면(`/changeme`)도 이 계정으로 들어간다
- 이 기간에 관리자 화면 '기준정보'(사업부·캠퍼스·취미 등)와 '설정'을 운영에 쓸 값으로 다듬는다

### 7-2. 기준정보 옮기기 (시연 → 운영)

시연 데이터는 브라우저에만 있으므로, 기준정보는 **파일로 옮긴다**.

1. 시연 화면에서 관리자 → **기준정보** → **[엑셀로 내보내기]** (기준정보를 다듬은 그 브라우저에서)
2. 정식 전환([7-3](#7-3-정식-운영으로-바꾸기)) 뒤 운영 관리자 화면 → **기준정보** → **[파일 가져오기]** → 바뀌는 내용(추가·수정·사용 안 함·삭제·설정)을 확인 → **[적용]**

규칙은 [8-2](#8-2-기준정보-일괄-변경)와 같다.

### 7-3. 정식 운영으로 바꾸기

- [ ] `client/.env.production`의 `VITE_INCLUDE_MOCK=false` → `client` 폴더에서 `npm run build`
- [ ] `server/.env`의 `SERVICE_MODE=open`
- [ ] `server` 폴더에서 `npm run check` (✖ 0) → `pm2 restart sayeon-api`
- [ ] 브라우저 Ctrl+F5 → 맨 위 '테스트 운영 중' 띠가 없어졌는지
- [ ] [7-2](#7-2-기준정보-옮기기-시연--운영) 기준정보 가져오기, '설정' 확인

### 7-4. 리허설 (실제 사내 계정, 사용자 PC에서)

- [ ] `http://12.83.18.17:3000` 접속 (안 되면 방화벽)
- [ ] 로그인 → 이름·사업부 정상, 퇴직·휴직 계정은 거절
- [ ] 신청서 작성 → 마이페이지에서 수정
- [ ] 계정 2개 이상으로 하트 보내기 → 수락 → 매칭 → 쪽지
- [ ] 인연 사주 → 하트 보내기 / 정식으로 신청하기
- [ ] 관리자 주소 → 대시보드·신청자 목록 → '열람 기록'에 남는지
- [ ] `pm2 restart sayeon-api` 뒤에도 데이터가 그대로인지 (로그인은 다시 해야 정상)

### 7-5. 리허설 데이터 지우기

- 신청자만 지우려면 관리자 화면 → 신청자 관리에서 삭제
- 처음 상태로 완전히 되돌리려면 (기준정보·설정·열람 기록까지 지워지고, 다음 시작 때 기본값으로 다시 만들어진다)
  1. `pm2 stop sayeon-api`
  2. DB에서 `DELETE FROM SAYEON.dbo.SA_DOC;`
  3. `pm2 start sayeon-api`
  4. [7-2](#7-2-기준정보-옮기기-시연--운영)의 기준정보 파일을 다시 가져온다

### 7-6. 오픈

- [ ] 사용자 접속 주소 공지 (관리자 주소는 공지하지 않는다)

---

## 8. 운영 중 바꿀 때 — IP·포트·DB·API·기준정보

### 8-1. 서버·연결 정보

화면 코드에는 서버 주소가 없다. **IP·포트·API 주소가 바뀌어도 화면을 다시 빌드할 필요가 없다.**

| 바꿀 것 | 고칠 곳 | 반영 |
|---|---|---|
| API 서버 IP (서버 이전) | 새 서버에서 1·2·4·5·6단계. 기존 `server/.env`와 `server/config/admins.js`, 라이선스 키 파일을 복사하고 `PUBLIC_URL`만 수정 (**`DATA_KEY`는 반드시 같은 값**) | `pm2 start ecosystem.config.cjs` |
| 접속 포트 | `.env`의 `PORT`·`PUBLIC_URL` + 방화벽 | `pm2 restart sayeon-api` |
| DB 서버 IP | `.env`의 `DB_HOST`(`DB_PORT`) + 기존 DB를 새 서버로 백업·복원 → `npm run db:setup` (끊긴 사용자 연결을 다시 잇는다) | `pm2 restart sayeon-api` |
| DB 계정·비밀번호 | `.env`의 `DB_USER`·`DB_PASSWORD` (새 계정이면 `npm run db:setup`) | `pm2 restart sayeon-api` |
| 사내 인증·인사 API 주소·키 | `.env`의 `AUTH_LOGIN_URL`·`SSO_VERIFY_URL`·`HR_*`·`SSO_API_KEY` | `pm2 restart sayeon-api` |
| 사내 API 요청·응답 형식 | `server/src/sso.js` ([4-2](#4-2-사내-로그인-sso--ad-연결)) | `pm2 restart sayeon-api` |
| 관리자 추가·삭제·비밀번호 | `server/config/admins.js` | 자동 (3초) |
| 관리자 주소 | `.env`의 `ADMIN_PATH` | `pm2 restart sayeon-api` |
| 도메인·https | 앞단 IIS·Nginx + `.env`의 `TRUST_PROXY=true`, `COOKIE_SECURE=true`, `PUBLIC_URL` | `pm2 restart sayeon-api` |
| 코드 업데이트 | `git pull` → `client`: `npm ci` → `npm run build` → `server`: `npm ci` → `npm run check` | `pm2 restart sayeon-api` |
| 되돌리기 | `git log`로 커밋 확인 → `git checkout <커밋>` → 위와 같이 | `pm2 restart sayeon-api` |

- `.env`를 고친 뒤에는 `npm run check`로 확인하고 재시작한다
- `pm2 restart`를 하면 접속 중인 사용자는 다시 로그인해야 한다(로그인 정보는 메모리에 있다). 사용이 적은 시간에 한다

### 8-2. 기준정보 일괄 변경

사업부 개편, 캠퍼스 추가, 취미 목록 정리처럼 기준정보를 한꺼번에 바꿀 때. 서버를 멈출 필요 없다.

1. 관리자 → **기준정보** → **[엑셀로 내보내기]** (또는 [JSON])
2. 엑셀의 **'기준정보'** 시트에서 고친다 — 한 줄이 한 항목 (그룹 · 그룹 이름 · 코드 · 표시 이름 · 순서 · 사용(Y/N) · 상위 코드 · 보조 값). **'설정'** 시트의 값도 고칠 수 있다
3. **[파일 가져오기]** → 미리보기에서 그룹별 추가·수정·사용 안 함·삭제와 설정 변경을 확인 → **[적용]**

| 규칙 | |
|---|---|
| 코드 값 | 바꾸지 않는다(신청서가 참조). 바꾸려면 새 코드로 줄을 추가하고 예전 줄은 지운다 |
| 파일에서 지운 줄 | 쓰는 신청서가 없으면 **삭제**, 있으면 **'사용 안 함'**(새 선택지에서만 숨김, 기존 신청서 표시는 유지) |
| 파일에 없는 그룹 | 바뀌지 않는다 — 한 그룹만 바꾸려면 다른 그룹 줄은 지워도 된다 |
| '설정' 시트 | 값 칸만 본다. 바꾸지 않으려면 시트를 지운다 |
| 검사 | 코드 형식(영문 대문자·숫자·_ 30자), 표시 이름 1~40자, 같은 코드 두 번, 사용(Y/N), 그룹마다 '사용' 항목 1개 이상, 설정 범위 — 하나라도 틀리면 **적용 버튼이 막히고** 몇 행이 틀렸는지 보여준다 |
| 기록 | 적용하면 '열람 기록'에 "기준정보 일괄 변경 · 추가 n · 수정 n …"이 남는다 |

---

## 9. 백업과 보안

- [ ] **DB 정기 백업** — 모든 데이터가 `SAYEON.dbo.SA_DOC` 한 테이블에 있다
- [ ] **`DATA_KEY` 따로 보관** — DB 백업만으로는 이름·메일을 읽을 수 없다. 키를 DB 백업과 다른 곳에 둔다
- [ ] **`server/.env`, `server/config/admins.js`, 라이선스 키 파일 백업** — git에 없으므로 서버가 망가지면 같이 사라진다
- [ ] DB 계정은 전용 계정(`sayeon_app`, 읽기·쓰기만) — `npm run check`가 sysadmin 계정 사용을 ⚠로 알려 준다
- [ ] `.env`에 `DB_ADMIN_USER`·`DB_ADMIN_PASSWORD`가 남아 있지 않은지
- [ ] 관리자 비밀번호는 해시 방식
- [ ] 정식 운영 빌드는 `VITE_INCLUDE_MOCK=false`
- [ ] 3000번 포트는 사내망에서만 (`header` 모드면 프록시 서버에서만)
- 이미 들어 있는 보호: 같은 PC·계정 10분 안에 10번 로그인 실패 시 10분 차단 · 로그인할 때 세션 새로 발급 · 관리자 비밀번호 5회 실패 시 10분 잠금 · 관리자 열람 기록 · 이름·메일 암호화 저장

---

## 10. `npm run check` 읽는 법과 문제 해결

### 10-1. 점검 항목

| 구역 | 확인하는 것 |
|---|---|
| 1 실행 환경 | Node.js 22.12.0 · npm 10.9.0 · PM2 5.3.0, 설치 경로·전역 npm 폴더의 한글 여부 |
| 2 `server/.env` | 파일 유무, 오타 난 항목 이름, 포트·주소 형식, `PUBLIC_URL`과 `PORT`·`COOKIE_SECURE`가 맞는지, `SERVICE_MODE`·`ADMIN_PATH`(사용자 주소와 겹침), `SESSION_SECRET`·`DATA_KEY` 형식, 남아 있는 관리 계정 |
| 3 패키지 | `server`·`client`의 `npm ci` 여부 (서버가 쓰는 client 라이브러리 포함) |
| 4 화면 빌드 | 빌드 유무, 빌드 뒤 코드가 바뀌었는지, 시연용/정식용 빌드가 `SERVICE_MODE`와 맞는지, 라이선스 키 포함 여부 |
| 5 포트 | 비어 있는지 / 사緣 서버가 이미 쓰는지 / 다른 프로그램이 쓰는지 |
| 6 DB | ① 네트워크(1433 열림) ② 로그인 ③ DB 유무·생성 권한 ④ 테이블 유무·구조·생성 권한 ⑤ 읽기·추가·수정·삭제 권한 ⑥ `DATA_KEY`가 저장된 데이터를 풀 수 있는지 |
| 7 관리자 | `admins.js` 유무·문법, 계정 수, 비밀번호 해시 형식 |
| 8 사내 로그인 | `SSO_MODE`별 필수 값, 로그인 방법 연결 여부, 사내 API 주소 형식·연결 가능 여부 |

- ✔ 정상 · ⚠ 지금 막히지는 않지만 운영 전에 정리 권장 · ✖ 이대로는 동작하지 않음 — ✖가 있으면 종료 코드 1
- 모든 ⚠·✖ 아래에 **원인**과 **해결**이 함께 나온다. 비밀번호·키 값은 출력하지 않는다
- 옵션: `npm run check -- --skip-db` (DB 건너뛰기), `--skip-net` (사내 API 연결 시험 건너뛰기)

### 10-2. 자주 나오는 문제

| 증상 | 원인 · 해결 |
|---|---|
| 명령을 실행하자마자 아무 메시지 없이 꺼짐 | Node.js 22.12 + 한글 경로 → 영문 경로(`C:\apps\sa`)로 옮기기. 최신 코드는 이 상황을 먼저 알려 준다 |
| "DB 서버에 연결하지 못했어요 (시간 초과)" | 방화벽(12.83.18.17 → 10.166.101.127:1433) 또는 주소·포트. `Test-NetConnection 10.166.101.127 -Port 1433` |
| "DB 서버가 연결을 거부했어요" | SQL Server 서비스·TCP/IP 사용·포트 확인 (SQL Server 구성 관리자) |
| "DB 로그인 실패" | 계정·비밀번호 / SQL 인증 꺼짐 / 계정 없음 → DB 서버 오류 로그 State 번호(5 계정 없음 · 8 비밀번호 · 58 SQL 인증 꺼짐), `npm run db:setup` |
| "데이터베이스를 열 수 없어요" | DB가 없거나 계정이 DB 사용자로 등록되지 않음 → `npm run db:setup` |
| "DATA_KEY가 … 달라요" | 처음 쓰던 `DATA_KEY`를 그대로 넣기 (바꾸면 안 된다) |
| "화면 빌드(client/dist)가 없어요" | `client`에서 `npm run build`. 위치를 바꿨다면 `.env`의 `CLIENT_DIST` |
| 로그인하자마자 다시 로그인 화면 | http인데 `COOKIE_SECURE=true` → `false` |
| "사내 계정 로그인이 아직 연결되지 않았어요" | `.env`의 `AUTH_LOGIN_URL`이 비어 있음 |
| "사내 인증 서버에 연결하지 못했어요" | API 주소·방화벽·API 키 확인, `pm2 logs sayeon-api`의 `[sso]` 줄 |
| 비밀번호가 맞는데 계속 실패 | 응답에서 사번을 못 찾음 → `SSO_RESULT_PATH`, `FIELD.empNo` |
| "로그인을 여러 번 실패했어요" | 같은 PC·계정 10회 실패 → 10분 뒤 (급하면 `pm2 restart sayeon-api`) |
| SSO 자동 로그인이 안 됨 | `header`: `SSO_PROXY_SECRET`이 프록시 값과 같은지 / `api`: IP가 아닌 사내 도메인으로 접속했는지 |
| PM2가 계속 다시 시작하다 멈춤 | 시작 실패 — `pm2 logs sayeon-api --lines 50`의 "원인/해결", 고친 뒤 `pm2 restart sayeon-api` |
| 재시작 후 모두 로그아웃 | 정상 (로그인 정보는 메모리). `SESSION_SECRET`이 비어 있으면 켤 때마다 바뀌므로 꼭 채운다 |
| 화면 맨 위 평가판 배너 | [5-2](#5-2-devextreme-라이선스) 라이선스 키 파일 → 다시 빌드 |
| 화면이 예전 그대로 | 다시 빌드했는지 확인 후 Ctrl+F5 |
| 기준정보 가져오기에서 적용 버튼이 막힘 | 미리보기의 "고쳐야 할 곳" 목록(몇 행·무엇)을 고쳐 다시 올리기 |
