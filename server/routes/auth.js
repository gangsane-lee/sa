/**
 * /api/auth — 사내 로그인 · 로그아웃 · 관리자 인증
 * 운영은 사내 인사정보로만 들어온다 (ID/비밀번호 로그인 없음). 화면을 열 때·'다시 확인'을 누를 때 /sso 를 부른다
 */
import { Router } from 'express';
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
  r.get('/me', h(() => api.auth.me()));
  r.post('/logout', h(() => api.auth.logout()));
  r.post('/admin', h((req) => api.auth.enterAdmin(b(req).password)));
  r.delete('/admin', h(() => api.auth.exitAdmin()));
  return r;
}
