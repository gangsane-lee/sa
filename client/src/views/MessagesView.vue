<script setup>
/**
 * 쪽지함 — 받은 쪽지함 / 보낸 쪽지함 / 휴지통 (메일함 형태, 채팅 아님)
 *  - 받는 사람: 매칭 담당자(언제나) + 진행 중인 매칭 상대(매칭이 끝나면 보낼 수 없음)
 *  - 상대가 답하기 전에는 연속 N통(관리자 설정, 기본 3)까지만 보낼 수 있다
 *  - 삭제하면 휴지통으로 옮기고, 휴지통에서 되살리거나 영구 삭제한다(내 쪽지함에서만 사라짐)
 */
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import notify from 'devextreme/ui/notify';
import { confirm } from 'devextreme/ui/dialog';
import { DxButton } from 'devextreme-vue/button';
import { DxPopup } from 'devextreme-vue/popup';
import { DxSelectBox } from 'devextreme-vue/select-box';
import { DxTextArea } from 'devextreme-vue/text-area';
import { api } from '@/api';
import { fmtDateTime } from '@/utils/format';
import { session, refreshUnread } from '@/stores/session';
import FaceIcon from '@/components/FaceIcon.vue';

const BOXES = [
  { key: 'inbox', text: '받은 쪽지함', icon: 'download' },
  { key: 'sent', text: '보낸 쪽지함', icon: 'upload' },
  { key: 'trash', text: '휴지통', icon: 'trash' },
];

const route = useRoute();
const router = useRouter();
const box = ref(BOXES.some((b) => b.key === route.query.box) ? route.query.box : 'inbox');
const items = ref([]);
const counts = ref({ inbox: 0, unread: 0, sent: 0, trash: 0 });
const checked = ref([]);
const opened = ref(null); // 읽는 중인 쪽지
const loading = ref(true);
// 신청 전이면 쪽지함을 처음부터 그리지 않는다 (로그인 정보로 바로 판단 — 목록을 그렸다가 지우면 화면이 깜빡인다)
const noApp = ref(!session.user?.applicant);
const ready = ref(noApp.value); // 신청자는 첫 목록을 받은 뒤에 쪽지함을 보여준다

// 쪽지 쓰기
const compose = ref(false);
const recipients = ref([]);
const to = ref(null);
const body = ref('');
const sending = ref(false);
const target = computed(() => recipients.value.find((r) => r.key === to.value) ?? null);
const burstLimit = computed(() => recipients.value[0]?.limit ?? 3);

const allChecked = computed({
  get: () => items.value.length > 0 && checked.value.length === items.value.length,
  set: (v) => (checked.value = v ? items.value.map((m) => m.id) : []),
});

async function load() {
  loading.value = true;
  try {
    const [list, c] = await Promise.all([api.messages.box(box.value), api.messages.counts()]);
    items.value = list;
    counts.value = c;
    checked.value = [];
  } catch (e) {
    if (e.status === 404) noApp.value = true;
    else notify({ message: e.message, type: 'error', displayTime: 3000 });
  } finally {
    loading.value = false;
  }
}

function pickBox(k) {
  opened.value = null;
  box.value = k;
  router.replace({ query: { box: k } });
}
watch(box, load);

async function open(m) {
  try {
    opened.value = await api.messages.read(m.id);
    if (m.dir === 'IN' && !m.readAt) {
      refreshUnread();
      counts.value = await api.messages.counts();
      m.readAt = opened.value.readAt;
    }
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3000 });
  }
}

async function move(ids, action) {
  if (!ids.length) return;
  if (action === 'delete') {
    const ok = await confirm(`쪽지 ${ids.length}통을 영구 삭제할까요?<br>내 쪽지함에서만 사라지고 되살릴 수 없어요.`, '영구 삭제');
    if (!ok) return;
  }
  try {
    await api.messages.move(ids, action);
    notify({ message: { trash: '휴지통으로 옮겼어요.', restore: '되살렸어요.', delete: '영구 삭제했어요.' }[action], type: 'success', displayTime: 1600 });
    opened.value = null;
    await load();
    refreshUnread();
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3000 });
  }
}

async function openCompose(key = null) {
  try {
    recipients.value = await api.messages.recipients();
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3000 });
    return;
  }
  to.value = recipients.value.some((r) => r.key === key) ? key : (recipients.value.find((r) => r.kind === 'MATCH')?.key ?? recipients.value[0]?.key ?? null);
  body.value = '';
  compose.value = true;
}

async function send() {
  const text = body.value.trim();
  if (!to.value || !text) return;
  sending.value = true;
  try {
    await api.messages.send(to.value, text);
    notify({ message: `${target.value?.name}에게 쪽지를 보냈어요.`, type: 'success', displayTime: 2000 });
    compose.value = false;
    if (box.value === 'sent') await load();
    else pickBox('sent');
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  } finally {
    sending.value = false;
  }
}

onMounted(async () => {
  if (noApp.value) return;
  await load();
  ready.value = true;
  if (!noApp.value) recipients.value = await api.messages.recipients().catch(() => []);
  if (route.query.compose && !noApp.value) openCompose(String(route.query.compose));
});

const peerLabel = (m) => (m.dir === 'IN' ? '보낸 사람' : '받는 사람');
</script>

<template>
  <div class="mb">
    <div class="container">
      <header class="head">
        <div>
          <p class="head__eyebrow">쪽지함</p>
          <h1 class="display">쪽지</h1>
          <p class="head__lead">매칭된 상대와는 매칭이 이어지는 동안만 쪽지를 주고받을 수 있어요. 담당자에게는 언제든 보낼 수 있어요.</p>
        </div>
        <DxButton v-if="ready && !noApp" text="쪽지 쓰기" icon="edit" type="default" class="head__write" @click="openCompose()" />
      </header>

      <section v-if="noApp" class="empty">
        <p>신청한 뒤에 쪽지함을 쓸 수 있어요.</p>
        <DxButton text="신청하러 가기" type="default" @click="router.push({ name: 'apply' })" />
      </section>

      <div v-else-if="ready" class="grid">
        <nav class="boxes" aria-label="쪽지함">
          <button v-for="b in BOXES" :key="b.key" type="button" class="boxes__item" :class="{ 'is-on': box === b.key }" @click="pickBox(b.key)">
            <i :class="`dx-icon-${b.icon}`" aria-hidden="true" />
            <span>{{ b.text }}</span>
            <b v-if="b.key === 'inbox' && counts.unread" class="boxes__badge">{{ counts.unread }}</b>
            <small v-else class="mono">{{ counts[b.key] }}</small>
          </button>
          <p class="boxes__note">상대의 답장을 받기 전에는 연속 {{ burstLimit }}통까지 보낼 수 있어요. 연락처 교환은 충분히 대화한 뒤에!</p>
        </nav>

        <!-- 읽기 -->
        <article v-if="opened" class="read">
          <div class="read__bar">
            <DxButton icon="back" text="목록" styling-mode="text" @click="opened = null" />
            <span class="read__sp" />
            <DxButton v-if="opened.dir === 'IN' && opened.replyTo" text="답장" icon="redo" type="default" @click="openCompose(opened.replyTo.key)" />
            <DxButton v-if="opened.box !== 'TRASH'" text="삭제" icon="trash" styling-mode="outlined" @click="move([opened.id], 'trash')" />
            <template v-else>
              <DxButton text="되살리기" styling-mode="outlined" @click="move([opened.id], 'restore')" />
              <DxButton text="영구 삭제" styling-mode="text" @click="move([opened.id], 'delete')" />
            </template>
          </div>
          <dl class="read__meta">
            <div>
              <dt>{{ peerLabel(opened) }}</dt>
              <dd>
                <FaceIcon v-if="opened.peer.kind === 'MATCH'" :face="opened.peer.face" :fallback="opened.peer.name?.[0]" :size="28" />
                <span v-else class="seal" aria-hidden="true">緣</span>
                {{ opened.peer.name }}
              </dd>
            </div>
            <div><dt>{{ opened.dir === 'IN' ? '받은 시각' : '보낸 시각' }}</dt><dd class="mono">{{ fmtDateTime(opened.at) }}</dd></div>
            <div v-if="opened.dir === 'OUT'"><dt>읽음</dt><dd>{{ opened.readAt ? `읽음 · ${fmtDateTime(opened.readAt)}` : '아직 읽지 않았어요' }}</dd></div>
          </dl>
          <p class="read__body">{{ opened.body }}</p>
          <p v-if="opened.dir === 'IN' && !opened.replyTo" class="read__closed"><i class="dx-icon-lock" aria-hidden="true" /> {{ opened.closedReason }}</p>
        </article>

        <!-- 목록 -->
        <section v-else class="list" :aria-busy="loading">
          <div class="list__bar">
            <label class="chk"><input v-model="allChecked" type="checkbox" :disabled="!items.length" /> 전체</label>
            <template v-if="box !== 'trash'">
              <DxButton text="삭제" icon="trash" styling-mode="text" :disabled="!checked.length" @click="move(checked, 'trash')" />
            </template>
            <template v-else>
              <DxButton text="되살리기" styling-mode="text" :disabled="!checked.length" @click="move(checked, 'restore')" />
              <DxButton text="영구 삭제" styling-mode="text" :disabled="!checked.length" @click="move(checked, 'delete')" />
            </template>
            <span class="list__count">{{ items.length }}통</span>
          </div>
          <table v-if="items.length" class="tbl">
            <thead>
              <tr>
                <th scope="col" class="tbl__chk"><span class="sr-only">선택</span></th>
                <th scope="col" class="tbl__who">{{ box === 'sent' ? '받는 사람' : box === 'trash' ? '주고받은 사람' : '보낸 사람' }}</th>
                <th scope="col">내용</th>
                <th scope="col" class="tbl__at">날짜</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in items" :key="m.id" :class="{ 'is-unread': m.dir === 'IN' && !m.readAt }" @click="open(m)">
                <td class="tbl__chk" @click.stop><input v-model="checked" type="checkbox" :value="m.id" :aria-label="`${m.peer.name} 쪽지 선택`" /></td>
                <td class="tbl__who"><span class="tbl__whoin">
                  <FaceIcon v-if="m.peer.kind === 'MATCH'" :face="m.peer.face" :fallback="m.peer.name?.[0]" :size="26" />
                  <span v-else class="seal seal--sm" aria-hidden="true">緣</span>
                  <span class="tbl__name">{{ box === 'trash' ? (m.dir === 'IN' ? '← ' : '→ ') : '' }}{{ m.peer.name }}</span>
                </span></td>
                <td class="tbl__body">
                  <span>{{ m.preview }}</span>
                  <small v-if="m.dir === 'OUT'" class="tbl__read">{{ m.readAt ? '읽음' : '안 읽음' }}</small>
                </td>
                <td class="tbl__at mono">{{ fmtDateTime(m.at) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else-if="!loading" class="list__empty">
            {{ box === 'inbox' ? '받은 쪽지가 없어요.' : box === 'sent' ? '보낸 쪽지가 없어요.' : '휴지통이 비어 있어요.' }}
          </p>
        </section>
      </div>
    </div>

    <DxPopup
      v-model:visible="compose"
      title="쪽지 쓰기"
      :width="520"
      max-width="calc(100vw - 24px)"
      height="auto"
      :hide-on-outside-click="false"
      :show-close-button="true"
      :wrapper-attr="{ class: 'sa-popup' }"
    >
      <form class="cp" @submit.prevent="send">
        <label class="cp__field">
          <span>받는 사람</span>
          <DxSelectBox
            v-model:value="to"
            :items="recipients"
            value-expr="key"
            :display-expr="(r) => (r ? `${r.name}${r.kind === 'ADMIN' ? ' (담당자)' : ' (매칭 상대)'}` : '')"
            placeholder="받는 사람을 골라주세요"
          />
        </label>
        <p v-if="target" class="cp__left" :class="{ 'is-out': !target.left }">
          {{ target.left ? `상대가 답하기 전까지 ${target.left}통 더 보낼 수 있어요 (연속 ${target.limit}통까지)` : `연속 ${target.limit}통을 보냈어요. 상대의 답장을 기다려 주세요.` }}
        </p>
        <label class="cp__field">
          <span>내용</span>
          <DxTextArea v-model:value="body" :height="160" :max-length="500" value-change-event="input" placeholder="전하고 싶은 말을 적어주세요 (500자까지)" />
        </label>
        <p class="cp__count mono">{{ body.length }} / 500</p>
        <div class="cp__actions">
          <DxButton text="취소" styling-mode="text" @click="compose = false" />
          <DxButton text="보내기" icon="message" type="default" :disabled="sending || !to || !body.trim() || (target && !target.left)" @click="send" />
        </div>
      </form>
    </DxPopup>
  </div>
</template>

<style scoped>
.mb {
  padding: clamp(24px, 4vw, 48px) 0 72px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}
.head__eyebrow {
  color: var(--c-crimson-deep);
  font-size: 13px;
  font-weight: 700;
}
.head h1 {
  margin-top: 4px;
  font-size: clamp(26px, 3vw, 36px);
  color: var(--c-indigo);
}
.head__lead {
  margin-top: 6px;
  color: var(--c-ink-2);
}
.head__write :deep(.dx-button-text) {
  font-weight: 600;
}
.grid {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 18px;
  margin-top: 22px;
  align-items: start;
}
.boxes {
  display: grid;
  gap: 4px;
}
.boxes__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  background: none;
  color: var(--c-ink-2);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.boxes__item span {
  flex: 1;
}
.boxes__item:hover {
  background: var(--c-surface);
}
.boxes__item.is-on {
  background: var(--c-surface);
  border-color: var(--c-line);
  color: var(--c-indigo);
  font-weight: 700;
}
.boxes__item small {
  color: var(--c-mute);
}
.boxes__badge {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--c-crimson);
  color: #fff;
  font-size: 12px;
  text-align: center;
}
.boxes__note {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: var(--c-blush-soft);
  color: var(--c-ink-2);
  font-size: 12.5px;
}
.list,
.read {
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
  overflow: hidden;
}
.list__bar,
.read__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--c-line);
  background: var(--c-paper);
}
.chk {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  font-size: 13.5px;
  color: var(--c-ink-2);
}
.list__count {
  margin-left: auto;
  color: var(--c-mute);
  font-size: 13px;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
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
  padding: 11px 12px;
  border-bottom: 1px solid var(--c-line);
  vertical-align: middle;
}
.tbl tbody tr {
  cursor: pointer;
}
.tbl tbody tr:hover {
  background: var(--c-blush-soft);
}
.tbl tr.is-unread .tbl__name,
.tbl tr.is-unread .tbl__body span {
  font-weight: 700;
  color: var(--c-ink);
}
.tbl__chk {
  width: 40px;
}
.tbl__who {
  width: 190px;
}
.tbl__who {
  white-space: nowrap;
}
.tbl__whoin {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.tbl__name {
  overflow: hidden;
  text-overflow: ellipsis;
}
.tbl__body {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--c-ink-2);
}
.tbl__read {
  margin-left: 8px;
  color: var(--c-mute);
  font-size: 12px;
}
.tbl__at {
  width: 150px;
  color: var(--c-mute);
  font-size: 12.5px;
}
.list__empty {
  padding: 56px 16px;
  text-align: center;
  color: var(--c-mute);
}
.read__sp {
  flex: 1;
}
.read__meta {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 16px 20px;
  border-bottom: 1px dashed var(--c-line);
}
.read__meta div {
  display: flex;
  gap: 12px;
  align-items: center;
}
.read__meta dt {
  width: 72px;
  color: var(--c-mute);
  font-size: 13px;
}
.read__meta dd {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.read__body {
  min-height: 180px;
  padding: 20px;
  white-space: pre-wrap;
  line-height: 1.75;
}
.read__closed {
  display: flex;
  gap: 6px;
  padding: 12px 20px;
  border-top: 1px solid var(--c-line);
  background: #f6edd6;
  color: var(--c-moon-ink);
  font-size: 13.5px;
}
.seal {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--c-crimson);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}
.seal--sm {
  width: 26px;
  height: 26px;
}
.empty {
  display: grid;
  justify-items: center;
  gap: 12px;
  margin-top: 28px;
  padding: 40px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
}
.cp {
  display: grid;
  gap: 10px;
}
.cp__field {
  display: grid;
  gap: 6px;
}
.cp__field > span {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-ink-2);
}
.cp__left {
  margin-top: -4px;
  color: var(--c-mute);
  font-size: 12.5px;
}
.cp__left.is-out {
  color: var(--c-crimson-deep);
  font-weight: 600;
}
.cp__count {
  margin-top: -6px;
  text-align: right;
  color: var(--c-mute);
  font-size: 12px;
}
.cp__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
@media (max-width: 760px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .boxes {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .boxes__item {
    justify-content: center;
    padding: 9px 6px;
    font-size: 13px;
  }
  .boxes__item i {
    display: none;
  }
  .boxes__item span {
    flex: 0 1 auto;
  }
  .boxes__note {
    grid-column: 1 / -1;
    margin-top: 2px;
  }
  .tbl__who {
    width: 116px;
  }
  .tbl__at {
    width: 84px;
    font-size: 11px;
  }
}
</style>
