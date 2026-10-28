/**
 * 실서버 API 클라이언트 — 엔드포인트 명세는 docs/DESIGN.md "5. API 명세" 참고
 * 인증은 서버가 발급한 HttpOnly 세션 쿠키로 처리하므로 토큰을 JS에서 다루지 않는다.
 */
import { ApiError } from '@shared/api/errors.js';

/** @param {{ timeoutMs?: number }} [opt] timeoutMs: 이 시간 안에 응답이 없으면 연결 실패로 본다 (입구 확인처럼 화면이 기다리는 요청) */
async function request(method, path, body, { timeoutMs = 0 } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      ...(timeoutMs && { signal: AbortSignal.timeout(timeoutMs) }),
      headers: {
        // 서버는 이 헤더가 없는 상태 변경 요청을 거절한다 (CSRF 방어 보조)
        'X-Requested-With': 'sayeon',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, '서버에 연결하지 못했어요. 사내망 연결을 확인한 뒤 다시 시도해 주세요.', 'NETWORK');
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.message ?? `요청을 처리하지 못했어요. (오류 ${res.status})`, data?.code);
  }
  return data;
}

const get = (p) => request('GET', p);
const post = (p, b = {}) => request('POST', p, b);
const put = (p, b) => request('PUT', p, b);
const patch = (p, b) => request('PATCH', p, b);
const del = (p) => request('DELETE', p);

export const api = {
  auth: {
    // 운영은 사내 인사정보로만 들어온다 (ID/비밀번호 로그인 없음 — 개발 모드의 계정 로그인은 api/mock)
    me: () => request('GET', '/auth/me', undefined, { timeoutMs: 15000 }),
    logout: () => post('/auth/logout'),
    /** @returns {{ adminExpiresAt }} */
    enterAdmin: (password) => post('/auth/admin', { password }),
    exitAdmin: () => del('/auth/admin'),
    /** 사내 SSO 확인 — employee: 화면이 사내 인사정보 URL 에서 받은 사용자 정보(browser 방식) · query: 주소창의 값 */
    sso: (hint = {}) => request('POST', '/auth/sso', { query: hint.query ?? {}, ...(hint.employee && { employee: hint.employee }) }, { timeoutMs: 20000 }),
  },

  codes: {
    /** 기준정보 전체 { [group]: [{ value, text, order, use, parent?, attr? }] } */
    list: () => get('/codes'),
  },

  application: {
    /** 신청 내역이 없으면 null (204) */
    getMine: () => get('/applications/me'),
    create: (data) => post('/applications', data),
    update: (data) => put('/applications/me', data),
    withdraw: () => del('/applications/me'),
    /** 쓰지 않은 닉네임 추천 */
    suggestNicknames: (count = 4) => get(`/applications/nicknames?count=${count}`),
  },

  /** 마이페이지: 상태 · 오늘의 후보 · 받은 하트 */
  me: {
    dashboard: () => get('/me/dashboard'),
    pass: () => post('/me/daily/pass'),
    heart: () => post('/me/daily/heart'),
    answerHeart: (heartId, accept) => post(`/me/hearts/${heartId}`, { accept }),
    /** 매칭 후기 { outcome, rating, wantMore, comment } */
    submitReview: (review) => put('/me/review', review),
    resume: () => post('/me/resume'),
    /** 커플 최종 완료 */
    completeCouple: () => post('/me/couple'),
  },

  stats: {
    gathering: () => get('/stats/gathering'),
  },

  /** 쪽지함 */
  messages: {
    /** box: inbox | sent | trash */
    box: (box) => get(`/messages?box=${box}`),
    counts: () => get('/messages/counts'),
    read: (id) => get(`/messages/${id}`),
    recipients: () => get('/messages/recipients'),
    /** to: 'A{신청자id}'(담당자) | 'M{매칭id}'(매칭 상대) */
    send: (to, body) => post('/messages', { to, body }),
    /** to: trash | restore | delete */
    move: (ids, to) => post('/messages/move', { ids, to }),
    unread: () => get('/messages/unread'),
  },

  /** 사주로 찾은 인연 (신청 전) */
  saju: {
    pick: (birth) => post('/saju/pick', birth),
    /** 신청 전: 필수 항목으로 신청 + 사주 인연에게 하트 */
    apply: (data) => post('/saju/apply', data),
    /** 신청 후: 사주 인연에게 바로 하트 */
    heart: () => post('/saju/heart'),
  },

  /** 시스템 개선의 소리 */
  voc: {
    create: (item) => post('/voc', item),
    listMine: () => get('/voc/mine'),
  },

  admin: {
    stats: () => get('/admin/stats'),
    listApplicants: () => get('/admin/applicants'),
    getApplicant: (id) => get(`/admin/applicants/${id}`),
    updateApplicant: (id, data) => put(`/admin/applicants/${id}`, data),
    changeStatus: (ids, status) => patch('/admin/applicants/status', { ids, status }),
    deleteApplicant: (id) => del(`/admin/applicants/${id}`),
    getCandidates: (id) => get(`/admin/applicants/${id}/candidates`),

    listMatches: () => get('/admin/matches'),
    createMatch: (aId, bId, memo = '') => post('/admin/matches', { aId, bId, memo }),
    updateMatch: (id, changes) => patch(`/admin/matches/${id}`, changes),
    deleteMatch: (id) => del(`/admin/matches/${id}`),

    listCodes: (group) => get(`/admin/codes/${group}`),
    createCode: (group, item) => post(`/admin/codes/${group}`, item),
    updateCode: (group, value, changes) => patch(`/admin/codes/${group}/${encodeURIComponent(value)}`, changes),
    deleteCode: (group, value) => del(`/admin/codes/${group}/${encodeURIComponent(value)}`),
    exportReference: () => get('/admin/reference'),
    importReference: (payload, { apply = false } = {}) => post('/admin/reference/import', { payload, apply }),

    listReviews: () => get('/admin/reviews'),
    resetDislikes: (id) => post(`/admin/applicants/${id}/reset-dislikes`),
    listVocs: () => get('/admin/voc'),
    updateVoc: (id, changes) => patch(`/admin/voc/${id}`, changes),
    messageMatches: () => get('/admin/messages/matches'),
    matchMessages: (matchId) => get(`/admin/messages/matches/${matchId}`),
    messageUsers: () => get('/admin/messages/users'),
    userMessages: (applicantId) => get(`/admin/messages/users/${applicantId}`),
    sendMessage: (applicantId, body) => post(`/admin/messages/users/${applicantId}`, { body }),
    listDislikes: () => get('/admin/dislikes'),
    searchEmployees: (q) => get(`/admin/employees?q=${encodeURIComponent(q)}`),
    listBlacklist: () => get('/admin/blacklist'),
    addBlacklist: (empNo, reason) => post('/admin/blacklist', { empNo, reason }),
    removeBlacklist: (empNo) => del(`/admin/blacklist/${empNo}`),
    getSettings: () => get('/admin/settings'),
    updateSettings: (changes) => patch('/admin/settings', changes),

    listAuditLogs: () => get('/admin/audit-logs'),
    recordExport: (count) => post('/admin/audit-logs/export', { count }),
  },
};
