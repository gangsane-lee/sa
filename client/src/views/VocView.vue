<script setup>
/**
 * 시스템 개선의 소리 — 바라는 점·불편한 점을 남긴다.
 * 내용은 담당자(관리자)만 볼 수 있고, 작성자는 자기 글과 처리 상태·답변만 볼 수 있다.
 */
import { ref, reactive, onMounted } from 'vue';
import { DxSelectBox } from 'devextreme-vue/select-box';
import { DxTextBox } from 'devextreme-vue/text-box';
import { DxTextArea } from 'devextreme-vue/text-area';
import { DxButton } from 'devextreme-vue/button';
import notify from 'devextreme/ui/notify';
import { api } from '@/api';
import { VOC_CATEGORIES, VOC_STATUS, textOf } from '@/constants/codes';
import { fmtDateTime } from '@/utils/format';

const f = reactive({ category: 'FEATURE', title: '', content: '' });
const mine = ref([]);
const busy = ref(false);

async function load() {
  mine.value = await api.voc.listMine().catch(() => []);
}
onMounted(load);

async function submit() {
  if (f.title.trim().length < 2) return notify({ message: '제목을 2자 이상 적어주세요.', type: 'warning', displayTime: 2000 });
  if (f.content.trim().length < 10) return notify({ message: '내용을 10자 이상 적어주세요.', type: 'warning', displayTime: 2000 });
  busy.value = true;
  try {
    await api.voc.create({ ...f });
    Object.assign(f, { title: '', content: '' });
    notify({ message: '소중한 의견 고마워요. 담당자가 확인할게요.', type: 'success', displayTime: 2600 });
    await load();
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="voc">
    <div class="container voc__grid">
      <section class="panel">
        <p class="eyebrow">시스템 개선의 소리</p>
        <h1 class="display">사緣에 바라는 점을 들려주세요</h1>
        <p class="lead">불편했던 점, 있으면 좋겠는 기능, 개인정보가 걱정되는 부분까지 무엇이든 좋아요. 남긴 글은 담당자만 볼 수 있어요.</p>

        <form class="form" @submit.prevent="submit">
          <label class="field">
            <span>분류</span>
            <DxSelectBox v-model:value="f.category" :items="VOC_CATEGORIES" value-expr="value" display-expr="text" />
          </label>
          <label class="field">
            <span>제목</span>
            <DxTextBox v-model:value="f.title" :max-length="60" placeholder="예: 하루 후보 수를 늘려주세요" />
          </label>
          <label class="field">
            <span>내용</span>
            <DxTextArea
              v-model:value="f.content"
              :max-length="1000"
              :height="160"
              placeholder="어떤 상황에서 불편했는지, 어떻게 바뀌면 좋을지 적어주세요. 다른 사람의 이름 등 개인정보는 적지 말아 주세요."
            />
            <small class="count">{{ f.content.length }}/1000</small>
          </label>
          <p class="named">남긴 의견에는 이름·팀이 함께 기록되고 담당자만 볼 수 있어요.</p>
          <DxButton text="의견 보내기" type="default" :use-submit-behavior="true" :disabled="busy" class="form__go" />
        </form>
      </section>

      <section class="panel">
        <h2 class="display">내가 남긴 의견</h2>
        <p class="lead">처리 상태와 담당자 답변을 여기서 확인할 수 있어요. 다른 사람의 글은 보이지 않아요.</p>
        <ul v-if="mine.length" class="list">
          <li v-for="v in mine" :key="v.id">
            <div class="list__head">
              <span class="chip">{{ textOf(VOC_CATEGORIES, v.category) }}</span>
              <span class="state" :class="`state--${v.status}`">{{ textOf(VOC_STATUS, v.status) }}</span>
            </div>
            <h3>{{ v.title }}</h3>
            <p class="list__body">{{ v.content }}</p>
            <p v-if="v.reply" class="list__reply"><b>담당자 답변</b> {{ v.reply }}</p>
            <p class="list__meta mono">{{ fmtDateTime(v.createdAt) }}</p>
          </li>
        </ul>
        <p v-else class="empty">아직 남긴 의견이 없어요.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.voc {
  padding: clamp(24px, 4vw, 48px) 0 72px;
}
.voc__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 20px;
  align-items: start;
}
.panel {
  padding: clamp(18px, 3vw, 32px);
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
}
.eyebrow {
  color: var(--c-crimson-deep);
  font-size: 13px;
  font-weight: 700;
}
h1 {
  margin-top: 6px;
  font-size: clamp(24px, 3vw, 32px);
  color: var(--c-indigo);
}
h2 {
  font-size: 20px;
  color: var(--c-indigo);
}
.lead {
  margin-top: 6px;
  color: var(--c-ink-2);
  font-size: 14.5px;
}
.form {
  display: grid;
  gap: 14px;
  margin-top: 20px;
}
.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-ink-2);
}
.named {
  color: var(--c-mute);
  font-size: 13px;
}
.count {
  justify-self: end;
  color: var(--c-mute);
  font-weight: 400;
}
.form__go {
  height: 48px;
}
.list {
  display: grid;
  gap: 12px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}
.list li {
  padding: 14px 16px;
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
}
.list__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.list h3 {
  margin-top: 8px;
  font-size: 15.5px;
}
.list__body {
  margin-top: 4px;
  color: var(--c-ink-2);
  font-size: 14px;
  white-space: pre-wrap;
}
.list__reply {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  background: var(--c-blush-soft);
  font-size: 13.5px;
}
.list__reply b {
  margin-right: 6px;
  color: var(--c-crimson-deep);
}
.list__meta {
  margin-top: 8px;
  color: var(--c-mute);
  font-size: 12px;
}
.state {
  padding: 2px 10px;
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
  margin-top: 16px;
  color: var(--c-mute);
}
@media (max-width: 860px) {
  .voc__grid {
    grid-template-columns: 1fr;
  }
}
</style>
