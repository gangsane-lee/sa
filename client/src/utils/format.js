/** 개인정보 마스킹 — 서버도 같은 규칙으로 목록 응답을 가린다 */
export function maskPhone(phone = '') {
  return phone.replace(/^(\d{3})-(\d{3,4})-(\d{4})$/, (_, a, b, c) => `${a}-${'*'.repeat(b.length)}-${c}`);
}

export function maskEmail(email = '') {
  const [id, domain] = email.split('@');
  if (!domain) return email;
  return `${id.slice(0, 2)}${'*'.repeat(Math.max(id.length - 2, 3))}@${domain}`;
}

const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

/**
 * 이름 → 초성 (신청 후 화면에 보이는 이름). 김하늘 → ㄱㅎㄴ, John Smith → JS
 * 서버도 같은 규칙으로 응답 단계에서 바꿔 보낸다 (화면에서만 가리면 개발자 도구로 원문이 보인다)
 */
export function initials(name = '') {
  const s = String(name).trim();
  if (/[가-힣]/.test(s)) {
    return [...s.replace(/\s/g, '')]
      .map((ch) => {
        const c = ch.charCodeAt(0) - 0xac00;
        return c >= 0 && c < 11172 ? CHOSEONG[Math.floor(c / 588)] : '';
      })
      .join('');
  }
  return s.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).join('');
}

export function maskName(name = '') {
  if (name.length <= 1) return name;
  if (name.length === 2) return `${name[0]}*`;
  return `${name[0]}${'*'.repeat(name.length - 2)}${name.at(-1)}`;
}

const pad = (n) => String(n).padStart(2, '0');

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${fmtDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtRemain(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
