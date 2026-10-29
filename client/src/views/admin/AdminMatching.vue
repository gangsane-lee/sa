<script setup>
/**
 * 매칭 관리
 *  ① 매칭 대기자 고르기 → ② 추천 후보(점수·이유) 확인 → ③ 매칭 제안
 *  아래 매칭 내역에서 진행 상태(제안됨 → 양측 수락 → 만남 완료 / 불발)를 바꾼다. 위 분류(승인 대기 · 진행 중 · 커플 · 종료)로 나눠 본다.
 *  하트 맞교환 승인 대기는 '매칭 승인 대기' 화면에서 최종 매칭·반려한다.
 */
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
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
import { GENDERS, MATCH_STATUS, MATCH_SOURCES, MATCH_GROUPS, AVOID_OPTIONS, PREF_ITEMS, AGE_GAP, textOf } from '@shared/constants/codes';
import { ct, cts } from '@/stores/codes';
import { fmtDate } from '@shared/utils/format';
import StatusBadge from '@/components/StatusBadge.vue';

const route = useRoute();
const router = useRouter();
const applicants = ref([]);
const target = ref(null);
const candidates = ref([]);
const loadingCands = ref(false);
const matchGrid = ref();

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 진행 중인 매칭·하트 맞교환 승인 대기가 있는 분은 빼고 (busy)
const queue = computed(() => applicants.value.filter((a) => (a.status === 'RECEIVED' || a.status === 'REVIEWING') && !a.busy));

/** 매칭 내역 분류 — 전체 · 승인 대기 · 진행 중 · 커플 · 종료·반려 */
const group = ref('ALL');
const groupCounts = ref({});
function applyGroup(value) {
  group.value = value;
  const g = MATCH_GROUPS.find((x) => x.value === value);
  matchGrid.value?.instance.columnOption('status', { filterValues: g?.statuses ?? undefined, filterType: 'include' });
}
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
  load: async () => {
    const rows = await adminApi.listMatches();
    groupCounts.value = Object.fromEntries(MATCH_GROUPS.map((g) => [g.value, g.statuses ? rows.filter((r) => g.statuses.includes(r.status)).length : rows.length]));
    return rows;
  },
  update: (key, values) => adminApi.updateMatch(key, values),
  remove: (key) => adminApi.deleteMatch(key),
});

const personText = (name, age, division) =>
  name === '(삭제됨)' ? name : `${name} · ${age}세 · ${ct('DIVISION', division)}`;

/** 대상자의 선호를 칩으로 (우선순위 번호 포함) */
const prefChips = computed(() => {
  const t = target.value;
  if (!t) return [];
  const out = [];
  const rankOf = (v) => {
    const i = (t.priorities ?? []).indexOf(v);
    return i >= 0 ? `${i + 1}순위 ` : '';
  };
  out.push(`${rankOf('AGE')}나이 ${t.prefAgeMin}~${t.prefAgeMax}세`);
  if (t.prefHeightMin) out.push(`${rankOf('HEIGHT')}키 ${ct('HEIGHT', t.prefHeightMin)}~${ct('HEIGHT', t.prefHeightMax)}`);
  for (const p of PREF_ITEMS.filter((x) => x.kind === 'multi')) {
    if (t[p.key]?.length) {
      const texts = p.fixed ? t[p.key].map((v) => textOf(AGE_GAP, v)) : cts(p.group, t[p.key]);
      out.push(`${rankOf(p.value)}${p.text}: ${texts.join('·')}`);
    }
  }
  if (t.avoid?.length) out.push(`피함: ${t.avoid.map((v) => textOf(AVOID_OPTIONS, v)).join('·')}`);
  return out.sort((a, b) => /^\d/.test(b) - /^\d/.test(a) || a.localeCompare(b));
});

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
                <span>{{ textOf(GENDERS, data.gender) }} · {{ data.age }}세 · {{ data.mbti }}</span>
              </div>
              <div class="q__sub">
                {{ ct('DIVISION', data.division) }}{{ data.campus ? ` · ${ct('CAMPUS', data.campus)}` : '' }}
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
              <span v-for="c in prefChips" :key="c" class="chip">{{ c }}</span>
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
            no-data-text="조건에 맞는 후보가 없어요. 선호 나이·피하고 싶은 범위를 확인해 보세요."
          >
            <DxSorting mode="none" />
            <DxPaging :page-size="8" />
            <DxColumn data-field="score" caption="점수" cell-template="scoreCell" :width="150" />
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
              <small class="score__sub">내 선호 {{ data.data.myScore }} · 상대 선호 {{ data.data.theirScore }}</small>
            </template>
            <template #infoCell="{ data }">
              <span class="info">
                {{ data.data.age }}세 · {{ data.data.mbti }} · {{ ct('FACE', data.data.face) }}<br />
                <small>{{ ct('DIVISION', data.data.division) }} {{ data.data.team }}{{ data.data.campus ? ` · ${ct('CAMPUS', data.data.campus)}` : '' }}</small>
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
          <p>성별·피하고 싶은 범위·선호 나이를 지키는 분만 추천해요. 점수는 서로의 선호(우선순위 가중치)가 맞는 정도의 평균이에요.</p>
        </div>
      </section>
    </div>

    <section class="panel">
      <header class="panel__head">
        <h2>매칭 내역</h2>
        <p>상태 칸을 누르면 바로 바꿀 수 있어요. 상태를 바꾸면 두 분의 신청 상태도 함께 바뀌어요. 하트 맞교환 승인 대기는 <RouterLink :to="{ name: 'admin-pending' }">매칭 승인 대기</RouterLink>에서 처리해요.</p>
      </header>
      <div class="groups" role="group" aria-label="매칭 분류">
        <button
          v-for="g in MATCH_GROUPS"
          :key="g.value"
          type="button"
          class="groups__btn"
          :class="{ 'is-on': group === g.value, 'is-alert': g.value === 'PENDING' && groupCounts.PENDING }"
          @click="applyGroup(g.value)"
        >
          {{ g.text }} <b>{{ groupCounts[g.value] ?? 0 }}</b>
        </button>
      </div>
      <DxDataGrid
        ref="matchGrid"
        class="sa-grid"
        :data-source="matchStore"
        :show-borders="false"
        :column-auto-width="true"
        :hover-state-enabled="true"
        no-data-text="아직 매칭 내역이 없어요."
        @saved="onMatchSaved"
        @row-prepared="(e) => e.rowType === 'data' && e.data.status === 'PENDING' && e.rowElement.classList.add('is-pending')"
        @row-dbl-click="(e) => e.data.status === 'PENDING' && router.push({ name: 'admin-pending' })"
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
        <DxColumn data-field="source" caption="경로" :width="100" :allow-editing="false">
          <DxLookup :data-source="MATCH_SOURCES" value-expr="value" display-expr="text" />
        </DxColumn>
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
.groups {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.groups__btn {
  padding: 5px 12px;
  border: 1px solid var(--c-line-strong);
  border-radius: 999px;
  background: var(--c-surface);
  color: var(--c-ink-2);
  font-size: 13px;
  cursor: pointer;
}
.groups__btn b {
  margin-left: 4px;
}
.groups__btn.is-on {
  border-color: var(--c-indigo);
  background: var(--c-indigo);
  color: var(--c-on-indigo);
}
.groups__btn.is-alert:not(.is-on) {
  border-color: var(--c-crimson);
  color: var(--c-crimson-deep);
}
.matching :deep(.is-pending) td {
  background: var(--c-blush-soft);
}
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
.score__sub {
  color: var(--c-mute);
  font-size: 11.5px;
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
