/**
 * 실서버 API 클라이언트 — 엔드포인트 명세는 docs/DESIGN.md "5. API 명세" 참고
 * 인증은 서버가 발급한 HttpOnly 세션 쿠키로 처리하므로 토큰을 JS에서 다루지 않는다.
 */
import { ApiError } from './errors.js';

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        // 서버는 이 헤더가 없는 상태 변경 요청을 거절한다 (CSRF 방어 보조)
        'X-Requested-With': 'sayeon',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, '서버에 연결하지 못했어요. 사내망 연결을 확인한 뒤 다시 시도해 주세요.');
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
    /** @returns {{ user, adminExpiresAt }} */
    login: (empNo, password) => post('/auth/login', { empNo, password }),
    me: () => get('/auth/me'),
    logout: () => post('/auth/logout'),
    /** @returns {{ adminExpiresAt }} */
    enterAdmin: (password) => post('/auth/admin', { password }),
    exitAdmin: () => del('/auth/admin'),
  },

  application: {
    /** 신청 내역이 없으면 null (204) */
    getMine: () => get('/applications/me'),
    create: (data) => post('/applications', data),
    update: (data) => put('/applications/me', data),
    withdraw: () => del('/applications/me'),
  },

  admin: {
    stats: () => get('/admin/stats'),
    listApplicants: ({ reveal = false } = {}) => get(`/admin/applicants${reveal ? '?reveal=1' : ''}`),
    getApplicant: (id) => get(`/admin/applicants/${id}`),
    updateApplicant: (id, data) => put(`/admin/applicants/${id}`, data),
    changeStatus: (ids, status) => patch('/admin/applicants/status', { ids, status }),
    deleteApplicant: (id) => del(`/admin/applicants/${id}`),
    getCandidates: (id) => get(`/admin/applicants/${id}/candidates`),

    listMatches: () => get('/admin/matches'),
    createMatch: (aId, bId, memo = '') => post('/admin/matches', { aId, bId, memo }),
    updateMatch: (id, changes) => patch(`/admin/matches/${id}`, changes),
    deleteMatch: (id) => del(`/admin/matches/${id}`),

    listAuditLogs: () => get('/admin/audit-logs'),
    recordExport: (count) => post('/admin/audit-logs/export', { count }),
  },
};
