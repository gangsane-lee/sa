/**
 * PM2 실행 설정 — server 폴더에서 (PM2 는 server/node_modules 에 들어 있어 인터넷 없이 쓴다):
 *   npm run pm2 -- start ecosystem.config.cjs     처음 시작
 *   npm run pm2 -- restart sayeon-api             코드·.env·servers.config.mjs 바꾼 뒤 다시 시작
 *   npm run pm2 -- logs sayeon-api                로그 보기
 *   npm run pm2 -- save                           지금 실행 목록 저장 (재부팅 후 resurrect 로 되살림)
 *
 * 앱 이름은 server/.env 의 SAYEON_ENV 로 정한다 — production: sayeon-api / development: sayeon-api-dev
 * ⚠ instances 는 반드시 1 — 데이터를 메모리에 두고 DB에 저장하는 구조라 여러 개로 돌리면 데이터가 어긋난다.
 * 포트·DB 는 이 파일이 아니라 저장소 맨 위 servers.config.mjs 에서 고친다.
 */
const fs = require('node:fs');
const path = require('node:path');

/** server/.env 의 SAYEON_ENV (PM2 는 .env 를 읽지 않으므로 직접 읽는다) */
function envName() {
  try {
    const m = /^\s*SAYEON_ENV\s*=\s*([A-Za-z]+)/m.exec(fs.readFileSync(path.join(__dirname, '.env'), 'utf8'));
    return m ? m[1] : 'production';
  } catch {
    return 'production';
  }
}
const ENV = envName();

module.exports = {
  apps: [
    {
      name: ENV === 'development' ? 'sayeon-api-dev' : 'sayeon-api',
      cwd: __dirname,
      script: 'start.cjs',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      // 시작 실패(DB 연결 등)면 10초 간격으로 다시 시도하고, 15번 연속 실패하면 멈춘다 → pm2 logs 로 원인 확인
      restart_delay: 10000,
      min_uptime: '20s',
      max_restarts: 15,
      max_memory_restart: '700M',
      kill_timeout: 8000,
      env: { NODE_ENV: ENV === 'development' ? 'development' : 'production' },
      time: true, // 로그는 pm2 logs <앱 이름> (기본 위치 ~/.pm2/logs)
    },
  ],
};
