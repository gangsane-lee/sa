/**
 * ★ 사내 로그인 연동 — 방식은 servers.config.mjs 의 sso 에서 정한다. 로그인 화면은 없다.
 *
 * iis 방식 (기본)
 *   1) Web 서버 IIS 가 Windows 인증(AD SSO)으로 사용자를 확인하고 'SECDS\아이디' 를 헤더(sso.header)에 담아 넘긴다
 *      → 이 헤더는 Web 서버 IP(servers.config.mjs 의 web.host)에서 온 요청일 때만 믿는다
 *   2) adLookup: API 서버가 AD 에서 그 아이디의 사번·이름·부서·메일·계정 사용 여부를 읽는다 (PowerShell, 도메인 가입 필요)
 *   3) hrApi: 사내 인사 API 에 {id}·{empNo} 를 넣어 인사정보를 받는다 (비우면 AD 정보만)
 *   → 확인되면 바로 홈 / 아니면 'AD SSO로 확인된 임직원만 이용할 수 있어요' 안내 화면
 *
 * url 방식 — 인사정보를 돌려주는 SSO 주소 한 줄 (sso.url, 자리표시 {ip} {cookie:이름} {query:이름})
 *
 * 응답 JSON 어디에 있든 사번이 든 객체를 찾고, 필드 이름도 대소문자·_ 를 무시하고 알아본다.
 * 무엇이 오는지 직접 보려면  npm run sso:test -- --user 아이디
 *
 * 서비스가 받는 임직원 정보(Profile)
 *   { empNo, adId, name, gender: 'M'|'F'|null, division: 사업부 코드, team, email, active }
 */
import { execFile } from 'node:child_process';
import { config } from './config.js';
import { currentReq } from './context.js';
import { ApiError } from '../../client/src/api/errors.js';

const S = config.sso;

// ─────────────────────────────────────────────────────────
// 1) 응답 → Profile. 필드 이름은 대소문자·_·- 를 무시하고 비교한다 (EMP_NO = empNo = empno)
//    사내 응답의 이름이 목록에 없으면 여기에 추가한다
// ─────────────────────────────────────────────────────────
const FIELD = {
  empNo: ['empNo', 'employeeNo', 'employeeNumber', 'employeeId', 'empId', 'sabun', 'saBun', 'userNo', 'personNo'],
  adId: ['adId', 'userId', 'loginId', 'sAMAccountName', 'account', 'accountId', 'epId', 'knoxId', 'uid', 'mailId'],
  name: ['name', 'userName', 'displayName', 'korName', 'fullName', 'empNm', 'empName', 'userNm', 'korNm', 'nameKor'],
  gender: ['gender', 'sex', 'sexCd', 'genderCd'],
  division: ['divisionName', 'division', 'divName', 'divNm', 'bizUnit', 'businessUnit', 'bizNm', 'buNm', 'divisionNm'],
  team: ['team', 'teamName', 'teamNm', 'deptName', 'deptNm', 'department', 'departmentName', 'orgName', 'orgNm'],
  email: ['email', 'mail', 'emailAddress', 'emailAddr', 'mailAddr'],
  status: ['status', 'workStatus', 'employmentStatus', 'empStatus', 'workStat', 'empStat', 'hrStatus'],
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

const norm = (k) => String(k).toLowerCase().replace(/[_\-\s.]/g, '');
const WANT = Object.fromEntries(Object.entries(FIELD).map(([k, names]) => [k, new Set(names.map(norm))]));

/** 객체에서 후보 이름 중 하나로 값을 찾는다 → { value, key } */
function pick(raw, field) {
  for (const [k, v] of Object.entries(raw)) {
    if (WANT[field].has(norm(k)) && v !== null && v !== undefined && typeof v !== 'object' && String(v).trim() !== '') {
      return { value: String(v).trim(), key: k };
    }
  }
  return null;
}

/**
 * 응답 JSON 안에서 사번이 든 객체를 찾는다 (SSO_RESULT_PATH 가 있으면 그 위치)
 * @returns {{ user: object|null, path: string }} path: 찾은 위치 (예: 'data.user', 맨 바깥이면 '')
 */
export function locateUser(json) {
  if (S.resultPath) {
    const user = S.resultPath.split('.').reduce((o, k) => (o == null ? o : o[k]), json) ?? null;
    return { user: user && typeof user === 'object' ? user : null, path: S.resultPath };
  }
  const queue = [[json, '']];
  for (let i = 0; i < queue.length && i < 200; i++) {
    const [node, at] = queue[i];
    if (!node || typeof node !== 'object') continue;
    if (!Array.isArray(node) && pick(node, 'empNo')) return { user: node, path: at };
    for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') queue.push([v, at ? `${at}.${k}` : k]);
  }
  return { user: null, path: '' };
}
const findUser = (json) => locateUser(json).user;

/** 사용자 정보 객체 → Profile (+ 어떤 필드에서 읽었는지) */
export function mapProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const got = Object.fromEntries(Object.keys(FIELD).map((f) => [f, pick(raw, f)]));
  if (!got.empNo) return null;
  const g = (got.gender?.value ?? '').toUpperCase();
  const divName = got.division?.value ?? '';
  return {
    empNo: got.empNo.value,
    adId: got.adId?.value ?? '',
    name: got.name?.value ?? '',
    gender: ['M', 'MALE', '남', '남성', '남자', '1'].includes(g) ? 'M' : ['F', 'FEMALE', '여', '여성', '여자', '2'].includes(g) ? 'F' : null,
    division: divName ? DIVISION_MAP.find(([re]) => re.test(divName))[1] : null,
    team: got.team?.value ?? '',
    email: got.email?.value ?? '',
    active: got.status ? !INACTIVE.test(got.status.value) : true,
    /** 점검용 — 각 항목을 응답의 어느 필드에서 읽었는지 (서비스는 쓰지 않는다) */
    _from: Object.fromEntries(Object.entries(got).map(([f, v]) => [f, v?.key ?? null])),
  };
}

// ─────────────────────────────────────────────────────────
// 2) SSO_URL 채우기 · 부르기
// ─────────────────────────────────────────────────────────
const PLACEHOLDER = /\{(ip|cookie:[^}]+|query:[^}]+)\}/g;

/** SSO_URL 에 쓴 자리표시 목록 (점검용) */
export const placeholdersOf = (url) => [...String(url).matchAll(PLACEHOLDER)].map((m) => m[1]);

function readCookie(header, name) {
  for (const part of String(header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) {
      try {
        return decodeURIComponent(v.join('='));
      } catch {
        return v.join('=');
      }
    }
  }
  return null;
}

const clientIp = (ip) => String(ip ?? '').replace(/^::ffff:/, '');

/**
 * 요청 정보로 SSO_URL 을 채운다. 비어 있는 값이 있으면 { missing } — SSO 확인을 할 수 없는 상태
 * @param {{ ip?: string, cookieHeader?: string, query?: Record<string,string> }} src
 */
export function fillSsoUrl(template, src) {
  const missing = [];
  const url = template.replace(PLACEHOLDER, (_, p) => {
    let v = null;
    if (p === 'ip') v = clientIp(src.ip);
    else if (p.startsWith('cookie:')) v = readCookie(src.cookieHeader, p.slice(7));
    else if (p.startsWith('query:')) v = src.query?.[p.slice(6)] ?? null;
    if (v === null || v === undefined || String(v) === '') {
      missing.push(p);
      return '';
    }
    return encodeURIComponent(String(v));
  });
  return { url, missing };
}

async function callApi(url, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(S.apiKey && { [S.apiKeyHeader]: S.apiKey }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(S.timeoutMs),
      redirect: 'manual', // SSO가 로그인 페이지로 돌려보내면(302) '확인 안 됨'으로 본다
    });
  } catch (e) {
    console.error('[sso] 사내 SSO에 연결하지 못했어요:', url.replace(/\?.*/, '?…'), e.cause?.code ?? e.message);
    throw new ApiError(503, '사내 인증 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'SSO_UNAVAILABLE');
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* JSON 이 아님 */
  }
  return { status: res.status, json, text };
}

/**
 * SSO_URL 을 불러 결과를 자세히 돌려준다 — 로그인과 npm run sso:test 가 함께 쓴다
 * @returns {Promise<{ url: string, missing: string[], status?: number, json?: any, text?: string, user?: object, profile?: object|null }>}
 */
export async function probe(src) {
  const { url, missing } = fillSsoUrl(S.url, src);
  if (missing.length) return { url, missing };
  const r = await callApi(url);
  const user = r.status >= 200 && r.status < 300 && r.json ? findUser(r.json) : null;
  return { url, missing, status: r.status, json: r.json, text: r.text, user, profile: user ? mapProfile(user) : null };
}

// ─────────────────────────────────────────────────────────
// 3) iis 방식 — IIS 가 넘긴 계정 → AD → 사내 인사 API
// ─────────────────────────────────────────────────────────
const ACCOUNT = /^[A-Za-z0-9._-]{1,64}$/;

/** 'SECDS\gildong.hong' · 'gildong.hong@secds.net' · 'gildong.hong' → { domain, id } */
export function splitAccount(raw) {
  const s = String(raw ?? '').trim();
  if (s.includes('\\')) {
    const [domain, id] = s.split('\\');
    return { domain: domain.toUpperCase(), id };
  }
  if (s.includes('@')) {
    const [id, realm] = s.split('@');
    return { domain: realm.split('.')[0].toUpperCase(), id };
  }
  return { domain: '', id: s };
}

const AD_PROPS = ['samaccountname', 'employeeid', 'employeenumber', 'displayname', 'department', 'division', 'company', 'mail', 'title', 'useraccountcontrol'];
// 아이디는 환경 변수로 넘긴다 (명령 문자열에 끼워 넣지 않는다). 결과는 UTF-8 JSON 한 줄
const AD_SCRIPT = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$s = New-Object System.DirectoryServices.DirectorySearcher
if ($env:SAYEON_AD_PATH) { $s.SearchRoot = New-Object System.DirectoryServices.DirectoryEntry($env:SAYEON_AD_PATH) }
$s.Filter = "(&(objectCategory=person)(objectClass=user)(sAMAccountName=$($env:SAYEON_AD_ID)))"
${AD_PROPS.map((p) => `[void]$s.PropertiesToLoad.Add('${p}')`).join('\n')}
$r = $s.FindOne()
if (-not $r) { '{}'; exit 0 }
$o = [ordered]@{}
foreach ($k in $r.Properties.PropertyNames) { if ($k -ne 'adspath') { $o[$k] = [string]$r.Properties[$k][0] } }
$o | ConvertTo-Json -Compress
`;
const AD_ENCODED = Buffer.from(AD_SCRIPT, 'utf16le').toString('base64');

/** AD 에서 계정 속성 읽기 → 속성 객체 ({} = AD 에 없음). 조회 자체가 안 되면 ApiError(503) */
let adLookupImpl = (id) =>
  new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', AD_ENCODED],
      { env: { ...process.env, SAYEON_AD_ID: id, SAYEON_AD_PATH: S.adPath }, timeout: 10000, windowsHide: true, encoding: 'utf8', maxBuffer: 1 << 20 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(String(stderr || err.message).trim().split('\n')[0]));
        try {
          resolve(JSON.parse(String(stdout).trim() || '{}'));
        } catch {
          reject(new Error(`AD 조회 결과를 읽지 못했어요: ${String(stdout).slice(0, 120)}`));
        }
      },
    );
  });
/** 점검·시험용 — AD 조회를 바꿔 끼운다 */
export const setAdLookup = (fn) => {
  adLookupImpl = fn;
};

const adCache = new Map(); // 아이디 → { at, attrs } (10분)
async function adLookup(id) {
  const hit = adCache.get(id);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.attrs;
  try {
    const attrs = await adLookupImpl(id);
    adCache.set(id, { at: Date.now(), attrs });
    return attrs;
  } catch (e) {
    console.error('[sso] AD 조회 실패:', e.message);
    throw new ApiError(503, '사내 계정 정보(AD)를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'SSO_UNAVAILABLE');
  }
}

/** 본문·주소의 {id} {empNo} {domain} 채우기 */
const fillValue = (v, vars, enc) => (typeof v === 'string' ? v.replace(/\{(id|empNo|domain|q)\}/g, (_, k) => (enc ? encodeURIComponent(vars[k] ?? '') : (vars[k] ?? ''))) : v);
const fillDeep = (v, vars) =>
  Array.isArray(v) ? v.map((x) => fillDeep(x, vars)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillDeep(x, vars)])) : fillValue(v, vars, false);
const needs = (tpl, key) => JSON.stringify(tpl).includes(`{${key}}`);

/** 사내 인사 API 부르기 → { url, status, json, user, profile } */
async function callHr(vars) {
  const h = S.hrApi;
  const url = fillValue(h.url, vars, true);
  const r = await callApi(url, h.method === 'POST' ? { method: 'POST', body: fillDeep(h.body, vars) } : {});
  if (r.status >= 500) {
    console.error('[sso] 사내 인사 API 오류:', r.status);
    throw new ApiError(503, '사내 인사정보 서버가 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.', 'SSO_UNAVAILABLE');
  }
  const user = r.status >= 200 && r.status < 300 && r.json ? findUser(r.json) : null;
  return { url, status: r.status, json: r.json, text: r.text, user, profile: user ? mapProfile(user) : null };
}

const filled = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([k, v]) => k !== '_from' && v !== null && v !== '' && v !== undefined));

/**
 * 사내 계정 ID 하나로 임직원 정보를 만든다 — 로그인과 npm run sso:test 가 함께 쓴다
 * @returns {Promise<{ id, domain, ad: object|null, adProfile: object|null, hr: object|null, profile: object|null, reason?: string }>}
 */
export async function resolveAccount(id, domain = S.domain) {
  const out = { id, domain, ad: null, adProfile: null, hr: null, profile: null };
  if (!ACCOUNT.test(id)) return { ...out, reason: `계정 ID 형식이 맞지 않아요: ${id}` };

  if (S.adLookup) {
    out.ad = await adLookup(id);
    if (!Object.keys(out.ad).length) return { ...out, reason: 'AD 에 없는 계정이에요' };
    out.adProfile = mapProfile(out.ad);
    // AD 에서 사용 중지된 계정(퇴사 등)은 인사 API 를 부르지 않고 '재직 아님'으로
    if (out.ad.useraccountcontrol && (Number(out.ad.useraccountcontrol) & 2) === 2) {
      out.profile = { empNo: out.adProfile?.empNo || id, adId: id, name: out.adProfile?.name ?? '', gender: null, division: null, team: '', email: '', active: false };
      return { ...out, reason: 'AD 에서 사용 중지된 계정이에요' };
    }
  }
  const vars = { id, domain, empNo: out.adProfile?.empNo ?? '' };
  if (S.hrApi.url) {
    if ((needs(S.hrApi.body, 'empNo') || needs(S.hrApi.url, 'empNo')) && !vars.empNo) {
      return { ...out, reason: '인사 API 에 넣을 사번을 AD 에서 찾지 못했어요 (AD 의 employeeID 등 확인, 또는 hrApi.body 를 {id} 로)' };
    }
    out.hr = await callHr(vars);
    if (!out.hr.profile) return { ...out, reason: `사내 인사 API 에서 확인되지 않았어요 (응답 ${out.hr.status})` };
  }

  const disabled = out.ad?.useraccountcontrol ? (Number(out.ad.useraccountcontrol) & 2) === 2 : false;
  const base = { empNo: id, adId: id, name: '', gender: null, division: null, team: '', email: '', active: true };
  const profile = { ...base, ...filled(out.adProfile), ...filled(out.hr?.profile) };
  profile.adId = id;
  if (disabled || out.adProfile?.active === false || out.hr?.profile?.active === false) profile.active = false;
  out.profile = profile;
  return out;
}

/** 요청을 보낸 곳 (IIS 를 거쳤으면 Web 서버 IP) */
const peerOf = (req) => clientIp(req?.socket?.remoteAddress);

// ─────────────────────────────────────────────────────────
// 4) 서비스가 부르는 함수
// ─────────────────────────────────────────────────────────
export const directory = {
  /** 운영은 SSO 로만 들어온다 — ID/비밀번호 로그인은 쓰지 않는다 */
  async authenticate() {
    throw new ApiError(403, '사내 SSO로만 들어올 수 있어요.', 'SSO_ONLY');
  },

  /**
   * SSO: 지금 요청만으로 임직원을 확인 → Profile (확인 안 되면 null)
   * @param {{ query?: Record<string,string> }} [hint] 화면이 넘겨준 주소창의 값 (url 방식의 ticket 등)
   */
  async identify(hint = {}) {
    const req = currentReq();
    if (S.mode === 'iis') {
      let raw = req?.headers?.[S.headerName];
      if (!raw && S.devUser) raw = S.devUser; // 개발 환경 시험용
      else if (!config.trustedProxies.includes(peerOf(req))) {
        if (raw) console.warn(`[sso] Web 서버(${config.trustedProxies.join(', ')})가 아닌 ${peerOf(req)} 에서 로그인 헤더가 왔어요 — 무시해요`);
        return null;
      }
      if (!raw) {
        console.warn('[sso] IIS 가 사용자 계정을 넘기지 않았어요 — Web 서버의 Windows 인증·헤더 설정을 확인해 주세요');
        return null;
      }
      const { domain, id } = splitAccount(raw);
      if (S.domain && domain && domain !== S.domain) {
        console.warn(`[sso] 다른 도메인 계정이에요: ${domain}`);
        return null;
      }
      const r = await resolveAccount(id, domain || S.domain);
      if (!r.profile) {
        console.warn(`[sso] ${id}: ${r.reason}`);
        return null;
      }
      return r.profile;
    }
    if (S.mode === 'url') {
      const r = await probe({ ip: req?.ip, cookieHeader: req?.headers?.cookie, query: hint.query });
      if (r.missing.length) {
        console.warn(`[sso] SSO 확인에 필요한 값이 없어요: ${r.missing.join(', ')}`);
        return null;
      }
      if (r.status >= 500) {
        console.error('[sso] 사내 SSO 오류:', r.status);
        throw new ApiError(503, '사내 인증 서버가 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.', 'SSO_UNAVAILABLE');
      }
      if (!r.profile) {
        if (r.status >= 200 && r.status < 300) console.warn('[sso] 응답에서 사번을 찾지 못했어요 —  npm run sso:test  로 응답을 확인해 주세요');
        return null;
      }
      const { _from, ...profile } = r.profile;
      return profile;
    }
    throw new ApiError(503, '사내 SSO가 아직 연결되지 않았어요. 운영 담당자에게 문의해 주세요.', 'SSO_NOT_CONFIGURED');
  },

  /** 관리자 블랙리스트 등록용 임직원 검색 (sso.searchUrl, 선택) */
  async search(q) {
    if (!S.searchUrl) return [];
    const r = await callApi(fillValue(S.searchUrl, { q }, true));
    const json = r.json;
    const list = Array.isArray(json) ? json : (Object.values(json ?? {}).find(Array.isArray) ?? []);
    return list.map(mapProfile).filter(Boolean).map(({ _from, ...p }) => p);
  },

  /** 사번(또는 계정 ID) 하나로 인사정보 조회 — 관리자 블랙리스트 등록 */
  async lookup(empNo) {
    if (!S.hrApi.url) return null;
    const r = await callHr({ id: empNo, empNo, domain: S.domain });
    if (!r.profile) return null;
    const { _from, ...profile } = r.profile;
    return profile;
  },
};
