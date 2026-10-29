<script setup>
/**
 * DB 표 — 목적별 표(신청서 · 매칭 · 하트 · 쪽지 …)를 DB 에 있는 그대로 보고, 행을 추가·수정·삭제한다.
 * 표 정의: server/shared/db/tables.js (SSMS 에서 보이는 표 이름·열과 같다)
 *  - 표의 앞쪽 열은 보기용, 행을 누르면 원본(모든 항목)을 항목별로 고칠 수 있다
 *  - 고친 내용은 서버 메모리와 DB 에 함께 반영되고 열람 기록에 남는다 (SSMS 에서 직접 고치면 서버가 덮어쓴다)
 *  - 기준정보·설정·번호·열람 기록은 보기만 (각자 화면에서 고친다)
 */
import { ref, reactive, computed, onMounted } from 'vue';
import { DxDataGrid, DxColumn, DxSearchPanel, DxPaging, DxPager, DxFilterRow } from 'devextreme-vue/data-grid';
import { DxPopup } from 'devextreme-vue/popup';
import { DxButton } from 'devextreme-vue/button';
import { DxTextBox } from 'devextreme-vue/text-box';
import { DxNumberBox } from 'devextreme-vue/number-box';
import { DxCheckBox } from 'devextreme-vue/check-box';
import { DxTextArea } from 'devextreme-vue/text-area';
import notify from 'devextreme/ui/notify';
import { confirm } from 'devextreme/ui/dialog';
import { adminApi } from '@/stores/session';

const tables = ref([]);
const current = ref(null); // 고른 표
const rows = ref([]);
const loading = ref(false);
const testTotal = computed(() => tables.value.reduce((n, t) => n + t.tests, 0));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fail = (e) => notify({ message: e.message, type: 'error', displayTime: 4000 });

async function loadTables() {
  tables.value = await adminApi.tables();
  if (current.value) current.value = tables.value.find((t) => t.coll === current.value.coll) ?? null;
}
async function pick(t) {
  current.value = t;
  await loadRows();
}
async function loadRows() {
  if (!current.value) return;
  loading.value = true;
  try {
    const list = await adminApi.tableRows(current.value.coll);
    rows.value = list.map((r) => ({ __id: r.id, __key: r.key, __test: r.test, __row: r, ...r.cells }));
  } catch (e) {
    fail(e);
  } finally {
    loading.value = false;
  }
}
const refresh = async () => {
  await loadTables().catch(fail);
  await loadRows();
};
onMounted(async () => {
  try {
    await loadTables();
    if (tables.value[0]) await pick(tables.value[0]);
  } catch (e) {
    fail(e);
  }
});

const dataTypeOf = (type) => ({ int: 'number', bit: 'boolean', time: 'datetime' })[type] ?? 'string';

// ── 행 편집 ─────────────────────────────────────────────
/** 항목 하나: kind = string | number | boolean | null | json(객체·배열) */
const kindOf = (v) => (v === null || v === undefined ? 'null' : typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? 'number' : typeof v === 'string' ? 'string' : 'json');
const KIND_TEXT = { string: '글자', number: '숫자', boolean: '예/아니오', null: '빈 값', json: 'JSON' };
const toField = (name, v) => {
  const kind = kindOf(v);
  return { name, kind, value: kind === 'json' ? JSON.stringify(v, null, 2) : kind === 'null' ? '' : v };
};
/** 새 행 틀 — 같은 표의 첫 행 항목을 빈 값으로 */
const blankOf = (v) => (typeof v === 'boolean' ? false : typeof v === 'number' ? null : typeof v === 'string' ? '' : Array.isArray(v) ? [] : v && typeof v === 'object' ? {} : null);

const ed = reactive({ open: false, isNew: false, id: null, key: '', mode: 'form', fields: [], json: '', error: '', busy: false, newName: '' });
const isMap = computed(() => current.value && current.value.kind !== 'list');
const isPlainValue = computed(() => current.value?.kind === 'values');

function openEditor(row) {
  const t = current.value;
  if (!t) return;
  const doc = row ? row.doc : Object.fromEntries(Object.entries(rows.value[0]?.__row.doc ?? {}).filter(([k]) => k !== t.key).map(([k, v]) => [k, blankOf(v)]));
  const isObj = doc && typeof doc === 'object' && !Array.isArray(doc); // 설정·번호 표는 값 하나
  Object.assign(ed, {
    open: true, isNew: !row, id: row ? row.id : null, key: row ? String(row.id) : '', mode: isObj ? 'form' : 'json', error: '', busy: false, newName: '',
    fields: isObj ? Object.entries(doc).map(([k, v]) => toField(k, v)) : [],
    json: JSON.stringify(doc ?? {}, null, 2),
  });
  if (!row && t.kind === 'list' && t.key && !ed.fields.some((f) => f.name === t.key)) ed.fields.unshift({ name: t.key, kind: 'number', value: null });
}

/** 항목별 입력 → 원본 */
function docFromFields() {
  const out = {};
  for (const f of ed.fields) {
    if (f.kind === 'json') {
      try {
        out[f.name] = JSON.parse(f.value || 'null');
      } catch {
        throw new Error(`'${f.name}' 항목의 JSON 형식이 맞지 않아요.`);
      }
    } else if (f.kind === 'null') out[f.name] = f.value === '' ? null : f.value;
    else if (f.kind === 'number') out[f.name] = f.value === '' || f.value === undefined ? null : f.value;
    else out[f.name] = f.value;
  }
  return out;
}
function switchMode(mode) {
  ed.error = '';
  try {
    if (mode === 'json') ed.json = JSON.stringify(docFromFields(), null, 2);
    else {
      const doc = JSON.parse(ed.json || '{}');
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('{ } 객체여야 해요.');
      ed.fields = Object.entries(doc).map(([k, v]) => toField(k, v));
    }
    ed.mode = mode;
  } catch (e) {
    ed.error = `JSON 을 읽지 못했어요 — ${e.message}`;
  }
}
function addField() {
  const name = ed.newName.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(name)) {
    ed.error = '항목 이름은 영문으로 시작하는 영문·숫자·_ 로 적어 주세요.';
    return;
  }
  if (ed.fields.some((f) => f.name === name)) {
    ed.error = `'${name}' 항목이 이미 있어요.`;
    return;
  }
  ed.fields.push({ name, kind: 'string', value: '' });
  ed.newName = '';
  ed.error = '';
}
const removeField = (f) => {
  ed.fields = ed.fields.filter((x) => x !== f);
};

async function save() {
  ed.error = '';
  let doc;
  try {
    doc = ed.mode === 'json' ? JSON.parse(ed.json || '{}') : docFromFields();
    if (isPlainValue.value) throw new Error('이 표는 여기서 고칠 수 없어요.');
  } catch (e) {
    ed.error = e.message;
    return;
  }
  ed.busy = true;
  try {
    const r = await adminApi.saveTableRow(current.value.coll, ed.isNew ? null : ed.id, { key: isMap.value ? ed.key : undefined, doc });
    notify({ message: `${current.value.table} ${r.id} 행을 ${ed.isNew ? '추가' : '저장'}했어요.`, type: 'success', displayTime: 2000 });
    ed.open = false;
    await refresh();
  } catch (e) {
    ed.error = e.message;
  } finally {
    ed.busy = false;
  }
}

async function removeRow() {
  const t = current.value;
  const extra = t.coll === 'applicants' ? '<br/>이 신청서의 매칭·하트·쪽지·후기도 함께 지워져요.' : '';
  if (!(await confirm(`<b>${esc(t.table)}</b> 의 <b>${esc(ed.id)}</b> 행을 지울까요?${extra}<br/>되돌릴 수 없어요.`, '행 삭제'))) return;
  ed.busy = true;
  try {
    await adminApi.deleteTableRow(t.coll, ed.id);
    notify({ message: `${t.table} ${ed.id} 행을 지웠어요.`, type: 'success', displayTime: 2000 });
    ed.open = false;
    await refresh();
  } catch (e) {
    ed.error = e.message;
  } finally {
    ed.busy = false;
  }
}

async function purgeTests() {
  if (!(await confirm('개발 테스트 사번(npm run dev)으로 만든 신청서와 관련 매칭·하트·쪽지, 테스트 계정 로그인 기록을 모두 지울까요?<br/>운영 데이터는 그대로예요.', '테스트 데이터 지우기'))) return;
  try {
    const r = await adminApi.purgeTestData();
    notify({ message: `테스트 신청서 ${r.applicants}건 · 테스트 계정 ${r.employees}개를 지웠어요.`, type: 'success', displayTime: 2600 });
    await refresh();
  } catch (e) {
    fail(e);
  }
}
</script>

<template>
  <div class="tbl">
    <aside class="list">
      <p class="list__title">표 (SSMS 이름)</p>
      <button
        v-for="t in tables"
        :key="t.coll"
        type="button"
        class="list__item"
        :class="{ 'is-on': current?.coll === t.coll }"
        @click="pick(t)"
      >
        <span class="list__label">{{ t.label }}<i v-if="t.readOnly" class="ro">보기</i></span>
        <span class="list__meta mono">{{ t.table }} · {{ t.count }}<template v-if="t.tests"> (테스트 {{ t.tests }})</template></span>
      </button>
      <DxButton v-if="testTotal" text="테스트 데이터 지우기" type="danger" styling-mode="outlined" width="100%" class="list__purge" @click="purgeTests" />
    </aside>

    <section v-if="current" class="main">
      <header class="head">
        <div>
          <h2 class="head__title">{{ current.label }} <span class="mono head__table">dbo.{{ current.table }}</span></h2>
          <p class="head__sub">
            <template v-if="current.readOnly">보기만 할 수 있어요 — {{ current.coll === 'codes' ? '기준정보' : current.coll === 'settings' ? '설정' : current.coll === 'auditLogs' ? '열람 기록은 고칠 수 없어요' : '서버가 자동으로 관리해요' }}{{ ['codes', 'settings'].includes(current.coll) ? ' 화면에서 고쳐 주세요.' : '' }}</template>
            <template v-else>행을 누르면 모든 항목을 보고 고칠 수 있어요. 고친 내용은 바로 저장되고 열람 기록에 남아요.</template>
          </p>
        </div>
        <div class="head__actions">
          <DxButton v-if="!current.readOnly" text="행 추가" icon="add" type="default" @click="openEditor(null)" />
          <DxButton icon="refresh" hint="새로고침" @click="refresh" />
        </div>
      </header>

      <DxDataGrid
        class="sa-grid"
        :data-source="rows"
        key-expr="__id"
        :show-borders="false"
        :column-auto-width="true"
        :hover-state-enabled="true"
        :allow-column-resizing="true"
        no-data-text="행이 없어요."
        @row-click="(e) => e.rowType === 'data' && openEditor(e.data.__row)"
        @row-prepared="(e) => e.rowType === 'data' && e.data.__test && e.rowElement.classList.add('is-test')"
      >
        <DxSearchPanel :visible="true" :width="220" placeholder="검색" />
        <DxFilterRow :visible="true" />
        <DxPaging :page-size="20" />
        <DxPager :visible="true" :show-info="true" info-text="{2}행 · {0}/{1}쪽" />
        <DxColumn
          v-for="c in current.columns"
          :key="c.name"
          :data-field="c.name"
          :caption="c.name"
          :data-type="dataTypeOf(c.type)"
          :format="c.type === 'time' ? 'yyyy.MM.dd HH:mm' : undefined"
          :header-cell-template="'hd'"
        />
        <template #hd="{ data }">
          <span class="colh"><b class="mono">{{ data.column.caption }}</b><small>{{ current.columns.find((c) => c.name === data.column.caption)?.text }}</small></span>
        </template>
      </DxDataGrid>
    </section>

    <DxPopup
      v-model:visible="ed.open"
      :title="current ? `${current.label} · ${ed.isNew ? '행 추가' : `행 ${ed.id}`}` : ''"
      :width="720"
      max-width="calc(100vw - 24px)"
      height="auto"
      max-height="88vh"
      :show-close-button="true"
      :hide-on-outside-click="false"
      :wrapper-attr="{ class: 'sa-popup' }"
    >
      <!-- 팝업 안의 맨 바깥 요소는 늘 있어야 한다 (v-if 를 걸면 DevExtreme 이 팝업 밖에 그린다) -->
      <div class="ed">
        <div class="ed__top">
          <label v-if="isMap" class="ed__key">
            <span>행 키 <small>(map 표 — {{ current?.columns[0]?.text }})</small></span>
            <DxTextBox v-model:value="ed.key" :read-only="current?.readOnly" />
          </label>
          <div class="ed__tabs" role="tablist">
            <button type="button" :class="{ 'is-on': ed.mode === 'form' }" @click="switchMode('form')">항목별</button>
            <button type="button" :class="{ 'is-on': ed.mode === 'json' }" @click="switchMode('json')">JSON</button>
          </div>
        </div>

        <div v-if="ed.mode === 'form'" class="ed__fields">
          <div v-for="f in ed.fields" :key="f.name" class="fld">
            <span class="fld__name mono">{{ f.name }}<small>{{ KIND_TEXT[f.kind] }}</small></span>
            <DxCheckBox v-if="f.kind === 'boolean'" v-model:value="f.value" :read-only="current?.readOnly" />
            <DxNumberBox v-else-if="f.kind === 'number'" v-model:value="f.value" :show-clear-button="true" :read-only="current?.readOnly" />
            <DxTextArea v-else-if="f.kind === 'json'" v-model:value="f.value" :auto-resize-enabled="true" :max-height="220" class="mono-input" :read-only="current?.readOnly" />
            <DxTextBox v-else v-model:value="f.value" :placeholder="f.kind === 'null' ? '(비어 있음)' : ''" :read-only="current?.readOnly" />
            <button v-if="!current?.readOnly" type="button" class="fld__del" title="항목 빼기" @click="removeField(f)">✕</button>
          </div>
          <div v-if="!current?.readOnly" class="fld fld--add">
            <DxTextBox v-model:value="ed.newName" placeholder="새 항목 이름 (영문)" @enter-key="addField" />
            <DxButton text="항목 추가" @click="addField" />
          </div>
        </div>
        <DxTextArea v-else v-model:value="ed.json" :height="380" class="mono-input" :read-only="current?.readOnly" />

        <p v-if="ed.error" class="ed__error" role="alert">{{ ed.error }}</p>
        <p class="ed__note">값을 잘못 바꾸면 화면이 이상하게 보일 수 있어요. 상태·매칭은 가능하면 신청자 관리·매칭 관리 화면을 써 주세요.</p>
        <div class="ed__actions">
          <DxButton v-if="!ed.isNew && !current?.readOnly" text="삭제" type="danger" styling-mode="outlined" :disabled="ed.busy" @click="removeRow" />
          <span class="sp" />
          <DxButton text="닫기" @click="ed.open = false" />
          <DxButton v-if="!current?.readOnly" :text="ed.isNew ? '추가' : '저장'" type="default" :disabled="ed.busy" @click="save" />
        </div>
      </div>
    </DxPopup>
  </div>
</template>

<style scoped>
.tbl {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.list,
.main {
  padding: 12px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
}
.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.list__title {
  margin: 2px 6px 6px;
  color: var(--c-mute);
  font-size: 12px;
}
.list__item {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 7px 10px;
  border: 0;
  border-radius: var(--r-sm, 6px);
  background: none;
  text-align: left;
  cursor: pointer;
}
.list__item:hover {
  background: var(--c-paper);
}
.list__item.is-on {
  background: var(--c-indigo);
  color: var(--c-on-indigo);
}
.list__label {
  font-size: 13.5px;
  font-weight: 600;
}
.list__meta {
  font-size: 11px;
  opacity: 0.75;
}
.ro {
  margin-left: 6px;
  padding: 0 5px;
  border: 1px solid currentColor;
  border-radius: 4px;
  font-size: 10.5px;
  font-style: normal;
  font-weight: 500;
  opacity: 0.7;
}
.list__purge {
  margin-top: 10px;
}
.head {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
}
.head__title {
  font-size: 16px;
}
.head__table {
  margin-left: 6px;
  color: var(--c-mute);
  font-size: 12.5px;
  font-weight: 500;
}
.head__sub {
  margin-top: 2px;
  color: var(--c-mute);
  font-size: 12.5px;
}
.head__actions {
  display: flex;
  gap: 6px;
}
.colh {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.colh small {
  color: var(--c-mute);
  font-size: 11px;
  font-weight: 400;
}
.main :deep(.is-test) td {
  background: #fff8e6;
}
.ed {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ed__top {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  justify-content: space-between;
}
.ed__key {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  font-size: 12.5px;
}
.ed__tabs {
  display: flex;
  margin-left: auto;
  border: 1px solid var(--c-line-strong);
  border-radius: 8px;
  overflow: hidden;
}
.ed__tabs button {
  padding: 5px 14px;
  border: 0;
  background: none;
  font-size: 12.5px;
  cursor: pointer;
}
.ed__tabs button.is-on {
  background: var(--c-indigo);
  color: var(--c-on-indigo);
}
.ed__fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 52vh;
  overflow: auto;
  padding-right: 4px;
}
.fld {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr) 26px;
  gap: 8px;
  align-items: center;
}
.fld--add {
  grid-template-columns: minmax(0, 1fr) auto;
  margin-top: 4px;
}
.fld__name {
  display: flex;
  flex-direction: column;
  font-size: 12.5px;
  overflow-wrap: anywhere;
}
.fld__name small {
  color: var(--c-mute);
  font-family: inherit;
  font-size: 10.5px;
}
.fld__del {
  border: 0;
  background: none;
  color: var(--c-mute);
  cursor: pointer;
}
.fld__del:hover {
  color: var(--c-crimson);
}
.mono-input :deep(textarea) {
  font-family: var(--f-mono, ui-monospace, monospace);
  font-size: 12.5px;
}
.ed__error {
  color: var(--c-crimson);
  font-size: 13px;
}
.ed__note {
  color: var(--c-mute);
  font-size: 12px;
}
.ed__actions {
  display: flex;
  gap: 8px;
}
.sp {
  flex: 1;
}
@media (max-width: 900px) {
  .tbl {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
