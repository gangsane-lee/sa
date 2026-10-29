<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  DxDataGrid, DxColumn, DxLookup, DxSelection, DxSearchPanel, DxHeaderFilter, DxPaging, DxPager,
  DxExport, DxColumnChooser, DxToolbar, DxItem, DxButton as DxGridButton, DxLoadPanel,
} from 'devextreme-vue/data-grid';
import { DxSelectBox } from 'devextreme-vue/select-box';
import { DxDropDownButton } from 'devextreme-vue/drop-down-button';
import CustomStore from 'devextreme/data/custom_store';
import { exportDataGrid } from 'devextreme/excel_exporter';
import { Workbook } from 'exceljs';
import { saveAs } from 'file-saver';
import notify from 'devextreme/ui/notify';
import { confirm } from 'devextreme/ui/dialog';
import 'devextreme/ui/button'; // 툴바의 widget: 'dxButton'
import { adminApi } from '@/stores/session';
import { APPLY_STATUS, MANUAL_APPLY_STATUS, GENDERS, USER_STATUS, SERIOUSNESS, MATCH_STATE } from '@shared/constants/codes';
import { allItems } from '@/stores/codes';
import ApplicantDetailPopup from '@/components/ApplicantDetailPopup.vue';

const route = useRoute();
const router = useRouter();
const gridRef = ref();
const statusFilter = ref(null);
/** 매칭 여부 분류 — 매칭 없음 · 승인 대기 · 매칭 중 · 커플 (주소 ?match=PENDING 으로도 열 수 있다) */
const matchFilter = ref(null);
const selectedKeys = ref([]);
const detail = reactive({ visible: false, id: null, edit: false });

const STATUS_FILTER_ITEMS = [{ value: null, text: '전체 상태' }, ...APPLY_STATUS];
const MATCH_FILTER_ITEMS = [{ value: null, text: '전체' }, ...MATCH_STATE];
/** 일괄 변경은 직접 지정할 수 있는 상태만 (매칭 중·완료·커플은 매칭 상태에서 정해진다) */
const MANUAL_STATUS_ITEMS = APPLY_STATUS.filter((s) => MANUAL_APPLY_STATUS.includes(s.value));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const store = new CustomStore({
  key: 'id',
  load: () => adminApi.listApplicants(),
});

const grid = () => gridRef.value?.instance;
const refresh = () => grid()?.refresh();

function open(id, edit = false) {
  Object.assign(detail, { visible: true, id, edit });
}

onMounted(() => {
  if (MATCH_STATE.some((x) => x.value === route.query.match)) applyMatchFilter(route.query.match);
  const id = Number(route.query.open);
  if (id) {
    open(id);
    router.replace({ query: {} });
  }
});

function applyMatchFilter(value) {
  matchFilter.value = value;
  grid()?.columnOption('matchState', 'filterValue', value ?? undefined);
}

function applyStatusFilter(e) {
  statusFilter.value = e.value;
  grid()?.columnOption('status', 'filterValue', e.value ?? undefined);
}

async function bulkChange(e) {
  const status = e.itemData;
  const ok = await confirm(
    `선택한 <b>${selectedKeys.value.length}명</b>의 상태를 '<b>${esc(status.text)}</b>'(으)로 바꿀까요?`,
    '상태 변경',
  );
  if (!ok) return;
  try {
    await adminApi.changeStatus(selectedKeys.value, status.value);
    notify({ message: `${selectedKeys.value.length}명의 상태를 '${status.text}'(으)로 바꿨어요.`, type: 'success', displayTime: 2200 });
    grid()?.clearSelection();
    refresh();
  } catch (err) {
    notify({ message: err.message, type: 'error', displayTime: 3500 });
  }
}

async function remove(row) {
  const ok = await confirm(
    `<b>${esc(row.name)}</b>님의 신청서와 매칭 내역을 완전히 삭제할까요?<br>삭제하면 되돌릴 수 없어요.`,
    '신청자 삭제',
  );
  if (!ok) return;
  try {
    await adminApi.deleteApplicant(row.id);
    notify({ message: '신청자를 삭제했어요.', type: 'success', displayTime: 2000 });
    refresh();
  } catch (err) {
    notify({ message: err.message, type: 'error', displayTime: 3500 });
  }
}

/** 엑셀 내려받기: 확인 → 파일 생성 → 내려받은 기록 남기기 */
async function onExporting(e) {
  e.cancel = true;
  const selectedOnly = e.selectedRowsOnly;
  const count = selectedOnly ? selectedKeys.value.length : e.component.totalCount();
  const ok = await confirm(
    `${count}명의 정보를 엑셀로 내려받을까요?<br><b>이름이 그대로 포함돼요.</b> 내려받은 기록이 남고, 파일은 사내 보안 기준에 따라 보관해 주세요.`,
    '엑셀 내려받기',
  );
  if (!ok) return;

  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet('신청자');
  await exportDataGrid({ component: e.component, worksheet, autoFilterEnabled: true, selectedRowsOnly: selectedOnly });
  const buffer = await workbook.xlsx.writeBuffer();
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  saveAs(new Blob([buffer], { type: 'application/octet-stream' }), `사연_신청자_${stamp}.xlsx`);
  await adminApi.recordExport(count);
}

function goMatch(id) {
  router.push({ name: 'admin-matching', query: { focus: id } });
}
</script>

<template>
  <div class="page">
    <DxDataGrid
      ref="gridRef"
      class="sa-grid"
      :data-source="store"
      :show-borders="false"
      :row-alternation-enabled="false"
      :hover-state-enabled="true"
      :column-auto-width="true"
      :allow-column-reordering="true"
      :word-wrap-enabled="false"
      :column-hiding-enabled="true"
      no-data-text="조건에 맞는 신청자가 없어요."
      @row-dbl-click="(e) => open(e.data.id)"
      @selection-changed="(e) => (selectedKeys = e.selectedRowKeys)"
      @exporting="onExporting"
    >
      <DxLoadPanel :enabled="true" text="불러오는 중" />
      <DxSelection mode="multiple" show-check-boxes-mode="always" />
      <DxSearchPanel :visible="true" :width="220" placeholder="이름·팀 검색" />
      <DxHeaderFilter :visible="true" />
      <DxPaging :page-size="15" />
      <DxPager :visible="true" :show-page-size-selector="true" :allowed-page-sizes="[15, 30, 50]" :show-info="true" info-text="{2}명 · {0}/{1}쪽" />
      <DxExport :enabled="true" :formats="['xlsx']" :allow-export-selected-data="true" />
      <DxColumnChooser :enabled="true" mode="select" title="표시할 열" />

      <DxToolbar>
        <DxItem location="before" template="matchFilterTpl" />
        <DxItem location="before" template="statusFilterTpl" />
        <DxItem location="after" template="bulkTpl" />
        <DxItem name="exportButton" />
        <DxItem name="columnChooserButton" />
        <DxItem location="after" widget="dxButton" :options="{ icon: 'refresh', hint: '새로고침', onClick: refresh }" />
        <DxItem name="searchPanel" />
      </DxToolbar>

      <DxColumn data-field="status" caption="상태" cell-template="statusCell" :width="104">
        <DxLookup :data-source="APPLY_STATUS" value-expr="value" display-expr="text" />
      </DxColumn>
      <DxColumn data-field="matchState" caption="매칭 여부" cell-template="matchStateCell" :width="96">
        <DxLookup :data-source="MATCH_STATE" value-expr="value" display-expr="text" />
      </DxColumn>
      <DxColumn data-field="name" caption="이름" />
      <DxColumn data-field="nickname" caption="닉네임" />
      <DxColumn data-field="serious" caption="진지한 만남" :width="96" :visible="false">
        <DxLookup :data-source="SERIOUSNESS" value-expr="value" display-expr="short" />
      </DxColumn>
      <DxColumn data-field="empNo" caption="사번" css-class="mono-cell" :visible="false" />
      <DxColumn data-field="gender" caption="성별" :width="70">
        <DxLookup :data-source="GENDERS" value-expr="value" display-expr="text" />
      </DxColumn>
      <DxColumn data-field="age" caption="나이" data-type="number" :width="70" alignment="left" />
      <DxColumn data-field="division" caption="사업부">
        <DxLookup :data-source="allItems('DIVISION')" value-expr="value" display-expr="text" />
      </DxColumn>
      <DxColumn data-field="team" caption="팀" />
      <DxColumn data-field="campus" caption="캠퍼스">
        <DxLookup :data-source="allItems('CAMPUS')" value-expr="value" display-expr="text" />
      </DxColumn>
      <DxColumn data-field="building" caption="건물" :visible="false" />
      <DxColumn data-field="mbti" caption="MBTI" :width="76" />
      <DxColumn data-field="face" caption="얼굴상" :visible="false">
        <DxLookup :data-source="allItems('FACE')" value-expr="value" display-expr="text" />
      </DxColumn>
      <DxColumn data-field="looks" caption="외모" :width="64" :visible="false">
        <DxLookup :data-source="allItems('LOOKS')" value-expr="value" display-expr="text" />
      </DxColumn>
      <DxColumn data-field="heightBand" caption="키" :visible="false">
        <DxLookup :data-source="allItems('HEIGHT')" value-expr="value" display-expr="text" />
      </DxColumn>
      <DxColumn data-field="heartsIn" caption="받은 하트" data-type="number" :width="84" />
      <DxColumn data-field="dislikes" caption="싫어요" data-type="number" :width="76" cell-template="dislikeCell" />
      <DxColumn data-field="heartsOut" caption="보낸 하트" data-type="number" :width="84" :visible="false" />
      <DxColumn data-field="userStatus" caption="본인 화면 상태" :visible="false">
        <DxLookup :data-source="USER_STATUS" value-expr="value" display-expr="text" />
      </DxColumn>
      <DxColumn data-field="createdAt" caption="신청일" data-type="date" format="yyyy.MM.dd" sort-order="desc" />
      <DxColumn data-field="hasMemo" caption="메모" data-type="boolean" :width="70" :visible="false" />
      <DxColumn type="buttons" :width="112" caption="관리">
        <DxGridButton hint="상세 보기" icon="search" :on-click="(e) => open(e.row.data.id)" />
        <DxGridButton hint="수정" icon="edit" :on-click="(e) => open(e.row.data.id, true)" />
        <DxGridButton hint="삭제" icon="trash" :on-click="(e) => remove(e.row.data)" />
      </DxColumn>

      <template #dislikeCell="{ data }">
        <span :class="{ 'dislike--out': data.data.sanctioned }" :title="data.data.sanctioned ? '싫어요 기준 이상 — 매칭 제외 중' : ''">
          {{ data.value }}{{ data.data.sanctioned ? ' · 제외' : '' }}
        </span>
      </template>
      <template #statusCell="{ data }">
        <span class="badge" :class="`badge--${data.value}`">{{ data.text }}</span>
      </template>
      <template #matchStateCell="{ data }">
        <span class="ms" :class="`ms--${data.value}`">{{ data.text }}</span>
      </template>
      <template #matchFilterTpl>
        <div class="seg" role="group" aria-label="매칭 여부">
          <button
            v-for="it in MATCH_FILTER_ITEMS"
            :key="it.value ?? 'ALL'"
            type="button"
            class="seg__btn"
            :class="{ 'is-on': matchFilter === it.value }"
            @click="applyMatchFilter(it.value)"
          >
            {{ it.text }}
          </button>
        </div>
      </template>
      <template #statusFilterTpl>
        <DxSelectBox
          :items="STATUS_FILTER_ITEMS"
          :value="statusFilter"
          value-expr="value"
          display-expr="text"
          :width="132"
          :input-attr="{ 'aria-label': '상태 필터' }"
          @value-changed="applyStatusFilter"
        />
      </template>
      <template #bulkTpl>
        <DxDropDownButton
          text="선택 항목 상태 변경"
          icon="tags"
          :items="MANUAL_STATUS_ITEMS"
          key-expr="value"
          display-expr="text"
          :disabled="!selectedKeys.length"
          :drop-down-options="{ width: 160 }"
          @item-click="bulkChange"
        />
      </template>
    </DxDataGrid>

    <p class="hint">행을 두 번 누르면 상세 정보가 열려요. 상세 열람·수정·삭제·내려받기는 모두 열람 기록에 남아요.</p>

    <ApplicantDetailPopup
      v-model:visible="detail.visible"
      :applicant-id="detail.id"
      :start-in-edit="detail.edit"
      @saved="refresh"
      @deleted="refresh"
      @find-match="goMatch"
    />
  </div>
</template>

<style scoped>
.page {
  padding: 14px 16px 10px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
}
.seg {
  display: flex;
  border: 1px solid var(--c-line-strong);
  border-radius: 8px;
  overflow: hidden;
}
.seg__btn {
  padding: 6px 12px;
  border: 0;
  border-left: 1px solid var(--c-line);
  background: var(--c-surface);
  color: var(--c-ink-2);
  font-size: 13px;
  cursor: pointer;
}
.seg__btn:first-child {
  border-left: 0;
}
.seg__btn.is-on {
  background: var(--c-indigo);
  color: var(--c-on-indigo);
}
.ms {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--c-paper);
  color: var(--c-mute);
  font-size: 12px;
}
.ms--PENDING {
  background: var(--c-blush-soft);
  color: var(--c-crimson-deep);
  font-weight: 700;
}
.ms--MATCHING {
  background: #e7ecff;
  color: var(--c-indigo);
}
.ms--COUPLED {
  background: var(--c-ok-bg);
  color: var(--c-ok);
}
.dislike--out {
  color: var(--c-crimson-deep);
  font-weight: 700;
}
.hint {
  margin-top: 10px;
  color: var(--c-mute);
  font-size: 12.5px;
}
</style>
