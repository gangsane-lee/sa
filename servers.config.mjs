/**
 * ★ 사緣 서버 기준정보 (마스터) — 서버 주소·포트·DB 이름은 여기에서만 고친다.
 *
 * 이 파일을 읽어 자동으로 맞춰지는 곳
 *  - API 서버 설정 (server/src/config.js)     : 포트 · 접속 주소 · DB 서버/이름 · 믿을 수 있는 Web 서버 IP
 *  - 화면 빌드 (client, npm run build)         : Web 서버용 IIS 설정(web.config) · 화면 설정(sayeon.config.js: 관리자 주소·사내 인사정보 URL)
 *  - 배포 패키지 (npm run release)             : Web·API 서버에 복사할 폴더와 점검 스크립트
 *  - 점검 (npm run check · check-web.ps1)      : 각 서버 연결 확인
 *
 * 비밀번호·키는 여기에 쓰지 않는다 → API 서버의 server/.env
 * IP 를 바꾼 뒤에는: 화면은 다시 빌드해 Web 서버에 복사, API 서버는 이 파일만 바꾸고 pm2 restart
 *
 * 지금 값은 가짜 IP — 실제 IP 로 바꾼 뒤  npm run check  가 형식을 확인한다.
 */
export default {
  /** API 서버가 어느 환경으로 동작할지는 server/.env 의 SAYEON_ENV (production | development) */
  environments: {
    // ── 운영 ─────────────────────────────────────────
    production: {
      /** Web 배포 운영 서버 — IIS. 빌드한 화면 파일을 두고, /api 는 API 서버로 넘긴다 */
      web: {
        host: '10.123.321.12',
        port: 8282,
        /** 사용자가 접속할 사내 DNS 이름 (있으면). 비우면 IP 로 접속 */
        dnsName: '',
      },
      /**
       * API 배포 운영 서버 — 회사의 다른 iisnode 앱(IIS) routes 폴더에 사緣 묶음을 끼워 넣는다 (설치 없음, npm run release → routes/sayeon)
       *  host    : API 서버 IP (방화벽 · 연결 점검)
       *  dnsName : ★ https 인증서에 적힌 DNS 이름 — Web 서버가 이 이름으로 부른다 (사내 DNS 에 등록돼 있어야 한다)
       *  port    : 그 앱 IIS 사이트의 https 포트
       *  https   : true = Web 서버 → API 를 https 로
       *  basePath: 그 앱 main.js 에서 붙인 경로 — app.use('/sayeon', require('./routes/sayeon'))
       *            '' 로 비우면 사緣 전용 IIS 사이트 방식(api 폴더 + deploy-api.ps1)
       */
      api: { host: '12.83.18.17', dnsName: '', port: 443, https: true, basePath: '/sayeon' },
      /** DB 서버 — MSSQL */
      db: { host: '10.166.101.127', port: 1433, name: 'sasystem' },
    },

    // ── 개발 ─────────────────────────────────────────
    // 같은 API 서버(같은 앱)에 다른 경로(basePath)·다른 DB 로 끼워 넣는다.
    // ⚠ 운영과 같은 DB 이름을 쓰면 안 된다 — 서버가 데이터를 메모리에 두고 저장하는 구조라 서로 덮어쓴다
    development: {
      web: { host: '12.123.321.13', port: 5173, dnsName: '' }, // 개발 서버의 개발 화면 (npm run dev)
      // 같은 앱에 다른 경로로 끼워 넣는다 → routes/sayeon-dev · app.use('/sayeon-dev', require('./routes/sayeon-dev'))
      api: { host: '12.83.18.17', dnsName: '', port: 443, https: true, basePath: '/sayeon-dev' },
      db: { host: '10.166.101.127', port: 1433, name: 'sasystem_dev' },
    },
  },

  /** 개발 서버 — 인터넷이 되는 유일한 서버. 여기서 빌드·패키지를 만들어 운영 서버로 복사한다 */
  devServer: { host: '12.123.321.13' },

  /** 관리자 화면 주소 (사용자 화면에는 버튼이 없다) */
  adminPath: '/changeme',

  /**
   * 사내 로그인 — 로그인 화면은 없다
   *
   * browser 방식 (기본)
   *  1) 화면을 열 때 브라우저가 아래 employeeApi.url(사내 인사정보 URL)을 부른다 (사내 SSO 쿠키를 함께 보냄)
   *  2) 정상 회신이면 응답을 localStorage 에 저장하고, 사번·재직 여부를 읽는다 (client/src/utils/employeeInfo.js)
   *  3) 임직원이면 API 서버에 그 정보를 넘겨 로그인 → 홈 / 아니면 '임직원만 이용할 수 있어요' 안내
   *  ※ 사내 인사정보 서버가 사緣 화면 주소(Web 서버)에 CORS 를 허용해야 브라우저가 응답을 읽을 수 있다
   *  ※ 브라우저가 보낸 정보는 사용자가 꾸밀 수 있다 — 아래 hrApi.url 을 채우면 API 서버가 그 사번을 인사 API 로 한 번 더 확인한다
   *
   * iis 방식 — Web 서버 IIS 의 Windows 인증 → AD → 사내 인사 API (Web 서버 도메인 가입·Windows 인증 필요)
   * 개발 모드(npm run dev)는 로그인 없이 만능 테스트 계정으로 바로 들어가므로 이 설정을 쓰지 않는다
   */
  sso: {
    mode: 'browser', // browser | iis | off
    /** 브라우저가 부를 사내 인사정보 URL — 바꾸면 다시 빌드 (또는 Web 서버의 sayeon.config.js 만 고쳐도 반영) */
    employeeApi: {
      url: '', // 예: 'http://10.x.x.x:8080/api/me'
      method: 'GET', // GET | POST
      /** POST 본문 — {ls:키} = 브라우저 localStorage 값 (예: { sabun: '{ls:sabun}' }), {query:이름} = 주소창 값 */
      body: null,
      /** 응답에서 사용자 정보 위치 (예: 'data.user'). 비우면 사번이 든 객체를 자동으로 찾는다 */
      resultPath: '',
      /** 사내 SSO 쿠키를 함께 보낸다 (인사정보 서버가 쿠키로 사용자를 알아볼 때) */
      withCredentials: true,
      timeoutMs: 8000,
      /** 받아 온 인사정보를 저장할 localStorage 키 */
      storageKey: 'sayeon.employee',
    },

    // ── API 서버가 쓰는 값 ──
    /** (선택, 권장) API 서버가 사번으로 인사정보를 한 번 더 확인할 사내 인사 API. 비우면 브라우저가 넘긴 정보만 쓴다 */
    hrApi: {
      url: '', // 예: 'http://10.x.x.x:8080/api/employee'
      method: 'POST', // POST | GET
      /** 보낼 본문 — {empNo} 사번 · {id} 사내 계정 ID · {domain} 도메인 */
      body: { sabun: '{empNo}' },
      /** API 키가 필요하면 server/.env 의 SSO_API_KEY (헤더 이름은 아래) */
      apiKeyHeader: 'x-api-key',
      timeoutMs: 5000,
    },

    // ── iis 방식일 때만 ──
    domain: 'SECDS',
    header: 'x-sayeon-user',
    adLookup: true,
    /** AD 조회 위치 — 비우면 API 서버가 가입된 도메인 (예: 'LDAP://DC=secds,DC=example,DC=net') */
    adPath: '',
  },
};
