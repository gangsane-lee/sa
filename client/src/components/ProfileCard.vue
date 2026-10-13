<script setup>
/** 후보 간략 카드 — 이름은 가리고, 팀·건물·외모·연락처는 보여주지 않는다 */
import { computed } from 'vue';
import { ct, cts } from '@/stores/codes';
import { SERIOUSNESS } from '@/constants/codes';
import FaceIcon from './FaceIcon.vue';

const props = defineProps({
  card: { type: Object, required: true },
  /** 카드 위쪽 작은 안내 (예: '오늘의 후보 2/3') */
  caption: { type: String, default: '' },
  compact: { type: Boolean, default: false },
});

const facts = computed(() => [
  ['키', ct('HEIGHT', props.card.heightBand)],
  ['체형', ct('BODY', props.card.body)],
  ['MBTI', ct('MBTI', props.card.mbti)],
  ['음주', ct('DRINKING', props.card.drinking)],
  ['흡연', ct('SMOKING', props.card.smoking)],
]);
const where = computed(() => [ct('DIVISION', props.card.division), props.card.campus && ct('CAMPUS', props.card.campus)].filter(Boolean).join(' · '));
</script>

<template>
  <article class="pc" :class="{ 'pc--compact': compact }">
    <header class="pc__head">
      <FaceIcon :face="card.face" :fallback="card.nickname?.[0] ?? card.name?.[0]" :size="compact ? 46 : 60" :title="ct('FACE', card.face)" />
      <div class="pc__who">
        <p v-if="caption" class="pc__caption">{{ caption }}</p>
        <h3 class="pc__name">
          {{ card.nickname || card.name }}
          <span class="pc__age">만 {{ card.age }}세</span>
        </h3>
        <p class="pc__where">
          <span v-if="card.nickname" class="pc__initial mono">{{ card.name }}</span>
          {{ where }}
        </p>
      </div>
    </header>

    <div v-if="card.score != null" class="pc__match">
      <div class="pc__score" title="서로의 선호가 맞는 정도">
        <b class="mono">{{ card.score }}</b><span>%</span>
      </div>
      <p class="pc__story display">{{ card.story?.note ?? '서로의 선호가 잘 맞아요' }}</p>
    </div>

    <p class="pc__face">
      <span class="pc__face-tag">{{ ct('FACE', card.face) }}</span>
      <span v-if="card.serious" class="pc__serious" :class="`is-${card.serious}`">{{ SERIOUSNESS.find((x) => x.value === card.serious)?.short }}</span>
    </p>

    <dl class="pc__facts">
      <template v-for="[k, v] in facts" :key="k">
        <div v-if="v">
          <dt>{{ k }}</dt>
          <dd>{{ v }}</dd>
        </div>
      </template>
    </dl>

    <ul v-if="card.hobbies?.length" class="pc__hobbies" aria-label="취미">
      <li v-for="h in cts('HOBBY', card.hobbies)" :key="h">{{ h }}</li>
    </ul>

    <p v-if="card.comment && !compact" class="pc__comment">“{{ card.comment }}{{ card.comment.length >= 80 ? '…' : '' }}”</p>
  </article>
</template>

<style scoped>
.pc {
  position: relative;
  padding: 22px 22px 20px;
  border-radius: var(--r-lg);
  background:
    radial-gradient(120% 70% at 100% 0%, var(--c-blush-soft) 0%, transparent 60%),
    var(--c-surface);
  border: 1px solid var(--c-line);
  box-shadow: var(--shadow-2);
}
.pc--compact {
  padding: 16px;
  box-shadow: var(--shadow-1);
}
.pc__head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.pc__who {
  flex: 1;
  min-width: 0;
}
.pc__caption {
  color: var(--c-mute);
  font-size: 12px;
}
.pc__name {
  font-size: 20px;
  color: var(--c-indigo);
}
.pc__age {
  margin-left: 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--c-ink-2);
}
.pc__where {
  color: var(--c-mute);
  font-size: 13px;
}
.pc__initial {
  margin-right: 4px;
  color: var(--c-ink-2);
}
.pc__match {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: var(--c-blush-soft);
}
.pc__score {
  flex: none;
  display: flex;
  align-items: baseline;
  color: var(--c-crimson-deep);
  line-height: 1;
}
.pc__score b {
  font-size: 26px;
}
.pc__score span {
  font-size: 13px;
  font-weight: 600;
}
.pc__story {
  color: var(--c-ink);
  font-size: 15.5px;
  line-height: 1.4;
}
.pc__serious {
  margin-left: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #e7e8f6;
  color: var(--c-indigo-3);
  font-size: 13px;
  font-weight: 600;
}
.pc__serious.is-Y {
  background: var(--c-indigo);
  color: #fff;
}
.pc__face {
  margin-top: 14px;
}
.pc__face-tag {
  display: inline-block;
  padding: 3px 12px;
  border-radius: 999px;
  border: 1.5px solid var(--c-crimson);
  color: var(--c-crimson-deep);
  font-weight: 600;
  font-size: 13.5px;
}
.pc__facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
  margin: 14px 0 0;
}
.pc__facts div {
  padding: 8px 10px;
  border-radius: var(--r-sm);
  background: var(--c-paper);
}
.pc__facts dt {
  color: var(--c-mute);
  font-size: 11.5px;
}
.pc__facts dd {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--c-ink);
}
.pc__hobbies {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 12px 0 0;
  padding: 0;
}
.pc__hobbies li {
  padding: 3px 10px;
  border-radius: 999px;
  background: #e7e8f6;
  color: var(--c-indigo-3);
  font-size: 13px;
}
.pc__comment {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--c-line-strong);
  color: var(--c-ink-2);
  font-family: var(--f-display);
  font-size: 15px;
}
</style>
