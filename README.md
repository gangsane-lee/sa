# 사緣 (사연) · 사내 인연 매칭

삼성전자 DS부문 임직원 전용 비공개 소개팅 매칭 시스템.

| 문서 | 내용 |
|---|---|
| **[docs/GO-LIVE.md](docs/GO-LIVE.md)** | **운영 가이드** — 서버 구성 · 확인 요청 목록 · 최초 배포(단계별 확인) · 기능 추가 배포 · 운영 중 변경 · 사내 로그인 · 점검 명령 읽는 법. 배포 절차는 이 문서에만 있다 |
| [docs/DESIGN.md](docs/DESIGN.md) | 설계서 — 화면 · 데이터 · API · 매칭 규칙 · 보안 |

```
servers.config.mjs  ★ 서버 기준정보(마스터) — Web·API·DB·개발 서버 주소, 포트, DB 이름, 관리자 주소, 로그인 방식
client/   화면 (Vue 3 + DevExtreme) + 업무 규칙(client/src/api/core/service.js — 서버와 함께 씀)
server/   API 서버 (Node.js + Express + MSSQL, PM2 내장)
tools/    기준정보 읽기(topology.mjs) · 배포 패키지 만들기(release.mjs)
docs/     운영 가이드 · 설계서
```

## 운영 한눈에

| 역할 | 주소 (`servers.config.mjs`) | 하는 일 |
|---|---|---|
| 개발 서버 (인터넷 됨) | `12.123.321.13` | 개발·시험, 빌드와 배포 패키지 만들기 |
| Web 배포 운영 서버 | `10.123.321.12:8282` | IIS — 화면 · Windows 인증(AD SSO) · `/api` 를 API 서버로 |
| API 배포 운영/개발 서버 | `12.83.18.17:8292` (개발 `:8293`) | Node.js + PM2 — AD 조회 · 사내 인사 API · DB |
| DB 서버 | `10.166.101.127` | MSSQL `sasystem` (개발 `sasystem_dev`) |

지금 IP 는 가짜다(`321` 은 IP 로 쓸 수 없음 — 서버·빌드·점검이 막는다). 운영 표준: Node.js **22.12.0** · npm **10.9.0** · PM2 **5.3.0**(서버 패키지에 포함). 설치 경로는 **영문만**(예: `C:\apps\sa`).

```powershell
# 개발 서버 — 배포 패키지 만들기 (빌드 · 패키지 · 패키지 점검)
cd C:\apps\sa\server
npm run release

# API 서버 — 백업 → 교체 → 점검 → 시작 → 상태 확인 (실패하면 자동으로 되돌림)
powershell -ExecutionPolicy Bypass -File <패키지>\api\_deploy\deploy-api.ps1

# Web 서버 — 백업 → 교체 → IIS·파일·연결·로그인 점검
powershell -ExecutionPolicy Bypass -File <패키지>\web\_deploy\deploy-web.ps1 -SitePath D:\sites\sayeon

# API 서버에서 따로 돌리는 점검
npm run check                          # 서버 기준정보 · .env · DB · 관리자 · 사내 로그인
npm run db:setup                       # DB · 앱 계정 · 권한 · 테이블 (여러 번 실행해도 안전)
npm run sso:test -- --user 회사아이디   # AD 조회 → 사내 인사 API → 사緣에 들어올 정보
```

## ★ 고칠 곳 한눈에

| 바꾸고 싶은 것 | 파일 |
|---|---|
| 서버 IP·포트, DB 서버·이름, 관리자 주소, 정식/시연, 사내 로그인 방식·인사 API | **`servers.config.mjs`** (개발 서버에서 고쳐 커밋 → `npm run release` → 배포) |
| DB 계정·비밀번호, 세션·암호화 키, 인사 API 키 | API 서버 **`server/.env`** (설명: `server/.env.example`) |
| 관리자 계정(사번·사내 계정 ID)과 관리자 비밀번호 | API 서버 **`server/config/admins.js`** (예시: `admins.example.js`) — 고치면 3초 안에 반영 |
| AD·인사 API 응답 필드 이름, 사업부 이름 → 코드 | `server/src/sso.js` 의 `FIELD`·`DIVISION_MAP` |
| DB 준비 (DB 담당자가 직접 할 때) | `server/sql/setup.sql` |
| 사업부·캠퍼스 등 기준정보·설정 | 관리자 화면 '기준정보' — 한 건씩 또는 **엑셀로 일괄 변경** (기본값: `client/src/constants/defaultCodes.js`) |
| PM2 실행 방식 | `server/ecosystem.config.cjs` |
| test 모드 테스트 계정 | `client/src/api/mock/accounts.js` |

`server/.env`, `server/config/admins.js`, DevExtreme 라이선스 키(`client/src/.devextreme/`)는 git·배포 패키지에 들어가지 않는다.

## 로그인과 역할

- **정식 운영**: 로그인 화면이 없다. Web 서버 IIS 가 Windows 인증으로 `SECDS\아이디` 를 확인 → API 서버가 AD·사내 인사 API 로 재직 확인 → 바로 홈. 안 되면 "AD SSO로 확인된 임직원만 이용할 수 있어요" 안내 화면
- **test 모드**: 입구에서 테스트 계정(만능·신청 전·신청 완료·매칭 담당자·퇴직자)을 골라 바로 들어간다
- 서버가 로그인 정보에 역할을 담아 준다 — `role`: `ADMIN`(관리자 계정) · `APPLICANT`(신청서 있음) · `GUEST`(신청 전), `applicant.userStatus`: 매칭 대기 중 / 매칭 중 / 커플 성사
- **관리자 화면**(`/changeme`, `servers.config.mjs` 의 `adminPath`): 사용자 화면에는 들어가는 버튼이 없다. 사내 SSO 확인 → `admins.js`에 있는 계정인지 → 관리자 비밀번호 (5회 틀리면 10분 잠금, 30분 무활동 시 종료)

## 개발 · 시연 (test 모드, 내 PC)

```bash
cd client
npm ci
npm run dev
```

`http://localhost:5173` — 서버 없이 브라우저 안의 가짜 DB로 모든 기능이 동작한다(맨 위 '테스트 운영 중' 띠).

| 용도 | 사내 계정 ID | 비고 |
|---|---|---|
| 만능 계정 | `sayeon.test` | 신청 완료 · 받은 하트 2개 · 관리자 계정이기도 함 |
| 매칭 담당자 | `jiwon.jung` | 관리자 계정, 신청서 없음 |
| 신청 전 | `haneul.kim` | 신청서 작성부터 시험 |
| 신청 완료 + 받은 하트 1 | `doyun.lee` | |
| 퇴직자 | `seojin.park` | 로그인 거절 확인용 |

- 입구 화면에서 계정을 누르면 바로 들어간다. 관리자 비밀번호는 `client/src/api/mock/accounts.js` (`/changeme/login`의 '테스트 운영' 버튼으로 채울 수 있다)
- 홈 "테스트 · 다음 날로 넘기기": 오늘의 후보·하트 제한 초기화 / 관리자 사이드바 "가짜 데이터 초기화": 처음 상태로
- 실서버로 개발하려면 `server`에서 `npm run dev`, `client/public/sayeon.config.js`의 `mode`를 `'open'`으로 바꾸면 `/api`가 3000번 포트로 넘어간다
- DevExtreme 라이선스 키 등록 방법은 [GO-LIVE 5-2](docs/GO-LIVE.md#5-2-devextreme-라이선스)

## 주요 기능

- 홈(신청자는 매칭 보드: 오늘의 인연 3명·하트 1개·받은 하트·궁합) → 마이페이지(신청서 수정)
- 인연 사주 → 궁합 최고 1명 → 하트 보내기(신청 전이면 필수 항목 팝업, 옆의 '정식으로 신청하기'로 전체 신청서로 이어 가기)
- 쪽지함 · 커플 최종 완료 · '다시 인연 찾기'(두 사람 모두 커플 해제 + 상대에게 자동 안내 쪽지) · 엑셀 모드(Ctrl+Shift+E)
- 관리자: 대시보드·신청자·매칭·쪽지·후기·싫어요/블랙리스트·개선의 소리·기준정보(엑셀 일괄 변경)·설정·열람 기록

## 사내망 참고

- 폰트까지 전부 npm 번들이라 외부 CDN 접근이 필요 없다
- `npm ci`가 막히면 사내 npm 미러(Nexus 등)를 쓰거나, 같은 OS·같은 Node.js 버전의 다른 PC에서 설치·빌드한 폴더를 통째로 반입한다(`client/node_modules`·`server/node_modules`·`client/dist`)
- 브랜드 색을 바꾸려면 `client/scripts/build-theme.cjs`를 고친 뒤 `npm run theme`
