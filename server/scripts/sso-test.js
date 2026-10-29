/**
 * 사내 로그인 연결 시험 — API 서버의 server 폴더에서
 *
 *   npm run sso:test -- --file 응답.json          browser 방식(기본): 브라우저가 받은 인사정보 응답(localStorage sasystem.employee)을 읽어 보기
 *   npm run sso:test -- --empno 사번              browser 방식: 서버 재확인용 사내 인사 API(sso.hrApi)만 시험
 *   npm run sso:test -- --user 회사아이디          iis 방식: 그 계정으로 AD 조회 → 사내 인사 API → 사緣에 들어올 정보
 *
 * (url 방식일 때)
 *   npm run sso:test -- --ip 10.1.2.3            SSO_URL 에 {ip} 가 있을 때: 확인할 사용자 PC 의 IP
 *   npm run sso:test -- --cookie SSO_TOKEN=값      {cookie:이름} 이 있을 때: 브라우저(F12 → 애플리케이션 → 쿠키)에서 복사한 값
 *   npm run sso:test -- --query ticket=값          {query:이름} 이 있을 때: SSO 로그인 뒤 돌아온 주소의 값
 *   npm run sso:test -- --url "https://..."        .env 를 고치기 전에 다른 주소로 시험
 *   npm run sso:test -- --file 응답.json            SSO 응답을 파일로 받아 두었을 때 (주소를 부르지 않고 읽기만 시험)
 *
 * SSO_URL 을 실제로 불러 응답을 보여주고, 사번·이름·사업부 등을 응답의 어느 필드에서 읽었는지 알려준다.
 * 응답에는 시험한 사람 본인의 인사정보가 나오므로 화면을 공유할 때 주의한다.
 */
import fs from 'node:fs';
import { config } from '../src/config.js';
import { createReport } from './lib/report.js';

const argv = process.argv.slice(2);
const opt = (name) => {
  const out = [];
  argv.forEach((a, i) => {
    if (a === `--${name}` && argv[i + 1] !== undefined) out.push(argv[i + 1]);
    else if (a.startsWith(`--${name}=`)) out.push(a.slice(name.length + 3));
  });
  return out;
};
if (opt('url')[0]) {
  config.sso.url = opt('url')[0];
  config.sso.mode = 'url';
}
const { probe, placeholdersOf, locateUser, mapProfile, resolveAccount, splitAccount } = await import('../src/sso.js');

const r = createReport();
const S = config.sso;
/** 토큰·ticket 처럼 긴 값만 가린다 (IP 는 그대로) */
const mask = (v) => (String(v).length <= 16 ? String(v) : `${String(v).slice(0, 4)}…(${String(v).length}자)`);
const LABEL = { empNo: '사번', adId: '사내 계정 ID', name: '이름', gender: '성별', division: '사업부', team: '팀', email: '메일', status: '재직 상태' };

// ═══ browser 방식: 브라우저가 받은 인사정보 응답을 읽어 보고, 서버 재확인(인사 API)까지 시험 ═══
if (S.mode === 'browser' && !opt('url')[0]) {
  console.log(`\n사緣 사내 로그인 시험 (브라우저가 사내 인사정보 URL 로 확인) · 환경 ${config.envName}`);
  const file = opt('file')[0];
  const empNo = opt('empno')[0];
  const E = S.employeeApi ?? {};
  r.section('설정');
  if (E.url) r.ok(`사내 인사정보 URL(사용자 PC 브라우저가 부름) ${E.method ?? 'GET'} ${E.url}${E.resultPath ? ` · 위치 ${E.resultPath}` : ''}`);
  else r.fail('servers.config.mjs 의 sso.employeeApi.url 이 비어 있어요', { reason: '모든 사용자가 "임직원만 이용할 수 있어요" 화면으로 가요.' });
  r.info(`서버 재확인(인사 API) ${S.hrApi.url ? `${S.hrApi.method} ${S.hrApi.url}` : '없음 — 브라우저가 보낸 정보를 그대로 믿어요'}`);
  if (!file && !empNo) {
    console.log('\n  사용법');
    console.log('    npm run sso:test -- --file 응답.json    사내 PC 브라우저가 받은 응답을 읽어 보기');
    console.log("        (사緣 화면 F12 → 애플리케이션 → 로컬 스토리지 → 'sasystem.employee' 값을 복사해 파일로 저장)");
    console.log('    npm run sso:test -- --empno 사번        서버 재확인용 사내 인사 API(sso.hrApi)만 시험\n');
    process.exit(r.summary({ failText: '위 사용법으로 다시 실행해 주세요.' }) || 1);
  }
  const { readEmployee } = await import('../shared/utils/employeeInfo.js');
  const { verifyBrowserEmployee } = await import('../src/sso.js');
  let user = null;
  if (file) {
    r.section(`브라우저가 받은 응답 (${file})`);
    let json;
    try {
      json = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    } catch (e) {
      r.fail('파일을 JSON 으로 읽지 못했어요', { reason: e.message });
      process.exit(r.summary({}));
    }
    const got = readEmployee(json, E.resultPath ?? '');
    if (!got.profile) {
      r.fail('응답에서 사번을 찾지 못했어요', { fix: ['사번이 든 필드 이름을 client/src/utils/employeeInfo.js 의 FIELD.empNo 에 추가', '또는 servers.config.mjs 의 sso.employeeApi.resultPath 로 위치 지정'] });
      process.exit(r.summary({}));
    }
    r.ok(`사용자 정보 위치: ${got.path || '(맨 바깥)'}`);
    for (const [k, label] of Object.entries(LABEL)) {
      const from = got.profile._from[k];
      if (from) r.info(`${label} ← '${from}' = ${got.user[from]}`);
    }
    user = got.user;
  } else user = { empNo };

  r.section('결과 — 사緣에 들어오는 정보 (서버가 확인한 값)');
  let p = null;
  try {
    p = await verifyBrowserEmployee(user);
  } catch (e) {
    r.fail(e.message, { fix: ['사내 인사 API 주소·방화벽(API 서버 → 인사 API)·SSO_API_KEY'] });
    process.exit(r.summary({}));
  }
  if (!p) r.fail('확인되지 않았어요', { reason: S.hrApi.url ? '사내 인사 API 에서 이 사번이 확인되지 않았어요.' : '사번이 없어요.' });
  else {
    for (const [k, label] of Object.entries(LABEL)) {
      if (k === 'status') (p.active ? r.ok.bind(r) : r.fail.bind(r))(`재직 상태: ${p.active ? '재직 — 들어올 수 있어요' : '재직 아님 — 들어올 수 없어요'}`);
      else if (p[k]) r.ok(`${label}: ${p[k]}`);
      else r.warn(`${label}: 비어 있어요`, { reason: k === 'gender' || k === 'division' ? '신청서에서 본인이 고르게 돼요.' : '없어도 들어갈 수는 있어요.' });
    }
  }
  process.exit(r.summary({ okText: '이 정보로 사緣에 바로 들어올 수 있어요.', failText: '✖ 항목을 확인해 주세요. 실제 접속에서는 "임직원만 이용할 수 있어요" 안내 화면이 나와요.' }));
}

// ═══ iis 방식: 회사 계정 ID 하나로 AD → 사내 인사 API 를 차례로 확인 ═══
if (S.mode === 'iis' && !opt('url')[0] && !opt('file')[0]) {
  console.log(`\n사緣 사내 로그인 시험 (IIS Windows 인증 → AD → 사내 인사 API) · 환경 ${config.envName}`);
  const raw = opt('user')[0];
  if (!raw) {
    console.log('\n  사용법: npm run sso:test -- --user 회사아이디   (SECDS\\아이디 형식도 됨)');
    console.log('  IIS 가 넘겨줄 계정과 같은 값을 넣으면, 로그인할 때와 똑같이 AD·인사 API 를 불러 결과를 보여줘요.\n');
    process.exit(1);
  }
  const { domain, id } = splitAccount(raw);
  r.section('설정');
  r.ok(`도메인 ${S.domain} · 계정 ${id}${domain && domain !== S.domain ? ` (입력한 도메인 ${domain} — 실제 로그인에서는 거절돼요)` : ''}`);
  r.info(`AD 조회 ${S.adLookup ? `켬${S.adPath ? ` (${S.adPath})` : ' (서버가 가입된 도메인)'}` : '끔'} · 사내 인사 API ${S.hrApi.url ? `${S.hrApi.method} ${S.hrApi.url}` : '없음'}`);
  let res;
  try {
    res = await resolveAccount(id, domain || S.domain);
  } catch (e) {
    r.section('결과');
    r.fail(e.message, {
      reason: S.adLookup ? 'AD 조회나 사내 인사 API 연결이 실패했어요.' : '사내 인사 API 연결이 실패했어요.',
      fix: [
        'API 서버가 도메인에 가입돼 있는지, IIS 앱 풀 ID 가 도메인 계정인지',
        `사내 인사 API 주소·방화벽(API 서버 → 인사 API)`,
      ],
    });
    process.exit(r.summary({ failText: '로그인할 때도 "사내 인증 서버에 연결하지 못했어요" 가 나와요.' }));
  }
  if (S.adLookup) {
    r.section('AD 조회');
    if (!res.ad || !Object.keys(res.ad).length) r.fail(`AD 에서 ${id} 를 찾지 못했어요`, { fix: ['계정 ID 확인 · servers.config.mjs 의 sso.adPath 확인'] });
    else {
      for (const [k, v] of Object.entries(res.ad)) r.info(`${k} = ${v}`);
      const disabled = res.ad.useraccountcontrol && (Number(res.ad.useraccountcontrol) & 2) === 2;
      if (disabled) r.warn('사용 중지된 계정이에요 — 들어올 수 없어요');
      if (res.adProfile?.empNo) r.ok(`사번 ${res.adProfile.empNo}   ← AD 의 '${res.adProfile._from.empNo}'`);
      else r.warn('AD 에서 사번을 찾지 못했어요', { reason: 'employeeID · employeeNumber 같은 속성이 없거나 비어 있어요.', fix: ["사번이 든 속성 이름을 server/src/sso.js 의 FIELD.empNo 와 AD_PROPS 에 추가 · 또는 hrApi.body 를 {id} 로"] });
    }
  }
  if (S.hrApi.url && res.hr) {
    r.section('사내 인사 API');
    r.info(`요청: ${S.hrApi.method} ${res.hr.url}`);
    if (res.hr.status >= 200 && res.hr.status < 300) r.ok(`응답 ${res.hr.status}`);
    else r.fail(`응답 ${res.hr.status}`, { reason: '이 계정으로는 인사정보가 오지 않았어요.', fix: ['본문 형식(hrApi.body)·API 키(SSO_API_KEY)를 사내 담당자에게 확인'] });
    if (res.hr.json !== null) console.log(JSON.stringify(res.hr.json, null, 2).split('\n').slice(0, 30).map((l) => `      ${l}`).join('\n'));
    else if (res.hr.text) r.fail('응답이 JSON 이 아니에요', { reason: res.hr.text.slice(0, 160) });
    if (res.hr.json && !res.hr.profile) r.fail('응답에서 사번을 찾지 못했어요', { fix: ['응답에서 사번이 든 필드 이름을 server/src/sso.js 의 FIELD.empNo 에 추가'] });
  }
  r.section('결과 — 사緣에 들어오는 정보');
  if (!res.profile) r.fail(res.reason ?? '확인되지 않았어요');
  else {
    const p = res.profile;
    for (const [k, label] of Object.entries(LABEL)) {
      if (k === 'status') (p.active ? r.ok.bind(r) : r.fail.bind(r))(`재직 상태: ${p.active ? '재직 — 들어올 수 있어요' : '재직 아님 — 들어올 수 없어요'}`);
      else if (p[k]) r.ok(`${label}: ${p[k]}`);
      else r.warn(`${label}: 비어 있어요`, { reason: k === 'gender' || k === 'division' ? '신청서에서 본인이 고르게 돼요.' : '없어도 들어갈 수는 있어요.' });
    }
  }
  process.exit(r.summary({ okText: `${id} 는 사緣에 바로 들어올 수 있어요.`, failText: '✖ 항목을 확인해 주세요. 실제 접속에서는 "AD SSO로 확인된 임직원만" 안내 화면이 나와요.' }));
}

console.log('\n사緣 사내 SSO 연결 시험');

// ── 1. 설정 ──
r.section('설정');
const file = opt('file')[0];
if (!file && !S.url) {
  r.fail('sso.url 이 비어 있어요', {
    fix: ['servers.config.mjs 의 sso.url 에  https://사내SSO주소?ip={ip}  처럼 넣거나, 이 명령에  --url "주소"  를 붙여 시험해 주세요 (docs/GO-LIVE.md 4장)'],
  });
  process.exit(r.summary({ failText: 'sso.url 을 정한 뒤 다시 실행해 주세요.' }));
}
const holes = file ? [] : placeholdersOf(S.url);
if (!file) {
  r.ok(`sso.url ${S.url}`);
  r.info(holes.length ? `자리표시: ${holes.map((h) => `{${h}}`).join(' ')}` : '자리표시 없음 — 사용자를 구분할 값이 주소에 없어요');
  if (S.apiKey) r.info(`API 키 헤더 ${S.apiKeyHeader} 를 함께 보내요`);
}

// ── 2. 요청 · 응답 ──
let json = null;
let status = null;
r.section(file ? `응답 파일 ${file}` : 'SSO 호출');
if (file) {
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
    status = 200;
    r.ok('JSON 읽음');
  } catch (e) {
    r.fail('파일을 JSON 으로 읽지 못했어요', { reason: e.message });
  }
} else {
  const cookies = opt('cookie').map((c) => c.split('=')).map(([k, ...v]) => `${k}=${encodeURIComponent(v.join('='))}`).join('; ');
  const query = Object.fromEntries(opt('query').map((q) => q.split('=')).map(([k, ...v]) => [k, v.join('=')]));
  const ip = opt('ip')[0];
  for (const h of holes) {
    const given = h === 'ip' ? ip : h.startsWith('cookie:') ? opt('cookie').some((c) => c.startsWith(`${h.slice(7)}=`)) : query[h.slice(6)];
    if (given) r.ok(`{${h}} ← ${h === 'ip' ? ip : '(입력한 값)'}`);
    else {
      const how = h === 'ip' ? '--ip 사용자PC의IP' : h.startsWith('cookie:') ? `--cookie ${h.slice(7)}=값` : `--query ${h.slice(6)}=값`;
      r.fail(`{${h}} 값이 없어요`, { fix: [`명령 뒤에  ${how}  를 붙여 주세요`] });
    }
  }
  if (!r.counts.fail) {
    try {
      const res = await probe({ ip, cookieHeader: cookies, query });
      status = res.status;
      json = res.json;
      r.info(`요청: GET ${res.url.replace(/=([^&]+)/g, (_, v) => `=${mask(decodeURIComponent(v))}`)}`);
      if (status >= 200 && status < 300) r.ok(`응답 ${status}`);
      else if ([301, 302, 303, 307, 308].includes(status)) r.fail(`응답 ${status} — 로그인 페이지로 돌려보냈어요`, { reason: 'SSO가 이 값으로는 로그인한 사용자를 찾지 못했어요.', fix: ['다른 사용자 값(IP·쿠키·ticket)으로 시험하거나, 주소 형식을 사내 SSO 담당자에게 확인해 주세요.'] });
      else if ([401, 403, 404].includes(status)) r.fail(`응답 ${status} — 확인되지 않은 사용자`, { reason: '이 값으로는 로그인한 사용자를 찾지 못했어요. 실제로는 안내 화면으로 가요.', fix: ['로그인한 사용자의 값으로 시험했는지, API 키가 필요한지(SSO_API_KEY) 확인해 주세요.'] });
      else r.fail(`응답 ${status} — SSO 서버 오류`, { fix: ['사내 SSO 담당자에게 이 주소와 응답 코드를 알려 주세요.'] });
      if (json === null && res.text) {
        r.fail('응답이 JSON 이 아니에요', { reason: res.text.slice(0, 200).replace(/\s+/g, ' '), fix: ['인사정보를 JSON 으로 돌려주는 주소인지 확인해 주세요. (로그인 페이지 HTML 이면 확인 안 된 사용자)'] });
      }
    } catch (e) {
      r.fail(e.message, { fix: ['API 서버에서 SSO 서버로 나가는 방화벽, 주소·포트를 확인해 주세요.'] });
    }
  }
}

// ── 3. 응답 내용 ──
if (json !== null) {
  r.section('응답 내용 (본인 인사정보 — 공유 주의)');
  const text = JSON.stringify(json, null, 2);
  console.log(text.split('\n').slice(0, 40).map((l) => `    ${l}`).join('\n') + (text.split('\n').length > 40 ? '\n    …' : ''));
}

// ── 4. 인사정보 읽기 ──
let profile = null;
if (json !== null && status >= 200 && status < 300) {
  r.section('인사정보 읽기');
  const { user, path } = locateUser(json);
  if (!user) {
    const keys = new Set();
    const walk = (o, d = 0) => {
      if (!o || typeof o !== 'object' || d > 4) return;
      for (const [k, v] of Object.entries(o)) {
        if (!Array.isArray(o)) keys.add(k);
        walk(v, d + 1);
      }
    };
    walk(json);
    r.fail('응답에서 사번을 찾지 못했어요', {
      reason: `응답에 있는 필드: ${[...keys].slice(0, 40).join(', ') || '(없음)'}`,
      fix: ['위 필드 중 사번이 든 이름을 server/src/sso.js 의 FIELD.empNo 목록에 추가해 주세요 (대소문자·_ 는 무시해요)'],
    });
  } else {
    r.ok(`사용자 정보 위치: ${path || '(맨 바깥)'}`);
    profile = mapProfile(user);
    const shown = { ...profile, status: profile.active ? '재직' : '재직 아님' };
    for (const f of Object.keys(LABEL)) {
      const from = profile._from[f];
      const value = f === 'status' ? (from ? `${user[from]} → ${shown.status}` : '재직(값 없음 → 재직으로 봐요)') : f === 'division' ? (from ? `${user[from]} → ${profile.division}` : '') : f === 'gender' ? (from ? `${user[from]} → ${profile.gender ?? '알 수 없음'}` : '') : profile[f];
      if (from) r.ok(`${LABEL[f]}: ${value}   ← 응답의 '${from}'`);
      else if (f === 'empNo') r.fail('사번 없음');
      else if (f === 'status') r.info(`${LABEL[f]}: ${value}`);
      else r.warn(`${LABEL[f]}: 응답에서 찾지 못했어요`, { reason: f === 'gender' || f === 'division' ? '없으면 신청서에서 본인이 고르게 돼요.' : '없어도 들어갈 수는 있어요.', fix: [`해당 필드 이름을 server/src/sso.js 의 FIELD.${f} 목록에 추가`] });
    }
    if (!profile.active) r.fail('재직 상태가 "재직 아님"이라 들어갈 수 없어요', { fix: ["재직 상태 값을 잘못 읽었다면 server/src/sso.js 의 INACTIVE 를 확인해 주세요"] });
  }
}

process.exit(
  r.summary({
    okText: profile ? `이 사용자는 사緣에 바로 들어갈 수 있어요 (사번 ${profile.empNo}). 이 주소를 servers.config.mjs 의 sso.url 에 넣고 다시 패키지·배포` : '확인을 마쳤어요.',
    failText: '✖ 항목을 확인해 주세요. 실제 접속에서는 "AD SSO로 확인된 임직원만" 안내 화면이 나와요.',
  }),
);
