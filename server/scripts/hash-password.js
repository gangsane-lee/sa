/**
 * 관리자 비밀번호 해시 만들기
 *   npm run hash-password -- "새 비밀번호"
 * 출력된 값을 config/admins.js 의 passwordHash 에 붙여넣는다 (password 는 비워도 된다)
 */
import bcrypt from 'bcryptjs';

const pw = process.argv.slice(2).join(' ');
if (pw.length < 8) {
  console.log('사용법: npm run hash-password -- "새 비밀번호"   (8자 이상)');
  process.exit(1);
}
console.log(bcrypt.hashSync(pw, 12));
