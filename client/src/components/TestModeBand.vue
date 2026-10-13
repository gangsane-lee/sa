<script setup>
/** 테스트 운영 표시 — 실제 정보 입력을 막기 위해 모든 화면 맨 위에 띄운다 */
</script>

<template>
  <div class="tband" role="note">
    <b>테스트 운영 중</b>
    <span>가짜 데이터로 동작해요. 입력한 내용은 이 브라우저에만 저장되고 다른 사람과 공유되지 않아요. 실제 개인정보는 넣지 마세요.</span>
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
