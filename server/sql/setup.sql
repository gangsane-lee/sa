/* ════════════════════════════════════════════════════════════════════
   사緣 DB 준비 — DB 담당자용 (npm run db:setup 과 같은 작업의 SQL 버전)

   DB 서버: 10.166.101.127 (MSSQL)
   실행: SSMS에서 sa(또는 sysadmin) 계정으로 접속 → 아래 세 값만 바꾸고 → 전체 실행(F5)
   여러 번 실행해도 안전하다 — 이미 있는 것은 건너뛴다.

   하는 일
     1) 데이터베이스가 없으면 만든다
     2) 앱 전용 로그인이 없으면 만든다 (비밀번호 만료 없음). 사용 중지 상태면 사용으로 바꾼다
     3) DB 사용자를 만들거나(없으면), 끊긴 연결을 다시 잇는다(DB 복원 후)
     4) 읽기·쓰기 권한만 준다 (db_datareader · db_datawriter)
     5) 목적별 표(dbo.SA_APPLICANT · SA_MATCH · SA_HEART · SA_MESSAGE …)가 없으면 만든다 (표·열 설명 포함)
     6) 결과를 표로 보여준다

   끝나면 server/.env 에  DB_USER=@AppLogin 값, DB_PASSWORD=@AppPass 값, DB_AUTO_CREATE=false
   ════════════════════════════════════════════════════════════════════ */

DECLARE @DbName   sysname       = N'sasystem';          -- servers.config.mjs 의 db.name
DECLARE @AppLogin sysname       = N'sasystem_app';        -- server/.env 의 DB_USER
DECLARE @AppPass  nvarchar(128) = N'여기에_새_비밀번호';  -- server/.env 의 DB_PASSWORD (8자 이상, 대·소문자·숫자·특수문자 중 3종류)

/* 이미 있는 로그인의 비밀번호를 위 값으로 바꾸려면 1 (기본 0: 바꾸지 않음) */
DECLARE @ResetPassword bit = 0;

SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @sql nvarchar(max);

IF @DbName NOT LIKE N'%[^A-Za-z0-9_]%' AND LEN(@DbName) > 0 AND @AppLogin NOT LIKE N'%[^A-Za-z0-9_]%' AND LEN(@AppLogin) > 0
  PRINT N'설정 확인: DB ' + @DbName + N' · 로그인 ' + @AppLogin;
ELSE
BEGIN
  RAISERROR(N'DB 이름과 로그인 이름에는 영문·숫자·_ 만 쓸 수 있어요.', 16, 1);
  RETURN;
END

IF IS_SRVROLEMEMBER('sysadmin') <> 1
  PRINT N'⚠ 지금 계정은 sysadmin 이 아니에요. 권한이 모자라면 중간에 실패할 수 있어요.';

/* 1) 데이터베이스 */
IF DB_ID(@DbName) IS NULL
BEGIN
  SET @sql = N'CREATE DATABASE ' + QUOTENAME(@DbName);
  EXEC (@sql);
  PRINT N'✔ 데이터베이스를 만들었어요';
END
ELSE
  PRINT N'✔ 데이터베이스가 이미 있어요';

/* 2) 로그인 */
IF SUSER_ID(@AppLogin) IS NULL
BEGIN
  SET @sql = N'CREATE LOGIN ' + QUOTENAME(@AppLogin)
           + N' WITH PASSWORD = ' + QUOTENAME(@AppPass, '''')
           + N', DEFAULT_DATABASE = ' + QUOTENAME(@DbName)
           + N', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF';
  EXEC (@sql);
  PRINT N'✔ 로그인을 만들었어요';
END
ELSE
BEGIN
  PRINT N'✔ 로그인이 이미 있어요';
  IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = @AppLogin AND is_disabled = 1)
  BEGIN
    SET @sql = N'ALTER LOGIN ' + QUOTENAME(@AppLogin) + N' ENABLE';
    EXEC (@sql);
    PRINT N'✔ 사용 중지 상태라 사용으로 바꿨어요';
  END
  IF @ResetPassword = 1
  BEGIN
    SET @sql = N'ALTER LOGIN ' + QUOTENAME(@AppLogin) + N' WITH PASSWORD = ' + QUOTENAME(@AppPass, '''')
             + N', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF';
    EXEC (@sql);
    PRINT N'✔ 비밀번호를 바꿨어요';
  END
END

/* 3) DB 사용자 · 4) 권한 — 그 DB 안에서 실행 */
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
DECLARE @s nvarchar(400);
DECLARE @user sysname =
  (SELECT dp.name FROM sys.database_principals dp JOIN sys.server_principals sp ON sp.sid = dp.sid WHERE sp.name = @login);

IF @user IS NOT NULL
  PRINT N''✔ DB 사용자가 이미 있어요 ('' + @user + N'')'';
ELSE IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @login)
BEGIN
  SET @s = N''ALTER USER '' + QUOTENAME(@login) + N'' WITH LOGIN = '' + QUOTENAME(@login);
  EXEC (@s);
  SET @user = @login;
  PRINT N''✔ 끊겨 있던 사용자-로그인 연결을 다시 이었어요 (DB 복원 후 흔한 상태)'';
END
ELSE
BEGIN
  SET @s = N''CREATE USER '' + QUOTENAME(@login) + N'' FOR LOGIN '' + QUOTENAME(@login) + N'' WITH DEFAULT_SCHEMA = dbo'';
  EXEC (@s);
  SET @user = @login;
  PRINT N''✔ DB 사용자를 만들었어요'';
END

IF @user = N''dbo''
  PRINT N''✔ 이 로그인은 DB 소유자(dbo)라 모든 권한이 있어요'';
ELSE
BEGIN
  IF IS_ROLEMEMBER(N''db_datareader'', @user) = 0
  BEGIN
    SET @s = N''ALTER ROLE db_datareader ADD MEMBER '' + QUOTENAME(@user);
    EXEC (@s);
  END
  IF IS_ROLEMEMBER(N''db_datawriter'', @user) = 0
  BEGIN
    SET @s = N''ALTER ROLE db_datawriter ADD MEMBER '' + QUOTENAME(@user);
    EXEC (@s);
  END
  PRINT N''✔ 읽기·쓰기 권한(db_datareader · db_datawriter)'';
END';
EXEC sp_executesql @sql, N'@login sysname', @login = @AppLogin;

/* 5) 표 — 목적별(신청서·매칭·하트·쪽지 …). 서버(server/shared/db/tables.js)와 같은 정의. 없는 표만 만든다 */
/* @@TABLES-BEGIN (npm run sql:tables 가 만든 부분 — 직접 고치지 않는다) */
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
IF OBJECT_ID(N''dbo.SA_APPLICANT'', N''U'') IS NULL
BEGIN
  CREATE TABLE dbo.SA_APPLICANT (
    ID INT NOT NULL,
    EMP_NO NVARCHAR(30) NULL,
    NAME NVARCHAR(1000) NULL,
    NICKNAME NVARCHAR(50) NULL,
    GENDER NVARCHAR(1) NULL,
    BIRTH_YEAR INT NULL,
    DIVISION NVARCHAR(30) NULL,
    TEAM NVARCHAR(100) NULL,
    STATUS NVARCHAR(20) NULL,
    IS_QUICK BIT NULL,
    IS_TEST BIT NULL,
    CREATED_AT DATETIME2(3) NULL,
    MODIFIED_AT DATETIME2(3) NULL,
    DATA_JSON NVARCHAR(MAX) NOT NULL,
    SAVED_AT DATETIME2(3) NOT NULL CONSTRAINT DF_SA_APPLICANT_SAVED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_APPLICANT PRIMARY KEY (ID)
  );
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사緣 신청서 — 원본은 DATA_JSON, 앞쪽 열은 보기용. 수정은 관리자 화면 ''''DB 표''''에서'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_APPLICANT'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''신청 번호'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_APPLICANT'', N''COLUMN'', N''ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사번'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_APPLICANT'', N''COLUMN'', N''EMP_NO'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''이름(암호화)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_APPLICANT'', N''COLUMN'', N''NAME'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''닉네임'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_APPLICANT'', N''COLUMN'', N''NICKNAME'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''성별 M/F'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_APPLICANT'', N''COLUMN'', N''GENDER'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''출생연도'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_APPLICANT'', N''COLUMN'', N''BIRTH_YEAR'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사업부 코드'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_APPLICANT'', N''COLUMN'', N''DIVISION'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''팀'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_APPLICANT'', N''COLUMN'', N''TEAM'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''진행 상태'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_APPLICANT'', N''COLUMN'', N''STATUS'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사주 간편 신청'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_APPLICANT'', N''COLUMN'', N''IS_QUICK'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''개발 테스트 데이터'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_APPLICANT'', N''COLUMN'', N''IS_TEST'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''신청 시각'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_APPLICANT'', N''COLUMN'', N''CREATED_AT'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 수정'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_APPLICANT'', N''COLUMN'', N''MODIFIED_AT'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''행 전체 원본(JSON) — 서버가 이 값으로 데이터를 읽는다'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_APPLICANT'', N''COLUMN'', N''DATA_JSON'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 저장 시각(UTC)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_APPLICANT'', N''COLUMN'', N''SAVED_AT'';
END
';
EXEC (@sql);
PRINT N'✔ 표 dbo.SA_APPLICANT (신청서)';
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
IF OBJECT_ID(N''dbo.SA_EMPLOYEE'', N''U'') IS NULL
BEGIN
  CREATE TABLE dbo.SA_EMPLOYEE (
    EMP_NO NVARCHAR(30) NOT NULL,
    NAME NVARCHAR(1000) NULL,
    AD_ID NVARCHAR(100) NULL,
    DIVISION NVARCHAR(30) NULL,
    TEAM NVARCHAR(100) NULL,
    GENDER NVARCHAR(1) NULL,
    RETIRED BIT NULL,
    IS_TEST BIT NULL,
    DATA_JSON NVARCHAR(MAX) NOT NULL,
    SAVED_AT DATETIME2(3) NOT NULL CONSTRAINT DF_SA_EMPLOYEE_SAVED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_EMPLOYEE PRIMARY KEY (EMP_NO)
  );
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사緣 임직원(로그인한 사람) — 원본은 DATA_JSON, 앞쪽 열은 보기용. 수정은 관리자 화면 ''''DB 표''''에서'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_EMPLOYEE'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사번'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_EMPLOYEE'', N''COLUMN'', N''EMP_NO'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''이름(암호화)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_EMPLOYEE'', N''COLUMN'', N''NAME'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사내 계정 ID'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_EMPLOYEE'', N''COLUMN'', N''AD_ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사업부 코드'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_EMPLOYEE'', N''COLUMN'', N''DIVISION'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''팀'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_EMPLOYEE'', N''COLUMN'', N''TEAM'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''성별'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_EMPLOYEE'', N''COLUMN'', N''GENDER'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''퇴직·휴직'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_EMPLOYEE'', N''COLUMN'', N''RETIRED'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''개발 테스트 계정'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_EMPLOYEE'', N''COLUMN'', N''IS_TEST'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''행 전체 원본(JSON) — 서버가 이 값으로 데이터를 읽는다'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_EMPLOYEE'', N''COLUMN'', N''DATA_JSON'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 저장 시각(UTC)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_EMPLOYEE'', N''COLUMN'', N''SAVED_AT'';
END
';
EXEC (@sql);
PRINT N'✔ 표 dbo.SA_EMPLOYEE (임직원(로그인한 사람))';
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
IF OBJECT_ID(N''dbo.SA_MATCH'', N''U'') IS NULL
BEGIN
  CREATE TABLE dbo.SA_MATCH (
    ID INT NOT NULL,
    A_ID INT NULL,
    B_ID INT NULL,
    STATUS NVARCHAR(20) NULL,
    SCORE INT NULL,
    SOURCE NVARCHAR(20) NULL,
    CREATED_AT DATETIME2(3) NULL,
    ACCEPTED_AT DATETIME2(3) NULL,
    COUPLED_AT DATETIME2(3) NULL,
    DATA_JSON NVARCHAR(MAX) NOT NULL,
    SAVED_AT DATETIME2(3) NOT NULL CONSTRAINT DF_SA_MATCH_SAVED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_MATCH PRIMARY KEY (ID)
  );
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사緣 매칭 — 원본은 DATA_JSON, 앞쪽 열은 보기용. 수정은 관리자 화면 ''''DB 표''''에서'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MATCH'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''매칭 번호'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MATCH'', N''COLUMN'', N''ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''신청 번호 A'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MATCH'', N''COLUMN'', N''A_ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''신청 번호 B'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MATCH'', N''COLUMN'', N''B_ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''상태'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MATCH'', N''COLUMN'', N''STATUS'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''점수'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MATCH'', N''COLUMN'', N''SCORE'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''만든 방법'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MATCH'', N''COLUMN'', N''SOURCE'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''만든 시각'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MATCH'', N''COLUMN'', N''CREATED_AT'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''서로 수락'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MATCH'', N''COLUMN'', N''ACCEPTED_AT'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''커플 완료'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MATCH'', N''COLUMN'', N''COUPLED_AT'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''행 전체 원본(JSON) — 서버가 이 값으로 데이터를 읽는다'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MATCH'', N''COLUMN'', N''DATA_JSON'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 저장 시각(UTC)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MATCH'', N''COLUMN'', N''SAVED_AT'';
END
';
EXEC (@sql);
PRINT N'✔ 표 dbo.SA_MATCH (매칭)';
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
IF OBJECT_ID(N''dbo.SA_HEART'', N''U'') IS NULL
BEGIN
  CREATE TABLE dbo.SA_HEART (
    ID INT NOT NULL,
    FROM_ID INT NULL,
    TO_ID INT NULL,
    STATUS NVARCHAR(20) NULL,
    SOURCE NVARCHAR(20) NULL,
    SENT_AT DATETIME2(3) NULL,
    ANSWERED_AT DATETIME2(3) NULL,
    DATA_JSON NVARCHAR(MAX) NOT NULL,
    SAVED_AT DATETIME2(3) NOT NULL CONSTRAINT DF_SA_HEART_SAVED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_HEART PRIMARY KEY (ID)
  );
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사緣 하트 — 원본은 DATA_JSON, 앞쪽 열은 보기용. 수정은 관리자 화면 ''''DB 표''''에서'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_HEART'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''하트 번호'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_HEART'', N''COLUMN'', N''ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''보낸 신청 번호'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_HEART'', N''COLUMN'', N''FROM_ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''받은 신청 번호'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_HEART'', N''COLUMN'', N''TO_ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''상태'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_HEART'', N''COLUMN'', N''STATUS'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''보낸 곳'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_HEART'', N''COLUMN'', N''SOURCE'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''보낸 시각'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_HEART'', N''COLUMN'', N''SENT_AT'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''응답 시각'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_HEART'', N''COLUMN'', N''ANSWERED_AT'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''행 전체 원본(JSON) — 서버가 이 값으로 데이터를 읽는다'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_HEART'', N''COLUMN'', N''DATA_JSON'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 저장 시각(UTC)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_HEART'', N''COLUMN'', N''SAVED_AT'';
END
';
EXEC (@sql);
PRINT N'✔ 표 dbo.SA_HEART (하트)';
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
IF OBJECT_ID(N''dbo.SA_REVIEW'', N''U'') IS NULL
BEGIN
  CREATE TABLE dbo.SA_REVIEW (
    ID INT NOT NULL,
    MATCH_ID INT NULL,
    REVIEWER_ID INT NULL,
    TARGET_ID INT NULL,
    OUTCOME NVARCHAR(20) NULL,
    RATING NVARCHAR(20) NULL,
    CREATED_AT DATETIME2(3) NULL,
    MODIFIED_AT DATETIME2(3) NULL,
    DATA_JSON NVARCHAR(MAX) NOT NULL,
    SAVED_AT DATETIME2(3) NOT NULL CONSTRAINT DF_SA_REVIEW_SAVED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_REVIEW PRIMARY KEY (ID)
  );
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사緣 후기 — 원본은 DATA_JSON, 앞쪽 열은 보기용. 수정은 관리자 화면 ''''DB 표''''에서'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_REVIEW'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''후기 번호'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_REVIEW'', N''COLUMN'', N''ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''매칭 번호'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_REVIEW'', N''COLUMN'', N''MATCH_ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''쓴 사람(신청 번호)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_REVIEW'', N''COLUMN'', N''REVIEWER_ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''상대(신청 번호)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_REVIEW'', N''COLUMN'', N''TARGET_ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''만남 결과'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_REVIEW'', N''COLUMN'', N''OUTCOME'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''평가'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_REVIEW'', N''COLUMN'', N''RATING'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''쓴 시각'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_REVIEW'', N''COLUMN'', N''CREATED_AT'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 수정'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_REVIEW'', N''COLUMN'', N''MODIFIED_AT'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''행 전체 원본(JSON) — 서버가 이 값으로 데이터를 읽는다'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_REVIEW'', N''COLUMN'', N''DATA_JSON'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 저장 시각(UTC)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_REVIEW'', N''COLUMN'', N''SAVED_AT'';
END
';
EXEC (@sql);
PRINT N'✔ 표 dbo.SA_REVIEW (후기)';
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
IF OBJECT_ID(N''dbo.SA_MESSAGE'', N''U'') IS NULL
BEGIN
  CREATE TABLE dbo.SA_MESSAGE (
    ID INT NOT NULL,
    THREAD NVARCHAR(20) NULL,
    FROM_ID INT NULL,
    TO_ID INT NULL,
    FROM_ADMIN BIT NULL,
    SENT_AT DATETIME2(3) NULL,
    READ_AT DATETIME2(3) NULL,
    BODY_PREVIEW NVARCHAR(100) NULL,
    DATA_JSON NVARCHAR(MAX) NOT NULL,
    SAVED_AT DATETIME2(3) NOT NULL CONSTRAINT DF_SA_MESSAGE_SAVED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_MESSAGE PRIMARY KEY (ID)
  );
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사緣 쪽지 — 원본은 DATA_JSON, 앞쪽 열은 보기용. 수정은 관리자 화면 ''''DB 표''''에서'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MESSAGE'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''쪽지 번호'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MESSAGE'', N''COLUMN'', N''ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''대화방 (A=담당자 · M=매칭)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MESSAGE'', N''COLUMN'', N''THREAD'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''보낸 신청 번호'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MESSAGE'', N''COLUMN'', N''FROM_ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''받은 신청 번호'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MESSAGE'', N''COLUMN'', N''TO_ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''담당자가 보냄'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MESSAGE'', N''COLUMN'', N''FROM_ADMIN'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''보낸 시각'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MESSAGE'', N''COLUMN'', N''SENT_AT'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''읽은 시각'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MESSAGE'', N''COLUMN'', N''READ_AT'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''내용 앞부분'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MESSAGE'', N''COLUMN'', N''BODY_PREVIEW'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''행 전체 원본(JSON) — 서버가 이 값으로 데이터를 읽는다'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MESSAGE'', N''COLUMN'', N''DATA_JSON'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 저장 시각(UTC)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_MESSAGE'', N''COLUMN'', N''SAVED_AT'';
END
';
EXEC (@sql);
PRINT N'✔ 표 dbo.SA_MESSAGE (쪽지)';
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
IF OBJECT_ID(N''dbo.SA_VOC'', N''U'') IS NULL
BEGIN
  CREATE TABLE dbo.SA_VOC (
    ID INT NOT NULL,
    CATEGORY NVARCHAR(20) NULL,
    STATUS NVARCHAR(20) NULL,
    TITLE NVARCHAR(100) NULL,
    AUTHOR NVARCHAR(1000) NULL,
    CREATED_AT DATETIME2(3) NULL,
    DATA_JSON NVARCHAR(MAX) NOT NULL,
    SAVED_AT DATETIME2(3) NOT NULL CONSTRAINT DF_SA_VOC_SAVED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_VOC PRIMARY KEY (ID)
  );
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사緣 개선의 소리 — 원본은 DATA_JSON, 앞쪽 열은 보기용. 수정은 관리자 화면 ''''DB 표''''에서'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_VOC'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''글 번호'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_VOC'', N''COLUMN'', N''ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''분류'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_VOC'', N''COLUMN'', N''CATEGORY'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''처리 상태'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_VOC'', N''COLUMN'', N''STATUS'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''제목'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_VOC'', N''COLUMN'', N''TITLE'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''작성자(암호화)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_VOC'', N''COLUMN'', N''AUTHOR'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''쓴 시각'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_VOC'', N''COLUMN'', N''CREATED_AT'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''행 전체 원본(JSON) — 서버가 이 값으로 데이터를 읽는다'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_VOC'', N''COLUMN'', N''DATA_JSON'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 저장 시각(UTC)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_VOC'', N''COLUMN'', N''SAVED_AT'';
END
';
EXEC (@sql);
PRINT N'✔ 표 dbo.SA_VOC (개선의 소리)';
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
IF OBJECT_ID(N''dbo.SA_BLACKLIST'', N''U'') IS NULL
BEGIN
  CREATE TABLE dbo.SA_BLACKLIST (
    EMP_NO NVARCHAR(30) NOT NULL,
    REASON NVARCHAR(200) NULL,
    ADDED_AT DATETIME2(3) NULL,
    ADDED_BY NVARCHAR(50) NULL,
    DATA_JSON NVARCHAR(MAX) NOT NULL,
    SAVED_AT DATETIME2(3) NOT NULL CONSTRAINT DF_SA_BLACKLIST_SAVED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_BLACKLIST PRIMARY KEY (EMP_NO)
  );
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사緣 블랙리스트 — 원본은 DATA_JSON, 앞쪽 열은 보기용. 수정은 관리자 화면 ''''DB 표''''에서'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_BLACKLIST'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사번'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_BLACKLIST'', N''COLUMN'', N''EMP_NO'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''등록 사유'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_BLACKLIST'', N''COLUMN'', N''REASON'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''등록 시각'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_BLACKLIST'', N''COLUMN'', N''ADDED_AT'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''등록한 담당자'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_BLACKLIST'', N''COLUMN'', N''ADDED_BY'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''행 전체 원본(JSON) — 서버가 이 값으로 데이터를 읽는다'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_BLACKLIST'', N''COLUMN'', N''DATA_JSON'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 저장 시각(UTC)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_BLACKLIST'', N''COLUMN'', N''SAVED_AT'';
END
';
EXEC (@sql);
PRINT N'✔ 표 dbo.SA_BLACKLIST (블랙리스트)';
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
IF OBJECT_ID(N''dbo.SA_DAILY_PICK'', N''U'') IS NULL
BEGIN
  CREATE TABLE dbo.SA_DAILY_PICK (
    APPLICANT_ID INT NOT NULL,
    PICK_DATE NVARCHAR(10) NULL,
    DATA_JSON NVARCHAR(MAX) NOT NULL,
    SAVED_AT DATETIME2(3) NOT NULL CONSTRAINT DF_SA_DAILY_PICK_SAVED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_DAILY_PICK PRIMARY KEY (APPLICANT_ID)
  );
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사緣 오늘의 후보 — 원본은 DATA_JSON, 앞쪽 열은 보기용. 수정은 관리자 화면 ''''DB 표''''에서'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_DAILY_PICK'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''신청 번호'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_DAILY_PICK'', N''COLUMN'', N''APPLICANT_ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''날짜(KST)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_DAILY_PICK'', N''COLUMN'', N''PICK_DATE'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''행 전체 원본(JSON) — 서버가 이 값으로 데이터를 읽는다'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_DAILY_PICK'', N''COLUMN'', N''DATA_JSON'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 저장 시각(UTC)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_DAILY_PICK'', N''COLUMN'', N''SAVED_AT'';
END
';
EXEC (@sql);
PRINT N'✔ 표 dbo.SA_DAILY_PICK (오늘의 후보)';
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
IF OBJECT_ID(N''dbo.SA_SEEN'', N''U'') IS NULL
BEGIN
  CREATE TABLE dbo.SA_SEEN (
    APPLICANT_ID INT NOT NULL,
    DATA_JSON NVARCHAR(MAX) NOT NULL,
    SAVED_AT DATETIME2(3) NOT NULL CONSTRAINT DF_SA_SEEN_SAVED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_SEEN PRIMARY KEY (APPLICANT_ID)
  );
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사緣 이미 본 후보 — 원본은 DATA_JSON, 앞쪽 열은 보기용. 수정은 관리자 화면 ''''DB 표''''에서'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SEEN'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''신청 번호'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SEEN'', N''COLUMN'', N''APPLICANT_ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''행 전체 원본(JSON) — 서버가 이 값으로 데이터를 읽는다'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SEEN'', N''COLUMN'', N''DATA_JSON'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 저장 시각(UTC)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SEEN'', N''COLUMN'', N''SAVED_AT'';
END
';
EXEC (@sql);
PRINT N'✔ 표 dbo.SA_SEEN (이미 본 후보)';
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
IF OBJECT_ID(N''dbo.SA_SAJU_PICK'', N''U'') IS NULL
BEGIN
  CREATE TABLE dbo.SA_SAJU_PICK (
    EMP_NO NVARCHAR(30) NOT NULL,
    PICK_DATE NVARCHAR(10) NULL,
    TARGET_ID INT NULL,
    DATA_JSON NVARCHAR(MAX) NOT NULL,
    SAVED_AT DATETIME2(3) NOT NULL CONSTRAINT DF_SA_SAJU_PICK_SAVED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_SAJU_PICK PRIMARY KEY (EMP_NO)
  );
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사緣 오늘의 사주 인연 — 원본은 DATA_JSON, 앞쪽 열은 보기용. 수정은 관리자 화면 ''''DB 표''''에서'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SAJU_PICK'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사번'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SAJU_PICK'', N''COLUMN'', N''EMP_NO'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''날짜(KST)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SAJU_PICK'', N''COLUMN'', N''PICK_DATE'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''고른 신청 번호'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SAJU_PICK'', N''COLUMN'', N''TARGET_ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''행 전체 원본(JSON) — 서버가 이 값으로 데이터를 읽는다'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SAJU_PICK'', N''COLUMN'', N''DATA_JSON'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 저장 시각(UTC)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SAJU_PICK'', N''COLUMN'', N''SAVED_AT'';
END
';
EXEC (@sql);
PRINT N'✔ 표 dbo.SA_SAJU_PICK (오늘의 사주 인연)';
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
IF OBJECT_ID(N''dbo.SA_PENALTY'', N''U'') IS NULL
BEGIN
  CREATE TABLE dbo.SA_PENALTY (
    EMP_NO NVARCHAR(30) NOT NULL,
    DISLIKE_COUNT INT NULL,
    RECORDED_AT DATETIME2(3) NULL,
    DATA_JSON NVARCHAR(MAX) NOT NULL,
    SAVED_AT DATETIME2(3) NOT NULL CONSTRAINT DF_SA_PENALTY_SAVED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_PENALTY PRIMARY KEY (EMP_NO)
  );
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사緣 싫어요 누적(탈퇴자) — 원본은 DATA_JSON, 앞쪽 열은 보기용. 수정은 관리자 화면 ''''DB 표''''에서'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_PENALTY'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사번'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_PENALTY'', N''COLUMN'', N''EMP_NO'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''받은 싫어요'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_PENALTY'', N''COLUMN'', N''DISLIKE_COUNT'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''기록 시각'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_PENALTY'', N''COLUMN'', N''RECORDED_AT'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''행 전체 원본(JSON) — 서버가 이 값으로 데이터를 읽는다'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_PENALTY'', N''COLUMN'', N''DATA_JSON'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 저장 시각(UTC)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_PENALTY'', N''COLUMN'', N''SAVED_AT'';
END
';
EXEC (@sql);
PRINT N'✔ 표 dbo.SA_PENALTY (싫어요 누적(탈퇴자))';
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
IF OBJECT_ID(N''dbo.SA_ADMIN_LOCK'', N''U'') IS NULL
BEGIN
  CREATE TABLE dbo.SA_ADMIN_LOCK (
    EMP_NO NVARCHAR(30) NOT NULL,
    FAILS INT NULL,
    DATA_JSON NVARCHAR(MAX) NOT NULL,
    SAVED_AT DATETIME2(3) NOT NULL CONSTRAINT DF_SA_ADMIN_LOCK_SAVED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_ADMIN_LOCK PRIMARY KEY (EMP_NO)
  );
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사緣 관리자 인증 잠금 — 원본은 DATA_JSON, 앞쪽 열은 보기용. 수정은 관리자 화면 ''''DB 표''''에서'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_ADMIN_LOCK'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사번'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_ADMIN_LOCK'', N''COLUMN'', N''EMP_NO'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''연속 실패 횟수'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_ADMIN_LOCK'', N''COLUMN'', N''FAILS'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''행 전체 원본(JSON) — 서버가 이 값으로 데이터를 읽는다'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_ADMIN_LOCK'', N''COLUMN'', N''DATA_JSON'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 저장 시각(UTC)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_ADMIN_LOCK'', N''COLUMN'', N''SAVED_AT'';
END
';
EXEC (@sql);
PRINT N'✔ 표 dbo.SA_ADMIN_LOCK (관리자 인증 잠금)';
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
IF OBJECT_ID(N''dbo.SA_AUDIT_LOG'', N''U'') IS NULL
BEGIN
  CREATE TABLE dbo.SA_AUDIT_LOG (
    ID INT NOT NULL,
    LOGGED_AT DATETIME2(3) NULL,
    ACTOR_EMP_NO NVARCHAR(30) NULL,
    ACTION NVARCHAR(40) NULL,
    TARGET NVARCHAR(100) NULL,
    DETAIL NVARCHAR(200) NULL,
    IP NVARCHAR(50) NULL,
    DATA_JSON NVARCHAR(MAX) NOT NULL,
    SAVED_AT DATETIME2(3) NOT NULL CONSTRAINT DF_SA_AUDIT_LOG_SAVED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_AUDIT_LOG PRIMARY KEY (ID)
  );
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사緣 열람·작업 기록 — 원본은 DATA_JSON, 앞쪽 열은 보기용. 수정은 관리자 화면 ''''DB 표''''에서'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_AUDIT_LOG'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''기록 번호'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_AUDIT_LOG'', N''COLUMN'', N''ID'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''시각'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_AUDIT_LOG'', N''COLUMN'', N''LOGGED_AT'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''한 사람 사번'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_AUDIT_LOG'', N''COLUMN'', N''ACTOR_EMP_NO'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''작업'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_AUDIT_LOG'', N''COLUMN'', N''ACTION'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''대상'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_AUDIT_LOG'', N''COLUMN'', N''TARGET'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''내용'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_AUDIT_LOG'', N''COLUMN'', N''DETAIL'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''접속 IP'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_AUDIT_LOG'', N''COLUMN'', N''IP'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''행 전체 원본(JSON) — 서버가 이 값으로 데이터를 읽는다'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_AUDIT_LOG'', N''COLUMN'', N''DATA_JSON'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 저장 시각(UTC)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_AUDIT_LOG'', N''COLUMN'', N''SAVED_AT'';
END
';
EXEC (@sql);
PRINT N'✔ 표 dbo.SA_AUDIT_LOG (열람·작업 기록)';
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
IF OBJECT_ID(N''dbo.SA_CODE'', N''U'') IS NULL
BEGIN
  CREATE TABLE dbo.SA_CODE (
    GROUP_CODE NVARCHAR(30) NOT NULL,
    CODE NVARCHAR(30) NOT NULL,
    CODE_NAME NVARCHAR(60) NULL,
    SORT_ORDER INT NULL,
    USE_YN BIT NULL,
    PARENT_CODE NVARCHAR(30) NULL,
    POS INT NULL,
    DATA_JSON NVARCHAR(MAX) NOT NULL,
    SAVED_AT DATETIME2(3) NOT NULL CONSTRAINT DF_SA_CODE_SAVED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_CODE PRIMARY KEY (GROUP_CODE, CODE)
  );
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사緣 기준정보(선택 목록) — 원본은 DATA_JSON, 앞쪽 열은 보기용. 수정은 관리자 화면 ''''DB 표''''에서'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_CODE'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''그룹'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_CODE'', N''COLUMN'', N''GROUP_CODE'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''코드'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_CODE'', N''COLUMN'', N''CODE'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''표시 이름'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_CODE'', N''COLUMN'', N''CODE_NAME'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''순서'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_CODE'', N''COLUMN'', N''SORT_ORDER'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사용'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_CODE'', N''COLUMN'', N''USE_YN'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''상위 코드'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_CODE'', N''COLUMN'', N''PARENT_CODE'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''그룹 안 위치'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_CODE'', N''COLUMN'', N''POS'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''행 전체 원본(JSON) — 서버가 이 값으로 데이터를 읽는다'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_CODE'', N''COLUMN'', N''DATA_JSON'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 저장 시각(UTC)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_CODE'', N''COLUMN'', N''SAVED_AT'';
END
';
EXEC (@sql);
PRINT N'✔ 표 dbo.SA_CODE (기준정보(선택 목록))';
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
IF OBJECT_ID(N''dbo.SA_SETTING'', N''U'') IS NULL
BEGIN
  CREATE TABLE dbo.SA_SETTING (
    SETTING_KEY NVARCHAR(50) NOT NULL,
    SETTING_VALUE NVARCHAR(200) NULL,
    DATA_JSON NVARCHAR(MAX) NOT NULL,
    SAVED_AT DATETIME2(3) NOT NULL CONSTRAINT DF_SA_SETTING_SAVED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_SETTING PRIMARY KEY (SETTING_KEY)
  );
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사緣 설정 — 원본은 DATA_JSON, 앞쪽 열은 보기용. 수정은 관리자 화면 ''''DB 표''''에서'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SETTING'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''설정 이름'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SETTING'', N''COLUMN'', N''SETTING_KEY'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''값'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SETTING'', N''COLUMN'', N''SETTING_VALUE'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''행 전체 원본(JSON) — 서버가 이 값으로 데이터를 읽는다'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SETTING'', N''COLUMN'', N''DATA_JSON'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 저장 시각(UTC)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SETTING'', N''COLUMN'', N''SAVED_AT'';
END
';
EXEC (@sql);
PRINT N'✔ 표 dbo.SA_SETTING (설정)';
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
IF OBJECT_ID(N''dbo.SA_SEQUENCE'', N''U'') IS NULL
BEGIN
  CREATE TABLE dbo.SA_SEQUENCE (
    SEQ_NAME NVARCHAR(30) NOT NULL,
    LAST_NO INT NULL,
    DATA_JSON NVARCHAR(MAX) NOT NULL,
    SAVED_AT DATETIME2(3) NOT NULL CONSTRAINT DF_SA_SEQUENCE_SAVED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_SEQUENCE PRIMARY KEY (SEQ_NAME)
  );
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''사緣 번호 발급 — 원본은 DATA_JSON, 앞쪽 열은 보기용. 수정은 관리자 화면 ''''DB 표''''에서'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SEQUENCE'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''번호 종류'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SEQUENCE'', N''COLUMN'', N''SEQ_NAME'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 번호'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SEQUENCE'', N''COLUMN'', N''LAST_NO'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''행 전체 원본(JSON) — 서버가 이 값으로 데이터를 읽는다'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SEQUENCE'', N''COLUMN'', N''DATA_JSON'';
  EXEC sys.sp_addextendedproperty N''MS_Description'', N''마지막 저장 시각(UTC)'', N''SCHEMA'', N''dbo'', N''TABLE'', N''SA_SEQUENCE'', N''COLUMN'', N''SAVED_AT'';
END
';
EXEC (@sql);
PRINT N'✔ 표 dbo.SA_SEQUENCE (번호 발급)';
/* @@TABLES-END */

/* 6) 결과 */
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
DECLARE @user sysname =
  (SELECT dp.name FROM sys.database_principals dp JOIN sys.server_principals sp ON sp.sid = dp.sid WHERE sp.name = @login);
SELECT
  @login AS [로그인],
  CASE WHEN SUSER_ID(@login) IS NULL THEN N''없음''
       WHEN (SELECT is_disabled FROM sys.server_principals WHERE name = @login) = 1 THEN N''사용 중지''
       ELSE N''정상'' END AS [로그인 상태],
  ISNULL(@user, N''없음'') AS [DB 사용자],
  CASE WHEN @user = N''dbo'' THEN N''소유자(전체)''
       WHEN IS_ROLEMEMBER(N''db_datareader'', @user) = 1 AND IS_ROLEMEMBER(N''db_datawriter'', @user) = 1 THEN N''읽기·쓰기''
       ELSE N''부족'' END AS [권한],
  (SELECT COUNT(*) FROM sys.tables WHERE name LIKE N''SA[_]%'' AND name <> N''SA_DOC'') AS [사緣 표 수];';
EXEC sp_executesql @sql, N'@login sysname', @login = @AppLogin;

PRINT N'';
PRINT N'끝났어요. server/.env 에 DB_USER · DB_PASSWORD 를 위 값으로, DB_AUTO_CREATE=false 로 두고  npm run check  로 확인해 주세요.';
