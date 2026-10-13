/**
 * ★ 사내 AD / SSO 연동 — 회사 환경에 맞게 이 파일과 .env 만 고치면 된다.
 *
 * 서비스가 받는 임직원 정보(Profile)
 *   { empNo: '사번', adId: '사내 계정 ID', name: '이름', gender: 'M'|'F'|null,
 *     division: '사업부 코드(기준정보 DIVISION 값)', team: '팀 이름', email: '메일', active: true(재직)|false }
 * 서버는 이 정보로 화면을 나눈다.
 *   관리자: config/admins.js 에 있는 사번·계정  → 관리자 주소(/admin)에서 관리자 비밀번호까지 맞으면 관리 화면
 *   신청자: 신청서가 있는 사람 (상태: 매칭 대기 중 / 매칭 중 / 커플 성사)
 *   미신청: 신청서가 없는 사람 → 소개·신청 화면
 *
 * 연결 방식 (.env 의 SSO_MODE)
 *   header : 앞단(IIS·SSO 에이전트)이 확인한 사용자 ID를 요청 헤더(SSO_HEADER)로 넘겨줄 때
 *            → 헤더 값(사번 또는 계정 ID)으로 HR_LOOKUP_URL 을 불러 인사정보를 받는다
 *            ⚠ 앞단이 비밀값 헤더(SSO_PROXY_SECRET)도 함께 붙여야 한다. 없으면 3000번 포트로 직접 들어와
 *              헤더를 꾸민 요청을 막을 수 없어서, 비밀값이 비어 있으면 header 모드는 아무도 통과시키지 않는다
 *   api    : 브라우저에 있는 사내 SSO 토큰 쿠키(SSO_TOKEN_COOKIE)를 사내 인증 API(SSO_VERIFY_URL)로 확인할 때
 *   off    : SSO 없이 로그인 화면의 ID/비밀번호만 쓴다 (AUTH_LOGIN_URL)
 * 로그인 화면 ID/비밀번호 확인은 모드와 상관없이 AUTH_LOGIN_URL 로 한다.
 */
import { config } from './config.js';
import { currentReq } from './context.js';
import { ApiError } from '../../client/src/api/errors.js';

const S = config.sso;

// ─────────────────────────────────────────────────────────
// 1) 사내 응답 → Profile. 사내 API의 필드 이름이 다르면 여기만 고친다
//    (점으로 이어 쓰면 안쪽 값: 'org.deptName')
// ─────────────────────────────────────────────────────────
const FIELD = {
  empNo: ['empNo', 'employeeNo', 'EMP_NO', 'sabun'],
  adId: ['adId', 'userId', 'loginId', 'sAMAccountName', 'USER_ID'],
  name: ['name', 'userName', 'displayName', 'EMP_NM'],
  gender: ['gender', 'sex', 'GENDER'],
  division: ['division', 'divisionName', 'bizUnit', 'DIVISION_NM'],
  team: ['team', 'deptName', 'department', 'DEPT_NM'],
  email: ['email', 'mail', 'EMAIL'],
  status: ['status', 'workStatus', 'employmentStatus', 'STATUS'],
};

/** 사업부 이름(사내 인사정보) → 기준정보 DIVISION 코드. 조직이 바뀌면 여기에 추가 */
const DIVISION_MAP = [
  [/메모리|memory/i, 'MEMORY'],
  [/system\s*lsi|시스템\s*lsi|lsi/i, 'LSI'],
  [/파운드리|foundry/i, 'FOUNDRY'],
  [/.*/, 'COMMON'], // 그 밖의 DS부문 조직은 'DS부문 공통'
];

/** 재직 상태 값 중 '재직 아님'으로 볼 값 */
const INACTIVE = /퇴직|휴직|inactive|retired|resigned|^n$|^false$|^0$/i;

function pickField(raw, names) {
  for (const name of names) {
    const v = name.split('.').reduce((o, k) => (o == null ? undefined : o[k]), raw);
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

export function mapProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const empNo = pickField(raw, FIELD.empNo);
  if (!empNo) return null;
  const g = (pickField(raw, FIELD.gender) ?? '').toUpperCase();
  const divName = pickField(raw, FIELD.division) ?? '';
  const status = pickField(raw, FIELD.status);
  return {
    empNo,
    adId: pickField(raw, FIELD.adId) ?? '',
    name: pickField(raw, FIELD.name) ?? '',
    gender: ['M', 'MALE', '남', '남성', '1'].includes(g) ? 'M' : ['F', 'FEMALE', '여', '여성', '2'].includes(g) ? 'F' : null,
    division: divName ? DIVISION_MAP.find(([re]) => re.test(divName))[1] : null,
    team: pickField(raw, FIELD.team) ?? '',
    email: pickField(raw, FIELD.email) ?? '',
    active: status ? !INACTIVE.test(status) : true,
  };
}

// ─────────────────────────────────────────────────────────
// 2) 사내 API 호출 도우미
// ─────────────────────────────────────────────────────────
/** 응답 JSON에서 실제 사용자 정보가 있는 위치 (.env 의 SSO_RESULT_PATH, 예: 'data.user') */
const unwrap = (json) => (S.resultPath ? S.resultPath.split('.').reduce((o, k) => (o == null ? o : o[k]), json) : json);

async function callApi(url, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(S.apiKey && { [S.apiKeyHeader]: S.apiKey }),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(S.timeoutMs),
  }).catch((e) => {
    console.error('[sso] 사내 인증 API에 연결하지 못했어요:', url, e.message);
    throw new ApiError(503, '사내 인증 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'SSO_UNAVAILABLE');
  });
  if (res.status === 401 || res.status === 403 || res.status === 404) return null;
  if (!res.ok) {
    console.error('[sso] 사내 인증 API 오류:', url, res.status);
    throw new ApiError(503, '사내 인증 서버가 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.', 'SSO_UNAVAILABLE');
  }
  return unwrap(await res.json().catch(() => null));
}

/** URL 안의 {id}·{empNo}·{q} 자리에 값을 넣는다 (예: https://hr.company/api/emp/{empNo}) */
const fill = (template, value) => template.replace(/\{(id|empNo|q)\}/g, encodeURIComponent(value));

function readCookie(req, name) {
  const header = req?.headers?.cookie ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

// ─────────────────────────────────────────────────────────
// 3) 서비스가 부르는 함수 — 사내 방식이 많이 다르면 이 함수들의 안쪽을 고친다
// ─────────────────────────────────────────────────────────
export const directory = {
  /** 로그인 화면: 사내 계정 ID(또는 사번) + 비밀번호 → Profile (틀리면 null) */
  async authenticate(account, password) {
    if (!S.loginUrl) throw new ApiError(503, '사내 계정 로그인이 아직 연결되지 않았어요. 담당자에게 문의해 주세요.', 'AUTH_NOT_CONFIGURED');
    if (!account || !password) return null;
    // 사내 로그인 API가 받는 필드 이름이 다르면 여기서 바꾼다
    const raw = await callApi(S.loginUrl, { method: 'POST', body: { userId: account, password } });
    return mapProfile(raw);
  },

  /** SSO: 지금 요청만으로 임직원을 확인 → Profile (확인 안 되면 null) */
  async identify() {
    const req = currentReq();
    if (S.mode === 'header') {
      // 헤더는 누구나 꾸밀 수 있다 — 앞단 프록시가 붙여 주는 비밀값이 맞을 때만 믿는다
      if (!S.proxySecret || req?.headers?.[S.proxySecretHeader] !== S.proxySecret) return null;
      const id = req?.headers?.[S.headerName];
      if (!id) return null;
      // 헤더에 인사정보가 다 들어오지 않으면 HR 조회로 채운다
      return S.lookupUrl ? mapProfile(await callApi(fill(S.lookupUrl, String(id)))) : mapProfile({ empNo: id, adId: id });
    }
    if (S.mode === 'api') {
      const token = S.tokenCookie ? readCookie(req, S.tokenCookie) : null;
      if (!token || !S.verifyUrl) return null;
      return mapProfile(await callApi(S.verifyUrl, { method: 'POST', body: { token } }));
    }
    return null; // off
  },

  /** 관리자 블랙리스트 등록용 임직원 검색 (HR_SEARCH_URL, 선택) */
  async search(q) {
    if (!S.searchUrl) return [];
    const list = await callApi(fill(S.searchUrl, q));
    return Array.isArray(list) ? list.map(mapProfile).filter(Boolean) : [];
  },

  /** 사번 하나로 인사정보 조회 (HR_LOOKUP_URL, 선택) */
  async lookup(empNo) {
    if (!S.lookupUrl) return null;
    return mapProfile(await callApi(fill(S.lookupUrl, empNo)));
  },
};
