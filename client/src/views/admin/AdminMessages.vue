<script setup>
/**
 * 관리자 쪽지 — 매칭별(기본) / 사용자별로 본다.
 *  - 매칭별: 서로 수락한 매칭마다 두 사람이 주고받은 쪽지 (신고 대응·운영 목적, 열람 기록이 남는다)
 *  - 사용자별: 한 신청자가 주고받은 모든 쪽지(담당자 + 매칭) + 담당자 쪽지 보내기(기록이 남는다)
 */
import { ref, computed, onMounted } from 'vue';
import { DxTextBox } from 'devextreme-vue/text-box';
import { DxTextArea } from 'devextreme-vue/text-area';
import { DxButton } from 'devextreme-vue/button';
import notify from 'devextreme/ui/notify';
import { adminApi } from '@/stores/session';
import { USER_STATUS_MAP, MATCH_STATUS, textOf } from '@shared/constants/codes';
import { fmtDateTime } from '@shared/utils/format';

const mode = ref('match'); // match | user
const q = ref('');
const matches = ref([]);
const users = ref([]);
const sel = ref(null); // matchId | applicantId
const msgs = ref([]);
const body = ref('');
const busy = ref(false);

const filtered = computed(() => {
  const k = q.value.trim();
  if (mode.value === 'match') {
    const list = matches.value;
    return k ? list.filter((m) => `${m.aName}${m.aNick}${m.bName}${m.bNick}#${m.matchId}`.includes(k)) : list;
  }
  const list = [...users.value].sort((a, b) => b.unread - a.unread || (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || a.name.localeCompare(b.name));
  return k ? list.filter((t) => `${t.name}${t.nickname}${t.team}`.includes(k)) : list;
});
const selMatch = computed(() => matches.value.find((m) => m.matchId === sel.value) ?? null);
const selUser = computed(() => users.value.find((u) => u.applicantId === sel.value) ?? null);

async function load() {
  try {
    if (mode.value === 'match') matches.value = await adminApi.messageMatches();
    else users.value = await adminApi.messageUsers();
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3000 });
  }
}
function switchMode(m) {
  if (mode.value === m) return;
  mode.value = m;
  sel.value = null;
  msgs.value = [];
  q.value = '';
  load();
}
async function open(id) {
  sel.value = id;
  try {
    msgs.value = mode.value === 'match' ? await adminApi.matchMessages(id) : await adminApi.userMessages(id);
    if (mode.value === 'user') users.value = await adminApi.messageUsers();
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3000 });
  }
}
onMounted(load);

async function send() {
  const text = body.value.trim();
  if (!text || !selUser.value) return;
  busy.value = true;
  try {
    await adminApi.sendMessage(selUser.value.applicantId, text);
    body.value = '';
    notify({ message: '쪽지를 보냈어요.', type: 'success', displayTime: 1600 });
    await open(selUser.value.applicantId);
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="am">
    <aside class="am__list">
      <div class="am__tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="mode === 'match'" :class="{ 'is-on': mode === 'match' }" @click="switchMode('match')">매칭별</button>
        <button type="button" role="tab" :aria-selected="mode === 'user'" :class="{ 'is-on': mode === 'user' }" @click="switchMode('user')">사용자별</button>
      </div>
      <DxTextBox v-model:value="q" mode="search" :placeholder="mode === 'match' ? '이름·닉네임·매칭 번호 검색' : '이름·닉네임·팀 검색'" value-change-event="input" />
      <div class="am__items">
        <template v-if="mode === 'match'">
          <button v-for="m in filtered" :key="m.matchId" type="button" class="am__item" :class="{ 'is-on': sel === m.matchId }" @click="open(m.matchId)">
            <span class="am__who"><b>{{ m.aName }}</b> ↔ <b>{{ m.bName }}</b></span>
            <span class="am__meta">
              <span class="mono">#{{ m.matchId }}</span> · {{ textOf(MATCH_STATUS, m.status) }} · {{ m.open ? '쪽지 가능' : '쪽지 닫힘' }} · {{ m.count }}통
            </span>
          </button>
          <p v-if="!filtered.length" class="am__none">서로 수락한 매칭이 없어요.</p>
        </template>
        <template v-else>
          <button v-for="t in filtered" :key="t.applicantId" type="button" class="am__item" :class="{ 'is-on': sel === t.applicantId }" @click="open(t.applicantId)">
            <span class="am__who"><b>{{ t.name }}</b> <small>{{ t.nickname }} · {{ t.team }}</small></span>
            <span class="am__meta">{{ USER_STATUS_MAP[t.userStatus]?.text }}{{ t.count ? ` · 쪽지 ${t.count}` : '' }}</span>
            <span v-if="t.unread" class="am__badge">{{ t.unread }}</span>
          </button>
        </template>
      </div>
    </aside>

    <section v-if="sel" class="am__pane">
      <header class="am__head">
        <template v-if="mode === 'match' && selMatch">
          <h2>매칭 #{{ selMatch.matchId }} · {{ selMatch.aName }}({{ selMatch.aNick }}) ↔ {{ selMatch.bName }}({{ selMatch.bNick }})</h2>
          <p>{{ textOf(MATCH_STATUS, selMatch.status) }} · {{ selMatch.open ? '두 분이 지금 쪽지를 주고받을 수 있어요.' : '매칭이 끝나 쪽지가 닫혔어요.' }} 열람 기록이 남아요.</p>
        </template>
        <template v-else-if="selUser">
          <h2>{{ selUser.name }} ({{ selUser.nickname }}) · {{ selUser.team }}</h2>
          <p>담당자 쪽지와 매칭 쪽지를 모두 보여줘요. 매칭 쪽지가 있으면 열람 기록이 남아요.</p>
        </template>
      </header>
      <table v-if="msgs.length" class="tbl">
        <thead>
          <tr>
            <th scope="col" class="tbl__at">시각</th>
            <th v-if="mode === 'user'" scope="col" class="tbl__ch">구분</th>
            <th scope="col" class="tbl__who">보낸 사람 → 받는 사람</th>
            <th scope="col">내용</th>
            <th scope="col" class="tbl__rd">읽음</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in msgs" :key="m.id" :class="{ 'is-admin': m.outFromAdmin }">
            <td class="tbl__at mono">{{ fmtDateTime(m.at) }}</td>
            <td v-if="mode === 'user'" class="tbl__ch"><span class="ch" :class="{ 'ch--admin': m.adminThread }">{{ m.channel }}</span></td>
            <td class="tbl__who">{{ m.from }} → {{ m.to }}</td>
            <td class="tbl__body">{{ m.body }}</td>
            <td class="tbl__rd">{{ m.readAt ? '읽음' : '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="am__empty">주고받은 쪽지가 없어요.</p>

      <form v-if="mode === 'user' && selUser" class="am__send" @submit.prevent="send">
        <DxTextArea v-model:value="body" :height="80" :max-length="500" value-change-event="input" placeholder="이 신청자에게 담당자 쪽지 보내기 (담당자 이름으로 보내지고 기록이 남아요)" />
        <DxButton text="보내기" type="default" :disabled="busy || !body.trim()" @click="send" />
      </form>
    </section>
    <p v-else class="am__empty am__empty--pane">
      {{ mode === 'match' ? '왼쪽에서 매칭을 고르면 두 사람이 주고받은 쪽지를 볼 수 있어요.' : '왼쪽에서 신청자를 고르면 주고받은 쪽지를 보고 담당자 쪽지를 보낼 수 있어요.' }}
    </p>
  </div>
</template>

<style scoped>
.am {
  display: grid;
  grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.am__list,
.am__pane {
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
}
.am__list {
  display: grid;
  gap: 10px;
  padding: 12px;
}
.am__tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 3px;
  border-radius: var(--r-md);
  background: var(--c-paper);
}
.am__tabs button {
  padding: 8px;
  border: 0;
  border-radius: calc(var(--r-md) - 2px);
  background: none;
  font: inherit;
  color: var(--c-mute);
  cursor: pointer;
}
.am__tabs button.is-on {
  background: var(--c-surface);
  color: var(--c-indigo);
  font-weight: 700;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.am__items {
  display: grid;
  gap: 4px;
  max-height: 64vh;
  overflow-y: auto;
}
.am__item {
  position: relative;
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border: 0;
  border-radius: var(--r-md);
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.am__item:hover {
  background: var(--c-paper);
}
.am__item.is-on {
  background: var(--c-blush-soft);
}
.am__who small,
.am__meta {
  color: var(--c-mute);
  font-size: 12.5px;
}
.am__badge {
  position: absolute;
  right: 10px;
  top: 12px;
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--c-crimson);
  color: #fff;
  font-size: 12px;
  text-align: center;
}
.am__none {
  padding: 18px;
  color: var(--c-mute);
  text-align: center;
}
.am__pane {
  overflow: hidden;
}
.am__head {
  padding: 14px 18px;
  border-bottom: 1px solid var(--c-line);
}
.am__head h2 {
  font-size: 16px;
  color: var(--c-indigo);
}
.am__head p {
  margin-top: 2px;
  color: var(--c-mute);
  font-size: 13px;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
}
.tbl th {
  padding: 8px 12px;
  border-bottom: 1px solid var(--c-line);
  color: var(--c-mute);
  font-size: 12.5px;
  font-weight: 600;
  text-align: left;
}
.tbl td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--c-line);
  vertical-align: top;
  font-size: 14px;
}
.tbl tr.is-admin td {
  background: #f7f6fb;
}
.tbl__at {
  width: 140px;
  color: var(--c-mute);
  font-size: 12.5px !important;
  white-space: nowrap;
}
.tbl__ch {
  width: 96px;
}
.tbl__who {
  width: 240px;
  color: var(--c-ink-2);
}
.tbl__body {
  white-space: pre-wrap;
}
.tbl__rd {
  width: 56px;
  color: var(--c-mute);
  font-size: 12.5px !important;
}
.ch {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--c-blush-soft);
  color: var(--c-crimson-deep);
  font-size: 12px;
  white-space: nowrap;
}
.ch--admin {
  background: #e9e8f3;
  color: var(--c-indigo);
}
.am__send {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--c-line);
}
.am__send :deep(.dx-button) {
  height: 80px;
}
.am__empty {
  padding: 40px 18px;
  color: var(--c-mute);
  text-align: center;
}
.am__empty--pane {
  background: var(--c-surface);
  border: 1px dashed var(--c-line);
  border-radius: var(--r-lg);
}
@media (max-width: 900px) {
  .am {
    grid-template-columns: minmax(0, 1fr);
  }
  .tbl__who {
    width: auto;
  }
}
</style>
