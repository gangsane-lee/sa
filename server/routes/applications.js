/** /api/applications — 신청서 (내 신청서 보기·작성·수정·철회, 닉네임 추천) */
import { Router } from 'express';
import { api } from '../shared/api/core/service.js';
import { b } from './_handler.js';

export default function applications(h) {
  const r = Router();
  r.get('/me', h(() => api.application.getMine()));
  r.get('/nicknames', h((req) => api.application.suggestNicknames(req.query.count)));
  r.post('/', h((req) => api.application.create(b(req))));
  r.put('/me', h((req) => api.application.update(b(req))));
  r.delete('/me', h(() => api.application.withdraw()));
  return r;
}
