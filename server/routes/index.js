/**
 * /api 경로 모음 — 이 폴더(routes)의 파일 하나가 API 묶음 하나다. 경로·메서드는 화면 쪽 client/src/api/http.js 와 1:1로 같다.
 *
 *   health.js        GET  /api/health               점검 (로그인 없이)
 *   auth.js          /api/auth/*                     사내 로그인 · 로그아웃 · 관리자 인증
 *   codes.js         /api/codes                      기준정보(선택 목록)
 *   applications.js  /api/applications/*             신청서
 *   me.js            /api/me/* · /api/stats/*        매칭 보드(오늘의 인연·하트·후기·커플)
 *   messages.js      /api/messages/*                 쪽지함
 *   saju.js          /api/saju/*                     인연 사주
 *   voc.js           /api/voc/*                      개선의 소리
 *   admin.js         /api/admin/*                    관리자
 *
 * 새 API 묶음을 만들면 여기에 r.use('/경로', 파일(h)) 한 줄을 더한다.
 */
import { Router } from 'express';
import { makeHandler } from './_handler.js';
import health from './health.js';
import auth from './auth.js';
import codes from './codes.js';
import applications from './applications.js';
import me from './me.js';
import messages from './messages.js';
import saju from './saju.js';
import voc from './voc.js';
import admin from './admin.js';

/** IP 하나가 1분에 부를 수 있는 API 수 */
const RATE_LIMIT = 600;
const hits = new Map();
setInterval(() => hits.clear(), 60 * 1000).unref();

export function apiRouter(store) {
  const r = Router();
  const h = makeHandler(store);

  // API 응답은 브라우저·중간 프록시에 남기지 않는다
  r.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // 같은 IP 에서 1분에 RATE_LIMIT 번까지 — 자동으로 마구 부르는 것 막기 (IP 를 모르면 '-' 한 묶음이라 세지 않는다)
  r.use((req, res, next) => {
    if (req.clientIp === '-' || !req.clientIp) return next();
    const n = (hits.get(req.clientIp) ?? 0) + 1;
    hits.set(req.clientIp, n);
    if (n > RATE_LIMIT) return res.status(429).json({ message: '요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.', code: 'TOO_MANY' });
    next();
  });

  // 상태를 바꾸는 요청은 화면이 붙이는 헤더가 있어야 한다 (다른 사이트에서 몰래 보내는 요청 차단 보조)
  r.use((req, res, next) => {
    if (req.method !== 'GET' && req.get('X-Requested-With') !== 'sasystem') {
      return res.status(403).json({ message: '허용되지 않은 요청이에요.', code: 'CSRF' });
    }
    next();
  });

  r.use('/health', health(store));
  r.use('/auth', auth(h));
  r.use('/codes', codes(h));
  r.use('/applications', applications(h));
  r.use('/', me(h)); // /me/* · /stats/*
  r.use('/messages', messages(h));
  r.use('/saju', saju(h));
  r.use('/voc', voc(h));
  r.use('/admin', admin(h));

  // 없는 API
  r.use((req, res) => res.status(404).json({ message: '없는 API예요.', code: 'NOT_FOUND' }));
  return r;
}
