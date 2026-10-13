/**
 * ★ 관리자 계정 정보 — 이 파일을 admins.js 로 복사해서 채운다 (admins.js 는 git에 올라가지 않는다)
 *
 * 관리자 화면 주소: http://서버주소:포트/changeme  (주소는 .env 의 ADMIN_PATH 로 바꿀 수 있다)
 * 들어가는 순서: 사내 계정(SSO 또는 ID/비밀번호) 확인 → 아래 accounts 에 있는 계정인지 확인 → 관리자 비밀번호
 *
 * 고치면 서버를 다시 켜지 않아도 몇 초 안에 반영된다.
 */
export default {
  /** 관리자 계정 목록 — 사번(empNo)이나 사내 계정 ID(adId) 중 하나만 맞아도 관리자 */
  accounts: [
    { empNo: '', adId: '', name: '매칭 담당자 이름', note: '인사팀 · 사緣 매칭 담당' },
  ],

  /**
   * 관리자 모드 비밀번호 — 둘 중 하나만 채운다
   *  password     : 비밀번호를 그대로 적는다 (확인하기 쉽지만 이 파일이 새면 그대로 노출된다)
   *  passwordHash : 해시를 적는다 (권장). server 폴더에서  npm run hash-password -- "새 비밀번호"  실행 결과를 붙여넣기
   * passwordHash 가 있으면 password 는 무시한다.
   */
  password: '',
  passwordHash: '',
};
