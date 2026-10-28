<script setup>
/**
 * 시스템 개선의 소리 — 관리자만 본다. 상태(접수·검토 중·반영 완료·보류)와 답변 메모는 관리자 화면에만 남는다(작성자 화면에는 목록이 없다).
 * 익명 글은 작성자를 알 수 없고, 실명 글은 이름·팀이 보인다.
 */
import { ref, reactive, computed, onMounted } from 'vue';
import { DxDataGrid, DxColumn, DxLookup, DxPaging, DxPager, DxHeaderFilter, DxSearchPanel, DxSelection } from 'devextreme-vue/data-grid';
import { DxSelectBox } from 'devextreme-vue/select-box';
import { DxTextArea } from 'devextreme-vue/text-area';
import { DxButton } from 'devextreme-vue/button';
import notify from 'devextreme/ui/notify';
import { adminApi } from '@/stores/session';
import { VOC_CATEGORIES, VOC_STATUS, textOf } from '@shared/constants/codes';
import { fmtDateTime } from '@shared/utils/format';

const items = ref([]);
const selId = ref(null);
const edit = reactive({ status: null, reply: '' });
const busy = ref(false);

const sel = computed(() => items.value.find((v) => v.id === selId.value) ?? null);
const counts = computed(() => Object.fromEntries(VOC_STATUS.map((s) => [s.value, items.value.filter((v) => v.status === s.value).length])));

async function load() {
  try {
    items.value = await adminApi.listVocs();
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  }
}
onMounted(load);

function pick(e) {
  const v = e.selectedRowsData?.[0];
  if (!v) return;
  selId.value = v.id;
  Object.assign(edit, { status: v.status, reply: v.reply ?? '' });
}

async function save() {
  busy.value = true;
  try {
    const v = await adminApi.updateVoc(selId.value, { status: edit.status, reply: edit.reply });
    items.value = items.value.map((x) => (x.id === v.id ? v : x));
    notify({ message: '저장했어요.', type: 'success', displayTime: 2200 });
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="page">
    <div class="kpis">
      <div v-for="s in VOC_STATUS" :key="s.value" class="kpi">
        <span>{{ s.text }}</span>
        <b>{{ counts[s.value] ?? 0 }}</b>
      </div>
    </div>

    <div class="cols">
      <section class="panel">
        <DxDataGrid
          class="sa-grid"
          :data-source="items"
          key-expr="id"
          :show-borders="false"
          :column-auto-width="true"
          :column-hiding-enabled="true"
          :hover-state-enabled="true"
          no-data-text="아직 의견이 없어요."
          @selection-changed="pick"
        >
          <DxSelection mode="single" />
          <DxSearchPanel :visible="true" :width="200" placeholder="제목·내용 검색" />
          <DxHeaderFilter :visible="true" />
          <DxPaging :page-size="12" />
          <DxPager :visible="true" :show-info="true" info-text="{2}건 · {0}/{1}쪽" />
          <DxColumn data-field="createdAt" caption="접수일" data-type="date" format="yyyy.MM.dd" sort-order="desc" :width="100" :hiding-priority="1" />
          <DxColumn data-field="category" caption="분류" :width="110" :hiding-priority="2">
            <DxLookup :data-source="VOC_CATEGORIES" value-expr="value" display-expr="text" />
          </DxColumn>
          <DxColumn data-field="title" caption="제목" :min-width="180" />
          <DxColumn data-field="content" caption="내용" :visible="false" />
          <DxColumn data-field="status" caption="상태" :width="96" cell-template="stateCell">
            <DxLookup :data-source="VOC_STATUS" value-expr="value" display-expr="text" />
          </DxColumn>
          <DxColumn caption="작성자" :calculate-cell-value="(r) => (r.anonymous ? '익명' : r.author)" :width="150" :hiding-priority="0" />
          <template #stateCell="{ data }">
            <span class="state" :class="`state--${data.data.status}`">{{ textOf(VOC_STATUS, data.data.status) }}</span>
          </template>
        </DxDataGrid>
      </section>

      <section class="panel detail">
        <template v-if="sel">
          <p class="detail__meta">
            <span class="chip">{{ textOf(VOC_CATEGORIES, sel.category) }}</span>
            <span class="mono">#{{ sel.id }} · {{ fmtDateTime(sel.createdAt) }} · {{ sel.anonymous ? '익명' : sel.author }}</span>
          </p>
          <h2>{{ sel.title }}</h2>
          <p class="detail__body">{{ sel.content }}</p>
          <label class="field">
            <span>처리 상태</span>
            <DxSelectBox v-model:value="edit.status" :items="VOC_STATUS" value-expr="value" display-expr="text" />
          </label>
          <label class="field">
            <span>답변 메모 <small>· 관리자만 봐요 (작성자에게 알리려면 쪽지로)</small></span>
            <DxTextArea v-model:value="edit.reply" :max-length="500" :height="110" placeholder="예: 다음 배포(10월 말)에 반영할게요." />
          </label>
          <DxButton text="저장" type="default" :disabled="busy" @click="save" />
        </template>
        <p v-else class="empty">왼쪽 목록에서 의견을 골라주세요.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: grid;
  gap: 16px;
}
.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}
.kpi {
  display: grid;
  gap: 2px;
  padding: 12px 16px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
}
.kpi span {
  color: var(--c-mute);
  font-size: 13px;
}
.kpi b {
  font-size: 24px;
  color: var(--c-indigo);
}
.cols {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(280px, 1fr);
  gap: 16px;
  align-items: start;
}
.panel {
  padding: 16px 18px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
  min-width: 0;
}
.detail {
  display: grid;
  gap: 12px;
}
.detail__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--c-mute);
  font-size: 12.5px;
}
.detail h2 {
  font-size: 17px;
  color: var(--c-indigo);
}
.detail__body {
  padding: 12px 14px;
  border-radius: var(--r-sm);
  background: var(--c-paper);
  color: var(--c-ink-2);
  white-space: pre-wrap;
}
.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-ink-2);
}
.field small {
  color: var(--c-mute);
  font-weight: 400;
}
.state {
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  background: #e7e8f6;
  color: var(--c-indigo-3);
}
.state--DONE {
  background: var(--c-ok-bg);
  color: var(--c-ok);
}
.state--HOLD {
  background: #ececf0;
  color: #55556a;
}
.state--REVIEWING {
  background: #f6edd6;
  color: var(--c-moon-ink);
}
.empty {
  color: var(--c-mute);
  font-size: 14px;
  padding: 32px 0;
  text-align: center;
}
@media (max-width: 1000px) {
  .cols {
    grid-template-columns: 1fr;
  }
}
</style>
