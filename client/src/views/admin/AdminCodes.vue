<script setup>
/**
 * 기준정보 — 신청서 선택 목록(사업부·캠퍼스·건물·키·얼굴상·체형·외모·MBTI·취미·음주·흡연·종교)을 관리한다.
 *  - 코드 값은 만든 뒤 바꿀 수 없다(신청서가 참조). 이름·순서·사용 여부는 언제든 바꿀 수 있다
 *  - 신청서가 쓰는 항목은 지울 수 없고 '사용'을 끄면 새 선택지에서만 숨겨진다
 *  - 바꾸면 화면 공통 기준정보(stores/codes)를 다시 불러온다
 */
import { ref, computed } from 'vue';
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
import { CODE_GROUPS, CODE_GROUP_MAP } from '@/constants/codes';

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
</script>

<template>
  <div class="codes">
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
