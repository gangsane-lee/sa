/**
 * 요청을 보낸 곳(peer)과 사용자 IP
 *  - iisnode 로 돌면 연결이 파이프라 소켓에 IP 가 없다 → web.config 의 promoteServerVars="REMOTE_ADDR" 로
 *    iisnode 가 넣어 주는 x-iisnode-remote_addr 헤더가 peer (iisnode 로 돌 때만 믿는다 — 직접 띄운 서버에서는 꾸밀 수 있음)
 *  - peer 가 Web 서버(servers.config.mjs 의 web.host)면 X-Forwarded-For 의 마지막 값(Web 서버 ARR 이 붙인 사용자 IP)
 * 사용자 IP 는 로그인 확인 횟수 제한·열람 기록에만 쓴다.
 */
import { config, UNDER_IISNODE } from './config.js';

const norm = (ip) => String(ip ?? '').trim().replace(/^::ffff:/, '');

/** 요청을 보낸 곳 — Web 서버를 거쳤으면 Web 서버 IP */
export function peerOf(req) {
  const promoted = UNDER_IISNODE ? req?.headers?.['x-iisnode-remote_addr'] : null;
  return norm(promoted ?? req?.socket?.remoteAddress);
}

/** 사용자 IP */
export function clientIpOf(req) {
  const peer = peerOf(req);
  const hops = String(req.headers['x-forwarded-for'] ?? '').split(',').map(norm).filter(Boolean);
  if (config.trustedProxies.includes(peer) && hops.length) return hops.at(-1);
  // 다른 앱에 끼워 넣었는데 그 앱 web.config 에 promoteServerVars="REMOTE_ADDR" 가 없으면 peer 를 모른다 →
  // 모든 사용자가 한 IP('-')로 묶여 로그인 횟수 제한에 같이 걸리지 않게 마지막 X-Forwarded-For 를 쓴다 (기록·횟수 제한용)
  if (!peer && hops.length) return hops.at(-1);
  return peer || '-';
}
