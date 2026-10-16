/**
 * PM2 실행 설정 — server 폴더에서:
 *   pm2 start ecosystem.config.cjs     처음 시작
 *   pm2 restart sayeon-api             코드·.env 바꾼 뒤 다시 시작
 *   pm2 logs sayeon-api                로그 보기
 *   pm2 save && pm2 startup            서버 재부팅 후에도 자동 시작 (Windows는 pm2-installer 등 사용)
 *
 * ⚠ instances 는 반드시 1 — 데이터를 메모리에 두고 DB에 저장하는 구조라 여러 개로 돌리면 데이터가 어긋난다.
 * 서버 주소·DB 정보는 이 파일이 아니라 .env 에서 고친다.
 */
module.exports = {
  apps: [
    {
      name: 'sayeon-api',
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
      env: { NODE_ENV: 'production' },
      time: true, // 로그는 pm2 logs sayeon-api (기본 위치 ~/.pm2/logs)
    },
  ],
};
