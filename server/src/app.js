/**
 * Express 앱 조립 — 서비스(업무 규칙)에 저장소·세션·사내 인증·관리자 확인을 연결하고,
 * /api 와 화면(client/dist)을 한 서버에서 함께 내보낸다.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import createMemoryStore from 'memorystore';
import helmet from 'helmet';
import { configureService } from '../../client/src/api/core/service.js';
import { currentReq } from './context.js';
import { apiRouter } from './routes.js';

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
    clientIp: () => currentReq()?.ip ?? '-',
    directory,
    admin: { isAdmin: (emp) => admin.isAdmin(emp), verify: (password) => admin.verify(password) },
    allowDev: false,
  });
  await store.flush(); // 처음 실행이면 기본값을 저장

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

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

  // 화면 운영 설정 — .env 값으로 만들어 내려준다 (캐시 금지)
  app.get('/sayeon.config.js', (req, res) => {
    res.set('Cache-Control', 'no-store').type('application/javascript');
    res.send(`window.SAYEON_CONFIG = ${JSON.stringify({ mode: config.serviceMode, adminPath: config.adminPath })};\n`);
  });

  app.use('/api', apiRouter(store));

  // 화면 (vite build 결과)
  const indexHtml = path.join(config.clientDist, 'index.html');
  app.use(express.static(config.clientDist, { index: false, maxAge: '7d', immutable: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    if (!fs.existsSync(indexHtml)) {
      return res.status(503).type('text/plain; charset=utf-8').send('화면 빌드(client/dist)가 없어요. client 폴더에서 npm run build 를 먼저 실행해 주세요.');
    }
    res.set('Cache-Control', 'no-cache').sendFile(indexHtml);
  });

  return app;
}
