import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { loadTopology } from '../tools/topology.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // 개발 화면의 /api 는 servers.config.mjs 의 개발(development) API 서버로 넘긴다 (DEV_API_PROXY 로 바꿀 수 있다)
  const dev = loadTopology('development');

  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      // 운영 모드가 open(public/sayeon.config.js)일 때 /api 요청을 Node.js 서버로 넘긴다
      proxy: {
        '/api': { target: env.DEV_API_PROXY || dev.apiUrl, changeOrigin: true },
      },
    },
    build: {
      target: 'es2022',
      // DevExtreme 번들 특성상 청크가 크다. 사내망 배포라 경고 기준만 올려둔다.
      chunkSizeWarningLimit: 4000,
    },
  };
});
