/**
 * API 서버 web.config (IIS + iisnode) 만들기 — npm run webconfig · 배포 패키지(npm run release)가 쓴다.
 * 값은 servers.config.mjs(기준정보)의 그 환경 값. 만든 뒤에는 서버에서 web.config 를 직접 고쳐도 된다.
 */
const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** iisnode 가 바뀌면 서버를 다시 띄울 파일 (하위 폴더는 폴더마다 적어야 한다) */
const WATCHED = ['web.config', '*.js', '.env', 'routes\\*.js', 'src\\*.js', 'config\\*.js', 'shared\\*.js', 'shared\\api\\*.js', 'shared\\api\\core\\*.js', 'shared\\constants\\*.js', 'shared\\utils\\*.js'];

/**
 * @param {{ envName: string, api: { port: number }, db: { host: string, port: number, name: string } }} T loadTopology 결과
 * @returns {string} web.config 내용
 */
export function buildApiWebConfig(T) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!--
  사緣 API 서버 (IIS + iisnode) — 환경 ${T.envName}
  · 이 폴더를 IIS 사이트(포트 ${T.api.port})의 실제 경로로 지정한다. 폴더째 복사하면 된다.
  · 앱 풀: .NET CLR 버전 "관리 코드 없음", 유휴 시간 0, 겹친 재활용 끔 (서버 프로세스는 반드시 1개)
  · appSettings 를 고치면 iisnode 가 서버를 다시 띄운다. 비밀번호·키는 같은 폴더의 .env
  · 처음 만든 값: servers.config.mjs(${T.envName}) — npm run webconfig -- --env ${T.envName}
-->
<configuration>
  <appSettings>
    <!-- 환경: production(운영) | development(개발) -->
    <add key="SASYSTEM_ENV" value="${xml(T.envName)}" />
    <!-- 이 사이트의 IIS 포트 (사이트 바인딩과 같게). 사용자 PC 브라우저가 이 포트로 API 를 부른다 -->
    <add key="API_PORT" value="${xml(T.api.port)}" />
    <!-- DB 서버 (MSSQL). 계정·비밀번호는 .env 의 DB_USER · DB_PASSWORD -->
    <add key="DB_HOST" value="${xml(T.db.host)}" />
    <add key="DB_PORT" value="${xml(T.db.port)}" />
    <add key="DB_NAME" value="${xml(T.db.name)}" />
  </appSettings>
  <system.webServer>
    <!-- main.js 를 Node.js 로 실행 -->
    <handlers>
      <add name="iisnode" path="main.js" verb="*" modules="iisnode" />
    </handlers>
    <!-- 모든 요청을 main.js 로 (화면 파일은 Web 서버가 낸다) -->
    <rewrite>
      <rules>
        <rule name="sasystem-api" stopProcessing="true">
          <match url=".*" />
          <action type="Rewrite" url="main.js" />
        </rule>
      </rules>
    </rewrite>
    <!--
      nodeProcessCountPerApplication="1" : 데이터를 메모리에 두는 구조라 반드시 1개
      promoteServerVars="REMOTE_ADDR"    : 요청을 보낸 곳(사용자 PC IP)을 x-iisnode-remote_addr 헤더로 — 사용자 IP 확인용
      logDirectory="iisnode"             : 서버 로그 (이 폴더의 iisnode\\)
      nodeProcessCommandLine             : node.exe 위치가 다르면 고친다
    -->
    <iisnode
      node_env="${T.envName === 'production' ? 'production' : 'development'}"
      nodeProcessCommandLine="&quot;%programfiles%\\nodejs\\node.exe&quot;"
      nodeProcessCountPerApplication="1"
      promoteServerVars="REMOTE_ADDR"
      watchedFiles="${WATCHED.join(';')}"
      loggingEnabled="true"
      logDirectory="iisnode"
      devErrorsEnabled="false"
      debuggingEnabled="false"
      gracefulShutdownTimeout="5000"
    />
    <!-- API 의 오류 응답(JSON)을 IIS 오류 화면으로 바꾸지 않는다 -->
    <httpErrors existingResponse="PassThrough" />
    <security>
      <requestFiltering>
        <hiddenSegments>
          <add segment=".env" />
          <add segment="config" />
          <add segment="iisnode" />
          <add segment="node_modules" />
          <add segment="routes" />
          <add segment="src" />
          <add segment="shared" />
          <add segment="scripts" />
          <add segment="sql" />
          <add segment="_deploy" />
        </hiddenSegments>
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
`;
}
