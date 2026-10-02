import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      // VITE_API_MODE=server 로 개발할 때 /api 요청을 Node.js 서버로 넘긴다
      proxy: {
        '/api': { target: env.DEV_API_PROXY || 'http://localhost:3000', changeOrigin: true },
      },
    },
    build: {
      target: 'es2022',
      // DevExtreme 번들 특성상 청크가 크다. 사내망 배포라 경고 기준만 올려둔다.
      chunkSizeWarningLimit: 4000,
    },
  };
});
