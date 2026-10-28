import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { loadTopology } from '../tools/topology.mjs';

const SHARED = fileURLToPath(new URL('../server/shared', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // npm run dev 는 가짜 데이터라 /api 를 쓰지 않는다.
  // npm run preview(운영 빌드 미리보기)의 /api 는 servers.config.mjs 의 개발(development) API 서버로 넘긴다 (DEV_API_PROXY 로 바꿀 수 있다)
  const dev = loadTopology('development');

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // 업무 규칙·기준값 — API 서버와 같은 파일을 쓴다 (서버 폴더만 복사해도 동작하도록 server/shared 에 둔다)
        '@shared': SHARED,
      },
      // server/shared 의 사주 라이브러리도 화면 쪽 node_modules 에서 찾는다
      dedupe: ['lunar-javascript'],
    },
    server: {
      port: 5173,
      fs: { allow: ['.', SHARED] },
      // npm run preview 도 이 설정을 쓴다 (운영 빌드를 실제 API 서버와 붙여 볼 때)
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
