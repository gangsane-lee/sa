<script setup>
/**
 * 기준정보 — 신청서 선택 목록(사업부·캠퍼스·건물·키·얼굴상·체형·외모·MBTI·취미·음주·흡연·종교)을 관리한다.
 *  - 코드 값은 만든 뒤 바꿀 수 없다(신청서가 참조). 이름·순서·사용 여부는 언제든 바꿀 수 있다
 *  - 신청서가 쓰는 항목은 지울 수 없고 '사용'을 끄면 새 선택지에서만 숨겨진다
 *  - 바꾸면 화면 공통 기준정보(stores/codes)를 다시 불러온다
 *  - 일괄 변경: 엑셀·JSON으로 내보내 고친 뒤 가져오면 바뀌는 내용을 먼저 보여주고, [적용]을 눌러야 반영한다
 *    (시연(test)에서 만든 기준정보를 운영으로 옮길 때도 같은 방법)
 */
import { ref, reactive, computed } from 'vue';
import { DxPopup } from 'devextreme-vue/popup';
import { DxButton } from 'devextreme-vue/button';
import { saveAs } from 'file-saver';
import { readReferenceFile, toWorkbookBlob, toJsonBlob, referenceFileName } from '@/utils/referenceFile';
import {
  DxDataGrid, DxColumn, DxEditing, DxLookup, DxSorting, DxPaging, DxRequiredRule, DxPatternRule, DxStringLengthRule,
  DxToolbar, DxItem, DxButton as DxGridButton,
} from 'devextreme-vue/data-grid';
import CustomStore from 'devextreme/data/custom_store';
import notify from 'devextreme/ui/notify';
import 'devextreme/ui/text_box';
import 'devextreme/ui/number_box';
import 'devextreme/ui/select_box';
import 'devextreme/ui/check_box';
import 'devextreme/ui/button';
import { adminApi } from '@/stores/session';
import { reloadCodes, allItems } from '@/stores/codes';
import { CODE_GROUPS, CODE_GROUP_MAP } from '@shared/constants/codes';

const group = ref('DIVISION');
const gridRef = ref();
const meta = computed(() => CODE_GROUP_MAP[group.value]);
const parentItems = computed(() => (meta.value.parent ? allItems(meta.value.parent) : []));

async function after(promise, msg) {
  // 실패하면 오류 문구는 그리드가 표 위에 보여준다
  const r = await promise;
  await reloadCodes();
  notify({ message: msg, type: 'success', displayTime: 1800 });
  return r;
}

const store = computed(() => {
  const g = group.value;
  return new CustomStore({
    key: 'value',
    load: () => adminApi.listCodes(g),
    insert: (values) => after(adminApi.createCode(g, values), '항목을 추가했어요.'),
    update: (key, values) => after(adminApi.updateCode(g, key, values), '저장했어요.'),
    remove: (key) => after(adminApi.deleteCode(g, key), '항목을 지웠어요.'),
  });
});

function onEditorPreparing(e) {
  if (e.parentType !== 'dataRow') return;
  if (e.dataField === 'value' && !e.row.isNewRow) e.editorOptions.readOnly = true;
  if (e.dataField === 'value') e.editorOptions.inputAttr = { style: 'text-transform: uppercase' };
}
function onInitNewRow(e) {
  e.data.use = true;
  const rows = e.component.getDataSource()?.items() ?? [];
  e.data.order = Math.max(0, ...rows.map((r) => r.order ?? 0)) + 10;
}
const addRow = () => gridRef.value?.instance.addRow();

// ── 일괄 변경 ──
const ACTIONS = { ADD: '추가', UPDATE: '수정', DISABLE: '사용 안 함', REMOVE: '삭제' };
const fileRef = ref();
const bulkBusy = ref(false);
const preview = reactive({ open: false, fileName: '', payload: null, result: null });
const hasChanges = computed(() => Boolean(preview.result && (preview.result.changes.length || preview.result.settingsChanges.length)));
const fmtSetting = (v) => (typeof v === 'boolean' ? (v ? 'Y' : 'N') : v);

async function exportAs(kind) {
  bulkBusy.value = true;
  try {
    const payload = await adminApi.exportReference();
    const blob = kind === 'xlsx' ? await toWorkbookBlob(payload) : toJsonBlob(payload);
    saveAs(blob, referenceFileName(kind));
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  } finally {
    bulkBusy.value = false;
  }
}

const pickFile = () => fileRef.value?.click();

async function onFile(e) {
  const file = e.target.files?.[0];
  e.target.value = ''; // 같은 파일을 고쳐서 다시 올릴 수 있게
  if (!file) return;
  bulkBusy.value = true;
  try {
    const payload = await readReferenceFile(file);
    const result = await adminApi.importReference(payload, { apply: false });
    Object.assign(preview, { open: true, fileName: file.name, payload, result });
  } catch (err) {
    notify({ message: err.message, type: 'error', displayTime: 4500 });
  } finally {
    bulkBusy.value = false;
  }
}

async function applyBulk() {
  bulkBusy.value = true;
  try {
    const result = await adminApi.importReference(preview.payload, { apply: true });
    if (!result.applied) {
      // 미리보기 뒤에 다른 사람이 바꿨으면 새 결과를 다시 보여준다
      preview.result = result;
      notify({ message: result.errors.length ? '고쳐야 할 곳이 생겼어요. 내용을 다시 확인해 주세요.' : '바뀌는 내용이 없어요.', type: 'warning', displayTime: 3000 });
      return;
    }
    preview.open = false;
    await reloadCodes();
    gridRef.value?.instance.refresh();
    notify({ message: `기준정보 ${result.changes.length}건 · 설정 ${result.settingsChanges.length}건을 바꿨어요.`, type: 'success', displayTime: 2600 });
  } catch (err) {
    notify({ message: err.message, type: 'error', displayTime: 4500 });
  } finally {
    bulkBusy.value = false;
  }
}
</script>

<template>
  <div class="codes">
    <section class="bulk">
      <div class="bulk__text">
        <h2>기준정보 일괄 변경</h2>
        <p>엑셀로 내보내 고친 뒤 다시 가져오면 한 번에 바뀌어요. 적용하기 전에 바뀌는 내용을 먼저 보여줘요. 시연(test)에서 만든 기준정보를 운영으로 옮길 때도 이렇게 해요.</p>
      </div>
      <div class="bulk__actions">
        <DxButton text="엑셀로 내보내기" icon="exportxlsx" styling-mode="outlined" :disabled="bulkBusy" @click="exportAs('xlsx')" />
        <DxButton text="JSON" icon="download" styling-mode="text" :disabled="bulkBusy" @click="exportAs('json')" />
        <DxButton text="파일 가져오기" icon="upload" type="default" :disabled="bulkBusy" @click="pickFile" />
        <input ref="fileRef" type="file" accept=".xlsx,.json" hidden @change="onFile" />
      </div>
    </section>

    <nav class="groups" aria-label="기준정보 그룹">
      <button
        v-for="g in CODE_GROUPS"
        :key="g.value"
        type="button"
        class="groups__item"
        :class="{ 'is-active': group === g.value }"
        @click="group = g.value"
      >
        {{ g.text }}
        <span class="mono">{{ allItems(g.value).length }}</span>
      </button>
    </nav>

    <section class="panel">
      <header class="panel__head">
        <h2>{{ meta.text }}</h2>
        <p>
          코드 값은 만든 뒤 바꿀 수 없어요. 신청서가 쓰는 항목은 지울 수 없고, '사용'을 끄면 새 선택지에서만 숨겨져요.
          <template v-if="meta.note"><br />{{ meta.note }}</template>
        </p>
      </header>

      <DxDataGrid
        ref="gridRef"
        :key="group"
        class="sa-grid"
        :data-source="store"
        :show-borders="false"
        :column-auto-width="true"
        :hover-state-enabled="true"
        no-data-text="항목이 없어요. 오른쪽 위 '항목 추가'를 눌러주세요."
        @editor-preparing="onEditorPreparing"
        @init-new-row="onInitNewRow"
      >
        <DxEditing mode="row" :allow-adding="true" :allow-updating="true" :allow-deleting="true" :use-icons="true" :confirm-delete="true" />
        <DxSorting mode="none" />
        <DxPaging :page-size="50" />
        <DxToolbar>
          <DxItem location="after" widget="dxButton" :options="{ text: '항목 추가', icon: 'add', type: 'default', onClick: addRow }" />
        </DxToolbar>

        <DxColumn data-field="order" caption="순서" data-type="number" :width="80" sort-order="asc">
          <DxRequiredRule message="순서를 적어주세요." />
        </DxColumn>
        <DxColumn data-field="value" caption="코드" css-class="mono-cell" :width="170">
          <DxRequiredRule message="코드를 적어주세요." />
          <DxPatternRule :pattern="/^[A-Za-z0-9_]{1,30}$/" message="영문·숫자·_ 30자 이내" />
        </DxColumn>
        <DxColumn data-field="text" caption="표시 이름" :min-width="160">
          <DxRequiredRule message="표시 이름을 적어주세요." />
          <DxStringLengthRule :max="40" message="40자 이내로 적어주세요." />
        </DxColumn>
        <DxColumn v-if="meta.parent" data-field="parent" :caption="CODE_GROUP_MAP[meta.parent].text" :min-width="140">
          <DxLookup :data-source="parentItems" value-expr="value" display-expr="text" />
          <DxRequiredRule :message="`${CODE_GROUP_MAP[meta.parent].text}을(를) 골라주세요.`" />
        </DxColumn>
        <DxColumn v-if="meta.attrLabel" data-field="attr" :caption="meta.attrLabel" :width="190" />
        <DxColumn data-field="use" caption="사용" data-type="boolean" :width="70" />
        <DxColumn data-field="usedBy" caption="쓰는 신청서" data-type="number" :width="100" :allow-editing="false" alignment="right" />
        <DxColumn type="buttons" :width="80">
          <DxGridButton name="edit" hint="수정" />
          <DxGridButton name="delete" hint="삭제" />
          <DxGridButton name="save" hint="저장" />
          <DxGridButton name="cancel" hint="취소" />
        </DxColumn>
      </DxDataGrid>
    </section>

    <DxPopup
      v-model:visible="preview.open"
      title="기준정보 일괄 변경 — 미리보기"
      :width="780"
      max-width="calc(100vw - 24px)"
      height="auto"
      max-height="86vh"
      :show-close-button="true"
      :hide-on-outside-click="false"
      :wrapper-attr="{ class: 'sa-popup' }"
    >
      <!-- 팝업 안의 맨 바깥 요소는 늘 있어야 한다 (v-if 를 걸면 DevExtreme 이 팝업 밖에 그린다) -->
      <div class="pv">
        <template v-if="preview.result">
          <p class="pv__file">{{ preview.fileName }}</p>

          <div v-if="preview.result.errors.length" class="pv__box pv__box--bad">
            <b>고쳐야 할 곳 {{ preview.result.errors.length }}개 — 이대로는 적용할 수 없어요</b>
            <ul>
              <li v-for="(m, i) in preview.result.errors" :key="i">{{ m }}</li>
            </ul>
            <p>파일을 고친 뒤 [파일 가져오기]로 다시 올려 주세요.</p>
          </div>

          <template v-else>
            <p v-if="!hasChanges" class="pv__box">지금 기준정보·설정과 같아요. 바뀌는 내용이 없어요.</p>
            <table v-if="preview.result.summary.length" class="pv__sum">
              <thead>
                <tr><th>그룹</th><th>추가</th><th>수정</th><th>사용 안 함</th><th>삭제</th></tr>
              </thead>
              <tbody>
                <tr v-for="s in preview.result.summary" :key="s.group">
                  <td>{{ s.text }}</td><td>{{ s.ADD || '' }}</td><td>{{ s.UPDATE || '' }}</td><td>{{ s.DISABLE || '' }}</td><td>{{ s.REMOVE || '' }}</td>
                </tr>
              </tbody>
            </table>
            <ul v-if="preview.result.changes.length" class="pv__list">
              <li v-for="(c, i) in preview.result.changes" :key="i">
                <span class="pv__chip" :class="`pv__chip--${c.action}`">{{ ACTIONS[c.action] }}</span>
                <span class="pv__group">{{ CODE_GROUP_MAP[c.group].text }}</span>
                <span class="mono">{{ c.value }}</span>
                <span>{{ c.text }}</span>
                <small v-if="c.detail">{{ c.detail }}</small>
              </li>
            </ul>
            <ul v-if="preview.result.settingsChanges.length" class="pv__list">
              <li v-for="c in preview.result.settingsChanges" :key="c.key">
                <span class="pv__chip pv__chip--UPDATE">설정</span>
                <span>{{ c.text }}</span>
                <small>{{ fmtSetting(c.before) }} → {{ fmtSetting(c.after) }}</small>
              </li>
            </ul>
        </template>

        <ul v-if="preview.result.notes.length" class="pv__notes">
          <li v-for="(m, i) in preview.result.notes" :key="i">{{ m }}</li>
        </ul>

        <div class="pv__actions">
          <DxButton text="닫기" styling-mode="text" @click="preview.open = false" />
          <DxButton
            text="적용"
            icon="check"
            type="default"
            :disabled="bulkBusy || !!preview.result.errors.length || !hasChanges"
            @click="applyBulk"
          />
        </div>
        </template>
      </div>
    </DxPopup>
  </div>
</template>

<style scoped>
.codes {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.groups {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
}
.groups__item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 12px;
  border: 0;
  border-radius: var(--r-sm);
  background: none;
  color: var(--c-ink-2);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.groups__item .mono {
  color: var(--c-mute);
  font-size: 12px;
}
.groups__item:hover {
  background: var(--c-paper);
}
.groups__item.is-active {
  background: var(--c-indigo);
  color: #fff;
  font-weight: 600;
}
.groups__item.is-active .mono {
  color: var(--c-on-indigo-mute);
}
.panel {
  padding: 16px 18px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
  min-width: 0;
}
.panel__head {
  margin-bottom: 8px;
}
.panel__head h2 {
  font-size: 16px;
}
.panel__head p {
  margin-top: 4px;
  color: var(--c-mute);
  font-size: 13px;
}
.bulk {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 18px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
}
.bulk__text {
  flex: 1 1 360px;
}
.bulk h2 {
  font-size: 15px;
}
.bulk p {
  margin-top: 4px;
  color: var(--c-mute);
  font-size: 13px;
}
.bulk__actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.pv {
  display: grid;
  gap: 12px;
}
.pv__file {
  color: var(--c-mute);
  font-size: 12.5px;
}
.pv__box {
  padding: 12px 14px;
  border-radius: var(--r-sm);
  background: var(--c-paper);
  font-size: 13.5px;
}
.pv__box--bad {
  background: #fdecee;
  color: #8a1c2b;
}
.pv__box ul {
  margin: 8px 0;
  padding-left: 18px;
  max-height: 34vh;
  overflow: auto;
}
.pv__sum {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}
.pv__sum th,
.pv__sum td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--c-line);
  text-align: right;
}
.pv__sum th:first-child,
.pv__sum td:first-child {
  text-align: left;
}
.pv__sum th {
  color: var(--c-mute);
  font-weight: 600;
}
.pv__list {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  max-height: 32vh;
  overflow: auto;
  list-style: none;
  font-size: 13.5px;
}
.pv__list li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  padding: 6px 2px;
  border-bottom: 1px dashed var(--c-line);
}
.pv__list small {
  flex-basis: 100%;
  padding-left: 72px;
  color: var(--c-mute);
}
.pv__chip {
  min-width: 64px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  background: #e7e8f6;
  color: var(--c-indigo-3);
}
.pv__chip--ADD {
  background: var(--c-ok-bg);
  color: var(--c-ok);
}
.pv__chip--DISABLE {
  background: #f6edd6;
  color: var(--c-moon-ink);
}
.pv__chip--REMOVE {
  background: #fdecee;
  color: #8a1c2b;
}
.pv__group {
  color: var(--c-mute);
}
.pv__notes {
  margin: 0;
  padding-left: 18px;
  color: var(--c-mute);
  font-size: 12.5px;
}
.pv__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
@media (max-width: 900px) {
  .codes {
    grid-template-columns: 1fr;
  }
  .groups {
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
