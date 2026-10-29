/**
 * 관리자 계정 읽기 — config/admins.js (없으면 관리자 로그인이 꺼진다)
 * 파일을 고치면 몇 초 안에 다시 읽으므로 서버를 다시 켤 필요가 없다.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { SERVER_ROOT } from './config.js';

const FILE = path.join(SERVER_ROOT, 'config', 'admins.js');
let current = { accounts: [], password: '', passwordHash: '' };
let loadedAt = 0;
let watching = false;

async function reload() {
  if (!fs.existsSync(FILE)) {
    current = { accounts: [], password: '', passwordHash: '' };
    console.warn('[admins] config/admins.js 가 없어 관리자 로그인이 꺼져 있어요. admins.example.js 를 복사해 채워 주세요.');
    return;
  }
  try {
    const mtime = fs.statSync(FILE).mtimeMs;
    const mod = await import(`${pathToFileURL(FILE).href}?v=${mtime}`);
    const c = mod.default ?? {};
    current = {
      accounts: (c.accounts ?? []).filter((a) => a && (a.empNo || a.adId)),
      password: String(c.password ?? ''),
      passwordHash: String(c.passwordHash ?? ''),
    };
    loadedAt = mtime;
    if (!current.accounts.length) console.warn('[admins] 관리자 계정(accounts)이 비어 있어요.');
    if (!current.password && !current.passwordHash) console.warn('[admins] 관리자 비밀번호가 비어 있어 관리자 로그인이 꺼져 있어요.');
  } catch (e) {
    console.error('[admins] config/admins.js 를 읽지 못했어요 (문법 확인):', e.message);
  }
}

export async function initAdmins() {
  await reload();
  if (watching) return; // 끼워 넣은 묶음이 시작을 다시 시도할 때 감시를 겹쳐 걸지 않는다
  watching = true;
  // 파일이 바뀌면 다시 읽는다 (3초마다 확인)
  fs.watchFile(FILE, { interval: 3000 }, (cur) => {
    if (cur.mtimeMs !== loadedAt) reload();
  });
}

/** 관리자 계정인가 (사번 또는 사내 계정 ID) */
export function isAdmin(emp) {
  if (!emp) return false;
  const adId = String(emp.adId ?? '').toLowerCase();
  return current.accounts.some(
    (a) => (a.empNo && String(a.empNo).trim() === emp.empNo) || (a.adId && adId && String(a.adId).trim().toLowerCase() === adId),
  );
}

/** 관리자 비밀번호 확인 */
export async function verifyAdminPassword(password) {
  if (current.passwordHash) return bcrypt.compare(password, current.passwordHash);
  if (!current.password) return false;
  // 길이 차이로 정답을 짐작하지 못하게 해시끼리 고정 시간 비교
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(password), h(current.password));
}
