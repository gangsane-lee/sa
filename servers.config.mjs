/**
 * ★ 사緣 서버 기준정보 (마스터) — 서버 주소·포트·DB 이름은 여기에서만 고친다.
 *
 * 이 파일을 읽어 자동으로 맞춰지는 곳
 *  - API 서버 설정 (server/src/config.js)     : 포트 · 접속 주소 · DB 서버/이름 · 믿을 수 있는 Web 서버 IP
 *  - 화면 빌드 (client)                        : Web 서버용 IIS 설정(web.config) · 화면 설정(sayeon.config.js) · 개발 프록시
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
      /** Web 배포 운영 서버 — IIS. 빌드한 화면 파일을 두고, /api 는 API 서버로 넘긴다 (Windows 인증) */
      web: {
        host: '10.123.321.12',
        port: 8282,
        /** 사용자가 접속할 사내 DNS 이름 (있으면). 비우면 IP 로 접속 — Windows 자동 로그인에는 DNS 이름이 좋다 */
        dnsName: '',
      },
      /** API 배포 운영 서버 — Node.js + PM2 */
      api: { host: '12.83.18.17', port: 8292 },
      /** DB 서버 — MSSQL */
      db: { host: '10.166.101.127', port: 1433, name: 'sasystem' },
      /** 화면 운영 방식: open = 정식(DB 사용) / test = 시연(각자 브라우저의 가짜 데이터) */
      serviceMode: 'open',
    },

    // ── 개발 ─────────────────────────────────────────
    // API 서버(운영/개발 겸용)에서 운영과 다른 포트·다른 DB 로 돌린다.
    // ⚠ 운영과 같은 DB 이름을 쓰면 안 된다 — 서버가 데이터를 메모리에 두고 저장하는 구조라 서로 덮어쓴다
    development: {
      web: { host: '12.123.321.13', port: 5173, dnsName: '' }, // 개발 서버의 개발 화면 (npm run dev)
      api: { host: '12.83.18.17', port: 8293 },
      db: { host: '10.166.101.127', port: 1433, name: 'sasystem_dev' },
      serviceMode: 'open',
    },
  },

  /** 개발 서버 — 인터넷이 되는 유일한 서버. 여기서 빌드·패키지를 만들어 운영 서버로 복사한다 */
  devServer: { host: '12.123.321.13' },

  /** 관리자 화면 주소 (사용자 화면에는 버튼이 없다) */
  adminPath: '/changeme',

  /**
   * 사내 로그인 — Web 서버 IIS 의 Windows 인증(AD SSO) → 사내 계정 ID → AD 정보 → 사내 인사 API
   *  1) IIS 가 Windows 로그인으로 사용자를 확인하고 'SECDS\아이디' 를 헤더(header)에 담아 API 서버로 넘긴다
   *     API 서버는 이 헤더를 Web 서버 IP 에서 온 요청일 때만 믿는다 (사내 PC 가 직접 꾸며 보내면 무시)
   *  2) adLookup: API 서버가 AD 에서 그 아이디의 사번·이름·부서·메일·사용 여부를 읽는다 (API 서버가 도메인에 가입돼 있어야 함)
   *  3) hrApi: 사내 인사 API 에 아이디·사번을 넣어 인사정보(재직 상태 등)를 받는다 (비우면 AD 정보만 쓴다)
   */
  sso: {
    mode: 'iis', // iis = 위 방식 / off = 연결 안 함
    domain: 'SECDS',
    header: 'x-sayeon-user',
    adLookup: true,
    /** AD 조회 위치 — 비우면 API 서버가 가입된 도메인 (예: 'LDAP://DC=secds,DC=example,DC=net') */
    adPath: '',
    hrApi: {
      url: '', // 예: 'http://10.x.x.x:8080/api/employee'
      method: 'POST', // POST | GET
      /** 보낼 본문 — {id} 사내 계정 ID · {empNo} AD 의 사번 · {domain} 도메인 */
      body: { sabun: '{empNo}' },
      /** API 키가 필요하면 server/.env 의 SSO_API_KEY (헤더 이름은 아래) */
      apiKeyHeader: 'x-api-key',
      timeoutMs: 5000,
    },
  },
};
