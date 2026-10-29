/**
 * ★ 사緣 서버 기준정보 (마스터) — 서버 주소·포트·DB 이름은 여기에서만 고친다.
 *
 * 이 파일을 읽어 자동으로 맞춰지는 곳
 *  - API 서버 설정 (server/src/config.js)     : 포트 · DB 서버/이름 · 이 API 를 부를 수 있는 화면 주소(CORS)
 *  - 화면 빌드 (client, npm run build)         : Web 서버용 IIS 설정(web.config) · 화면 설정(sayeon.config.js: API 주소·관리자 주소·사내 인사정보 URL)
 *  - 배포 패키지 (npm run release)             : Web·API 서버에 복사할 폴더와 점검 스크립트
 *  - 점검 (npm run check · check-web.ps1)      : 각 서버 연결 확인
 *
 * 통신 구조 (운영)
 *   사용자 PC 브라우저 → Web 서버  https://oncloud9.samsungds.net:8282   (화면 파일만 — IIS)
 *   사용자 PC 브라우저 → API 서버  https://alfadev.samsungds.net:8292/sayeon/api   (회사 iisnode 앱 routes/sayeon)
 *   API 서버 → DB 서버 1433
 *   Web 서버 ↔ API·DB 서버 통신은 없다
 *
 * 개발 (개발 서버 = 개인 PC, 인터넷 되는 유일한 PC)
 *   npm run dev       → 화면 5173 이 운영 API 서버를 부른다 (같은 DB · 운영 데이터가 보인다). 아래 devLogin 의 테스트 사번으로 바로 로그인
 *   npm run dev:mock  → 서버 없이 브라우저 안 가짜 데이터
 *   npm run build     → 운영 화면 (dist 를 압축해 Web 서버로)
 *
 * 비밀번호·키는 여기에 쓰지 않는다 → API 서버의 routes/sayeon/.env (DB 계정은 그 앱 main.js 에서 넘겨받을 수 있다)
 * 값을 바꾼 뒤에는: 화면은 다시 빌드해 Web 서버에 복사, API 는 다시 묶어(npm run plugin) routes/sayeon 에 덮어쓰기
 */
export default {
  environments: {
    // ── 운영 ─────────────────────────────────────────
    // 개발 화면(npm run dev)도 이 API 서버 · 이 DB 를 쓴다 — API 서버는 하나만 둔다
    // (서버가 데이터를 메모리에 두고 저장하는 구조라, 같은 DB 를 쓰는 서버가 둘이면 서로 덮어쓴다)
    production: {
      /** Web 서버 — IIS. 빌드한 화면 파일만 둔다. 사내 인증서로 https */
      web: {
        host: '10.122.122.1',
        port: 8282,
        https: true,
        /** 사용자가 접속하는 주소(인증서 이름). API 서버는 이 화면 주소의 호출만 받는다(CORS) */
        dnsName: 'oncloud9.samsungds.net',
      },
      /**
       * API 서버 — 회사의 다른 iisnode 앱(IIS) routes 폴더에 사緣 묶음을 끼워 넣는다 (설치 없음, npm run plugin → routes/sayeon)
       *  host    : API 서버 IP (방화벽 · 연결 점검)
       *  dnsName : https 인증서에 적힌 DNS 이름 — 사용자 PC 브라우저가 이 이름으로 부른다
       *  port    : 그 앱 IIS 사이트의 https 포트 (방화벽: 사용자 PC 대역 · 개발 PC → 이 포트)
       *  https   : true = https 로만 받는다 (http 로 온 호출은 막는다)
       *  basePath: 그 앱 main.js 에서 붙인 경로 — app.use('/sayeon', require('./routes/sayeon')(…))
       */
      api: { host: '10.122.122.2', dnsName: 'alfadev.samsungds.net', port: 8292, https: true, basePath: '/sayeon' },
      /** DB 서버 — MSSQL. 목적별 표(SA_APPLICANT · SA_MATCH …)를 쓴다 */
      db: { host: '10.166.101.127', port: 1433, name: 'sasystem' },
    },
  },

  /** 개발 서버 — 인터넷이 되는 개인 PC. 여기서 개발(npm run dev)·빌드·묶음을 만든다 */
  devServer: { host: '10.122.122.10', port: 5173 },

  /**
   * 개발 화면(npm run dev) 테스트 사번 — 사내 인사정보 확인 없이 이 사번으로 바로 로그인한다.
   * 운영 API 서버가 받아 주는 조건 (셋 다 맞아야 한다)
   *  1) 호출한 PC IP 가 devServer.host (개발 PC — 그 앱 web.config 의 promoteServerVars 에 REMOTE_ADDR 필요)
   *  2) 개발 화면 프록시가 붙인 개발 키(client/.env.development.local 의 SAYEON_DEV_KEY)가
   *     API 서버 routes/sayeon/.env 의 DEV_LOGIN_KEY 와 같다 — 키는 브라우저에 내려가지 않는다
   *  3) 사번이 아래 목록에 있다
   * 테스트 사번으로 만든 신청·하트·쪽지에는 '테스트' 표시가 붙고, 일반 사용자 화면(후보·하트·매칭)에는 나오지 않는다.
   * 관리자 화면 'DB 표'에서 따로 보이고 '테스트 데이터 지우기'로 한 번에 지울 수 있다.
   * 관리자 화면까지 시험하려면 그 사번을 routes/sayeon/config/admins.js 의 accounts 에 넣는다.
   */
  devLogin: {
    accounts: [
      { empNo: 'TEST0001', name: '테스트 남', gender: 'M', division: 'MEMORY', team: '사緣 개발 테스트' },
      { empNo: 'TEST0002', name: '테스트 여', gender: 'F', division: 'FOUNDRY', team: '사緣 개발 테스트' },
      { empNo: 'TEST0003', name: '테스트 관리자', gender: 'F', division: 'COMMON', team: '사緣 개발 테스트' },
    ],
  },

  /** 보안 — 운영 화면에서 개발자 도구 단축키(F12 · Ctrl+Shift+I · Ctrl+U …)와 오른쪽 클릭 메뉴를 막는다 (보조 조치) */
  security: { blockDevtools: true },

  /** 관리자 화면 주소 (사용자 화면에는 버튼이 없다) */
  adminPath: '/changeme',

  /**
   * 사내 로그인 (운영 화면) — 로그인 화면은 없다. 사용자 PC 브라우저가 두 번 부른다
   *
   *  1) employeeApi   : 사내 인사 데이터 URL → 응답을 localStorage 에 저장하고 sabun · user_name 을 읽는다
   *  2) employeeCheck : 1)에서 읽은 sabun · user_name 을 POST 로 보내 임직원인지 확인한다
   *  3) 임직원이면 API 서버에 그 정보를 넘겨 로그인 → 홈 / 아니면 '임직원만 이용할 수 있어요' 안내
   *
   *  ※ 두 서버 모두 사緣 화면 주소(https://oncloud9.samsungds.net:8282)에 CORS 를 허용해야 브라우저가 응답을 읽을 수 있다
   *  ※ 화면이 https 라 두 URL 도 https 여야 한다 (http 는 브라우저가 막는다)
   *  ※ URL 을 바꾸면 다시 빌드하거나, Web 서버의 sayeon.config.js 만 고쳐도 바로 반영된다
   */
  sso: {
    mode: 'browser', // browser | off
    /** 1) 사내 인사 데이터 URL */
    employeeApi: {
      url: '', // 예: 'https://hr.samsungds.net/api/me'
      method: 'GET', // GET | POST
      /** POST 본문 — {ls:키} = 브라우저 localStorage 값, {query:이름} = 주소창 값 */
      body: null,
      /** 응답에서 사용자 정보 위치 (예: 'data.user'). 비우면 사번(sabun 등)이 든 객체를 자동으로 찾는다 */
      resultPath: '',
      /** 사내 SSO 쿠키를 함께 보낸다 (인사 서버가 쿠키로 사용자를 알아볼 때) */
      withCredentials: true,
      timeoutMs: 8000,
      /** 받아 온 인사 데이터를 저장할 localStorage 키 */
      storageKey: 'sayeon.employee',
    },
    /** 2) 임직원 확인 URL — 1)의 값으로 POST. 비우면 1)만으로 확인한다 */
    employeeCheck: {
      url: '', // 예: 'https://hr.samsungds.net/api/employee/check'
      method: 'POST',
      /** 보낼 본문 — {필드} = 1) 응답의 같은 이름 값 (예: {sabun} {user_name}), {ls:키} {query:이름} 도 쓸 수 있다 */
      body: { sabun: '{sabun}', user_name: '{user_name}' },
      /**
       * 임직원으로 볼 조건
       *  okPath 를 비우면: 응답에서 같은 사번이 든 사용자 정보를 찾고, 재직 상태가 '퇴직·휴직'이 아니면 임직원
       *  okPath 를 정하면: 응답의 그 위치 값이 okValues 중 하나면 임직원 (예: okPath 'result', okValues ['Y', 'true', '1'])
       */
      okPath: '',
      okValues: ['Y', 'true', '1', 'OK', 'SUCCESS'],
      /** 응답에 든 사용자 정보 위치 (성별·사업부 등을 함께 받을 때). 비우면 자동 */
      resultPath: '',
      withCredentials: true,
      timeoutMs: 8000,
    },

    // ── API 서버가 쓰는 값 (선택) ──
    /** API 서버가 사번으로 인사정보를 한 번 더 확인할 사내 인사 API (API 서버 → 인사 서버 통신이 될 때만). 비우면 브라우저가 확인한 정보를 쓴다 */
    hrApi: {
      url: '',
      method: 'POST', // POST | GET
      /** 보낼 본문 — {empNo} 사번 · {id} 사내 계정 ID · {domain} 도메인 */
      body: { sabun: '{empNo}' },
      /** API 키가 필요하면 routes/sayeon/.env 의 SSO_API_KEY (헤더 이름은 아래) */
      apiKeyHeader: 'x-api-key',
      timeoutMs: 5000,
    },
  },
};
