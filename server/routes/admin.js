/**
 * /api/admin — 관리자 (관리자 계정 + 관리자 비밀번호 인증 뒤에만 — 확인은 서비스가 한다)
 * 신청자 · 매칭 · 기준정보 · 후기 · 개선의 소리 · 쪽지 · 싫어요/블랙리스트 · 설정 · 열람 기록
 */
import { Router } from 'express';
import { api } from '../shared/api/core/service.js';
import { b } from './_handler.js';

export default function admin(h) {
  const r = Router();
  const A = api.admin;

  r.get('/stats', h(() => A.stats()));

  // ── 신청자 ──
  r.get('/applicants', h(() => A.listApplicants()));
  r.patch('/applicants/status', h((req) => A.changeStatus(b(req).ids ?? [], b(req).status)));
  r.get('/applicants/:id', h((req) => A.getApplicant(req.params.id)));
  r.put('/applicants/:id', h((req) => A.updateApplicant(req.params.id, b(req))));
  r.delete('/applicants/:id', h((req) => A.deleteApplicant(req.params.id)));
  r.get('/applicants/:id/candidates', h((req) => A.getCandidates(req.params.id)));
  r.post('/applicants/:id/reset-dislikes', h((req) => A.resetDislikes(req.params.id)));

  // ── 매칭 ──
  r.get('/matches', h(() => A.listMatches()));
  r.post('/matches', h((req) => A.createMatch(b(req).aId, b(req).bId, b(req).memo)));
  r.patch('/matches/:id', h((req) => A.updateMatch(req.params.id, b(req))));
  r.delete('/matches/:id', h((req) => A.deleteMatch(req.params.id)));

  // ── 기준정보 ──
  r.get('/codes/:group', h((req) => A.listCodes(req.params.group)));
  r.post('/codes/:group', h((req) => A.createCode(req.params.group, b(req))));
  r.patch('/codes/:group/:value', h((req) => A.updateCode(req.params.group, req.params.value, b(req))));
  r.delete('/codes/:group/:value', h((req) => A.deleteCode(req.params.group, req.params.value)));
  // 기준정보·설정 일괄 변경 — 내보내기 / 가져오기(apply=false 면 미리보기)
  r.get('/reference', h(() => A.exportReference()));
  r.post('/reference/import', h((req) => A.importReference(b(req).payload, { apply: b(req).apply === true })));

  // ── 후기 · 개선의 소리 ──
  r.get('/reviews', h(() => A.listReviews()));
  r.get('/voc', h(() => A.listVocs()));
  r.patch('/voc/:id', h((req) => A.updateVoc(req.params.id, b(req))));

  // ── 쪽지 ──
  r.get('/messages/matches', h(() => A.messageMatches()));
  r.get('/messages/matches/:id', h((req) => A.matchMessages(req.params.id)));
  r.get('/messages/users', h(() => A.messageUsers()));
  r.get('/messages/users/:id', h((req) => A.userMessages(req.params.id)));
  r.post('/messages/users/:id', h((req) => A.sendMessage(req.params.id, b(req).body)));

  // ── 싫어요 · 임직원 검색 · 블랙리스트 ──
  r.get('/dislikes', h(() => A.listDislikes()));
  r.get('/employees', h((req) => A.searchEmployees(req.query.q)));
  r.get('/blacklist', h(() => A.listBlacklist()));
  r.post('/blacklist', h((req) => A.addBlacklist(b(req).empNo, b(req).reason)));
  r.delete('/blacklist/:empNo', h((req) => A.removeBlacklist(req.params.empNo)));

  // ── 설정 · 열람 기록 ──
  r.get('/settings', h(() => A.getSettings()));
  r.patch('/settings', h((req) => A.updateSettings(b(req))));
  r.get('/audit-logs', h(() => A.listAuditLogs()));
  r.post('/audit-logs/export', h((req) => A.recordExport(b(req).count)));

  // ── DB 표 (목적별 표 보기·고치기) · 개발 테스트 데이터 지우기 ──
  r.get('/tables', h(() => A.tables()));
  r.get('/tables/:coll/rows', h((req) => A.tableRows(req.params.coll)));
  r.post('/tables/:coll/rows', h((req) => A.saveTableRow(req.params.coll, null, b(req))));
  r.put('/tables/:coll/rows/:id', h((req) => A.saveTableRow(req.params.coll, req.params.id, b(req))));
  r.delete('/tables/:coll/rows/:id', h((req) => A.deleteTableRow(req.params.coll, req.params.id)));
  r.post('/test-data/purge', h(() => A.purgeTestData()));
  return r;
}
