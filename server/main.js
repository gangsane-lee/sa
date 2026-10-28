/**
 * ★ 사緣 API 서버 진입점 — IIS + iisnode 가 이 파일을 실행한다 (web.config 의 handlers)
 *
 *   이 폴더 = IIS 사이트의 실제 경로. 폴더째 복사하면 된다.
 *     main.js       이 파일
 *     web.config    iisnode 설정 · 환경 · API 포트 · DB 서버 (appSettings)
 *     routes/       API 파일 (/api/auth → routes/auth.js …)
 *     src/          설정 · DB 저장소 · 사내 로그인 · 관리자
 *     shared/       업무 규칙 (화면과 같은 파일)
 *     .env          비밀번호·키 — 서버에만 두고 복사하지 않는다
 *
 *   로컬에서 바로 띄우기: npm start (node main.js)
 *
 * iisnode 는 이 파일을 require() 로 불러온다 → 최상위 await 없이, 서버는 import() 로 연다 (Node.js 22.12 이상)
 * 라이브러리를 불러오기 전에 Node.js 버전·설치 경로를 먼저 확인한다 (preflight.cjs)
 */
import('./preflight.cjs')
  .then(({ default: pf }) => {
    if (pf.reportPreflight()) {
      console.error('[server] 시작하지 못했어요 — 위 내용을 고친 뒤 IIS 앱 풀을 다시 시작해 주세요');
      process.exit(1);
    }
    return import('./src/index.js');
  })
  .catch((e) => {
    console.error('[server] 시작하지 못했어요:', e);
    process.exit(1);
  });
