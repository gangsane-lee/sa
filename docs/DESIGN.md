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

**업무 규칙은 한 파일** — `client/src/api/core/service.js`. 브라우저 test 모드(`api/mock`)와 Node 서버(`server/`)가 이 파일을 함께 쓰고, 저장소·세션·사내 인증·관리자 확인만 끼워 넣는다(`configureService`). 그래서 화면에서 시험한 동작이 운영에서도 똑같다.

| | test 모드 | 운영 서버 |
|---|---|---|
| 저장소 | localStorage | MSSQL `SA_DOC` (`server/src/store.js`) |
| 세션 | sessionStorage | express-session (HttpOnly 쿠키) |
| 사내 인증 | 가짜 임직원 (`api/mock/accounts.js`) | AD/SSO (`server/src/sso.js` + `.env`) |
| 관리자 계정 | `api/mock/accounts.js` | `server/config/admins.js` |

화면은 운영 모드 **test / open**을 `sayeon.config.js`로 전환한다(빌드 무관). 운영 서버가 화면을 내보낼 때는 `server/.env`의 `SERVICE_MODE`·`ADMIN_PATH`로 이 파일을 만들어 준다.

## 2. 화면

| 경로 | 화면 | 비고 |
|---|---|---|
| `/login` | 사내 계정 로그인 | 사내 계정(AD) ID 또는 사번 + 비밀번호 → 서버가 AD bind/SSO로 재직 확인 |
| `/` | 홈 | 미신청: 소개 · 인연 사주 진입(마케팅) · 기밀 약속. **신청자: 매칭 보드**(상태 · 오늘의 인연 + 궁합 · 받은 하트 탭 + 궁합 · 매칭 상대 쪽지 버튼) |
| `/saju` | 인연 사주 | 생년월일(+시간/모름) → 사주 4주·오행·일간 성향·끌리는 사람·오늘의 연애운. **'내 사주 인연 찾기'**(신청 전·후 같은 버튼) → 궁합 최고 1명 프로필 → [하트 보내기] 하나. 신청 전이면 **필수 항목만 받는 팝업**에서 신청+하트를 한 번에, 신청 후면 바로 하트(오늘의 하트 1개) |
| `/apply` | 신청서 | 나(필수/선택) + 선호 + 선호 우선순위 + 동의 |
| `/apply/done` | 신청 완료 | 접수 번호, 상태 '매칭 대기 중', 다음 단계 안내 |
| `/voc` | 개선의 소리 | 의견 남기기(작성자 이름·팀이 담당자에게 보임, 익명 없음). 보낸 글 목록은 없다 — 처리 상태·답변 메모는 관리자 화면에만 |
| `/privacy` | 개인정보 처리 안내 | 수집 항목·공개 범위·보관·파기 (운영 전 정보보호 부서 검토 필요) |
| `/me` | 마이페이지 = 내 신청서 | 신청서 수정·철회. **매칭 중·하트 응답 대기 중·커플 완료**면 읽기 전용. 성별을 바꾸면 하트·오늘의 인연 초기화(경고 후). 블랙리스트 사번은 신청 불가 화면 |
| `/messages` | 쪽지함 | **받은 쪽지함 / 보낸 쪽지함 / 휴지통**(메일함 형태). 받는 사람 = 담당자(늘) + 진행 중인 매칭 상대. 답장 없이 연속 N통(설정, 기본 3)까지 |
| 헤더 `관리자` | 관리자 비밀번호 팝업 | 별도 비밀번호 확인 → 관리자 레이아웃 |
| `/changeme` | 대시보드 | KPI(하트 포함), 사업부별 성비, 진행 상태 |
| `/changeme/applicants` | 신청자 관리 | 이름 전체 표시(관리자 화면은 초성 해제), 상세/수정/삭제(열람 기록), 일괄 상태 변경, 엑셀(기록) |
| `/changeme/matching` | 매칭 관리 | 대기자 → 추천 후보(양방향 점수·이유) → 매칭 제안, 매칭 내역(경로: 담당자 제안/하트 맞교환) |
| `/changeme/reviews` | 후기·제재 | 후기 열람(기록 남음), 싫어요 누적·매칭 제외 현황, 제재 해제 |
| `/changeme/voc` | 개선의 소리 | 의견 목록·상태 변경(접수/검토 중/반영 완료/보류)·답변 |
| `/changeme/settings` | 설정 | 대시보드 사업부 비율 차트 표시 여부, **'곧 매칭 시작' 팝업 켬/끔(숫자 표시 없음)·오픈 전 매칭 멈춤·연속 쪽지 수(기본 3)**, 싫어요 제외 기준(기본 5회), 노쇼=싫어요 여부 |
| `/changeme/messages` | 쪽지 | **매칭별(기본)**: 매칭마다 두 사람의 쪽지 / **사용자별**: 한 사람의 담당자·매칭 쪽지 전체 + 담당자 쪽지 보내기. 매칭 쪽지 열람은 기록이 남음 |
| `/changeme/reviews` 팝업 | 싫어요 누적 · 블랙리스트 | 요약 카드 → 팝업(검색·페이징 그리드). 블랙리스트: 임직원 검색 + 사유(필수) 등록/해제, 기록 남음 |
| `/changeme/codes` | **기준정보** | 그룹별 목록 편집(추가·이름·순서·사용 여부·상위·보조 값, 사용 중 코드는 삭제 불가) |
| `/changeme/audit` | 열람 기록 | 관리자 행위만 기록(수정·삭제 불가) |

## 3. 신청서 항목

| 구분 | 항목 | 필수 | 입력 | 후보 카드 노출 |
|---|---|---|---|---|
| 나 | 이름 | 자동(인사정보, 수정 불가) | 서버가 인사정보로 채움 — 화면 값 무시 | 초성(ㄱㅎㄴ) |
| 나 | 닉네임 | 필수 | 한글 2~5글자, 중복 불가, '추천받기'(꾸밈말 100 × 이름말 100 = 10,000개 중 미사용) | O (카드 제목) |
| 나 | 성별 | 필수 | 고정 코드 | - |
| 나 | 진지한 만남 여부 | 필수 | 예/아니오 | O (배지) · 같으면 +6, 다르면 −10점 |
| 나 | 생년월일 / 태어난 시간 | 필수 / 선택(모름 체크) | 날짜 / HH:mm | 만 나이만 |
| 나 | 사업부 | 필수 | 기준정보 DIVISION | O |
| 나 | 팀 | 필수 | 텍스트 | X (같은 팀 피하기용) |
| 나 | 캠퍼스 / 건물 위치 | 선택 | CAMPUS / 건물은 직접 입력(30자) — 같은 캠퍼스+같은 이름이면 '같은 건물' | 캠퍼스만 |
| 나 | 키 | 필수 | HEIGHT (10cm 단위 초반·중반·후반) | O |
| 나 | 체형 / 얼굴상 | 필수 | BODY / FACE | O |
| 나 | 외모 | 필수 | LOOKS (상·중·하, 자기 평가) | X (담당자 참고) |
| 나 | MBTI | 필수 | MBTI | O |
| 나 | 취미 | 필수 1~5 | HOBBY | 3개까지 |
| 나 | 음주 / 흡연 | 필수 | DRINKING / SMOKING | O |
| 나 | 종교 | 선택(민감정보 별도 동의) | RELIGION | X |
| 나 | 사는 곳 | 선택 | 텍스트 | X |
| 나 | 코멘트 | 선택 300자 | 텍스트 | 앞 80자 |
| 선호 | 나이(범위), 키(범위), 사업부, 얼굴상, 취미, 음주, MBTI, 흡연, 체형, 종교 | 나이만 필수, 나머지 비우면 '상관없어요' | 범위 / 다중 선택 | - |
| 선호 | 피하고 싶은 범위 | 선택 | 같은 팀·같은 건물·같은 사업부(다중) | - |
| 선호 | 선호 우선순위 | 필수 1~5 | 채워진 선호 항목 중 순서대로 선택 | - |

> 음주·흡연은 요청 목록의 '나' 항목엔 없었지만 선호에 음주·담배가 있어 비교 대상으로 본인 값도 받는다.

선택 목록은 **기준정보**(DB `SA_CODE`, 관리자 화면 편집)에서 온다. 기본값은 `client/src/constants/defaultCodes.js`, 유효성 규칙은 `client/src/utils/applicationRules.js` 한 곳에서 관리하며 서버도 같은 파일을 쓴다.

## 4. 데이터 모델 (MSSQL)

> **실제 저장 방식**: 서버는 아래 개념 모델을 문서 테이블 하나에 JSON으로 저장한다 — `SA_DOC(COLL, DOC_ID, BODY NVARCHAR(MAX), UPDATED_AT)`, 기본키 (COLL, DOC_ID).
> 신청자·매칭·하트·후기·쪽지·열람 기록 한 건이 한 행이고, 이름·메일은 `DATA_KEY`로 AES-256-GCM 암호화한다.
> 서버가 시작할 때 전체를 메모리로 읽고, 요청마다 바뀐 행만 한 트랜잭션으로 저장한다(그래서 PM2 인스턴스는 1개).
> 사내 규모(신청자 수천 명) 기준이며, 수만 명 이상이 되면 아래 정규화 테이블로 옮긴다. 테이블은 서버가 처음 시작할 때 자동으로 만든다.


```sql
CREATE TABLE SA_CODE (                      -- 기준정보
  GROUP_CD   VARCHAR(20) NOT NULL,           -- DIVISION/CAMPUS/HEIGHT/FACE/BODY/LOOKS/MBTI/HOBBY/DRINKING/SMOKING/RELIGION
  CODE       VARCHAR(30) NOT NULL,           -- 만든 뒤 변경 불가
  CODE_NM    NVARCHAR(40) NOT NULL,
  SORT_ORD   INT NOT NULL,
  USE_YN     BIT NOT NULL DEFAULT 1,         -- 0이면 새 선택지에서만 숨김
  PARENT_CD  VARCHAR(30) NULL,               -- BUILDING → CAMPUS
  ATTR       NVARCHAR(20) NULL,              -- CAMPUS → 권역
  CONSTRAINT PK_SA_CODE PRIMARY KEY (GROUP_CD, CODE)
);

CREATE TABLE SA_APPLICANT (
  APPLICANT_ID      INT IDENTITY PRIMARY KEY,
  EMP_NO            VARCHAR(20)    NOT NULL UNIQUE,
  NAME_ENC          VARBINARY(256) NOT NULL,          -- AES-256-GCM (앱 레벨 암호화)
  GENDER            CHAR(1)        NOT NULL CHECK (GENDER IN ('M','F')),
  BIRTH_DATE        DATE           NOT NULL,
  BIRTH_TIME        CHAR(5)        NULL,               -- 'HH:mm', NULL = 모름
  NICKNAME          NVARCHAR(5)    NOT NULL UNIQUE,     -- 한글 2~5글자
  SERIOUS_YN        CHAR(1)        NOT NULL,            -- 진지한 만남 Y/N
  DIVISION_CD       VARCHAR(30)    NOT NULL,
  TEAM_NM           NVARCHAR(30)   NOT NULL,
  CAMPUS_CD         VARCHAR(30)    NULL,
  BUILDING_NM       NVARCHAR(30)   NULL,                -- 직접 입력
  RESIDENCE         NVARCHAR(30)   NULL,
  HEIGHT_CD         VARCHAR(30)    NOT NULL,
  BODY_CD           VARCHAR(30)    NOT NULL,
  FACE_CD           VARCHAR(30)    NOT NULL,
  LOOKS_CD          VARCHAR(30)    NOT NULL,
  MBTI_CD           VARCHAR(30)    NOT NULL,
  DRINKING_CD       VARCHAR(30)    NOT NULL,
  SMOKING_CD        VARCHAR(30)    NOT NULL,
  RELIGION_CD       VARCHAR(30)    NULL,               -- AGREE_SENSITIVE=1 일 때만
  HOBBIES           NVARCHAR(400)  NOT NULL,           -- JSON 배열(코드)
  COMMENT           NVARCHAR(300)  NULL,
  PREF_AGE_MIN      TINYINT        NOT NULL,
  PREF_AGE_MAX      TINYINT        NOT NULL,
  PREF_HEIGHT_MIN   VARCHAR(30)    NULL,
  PREF_HEIGHT_MAX   VARCHAR(30)    NULL,
  PREF_JSON         NVARCHAR(2000) NOT NULL,           -- {avoid, prefDivisions, prefFaces, prefHobbies, prefDrinking, prefMbtis, prefReligions, prefSmoking, prefBodies}
  PRIORITIES        NVARCHAR(200)  NOT NULL,           -- JSON 배열, 앞이 1순위
  QUICK_YN          BIT NOT NULL DEFAULT 0,             -- 사주 하트로 만든 간편(임시) 신청. 전체 신청서를 저장하면 0
  AGREE_PRIVACY     BIT NOT NULL, AGREE_SHARE BIT NOT NULL, AGREE_SENSITIVE BIT NOT NULL DEFAULT 0,
  AGREED_AT         DATETIME2      NOT NULL,
  STATUS_CD         VARCHAR(10)    NOT NULL DEFAULT 'RECEIVED',  -- 내부: RECEIVED/REVIEWING/MATCHING/MATCHED/HOLD
  ADMIN_MEMO        NVARCHAR(300)  NULL,
  CREATED_AT        DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
  UPDATED_AT        DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
  ROW_VER           ROWVERSION
);

CREATE TABLE SA_MATCH (
  MATCH_ID     INT IDENTITY PRIMARY KEY,
  APPLICANT_A  INT NOT NULL REFERENCES SA_APPLICANT(APPLICANT_ID),
  APPLICANT_B  INT NOT NULL REFERENCES SA_APPLICANT(APPLICANT_ID),
  SCORE        TINYINT NOT NULL,
  SOURCE_CD    VARCHAR(10) NOT NULL DEFAULT 'ADMIN',             -- ADMIN / HEART
  STATUS_CD    VARCHAR(10) NOT NULL DEFAULT 'PROPOSED',          -- PROPOSED/ACCEPTED/MET/DECLINED
  MEMO         NVARCHAR(300) NULL,
  CREATED_BY   NVARCHAR(30) NOT NULL,
  CREATED_AT   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  UPDATED_AT   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE SA_HEART (
  HEART_ID     INT IDENTITY PRIMARY KEY,
  FROM_ID      INT NOT NULL REFERENCES SA_APPLICANT(APPLICANT_ID),
  TO_ID        INT NOT NULL REFERENCES SA_APPLICANT(APPLICANT_ID),
  STATUS_CD    VARCHAR(10) NOT NULL DEFAULT 'SENT',              -- SENT/ACCEPTED/DECLINED/EXPIRED (DECLINED는 보낸 사람에게 알리지 않음)
  SENT_AT      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  ANSWERED_AT  DATETIME2 NULL
);
CREATE INDEX IX_SA_HEART_FROM ON SA_HEART (FROM_ID, SENT_AT);   -- 하루 1개 제한 확인
CREATE INDEX IX_SA_HEART_TO   ON SA_HEART (TO_ID, STATUS_CD);

CREATE TABLE SA_DAILY (                     -- 오늘의 후보 (하루 1회 생성)
  APPLICANT_ID INT NOT NULL REFERENCES SA_APPLICANT(APPLICANT_ID),
  DAY_KST      DATE NOT NULL,
  SEQ          TINYINT NOT NULL,             -- 1~3
  CANDIDATE_ID INT NOT NULL,
  SCORE        TINYINT NOT NULL,
  STATE_CD     VARCHAR(10) NOT NULL DEFAULT 'SHOWN',  -- SHOWN/PASSED/HEARTED
  CONSTRAINT PK_SA_DAILY PRIMARY KEY (APPLICANT_ID, DAY_KST, SEQ)
);
-- 30일 재노출 금지는 SA_DAILY 이력으로 판단. 신청자 삭제(철회) 시 SA_MATCH·SA_HEART·SA_DAILY를 먼저 지운다 (앱 트랜잭션)

CREATE TABLE SA_AUDIT_LOG (                 -- INSERT 전용. 앱 DB 계정에 UPDATE/DELETE 권한을 주지 않는다
  LOG_ID       BIGINT IDENTITY PRIMARY KEY,
  AT           DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  ACTOR_EMP_NO VARCHAR(20) NOT NULL,
  ACTION_CD    VARCHAR(30) NOT NULL,        -- codes.js AUDIT_ACTIONS (CODE_CHANGE 포함)
  TARGET       NVARCHAR(100) NULL,          -- '#12 이*윤' 처럼 마스킹
  DETAIL       NVARCHAR(300) NULL,          -- 바뀐 '항목 이름'만, 값은 남기지 않음
  CLIENT_IP    VARCHAR(45) NULL
);

CREATE TABLE SA_ADMIN (EMP_NO VARCHAR(20) PRIMARY KEY);  -- 관리자 허용 사번 (비밀번호와 이중 확인)
```

## 5. API 명세 (`/api`, JSON, 세션 쿠키)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/auth/login` `{account,password}` | 사내 계정(AD ID 또는 사번) 재직 확인 → `{user, adminExpiresAt}` (401 불일치 / 403 비재직) |
| GET | `/auth/me` | 세션 복원 |
| POST | `/auth/logout` | |
| POST/DELETE | `/auth/admin` | 관리자 모드 진입(401 남은 횟수 / 423 잠김) / 종료 |
| GET | `/codes` | 기준정보 전체 |
| GET | `/applications/me` | 내 신청서 (없으면 204) — 내부 상태·관리 메모 제외, `userStatus`(WAITING/MATCHING)만 |
| POST / PUT / DELETE | `/applications` · `/applications/me` | 신청(409 중복, 400 검증) / 수정 / 철회 = 즉시 완전 삭제 |
| GET | `/me/dashboard` | `{status, application, daily{date,total,index,current,heartsLeft,heartSentToday}, inbox[], partner}` |
| POST | `/me/daily/pass` | 지금 카드 넘기기 (되돌리기 없음) |
| POST | `/me/daily/heart` | 지금 카드에 하트 (429 하루 제한, 상대가 먼저 보냈으면 즉시 매칭 `matched:true`) |
| POST | `/me/hearts/:id` `{accept}` | 받은 하트 응답 (수락 → 매칭, 거절은 상대에게 알리지 않음) |
| GET | `/admin/stats` | 대시보드 |
| GET | `/admin/applicants?reveal=1` | 목록(기본 이름 마스킹, reveal 시 기록) |
| GET/PUT/DELETE | `/admin/applicants/:id` | 상세(열람 기록) / 수정 / 삭제 |
| PATCH | `/admin/applicants/status` `{ids,status}` | 일괄 상태 변경 |
| GET | `/admin/applicants/:id/candidates` | 추천 후보 |
| GET/POST | `/admin/matches` | 매칭 목록 / 제안 `{aId,bId,memo}` (409 진행 중 매칭 있음) |
| PATCH/DELETE | `/admin/matches/:id` | 상태·메모 변경 / 삭제 |
| GET/POST | `/admin/codes/:group` | 기준정보 목록(쓰는 신청서 수 포함) / 추가 |
| PATCH/DELETE | `/admin/codes/:group/:code` | 이름·순서·사용·상위·보조 값 변경 / 삭제(409 사용 중) |
| GET | `/admin/audit-logs` | 열람 기록 |
| POST | `/admin/audit-logs/export` `{count}` | 엑셀 내려받기 기록 |

응답 형태·오류 코드는 `client/src/api/mock/index.js`와 동일하게 구현한다.

## 6. 매칭 로직 (`client/src/api/core/matching.js` — 화면 test 모드와 서버가 함께 씀)

- **제외**: 같은 성별, 매칭 완료·보류, 진행 중 매칭 있음, 과거에 맺어졌던 상대, 서로의 피하고 싶은 범위(같은 팀 = 같은 사업부+팀명, 같은 건물, 같은 사업부), 양쪽 모두 선호 나이 밖
- **선호 적합도(0~100)**: 내가 채운 선호 항목만 계산. 우선순위 1~5위 가중치 5·4·3·2·1, 우선순위 밖 항목 0.5. 취미는 하나라도 겹치면 일치
- **최종 점수** = (내 선호 적합도 + 상대 선호 적합도) / 2. 동점이면 같은/가까운 캠퍼스(권역) → 겹치는 취미 순
- **오늘의 후보**: KST 자정 기준 하루 1회 상위 3명 확정. 최근 30일 안에 본 사람·이미 하트를 보낸 사람·나에게 하트를 보낸 사람(받은 하트에 따로 표시)은 제외. 오늘 신청서를 고쳐도 오늘 후보는 그대로, 내일부터 반영
- **하트**: 하루 1개. 상대가 이미 나에게 하트를 보냈으면 즉시 `SA_MATCH(SOURCE=HEART, STATUS=ACCEPTED)`. 받은 하트 수락도 동일. 거절·무응답은 상대에게 보이지 않는다
- **본인 상태 표시**: 진행 중 매칭(PROPOSED/ACCEPTED/MET)이 있거나 내부 상태가 MATCHING/MATCHED면 '매칭 중', 그 외(접수·검토·보류·불발·거절)는 모두 '매칭 대기 중'
- 관리자 매칭: 제안 → 두 사람 `매칭 중`, 양측 수락/만남 완료 → `매칭 완료`, 불발·삭제 → `검토 중`으로 복귀

## 6-0. 신청서 잠금 · 후기 · 싫어요 제재

- **수정 잠금**: 본인 상태가 '매칭 중'이면 신청서 수정 불가(`PUT /applications/me` → 409 `EDIT_LOCKED`). 철회는 가능
- **이름**: 사내 인사정보 API 값으로만 저장. 신청 후 본인 화면·후보 카드는 초성 표시. **관리자 화면은 이름 전체 표시**(상세 열람·수정·엑셀은 기록)
- **관리자 권한**: `SA_ADMIN` 허용 사번 + 관리자 비밀번호 둘 다 맞아야 진입(허용 사번 아니면 403 `NOT_ADMIN`)
- **후기** (`PUT /me/review`, 서로 수락한 매칭만, 매칭 후 30일 안):
  | 만남 결과 | 추가 매칭 | 처리 |
  |---|---|---|
  | 만났어요 | 원하지 않음 | 매칭 유지(MET). 나중에 '추가 매칭 요청'으로 종료 가능 |
  | 만났어요 | 원함 | 매칭 종료(CLOSED) → 두 사람 모두 매칭 대기 중 |
  | 노쇼·일정 불일치·연락 두절 | 원함 | 매칭 불발(DECLINED) → 두 사람 모두 매칭 대기 중 |
  | 노쇼·일정 불일치·연락 두절 | 원하지 않음 | 불발 + 본인 매칭 쉬기(HOLD, 마이페이지 '다시 매칭 받기') |
  상대 평가(좋았어요/별로였어요)와 코멘트는 관리자만 본다. 매칭이 먼저 끝난 쪽 상대도 30일 안에 후기를 남길 수 있다
- **싫어요 제재**: 받은 '별로였어요'(+설정 시 노쇼 신고) 합계가 기준(기본 5) 이상이면 오늘의 후보·받은 하트·관리자 추천에서 모두 제외. 본인에게는 알리지 않음(대기 중 + '후보 준비 중'). 관리자 해제 가능(기록). 철회 시 횟수만 사번 기준 6개월 보관해 재가입 회피 방지
- **추천 정확도 유도**: 신청서에서 선택 항목(캠퍼스·건물·코멘트·태어난 시간·선호 항목)을 채우면 잠깐 안내 문구, 정확도 75% 미만으로 제출하면 1회 권유 팝업. 종교·사는 곳은 개인정보 최소 수집 원칙상 유도하지 않음

```sql
CREATE TABLE SA_REVIEW (
  REVIEW_ID   INT IDENTITY PRIMARY KEY,
  MATCH_ID    INT NOT NULL REFERENCES SA_MATCH(MATCH_ID),
  REVIEWER_ID INT NOT NULL, TARGET_ID INT NOT NULL,
  OUTCOME_CD  VARCHAR(10) NOT NULL,   -- MET/NOSHOW/NOT_MET/NO_CONTACT
  RATING_CD   VARCHAR(10) NOT NULL,   -- LIKE/DISLIKE (관리자 전용)
  WANT_MORE   BIT NOT NULL,
  COMMENT     NVARCHAR(300) NULL,     -- 관리자 전용
  CREATED_AT  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(), UPDATED_AT DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_SA_REVIEW UNIQUE (MATCH_ID, REVIEWER_ID)
);
CREATE TABLE SA_PENALTY (EMP_NO_HASH VARBINARY(32) PRIMARY KEY, DISLIKE_CNT INT NOT NULL, SAVED_AT DATETIME2 NOT NULL); -- 6개월 후 배치 파기
CREATE TABLE SA_VOC (
  VOC_ID INT IDENTITY PRIMARY KEY, CATEGORY_CD VARCHAR(10) NOT NULL, TITLE NVARCHAR(60) NOT NULL, CONTENT NVARCHAR(1000) NOT NULL,
  ANONYMOUS BIT NOT NULL, OWNER_HASH VARBINARY(32) NULL,  -- 내 글 보기용 솔트 해시 (사번 원문 저장 안 함)
  AUTHOR_LABEL NVARCHAR(60) NULL,                          -- 실명 글만: 초성·팀
  STATUS_CD VARCHAR(10) NOT NULL DEFAULT 'RECEIVED', REPLY NVARCHAR(500) NULL,
  CREATED_AT DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(), UPDATED_AT DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE TABLE SA_SETTING (SETTING_KEY VARCHAR(40) PRIMARY KEY, SETTING_VALUE NVARCHAR(200) NOT NULL);
```

추가 API: `PUT /me/review`, `POST /me/resume`, `POST /voc`, `GET /voc/mine`, `GET /admin/reviews`, `POST /admin/applicants/:id/reset-dislikes`, `GET/PATCH /admin/voc[/:id]`, `GET/PATCH /admin/settings`. 대시보드 `byDivision[].ratio`(%)·`settings.showDivisionRatio`

## 6-0-1. 후보 카드 · 궁합

- 카드: 얼굴상 동물 아이콘(아바타) · 닉네임 · 초성 · 만 나이 · 사업부/캠퍼스 · 진지한 만남 배지 · 점수 옆 '잘 맞는 부분' 문장
  - 문장은 서로의 선호를 함께 만족하는 항목 우선 2개를 서술형으로 (예: '주말을 보내는 방식과 대화의 결이 잘 맞아요')
- 오늘의 인연 오른쪽: **나와 후보의 사주 궁합** — 일간 오행 상생/같음/상극 + 띠 육합·삼합·충 + 서로 없는 오행 보완. 서버가 계산해 점수·문장만 내려주고 상대 생년월일은 보내지 않는다

## 6-1. 인연 사주 (`client/src/utils/saju.js`)

- `lunar-javascript` 1.7.7(MIT, 외부 통신 없음)로 절기 기준 사주 4주 계산. 시간은 서울 경도 보정 -30분, 자시(23시~) 일주는 다음 날로 봄
- 일간 성향·오행 분포·끌리는 사람(부족한 오행)·편안한 사람(나를 생하는 오행)·오늘의 연애운(오늘 일진과 일간의 생극 관계 + 생년월일·날짜 고정 시드)
- 서버로 보내지 않고 저장하지 않는다. 매칭 점수에 쓰지 않는다(오락용)

## 6-2. 이번 추가 규칙

- **하트 블록**: 하트(오늘의 인연·사주)를 보내면 상대가 답하거나 72시간이 지나 만료될 때까지 새 후보를 받지 않고 **신청서도 잠긴다**(`HEART_PENDING`, `EDIT_LOCKED`)
- **사주 하트**: 신청 전이면 필수 항목(닉네임·진지한 만남·키·체형·얼굴상·외모·MBTI·취미·음주·흡연·선호 나이·동의)만 받는 팝업 → `POST /saju/apply`(신청 생성 + 하트). 이름·성별·사업부·팀은 인사정보, 생년월일은 사주 입력값, 선호 우선순위 '나이'·피하기 '같은 팀' 기본값. 신청 후면 `POST /saju/heart`. 사주 추천 점수는 실제 궁합과 90~97 중 높은 값(재미 연출)
- **'나도 하트 보내기'**: 받은 하트에 응답하는 버튼 이름(예전 '하트 돌려주기')
- **커플 최종 완료**: 홈의 매칭 카드 [커플이 되었어요 · 최종 완료] 또는 후기 '앞으로는?'에서 💑 선택 → 매칭 `COUPLE`, 두 사람 `COUPLED`(본인 상태 '커플 성사'), 새 후보·하트·매칭 쪽지 종료, 신청서 잠금. '다시 인연 찾기'로 대기 중 복귀
- **블랙리스트**: `SA_BLACKLIST(empNo, reason, at, by)`. 등록 사번은 신청·사주 하트 불가(403 `BLACKLISTED`), 이미 낸 신청서는 추천 풀에서 제외·진행 중 하트 만료. 본인에게는 '신청할 수 없는 계정'만 표시
- **쪽지**: 메일함 형태. 각자 휴지통/영구 삭제(`box[신청자id]`), 상대 쪽지함에는 남음. 연속 발송 제한은 '상대 답장 이후 내가 연달아 보낸 수' 기준(429 `MESSAGE_BURST`). 담당자는 운영·신고 대응 목적으로 매칭 쪽지 열람 가능(감사 로그 `VIEW_MESSAGES`)
- **선호 연상·연하·동갑**(`prefAgeGap`): 고정 목록 OLDER/SAME/YOUNGER, 출생 연도로 판정
- **성별 변경**: 관련 하트·오늘의 인연·본 이력 삭제 + 다른 사람의 오늘의 인연에서도 제거
- **로그인**: 사내 SSO(`POST /auth/sso`)로 확인되면 로그인 화면 없이 홈. 실패하면 로그인 화면
- **모집 팝업**: 관리자 설정 `gatheringPopup`이 켜져 있으면 로그인 세션당 1번 '두근두근' 팝업(참여 인원 등 숫자 없음)
- **엑셀 모드**: 우상단 버튼 또는 Ctrl+Shift+E. 스프레드시트처럼 보이는 껍데기(리본·수식줄·행/열 머리·시트 탭=메뉴)와 가짜 탭 제목·아이콘. 세션 동안 유지, 상태 표시줄 '기본 보기'로 해제

## 6-3. 상태 검사 — 화면이 아니라 API에서 막을 것

화면은 버튼을 숨길 뿐이라, 아래 검사는 서버가 반드시 해야 한다(mock `src/api/mock/index.js`의 `matchingBlockOf`·`assertCanMatch`).

| 대상 API | 막는 경우 → 오류 코드 |
|---|---|
| 오늘의 인연 넘기기·하트(`/me/daily/*`), 받은 하트 수락, 사주 하트(`/saju/heart`, `/saju/apply`) | 블랙리스트 `BLACKLISTED`(403) · 커플 완료 `COUPLED` · 매칭 중 `MATCHING` · 오픈 전 매칭 멈춤 `MATCHING_PAUSED` · 보류·스스로 쉬기·싫어요 제재 `PAUSED`(제재 사실은 알리지 않음) |
| 오늘의 인연 넘기기·하트 | 간편(임시) 신청 `QUICK` — 신청서를 마저 쓰면 열린다 |
| 받은 하트 목록(`/me/dashboard` inbox) | 위 '하트를 주고받을 수 없는 상태'면 빈 목록 |

- **간편(임시) 신청**: `/saju/apply`로 만든 신청서는 `QUICK_YN=1`. 오늘의 인연이 열리지 않고, 보낸 하트에 답을 기다리는 중에도 신청서를 마저 채울 수 있다(일반 신청자는 하트 대기 중 수정 잠금). 신청서를 저장하면 `QUICK_YN=0`
- **사주 하트 신청**: 상대가 하트를 받을 수 없는 상태(성별·상태 변화)면 신청서를 만들기 전에 409 `CANDIDATE_GONE` — 신청서만 생기고 하트는 실패하는 일이 없게 한다
- **관리자 상태 지정**: 접수·검토 중·보류만 직접 지정(`DERIVED_STATUS` 400). 매칭 중·매칭 완료·커플 완료는 매칭 상태에서 저절로 정해진다
- **매칭 제안·되살리기**: 자기 자신 400, 두 사람 중 누구라도 다른 진행 중 매칭·커플이 있으면 409 `MATCH_BUSY`(불발·종료된 매칭을 다시 진행·커플로 바꿀 때도 같음)
- **커플 해제**: 커플 매칭이 끝나거나 삭제되거나 상대가 탈퇴하면 남은 사람은 '검토 중'(본인 화면 '매칭 대기 중')으로 돌아간다
- **후기**: 모든 검증을 끝낸 뒤 저장한다(커플 완료는 '만났어요'일 때만)
- **이름·팀 검증**: 인사정보 값이라 글자 종류만 본다 — 외국인 이름(Anne-Marie), 가운뎃점, `/ . , +`가 든 팀 이름도 통과

## 7. 보안 설계 ("100% 기밀"을 실제로 뒷받침하는 장치)

1. **임직원 인증(사내 로그인)**: 사내 계정(AD/LDAP bind) 또는 사내 SSO(SAML/OIDC)로 확인 + 인사 DB 재직 뷰로 재직 여부 판단. 비밀번호는 저장하지 않음
2. **관리자 이중 확인**: `SA_ADMIN` 허용 사번 + 별도 관리자 비밀번호(bcrypt 해시는 `.env`) · 5회 실패 시 10분 잠금 · 30분 무활동 자동 종료(슬라이딩)
3. **세션**: HttpOnly + Secure + SameSite=Strict 쿠키, 상태 변경 요청은 `X-Requested-With` 헤더 필수, 로그인 rate limit
4. **암호화**: 이름 AES-256-GCM(키는 `.env`/키 관리 시스템), DB TDE, 전 구간 TLS. 연락처는 받지 않고 매칭 시 사내 메일(인사 정보)로 안내
5. **최소 노출**: 후보 카드는 이름 초성·팀/건물/외모/종교 미노출. 관리자 화면은 매칭 업무상 이름 전체를 보되, 상세 열람·수정·삭제·엑셀·쪽지 열람은 전부 기록. 관리 메모·내부 상태는 본인에게도 비공개 (홈의 '100% 기밀 보장'은 '신청 사실은 상대방이 전혀 몰라요'·'개인정보는 암호화해 보관해요'를 약속한다 — 이 동작과 같게 유지할 것)
5-1. **거절 비노출**: 하트 거절·무응답·관리자 불발은 본인 화면에서 모두 '매칭 대기 중'으로만 보인다
6. **방문 사실 보호**: 일반 임직원의 로그인/방문은 관리자 화면에 남기지 않음(서버 보안 로그에만 단기 보관)
7. **파기**: 철회 즉시 완전 삭제, 매칭 종료 6개월 후 배치 파기. 종교는 민감정보 별도 동의 시에만 저장
8. **운영 전 체크**: 사내 정보보호 심의·개인정보 처리 협의, 외부 CDN 미사용(폰트 포함 전부 번들)

## 7-1. 로그인 · 역할 · 관리자 주소

- **사용자**(`/`): 사내 SSO(`SSO_MODE` header/api) → 안 되면 로그인 화면(`AUTH_LOGIN_URL`). 서버는 인사정보(Profile: 사번·계정·이름·성별·사업부·팀·메일·재직)를 받아 임직원 목록에 저장하고 세션을 만든다
- **역할**: `/auth/me`·로그인 응답의 `user.role` = `ADMIN`(admins.js에 있는 계정) · `APPLICANT`(신청서 있음) · `GUEST`(신청 전), `user.applicant.userStatus` = WAITING/MATCHING/COUPLED. 화면은 이 값으로 소개 화면·매칭 보드를 나누고 헤더에 상태를 보여준다
- **관리자**: 사용자 화면에는 진입 버튼이 없다. 별도 주소(`ADMIN_PATH`, 기본 `/changeme`) → 사내 계정 확인 → 관리자 계정 여부 → 관리자 비밀번호(평문 또는 bcrypt 해시) → 관리 화면. 실패 횟수는 사번 기준으로 세서 쿠키를 지워도 잠금이 풀리지 않는다

## 8. 폴더 구조

```
sa/
├─ docs/DESIGN.md
├─ client/                     Vue 3 + DevExtreme
│  ├─ public/sayeon.config.js  test/open 모드·관리자 주소 (개발용, 운영은 서버가 내려줌)
│  └─ src/
│     ├─ api/core/service.js   ★ 업무 규칙 (서버와 공용)
│     ├─ api/core/matching.js  매칭 점수
│     ├─ api/mock/             test 모드 어댑터 · 가짜 데이터 · accounts.js(테스트 계정)
│     ├─ api/http.js           운영 모드 API 호출
│     └─ views · components · layouts · constants · utils · styles
└─ server/                     Node.js + Express + MSSQL (PM2)
   ├─ .env / .env.example      ★ 서버·DB·세션·SSO 설정
   ├─ config/admins.js         ★ 관리자 계정·비밀번호 (예시: admins.example.js)
   ├─ src/sso.js               ★ 사내 AD/SSO 연동
   ├─ src/store.js             MSSQL 저장 (SA_DOC)
   ├─ src/app.js · routes.js   Express 조립 · /api 경로
   ├─ ecosystem.config.cjs     PM2 설정 (인스턴스 1개)
   └─ scripts/check.js · hash-password.js
```

## 9. 다음 단계

1. 사내 인증 API 사양 확인 → `server/src/sso.js`의 필드 이름·`.env` 주소 채우기
2. 오픈 전: `sa` 대신 사緣 DB 전용 로그인으로 교체, 정보보호 심의, `DATA_KEY` 별도 보관
3. 오픈 후: `.env`의 `SERVICE_MODE=open` 확인, 필요하면 `VITE_INCLUDE_MOCK=false`로 다시 빌드해 test 코드 제거
