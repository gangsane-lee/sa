<script setup>
/**
 * 매칭 관리
 *  ① 매칭 대기자 고르기 → ② 추천 후보(점수·이유) 확인 → ③ 매칭 제안
 *  아래 매칭 내역에서 진행 상태(제안됨 → 양측 수락 → 만남 완료 / 불발)를 바꾼다.
 */
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { DxList } from 'devextreme-vue/list';
import {
  DxDataGrid, DxColumn, DxLookup, DxEditing, DxPaging, DxButton as DxGridButton, DxSorting,
} from 'devextreme-vue/data-grid';
import CustomStore from 'devextreme/data/custom_store';
import notify from 'devextreme/ui/notify';
// 셀 편집기(상태: 선택 상자, 메모: 텍스트 상자) 등록
import 'devextreme/ui/select_box';
import 'devextreme/ui/text_box';
import { confirm } from 'devextreme/ui/dialog';
import { adminApi } from '@/stores/session';
import {
  GENDERS, DIVISIONS, WORK_SITES, WORK_PATTERNS, MATCH_STATUS, AVOID_SCOPES, PREF_SMOKING, textOf,
} from '@/constants/codes';
import { fmtDate } from '@/utils/format';
import StatusBadge from '@/components/StatusBadge.vue';

const route = useRoute();
const applicants = ref([]);
const target = ref(null);
const candidates = ref([]);
const loadingCands = ref(false);
const matchGrid = ref();

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const queue = computed(() => applicants.value.filter((a) => a.status === 'RECEIVED' || a.status === 'REVIEWING'));
const selectedKeys = computed(() => (target.value ? [target.value.id] : []));

async function loadApplicants() {
  applicants.value = await adminApi.listApplicants();
}

async function selectTarget(id) {
  loadingCands.value = true;
  try {
    const [t, c] = await Promise.all([adminApi.getApplicant(id), adminApi.getCandidates(id)]);
    target.value = t;
    candidates.value = c;
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  } finally {
    loadingCands.value = false;
  }
}

function onQueueSelect(e) {
  const item = e.addedItems?.[0];
  if (item && item.id !== target.value?.id) selectTarget(item.id);
}

onMounted(async () => {
  try {
    await loadApplicants();
    const focus = Number(route.query.focus);
    if (focus) selectTarget(focus);
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  }
});

async function propose(c) {
  const ok = await confirm(
    `<b>${esc(target.value.name)}</b>님과 <b>${esc(c.name)}</b>님에게 매칭을 제안할까요?<br>두 분의 상태가 '매칭 중'으로 바뀌어요.`,
    '매칭 제안',
  );
  if (!ok) return;
  try {
    await adminApi.createMatch(target.value.id, c.id);
    notify({ message: `${target.value.name}님 ↔ ${c.name}님 매칭을 제안했어요.`, type: 'success', displayTime: 2500 });
    target.value = null;
    candidates.value = [];
    await loadApplicants();
    matchGrid.value?.instance.refresh();
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  }
}

const matchStore = new CustomStore({
  key: 'id',
  load: () => adminApi.listMatches(),
  update: (key, values) => adminApi.updateMatch(key, values),
  remove: (key) => adminApi.deleteMatch(key),
});

const personText = (name, age, division) =>
  name === '(삭제됨)' ? name : `${name} · ${age}세 · ${textOf(DIVISIONS, division)}`;

async function onMatchSaved() {
  await loadApplicants();
  if (target.value) selectTarget(target.value.id);
}

const scoreColor = (s) => (s >= 70 ? 'var(--c-crimson)' : s >= 45 ? '#D9677E' : '#C9C7D8');
</script>

<template>
  <div class="matching">
    <div class="top">
      <section class="panel queue">
        <header class="panel__head">
          <h2>매칭 대기</h2>
          <p>접수·검토 중이고 진행 중인 매칭이 없는 분들이에요.</p>
        </header>
        <DxList
          :data-source="queue"
          key-expr="id"
          :search-enabled="true"
          search-expr="name"
          :search-editor-options="{ placeholder: '이름 검색' }"
          selection-mode="single"
          :selected-item-keys="selectedKeys"
          :height="520"
          no-data-text="매칭을 기다리는 신청자가 없어요."
          item-template="queueItem"
          @selection-changed="onQueueSelect"
        >
          <template #queueItem="{ data }">
            <div class="q">
              <div class="q__main">
                <b>{{ data.name }}</b>
                <span>{{ textOf(GENDERS, data.gender) }} · {{ data.age }}세 · {{ data.careerLevel }}</span>
              </div>
              <div class="q__sub">
                {{ textOf(DIVISIONS, data.division) }} · {{ textOf(WORK_SITES, data.workSite) }}
              </div>
              <StatusBadge :status="data.status" />
            </div>
          </template>
        </DxList>
      </section>

      <section class="panel cands" :aria-busy="loadingCands">
        <template v-if="target">
          <header class="panel__head">
            <h2>{{ target.name }}님과 어울리는 분</h2>
            <p class="prefs">
              <span class="chip">선호 {{ target.prefAgeMin }}~{{ target.prefAgeMax }}세</span>
              <span class="chip">{{ textOf(AVOID_SCOPES, target.avoidScope) }}</span>
              <span class="chip">상대 흡연: {{ textOf(PREF_SMOKING, target.prefSmoking) }}</span>
              <span class="chip">{{ textOf(WORK_SITES, target.workSite) }} · {{ textOf(WORK_PATTERNS, target.workPattern) }}</span>
              <span v-for="k in target.prefKeywords" :key="k" class="chip">{{ k }}</span>
            </p>
          </header>
          <DxDataGrid
            class="sa-grid"
            :data-source="candidates"
            key-expr="id"
            :show-borders="false"
            :column-auto-width="true"
            :hover-state-enabled="true"
            :word-wrap-enabled="true"
            no-data-text="조건에 맞는 후보가 없어요. 선호 나이·제외 범위를 확인해 보세요."
          >
            <DxSorting mode="none" />
            <DxPaging :page-size="8" />
            <DxColumn data-field="score" caption="점수" cell-template="scoreCell" :width="120" />
            <DxColumn data-field="name" caption="이름" :width="80" />
            <DxColumn caption="정보" cell-template="infoCell" :min-width="170" />
            <DxColumn data-field="reasons" caption="추천 이유" cell-template="reasonCell" :min-width="220" />
            <DxColumn type="buttons" :width="96">
              <DxGridButton text="매칭 제안" :on-click="(e) => propose(e.row.data)" />
            </DxColumn>

            <template #scoreCell="{ data }">
              <div class="score">
                <span class="score__bar"><span :style="{ width: `${data.value}%`, background: scoreColor(data.value) }" /></span>
                <b>{{ data.value }}</b>
              </div>
            </template>
            <template #infoCell="{ data }">
              <span class="info">
                {{ data.data.age }}세 · {{ data.data.careerLevel }} · {{ textOf(DIVISIONS, data.data.division) }}<br />
                <small>{{ data.data.dept }} · {{ textOf(WORK_SITES, data.data.workSite) }}</small>
              </span>
            </template>
            <template #reasonCell="{ data }">
              <span class="reasons">
                <span v-for="r in data.value" :key="r" class="chip">{{ r }}</span>
              </span>
            </template>
          </DxDataGrid>
        </template>
        <div v-else class="empty">
          <p class="empty__title">왼쪽에서 신청자를 골라주세요</p>
          <p>서로의 선호 나이, 매칭 제외 범위, 흡연 선호를 지키는 분만 추천하고 취미·근무지·근무 형태가 맞을수록 점수가 높아요.</p>
        </div>
      </section>
    </div>

    <section class="panel">
      <header class="panel__head">
        <h2>매칭 내역</h2>
        <p>상태 칸을 누르면 바로 바꿀 수 있어요. 상태를 바꾸면 두 분의 신청 상태도 함께 바뀌어요.</p>
      </header>
      <DxDataGrid
        ref="matchGrid"
        class="sa-grid"
        :data-source="matchStore"
        :show-borders="false"
        :column-auto-width="true"
        :hover-state-enabled="true"
        no-data-text="아직 매칭 내역이 없어요."
        @saved="onMatchSaved"
      >
        <DxEditing
          mode="cell"
          :allow-updating="true"
          :allow-deleting="true"
          :use-icons="true"
          :confirm-delete="true"
        />
        <DxPaging :page-size="10" />
        <DxColumn data-field="id" caption="#" :width="56" :allow-editing="false" sort-order="desc" css-class="mono-cell" />
        <DxColumn caption="신청자 A" :allow-editing="false" :calculate-cell-value="(r) => personText(r.aName, r.aAge, r.aDivision)" />
        <DxColumn caption="신청자 B" :allow-editing="false" :calculate-cell-value="(r) => personText(r.bName, r.bAge, r.bDivision)" />
        <DxColumn data-field="score" caption="점수" :width="70" :allow-editing="false" />
        <DxColumn data-field="status" caption="상태" :width="130" cell-template="matchStatusCell">
          <DxLookup :data-source="MATCH_STATUS" value-expr="value" display-expr="text" />
        </DxColumn>
        <DxColumn data-field="memo" caption="메모" />
        <DxColumn
          data-field="createdAt"
          caption="제안일"
          :allow-editing="false"
          :width="100"
          :calculate-display-value="(r) => fmtDate(r.createdAt)"
        />
        <DxColumn data-field="createdBy" caption="담당" :width="80" :allow-editing="false" />
        <DxColumn type="buttons" :width="56">
          <DxGridButton name="delete" hint="매칭 삭제" />
        </DxColumn>

        <template #matchStatusCell="{ data }">
          <StatusBadge :status="data.value" kind="match" />
        </template>
      </DxDataGrid>
    </section>
  </div>
</template>

<style scoped>
.matching {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.top {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 16px;
}
.panel {
  padding: 16px 18px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
  min-width: 0;
}
.panel__head {
  margin-bottom: 12px;
}
.panel__head h2 {
  font-size: 16px;
}
.panel__head > p {
  margin-top: 4px;
  color: var(--c-mute);
  font-size: 13px;
}
.prefs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.q {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  white-space: normal;
}
.q__main {
  display: flex;
  gap: 8px;
  align-items: baseline;
}
.q__main span {
  color: var(--c-ink-2);
  font-size: 13px;
}
.q__sub {
  color: var(--c-mute);
  font-size: 12.5px;
  margin-bottom: 2px;
}

.score {
  display: flex;
  align-items: center;
  gap: 8px;
}
.score__bar {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: #efeef4;
  overflow: hidden;
}
.score__bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
}
.info small {
  color: var(--c-mute);
}
.reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.empty {
  display: grid;
  place-content: center;
  gap: 8px;
  min-height: 420px;
  max-width: 440px;
  margin: 0 auto;
  text-align: center;
  color: var(--c-mute);
  font-size: 14px;
}
.empty__title {
  color: var(--c-indigo);
  font-size: 17px;
  font-weight: 600;
}

@media (max-width: 1000px) {
  .top {
    grid-template-columns: 1fr;
  }
}
</style>
