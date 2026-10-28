/**
 * ★ 사내 로그인 연동 — 방식은 servers.config.mjs 의 sso 에서 정한다. 로그인 화면은 없다.
 *
 * browser 방식 (기본)
 *   화면이 사내 인사정보 URL(sso.employeeApi)을 불러 받은 사용자 정보를 /auth/sso 로 넘긴다 → verifyBrowserEmployee
 *   sso.hrApi.url 이 있으면 이 서버가 그 사번을 인사 API 로 한 번 더 확인한다
 *
 * iis 방식
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
import { peerOf } from './clientIp.js';
import { ApiError } from '../shared/api/errors.js';
import { locateUser as locateIn, mapProfile } from '../shared/utils/employeeInfo.js';

const S = config.sso;

// ─────────────────────────────────────────────────────────
// 1) 응답 → Profile — 화면과 같은 규칙 (client/src/utils/employeeInfo.js 의 FIELD·DIVISION_MAP)
// ─────────────────────────────────────────────────────────
/** 응답 JSON 안에서 사번이 든 객체를 찾는다 (sso.resultPath 가 있으면 그 위치) */
export const locateUser = (json) => locateIn(json, S.resultPath);
const findUser = (json) => locateUser(json).user;
export { mapProfile };

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

/**
 * browser 방식 — 화면(운영 입구)이 사내 인사정보 URL 에서 받아 온 사용자 정보를 넘긴다
 *  - 화면과 같은 규칙(employeeInfo.js)으로 사번·재직 여부를 읽는다
 *  - sso.hrApi.url 이 있으면 API 서버가 그 사번으로 인사 API 에 한 번 더 물어 본다 (있는 사번인지·재직 중인지)
 * ⚠ 화면이 보낸 값은 사용자가 꾸밀 수 있다 — hrApi 확인을 켜도 '그 사번 본인인지'는 알 수 없다
 */
export async function verifyBrowserEmployee(employee) {
  if (!employee || typeof employee !== 'object' || JSON.stringify(employee).length > 20000) return null;
  const p = mapProfile(locateIn(employee, '').user);
  if (!p) {
    console.warn('[sso] 화면이 보낸 인사정보에서 사번을 찾지 못했어요');
    return null;
  }
  const { _from, ...profile } = p;
  if (!S.hrApi.url) return profile;
  const r = await callHr({ id: profile.adId || profile.empNo, empNo: profile.empNo, domain: S.domain });
  if (!r.profile || r.profile.empNo !== profile.empNo) {
    console.warn(`[sso] 사내 인사 API 에서 사번 ${profile.empNo} 를 확인하지 못했어요 (응답 ${r.status})`);
    return null;
  }
  const { _from: f2, ...hr } = r.profile;
  return { ...profile, ...filled(hr), active: profile.active && hr.active };
}


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
   * @param {{ query?: Record<string,string>, employee?: object }} [hint] 화면이 넘겨준 값 — employee: browser 방식의 인사정보, query: url 방식의 ticket 등
   */
  async identify(hint = {}) {
    const req = currentReq();
    if (S.mode === 'browser') return verifyBrowserEmployee(hint.employee);
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
      const r = await probe({ ip: req?.clientIp, cookieHeader: req?.headers?.cookie, query: hint.query });
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
