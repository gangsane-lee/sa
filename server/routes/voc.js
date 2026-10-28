/** /api/voc — 개선의 소리 (쓰기, 내 글 보기) */
import { Router } from 'express';
import { api } from '../shared/api/core/service.js';
import { b } from './_handler.js';

export default function voc(h) {
  const r = Router();
  r.post('/', h((req) => api.voc.create(b(req))));
  r.get('/mine', h(() => api.voc.listMine()));
  return r;
}
