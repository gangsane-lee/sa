import fs from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { loadTopology } from '../tools/topology.mjs';

const SHARED = fileURLToPath(new URL('../server/shared', import.meta.url));
const BUILT_CONFIG = fileURLToPath(new URL('./dist/sasystem.config.js', import.meta.url));

// npm run preview: 운영 빌드의 화면 설정에는 운영 API 주소(apiBase)가 들어 있다 → 미리보기에서는 비워서
// 같은 주소의 /api 를 부르게 하고, 아래 proxy 가 API 서버로 넘긴다
const previewConfig = {
  name: 'sasystem-preview-config',
  configurePreviewServer(server) {
    server.middlewares.use('/sasystem.config.js', (req, res, next) => {
      let text;
      try {
        text = fs.readFileSync(BUILT_CONFIG, 'utf8');
      } catch {
        return next();
      }
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(text.replace(/"apiBase":\s*"[^"]*"/, '"apiBase": ""'));
    });
  },
};

/** 개발 키 헤더 — API 서버가 테스트 사번 로그인을 받을지 판단한다 (server/routes/auth.js) */
const DEV_KEY_HEADER = 'X-Sasystem-Dev-Key';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const mock = mode === 'mock';
  const devApi = command === 'serve' && !mock;
  // npm run dev(·preview) 의 /api 는 운영 API 서버로 넘긴다 (개발도 같은 API · 같은 DB). DEV_API_PROXY 로 바꿀 수 있다
  const T = loadTopology('production');
  // 개발 키 — client/.env.development.local 의 SASYSTEM_DEV_KEY. VITE_ 로 시작하지 않아 브라우저 코드에는 들어가지 않고,
  // 이 PC 의 vite 프록시가 API 서버로 넘길 때만 헤더로 붙인다
  const devKey = String(env.SASYSTEM_DEV_KEY ?? '').trim();
  if (devApi && command === 'serve' && !devKey) {
    console.warn('\n  ⚠ client/.env.development.local 에 SASYSTEM_DEV_KEY 가 없어요 — 테스트 사번 로그인이 거절돼요 (API 서버 .env 의 DEV_LOGIN_KEY 와 같은 값)\n');
  }

  return {
    plugins: [vue(), previewConfig],
    define: {
      // 화면 모드 상수 (src/config.js) — 운영 빌드에서는 둘 다 false 라 가짜 데이터·테스트 사번 코드가 빠진다
      __SASYSTEM_MOCK__: JSON.stringify(mock),
      __SASYSTEM_DEV_API__: JSON.stringify(devApi),
    },
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
      port: Number(T.devServer.port) || 5173,
      host: true, // 개발 PC IP(예: 10.122.122.10:5173)로도 열 수 있게
      fs: { allow: ['.', SHARED] },
      // npm run preview 도 이 설정을 쓴다
      proxy: {
        // API 서버가 사내 인증 기관 인증서(https)라 Node 가 모르므로 이 PC 의 프록시만 확인을 끈다
        '/api': {
          target: env.DEV_API_PROXY || T.apiUrl,
          changeOrigin: true,
          secure: false,
          headers: devKey ? { [DEV_KEY_HEADER]: devKey } : {},
        },
      },
    },
    build: {
      target: 'es2022',
      // DevExtreme 번들 특성상 청크가 크다. 사내망 배포라 경고 기준만 올려둔다.
      chunkSizeWarningLimit: 4000,
      // 보안: 원본 코드 지도(소스맵)를 만들지 않는다 — 브라우저 개발자 도구에서 원래 코드·파일 구조가 보이지 않게
      sourcemap: false,
      rolldownOptions: {
        output: {
          // 파일 이름에 화면·컴포넌트 이름을 남기지 않는다 (assets/해시.js)
          entryFileNames: 'assets/[hash].js',
          chunkFileNames: 'assets/[hash].js',
          assetFileNames: 'assets/[hash][extname]',
          // 주석(작성자·설명) 없이, console·debugger 를 지우고, 이름을 짧게 바꿔 압축한다
          comments: false,
          minify: { compress: { dropConsole: true, dropDebugger: true }, mangle: true, codegen: { removeWhitespace: true } },
        },
      },
    },
  };
});
