/**
 * API 파일들이 함께 쓰는 도우미 — 요청을 서비스 함수로 넘기고, 바뀐 데이터를 저장한 뒤 응답한다.
 * 업무 규칙은 전부 서비스(shared/api/core/service.js)에 있다.
 */
import { ApiError } from '../shared/api/errors.js';
import { runWithRequest } from '../src/context.js';

/** 요청 본문 (없으면 빈 객체) */
export const b = (req) => req.body ?? {};

/** 로그인할 때 세션 ID를 새로 받는다 (로그인 전에 심어 둔 세션을 그대로 쓰는 공격 방지) */
export const regenerate = (req) => new Promise((ok, fail) => req.session.regenerate((e) => (e ? fail(e) : ok())));

/**
 * @param {object} store src/store.js 의 저장소
 * @returns {(fn: (req) => any) => import('express').RequestHandler} 서비스 함수를 부르는 핸들러 만들기
 */
export function makeHandler(store) {
  return (fn) => (req, res) =>
    runWithRequest(req, async () => {
      let result;
      let error = null;
      try {
        result = await fn(req);
      } catch (e) {
        error = e;
      }
      // 실패한 요청도 남겨야 할 기록(관리자 인증 실패 등)이 있으므로 저장은 항상 한다
      try {
        await store.flush();
      } catch (e) {
        console.error('[api] 저장 실패:', e);
        if (!error) error = new ApiError(503, '데이터를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'STORE_FAILED');
      }
      if (error) {
        if (error instanceof ApiError) return res.status(error.status || 400).json({ message: error.message, code: error.code });
        console.error('[api] 처리 중 오류:', req.method, req.originalUrl, error);
        return res.status(500).json({ message: '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 'SERVER_ERROR' });
      }
      if (result === null || result === undefined) return res.status(204).end();
      return res.json(result);
    });
}
