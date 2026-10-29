<script setup>
/**
 * 개발 화면 표시 — 모든 화면 맨 위에 띄운다
 *  npm run dev:mock : 가짜 데이터 (실제 정보 입력 금지)
 *  npm run dev      : 운영 API 서버 · 운영 DB (테스트 사번으로 만든 데이터는 '테스트' 표시)
 */
import { isDevApi } from '@/config';
</script>

<template>
  <div class="tband" role="note">
    <template v-if="isDevApi">
      <b>개발 모드 · 운영 데이터</b>
      <span>운영 API 서버와 운영 DB 를 써요. 테스트 사번으로 만든 신청·하트·쪽지는 '테스트'로 표시되고 일반 사용자에게는 보이지 않아요.</span>
    </template>
    <template v-else>
      <b>개발 모드 · 가짜 데이터</b>
      <span>가짜 데이터로 동작해요. 입력한 내용은 이 브라우저에만 저장되고 다른 사람과 공유되지 않아요. 실제 개인정보는 넣지 마세요.</span>
    </template>
  </div>
</template>

<style scoped>
.tband {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 10px;
  padding: 6px 16px;
  background: repeating-linear-gradient(-45deg, #2e3160, #2e3160 12px, #343868 12px, #343868 24px);
  color: #e9e9f6;
  font-size: 12.5px;
  text-align: center;
}
.tband b {
  color: #f2c94c;
}
</style>
