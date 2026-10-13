# 사緣 (사연) · 사내 인연 매칭

삼성전자 DS부문 임직원 전용 비공개 소개팅 매칭 시스템.

- **실제 서비스 전환 순서(설치 · IP · DB · 사내 API · 오픈): [docs/GO-LIVE.md](docs/GO-LIVE.md)**
- 설계: [docs/DESIGN.md](docs/DESIGN.md)

```
client/   화면 (Vue 3 + DevExtreme) + 업무 규칙(client/src/api/core/service.js)
server/   API 서버 (Node.js + Express + MSSQL, PM2로 실행) — 화면(client/dist)도 함께 내보낸다
docs/     운영 전환 체크리스트(GO-LIVE.md) · 설계서(DESIGN.md)
```

## ★ 고칠 곳 한눈에

| 바꾸고 싶은 것 | 파일 |
|---|---|
| API 서버 주소·포트, DB 서버·계정·비밀번호, 세션·암호화 키, 관리자 주소, 화면 모드(test/open) | **`server/.env`** (설명: `server/.env.example`) |
| 관리자 계정(사번·사내 계정 ID)과 관리자 비밀번호 | **`server/config/admins.js`** (예시: `admins.example.js`) — 고치면 3초 안에 반영 |
| 사내 AD/SSO 연동 (인증 API 호출, 응답 필드 이름, 사업부 이름 → 코드) | **`server/src/sso.js`** + `.env`의 `SSO_*`·`AUTH_LOGIN_URL`·`HR_*` |
| PM2 실행 방식 | `server/ecosystem.config.cjs` |
| test 모드 테스트 계정 | `client/src/api/mock/accounts.js` |
| 사업부·캠퍼스 등 선택 목록 | 관리자 화면 '기준정보' (기본값: `client/src/constants/defaultCodes.js`) |

`server/.env`와 `server/config/admins.js`는 비밀번호가 들어 있어 git에 올라가지 않는다(.gitignore). 서버에 직접 만들어 둘 것.

## 운영 배포 — API 12.83.18.17 (PM2) · DB 10.101.107.127 (MSSQL)

**단계별 체크리스트는 [docs/GO-LIVE.md](docs/GO-LIVE.md)** 에 있다 (협조 요청 → 설치 → 빌드 → DB → `.env` → 사내 SSO → 관리자 → 점검 → PM2 → 리허설 → 정식 오픈 → IP·API 변경 방법).

요약:

```bash
git clone https://github.com/gangsane-lee/sa.git
cd sa/client && npm install && npm run build
cd ../server && npm install
npm run check
pm2 start ecosystem.config.cjs
```

- 그 전에 `server/.env`(서버·DB 주소, 키)와 `server/config/admins.js`(관리자)를 만든다 — git에 없다
- 접속: 사용자 `http://12.83.18.17:3000`, 관리자 `http://12.83.18.17:3000/changeme`, 상태 `/api/health`, 로그 `pm2 logs sayeon-api`
- ⚠ `server` 폴더만 따로 옮기지 않는다 (서버가 `client/src`의 업무 규칙과 `client/node_modules`를 함께 쓴다)
- ⚠ PM2 인스턴스는 반드시 1개(설정에 고정). 데이터를 메모리에 두고 DB에 저장하는 구조다

## 로그인과 역할

- **사용자 화면**(`/`): 사내 SSO(`SSO_MODE`) → 실패하면 로그인 화면(사내 계정 ID/비밀번호 → `AUTH_LOGIN_URL`)
- 서버가 로그인 정보에 역할을 담아 준다 — `role`: `ADMIN`(관리자 계정) · `APPLICANT`(신청서 있음) · `GUEST`(신청 전), `applicant.userStatus`: 매칭 대기 중 / 매칭 중 / 커플 성사
  - 신청 전 → 소개·신청 화면, 신청자 → 매칭 보드, 헤더에 신청 상태 표시
- **관리자 화면**(`/changeme`, `.env`의 `ADMIN_PATH`로 변경 가능): 사용자 화면에는 들어가는 버튼이 없다. 관리자 주소에서 사내 계정 확인 → `admins.js`에 있는 계정인지 확인 → 관리자 비밀번호 순서로 들어간다(5회 틀리면 10분 잠금, 30분 무활동 시 종료)

## 개발 · 시연 (test 모드)

```bash
cd client
npm install
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

- 비밀번호·관리자 비밀번호는 `client/src/api/mock/accounts.js`에 있다. 로그인 화면(사용자)과 `/changeme/login`(관리자)의 '테스트 운영' 버튼으로 바로 채울 수 있다
- 홈 "테스트 · 다음 날로 넘기기": 오늘의 후보·하트 제한 초기화 / 관리자 사이드바 "가짜 데이터 초기화": 처음 상태로
- 실서버로 개발하려면 `server`에서 `npm run dev`, `client/public/sayeon.config.js`의 `mode`를 `'open'`으로 바꾸면 `/api`가 3000번 포트로 넘어간다

## 주요 기능

- 홈(신청자는 매칭 보드: 오늘의 인연 3명·하트 1개·받은 하트·궁합) → 마이페이지(신청서 수정)
- 인연 사주 → 궁합 최고 1명 → 하트 보내기(신청 전이면 필수 항목 팝업, 옆의 '정식으로 신청하기'로 전체 신청서로 이어 가기)
- 쪽지함 · 커플 최종 완료 · '다시 인연 찾기'(두 사람 모두 커플 해제 + 상대에게 자동 안내 쪽지) · 엑셀 모드(Ctrl+Shift+E)
- 관리자: 대시보드·신청자·매칭·쪽지·후기·싫어요/블랙리스트·개선의 소리·기준정보·설정·열람 기록

## DevExtreme 라이선스 등록 (직접 해야 함)

등록 전에는 화면 상단에 평가판 배너가 뜬다.

1. 키를 환경 변수 `DevExpress_License`에 넣거나 `%APPDATA%\DevExpress\DevExpress_License.txt`에 저장
2. `client`에서 `npx devextreme-license --out src/.devextreme/license-key.js` 실행 (`.gitignore` 대상 — 커밋 금지)
3. `src/main.js`에서 `import { licenseKey } from './.devextreme/license-key';` 후 `config({ licenseKey, ... })`
4. 빌드하는 서버에서도 1번 환경 변수를 설정하고 빌드 전에 2번을 실행

## 사내망 참고

- 폰트까지 전부 npm 번들이라 외부 CDN 접근이 필요 없다
- `npm install`이 막히면 사내 npm 미러(Nexus 등)를 쓰거나, 다른 PC에서 설치·빌드한 폴더를 통째로 반입한다(`client/node_modules`·`server/node_modules`·`client/dist`)
- 브랜드 색을 바꾸려면 `client/scripts/build-theme.cjs`를 고친 뒤 `npm run theme`
