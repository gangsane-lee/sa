/**
 * 기준정보 일괄 변경 파일 — 엑셀(.xlsx) · JSON ↔ 서비스 형식({ kind, codes, settings })
 *  엑셀 시트
 *   - 안내    : 고치는 방법
 *   - 기준정보: 그룹 · 그룹 이름 · 코드 · 표시 이름 · 순서 · 사용(Y/N) · 상위 코드 · 보조 값 (한 줄 = 한 항목)
 *   - 설정    : 항목 키 · 설명 · 값 · 쓸 수 있는 값
 *  검사(코드 형식·중복·사용 중 항목 등)는 서버의 importReference 가 하고, 여기서는 읽고 쓰기만 한다.
 */
import { CODE_GROUPS, CODE_GROUP_MAP, SETTING_ITEMS, REFERENCE_KIND } from '@shared/constants/codes';

const CODE_COLS = [
  { key: 'group', header: '그룹', width: 12 },
  { key: 'groupText', header: '그룹 이름', width: 12 },
  { key: 'value', header: '코드', width: 16 },
  { key: 'text', header: '표시 이름', width: 28 },
  { key: 'order', header: '순서', width: 8 },
  { key: 'use', header: '사용(Y/N)', width: 10 },
  { key: 'parent', header: '상위 코드', width: 12 },
  { key: 'attr', header: '보조 값', width: 14 },
];

const GUIDE = [
  '사緣 기준정보 일괄 변경 파일',
  '',
  "1) '기준정보' 시트에서 한 줄이 한 항목이에요. 표시 이름·순서·사용(Y/N)·보조 값을 고치거나, 줄을 추가·삭제하세요.",
  '2) 코드는 신청서가 참조하는 값이라 바꾸지 마세요. 바꾸고 싶으면 새 코드로 줄을 추가하고 예전 줄은 지우세요.',
  "3) 지운 줄: 아무 신청서도 안 쓰면 삭제되고, 쓰고 있으면 '사용 안 함'으로 남아요(기존 신청서 표시는 유지).",
  "4) 파일에 없는 그룹은 바뀌지 않아요. 한 그룹만 바꾸려면 다른 그룹 줄은 지워도 돼요.",
  "5) '설정' 시트의 값 칸을 고치면 설정도 함께 바뀌어요. 바꾸지 않으려면 시트를 지우세요.",
  '6) 관리자 화면 → 기준정보 → [파일 가져오기]로 올리면 바뀌는 내용을 먼저 보여주고, [적용]을 눌러야 반영돼요.',
  '',
  '코드: 영문 대문자·숫자·_ 30자 이내 / 표시 이름: 1~40자 / 사용: Y 또는 N',
];

const cellText = (cell) => {
  const v = cell?.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('').trim();
    if ('text' in v) return String(v.text ?? '').trim();
    if ('result' in v) return String(v.result ?? '').trim();
  }
  return String(v).trim();
};

const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};
export const referenceFileName = (ext) => `사연_기준정보_${stamp()}.${ext}`;

/** 서비스 형식 → JSON Blob */
export const toJsonBlob = (payload) => new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });

/** 서비스 형식 → 엑셀 Blob */
export async function toWorkbookBlob(payload) {
  const { Workbook } = await import('exceljs');
  const wb = new Workbook();
  wb.creator = '사緣';
  wb.subject = REFERENCE_KIND;

  const guide = wb.addWorksheet('안내');
  guide.columns = [{ width: 120 }];
  GUIDE.forEach((line) => guide.addRow([line]));
  guide.getRow(1).font = { bold: true, size: 13 };

  const ws = wb.addWorksheet('기준정보', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = CODE_COLS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  for (const g of CODE_GROUPS) {
    for (const it of payload.codes?.[g.value] ?? []) {
      ws.addRow({
        group: g.value, groupText: g.text, value: it.value, text: it.text, order: it.order,
        use: it.use ? 'Y' : 'N', parent: it.parent ?? '', attr: it.attr ?? '',
      });
    }
  }
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: 'A1', to: 'H1' };

  const st = wb.addWorksheet('설정', { views: [{ state: 'frozen', ySplit: 1 }] });
  st.columns = [
    { header: '항목 키', key: 'key', width: 24 },
    { header: '설명', key: 'text', width: 46 },
    { header: '값', key: 'value', width: 10 },
    { header: '쓸 수 있는 값', key: 'hint', width: 16 },
  ];
  for (const item of SETTING_ITEMS) {
    const v = payload.settings?.[item.key];
    st.addRow({
      key: item.key, text: item.text,
      value: item.type === 'bool' ? (v ? 'Y' : 'N') : v,
      hint: item.type === 'bool' ? 'Y / N' : `${item.min} ~ ${item.max}`,
    });
  }
  st.getRow(1).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** 그룹 칸: 코드(DIVISION) 또는 이름(사업부) 둘 다 받는다 */
const groupOf = (s) => {
  const up = s.toUpperCase();
  if (CODE_GROUP_MAP[up]) return up;
  return CODE_GROUPS.find((g) => g.text === s)?.value ?? up;
};

/** 엑셀·JSON 파일 → 서비스 형식. 파일을 읽지 못하면 Error(사용자에게 보여줄 문구) */
export async function readReferenceFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.json')) {
    try {
      return JSON.parse(await file.text());
    } catch {
      throw new Error('JSON 파일을 읽지 못했어요. 내용이 깨지지 않았는지 확인해 주세요.');
    }
  }
  if (!name.endsWith('.xlsx')) throw new Error('엑셀(.xlsx) 또는 JSON(.json) 파일만 가져올 수 있어요. (.xls 는 .xlsx 로 다시 저장해 주세요)');

  const { Workbook } = await import('exceljs');
  const wb = new Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error('엑셀 파일을 열지 못했어요. 암호가 걸려 있지 않은 .xlsx 파일인지 확인해 주세요.');
  }
  const ws = wb.getWorksheet('기준정보');
  if (!ws) throw new Error("'기준정보' 시트가 없어요. 관리자 화면에서 내보낸 엑셀을 고쳐서 올려 주세요.");

  const colOf = {};
  ws.getRow(1).eachCell((cell, col) => {
    const def = CODE_COLS.find((c) => c.header === cellText(cell));
    if (def) colOf[def.key] = col;
  });
  for (const key of ['group', 'value', 'text']) {
    if (!colOf[key]) throw new Error(`'기준정보' 시트 첫 줄에 '${CODE_COLS.find((c) => c.key === key).header}' 열이 없어요. 열 이름은 바꾸지 말아 주세요.`);
  }

  const codes = {};
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const get = (k) => (colOf[k] ? cellText(row.getCell(colOf[k])) : '');
    const raw = { group: get('group'), value: get('value'), text: get('text') };
    if (!raw.group && !raw.value && !raw.text) return; // 빈 줄
    const group = raw.group ? groupOf(raw.group) : '(그룹 빈칸)';
    const item = { row: i, value: raw.value, text: raw.text, order: get('order'), use: get('use') };
    if (colOf.parent) item.parent = get('parent');
    if (colOf.attr) item.attr = get('attr');
    (codes[group] ??= []).push(item);
  });

  const payload = { kind: REFERENCE_KIND, version: 1, codes };
  const st = wb.getWorksheet('설정');
  if (st) {
    const settings = {};
    st.eachRow((row, i) => {
      if (i === 1) return;
      const key = cellText(row.getCell(1));
      const value = cellText(row.getCell(3));
      if (key && value !== '') settings[key] = value;
    });
    if (Object.keys(settings).length) payload.settings = settings;
  }
  return payload;
}
