<script setup>
/**
 * 매칭 승인 대기 — 서로 하트를 보낸 두 분을 담당자가 확인하고 최종 매칭한다.
 *  - 두 분 화면에는 아직 '매칭 대기 중'(새 후보 준비 중)으로 보인다. 승인 전에는 매칭 사실을 모른다
 *  - 최종 매칭: 양측 수락 → 두 분 화면이 '매칭 중'으로 바뀌고 담당자 안내 쪽지가 간다
 *  - 반려: 두 분에게 알리지 않고 매칭 대기로 돌린다 (서로는 다시 추천되지 않는다)
 */
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { DxButton } from 'devextreme-vue/button';
import { DxPopup } from 'devextreme-vue/popup';
import { DxTextArea } from 'devextreme-vue/text-area';
import notify from 'devextreme/ui/notify';
import { confirm } from 'devextreme/ui/dialog';
import { adminApi } from '@/stores/session';
import { GENDERS, textOf } from '@shared/constants/codes';
import { ct } from '@/stores/codes';
import StatusBadge from '@/components/StatusBadge.vue';

const router = useRouter();
const list = ref([]);
const loading = ref(true);
const busyId = ref(null);
const rej = reactive({ open: false, item: null, reason: '' });

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
const SOURCE = { SAJU: '인연 사주', DAILY: '오늘의 인연' };

async function load() {
  loading.value = true;
  try {
    list.value = await adminApi.listPendingMatches();
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function approve(item) {
  const ok = await confirm(
    `<b>${esc(item.a?.name)}</b>님과 <b>${esc(item.b?.name)}</b>님을 최종 매칭할까요?<br>두 분 화면이 '매칭 중'으로 바뀌고 안내 쪽지가 가요.`,
    '최종 매칭',
  );
  if (!ok) return;
  busyId.value = item.id;
  try {
    await adminApi.approveMatch(item.id);
    notify({ message: `${item.a?.name}님 ↔ ${item.b?.name}님 매칭을 확정했어요.`, type: 'success', displayTime: 2600 });
    await load();
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 4000 });
  } finally {
    busyId.value = null;
  }
}

function openReject(item) {
  Object.assign(rej, { open: true, item, reason: '' });
}
async function reject() {
  const item = rej.item;
  busyId.value = item.id;
  try {
    await adminApi.rejectMatch(item.id, rej.reason);
    notify({ message: '반려했어요. 두 분은 매칭 대기로 돌아가요.', type: 'success', displayTime: 2400 });
    rej.open = false;
    await load();
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 4000 });
  } finally {
    busyId.value = null;
  }
}

const openApplicant = (id) => router.push({ name: 'admin-applicants', query: { open: id } });
</script>

<template>
  <div class="pend">
    <div class="head">
      <p class="lead">
        서로 하트를 보낸 두 분이에요. <b>두 분 화면에는 아직 '매칭 대기 중'</b>으로 보여요.
        확인 후 <b>최종 매칭</b>하면 매칭 중으로 바뀌고 안내 쪽지가 가요. 반려하면 알리지 않고 대기로 돌려요.
      </p>
      <DxButton icon="refresh" hint="새로고침" @click="load" />
    </div>

    <p v-if="!loading && !list.length" class="empty">승인을 기다리는 매칭이 없어요.</p>

    <article v-for="m in list" :key="m.id" class="pair" :class="{ 'is-warn': m.conflict }">
      <header class="pair__head">
        <span class="mono">매칭 #{{ m.id }}</span>
        <span>서로 하트 {{ fmt(m.createdAt) }}</span>
        <span class="pair__score">추천 점수 <b>{{ m.score }}</b></span>
      </header>

      <div class="pair__body">
        <template v-for="(p, i) in [m.a, m.b]" :key="i">
          <section v-if="p" class="person">
            <button type="button" class="person__name" @click="openApplicant(p.id)">{{ p.name }} <small>({{ p.nickname }})</small></button>
            <p class="person__meta">{{ textOf(GENDERS, p.gender) }} · {{ p.age }}세 · {{ p.mbti || '-' }}</p>
            <p class="person__meta">{{ ct('DIVISION', p.division) }} {{ p.team }}{{ p.campus ? ` · ${ct('CAMPUS', p.campus)}` : '' }}</p>
            <p class="person__tags">
              <StatusBadge :status="p.status" />
              <span v-if="p.test" class="tag tag--test">테스트</span>
              <span v-if="p.blacklisted" class="tag tag--bad">블랙리스트</span>
              <span v-if="p.dislikes" class="tag tag--bad">싫어요 {{ p.dislikes }}</span>
            </p>
          </section>
          <section v-else class="person person--gone">탈퇴한 신청자</section>
          <div v-if="i === 0" class="pair__mid" aria-hidden="true">
            <span class="heart">♥</span>
            <small v-if="m.hearts.aToB">{{ SOURCE[m.hearts.aToB.source] ?? '하트' }} {{ fmt(m.hearts.aToB.at) }} →</small>
            <small v-if="m.hearts.bToA">← {{ SOURCE[m.hearts.bToA.source] ?? '하트' }} {{ fmt(m.hearts.bToA.at) }}</small>
            <small v-else-if="m.hearts.aToB?.answeredAt">← 받은 하트 수락 {{ fmt(m.hearts.aToB.answeredAt) }}</small>
            <small v-else-if="m.hearts.aToB === null && m.hearts.bToA === null">하트 기록 없음</small>
          </div>
        </template>
      </div>

      <p v-if="m.conflict" class="pair__warn">두 분 중 한 분이 이미 다른 매칭을 진행 중이에요 — 반려해 주세요.</p>

      <footer class="pair__actions">
        <DxButton text="반려" styling-mode="outlined" :disabled="busyId === m.id" @click="openReject(m)" />
        <DxButton text="최종 매칭" type="default" icon="like" :disabled="busyId === m.id || m.conflict || !m.a || !m.b" @click="approve(m)" />
      </footer>
    </article>

    <DxPopup v-model:visible="rej.open" title="반려" :width="440" height="auto" :show-close-button="true" :wrapper-attr="{ class: 'sa-popup' }">
      <div class="rej">
        <p>두 분에게는 알리지 않고 매칭 대기로 돌려요. 서로는 다시 추천되지 않아요.</p>
        <DxTextArea v-model:value="rej.reason" :height="90" :max-length="200" placeholder="반려 사유 (열람 기록에 남아요, 선택)" />
        <div class="rej__actions">
          <DxButton text="취소" @click="rej.open = false" />
          <DxButton text="반려하기" type="danger" :disabled="busyId !== null" @click="reject" />
        </div>
      </div>
    </DxPopup>
  </div>
</template>

<style scoped>
.pend {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}
.lead {
  color: var(--c-mute);
  font-size: 13px;
}
.empty {
  padding: 40px 16px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
  color: var(--c-mute);
  text-align: center;
}
.pair {
  padding: 14px 16px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
}
.pair.is-warn {
  border-color: var(--c-crimson);
}
.pair__head {
  display: flex;
  gap: 14px;
  color: var(--c-mute);
  font-size: 12.5px;
}
.pair__score {
  margin-left: auto;
}
.pair__score b {
  color: var(--c-crimson-deep);
  font-size: 15px;
}
.pair__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 190px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  margin: 10px 0;
}
.person {
  padding: 10px 12px;
  border: 1px solid var(--c-line);
  border-radius: var(--r-sm, 8px);
  background: var(--c-paper);
}
.person--gone {
  color: var(--c-mute);
  text-align: center;
}
.person__name {
  padding: 0;
  border: 0;
  background: none;
  color: var(--c-ink);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
.person__name:hover {
  text-decoration: underline;
}
.person__name small {
  color: var(--c-mute);
  font-weight: 500;
}
.person__meta {
  color: var(--c-ink-2);
  font-size: 12.5px;
}
.person__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.tag {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11.5px;
}
.tag--test {
  background: #fff4d6;
  color: #7a5a00;
}
.tag--bad {
  background: #fdecef;
  color: var(--c-crimson-deep);
}
.pair__mid {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--c-mute);
  font-size: 11.5px;
  text-align: center;
}
.heart {
  color: var(--c-crimson);
  font-size: 26px;
  line-height: 1;
}
.pair__warn {
  margin-bottom: 8px;
  color: var(--c-crimson-deep);
  font-size: 13px;
}
.pair__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.rej {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
}
.rej__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
@media (max-width: 900px) {
  .pair__body {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
