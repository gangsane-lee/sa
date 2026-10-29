/**
 * Express 앱 조립 — 서비스(업무 규칙)에 저장소·세션·사내 인증·관리자 확인을 연결하고,
 * /api 를 내보낸다. 화면은 보통 Web 서버(IIS)가 내보내고, CLIENT_DIST 를 정하면 여기서도 내보낸다.
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
      // http(IP 주소)로 운영하면 https 강제 헤더를 보내지 않는다
      strictTransportSecurity: config.session.cookieSecure,
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
  app.use(
    session({
      name: 'sayeon.sid',
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: new MemoryStore({ checkPeriod: 15 * 60 * 1000, ttl: config.session.idleHours * 3600 * 1000 }),
      cookie: {
        httpOnly: true,
        sameSite: 'strict',
        secure: config.session.cookieSecure,
        maxAge: config.session.idleHours * 3600 * 1000,
      },
    }),
  );

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
