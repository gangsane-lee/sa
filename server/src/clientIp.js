/**
 * 요청을 보낸 곳(peer) = 사용자 IP — 사용자 브라우저가 이 API 를 직접 부른다 (앞단 프록시 없음)
 *  - iisnode 로 돌면 연결이 파이프라 소켓에 IP 가 없다 → web.config 의 promoteServerVars="REMOTE_ADDR" 로
 *    iisnode 가 넣어 주는 x-iisnode-remote_addr 헤더 (iisnode 로 돌 때만 믿는다 — 직접 띄운 서버에서는 꾸밀 수 있음)
 *  - X-Forwarded-For 는 사용자가 마음대로 넣을 수 있으므로 쓰지 않는다
 * 사용자 IP 는 로그인 확인 횟수 제한·열람 기록에만 쓴다. 모르면 '-'
 */
import { UNDER_IISNODE } from './config.js';

const norm = (ip) => String(ip ?? '').trim().replace(/^::ffff:/, '');
let warned = false;

/** 요청을 보낸 곳 */
export function peerOf(req) {
  const promoted = UNDER_IISNODE ? req?.headers?.['x-iisnode-remote_addr'] : null;
  return norm(promoted ?? req?.socket?.remoteAddress);
}

/** 사용자 IP */
export function clientIpOf(req) {
  const ip = peerOf(req);
  if (!ip && UNDER_IISNODE && !warned) {
    warned = true;
    console.warn('[sayeon] 사용자 IP 를 알 수 없어요 — 그 앱 web.config 의 <iisnode … promoteServerVars="REMOTE_ADDR" /> 를 넣어 주세요 (열람 기록 IP 가 비고, 로그인 확인 횟수 제한이 꺼져요)');
  }
  return ip || '-';
}
