/** /api/me · /api/stats — 매칭 보드 (상태 · 오늘의 인연 · 하트 · 후기 · 커플) */
import { Router } from 'express';
import { api } from '../shared/api/core/service.js';
import { b } from './_handler.js';

export default function me(h) {
  const r = Router();
  r.get('/me/dashboard', h(() => api.me.dashboard()));
  r.post('/me/daily/pass', h(() => api.me.pass()));
  r.post('/me/daily/heart', h(() => api.me.heart()));
  r.post('/me/hearts/:id', h((req) => api.me.answerHeart(req.params.id, Boolean(b(req).accept))));
  r.put('/me/review', h((req) => api.me.submitReview(b(req))));
  r.post('/me/resume', h(() => api.me.resume()));
  r.post('/me/couple', h(() => api.me.completeCouple()));

  r.get('/stats/gathering', h(() => api.stats.gathering()));
  return r;
}
