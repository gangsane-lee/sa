/** /api/messages — 쪽지함 (받은·보낸·휴지통, 읽기, 보내기, 옮기기) */
import { Router } from 'express';
import { api } from '../shared/api/core/service.js';
import { b } from './_handler.js';

export default function messages(h) {
  const r = Router();
  r.get('/', h((req) => api.messages.box(req.query.box)));
  r.get('/counts', h(() => api.messages.counts()));
  r.get('/unread', h(() => api.messages.unread()));
  r.get('/recipients', h(() => api.messages.recipients()));
  r.get('/:id', h((req) => api.messages.read(req.params.id)));
  r.post('/', h((req) => api.messages.send(b(req).to, b(req).body)));
  r.post('/move', h((req) => api.messages.move(b(req).ids, b(req).to)));
  return r;
}
