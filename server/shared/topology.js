/**
 * 서버 기준정보(servers.config.mjs) 해석 — 순수 함수 (파일을 읽지 않는다).
 * API 서버(server/src/config.js) · 화면 빌드 · 배포 패키지 · 점검이 모두 이 함수를 거친다.
 * 서버 폴더만 복사해도 동작하도록 server/shared 에 둔다. 기준정보 파일을 읽는 곳은 tools/topology.mjs · server/src/config.js
 */

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HOSTNAME = /^(?=.{1,253}$)[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
const isHost = (h) => IPV4.test(h) || (HOSTNAME.test(h) && !/^\d+(\.\d+)*$/.test(h));
const isPort = (p) => Number.isInteger(p) && p > 0 && p < 65536;
/** '/sayeon' 처럼 영문·숫자·-·_ 한 단계 (빈 값 = 맨 앞) */
const BASE_PATH = /^(\/[A-Za-z0-9_-]+)?$/;


/**
 * @param {object} master servers.config.mjs 의 내용
 * @param {string} [envName] production | development
 */
export function resolveTopology(master, envName = 'production') {
  const ENV_NAMES = Object.keys(master.environments ?? {});
  const problems = [];
  const e = master.environments?.[envName];
  if (!e) {
    problems.push(`servers.config.mjs 에 '${envName}' 환경이 없어요 (있는 환경: ${ENV_NAMES.join(', ')})`);
  }
  const env = e ?? {};
  const role = (name, label, needPort = true) => {
    const r = env[name] ?? {};
    if (!r.host || !isHost(r.host)) problems.push(`${label}(${envName}.${name}.host) 주소 형식이 맞지 않아요: '${r.host ?? ''}' — IP 는 0~255 네 자리`);
    if (needPort && !isPort(r.port)) problems.push(`${label}(${envName}.${name}.port) 포트가 맞지 않아요: '${r.port ?? ''}'`);
    return { host: String(r.host ?? ''), port: Number(r.port), ...r };
  };
  const web = role('web', 'Web 서버');
  const api = role('api', 'API 서버');
  const db = role('db', 'DB 서버');
  if (!/^[A-Za-z0-9_]{1,100}$/.test(db.name ?? '')) problems.push(`DB 이름(${envName}.db.name)은 영문·숫자·_ 만: '${db.name ?? ''}'`);
  if (web.host && isHost(web.host) && !IPV4.test(web.host)) problems.push(`Web 서버 주소(${envName}.web.host)는 IP 로 적어 주세요 (DNS 이름은 web.dnsName)`);
  if (web.dnsName && !HOSTNAME.test(web.dnsName)) problems.push(`Web 서버 DNS 이름 형식이 맞지 않아요: '${web.dnsName}'`);
  web.https = web.https === true;
  // 다른 iisnode 앱에 끼워 넣을 때 그 앱이 사緣을 붙인 경로 (app.use('/sayeon', …)). 사緣 전용 사이트면 비운다
  api.basePath = String(api.basePath ?? '').replace(/\/+$/, '');
  if (!BASE_PATH.test(api.basePath)) problems.push(`API 경로(${envName}.api.basePath)는 '/sayeon' 처럼 영문·숫자·-·_ 한 단계로: '${api.basePath}'`);
  // https 면 사용자 브라우저가 인증서 이름을 확인하므로 DNS 이름(인증서에 적힌 이름)으로 부른다. host(IP)는 방화벽·연결 점검용
  api.https = api.https === true;
  api.dnsName = String(api.dnsName ?? '').trim();
  if (api.dnsName && !HOSTNAME.test(api.dnsName)) problems.push(`API 서버 DNS 이름(${envName}.api.dnsName) 형식이 맞지 않아요: '${api.dnsName}'`);
  if (api.https && !api.dnsName) problems.push(`API 서버를 https 로 쓰려면 ${envName}.api.dnsName(인증서에 적힌 DNS 이름)이 필요해요`);

  // 다른 환경과 같은 DB 를 쓰면 데이터가 서로 덮어써진다
  for (const [other, o] of Object.entries(master.environments ?? {})) {
    if (other !== envName && o.db?.host === db.host && o.db?.name === db.name) {
      problems.push(`'${envName}' 과 '${other}' 가 같은 DB(${db.host}/${db.name})를 써요 — 환경마다 DB 이름을 다르게 해 주세요`);
    }
    const otherBase = String(o.api?.basePath ?? '').replace(/\/+$/, '');
    if (other !== envName && o.api?.host === api.host && o.api?.port === api.port && otherBase === api.basePath) {
      problems.push(`'${envName}' 과 '${other}' 가 같은 API 주소(${api.host}:${api.port}${api.basePath})를 써요 — 포트나 basePath 를 다르게 해 주세요`);
    }
  }

  const sso = { ...(master.sso ?? {}), hrApi: { ...(master.sso?.hrApi ?? {}) }, employeeApi: { ...(master.sso?.employeeApi ?? {}) } };
  // 화면(브라우저)이 API 서버를 직접 부른다 — Web 서버가 계정 헤더를 붙여 넘기는 iis 방식은 쓸 수 없다
  if (sso.mode === 'iis') problems.push("sso.mode 'iis' 는 Web 서버가 /api 를 API 서버로 넘기던 구조용이에요 — 지금은 브라우저가 API 서버를 직접 부르므로 'browser' 로 해 주세요");
  else if (!['browser', 'off'].includes(sso.mode ?? 'browser')) problems.push(`sso.mode 는 browser · off 중 하나: '${sso.mode}'`);
  if (sso.employeeApi.url && !/^https?:\/\//i.test(sso.employeeApi.url)) problems.push(`sso.employeeApi.url 은 http:// 또는 https:// 로 시작해야 해요: '${sso.employeeApi.url}'`);
  // https 화면에서 http 주소는 브라우저가 막는다 (혼합 콘텐츠)
  if (web.https && !api.https) problems.push(`Web 서버가 https 면 API 서버도 https 여야 해요 — 브라우저가 https 화면에서 http API 호출을 막아요 (${envName}.api.https)`);
  if (web.https && /^http:\/\//i.test(sso.employeeApi.url ?? '')) problems.push('Web 서버가 https 면 사내 인사정보 URL 도 https 여야 해요 — 브라우저가 https 화면에서 http 호출을 막아요 (sso.employeeApi.url)');
  const port = (proto, p) => (p === (proto === 'https' ? 443 : 80) ? '' : `:${p}`);
  const webProto = web.https ? 'https' : 'http';
  const apiProto = api.https ? 'https' : 'http';
  const apiPort = port(apiProto, api.port);
  /** 화면이 열리는 주소들 — API 서버가 이 출처(origin)의 호출만 받는다 (IP · DNS 이름 둘 다) */
  const webOrigins = [...new Set([web.dnsName, web.host].filter(Boolean).map((h) => `${webProto}://${h}${port(webProto, web.port)}`))];
  const adminPath = `/${String(master.adminPath ?? 'changeme').replace(/^\/+|\/+$/g, '') || 'changeme'}`;
  return {
    envName,
    web,
    api,
    db,
    devServer: master.devServer ?? {},
    adminPath,
    sso,
    /** 사용자가 접속하는 주소 (화면) */
    publicUrl: webOrigins[0] ?? '',
    webOrigins,
    /** 사용자 브라우저가 직접 부르는 API 주소 — /api/… 는 이 뒤에 붙는다 (다른 앱에 끼워 넣었으면 basePath 까지) */
    apiUrl: `${apiProto}://${api.dnsName || api.host}${apiPort}${api.basePath}`,
    problems,
  };
}

/** IPv4 형식인지 */
export const isIPv4 = (s) => IPV4.test(String(s));

