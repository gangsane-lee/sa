/**
 * /api 경로 → 서비스 함수 연결. 경로·메서드는 화면 쪽 client/src/api/http.js 와 1:1로 같다.
 * 업무 규칙은 전부 서비스(client/src/api/core/service.js)에 있고, 여기서는 요청을 넘기고 응답만 만든다.
 */
import { Router } from 'express';
import { api } from '../../client/src/api/core/service.js';
import { ApiError } from '../../client/src/api/errors.js';
import { runWithRequest } from './context.js';

/** SSO 확인 횟수 제한 — 같은 IP에서 1분에 30번까지 (사내 SSO 서버에 요청이 몰리지 않게) */
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

/** 로그인할 때 세션 ID를 새로 받는다 (로그인 전에 심어 둔 세션을 그대로 쓰는 공격 방지) */
const regenerate = (req) => new Promise((ok, fail) => req.session.regenerate((e) => (e ? fail(e) : ok())));

export function apiRouter(store) {
  const r = Router();

  // 상태를 바꾸는 요청은 화면이 붙이는 헤더가 있어야 한다 (다른 사이트에서 몰래 보내는 요청 차단 보조)
  r.use((req, res, next) => {
    if (req.method !== 'GET' && req.get('X-Requested-With') !== 'sayeon') {
      return res.status(403).json({ message: '허용되지 않은 요청이에요.', code: 'CSRF' });
    }
    next();
  });

  /** 서비스 함수를 부르고, 바뀐 데이터를 저장한 뒤 응답한다 */
  const h = (fn) => (req, res) =>
    runWithRequest(req, async () => {
      let result;
      let error = null;
      try {
        result = await fn(req);
      } catch (e) {
        error = e;
      }
      // 실패한 요청도 남겨야 할 기록(관리자 인증 실패 등)이 있으므로 저장은 항상 한다
      try {
        await store.flush();
      } catch (e) {
        console.error('[api] 저장 실패:', e);
        if (!error) error = new ApiError(503, '데이터를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'STORE_FAILED');
      }
      if (error) {
        if (error instanceof ApiError) return res.status(error.status || 400).json({ message: error.message, code: error.code });
        console.error('[api] 처리 중 오류:', req.method, req.originalUrl, error);
        return res.status(500).json({ message: '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 'SERVER_ERROR' });
      }
      if (result === null || result === undefined) return res.status(204).end();
      return res.json(result);
    });

  const b = (req) => req.body ?? {};

  // ── 점검 (로그인 없이) ──
  r.get('/health', async (req, res) => {
    try {
      const s = await store.health(); // 로그인 없이 열리므로 DB 이름 같은 정보는 내보내지 않는다
      res.json({ ok: s.ok, store: s.store, time: new Date().toISOString() });
    } catch (e) {
      res.status(503).json({ ok: false, message: e.message });
    }
  });

  // ── 인증 ──
  // 운영은 사내 SSO로만 들어온다 (ID/비밀번호 로그인 없음). 화면을 열 때·'다시 확인'을 누를 때 부른다
  r.post('/auth/sso', h(async (req) => {
    const n = (ssoHits.get(req.ip) ?? 0) + 1;
    ssoHits.set(req.ip, n);
    if (n > SSO_LIMIT) throw new ApiError(429, '잠시 뒤에 다시 시도해 주세요.', 'SSO_TOO_MANY');
    await regenerate(req);
    return api.auth.sso({ query: cleanQuery(b(req).query) });
  }));
  r.get('/auth/me', h(() => api.auth.me()));
  r.post('/auth/logout', h(() => api.auth.logout()));
  r.post('/auth/admin', h((req) => api.auth.enterAdmin(b(req).password)));
  r.delete('/auth/admin', h(() => api.auth.exitAdmin()));

  r.get('/codes', h(() => api.codes.list()));

  // ── 신청서 ──
  r.get('/applications/me', h(() => api.application.getMine()));
  r.get('/applications/nicknames', h((req) => api.application.suggestNicknames(req.query.count)));
  r.post('/applications', h((req) => api.application.create(b(req))));
  r.put('/applications/me', h((req) => api.application.update(b(req))));
  r.delete('/applications/me', h(() => api.application.withdraw()));

  // ── 매칭 보드 ──
  r.get('/me/dashboard', h(() => api.me.dashboard()));
  r.post('/me/daily/pass', h(() => api.me.pass()));
  r.post('/me/daily/heart', h(() => api.me.heart()));
  r.post('/me/hearts/:id', h((req) => api.me.answerHeart(req.params.id, Boolean(b(req).accept))));
  r.put('/me/review', h((req) => api.me.submitReview(b(req))));
  r.post('/me/resume', h(() => api.me.resume()));
  r.post('/me/couple', h(() => api.me.completeCouple()));

  r.get('/stats/gathering', h(() => api.stats.gathering()));

  // ── 쪽지 ──
  r.get('/messages', h((req) => api.messages.box(req.query.box)));
  r.get('/messages/counts', h(() => api.messages.counts()));
  r.get('/messages/unread', h(() => api.messages.unread()));
  r.get('/messages/recipients', h(() => api.messages.recipients()));
  r.get('/messages/:id', h((req) => api.messages.read(req.params.id)));
  r.post('/messages', h((req) => api.messages.send(b(req).to, b(req).body)));
  r.post('/messages/move', h((req) => api.messages.move(b(req).ids, b(req).to)));

  // ── 인연 사주 ──
  r.post('/saju/pick', h((req) => api.saju.pick(b(req))));
  r.post('/saju/apply', h((req) => api.saju.apply(b(req))));
  r.post('/saju/heart', h(() => api.saju.heart()));

  // ── 개선의 소리 ──
  r.post('/voc', h((req) => api.voc.create(b(req))));
  r.get('/voc/mine', h(() => api.voc.listMine()));

  // ── 관리자 ──
  const A = api.admin;
  r.get('/admin/stats', h(() => A.stats()));
  r.get('/admin/applicants', h(() => A.listApplicants()));
  r.patch('/admin/applicants/status', h((req) => A.changeStatus(b(req).ids ?? [], b(req).status)));
  r.get('/admin/applicants/:id', h((req) => A.getApplicant(req.params.id)));
  r.put('/admin/applicants/:id', h((req) => A.updateApplicant(req.params.id, b(req))));
  r.delete('/admin/applicants/:id', h((req) => A.deleteApplicant(req.params.id)));
  r.get('/admin/applicants/:id/candidates', h((req) => A.getCandidates(req.params.id)));
  r.post('/admin/applicants/:id/reset-dislikes', h((req) => A.resetDislikes(req.params.id)));

  r.get('/admin/matches', h(() => A.listMatches()));
  r.post('/admin/matches', h((req) => A.createMatch(b(req).aId, b(req).bId, b(req).memo)));
  r.patch('/admin/matches/:id', h((req) => A.updateMatch(req.params.id, b(req))));
  r.delete('/admin/matches/:id', h((req) => A.deleteMatch(req.params.id)));

  r.get('/admin/codes/:group', h((req) => A.listCodes(req.params.group)));
  r.post('/admin/codes/:group', h((req) => A.createCode(req.params.group, b(req))));
  r.patch('/admin/codes/:group/:value', h((req) => A.updateCode(req.params.group, req.params.value, b(req))));
  r.delete('/admin/codes/:group/:value', h((req) => A.deleteCode(req.params.group, req.params.value)));
  // 기준정보·설정 일괄 변경 — 내보내기 / 가져오기(apply=false 면 미리보기)
  r.get('/admin/reference', h(() => A.exportReference()));
  r.post('/admin/reference/import', h((req) => A.importReference(b(req).payload, { apply: b(req).apply === true })));

  r.get('/admin/reviews', h(() => A.listReviews()));
  r.get('/admin/voc', h(() => A.listVocs()));
  r.patch('/admin/voc/:id', h((req) => A.updateVoc(req.params.id, b(req))));

  r.get('/admin/messages/matches', h(() => A.messageMatches()));
  r.get('/admin/messages/matches/:id', h((req) => A.matchMessages(req.params.id)));
  r.get('/admin/messages/users', h(() => A.messageUsers()));
  r.get('/admin/messages/users/:id', h((req) => A.userMessages(req.params.id)));
  r.post('/admin/messages/users/:id', h((req) => A.sendMessage(req.params.id, b(req).body)));

  r.get('/admin/dislikes', h(() => A.listDislikes()));
  r.get('/admin/employees', h((req) => A.searchEmployees(req.query.q)));
  r.get('/admin/blacklist', h(() => A.listBlacklist()));
  r.post('/admin/blacklist', h((req) => A.addBlacklist(b(req).empNo, b(req).reason)));
  r.delete('/admin/blacklist/:empNo', h((req) => A.removeBlacklist(req.params.empNo)));

  r.get('/admin/settings', h(() => A.getSettings()));
  r.patch('/admin/settings', h((req) => A.updateSettings(b(req))));
  r.get('/admin/audit-logs', h(() => A.listAuditLogs()));
  r.post('/admin/audit-logs/export', h((req) => A.recordExport(b(req).count)));

  // 없는 API
  r.use((req, res) => res.status(404).json({ message: '없는 API예요.', code: 'NOT_FOUND' }));
  return r;
}
