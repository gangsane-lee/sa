/** GET /api/codes — 기준정보 전체 (신청서·관리자 화면의 선택 목록) */
import { Router } from 'express';
import { api } from '../shared/api/core/service.js';

export default function codes(h) {
  const r = Router();
  r.get('/', h(() => api.codes.list()));
  return r;
}
