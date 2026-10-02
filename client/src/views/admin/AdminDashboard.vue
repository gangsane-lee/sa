<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  DxChart, DxSeries, DxCommonSeriesSettings, DxArgumentAxis, DxValueAxis, DxLegend, DxTooltip, DxLabel,
} from 'devextreme-vue/chart';
import notify from 'devextreme/ui/notify';
import { adminApi } from '@/stores/session';
import { DIVISIONS, GENDERS, textOf } from '@/constants/codes';
import { fmtDate } from '@/utils/format';
import { VIZ_THEME, SERIES } from '@/utils/vizTheme';
import StatusBadge from '@/components/StatusBadge.vue';

const router = useRouter();
const s = ref(null);

onMounted(async () => {
  try {
    s.value = await adminApi.stats();
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  }
});

const divisionRows = computed(() => (s.value?.byDivision ?? []).map((d) => ({ ...d, total: d.male + d.female })));
const tooltipText = (info) => ({ text: `${info.argumentText} · ${info.seriesName} ${info.valueText}명` });
const statusTooltip = (info) => ({ text: `${info.argumentText} ${info.valueText}명` });

const openApplicant = (id) => router.push({ name: 'admin-applicants', query: { open: id } });
</script>

<template>
  <div v-if="s" class="dash">
    <div class="kpis">
      <div class="kpi">
        <span class="kpi__label">전체 신청자</span>
        <b class="kpi__value">{{ s.total }}</b>
        <span class="kpi__sub">남성 {{ s.male }} · 여성 {{ s.female }}</span>
      </div>
      <div class="kpi">
        <span class="kpi__label">이번 주 새 신청</span>
        <b class="kpi__value">{{ s.weekNew }}</b>
        <span class="kpi__sub">최근 7일</span>
      </div>
      <div class="kpi">
        <span class="kpi__label">답을 기다리는 제안</span>
        <b class="kpi__value">{{ s.proposing }}</b>
        <span class="kpi__sub">매칭 제안 후 수락 대기</span>
      </div>
      <div class="kpi kpi--accent">
        <span class="kpi__label">이어진 인연</span>
        <b class="kpi__value">{{ s.couples }}</b>
        <span class="kpi__sub">양측 수락 + 만남 완료</span>
      </div>
    </div>

    <div class="row">
      <section class="panel">
        <header class="panel__head">
          <h2>사업부별 신청자</h2>
          <p>성비가 한쪽으로 기울면 매칭이 어려워져요.</p>
        </header>
        <DxChart :data-source="divisionRows" :rotated="true" :theme="VIZ_THEME" :height="230">
          <DxCommonSeriesSettings argument-field="division" type="stackedBar" :bar-padding="0.5" :corner-radius="3" />
          <DxSeries value-field="male" name="남성" :color="SERIES.male" />
          <DxSeries value-field="female" name="여성" :color="SERIES.female" />
          <DxArgumentAxis :inverted="true" />
          <DxValueAxis :allow-decimals="false" />
          <DxLegend vertical-alignment="top" horizontal-alignment="right" item-text-position="right" />
          <DxTooltip :enabled="true" :customize-tooltip="tooltipText" />
        </DxChart>
        <table class="mini-table">
          <caption class="visually-hidden">사업부별 성별 신청자 수</caption>
          <thead>
            <tr>
              <th scope="col">사업부</th>
              <th scope="col">남성</th>
              <th scope="col">여성</th>
              <th scope="col">합계</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in divisionRows" :key="d.division">
              <th scope="row">{{ d.division }}</th>
              <td>{{ d.male }}</td>
              <td>{{ d.female }}</td>
              <td><b>{{ d.total }}</b></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="panel">
        <header class="panel__head">
          <h2>진행 상태</h2>
          <p>접수에서 매칭 완료까지 흐름 순서예요.</p>
        </header>
        <DxChart :data-source="s.byStatus" :rotated="true" :theme="VIZ_THEME" :height="260">
          <DxSeries argument-field="text" value-field="count" type="bar" :color="SERIES.single" :bar-padding="0.45" :corner-radius="3">
            <DxLabel :visible="true" background-color="transparent" :font="{ color: '#1B1B24', weight: 600 }" />
          </DxSeries>
          <DxArgumentAxis :inverted="true" />
          <DxValueAxis :allow-decimals="false" />
          <DxLegend :visible="false" />
          <DxTooltip :enabled="true" :customize-tooltip="statusTooltip" />
        </DxChart>
      </section>
    </div>

    <section class="panel">
      <header class="panel__head">
        <h2>최근 신청</h2>
        <p>이름은 가려서 보여줘요. 누르면 상세 정보를 열어요(열람 기록이 남아요).</p>
      </header>
      <ul class="recent">
        <li v-for="r in s.recent" :key="r.id">
          <button type="button" class="recent__row" @click="openApplicant(r.id)">
            <span class="recent__name">{{ r.name }}</span>
            <span class="recent__meta">{{ textOf(GENDERS, r.gender) }} · {{ r.age }}세 · {{ textOf(DIVISIONS, r.division) }}</span>
            <StatusBadge :status="r.status" />
            <span class="recent__date mono">{{ fmtDate(r.createdAt) }}</span>
          </button>
        </li>
      </ul>
    </section>
  </div>
  <div v-else class="dash dash--loading" aria-busy="true" />
</template>

<style scoped>
.dash {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.dash--loading {
  min-height: 60vh;
}

.kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.kpi {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 18px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
}
.kpi__label {
  font-size: 13px;
  color: var(--c-mute);
}
.kpi__value {
  font-size: 32px;
  font-weight: 600;
  line-height: 1.15;
  color: var(--c-ink);
  font-variant-numeric: proportional-nums;
}
.kpi__sub {
  font-size: 12.5px;
  color: var(--c-mute);
}
.kpi--accent {
  border-color: var(--c-blush);
  box-shadow: inset 0 3px 0 var(--c-crimson);
}
.kpi--accent .kpi__value {
  font-size: 48px;
  color: var(--c-crimson-deep);
  line-height: 1;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}
.panel {
  padding: 18px 20px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
  min-width: 0;
}
.panel__head {
  margin-bottom: 10px;
}
.panel__head h2 {
  font-size: 16px;
}
.panel__head p {
  margin-top: 2px;
  color: var(--c-mute);
  font-size: 13px;
}

.mini-table {
  width: 100%;
  margin-top: 12px;
  border-collapse: collapse;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.mini-table th,
.mini-table td {
  padding: 6px 8px;
  border-top: 1px solid var(--c-line);
  text-align: right;
}
.mini-table th:first-child {
  text-align: left;
  font-weight: 500;
}
.mini-table thead th {
  border-top: 0;
  color: var(--c-mute);
  font-weight: 500;
}

.recent {
  list-style: none;
  margin: 0;
  padding: 0;
}
.recent li + li {
  border-top: 1px solid var(--c-line);
}
.recent__row {
  width: 100%;
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr) auto 96px;
  align-items: center;
  gap: 12px;
  padding: 10px 6px;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: var(--r-sm);
}
.recent__row:hover {
  background: var(--c-paper);
}
.recent__name {
  font-weight: 600;
}
.recent__meta {
  color: var(--c-ink-2);
  font-size: 14px;
}
.recent__date {
  color: var(--c-mute);
  font-size: 12.5px;
  text-align: right;
}

@media (max-width: 1100px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .row {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 560px) {
  .recent__row {
    grid-template-columns: 70px minmax(0, 1fr) auto;
  }
  .recent__date {
    display: none;
  }
}
</style>
