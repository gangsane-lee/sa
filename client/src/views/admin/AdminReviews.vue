<script setup>
/**
 * 후기·제재 — 매칭 후기(만남 결과·평가·추가 매칭·코멘트), 싫어요 누적(팝업), 블랙리스트(팝업)
 *  - 열 때마다 '후기 열람' 기록이 남는다
 *  - 싫어요가 설정 기준(기본 5회) 이상이면 추천·하트·관리자 추천에서 자동으로 빠진다
 *  - 블랙리스트 사번은 신청 자체를 할 수 없고, 이미 낸 신청서도 매칭에서 빠진다(본인에게는 알리지 않음)
 */
import { ref, onMounted } from 'vue';
import { DxDataGrid, DxColumn, DxLookup, DxPaging, DxPager, DxHeaderFilter, DxSearchPanel } from 'devextreme-vue/data-grid';
import { DxButton } from 'devextreme-vue/button';
import { DxPopup } from 'devextreme-vue/popup';
import { DxSelectBox } from 'devextreme-vue/select-box';
import { DxTextBox } from 'devextreme-vue/text-box';
import CustomStore from 'devextreme/data/custom_store';
import notify from 'devextreme/ui/notify';
import { confirm } from 'devextreme/ui/dialog';
import { adminApi } from '@/stores/session';
import { REVIEW_OUTCOMES, REVIEW_RATINGS } from '@/constants/codes';
import { fmtDateTime } from '@/utils/format';

/** 확인창은 HTML로 그려지므로 인사정보에서 온 이름도 이스케이프한다 */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reviews = ref([]);
const settings = ref(null);
const dislikes = ref([]);
const blacklist = ref([]);
const loading = ref(true);
const dislikePopup = ref(false);
const blackPopup = ref(false);

async function load() {
  loading.value = true;
  try {
    const [r, st, d, b] = await Promise.all([adminApi.listReviews(), adminApi.getSettings(), adminApi.listDislikes(), adminApi.listBlacklist()]);
    reviews.value = r;
    settings.value = st;
    dislikes.value = d;
    blacklist.value = b;
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function reset(t) {
  const ok = await confirm(
    `<b>#${t.id} ${esc(t.name)}</b>님의 싫어요 ${t.dislikes}회를 0으로 되돌릴까요?<br>후기 원문은 그대로 남고, 해제 기록이 남아요.`,
    '제재 해제',
  );
  if (!ok) return;
  try {
    await adminApi.resetDislikes(t.id);
    notify({ message: '제재를 해제했어요. 다시 추천 대상이 돼요.', type: 'success', displayTime: 2200 });
    dislikes.value = await adminApi.listDislikes();
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  }
}

// ── 블랙리스트 ──
const empStore = new CustomStore({
  key: 'empNo',
  load: async (opts) => (opts.searchValue ? adminApi.searchEmployees(opts.searchValue) : []),
  byKey: async (key) => (await adminApi.searchEmployees(key))[0] ?? null,
});
const newEmp = ref(null);
const newReason = ref('');
const adding = ref(false);
const empText = (e) => (e ? `${e.name} · ${e.team} (${e.empNo})${e.applied ? ' · 신청함' : ''}${e.blocked ? ' · 이미 등록' : ''}` : '');

async function addBlack() {
  if (!newEmp.value || !newReason.value.trim()) {
    notify({ message: '임직원과 등록 사유를 모두 입력해 주세요.', type: 'warning', displayTime: 2200 });
    return;
  }
  adding.value = true;
  try {
    await adminApi.addBlacklist(newEmp.value, newReason.value.trim());
    notify({ message: '블랙리스트에 등록했어요. 이제 신청할 수 없어요.', type: 'success', displayTime: 2200 });
    newEmp.value = null;
    newReason.value = '';
    blacklist.value = await adminApi.listBlacklist();
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  } finally {
    adding.value = false;
  }
}
async function removeBlack(b) {
  const ok = await confirm(`<b>${esc(b.name)}</b>(${esc(b.empNo)})님을 블랙리스트에서 뺄까요?<br>다시 신청할 수 있게 되고, 해제 기록이 남아요.`, '블랙리스트 해제');
  if (!ok) return;
  try {
    await adminApi.removeBlacklist(b.empNo);
    notify({ message: '해제했어요.', type: 'success', displayTime: 1800 });
    blacklist.value = await adminApi.listBlacklist();
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  }
}
</script>

<template>
  <div class="page">
    <div class="sum">
      <button type="button" class="sum__card" @click="dislikePopup = true">
        <span class="sum__label">싫어요 누적</span>
        <b class="sum__n">{{ dislikes.length }}<small>명</small></b>
        <span class="sum__sub">매칭 제외 {{ dislikes.filter((d) => d.sanctioned).length }}명 · 기준 {{ settings?.dislikeLimit ?? '-' }}회</span>
        <span class="sum__go">관리하기 →</span>
      </button>
      <button type="button" class="sum__card sum__card--black" @click="blackPopup = true">
        <span class="sum__label">블랙리스트</span>
        <b class="sum__n">{{ blacklist.length }}<small>명</small></b>
        <span class="sum__sub">신청 자체를 막아요</span>
        <span class="sum__go">관리하기 →</span>
      </button>
    </div>

    <section class="panel">
      <header class="panel__head">
        <h2>매칭 후기</h2>
        <p>평가와 코멘트는 담당자만 봐요. 신청자 본인이나 상대에게는 보여주지 않아요.</p>
      </header>
      <DxDataGrid
        class="sa-grid"
        :data-source="reviews"
        key-expr="id"
        :show-borders="false"
        :column-auto-width="true"
        :column-hiding-enabled="true"
        :word-wrap-enabled="true"
        :hover-state-enabled="true"
        no-data-text="아직 후기가 없어요."
      >
        <DxSearchPanel :visible="true" :width="200" placeholder="코멘트 검색" />
        <DxHeaderFilter :visible="true" />
        <DxPaging :page-size="15" />
        <DxPager :visible="true" :show-info="true" info-text="{2}건 · {0}/{1}쪽" />
        <DxColumn data-field="createdAt" caption="작성일" data-type="date" format="yyyy.MM.dd" sort-order="desc" :width="118" :hiding-priority="3" />
        <DxColumn data-field="matchId" caption="매칭" :width="76" cell-template="matchCell" :hiding-priority="1" />
        <DxColumn caption="작성 → 대상" :calculate-cell-value="(r) => `#${r.reviewer.id} ${r.reviewer.name} → #${r.target.id} ${r.target.name}`" :min-width="150" />
        <DxColumn data-field="outcome" caption="만남 결과" :min-width="120">
          <DxLookup :data-source="REVIEW_OUTCOMES" value-expr="value" display-expr="text" />
        </DxColumn>
        <DxColumn data-field="rating" caption="평가" :width="128" cell-template="rateCell">
          <DxLookup :data-source="REVIEW_RATINGS" value-expr="value" display-expr="text" />
        </DxColumn>
        <DxColumn data-field="wantMore" caption="추가 매칭" data-type="boolean" :width="104" :hiding-priority="2" />
        <DxColumn data-field="comment" caption="코멘트" :min-width="200" :hiding-priority="4" />

        <template #matchCell="{ data }"><span class="mono">#{{ data.value }}</span></template>
        <template #rateCell="{ data }">
          <span class="rate" :class="`rate--${data.data.rating}`">{{ data.data.rating === 'LIKE' ? '👍 좋았어요' : '👎 별로였어요' }}</span>
        </template>
      </DxDataGrid>
    </section>
    <DxPopup v-model:visible="dislikePopup" title="싫어요 누적 관리" :width="760" max-width="calc(100vw - 24px)" :height="620" max-height="90vh" :show-close-button="true" :wrapper-attr="{ class: 'sa-popup' }">
      <div class="pp">
        <p class="pp__desc" v-if="settings">
          싫어요 <b>{{ settings.dislikeLimit }}회 이상</b>이면 매칭에서 자동 제외돼요.
          {{ settings.noShowCountsAsDislike ? '노쇼 신고도 1회로 세요.' : '노쇼 신고는 따로 세지 않아요.' }}
          본인에게는 알리지 않아요. 기준은 설정에서 바꿀 수 있어요.
        </p>
        <DxDataGrid class="sa-grid" :data-source="dislikes" key-expr="id" :show-borders="false" :column-auto-width="true" :height="460" no-data-text="싫어요를 받은 신청자가 없어요.">
          <DxSearchPanel :visible="true" :width="200" placeholder="이름·닉네임 검색" />
          <DxPaging :page-size="10" />
          <DxPager :visible="true" :show-info="true" info-text="{2}명 · {0}/{1}쪽" />
          <DxColumn data-field="id" caption="번호" :width="70" cell-template="idCell" />
          <DxColumn data-field="name" caption="이름" />
          <DxColumn data-field="nickname" caption="닉네임" />
          <DxColumn data-field="team" caption="팀" :hiding-priority="1" />
          <DxColumn data-field="dislikes" caption="싫어요" :width="150" sort-order="desc" cell-template="barCell" />
          <DxColumn data-field="sanctioned" caption="상태" :width="104" cell-template="stCell" />
          <DxColumn caption="" :width="72" cell-template="actCell" />
          <template #idCell="{ data }"><span class="mono">#{{ data.value }}</span></template>
          <template #barCell="{ data }">
            <span class="bar"><span :style="{ width: `${Math.min(100, (data.value / (settings?.dislikeLimit || 5)) * 100)}%` }" /></span>
            <span class="mono bar__n">{{ data.value }} / {{ settings?.dislikeLimit }}</span>
          </template>
          <template #stCell="{ data }"><span v-if="data.value" class="tag">매칭 제외 중</span><span v-else class="muted">주의</span></template>
          <template #actCell="{ data }"><DxButton text="해제" styling-mode="text" @click="reset(data.data)" /></template>
        </DxDataGrid>
      </div>
    </DxPopup>

    <DxPopup v-model:visible="blackPopup" title="블랙리스트" :width="820" max-width="calc(100vw - 24px)" :height="640" max-height="90vh" :show-close-button="true" :wrapper-attr="{ class: 'sa-popup' }">
      <div class="pp">
        <p class="pp__desc">등록된 사번은 <b>신청서·사주 하트를 낼 수 없어요.</b> 이미 낸 신청서는 추천·하트에서 빠지고, 진행 중인 하트는 정리돼요. 본인에게는 '신청할 수 없는 계정'이라고만 보여요.</p>
        <form class="add" @submit.prevent="addBlack">
          <DxSelectBox
            v-model:value="newEmp"
            :data-source="empStore"
            value-expr="empNo"
            :display-expr="empText"
            :search-enabled="true"
            search-mode="contains"
            :min-search-length="1"
            :search-timeout="250"
            :show-data-before-search="false"
            placeholder="이름·사번·팀으로 임직원 찾기"
            no-data-text="검색 결과가 없어요"
            class="add__emp"
          />
          <DxTextBox v-model:value="newReason" placeholder="등록 사유 (필수, 기록에 남아요)" :max-length="200" class="add__why" />
          <DxButton text="등록" type="danger" :disabled="adding" @click="addBlack" />
        </form>
        <DxDataGrid class="sa-grid" :data-source="blacklist" key-expr="empNo" :show-borders="false" :column-hiding-enabled="false" :word-wrap-enabled="true" :height="400" no-data-text="등록된 사람이 없어요.">
          <DxSearchPanel :visible="true" :width="200" placeholder="검색" />
          <DxPaging :page-size="10" />
          <DxColumn data-field="name" caption="이름" :width="90" />
          <DxColumn data-field="empNo" caption="사번" :width="100" cell-template="monoCell" />
          <DxColumn data-field="team" caption="팀" :width="120" />
          <DxColumn data-field="applied" caption="신청서" :width="70" cell-template="apCell" />
          <DxColumn data-field="reason" caption="사유" />
          <DxColumn data-field="at" caption="등록" :width="150" cell-template="atCell" />
          <DxColumn caption="" :width="76" cell-template="rmCell" />
          <template #monoCell="{ data }"><span class="mono">{{ data.value }}</span></template>
          <template #apCell="{ data }">{{ data.value ? '있음' : '—' }}</template>
          <template #atCell="{ data }"><span class="mono">{{ fmtDateTime(data.value) }}</span><br /><small class="muted">{{ data.data.by }}</small></template>
          <template #rmCell="{ data }"><DxButton text="해제" styling-mode="text" @click="removeBlack(data.data)" /></template>
        </DxDataGrid>
      </div>
    </DxPopup>
  </div>
</template>

<style scoped>
.page {
  display: grid;
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
.panel__head p {
  margin-top: 4px;
  color: var(--c-mute);
  font-size: 13px;
}
.sum {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.sum__card {
  display: grid;
  gap: 2px;
  padding: 16px 18px;
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
  background: var(--c-surface);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.sum__card:hover {
  border-color: var(--c-crimson);
  transform: translateY(-1px);
}
.sum__card--black:hover {
  border-color: var(--c-indigo);
}
.sum__label {
  color: var(--c-mute);
  font-size: 13px;
  font-weight: 600;
}
.sum__n {
  font-size: 28px;
  color: var(--c-indigo);
}
.sum__n small {
  margin-left: 2px;
  font-size: 14px;
  color: var(--c-mute);
}
.sum__sub {
  color: var(--c-ink-2);
  font-size: 13px;
}
.sum__go {
  margin-top: 6px;
  color: var(--c-crimson-deep);
  font-size: 13px;
  font-weight: 600;
}
.pp {
  display: grid;
  gap: 12px;
}
.pp__desc {
  color: var(--c-ink-2);
  font-size: 13.5px;
}
.add {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) auto;
  gap: 8px;
}
.bar {
  display: inline-block;
  width: 70px;
  height: 8px;
  margin-right: 8px;
  border-radius: 999px;
  background: #efeef4;
  overflow: hidden;
  vertical-align: middle;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--c-crimson);
}
.bar__n {
  font-size: 13px;
}
.tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--c-crimson);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.muted {
  color: var(--c-mute);
  font-size: 12.5px;
}
.rate {
  font-weight: 600;
  white-space: nowrap;
}
.rate--DISLIKE {
  color: var(--c-crimson-deep);
}
.rate--LIKE {
  color: var(--c-ok);
}
.empty {
  color: var(--c-mute);
  font-size: 14px;
}
@media (max-width: 640px) {
  .add {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
