/**
 * ★ 사내 인사정보 응답 → 사緣 임직원 정보(Profile). 화면(운영 입구)과 API 서버가 같은 규칙을 쓴다.
 *
 *  - 응답 JSON 어디에 있든 사번이 든 객체를 찾는다 (resultPath 를 주면 그 위치만)
 *  - 필드 이름은 대소문자·_·- 를 무시하고 비교한다 (EMP_NO = empNo = empno)
 *  - 사내 응답의 필드 이름이 아래 목록에 없으면 여기에 추가한다
 *
 * Profile: { empNo, adId, name, gender: 'M'|'F'|null, division: 사업부 코드, team, email, active }
 */
export const FIELD = {
  empNo: ['empNo', 'employeeNo', 'employeeNumber', 'employeeId', 'empId', 'sabun', 'saBun', 'userNo', 'personNo'],
  adId: ['adId', 'userId', 'loginId', 'sAMAccountName', 'account', 'accountId', 'epId', 'knoxId', 'uid', 'mailId'],
  name: ['name', 'userName', 'displayName', 'korName', 'fullName', 'empNm', 'empName', 'userNm', 'korNm', 'nameKor'],
  gender: ['gender', 'sex', 'sexCd', 'genderCd'],
  division: ['divisionName', 'division', 'divName', 'divNm', 'bizUnit', 'businessUnit', 'bizNm', 'buNm', 'divisionNm'],
  team: ['team', 'teamName', 'teamNm', 'deptName', 'deptNm', 'department', 'departmentName', 'orgName', 'orgNm'],
  email: ['email', 'mail', 'emailAddress', 'emailAddr', 'mailAddr'],
  status: ['status', 'workStatus', 'employmentStatus', 'empStatus', 'workStat', 'empStat', 'hrStatus'],
};

/** 사업부 이름(사내 인사정보) → 기준정보 DIVISION 코드. 조직이 바뀌면 여기에 추가 */
export const DIVISION_MAP = [
  [/메모리|memory/i, 'MEMORY'],
  [/system\s*lsi|시스템\s*lsi|lsi/i, 'LSI'],
  [/파운드리|foundry/i, 'FOUNDRY'],
  [/.*/, 'COMMON'], // 그 밖의 DS부문 조직은 'DS부문 공통'
];

/** 재직 상태 값 중 '재직 아님'으로 볼 값 */
export const INACTIVE = /퇴직|휴직|inactive|retired|resigned|^n$|^false$|^0$/i;

const norm = (k) => String(k).toLowerCase().replace(/[_\-\s.]/g, '');
const WANT = Object.fromEntries(Object.entries(FIELD).map(([k, names]) => [k, new Set(names.map(norm))]));

/** 객체에서 후보 이름 중 하나로 값을 찾는다 → { value, key } */
function pick(raw, field) {
  for (const [k, v] of Object.entries(raw)) {
    if (WANT[field].has(norm(k)) && v !== null && v !== undefined && typeof v !== 'object' && String(v).trim() !== '') {
      return { value: String(v).trim(), key: k };
    }
  }
  return null;
}

/**
 * 응답 JSON 안에서 사번이 든 객체를 찾는다
 * @param {any} json 응답
 * @param {string} [resultPath] 정해진 위치 (예: 'data.user'). 비우면 자동으로 찾는다
 * @returns {{ user: object|null, path: string }} path: 찾은 위치 (맨 바깥이면 '')
 */
export function locateUser(json, resultPath = '') {
  if (resultPath) {
    const user = resultPath.split('.').reduce((o, k) => (o == null ? o : o[k]), json) ?? null;
    return { user: user && typeof user === 'object' ? user : null, path: resultPath };
  }
  const queue = [[json, '']];
  for (let i = 0; i < queue.length && i < 200; i++) {
    const [node, at] = queue[i];
    if (!node || typeof node !== 'object') continue;
    if (!Array.isArray(node) && pick(node, 'empNo')) return { user: node, path: at };
    for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') queue.push([v, at ? `${at}.${k}` : k]);
  }
  return { user: null, path: '' };
}

/** 사용자 정보 객체 → Profile (+ _from: 각 항목을 어느 필드에서 읽었는지, 점검용) */
export function mapProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const got = Object.fromEntries(Object.keys(FIELD).map((f) => [f, pick(raw, f)]));
  if (!got.empNo) return null;
  const g = (got.gender?.value ?? '').toUpperCase();
  const divName = got.division?.value ?? '';
  return {
    empNo: got.empNo.value,
    adId: got.adId?.value ?? '',
    name: got.name?.value ?? '',
    gender: ['M', 'MALE', '남', '남성', '남자', '1'].includes(g) ? 'M' : ['F', 'FEMALE', '여', '여성', '여자', '2'].includes(g) ? 'F' : null,
    division: divName ? DIVISION_MAP.find(([re]) => re.test(divName))[1] : null,
    team: got.team?.value ?? '',
    email: got.email?.value ?? '',
    active: got.status ? !INACTIVE.test(got.status.value) : true,
    _from: Object.fromEntries(Object.entries(got).map(([f, v]) => [f, v?.key ?? null])),
  };
}

/** 응답 JSON → { user, path, profile } — 한 번에 */
export function readEmployee(json, resultPath = '') {
  const { user, path } = locateUser(json, resultPath);
  return { user, path, profile: user ? mapProfile(user) : null };
}
