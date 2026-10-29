/**
 * 서버 기준정보(servers.config.mjs) 읽기 — 화면 빌드 · 배포 패키지 · 점검 도구가 쓴다.
 * 값을 고칠 곳은 servers.config.mjs 하나뿐이다. 해석 규칙은 server/shared/topology.js (API 서버와 같이 씀)
 */
import master from '../servers.config.mjs';
import { resolveTopology, isIPv4 } from '../server/shared/topology.js';

export const ENV_NAMES = Object.keys(master.environments ?? {});

/** @param {string} [envName] production | development (비우면 SASYSTEM_ENV, 그것도 없으면 production) */
export const loadTopology = (envName = process.env.SASYSTEM_ENV || 'production') => resolveTopology(master, envName);

export { isIPv4, master };
