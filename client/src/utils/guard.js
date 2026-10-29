/**
 * 운영 화면 보조 보안 — 개발자 도구 단축키(F12 · Ctrl+Shift+I/J/C/K · Ctrl+U)와 오른쪽 클릭 메뉴를 막는다.
 * (servers.config.mjs 의 security.blockDevtools — 개발 화면에서는 켜지지 않는다)
 *
 * 브라우저 메뉴로 개발자 도구를 여는 것까지 막을 수는 없다 — 화면 코드는 사용자 PC 로 내려가기 때문이다.
 * 그래서 실제 보호는 다른 곳에서 한다
 *  - 빌드: 소스맵 없음 · 주석·console 제거 · 이름 압축 · 파일 이름 해시 (vite.config.js)
 *  - 화면에는 비밀값이 없다 (DB·키·관리자 비밀번호는 API 서버에만)
 *  - 모든 권한 확인은 API 서버가 한다 (화면을 고쳐도 서버가 거절한다)
 */
const BLOCK_CTRL_SHIFT = new Set(['I', 'J', 'C', 'K']);
const BLOCK_CTRL = new Set(['U']);

/** 입력칸에서는 오른쪽 클릭(붙여넣기 등)을 그대로 둔다 */
const editable = (t) => t instanceof Element && Boolean(t.closest('input, textarea, [contenteditable="true"]'));

export function installGuard() {
  const stop = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener(
    'keydown',
    (e) => {
      const k = String(e.key ?? '').toUpperCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (k === 'F12' || (ctrl && e.shiftKey && BLOCK_CTRL_SHIFT.has(k)) || (ctrl && !e.shiftKey && BLOCK_CTRL.has(k)) || (e.metaKey && e.altKey && BLOCK_CTRL_SHIFT.has(k))) stop(e);
    },
    true,
  );
  window.addEventListener('contextmenu', (e) => !editable(e.target) && stop(e), true);
}
