/**
 * Express 앱 조립 — 서비스(업무 규칙)에 저장소·세션·사내 인증·관리자 확인을 연결하고,
 * /api 를 내보낸다. 화면은 Web 서버(IIS)가 내보내고(CLIENT_DIST 를 정하면 여기서도), 사용자 브라우저가 이 API 를 직접 부른다.
 *  - 화면과 API 의 주소가 달라 브라우저가 막지 않게 CORS 로 Web 서버 주소(config.corsOrigins)만 허용한다
 *  - 로그인 세션은 쿠키 대신 헤더(X-Sayeon-Session)로 주고받는다 — 다른 주소의 쿠키(제3자 쿠키)는 브라우저·회사 정책이 막을 수 있다
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import createMemoryStore from 'memorystore';
import helmet from 'helmet';
import { configureService } from '../shared/api/core/service.js';
import { currentReq } from './context.js';
import { clientIpOf } from './clientIp.js';
import { apiRouter } from '../routes/index.js';

const MemoryStore = createMemoryStore(session);
const SESSION_COOKIE = 'sayeon.sid';
/** 로그인 세션 헤더 — 서버가 응답에 실어 주면 화면이 보관했다가 다음 요청마다 그대로 보낸다 (client/src/api/http.js) */
export const SESSION_HEADER = 'X-Sayeon-Session';

/**
 * @param {object} deps
 * @param {object} deps.config     src/config.js 의 config
 * @param {object} deps.store      src/store.js 의 저장소
 * @param {object} deps.directory  사내 인증 (src/sso.js)
 * @param {{ isAdmin: Function, verify: Function }} deps.admin 관리자 확인 (src/admins.js)
 */
export async function createApp({ config, store, directory, admin }) {
  configureService({
    load: () => store.loaded,
    initial: () => ({}), // 처음 실행: 기준정보·설정 기본값만 들어간 빈 데이터
    persist: (db) => store.persist(db),
    session: {
      get: () => currentReq()?.session?.sa ?? null,
      set: (s) => {
        const req = currentReq();
        if (req?.session) req.session.sa = s;
      },
    },
    clientIp: () => currentReq()?.clientIp ?? '-',
    directory,
    admin: { isAdmin: (emp) => admin.isAdmin(emp), verify: (password) => admin.verify(password) },
    allowDev: false,
  });
  await store.flush(); // 처음 실행이면 기본값을 저장

  const app = express();
  app.disable('x-powered-by');
  // 사용자 IP — iisnode 의 x-iisnode-remote_addr · Web 서버가 붙인 X-Forwarded-For (src/clientIp.js)
  app.use((req, res, next) => {
    req.clientIp = clientIpOf(req);
    next();
  });

  // CORS — 허용한 화면 주소(Origin)에서 온 호출에만 응답 헤더를 붙인다. 사전 확인(OPTIONS)은 여기서 끝낸다
  const origins = new Set(config.corsOrigins);
  const refused = new Set();
  app.use((req, res, next) => {
    const origin = req.get('Origin');
    const preflight = req.method === 'OPTIONS' && Boolean(req.get('Access-Control-Request-Method'));
    if (!origin || !origins.has(origin)) {
      if (!preflight) return next(); // 같은 주소(화면을 이 서버가 낼 때 · 개발 미리보기 프록시)거나 브라우저가 아닌 호출
      if (refused.size < 20 && !refused.has(origin)) {
        refused.add(origin);
        console.warn(`[sayeon] 허용하지 않은 화면 주소 ${origin} 에서 호출했어요 — 맞는 주소면 servers.config.mjs 의 web(host · dnsName · port) 또는 .env 의 CORS_ORIGINS 에 넣어 주세요 (지금: ${[...origins].join(', ') || '없음'})`);
      }
      return res.status(403).end();
    }
    res.vary('Origin');
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Expose-Headers', SESSION_HEADER);
    if (!preflight) return next();
    res.set({
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE',
      'Access-Control-Allow-Headers': `Content-Type, X-Requested-With, ${SESSION_HEADER}`,
      'Access-Control-Max-Age': '600',
    });
    // 공인 대역 주소의 화면이 사설 대역 API 를 부를 때 브라우저가 묻는다 (Private Network Access)
    if (req.get('Access-Control-Request-Private-Network') === 'true') res.set('Access-Control-Allow-Private-Network', 'true');
    return res.status(204).end();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // DevExtreme이 인라인 스타일을 쓴다
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
        },
      },
      // https 강제(HSTS)는 이 주소 전체(끼워 넣은 앱 포함)에 걸리므로 IIS 가 정한다
      strictTransportSecurity: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '200kb' }));
  // 다른 앱에 끼워 넣었는데 그 앱도 세션을 쓰면: 처리하는 동안은 사緣 세션(sayeon.sid)만 보이게 떼어 두고,
  // 응답을 내보낼 때(그 앱 세션이 쿠키·저장을 하는 시점) 되돌려 둔다 — 두 세션이 서로의 쿠키·저장소에 섞이지 않게
  app.use((req, res, next) => {
    if (req.session === undefined) return next();
    const host = { session: req.session, sessionID: req.sessionID, sessionStore: req.sessionStore };
    const restore = () => Object.assign(req, host);
    delete req.session;
    delete req.sessionID;
    delete req.sessionStore;
    // 사緣 세션이 나중에 감싸므로 호출 순서: 사緣 세션 → 여기(되돌림) → 그 앱 세션
    const { writeHead, end } = res;
    res.writeHead = function (...a) {
      restore();
      return writeHead.apply(this, a);
    };
    res.end = function (...a) {
      restore();
      return end.apply(this, a);
    };
    next();
  });
  // 로그인 세션 — express-session 은 쿠키로만 주고받으므로, 앞에서 요청 헤더를 쿠키처럼 넣어 주고
  // 내보낼 쿠키(Set-Cookie: sayeon.sid=…)는 응답 헤더 X-Sayeon-Session 으로 바꿔 보낸다 (브라우저에 쿠키를 남기지 않는다)
  const sessionMiddleware = session({
    name: SESSION_COOKIE,
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: new MemoryStore({ checkPeriod: 15 * 60 * 1000, ttl: config.session.idleHours * 3600 * 1000 }),
    cookie: { httpOnly: true, sameSite: 'strict', maxAge: config.session.idleHours * 3600 * 1000 },
  });
  app.use((req, res, next) => {
    const { setHeader } = res;
    res.setHeader = function (name, value) {
      if (String(name).toLowerCase() !== 'set-cookie') return setHeader.call(this, name, value);
      const rest = [];
      for (const c of [].concat(value)) {
        if (String(c).startsWith(`${SESSION_COOKIE}=`)) setHeader.call(this, SESSION_HEADER, decodeURIComponent(String(c).slice(SESSION_COOKIE.length + 1).split(';')[0]));
        else rest.push(c); // 그 앱(끼워 넣은 곳)의 쿠키는 그대로
      }
      if (rest.length) return setHeader.call(this, name, rest);
      this.removeHeader(name);
      return this;
    };
    const cookie = req.headers.cookie;
    const token = String(req.get(SESSION_HEADER) ?? '');
    if (token && token.length <= 200) req.headers.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
    else delete req.headers.cookie;
    sessionMiddleware(req, res, (err) => {
      if (cookie === undefined) delete req.headers.cookie;
      else req.headers.cookie = cookie;
      next(err);
    });
  });

  // 화면 설정 — servers.config.mjs 값으로 만들어 내려준다 (캐시 금지, CLIENT_DIST 로 화면을 직접 낼 때만)
  app.get('/sayeon.config.js', (req, res) => {
    res.set('Cache-Control', 'no-store').type('application/javascript');
    const runtime = {
      adminPath: config.adminPath,
      ...(config.sso.mode === 'browser' && { employeeApi: config.sso.employeeApi }),
      ...(config.sso.loginPage && { ssoLoginPage: config.sso.loginPage }),
    };
    res.send(`window.SAYEON_CONFIG = ${JSON.stringify(runtime)};\n`);
  });

  app.use('/api', apiRouter(store));

  // 화면 (vite build 결과) — CLIENT_DIST 를 정했을 때만. 보통은 Web 서버(IIS)가 내보낸다
  if (config.clientDist) {
    const indexHtml = path.join(config.clientDist, 'index.html');
    app.use(express.static(config.clientDist, { index: false, maxAge: '7d', immutable: false }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      if (!fs.existsSync(indexHtml)) {
        return res.status(503).type('text/plain; charset=utf-8').send('화면 빌드(client/dist)가 없어요. client 폴더에서 npm run build 를 먼저 실행해 주세요.');
      }
      res.set('Cache-Control', 'no-cache').sendFile(indexHtml);
    });
  } else {
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      res.status(404).type('text/plain; charset=utf-8').send(`사緣 API 서버예요. 화면은 Web 서버(${config.publicUrl})에서 열어 주세요.`);
    });
  }

  return app;
}
