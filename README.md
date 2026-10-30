# 사緣 (사연) · 사내 인연 매칭

삼성전자 DS부문 임직원 전용 비공개 소개팅 매칭 시스템.

| 문서 | 내용 |
|---|---|
| **[docs/GO-LIVE.md](docs/GO-LIVE.md)** | **운영 가이드** — 서버 구성 · 확인 요청 목록 · 최초 배포(단계별 확인) · 기능 추가 배포 · 운영 중 변경 · 사내 로그인 · 점검 명령 읽는 법. 배포 절차는 이 문서에만 있다 |
| [docs/DESIGN.md](docs/DESIGN.md) | 설계서 — 화면 · 데이터 · API · 매칭 규칙 · 보안 |

```
servers.config.mjs  ★ 서버 기준정보(마스터) — Web·API·DB·개발 서버 주소, 포트, DB 이름, 관리자 주소, 로그인 방식
client/   화면 (Vue 3 + DevExtreme) — 업무 규칙은 server/shared 를 함께 씀 (@shared)
server/   API 서버 = IIS 사이트 폴더 (main.js · web.config · routes/ · src/ · shared/ — IIS + iisnode)
tools/    기준정보 읽기(topology.mjs) · 배포 패키지 만들기(release.mjs)
docs/     운영 가이드 · 설계서
```

## 운영 한눈에

| 역할 | 주소 (`servers.config.mjs`) | 하는 일 |
|---|---|---|
| 개발 서버 (인터넷 됨) | `12.123.321.13` | 개발·시험, 빌드와 배포 패키지 만들기 |
| Web 배포 운영 서버 | `10.123.321.12:8282` | IIS — 화면 · `/api` 를 API 서버로 |
| API 배포 운영/개발 서버 | `12.83.18.17:8292` (개발 `:8293`) | IIS + iisnode — 업무 · (권장) 사내 인사 API 로 사번 재확인 · DB |
| DB 서버 | `10.166.101.127` | MSSQL `sasystem` (개발 `sasystem_dev`) |

지금 IP 는 가짜다(`321` 은 IP 로 쓸 수 없음 — 서버·빌드·점검이 막는다). 운영 표준: Node.js **22.12.0** · npm **10.9.0** · PM2 **5.3.0**(서버 패키지에 포함). 설치 경로는 **영문만**(예: `C:\apps\sa`).

```powershell
# 개발 서버 — 배포 패키지 만들기 (빌드 · 패키지 · 패키지 점검)
cd C:\apps\sa\server
npm run release

# API 서버 — 백업 → 교체 → 점검 → 시작 → 상태 확인 (실패하면 자동으로 되돌림)
powershell -ExecutionPolicy Bypass -File <패키지>\api\_deploy\deploy-api.ps1

# Web 서버 — 백업 → 교체 → IIS·파일·연결·로그인 점검
powershell -ExecutionPolicy Bypass -File <패키지>\web\_deploy\deploy-web.ps1 -SitePath D:\sites\sasystem

# API 서버에서 따로 돌리는 점검
npm run check                          # 서버 기준정보 · .env · DB · 관리자 · 사내 로그인
npm run db:setup                       # DB · 앱 계정 · 권한 · 테이블 (여러 번 실행해도 안전)
npm run sso:test -- --user 회사아이디   # AD 조회 → 사내 인사 API → 사緣에 들어올 정보
```

## ★ 고칠 곳 한눈에

| 바꾸고 싶은 것 | 파일 |
|---|---|
| 서버 IP·포트, DB 서버·이름, 관리자 주소, 사내 로그인 방식·**사내 인사정보 URL**·서버 재확인 인사 API | **`servers.config.mjs`** (개발 서버에서 고쳐 커밋 → `npm run release` → 배포) |
| DB 계정·비밀번호, 세션·암호화 키, 인사 API 키 | API 서버 **`server/.env`** (설명: `server/.env.example`) |
| 관리자 계정(사번·사내 계정 ID)과 관리자 비밀번호 | API 서버 **`server/config/admins.js`** (예시: `admins.example.js`) — 고치면 3초 안에 반영 |
| 인사정보 응답 필드 이름, 사업부 이름 → 코드, 재직 아님 값 | `server/shared/utils/employeeInfo.js` 의 `FIELD`·`DIVISION_MAP`·`INACTIVE` (화면·서버 같이 씀) |
| 화면에서 로그인한 사람의 인사정보 쓰기 | `import { employee } from '@/stores/employee'` → `employee.name` · `employee.team` … (`client/src/stores/employee.js` — `session.user` 의 빈 항목도 같은 값으로 채워진다) |
| DB 준비 (DB 담당자가 직접 할 때) | `server/sql/setup.sql` |
| 사업부·캠퍼스 등 기준정보·설정 | 관리자 화면 '기준정보' — 한 건씩 또는 **엑셀로 일괄 변경** (기본값: `server/shared/constants/defaultCodes.js`) |
| API 서버 환경·포트·DB 서버 | API 서버 사이트 폴더의 `web.config` (`npm run webconfig` 로 다시 만들기) |
| 개발 모드 테스트 계정 | `client/src/api/mock/accounts.js` |

`server/.env`, `server/config/admins.js`, DevExtreme 라이선스 키(`client/src/.devextreme/`)는 git·배포 패키지에 들어가지 않는다.

## 로그인과 역할

- **운영 모드** (`npm run build`): 로그인 화면이 없다. 화면을 열 때 **사내 인사 데이터 URL** 로 sabun · user_name 을 받아(localStorage `sasystem.employee`) → 그 값으로 **임직원 확인 URL** 에 POST → 임직원이면 API 서버로 넘겨 바로 홈. 아니면 "임직원만 이용할 수 있어요" 안내 화면 (자세히: [GO-LIVE 4장](docs/GO-LIVE.md#4-사내-로그인-구조))
- **개발 모드** (`npm run dev`): 운영 API 서버(같은 DB)를 부르고, 로그인 화면 없이 테스트 사번(`servers.config.mjs` 의 `devLogin`)으로 바로 홈. 테스트 사번으로 만든 데이터는 일반 사용자에게 보이지 않는다
- **가짜 데이터 모드** (`npm run dev:mock`): 서버 없이 만능 테스트 계정으로 바로 홈. 로그아웃하면 다른 테스트 계정을 고를 수 있다
- **개인정보**: 생년월일은 **출생연도만** 저장한다. 인연 사주에 입력한 월·일·태어난 시간은 저장하지 않는다
- 서버가 로그인 정보에 역할을 담아 준다 — `role`: `ADMIN`(관리자 계정) · `APPLICANT`(신청서 있음) · `GUEST`(신청 전), `applicant.userStatus`: 매칭 대기 중 / 매칭 중 / 커플 성사
- **관리자 화면**(`/changeme`, `servers.config.mjs` 의 `adminPath`): 사용자 화면에는 들어가는 버튼이 없다. 사내 SSO 확인 → `admins.js`에 있는 계정인지 → 관리자 비밀번호 (5회 틀리면 10분 잠금, 30분 무활동 시 종료)

## 개발 모드 (개발 서버 10.122.122.10)

```bash
cd client
npm ci
npm run dev        # 운영 API · 운영 데이터 · 테스트 사번 (client/.env.development.local 에 SASYSTEM_DEV_KEY 필요 — .env.development.local.example)
npm run dev:mock   # 서버 없이 가짜 데이터
npm run dev:sso    # 운영 API · 인사정보 2단계 로그인 디버깅 (F12 Console 의 [인사 확인] 기록 · 중단점)
```

`npm run dev:mock` 은 `http://localhost:5173` — 서버 없이 브라우저 안의 가짜 DB로 모든 기능이 동작하고, **만능 계정으로 바로 홈**이 열린다(맨 위 '개발 모드' 띠). 다른 계정은 로그아웃 → 계정 고르기.

| 용도 | 사내 계정 ID | 비고 |
|---|---|---|
| 만능 계정 | `sasystem.test` | 신청 완료 · 받은 하트 2개 · 관리자 계정이기도 함 |
| 매칭 담당자 | `jiwon.jung` | 관리자 계정, 신청서 없음 |
| 신청 전 | `haneul.kim` | 신청서 작성부터 시험 |
| 신청 완료 + 받은 하트 1 | `doyun.lee` | |
| 퇴직자 | `seojin.park` | 로그인 거절 확인용 |

- 관리자 비밀번호는 `client/src/api/mock/accounts.js` (`/changeme/login`의 테스트 버튼으로 채울 수 있다)
- 홈 "테스트 · 다음 날로 넘기기": 오늘의 후보·하트 제한 초기화 / 관리자 사이드바 "가짜 데이터 초기화": 처음 상태로
- 실제 API 와 붙여 보려면 `npm run build` → `npm run preview` (`/api` 는 개발 API 서버 또는 `DEV_API_PROXY` 로) — [GO-LIVE 5장](docs/GO-LIVE.md#5-개발-환경)
- DevExtreme 라이선스 키 등록 방법은 [GO-LIVE 8-1](docs/GO-LIVE.md#8-1-devextreme-라이선스)

## 주요 기능

- 홈(신청자는 매칭 보드: 오늘의 인연 3명·하트 1개·받은 하트·궁합) → 마이페이지(신청서 수정)
- 인연 사주 → 궁합 최고 1명 → 하트 보내기(신청 전이면 필수 항목 팝업, 옆의 '정식으로 신청하기'로 전체 신청서로 이어 가기)
- 쪽지함 · 커플 최종 완료 · '다시 인연 찾기'(두 사람 모두 커플 해제 + 상대에게 자동 안내 쪽지) · 엑셀 모드(Ctrl+Shift+E)
- 관리자: 대시보드·신청자·매칭·쪽지·후기·싫어요/블랙리스트·개선의 소리·기준정보(엑셀 일괄 변경)·설정·열람 기록

## 사내망 참고

- 폰트까지 전부 npm 번들이라 외부 CDN 접근이 필요 없다
- `npm ci`가 막히면 사내 npm 미러(Nexus 등)를 쓰거나, 같은 OS·같은 Node.js 버전의 다른 PC에서 설치·빌드한 폴더를 통째로 반입한다(`client/node_modules`·`server/node_modules`·`client/dist`)
- 브랜드 색을 바꾸려면 `client/scripts/build-theme.cjs`를 고친 뒤 `npm run theme`
