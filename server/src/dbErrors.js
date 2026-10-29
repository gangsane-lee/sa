/**
 * MSSQL 오류 → 사람이 읽을 원인과 해결 방법
 *  서버 시작(store.js) · 배포 점검(npm run check) · DB 준비(npm run db:setup)가 함께 쓴다.
 *  - 쿼리 오류는 SQL Server 오류 번호(err.number)로 판단한다
 *  - 로그인 오류는 번호가 오지 않아 문구로 판단한다 (영문·한국어 SQL Server 둘 다)
 */

const has = (s, ...res) => res.some((re) => re.test(s));

/**
 * @param {any} err  mssql / tedious 오류
 * @param {{ host?: string, port?: number, user?: string, database?: string }} [ctx]
 * @returns {{ title: string, reason: string, fix: string[] }}
 */
export function explainDbError(err, ctx = {}) {
  const code = err?.code ?? err?.originalError?.code;
  const number = err?.number ?? err?.originalError?.number ?? err?.originalError?.info?.number;
  const msg = String(err?.message ?? err ?? '');
  const where = ctx.host ? `${ctx.host}:${ctx.port ?? 1433}` : 'DB 서버';
  const user = ctx.user ? `'${ctx.user}'` : 'DB 계정';
  const db = ctx.database ? `'${ctx.database}'` : '데이터베이스';

  // ── 네트워크 ──
  if (has(msg, /ENOTFOUND|EAI_AGAIN|getaddrinfo/i)) {
    return {
      title: 'DB 서버 이름을 찾지 못했어요',
      reason: `DB 서버 주소(${ctx.host ?? '?'})를 찾지 못했어요.`,
      fix: ['servers.config.mjs 의 db.host 를 IP 주소로 적었는지 확인해 주세요.'],
    };
  }
  if (has(msg, /ECONNREFUSED/i)) {
    return {
      title: 'DB 서버가 연결을 거부했어요',
      reason: `${where} 에 닿았지만 그 포트에서 SQL Server가 받고 있지 않아요.`,
      fix: [
        'DB 서버에서 SQL Server 서비스가 실행 중인지 확인해 주세요.',
        "SQL Server 구성 관리자 → 'SQL Server 네트워크 구성' → TCP/IP 가 '사용'인지, 포트가 servers.config.mjs 의 db.port 와 같은지 확인해 주세요.",
        '이름 있는 인스턴스(예: 서버\\SQLEXPRESS)는 고정 포트를 정해 servers.config.mjs 의 db.port 에 적어 주세요.',
      ],
    };
  }
  if (code === 'ETIMEOUT' || has(msg, /ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|Failed to connect .* in \d+ms|timeout/i)) {
    return {
      title: 'DB 서버에 연결하지 못했어요 (시간 초과)',
      reason: `${where} 까지 응답이 없어요. 방화벽에 막혔거나 주소·포트가 틀렸을 때 생겨요.`,
      fix: [
        `API 서버에서 DB 서버로 포트가 열려 있는지 확인: PowerShell  Test-NetConnection ${ctx.host ?? 'DB서버IP'} -Port ${ctx.port ?? 1433}`,
        'DB 서버 Windows 방화벽과 네트워크 방화벽에서 API 서버 → DB 포트 허용을 요청해 주세요.',
        'servers.config.mjs 의 db.host · db.port 를 확인해 주세요.',
      ],
    };
  }
  if (code === 'EINSTLOOKUP') {
    return {
      title: 'SQL Server 인스턴스를 찾지 못했어요',
      reason: '이름 있는 인스턴스를 찾는 SQL Browser(UDP 1434) 응답이 없어요.',
      fix: ['인스턴스 이름 대신 고정 포트를 정해 servers.config.mjs 의 db.port 에 적어 주세요.'],
    };
  }
  if (has(msg, /certificate|self[- ]signed|SSL|TLS|ERR_TLS|routines:/i) && code !== 'ELOGIN') {
    return {
      title: 'DB 연결 암호화(인증서) 설정이 맞지 않아요',
      reason: msg,
      fix: [
        '사내 자체 서명 인증서라면 server/.env 에 DB_TRUST_CERT=true',
        'DB가 암호화 연결을 요구하지 않으면 DB_ENCRYPT=false, 요구하면 DB_ENCRYPT=true',
      ],
    };
  }

  // ── 로그인 ──
  if (code === 'ELOGIN' || has(msg, /Login failed|로그인하지 못했습니다|로그인이 실패/)) {
    if (has(msg, /Cannot open database|데이터베이스.*열 수 없/)) {
      return {
        title: `데이터베이스 ${db} 를 열 수 없어요`,
        reason: `DB가 아직 없거나, 계정 ${user} 이(가) 이 DB의 사용자로 등록되지 않았어요.`,
        fix: [
          'server 폴더에서  npm run db:setup  (DB·계정 매핑·권한을 만들어요)',
          '또는 DB 담당자에게 server/sql/setup.sql 실행을 요청해 주세요.',
        ],
      };
    }
    if (has(msg, /must change|암호를 변경해야/)) {
      return {
        title: `계정 ${user} 의 비밀번호를 바꿔야 로그인할 수 있어요`,
        reason: "SQL Server 로그인에 '다음 로그인 시 암호 변경'이 걸려 있어요.",
        fix: ['DB 담당자에게 비밀번호 변경(또는 CHECK_EXPIRATION=OFF)을 요청한 뒤 .env 의 DB_PASSWORD 를 맞춰 주세요.'],
      };
    }
    if (has(msg, /disabled|사용할 수 없습니다/)) {
      return {
        title: `계정 ${user} 이(가) 사용 중지 상태예요`,
        reason: 'SQL Server 로그인이 비활성화되어 있어요.',
        fix: [`DB 담당자에게  ALTER LOGIN [${ctx.user ?? '계정'}] ENABLE;  을 요청해 주세요.`],
      };
    }
    if (has(msg, /untrusted domain|신뢰할 수 없는 도메인/)) {
      return {
        title: 'SQL Server 인증이 꺼져 있어요',
        reason: 'DB 서버가 Windows 인증만 받도록 설정되어 있어요.',
        fix: ["DB 서버 속성 → 보안 → 'SQL Server 및 Windows 인증 모드'로 바꾸고 SQL Server 서비스를 다시 시작해 달라고 요청해 주세요."],
      };
    }
    return {
      title: `DB 로그인 실패 (${user})`,
      reason: '계정이 없거나, 비밀번호가 틀렸거나, DB 서버가 SQL Server 인증을 받지 않을 때 생겨요.',
      fix: [
        'server/.env 의 DB_USER · DB_PASSWORD 를 확인해 주세요. (앞뒤 공백·따옴표 주의)',
        "DB 서버가 'SQL Server 및 Windows 인증 모드'인지 확인해 주세요.",
        '정확한 원인은 DB 서버의 SQL Server 오류 로그 State 번호로 알 수 있어요 — 5: 계정 없음, 8: 비밀번호 틀림, 58: SQL 인증 꺼짐',
        '계정이 아직 없으면  npm run db:setup  으로 만들 수 있어요 (관리 계정 필요).',
      ],
    };
  }

  // ── 쿼리 오류 (SQL Server 오류 번호) ──
  switch (number) {
    case 262:
      return {
        title: '권한이 없어요',
        reason: msg,
        fix: [
          /CREATE DATABASE/i.test(msg) || /데이터베이스/.test(msg)
            ? 'DB를 만들 권한이 없어요 → 관리 계정으로  npm run db:setup  을 실행하거나, DB 담당자에게 DB 생성을 요청한 뒤 DB_AUTO_CREATE=false'
            : '표를 만들 권한이 없어요 → 관리 계정으로  npm run db:setup  을 실행하거나, DB 담당자가 sql/setup.sql 로 사緣 표(SA_…)를 미리 만들어 주세요.',
        ],
      };
    case 229:
    case 230:
      return {
        title: `계정 ${user} 에 읽기·쓰기 권한이 없어요`,
        reason: msg,
        fix: ['npm run db:setup  으로 db_datareader · db_datawriter 권한을 주거나, DB 담당자에게 요청해 주세요.'],
      };
    case 208:
      return {
        title: '사緣 표가 없어요',
        reason: msg,
        fix: ['npm run db:setup  또는 sql/setup.sql 로 표를 만들어 주세요.'],
      };
    case 916:
    case 4060:
      return {
        title: `데이터베이스 ${db} 에 들어갈 수 없어요`,
        reason: msg,
        fix: ['npm run db:setup  으로 계정을 이 DB의 사용자로 등록해 주세요.'],
      };
    case 1801:
      return { title: `데이터베이스 ${db} 가 이미 있어요`, reason: msg, fix: ['문제 없어요. 그대로 진행하면 돼요.'] };
    case 15025:
    case 15023:
      return { title: '로그인·사용자가 이미 있어요', reason: msg, fix: ['문제 없어요. 그대로 진행하면 돼요.'] };
    case 15118:
    case 15116:
    case 15115:
    case 15114:
    case 15113:
      return {
        title: '비밀번호가 DB 서버의 암호 정책에 맞지 않아요',
        reason: msg,
        fix: ['DB_PASSWORD 를 8자 이상, 대문자·소문자·숫자·특수문자 중 3종류 이상으로 바꿔 주세요.'],
      };
    case 1105:
    case 9002:
      return {
        title: 'DB 저장 공간이 부족해요',
        reason: msg,
        fix: ['DB 담당자에게 데이터·로그 파일 공간 확보(로그 백업 포함)를 요청해 주세요.'],
      };
    case 3906:
      return { title: 'DB가 읽기 전용이에요', reason: msg, fix: ['DB 담당자에게 읽기 전용 해제를 요청해 주세요.'] };
    default:
      return {
        title: 'DB 오류',
        reason: `${msg}${number ? ` (SQL Server 오류 ${number})` : code ? ` (${code})` : ''}`,
        fix: ['npm run check 로 연결·권한을 단계별로 확인해 주세요.'],
      };
  }
}

/** 로그·콘솔용 여러 줄 문구 */
export function formatDbError(info, indent = '  ') {
  return [`${info.title}`, `${indent}원인: ${info.reason}`, ...info.fix.map((f) => `${indent}해결: ${f}`)].join('\n');
}

/** 시작 단계에서 던질 오류 — 메시지에 원인·해결이 들어 있다 */
export class DbSetupError extends Error {
  constructor(info, cause) {
    super(formatDbError(info), { cause });
    this.name = 'DbSetupError';
    this.info = info;
  }
}
