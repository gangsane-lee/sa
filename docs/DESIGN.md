# 사緣 (사연) — 시스템 설계서

> 삼성전자 DS부문 임직원 전용 사내 소개팅 매칭 시스템
> **사**(社內) + **緣**(인연 연): 회사에서 시작되는 인연. '사연(이야기)'과 소리가 같아 "모든 커플에겐 사연이 있다"는 뜻도 겹친다.
> 戀(그리워할 연)보다 緣을 고른 이유: 소개팅은 사랑 이전에 '인연을 맺어주는 일'이고, 월하노인의 붉은 실(紅絲) 설화와 바로 이어진다.

## 1. 구성

```mermaid
flowchart LR
  U[임직원 브라우저] -- HTTPS --> R[IIS / Nginx 리버스 프록시]
  R --> N[Node.js + Express<br/>정적 파일(Vue 빌드) + /api]
  N -- 재직 확인 --> H[(인사 DB 뷰 또는 AD/LDAP · SSO)]
  N -- mssql/tedious, TLS --> D[(MSSQL: SAYEON DB)]
```

| 영역 | 기술 |
|---|---|
| 프론트 | Vue 3, Vite, vue-router, DevExtreme 26.1 (Complete), 커스텀 테마 `dx.sayeon.css` |
| 백엔드 | Node.js 20+, Express, `mssql`, `express-session`(MSSQL 세션 저장소), `bcrypt`, `helmet`, `express-rate-limit` |
| DB | MSSQL (TDE 권장) |
| 배포 | Node 서버 1개가 `client/dist` 정적 파일과 `/api`를 함께 서빙 → CORS 불필요 |

프론트는 `VITE_API_MODE`로 **mock(브라우저 가짜 DB)** / **server(실제 API)** 를 전환한다. 두 구현은 함수 시그니처가 같으며, `src/api/mock/index.js`가 서버 동작 명세 역할을 한다.

## 2. 화면

| 경로 | 화면 | 비고 |
|---|---|---|
| `/login` | 임직원 인증 | 사번 + 사내 계정 비밀번호 → 재직자만 통과 |
| `/` | 홈 | 소개팅 목적·설렘 문구, 100% 기밀 보장 안내, 진행 4단계, 신청하기 / 접수증(상태·수정·철회) |
| `/apply` | 신청서 | 29개 항목, 항목별 유효성·예시 문구, 진행률, 제출 후 홈 + 완료 팝업 |
| 헤더 `관리자` | 관리자 비밀번호 팝업 | 별도 비밀번호 확인 → 관리자 레이아웃으로 전환 |
| `/admin` | 대시보드 | KPI, 사업부별 성비, 진행 상태 |
| `/admin/applicants` | 신청자 관리 | 조회·검색·필터, 상세/수정/삭제, 일괄 상태 변경, 연락처 마스킹 해제, 엑셀 |
| `/admin/matching` | 매칭 관리 | 대기자 선택 → 추천 후보(점수·이유) → 매칭 제안, 매칭 상태 관리 |
| `/admin/audit` | 열람 기록 | 관리자 행위만 기록(수정·삭제 불가) |

## 3. 신청서 항목 (삼성 DS 기준)

- **기본**: 이름, 성별, 출생연도(→연 나이), 사업부(메모리/System LSI/파운드리/DS부문 공통), 소속, 직급(CL1~CL4), 근무지(기흥·화성·평택·온양·천안·수원·서초), 근무 형태(주간/교대/자율), 휴대전화, 이메일
- **프로필**: 키, 체형, 거주 지역, 학력(선택), 흡연, 음주, MBTI(선택), 종교(선택·민감정보 별도 동의), 취미 1~5, 성격 키워드 1~3, 자기소개 30~500자
- **이상형**: 선호 나이 범위, 이상형 키워드 1~5, 상대 흡연 선호, 편한 첫 만남, 매칭 제외 범위(같은 팀 / 같은 사업부 / 상관없음), 담당자에게 한마디
- **동의**: 개인정보 수집·이용(필수), 상호 수락 시 정보 전달(필수)

코드 목록은 `client/src/constants/codes.js`, 유효성 규칙은 `client/src/utils/applicationRules.js` 한 곳에서 관리하며 서버도 같은 파일을 쓴다.

## 4. 데이터 모델 (MSSQL)

```sql
CREATE TABLE SA_APPLICANT (
  APPLICANT_ID      INT IDENTITY PRIMARY KEY,
  EMP_NO            VARCHAR(20)    NOT NULL UNIQUE,
  NAME_ENC          VARBINARY(256) NOT NULL,          -- AES-256-GCM (앱 레벨 암호화)
  PHONE_ENC         VARBINARY(256) NOT NULL,
  EMAIL_ENC         VARBINARY(512) NOT NULL,
  GENDER            CHAR(1)        NOT NULL CHECK (GENDER IN ('M','F')),
  BIRTH_YEAR        SMALLINT       NOT NULL,
  DIVISION_CD       VARCHAR(20)    NOT NULL,
  DEPT_NM           NVARCHAR(30)   NOT NULL,
  CAREER_LEVEL      VARCHAR(5)     NOT NULL,
  WORK_SITE_CD      VARCHAR(20)    NOT NULL,
  WORK_PATTERN_CD   VARCHAR(10)    NOT NULL,
  HEIGHT            SMALLINT       NOT NULL,
  BODY_TYPE_CD      VARCHAR(10)    NOT NULL,
  RESIDENCE         NVARCHAR(30)   NOT NULL,
  EDUCATION_CD      VARCHAR(10)    NULL,
  SMOKING_CD        VARCHAR(10)    NOT NULL,
  DRINKING_CD       VARCHAR(10)    NOT NULL,
  MBTI              CHAR(4)        NULL,
  RELIGION_CD       VARCHAR(10)    NULL,               -- AGREE_SENSITIVE=1 일 때만
  HOBBIES           NVARCHAR(400)  NOT NULL,           -- JSON 배열
  PERSONALITY       NVARCHAR(200)  NOT NULL,           -- JSON 배열
  INTRO             NVARCHAR(500)  NOT NULL,
  PREF_AGE_MIN      TINYINT        NOT NULL,
  PREF_AGE_MAX      TINYINT        NOT NULL,
  PREF_KEYWORDS     NVARCHAR(400)  NOT NULL,           -- JSON 배열
  PREF_SMOKING_CD   VARCHAR(10)    NOT NULL,
  MEETING_STYLE_CD  VARCHAR(10)    NOT NULL,
  AVOID_SCOPE_CD    VARCHAR(10)    NOT NULL,
  MESSAGE_TO_MGR    NVARCHAR(300)  NULL,
  AGREE_PRIVACY     BIT NOT NULL, AGREE_SHARE BIT NOT NULL, AGREE_SENSITIVE BIT NOT NULL DEFAULT 0,
  AGREED_AT         DATETIME2      NOT NULL,
  STATUS_CD         VARCHAR(10)    NOT NULL DEFAULT 'RECEIVED',  -- RECEIVED/REVIEWING/MATCHING/MATCHED/HOLD
  ADMIN_MEMO        NVARCHAR(300)  NULL,                          -- 본인에게도 비공개
  CREATED_AT        DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
  UPDATED_AT        DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
  ROW_VER           ROWVERSION
);

CREATE TABLE SA_MATCH (
  MATCH_ID     INT IDENTITY PRIMARY KEY,
  APPLICANT_A  INT NOT NULL REFERENCES SA_APPLICANT(APPLICANT_ID) ON DELETE NO ACTION,
  APPLICANT_B  INT NOT NULL REFERENCES SA_APPLICANT(APPLICANT_ID) ON DELETE NO ACTION,
  SCORE        TINYINT NOT NULL,
  STATUS_CD    VARCHAR(10) NOT NULL DEFAULT 'PROPOSED',          -- PROPOSED/ACCEPTED/MET/DECLINED
  MEMO         NVARCHAR(300) NULL,
  CREATED_BY   VARCHAR(20) NOT NULL,
  CREATED_AT   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  UPDATED_AT   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
-- 신청자 삭제(철회) 시 SA_MATCH 행을 먼저 지우고 상대 상태를 되돌린다 (앱 트랜잭션)

CREATE TABLE SA_AUDIT_LOG (                 -- INSERT 전용. 앱 DB 계정에 UPDATE/DELETE 권한을 주지 않는다
  LOG_ID       BIGINT IDENTITY PRIMARY KEY,
  AT           DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  ACTOR_EMP_NO VARCHAR(20) NOT NULL,
  ACTION_CD    VARCHAR(30) NOT NULL,        -- codes.js AUDIT_ACTIONS
  TARGET       NVARCHAR(100) NULL,          -- '#12 이*윤' 처럼 마스킹
  DETAIL       NVARCHAR(300) NULL,          -- 바뀐 '항목 이름'만, 값은 남기지 않음
  CLIENT_IP    VARCHAR(45) NULL
);

CREATE TABLE SA_ADMIN (EMP_NO VARCHAR(20) PRIMARY KEY);  -- 관리자 허용 사번 (비밀번호와 이중 확인)
```

## 5. API 명세 (`/api`, JSON, 세션 쿠키)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/auth/login` `{empNo,password}` | 재직 확인 → `{user, adminExpiresAt}` (401 불일치 / 403 비재직) |
| GET | `/auth/me` | 세션 복원 |
| POST | `/auth/logout` | |
| POST | `/auth/admin` `{password}` | 관리자 모드 진입 → `{adminExpiresAt}` (401 남은 횟수 / 423 잠김) |
| DELETE | `/auth/admin` | 관리자 모드 종료 |
| GET | `/applications/me` | 내 신청서 (없으면 204) — 관리 메모 제외 |
| POST | `/applications` | 신청 (409 중복, 400 검증 실패) |
| PUT | `/applications/me` | 수정 |
| DELETE | `/applications/me` | 철회 = 즉시 완전 삭제 |
| GET | `/admin/stats` | 대시보드 |
| GET | `/admin/applicants?reveal=1` | 목록(기본 연락처 마스킹, reveal 시 기록) |
| GET/PUT/DELETE | `/admin/applicants/:id` | 상세(열람 기록) / 수정 / 삭제 |
| PATCH | `/admin/applicants/status` `{ids,status}` | 일괄 상태 변경 |
| GET | `/admin/applicants/:id/candidates` | 추천 후보 |
| GET/POST | `/admin/matches` | 매칭 목록 / 제안 `{aId,bId,memo}` (409 진행 중 매칭 있음) |
| PATCH/DELETE | `/admin/matches/:id` | 상태·메모 변경 / 삭제 |
| GET | `/admin/audit-logs` | 열람 기록 |
| POST | `/admin/audit-logs/export` `{count}` | 엑셀 내려받기 기록 |

응답 형태·오류 코드는 `client/src/api/mock/index.js`와 동일하게 구현한다.

## 6. 매칭 로직 (`client/src/api/mock/matching.js` → 서버로 이식)

- **제외**: 같은 성별, 매칭 완료·보류, 진행 중 매칭 있음, 과거에 맺어줬던 상대, 서로의 제외 범위(같은 팀/사업부), 비흡연 선호 위반, 양쪽 모두 선호 나이 밖
- **점수(100)**: 서로 선호 나이 40(한쪽만 15) · 겹치는 취미 최대 24 · 같은 근무지 12(가까운 캠퍼스 8) · 첫 만남 방식 8 · 근무 형태 6 · 음주 6 · MBTI 4
- 제안 → 두 사람 `매칭 중`, 양측 수락/만남 완료 → `매칭 완료`, 불발·삭제 → `검토 중`으로 복귀

## 7. 보안 설계 ("100% 기밀"을 실제로 뒷받침하는 장치)

1. **임직원 인증**: 인사 DB 재직 뷰 또는 AD/LDAP bind로 확인, 비밀번호는 저장하지 않음. 가능하면 사내 SSO(SAML/OIDC) 연동 권장
2. **관리자 이중 확인**: `SA_ADMIN` 허용 사번 + 별도 관리자 비밀번호(bcrypt 해시는 `.env`) · 5회 실패 시 10분 잠금 · 30분 무활동 자동 종료(슬라이딩)
3. **세션**: HttpOnly + Secure + SameSite=Strict 쿠키, 상태 변경 요청은 `X-Requested-With` 헤더 필수, 로그인 rate limit
4. **암호화**: 이름·전화·이메일 AES-256-GCM(키는 `.env`/키 관리 시스템), DB TDE, 전 구간 TLS
5. **최소 노출**: 목록은 연락처 마스킹, 해제·상세 열람·수정·삭제·엑셀은 전부 기록. 관리 메모는 본인에게도 비공개
6. **방문 사실 보호**: 일반 임직원의 로그인/방문은 관리자 화면에 남기지 않음(서버 보안 로그에만 단기 보관)
7. **파기**: 철회 즉시 완전 삭제, 매칭 종료 6개월 후 배치 파기. 종교는 민감정보 별도 동의 시에만 저장
8. **운영 전 체크**: 사내 정보보호 심의·개인정보 처리 협의, 외부 CDN 미사용(폰트 포함 전부 번들)

## 8. 폴더 구조

```
sa/
├─ docs/DESIGN.md        ← 이 문서
├─ client/               ← Vue 3 + DevExtreme (완료: UI + mock API)
│  ├─ scripts/build-theme.cjs   브랜드 색 테마 생성
│  └─ src/ api(mock·http) · components · views(admin) · layouts · constants · utils · styles
└─ server/               ← 다음 단계: Express API (위 5·6·7 구현)
```

## 9. 다음 단계

1. `server/` 구현 (Express + mssql, 위 DDL 적용, mock 동작과 동일하게)
2. 인사 DB/AD 연동 방식 확정 → `/auth/login` 어댑터 구현
3. 운영 빌드 후 mock 코드 미포함 확인, 사내 서버 배포(PM2 또는 Windows 서비스 + IIS 리버스 프록시)
