<script setup>
/**
 * 시스템 개선의 소리 — 바라는 점·불편한 점을 남긴다.
 * 내용은 담당자(관리자)만 볼 수 있다. 사용자 화면에는 보낸 글 목록을 두지 않는다.
 */
import { ref, reactive } from 'vue';
import { DxSelectBox } from 'devextreme-vue/select-box';
import { DxTextBox } from 'devextreme-vue/text-box';
import { DxTextArea } from 'devextreme-vue/text-area';
import { DxButton } from 'devextreme-vue/button';
import notify from 'devextreme/ui/notify';
import { api } from '@/api';
import { VOC_CATEGORIES } from '@/constants/codes';

const f = reactive({ category: 'FEATURE', title: '', content: '' });
const busy = ref(false);

async function submit() {
  if (f.title.trim().length < 2) return notify({ message: '제목을 2자 이상 적어주세요.', type: 'warning', displayTime: 2000 });
  if (f.content.trim().length < 10) return notify({ message: '내용을 10자 이상 적어주세요.', type: 'warning', displayTime: 2000 });
  busy.value = true;
  try {
    await api.voc.create({ ...f });
    Object.assign(f, { title: '', content: '' });
    notify({ message: '소중한 의견 고마워요. 담당자가 확인할게요.', type: 'success', displayTime: 2600 });
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
    </div>
  </div>
</template>

<style scoped>
.voc {
  padding: clamp(24px, 4vw, 48px) 0 72px;
}
.voc__grid {
  max-width: 760px;
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
</style>
