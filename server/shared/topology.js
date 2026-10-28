/**
 * 서버 기준정보(servers.config.mjs) 해석 — 순수 함수 (파일을 읽지 않는다).
 * API 서버(server/src/config.js) · 화면 빌드 · 배포 패키지 · 점검이 모두 이 함수를 거친다.
 * 서버 폴더만 복사해도 동작하도록 server/shared 에 둔다. 기준정보 파일을 읽는 곳은 tools/topology.mjs · server/src/config.js
 */

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HOSTNAME = /^(?=.{1,253}$)[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
const isHost = (h) => IPV4.test(h) || (HOSTNAME.test(h) && !/^\d+(\.\d+)*$/.test(h));
const isPort = (p) => Number.isInteger(p) && p > 0 && p < 65536;


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
  if (web.host && isHost(web.host) && !IPV4.test(web.host)) problems.push(`Web 서버 주소(${envName}.web.host)는 IP 로 적어 주세요 — API 서버가 이 IP 에서 온 요청만 믿어요 (DNS 이름은 web.dnsName)`);
  if (web.dnsName && !HOSTNAME.test(web.dnsName)) problems.push(`Web 서버 DNS 이름 형식이 맞지 않아요: '${web.dnsName}'`);

  // 다른 환경과 같은 DB 를 쓰면 데이터가 서로 덮어써진다
  for (const [other, o] of Object.entries(master.environments ?? {})) {
    if (other !== envName && o.db?.host === db.host && o.db?.name === db.name) {
      problems.push(`'${envName}' 과 '${other}' 가 같은 DB(${db.host}/${db.name})를 써요 — 환경마다 DB 이름을 다르게 해 주세요`);
    }
    if (other !== envName && o.api?.host === api.host && o.api?.port === api.port) {
      problems.push(`'${envName}' 과 '${other}' 가 같은 API 주소(${api.host}:${api.port})를 써요 — 포트를 다르게 해 주세요`);
    }
  }

  const sso = { ...(master.sso ?? {}), hrApi: { ...(master.sso?.hrApi ?? {}) }, employeeApi: { ...(master.sso?.employeeApi ?? {}) } };
  if (!['browser', 'iis', 'off'].includes(sso.mode ?? 'browser')) problems.push(`sso.mode 는 browser · iis · off 중 하나: '${sso.mode}'`);
  if (sso.employeeApi.url && !/^https?:\/\//i.test(sso.employeeApi.url)) problems.push(`sso.employeeApi.url 은 http:// 또는 https:// 로 시작해야 해요: '${sso.employeeApi.url}'`);
  const webName = web.dnsName || web.host;
  const adminPath = `/${String(master.adminPath ?? 'changeme').replace(/^\/+|\/+$/g, '') || 'changeme'}`;
  return {
    envName,
    web,
    api,
    db,
    devServer: master.devServer ?? {},
    adminPath,
    sso,
    /** 사용자가 접속하는 주소 */
    publicUrl: `http://${webName}:${web.port}`,
    /** Web 서버(IIS)가 /api 를 넘길 주소 */
    apiUrl: `http://${api.host}:${api.port}`,
    problems,
  };
}

/** IPv4 형식인지 */
export const isIPv4 = (s) => IPV4.test(String(s));

