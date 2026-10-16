/**
 * 개인정보 필드 암호화 (AES-256-GCM). 키는 .env 의 DATA_KEY (base64 32바이트).
 * 저장 형식: 'enc:v1:' + base64(iv 12바이트 | tag 16바이트 | 암호문)
 * 키를 바꾸면 예전 데이터를 읽을 수 없으니, 운영 중에는 키를 바꾸지 말고 안전한 곳에 따로 보관한다.
 */
import crypto from 'node:crypto';

const PREFIX = 'enc:v1:';
export const ENC_PREFIX = PREFIX;

export function makeCipher(keyB64) {
  if (!keyB64) {
    return { enabled: false, enc: (s) => s, dec: (s) => s };
  }
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new Error('DATA_KEY는 base64로 인코딩한 32바이트여야 해요. (npm run check 로 새 키를 만들 수 있어요)');

  return {
    enabled: true,
    enc(text) {
      if (typeof text !== 'string' || text === '' || text.startsWith(PREFIX)) return text;
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([c.update(text, 'utf8'), c.final()]);
      return PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
    },
    dec(text) {
      if (typeof text !== 'string' || !text.startsWith(PREFIX)) return text;
      const buf = Buffer.from(text.slice(PREFIX.length), 'base64');
      const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
      d.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
    },
  };
}
