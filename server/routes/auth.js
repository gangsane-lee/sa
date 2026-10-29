/**
 * /api/auth — 사내 로그인 · 로그아웃 · 관리자 인증
 * 운영은 사내 인사정보로만 들어온다 (ID/비밀번호 로그인 없음). 화면을 열 때·'다시 확인'을 누를 때 /sso 를 부른다
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../src/config.js';
import { api } from '../shared/api/core/service.js';
import { ApiError } from '../shared/api/errors.js';
import { b, regenerate } from './_handler.js';

/** 로그인 확인 횟수 제한 — 같은 사용자 IP 에서 1분에 30번까지 (사내 인사정보 서버에 요청이 몰리지 않게) */
const SSO_LIMIT = 30;
const ssoHits = new Map();
setInterval(() => ssoHits.clear(), 60 * 1000).unref();

/** 화면이 넘겨준 주소창 값(SSO 로그인 페이지에서 돌아올 때의 ticket 등) — 문자열만, 개수·길이 제한 */
const cleanQuery = (q) =>
  Object.fromEntries(
    Object.entries(q && typeof q === 'object' && !Array.isArray(q) ? q : {})
      .filter(([k, v]) => typeof v === 'string' && /^[\w.-]{1,40}$/.test(k))
      .slice(0, 20)
      .map(([k, v]) => [k, v.slice(0, 2000)]),
  );

/** 개발 화면 프록시(client/vite.config.js)가 붙이는 개발 키 헤더 */
export const DEV_KEY_HEADER = 'X-Sayeon-Dev-Key';
const devWarned = new Set();
/**
 * 개발 화면(npm run dev) 테스트 사번 로그인을 받아도 되는 요청인가 — 셋 다 맞아야 한다
 *  1) API 서버 .env 에 DEV_LOGIN_KEY(16자 이상)가 있다  2) 호출한 PC 가 개발 PC(servers.config.mjs 의 devServer.host)
 *  3) 요청의 개발 키가 DEV_LOGIN_KEY 와 같다
 * 아니면 없는 API 처럼 404 로 답한다 (있다는 것도 알리지 않는다)
 */
function devAllowed(req) {
  const D = config.devLogin;
  const given = Buffer.from(String(req.get(DEV_KEY_HEADER) ?? ''));
  const want = Buffer.from(D.key);
  const ok = D.key.length >= 16 && D.accounts.length > 0 && D.allowIps.includes(req.clientIp)
    && given.length === want.length && crypto.timingSafeEqual(given, want);
  if (!ok && devWarned.size < 50 && !devWarned.has(req.clientIp)) {
    devWarned.add(req.clientIp);
    const why = D.key.length < 16 ? '.env 의 DEV_LOGIN_KEY 가 비었거나 16자 미만'
      : !D.allowIps.includes(req.clientIp) ? `개발 PC(${D.allowIps.join(', ') || '없음'})가 아님` : '개발 키가 다름';
    console.warn(`[sayeon] 테스트 사번 로그인 거절 — ${req.clientIp} (${why})`);
  }
  return ok;
}
const notFound = () => new ApiError(404, '없는 API예요.', 'NOT_FOUND');

export default function auth(h) {
  const r = Router();
  r.post('/sso', h(async (req) => {
    // IP 를 모르면('-') 모든 사용자가 한 묶음이 되므로 제한하지 않는다 (src/clientIp.js)
    if (req.clientIp !== '-') {
      const n = (ssoHits.get(req.clientIp) ?? 0) + 1;
      ssoHits.set(req.clientIp, n);
      if (n > SSO_LIMIT) throw new ApiError(429, '잠시 뒤에 다시 시도해 주세요.', 'SSO_TOO_MANY');
    }
    await regenerate(req);
    return api.auth.sso({ query: cleanQuery(b(req).query), employee: b(req).employee });
  }));
  // 개발 화면(npm run dev) 전용 — 운영 화면 빌드에는 이 호출이 없다
  r.get('/dev-accounts', h((req) => {
    if (!devAllowed(req)) throw notFound();
    return api.auth.devAccounts();
  }));
  r.post('/dev-login', h(async (req) => {
    if (!devAllowed(req)) throw notFound();
    await regenerate(req);
    return api.auth.devLogin(b(req).empNo);
  }));
  r.get('/me', h(() => api.auth.me()));
  r.post('/logout', h(() => api.auth.logout()));
  r.post('/admin', h((req) => api.auth.enterAdmin(b(req).password)));
  r.delete('/admin', h(() => api.auth.exitAdmin()));
  return r;
}
