/**
 * /api/saju — 인연 사주
 *  pick : 입력한 생년월일로 궁합이 가장 좋은 1명 (생년월일은 계산에만 쓰고 저장하지 않는다)
 *  apply: 신청 전 — 신청서(정규 신청과 같은 양식)로 신청 + 그 분에게 하트
 *  heart: 신청 후 — 바로 하트
 */
import { Router } from 'express';
import { api } from '../shared/api/core/service.js';
import { b } from './_handler.js';

export default function saju(h) {
  const r = Router();
  r.post('/pick', h((req) => api.saju.pick(b(req))));
  r.post('/apply', h((req) => api.saju.apply(b(req))));
  r.post('/heart', h(() => api.saju.heart()));
  return r;
}
