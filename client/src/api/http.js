/**
 * 실서버 API 클라이언트 — 엔드포인트 명세는 docs/DESIGN.md "5. API 명세" 참고
 * 화면(Web 서버)과 API 서버의 주소가 달라 쿠키 대신 세션 헤더로 로그인을 이어 간다:
 *   서버가 응답 헤더 X-Sasystem-Session 으로 준 값을 이 탭(sessionStorage)에 두고, 요청마다 같은 헤더로 보낸다.
 *   탭을 닫으면 사라지고, 새 탭은 화면을 열 때 사내 인사정보로 다시 로그인한다 (stores/session.js)
 */
/* global __SASYSTEM_DEV_API__ */
import { ApiError } from '@shared/api/errors.js';
import { API_BASE } from '@/config';

const SESSION_HEADER = 'X-Sasystem-Session';
const SESSION_KEY = 'sasystem.session';
/** 저장소를 쓸 수 없는 브라우저면 이 화면을 여는 동안만 메모리에 둔다 */
let memorySession = '';
const readSession = () => {
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? '';
  } catch {
    return memorySession;
  }
};
const writeSession = (v) => {
  memorySession = v;
  try {
    if (v) sessionStorage.setItem(SESSION_KEY, v);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* 메모리 값만 쓴다 */
  }
};

/** @param {{ timeoutMs?: number }} [opt] timeoutMs: 이 시간 안에 응답이 없으면 연결 실패로 본다 (입구 확인처럼 화면이 기다리는 요청) */
async function request(method, path, body, { timeoutMs = 0 } = {}) {
  let res;
  try {
    const sid = readSession();
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'omit',
      ...(timeoutMs && { signal: AbortSignal.timeout(timeoutMs) }),
      headers: {
        // 서버는 이 헤더가 없는 상태 변경 요청을 거절한다 (CSRF 방어 보조)
        'X-Requested-With': 'sasystem',
        ...(sid && { [SESSION_HEADER]: sid }),
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, '서버에 연결하지 못했어요. 사내망 연결을 확인한 뒤 다시 시도해 주세요.', 'NETWORK');
  }

  const issued = res.headers.get(SESSION_HEADER);
  if (issued) writeSession(issued);
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
    logout: () => post('/auth/logout').finally(() => writeSession('')),
    /** @returns {{ adminExpiresAt }} */
    enterAdmin: (password) => post('/auth/admin', { password }),
    exitAdmin: () => del('/auth/admin'),
    /** 사내 SSO 확인 — employee: 화면이 사내 인사정보 URL 에서 받은 사용자 정보(browser 방식) · query: 주소창의 값 */
    sso: (hint = {}) => request('POST', '/auth/sso', { query: hint.query ?? {}, ...(hint.employee && { employee: hint.employee }) }, { timeoutMs: 20000 }),
    // 개발 화면(npm run dev) 테스트 사번 — 운영 빌드에서는 상수 false 라 이 두 줄이 빠진다
    ...(__SASYSTEM_DEV_API__ && {
      devAccounts: () => get('/auth/dev-accounts'),
      devLogin: (empNo) => post('/auth/dev-login', { empNo }),
    }),
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

    /** DB 표 — 목적별 표 보기·행 추가·수정·삭제 */
    tables: () => get('/admin/tables'),
    tableRows: (coll) => get(`/admin/tables/${coll}/rows`),
    /** id 가 없으면 추가 · { key(map 표의 행 키), doc(행 원본) } */
    saveTableRow: (coll, id, row) => (id === null || id === undefined || id === ''
      ? post(`/admin/tables/${coll}/rows`, row)
      : put(`/admin/tables/${coll}/rows/${encodeURIComponent(id)}`, row)),
    deleteTableRow: (coll, id) => del(`/admin/tables/${coll}/rows/${encodeURIComponent(id)}`),
    purgeTestData: () => post('/admin/test-data/purge'),
  },
};
