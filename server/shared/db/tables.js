/**
 * ★ DB 표 구성 — 목적별로 표를 나눈다. 서버 저장소(src/store.js) · DB 준비(sql/setup.sql) · 관리자 'DB 표' 화면이 이 정의를 함께 쓴다.
 *
 * 표 하나 = 업무 데이터 한 종류 (신청서 · 매칭 · 하트 · 쪽지 …)
 *  - 앞쪽 열(ID · 사번 · 상태 · 시각 …)은 DB 에서 바로 읽고 찾기 쉽게 꺼내 둔 값이다 (SSMS 에서 SELECT 로 보기 좋게)
 *  - DATA_JSON 열이 그 행의 전체 원본이다. 서버는 이 열로 데이터를 다시 만든다
 *    → 값을 고칠 때는 관리자 화면 'DB 표' 에서 고친다 (SSMS 에서 앞쪽 열만 고치면 서버가 다시 저장할 때 원본 기준으로 덮어쓴다)
 *  - SAVED_AT: 그 행을 마지막으로 저장한 시각 (UTC)
 *
 * 열 정의: [열 이름, 원본 필드, 형식, 설명]
 *   형식: str:n(글자 n자) · secret(암호화된 값 — DATA_KEY) · int · bit(Y/N) · time(시각) · text:n(긴 글 앞부분 n자)
 *   원본 필드: 신청서 같은 행이면 그 필드 이름 · '$key' = 행 키 · '$value' = 값 그 자체(설정·번호)
 *
 * 종류(kind)
 *   list   : 배열 — 행 키는 원본의 key 필드 (applicants[].id …)
 *   map    : { 키: 값 } — 행 키는 객체 키 (daily[신청자id] …)
 *   values : { 이름: 값 } — 값이 숫자·글자 하나 (settings · seq)
 *   codes  : 기준정보 { 그룹: [항목…] } — 행 키는 (그룹, 코드), 그룹 안 순서는 POS
 */

export const TABLES = [
  {
    coll: 'applicants', table: 'SA_APPLICANT', label: '신청서', kind: 'list', key: 'id', seq: 'applicant',
    cols: [
      ['ID', 'id', 'int', '신청 번호'], ['EMP_NO', 'empNo', 'str:30', '사번'], ['NAME', 'name', 'secret', '이름(암호화)'],
      ['NICKNAME', 'nickname', 'str:50', '닉네임'], ['GENDER', 'gender', 'str:1', '성별 M/F'], ['BIRTH_YEAR', 'birthYear', 'int', '출생연도'],
      ['DIVISION', 'division', 'str:30', '사업부 코드'], ['TEAM', 'team', 'str:100', '팀'], ['STATUS', 'status', 'str:20', '진행 상태'],
      ['IS_QUICK', 'quick', 'bit', '사주 간편 신청'], ['IS_TEST', 'test', 'bit', '개발 테스트 데이터'],
      ['CREATED_AT', 'createdAt', 'time', '신청 시각'], ['MODIFIED_AT', 'updatedAt', 'time', '마지막 수정'],
    ],
  },
  {
    coll: 'employees', table: 'SA_EMPLOYEE', label: '임직원(로그인한 사람)', kind: 'list', key: 'empNo',
    cols: [
      ['EMP_NO', 'empNo', 'str:30', '사번'], ['NAME', 'name', 'secret', '이름(암호화)'], ['AD_ID', 'adId', 'str:100', '사내 계정 ID'],
      ['DIVISION', 'division', 'str:30', '사업부 코드'], ['TEAM', 'team', 'str:100', '팀'], ['GENDER', 'gender', 'str:1', '성별'],
      ['RETIRED', 'retired', 'bit', '퇴직·휴직'], ['IS_TEST', 'test', 'bit', '개발 테스트 계정'],
    ],
  },
  {
    coll: 'matches', table: 'SA_MATCH', label: '매칭', kind: 'list', key: 'id', seq: 'match',
    cols: [
      ['ID', 'id', 'int', '매칭 번호'], ['A_ID', 'aId', 'int', '신청 번호 A'], ['B_ID', 'bId', 'int', '신청 번호 B'],
      ['STATUS', 'status', 'str:20', '상태'], ['SCORE', 'score', 'int', '점수'], ['SOURCE', 'source', 'str:20', '만든 방법'],
      ['CREATED_AT', 'createdAt', 'time', '만든 시각'], ['ACCEPTED_AT', 'acceptedAt', 'time', '서로 수락'], ['COUPLED_AT', 'coupledAt', 'time', '커플 완료'],
    ],
  },
  {
    coll: 'hearts', table: 'SA_HEART', label: '하트', kind: 'list', key: 'id', seq: 'heart',
    cols: [
      ['ID', 'id', 'int', '하트 번호'], ['FROM_ID', 'fromId', 'int', '보낸 신청 번호'], ['TO_ID', 'toId', 'int', '받은 신청 번호'],
      ['STATUS', 'status', 'str:20', '상태'], ['SOURCE', 'source', 'str:20', '보낸 곳'], ['SENT_AT', 'at', 'time', '보낸 시각'], ['ANSWERED_AT', 'answeredAt', 'time', '응답 시각'],
    ],
  },
  {
    coll: 'reviews', table: 'SA_REVIEW', label: '후기', kind: 'list', key: 'id', seq: 'review',
    cols: [
      ['ID', 'id', 'int', '후기 번호'], ['MATCH_ID', 'matchId', 'int', '매칭 번호'], ['REVIEWER_ID', 'reviewerId', 'int', '쓴 사람(신청 번호)'],
      ['TARGET_ID', 'targetId', 'int', '상대(신청 번호)'], ['OUTCOME', 'outcome', 'str:20', '만남 결과'], ['RATING', 'rating', 'str:20', '평가'],
      ['CREATED_AT', 'createdAt', 'time', '쓴 시각'], ['MODIFIED_AT', 'updatedAt', 'time', '마지막 수정'],
    ],
  },
  {
    coll: 'messages', table: 'SA_MESSAGE', label: '쪽지', kind: 'list', key: 'id', seq: 'message',
    cols: [
      ['ID', 'id', 'int', '쪽지 번호'], ['THREAD', 'thread', 'str:20', '대화방 (A=담당자 · M=매칭)'], ['FROM_ID', 'fromId', 'int', '보낸 신청 번호'],
      ['TO_ID', 'toId', 'int', '받은 신청 번호'], ['FROM_ADMIN', 'fromAdmin', 'bit', '담당자가 보냄'], ['SENT_AT', 'at', 'time', '보낸 시각'],
      ['READ_AT', 'readAt', 'time', '읽은 시각'], ['BODY_PREVIEW', 'body', 'text:100', '내용 앞부분'],
    ],
  },
  {
    coll: 'vocs', table: 'SA_VOC', label: '개선의 소리', kind: 'list', key: 'id', seq: 'voc',
    cols: [
      ['ID', 'id', 'int', '글 번호'], ['CATEGORY', 'category', 'str:20', '분류'], ['STATUS', 'status', 'str:20', '처리 상태'],
      ['TITLE', 'title', 'str:100', '제목'], ['AUTHOR', 'author', 'secret', '작성자(암호화)'], ['CREATED_AT', 'createdAt', 'time', '쓴 시각'],
    ],
  },
  {
    coll: 'blacklist', table: 'SA_BLACKLIST', label: '블랙리스트', kind: 'list', key: 'empNo',
    cols: [['EMP_NO', 'empNo', 'str:30', '사번'], ['REASON', 'reason', 'str:200', '등록 사유'], ['ADDED_AT', 'at', 'time', '등록 시각'], ['ADDED_BY', 'by', 'str:50', '등록한 담당자']],
  },
  {
    coll: 'daily', table: 'SA_DAILY_PICK', label: '오늘의 후보', kind: 'map', keyType: 'int',
    cols: [['APPLICANT_ID', '$key', 'int', '신청 번호'], ['PICK_DATE', 'date', 'str:10', '날짜(KST)']],
  },
  {
    coll: 'seen', table: 'SA_SEEN', label: '이미 본 후보', kind: 'map', keyType: 'int',
    cols: [['APPLICANT_ID', '$key', 'int', '신청 번호']],
  },
  {
    coll: 'sajuPicks', table: 'SA_SAJU_PICK', label: '오늘의 사주 인연', kind: 'map',
    cols: [['EMP_NO', '$key', 'str:30', '사번'], ['PICK_DATE', 'date', 'str:10', '날짜(KST)'], ['TARGET_ID', 'id', 'int', '고른 신청 번호']],
  },
  {
    coll: 'penalties', table: 'SA_PENALTY', label: '싫어요 누적(탈퇴자)', kind: 'map',
    cols: [['EMP_NO', '$key', 'str:30', '사번'], ['DISLIKE_COUNT', 'count', 'int', '받은 싫어요'], ['RECORDED_AT', 'at', 'time', '기록 시각']],
  },
  {
    coll: 'adminLocks', table: 'SA_ADMIN_LOCK', label: '관리자 인증 잠금', kind: 'map',
    cols: [['EMP_NO', '$key', 'str:30', '사번'], ['FAILS', 'fails', 'int', '연속 실패 횟수']],
  },
  {
    coll: 'auditLogs', table: 'SA_AUDIT_LOG', label: '열람·작업 기록', kind: 'list', key: 'id', readOnly: true,
    cols: [
      ['ID', 'id', 'int', '기록 번호'], ['LOGGED_AT', 'at', 'time', '시각'], ['ACTOR_EMP_NO', 'actorEmpNo', 'str:30', '한 사람 사번'],
      ['ACTION', 'action', 'str:40', '작업'], ['TARGET', 'target', 'str:100', '대상'], ['DETAIL', 'detail', 'str:200', '내용'], ['IP', 'ip', 'str:50', '접속 IP'],
    ],
  },
  {
    coll: 'codes', table: 'SA_CODE', label: '기준정보(선택 목록)', kind: 'codes', readOnly: true,
    cols: [
      ['GROUP_CODE', '$group', 'str:30', '그룹'], ['CODE', 'value', 'str:30', '코드'], ['CODE_NAME', 'text', 'str:60', '표시 이름'],
      ['SORT_ORDER', 'order', 'int', '순서'], ['USE_YN', 'use', 'bit', '사용'], ['PARENT_CODE', 'parent', 'str:30', '상위 코드'], ['POS', '$pos', 'int', '그룹 안 위치'],
    ],
  },
  {
    coll: 'settings', table: 'SA_SETTING', label: '설정', kind: 'values', readOnly: true,
    cols: [['SETTING_KEY', '$key', 'str:50', '설정 이름'], ['SETTING_VALUE', '$value', 'text:200', '값']],
  },
  {
    coll: 'seq', table: 'SA_SEQUENCE', label: '번호 발급', kind: 'values', readOnly: true,
    cols: [['SEQ_NAME', '$key', 'str:30', '번호 종류'], ['LAST_NO', '$value', 'int', '마지막 번호']],
  },
];

export const TABLE_BY_COLL = Object.fromEntries(TABLES.map((t) => [t.coll, t]));

/** 행 키 열 — list: key 필드의 열 · map/values: '$key' 열 · codes: (그룹, 코드) */
export function keyColsOf(t) {
  if (t.kind === 'codes') return t.cols.filter(([, src]) => src === '$group' || src === 'value');
  const src = t.kind === 'list' ? t.key : '$key';
  return t.cols.filter(([, s]) => s === src);
}

const SEP = '\u0002';
const parseType = (type) => {
  const [kind, n] = String(type).split(':');
  return { kind, len: Number(n) || 0 };
};

/**
 * 데이터 → 표별 행 목록. 행: { id(비교용 문자열 키), keys(키 열 값), doc(원본), pos?, group? }
 * @returns {Map<string, object[]>} 표 이름 → 행들
 */
export function rowsOf(db) {
  const out = new Map();
  for (const t of TABLES) {
    const rows = [];
    const v = db[t.coll];
    if (t.kind === 'list') {
      for (const doc of v ?? []) rows.push({ id: String(doc[t.key]), keys: [doc[t.key]], doc });
    } else if (t.kind === 'map' || t.kind === 'values') {
      for (const [k, doc] of Object.entries(v ?? {})) rows.push({ id: k, keys: [t.keyType === 'int' ? Number(k) : k], doc });
    } else if (t.kind === 'codes') {
      for (const [group, items] of Object.entries(v ?? {})) {
        (items ?? []).forEach((doc, pos) => rows.push({ id: `${group}${SEP}${doc.value}`, keys: [group, doc.value], doc, group, pos }));
      }
    }
    out.set(t.table, rows);
  }
  return out;
}

/**
 * 표별 행 → 데이터 (rowsOf 의 반대). rowsByTable: 표 이름 → [{ keys, doc, pos? }]
 * 표가 모두 비어 있으면 null (처음 실행)
 */
export function dbFromRows(rowsByTable) {
  let any = false;
  const db = {};
  for (const t of TABLES) {
    const rows = rowsByTable.get(t.table) ?? [];
    if (rows.length) any = true;
    if (t.kind === 'list') {
      db[t.coll] = rows.map((r) => r.doc);
    } else if (t.kind === 'map' || t.kind === 'values') {
      db[t.coll] = Object.fromEntries(rows.map((r) => [String(r.keys[0]), r.doc]));
    } else if (t.kind === 'codes') {
      const groups = {};
      for (const r of [...rows].sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))) (groups[r.keys[0]] ??= []).push(r.doc);
      db[t.coll] = groups;
    }
  }
  if (!any) return null;
  const byId = (a, b) => a.id - b.id;
  for (const coll of ['applicants', 'matches', 'hearts', 'reviews', 'messages']) db[coll].sort(byId);
  db.vocs.sort((a, b) => b.id - a.id); // 개선의 소리는 최신 글이 앞
  db.auditLogs.sort((a, b) => b.id - a.id); // 열람 기록은 최신이 앞
  return db;
}

/** 열 하나의 값 — 원본에서 꺼내 형식에 맞춘다 (맞지 않으면 null) */
export function cellOf(t, row, [, src, type]) {
  const raw = src === '$key' ? row.keys[0] : src === '$group' ? row.group : src === '$pos' ? row.pos : src === '$value' ? row.doc : row.doc?.[src];
  if (raw === undefined || raw === null || raw === '') return null;
  const { kind, len } = parseType(type);
  if (kind === 'int') {
    const n = Number(raw);
    return Number.isInteger(n) && Math.abs(n) <= 2147483647 ? n : null;
  }
  if (kind === 'bit') return Boolean(raw);
  if (kind === 'time') {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
  if (kind === 'secret') return s.slice(0, 1000);
  return s.slice(0, len || 400);
}

/** 열 형식 → SQL 형식 */
export function sqlTypeOf(type) {
  const { kind, len } = parseType(type);
  return { int: 'INT', bit: 'BIT', time: 'DATETIME2(3)', secret: 'NVARCHAR(1000)', str: `NVARCHAR(${len || 400})`, text: `NVARCHAR(${len || 400})` }[kind];
}

/** 표 만들기 SQL (없을 때만) — 표·열 설명(MS_Description)을 함께 넣어 SSMS 에서 보이게 한다 */
export function createTableSql(t) {
  const keys = keyColsOf(t).map(([n]) => n);
  const q = (s) => s.replace(/'/g, "''");
  const lines = t.cols.map(([n, , type]) => `    ${n} ${sqlTypeOf(type)} ${keys.includes(n) ? 'NOT NULL' : 'NULL'},`);
  const desc = (name, text) =>
    `  EXEC sys.sp_addextendedproperty N'MS_Description', N'${q(text)}', N'SCHEMA', N'dbo', N'TABLE', N'${t.table}'${name ? `, N'COLUMN', N'${name}'` : ''};`;
  return [
    `IF OBJECT_ID(N'dbo.${t.table}', N'U') IS NULL`,
    'BEGIN',
    `  CREATE TABLE dbo.${t.table} (`,
    ...lines,
    '    DATA_JSON NVARCHAR(MAX) NOT NULL,',
    `    SAVED_AT DATETIME2(3) NOT NULL CONSTRAINT DF_${t.table}_SAVED DEFAULT SYSUTCDATETIME(),`,
    `    CONSTRAINT PK_${t.table} PRIMARY KEY (${keys.join(', ')})`,
    '  );',
    desc('', `사緣 ${t.label} — 원본은 DATA_JSON, 앞쪽 열은 보기용. 수정은 관리자 화면 'DB 표'에서`),
    ...t.cols.map(([n, , , text]) => desc(n, text)),
    desc('DATA_JSON', '행 전체 원본(JSON) — 서버가 이 값으로 데이터를 읽는다'),
    desc('SAVED_AT', '마지막 저장 시각(UTC)'),
    'END',
  ].join('\n');
}
