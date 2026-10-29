/** GET /api/health — 점검 (로그인 없이). 배포 스크립트·Web 서버 점검이 부른다 */
import { Router } from 'express';

export default function health(store) {
  const r = Router();
  r.get('/', async (req, res) => {
    try {
      const s = await store.health(); // 로그인 없이 열리므로 DB 이름 같은 정보는 내보내지 않는다
      res.json({ ok: s.ok, time: new Date().toISOString() });
    } catch (e) {
      console.error('[api] 점검 실패:', e.message);
      res.status(503).json({ ok: false }); // 오류 내용(DB 주소 등)은 로그에만
    }
  });
  return r;
}
