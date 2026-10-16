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
     5) 테이블 dbo.SA_DOC 이 없으면 만든다
     6) 결과를 표로 보여준다

   끝나면 server/.env 에  DB_USER=@AppLogin 값, DB_PASSWORD=@AppPass 값, DB_AUTO_CREATE=false
   ════════════════════════════════════════════════════════════════════ */

DECLARE @DbName   sysname       = N'SAYEON';            -- server/.env 의 DB_NAME
DECLARE @AppLogin sysname       = N'sayeon_app';        -- server/.env 의 DB_USER
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

/* 5) 테이블 — 서버(server/src/store.js)와 같은 정의 */
SET @sql = N'USE ' + QUOTENAME(@DbName) + N';
IF OBJECT_ID(N''dbo.SA_DOC'', N''U'') IS NULL
BEGIN
  CREATE TABLE dbo.SA_DOC (
    COLL       VARCHAR(30)    NOT NULL,
    DOC_ID     NVARCHAR(100)  NOT NULL,
    BODY       NVARCHAR(MAX)  NOT NULL,
    UPDATED_AT DATETIME2      NOT NULL CONSTRAINT DF_SA_DOC_UPDATED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_DOC PRIMARY KEY (COLL, DOC_ID)
  );
  PRINT N''✔ 테이블 dbo.SA_DOC 을 만들었어요'';
END
ELSE
  PRINT N''✔ 테이블 dbo.SA_DOC 이 이미 있어요'';';
EXEC (@sql);

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
  CASE WHEN OBJECT_ID(N''dbo.SA_DOC'', N''U'') IS NULL THEN N''없음'' ELSE N''있음'' END AS [테이블 SA_DOC];';
EXEC sp_executesql @sql, N'@login sysname', @login = @AppLogin;

PRINT N'';
PRINT N'끝났어요. server/.env 에 DB_USER · DB_PASSWORD 를 위 값으로, DB_AUTO_CREATE=false 로 두고  npm run check  로 확인해 주세요.';
