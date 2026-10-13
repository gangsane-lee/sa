# 사緣 운영 전환 체크리스트

시연(test 모드)에서 실제 서비스(open)로 넘어가기 전에 **위에서부터 순서대로** 진행한다. 끝낸 항목은 `[ ]`를 `[x]`로 바꿔 둔다.

- API 서버: `12.83.18.17` (Node.js + PM2, 포트 3000)
- DB 서버: `10.101.107.127` (MSSQL, 포트 1433)
- 설정 파일 위치는 [README의 '고칠 곳 한눈에'](../README.md#-고칠-곳-한눈에), 구조는 [DESIGN.md](DESIGN.md)

| 단계 | 할 일 | 어디서 |
|---|---|---|
| [0](#0-사전-협조-요청--가장-먼저) | 방화벽·DB 계정·사내 인증 API 정보 요청 | 메일 / 담당 부서 |
| [1](#1-api-서버-기본-설치) | Node.js · git · PM2 설치 | API 서버 |
| [2](#2-코드-받기) | 코드 받기 | API 서버 |
| [3](#3-devextreme-라이선스-등록) | DevExtreme 라이선스 등록 | API 서버(빌드하는 PC) |
| [4](#4-패키지-설치와-화면-빌드) | 패키지 설치 · 화면 빌드 | API 서버 |
| [5](#5-db-준비) | DB 준비 · 연결 확인 | DB 서버 / API 서버 |
| [6](#6-serverenv-작성) | `server/.env` 작성 (IP·포트·DB·키) | API 서버 |
| [7](#7-사내-sso--ad-연결) | 사내 SSO·AD API 연결 | `.env` + `server/src/sso.js` |
| [8](#8-관리자-계정) | 관리자 계정·비밀번호 | `server/config/admins.js` |
| [9](#9-점검) | `npm run check` | API 서버 |
| [10](#10-pm2로-시작--재부팅-자동-시작) | PM2 시작 · 재부팅 자동 시작 | API 서버 |
| [11](#11-오픈-전-리허설) | 리허설 (실제 계정으로 전체 흐름) | 사용자 PC |
| [12](#12-정식-오픈-전환) | 정식 오픈 전환 | API 서버 |
| [13](#13-오픈-후-바꿀-때--ip포트api-변경) | 오픈 후 IP·포트·API 바꾸는 법 | — |
| [14](#14-백업과-보안-점검) | 백업·보안 점검 | — |
| [15](#15-문제-해결) | 문제 해결 | — |

---

## 0. 사전 협조 요청 — 가장 먼저

처리에 며칠 걸리는 일들이라 먼저 요청해 둔다.

**인프라(방화벽)**
- [ ] 사용자 PC(DS부문 사내망) → `12.83.18.17:3000` TCP 허용
- [ ] `12.83.18.17` → `10.101.107.127:1433` TCP 허용 (DB는 API 서버에서만 열면 된다)
- [ ] `12.83.18.17` → 사내 인증·인사 API 서버 (받은 URL의 호스트·포트)
- [ ] (선택) `12.83.18.17` → `github.com:443` 또는 사내 npm 미러 — 막혀 있으면 [2단계](#2-코드-받기)의 반입 방법을 쓴다

**DB 담당**
- [ ] SQL Server 인증(혼합 모드)과 TCP/IP(1433)가 켜져 있는지
- [ ] 사緣 전용 DB 계정 발급 (권장 — [5단계](#5-db-준비) 참고)

**사내 인증(SSO/AD) 담당** — 아래를 받아 둔다. 특히 **실제 응답 JSON 예시**가 있어야 [7단계](#7-사내-sso--ad-연결)를 한 번에 끝낼 수 있다.

| 받을 정보 | 넣을 곳 |
|---|---|
| ID/비밀번호 확인 API 주소 · 요청 형식(필드 이름) · 응답 예시 | `.env`의 `AUTH_LOGIN_URL`, `sso.js` |
| SSO 방식: ① 앞단이 사용자 ID를 헤더로 넘김 ② 토큰 쿠키를 확인 API로 검증 | `.env`의 `SSO_MODE` 외 |
| 인사정보 조회 API(사번 → 이름·성별·사업부·팀·재직 상태) | `HR_LOOKUP_URL` |
| 임직원 검색 API (관리자 블랙리스트 등록용, 선택) | `HR_SEARCH_URL` |
| API 키와 키를 넣는 헤더 이름 | `SSO_API_KEY`, `SSO_API_KEY_HEADER` |

**개인정보·보안 담당**
- [ ] 화면의 '개인정보 처리 안내'와 신청서 동의 문구 검토 요청

---

## 1. API 서버 기본 설치

`12.83.18.17`에서:

- [ ] **Node.js 22.12 이상** (권장: 24 LTS — 개발·점검에 쓴 버전은 24.15)
- [ ] **git** (없으면 zip 반입으로 대신할 수 있다)
- [ ] **PM2**

```bash
node -v
```

```bash
npm install -g pm2
```

- 사내 npm 미러를 써야 하면 먼저 `npm config set registry <사내 미러 주소>`
- Windows PowerShell에서 `pm2`가 "스크립트 실행 안 됨" 오류로 막히면 `pm2.cmd`로 실행한다

## 2. 코드 받기

```bash
git clone https://github.com/gangsane-lee/sa.git
```

- 비공개 저장소라 GitHub 로그인(개인 액세스 토큰)이 필요하다
- 사내망에서 GitHub가 막혀 있으면 밖의 PC에서 받은 폴더(또는 GitHub의 Code → Download ZIP)를 반입한다
- ⚠ **`server` 폴더만 따로 옮기면 안 된다.** 서버가 `client/src`의 업무 규칙 코드와 `client/node_modules`(사주 계산 라이브러리)를 함께 쓰므로 `sa` 폴더 구조 그대로 둔다

## 3. DevExtreme 라이선스 등록

등록하지 않으면 화면 맨 위에 평가판 배너가 뜬다. **빌드하기 전에** 한다.

- [ ] [README의 'DevExtreme 라이선스 등록'](../README.md#devextreme-라이선스-등록-직접-해야-함) 1~4번 진행 (키 파일은 커밋하지 않는다)

## 4. 패키지 설치와 화면 빌드

```bash
cd sa/client
npm install
npm run build
```

```bash
cd ../server
npm install
```

- [ ] `client/dist/index.html`이 생겼는지 확인
- 이 빌드는 **시연용**이다(테스트 계정·가짜 데이터 코드 포함). 정식 오픈 빌드는 [12단계](#12-정식-오픈-전환)에서 다시 한다
- 인터넷이 안 되면 밖에서 `npm install`·`npm run build`까지 끝낸 폴더를 통째로 반입한다 (`client/node_modules`, `client/dist`, `server/node_modules` 포함, 같은 OS에서 설치할 것)

## 5. DB 준비

**방법 A — 빠른 시작:** `sa` 계정 그대로 `.env`에 넣고 `DB_AUTO_CREATE=true`. 서버를 처음 켤 때 DB `SAYEON`과 테이블 `SA_DOC`을 알아서 만든다.

**방법 B — 권장(전용 계정):** `sa`는 SQL Server 최고 관리자 계정이라, 사緣 DB만 다루는 계정을 만들어 쓴다. DB 서버에서 (SSMS 등):

```sql
CREATE DATABASE SAYEON;
GO
CREATE LOGIN sayeon_app WITH PASSWORD = N'여기에 새 비밀번호', CHECK_POLICY = ON;
GO
USE SAYEON;
CREATE USER sayeon_app FOR LOGIN sayeon_app;
ALTER ROLE db_datareader ADD MEMBER sayeon_app;
ALTER ROLE db_datawriter ADD MEMBER sayeon_app;
ALTER ROLE db_ddladmin  ADD MEMBER sayeon_app; -- 처음 테이블 만들 때 필요. SA_DOC 생성 후 빼도 된다
GO
```

그다음 `.env`에 `DB_USER=sayeon_app`, `DB_PASSWORD=새 비밀번호`, `DB_AUTO_CREATE=false`.

**연결 확인** (API 서버에서):

```powershell
Test-NetConnection 10.101.107.127 -Port 1433
```

(Linux: `nc -zv 10.101.107.127 1433`) — 실패하면 [0단계](#0-사전-협조-요청--가장-먼저) 방화벽 요청부터 확인.

## 6. `server/.env` 작성

`server` 폴더에서 `.env.example`을 `.env`로 복사한 뒤 채운다. 각 항목 설명은 `.env.example`에 있다.

> 작업 PC의 `sa-source/server/.env`에는 두 서버 주소, DB 계정, 세션 키, 암호화 키가 이미 채워져 있다. 이 파일은 git에 올라가지 않으므로, 안전한 경로로 서버에 복사해서 써도 된다.

| 항목 | 넣을 값 | 비고 |
|---|---|---|
| `PORT` | `3000` | 바꾸면 방화벽도 같이 |
| `PUBLIC_URL` | `http://12.83.18.17:3000` | 로그·안내용 |
| `SERVICE_MODE` | 시연 `test` / 오픈 `open` | [12단계](#12-정식-오픈-전환)에서 `open`으로 |
| `ADMIN_PATH` | `/admin` | 남이 짐작하기 어려운 주소로 바꾸는 것을 권장 |
| `SESSION_SECRET` | 긴 무작위 문자열 | 비워 두면 `npm run check`가 예시 값을 만들어 준다 |
| `COOKIE_SECURE` | `false` | https로 접속할 때만 `true` (http에서 `true`면 로그인이 바로 풀린다) |
| `TRUST_PROXY` | `false` | 앞단에 IIS·Nginx가 있으면 `true` |
| `STORE` | `mssql` | |
| `DB_HOST` / `DB_PORT` | `10.101.107.127` / `1433` | |
| `DB_NAME` | `SAYEON` | 영문·숫자·`_`만 |
| `DB_USER` / `DB_PASSWORD` | [5단계](#5-db-준비)의 계정 | |
| `DB_ENCRYPT` / `DB_TRUST_CERT` | `false` / `true` | DB가 TLS를 요구하면 `DB_ENCRYPT=true` |
| `DB_AUTO_CREATE` | 방법 A `true` / 방법 B `false` | |
| `DATA_KEY` | base64 32바이트 | ⚠ **한 번 정하면 절대 바꾸지 않는다.** 잃어버리면 DB의 이름·메일을 복구할 수 없다 |
| `SSO_*`, `AUTH_LOGIN_URL`, `HR_*` | | [7단계](#7-사내-sso--ad-연결) |

## 7. 사내 SSO / AD 연결

손댈 곳은 `server/.env`와 `server/src/sso.js` 두 군데뿐이다.

### 7-1. 연결 방식 고르기 (`SSO_MODE`)

| 사내 환경 | `SSO_MODE` | 채울 값 |
|---|---|---|
| 앞단(IIS·웹서버 SSO 에이전트)이 로그인한 사용자 ID를 헤더로 넘겨 준다 | `header` | `SSO_HEADER`, `SSO_PROXY_SECRET`, `SSO_PROXY_SECRET_HEADER`, `HR_LOOKUP_URL` |
| 브라우저에 사내 SSO 토큰 쿠키가 있고, 토큰 확인 API가 있다 | `api` | `SSO_TOKEN_COOKIE`, `SSO_VERIFY_URL` |
| SSO 없이 ID/비밀번호만 | `off` | (아래 `AUTH_LOGIN_URL`만) |

- **로그인 화면(ID/비밀번호)은 모드와 상관없이 `AUTH_LOGIN_URL`로 확인한다.** SSO 자동 로그인이 안 되면 이 화면으로 넘어가므로 `AUTH_LOGIN_URL`은 꼭 채운다
- ⚠ `header` 모드: 앞단 프록시가 사용자 ID 헤더와 함께 **비밀값 헤더(`SSO_PROXY_SECRET`과 같은 값)** 를 붙여야 한다. 비밀값이 비어 있거나 다르면 아무도 통과시키지 않는다. 3000번 포트는 프록시 서버에서만 접근하도록 방화벽을 제한하는 것을 권장한다
- ⚠ `api` 모드: 브라우저는 쿠키를 같은 도메인으로만 보낸다. `http://12.83.18.17:3000`처럼 **IP로 접속하면 사내 도메인의 SSO 쿠키가 오지 않는다** → 사내 DNS 이름(예: `sayeon.사내도메인`)을 받아 그 주소로 접속해야 한다

### 7-2. 요청 형식 맞추기 (`server/src/sso.js`)

| 호출 | 지금 보내는 형식 | 다르면 고칠 곳 |
|---|---|---|
| 로그인 (`AUTH_LOGIN_URL`) | `POST` JSON `{ "userId": "...", "password": "..." }` | `directory.authenticate()` 안의 `body` |
| SSO 토큰 확인 (`SSO_VERIFY_URL`) | `POST` JSON `{ "token": "..." }` | `directory.identify()`의 `api` 부분 |
| 인사 조회 (`HR_LOOKUP_URL`) | `GET` — 주소의 `{empNo}` 자리에 사번·계정 | `.env` 주소만 |
| 임직원 검색 (`HR_SEARCH_URL`) | `GET` — 주소의 `{q}` 자리에 검색어, 배열 응답 | `.env` 주소만 |
| API 키 | `SSO_API_KEY_HEADER: SSO_API_KEY` 헤더 | `.env` |

- 응답이 401·403·404면 "계정 없음/비밀번호 틀림"으로, 그 밖의 오류나 연결 실패는 "사내 인증 서버에 연결하지 못했어요"(503)로 처리한다
- form 전송(`application/x-www-form-urlencoded`) 등 형식이 많이 다르면 `callApi()`를 고친다

### 7-3. 응답 맞추기 (`server/src/sso.js` 위쪽)

- [ ] **`SSO_RESULT_PATH`**(.env): 사용자 정보가 응답 안쪽에 있으면 그 위치. 예: `{ "result": { "user": { … } } }` → `SSO_RESULT_PATH=result.user`
- [ ] **`FIELD`**: 항목별 필드 이름 후보. 사내 응답의 필드 이름을 목록에 추가한다 (`'org.deptName'`처럼 점으로 안쪽 값도 가능)
  - **사번(`empNo`)은 필수** — 못 찾으면 로그인이 실패한다
  - 이름·성별·사업부·팀·메일·재직 상태는 있으면 쓴다
- [ ] **`DIVISION_MAP`**: 사내 사업부 이름 → 사緣 코드(`MEMORY`·`LSI`·`FOUNDRY`·`COMMON`). 조직 개편 시 여기에 추가
- [ ] **`INACTIVE`**: '재직 아님'으로 볼 상태 값 (퇴직·휴직 등). 해당하면 로그인을 막는다
- 성별 값은 `M/F`, `남/여`, `1/2`, `MALE/FEMALE`을 알아서 바꾼다

예를 들어 사내 응답이 `{ "data": { "SABUN": "12345678", "USER_NM": "홍길동", "BIZ_NM": "메모리사업부" } }`라면:

```js
// .env:  SSO_RESULT_PATH=data
const FIELD = {
  empNo: ['empNo', 'employeeNo', 'EMP_NO', 'sabun', 'SABUN'],   // ← SABUN 추가
  name: ['name', 'userName', 'displayName', 'EMP_NM', 'USER_NM'], // ← USER_NM 추가
  division: ['division', 'divisionName', 'bizUnit', 'DIVISION_NM', 'BIZ_NM'],
  // …
};
```

### 7-4. 확인

- [ ] 본인 계정으로 로그인 → 화면 위쪽에 이름이 맞게 나오는지
- [ ] 문제가 있으면 `pm2 logs sayeon-api`에서 `[sso]`로 시작하는 줄 확인
- [ ] 비밀번호가 맞는데도 "사내 계정 또는 비밀번호가 맞지 않아요"가 나오면 → 응답은 왔지만 사번을 못 찾은 것. `SSO_RESULT_PATH`와 `FIELD.empNo`를 다시 본다

## 8. 관리자 계정

`server/config` 폴더에서 `admins.example.js`를 `admins.js`로 복사해 채운다. (작업 PC의 `sa-source/server/config/admins.js`에는 임시 관리자 비밀번호가 이미 들어 있고, `accounts`만 비어 있다.)

- [ ] `accounts`에 매칭 담당자의 **사번(`empNo`) 또는 사내 계정 ID(`adId`)** 입력 — 둘 중 하나만 맞아도 관리자
- [ ] 관리자 비밀번호를 해시 방식으로 바꾸기 — `server` 폴더에서 아래 명령 → 출력값을 `passwordHash`에 붙여 넣고 `password`는 비운다

```bash
npm run hash-password -- "새 관리자 비밀번호"
```

- 파일을 저장하면 서버를 다시 켜지 않아도 3초 안에 반영된다
- 관리자 진입: `http://12.83.18.17:3000/admin` → 사내 계정 확인 → `accounts`에 있는지 확인 → 관리자 비밀번호 (5번 틀리면 10분 잠금, 30분 동안 아무 동작이 없으면 자동 종료)

## 9. 점검

`server` 폴더에서:

```bash
npm run check
```

- [ ] `[1] 서버 설정` — `SESSION_SECRET`·`DATA_KEY` 설정됨, 로그인 방법 연결됨
- [ ] `[2] DB 연결` — DB 서버 연결 성공
- [ ] `[3] 화면 빌드` — 있음
- [ ] `[4] 관리자 계정` — 계정 1개 이상, 해시 방식
- [ ] 마지막 줄이 **"점검 결과: 시작할 준비가 됐어요."**

## 10. PM2로 시작 · 재부팅 자동 시작

```bash
pm2 start ecosystem.config.cjs
```

```bash
pm2 save
```

- [ ] `pm2 logs sayeon-api`에 `[server] 사緣 서버 시작 · http://12.83.18.17:3000 (저장소: mssql, …)`이 나오는지
- [ ] 처음 시작이면 `[store] 데이터베이스를 만들었어요: SAYEON`(방법 A일 때)
- [ ] **재부팅 후 자동 시작**
  - Linux: `pm2 startup` → 출력된 명령을 그대로 실행 → `pm2 save`
  - Windows: `npm install -g pm2-windows-startup` → `pm2-startup install` → `pm2 save` (서비스로 돌리려면 pm2-installer)
- ⚠ 인스턴스는 **반드시 1개**(설정 파일에 고정). cluster 모드나 `-i max`로 바꾸지 않는다 — 데이터를 메모리에 두고 DB에 저장하는 구조라 여러 개면 데이터가 어긋난다

## 11. 오픈 전 리허설

`SERVICE_MODE=open` 상태에서 실제 사내 계정으로 확인한다 (사용자 PC에서 접속).

- [ ] `http://12.83.18.17:3000/api/health` → `{"ok":true,"store":"mssql",…}`
- [ ] 사용자 PC에서 `http://12.83.18.17:3000` 접속 (안 되면 방화벽)
- [ ] 로그인 → 이름·사업부 정상, 퇴직·휴직 계정은 거절
- [ ] 신청서 작성 → 마이페이지에서 수정
- [ ] 계정 2개 이상으로 하트 보내기 → 수락 → 매칭 → 쪽지 주고받기
- [ ] 인연 사주 → 하트 보내기 / 정식으로 신청하기
- [ ] 관리자 주소 진입 → 대시보드·신청자 목록 → '열람 기록'에 남는지
- [ ] `pm2 restart sayeon-api` 후에도 신청 데이터가 그대로인지 (로그인은 다시 해야 정상)
- [ ] **리허설 데이터 지우기** — 관리자 화면에서 신청자 삭제. 완전히 처음 상태로 돌리려면:
  1. `pm2 stop sayeon-api`
  2. DB에서 `DELETE FROM SAYEON.dbo.SA_DOC;` (기준정보·설정·열람 기록까지 모두 지워지고, 다음 시작 때 기본값으로 다시 만들어진다)
  3. `pm2 start sayeon-api`

## 12. 정식 오픈 전환

- [ ] **테스트 코드를 뺀 빌드**: `client/.env.production`에서 `VITE_INCLUDE_MOCK=false`로 바꾸고 `client` 폴더에서 `npm run build` (테스트 계정·가짜 데이터가 화면 코드에서 완전히 빠진다)
- [ ] `server/.env`의 `SERVICE_MODE=open` 확인
- [ ] `pm2 restart sayeon-api`
- [ ] 브라우저에서 Ctrl+F5 → 맨 위 '테스트 운영 중' 띠가 없어졌는지
- [ ] 관리자 화면 '기준정보'(사업부·캠퍼스 등)와 '설정' 최종 확인
- [ ] 접속 주소 공지 (관리자 주소는 공지하지 않는다)

> test 모드에서 입력한 데이터는 각 사용자 브라우저에만 있었기 때문에 DB로 넘어오지 않는다. 오픈 후에는 처음부터 다시 신청한다.

## 13. 오픈 후 바꿀 때 — IP·포트·API 변경

화면(브라우저 코드)에는 서버 주소가 들어 있지 않다(`/api`를 같은 주소로 부른다). 그래서 **IP·포트·API 주소가 바뀌어도 화면을 다시 빌드할 필요가 없다.**

| 바꿀 것 | 고칠 곳 | 반영 |
|---|---|---|
| API 서버 IP (서버 이전) | 새 서버에서 1~10단계 반복. 기존 `server/.env`와 `server/config/admins.js`를 그대로 복사하고 `PUBLIC_URL`만 수정 (**`DATA_KEY`는 반드시 같은 값**) | `pm2 start ecosystem.config.cjs` |
| 접속 포트 | `.env`의 `PORT`·`PUBLIC_URL` + 방화벽 | `pm2 restart sayeon-api` |
| DB 서버 IP | `.env`의 `DB_HOST`(`DB_PORT`) + 기존 DB의 `SA_DOC`을 새 DB로 이관(백업·복원) | `pm2 restart sayeon-api` |
| DB 계정·비밀번호 | `.env`의 `DB_USER`·`DB_PASSWORD` | `pm2 restart sayeon-api` |
| 사내 인증·인사 API 주소·키 | `.env`의 `AUTH_LOGIN_URL`·`SSO_VERIFY_URL`·`HR_*`·`SSO_API_KEY` | `pm2 restart sayeon-api` |
| 사내 API 요청·응답 형식 | `server/src/sso.js` ([7단계](#7-사내-sso--ad-연결)) | `pm2 restart sayeon-api` |
| SSO 방식 | `.env`의 `SSO_MODE` 외 | `pm2 restart sayeon-api` |
| 관리자 추가·삭제·비밀번호 | `server/config/admins.js` | 자동 (3초) |
| 관리자 주소 | `.env`의 `ADMIN_PATH` | `pm2 restart sayeon-api` |
| 도메인·https 적용 | 앞단 IIS·Nginx 설정 + `.env`의 `TRUST_PROXY=true`, `COOKIE_SECURE=true`, `PUBLIC_URL` | `pm2 restart sayeon-api` |
| 코드 업데이트 | `git pull` → `client`: `npm install` → `npm run build` → `server`: `npm install` | `pm2 restart sayeon-api` |
| 되돌리기 | `git log`로 커밋 확인 → `git checkout <커밋>` → 위와 같이 빌드 | `pm2 restart sayeon-api` |

- `pm2 restart`를 하면 접속 중인 사용자는 다시 로그인해야 한다(로그인 정보는 메모리에 있다). 사용이 적은 시간에 한다
- `.env`를 고친 뒤에는 `npm run check`로 한 번 확인하고 재시작한다

## 14. 백업과 보안 점검

- [ ] **DB 정기 백업** — 모든 데이터가 `SAYEON.dbo.SA_DOC` 한 테이블에 있다
- [ ] **`DATA_KEY` 따로 보관** — DB 백업만으로는 이름·메일을 읽을 수 없다. 키를 DB 백업과 다른 곳에 안전하게 둔다
- [ ] **`server/.env`, `server/config/admins.js` 백업** — git에 없으므로 서버가 망가지면 같이 사라진다
- [ ] DB 계정을 `sa`에서 전용 계정으로 ([5단계](#5-db-준비) 방법 B)
- [ ] 관리자 비밀번호 해시 방식 ([8단계](#8-관리자-계정))
- [ ] `ADMIN_PATH`를 짐작하기 어려운 주소로
- [ ] 정식 오픈 빌드에 `VITE_INCLUDE_MOCK=false` ([12단계](#12-정식-오픈-전환))
- [ ] 3000번 포트는 사내망에서만 (`header` 모드면 프록시 서버에서만)
- 이미 들어 있는 보호: 같은 PC·계정으로 10분 안에 10번 로그인 실패하면 10분 차단, 로그인할 때 세션 새로 발급, 관리자 비밀번호 5회 실패 시 10분 잠금, 관리자 열람 기록, 이름·메일 암호화 저장

## 15. 문제 해결

| 증상 | 원인 · 조치 |
|---|---|
| "화면 빌드(client/dist)가 없어요" | `client`에서 `npm run build`. 위치를 바꿨다면 `.env`의 `CLIENT_DIST` |
| 로그인하자마자 다시 로그인 화면 | http로 접속하는데 `COOKIE_SECURE=true` → `false` |
| "사내 계정 로그인이 아직 연결되지 않았어요" | `.env`의 `AUTH_LOGIN_URL`이 비어 있음 |
| "사내 인증 서버에 연결하지 못했어요" | API 주소·방화벽·API 키 확인. `pm2 logs sayeon-api`의 `[sso]` 줄 |
| 비밀번호가 맞는데 계속 실패 | 응답에서 사번을 못 찾음 → `SSO_RESULT_PATH`, `FIELD.empNo` ([7-3](#7-3-응답-맞추기-serversrcssojs-위쪽)) |
| "로그인을 여러 번 실패했어요" | 같은 PC·계정 10회 실패 → 10분 뒤 다시 시도 (급하면 `pm2 restart sayeon-api`) |
| SSO 자동 로그인이 안 됨 | `header`: `SSO_PROXY_SECRET`이 프록시 값과 같은지 / `api`: IP가 아닌 사내 도메인으로 접속했는지 |
| 서버가 켜지자마자 꺼짐 | `pm2 logs sayeon-api` — 대부분 DB 연결(`npm run check`로 확인) 또는 `.env` 오타 |
| "DB_NAME에는 영문·숫자·_만…" | `DB_NAME` 수정 |
| 재시작 후 모두 로그아웃 | 정상 (로그인 정보는 메모리). `SESSION_SECRET`이 비어 있으면 켤 때마다 바뀌므로 꼭 채운다 |
| 화면 맨 위 평가판 배너 | [3단계](#3-devextreme-라이선스-등록) 라이선스 등록 후 다시 빌드 |
| 화면이 예전 그대로 | 다시 빌드했는지 확인 후 Ctrl+F5 |
