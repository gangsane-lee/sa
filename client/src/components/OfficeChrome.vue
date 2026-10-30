<script setup>
/**
 * 오피스 모드 겉모습 — 상단 리본·수식줄·열 머리글, 왼쪽 행 번호, 아래 시트 탭(=메뉴)과 상태 표시줄.
 * 실제 화면은 그 사이에서 그대로 동작한다. 시트 탭이 메뉴 역할을 한다.
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { setOffice } from '@/stores/office';
import { session, unread } from '@/stores/session';

const route = useRoute();
const router = useRouter();
const isAdmin = computed(() => route.matched.some((r) => r.meta.admin));

const USER_TABS = [
  { name: 'home', text: '요약' },
  { name: 'saju', text: '분석' },
  { name: 'messages', text: '회신' },
  { name: 'mypage', text: '기본정보' },
  { name: 'voc', text: '의견' },
];
const ADMIN_TABS = [
  { name: 'admin-dashboard', text: '요약' },
  { name: 'admin-applicants', text: '명단' },
  { name: 'admin-matching', text: '대응' },
  { name: 'admin-messages', text: '회신' },
  { name: 'admin-reviews', text: '평가' },
  { name: 'admin-voc', text: '의견' },
  { name: 'admin-codes', text: '코드' },
  { name: 'admin-settings', text: '설정' },
  { name: 'admin-audit', text: '로그' },
];
const tabs = computed(() => (isAdmin.value ? ADMIN_TABS : USER_TABS));
const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const ROWS = Array.from({ length: 120 }, (_, i) => i + 1);
const cell = computed(() => `${COLS[(route.path.length * 3) % 8 + 1]}${(route.path.length % 17) + 2}`);
const formula = computed(() => (isAdmin.value ? '=COUNTIFS(명단!F:F,"검토",명단!C:C,">=2026-10-01")' : '=SUMIFS(실적!D:D,실적!B:B,$B$2,실적!C:C,">="&DATE(2026,10,1))'));
</script>

<template>
  <div class="oc" aria-hidden="false">
    <header class="oc__top">
      <div class="oc__title">
        <span class="oc__qa">
          <i class="dx-icon-save" /><i class="dx-icon-undo" /><i class="dx-icon-redo" />
        </span>
        <span class="oc__doc">통합 문서1 - 저장됨</span>
        <span class="oc__user">{{ session.user?.user_name ?? '' }}</span>
      </div>
      <nav class="oc__ribbon-tabs">
        <span>파일</span><span class="is-on">홈</span><span>삽입</span><span>페이지 레이아웃</span><span>수식</span><span>데이터</span><span>검토</span><span>보기</span>
      </nav>
      <div class="oc__ribbon">
        <span class="oc__grp"><i class="dx-icon-paste" /><i class="dx-icon-copy" /><i class="dx-icon-cut" /></span>
        <span class="oc__grp"><span class="oc__font">맑은 고딕</span><span class="oc__size">11</span><b>B</b><i>I</i><u>U</u></span>
        <span class="oc__grp"><i class="dx-icon-alignleft" /><i class="dx-icon-aligncenter" /><i class="dx-icon-alignright" /></span>
        <span class="oc__grp"><span>%</span><span>,</span><span>.0</span></span>
        <span class="oc__grp oc__hide-sm"><span>조건부 서식</span><span>표 서식</span><span>셀 스타일</span></span>
        <span class="oc__grp oc__hide-sm"><i class="dx-icon-sortuptext" /><i class="dx-icon-filter" /><i class="dx-icon-find" /></span>
      </div>
      <div class="oc__fbar">
        <span class="oc__name">{{ cell }}</span>
        <span class="oc__fx">fx</span>
        <span class="oc__formula">{{ formula }}</span>
      </div>
      <div class="oc__cols">
        <span class="oc__corner" />
        <span v-for="c in COLS" :key="c">{{ c }}</span>
      </div>
    </header>

    <div class="oc__rows">
      <span v-for="r in ROWS" :key="r">{{ r }}</span>
    </div>

    <footer class="oc__bottom">
      <nav class="oc__sheets" aria-label="메뉴">
        <span class="oc__nav">◀ ▶</span>
        <button
          v-for="t in tabs"
          :key="t.name"
          type="button"
          class="oc__sheet"
          :class="{ 'is-on': route.name === t.name }"
          @click="router.push({ name: t.name })"
        >
          {{ t.text }}{{ t.name === 'messages' && unread.count ? ` (${unread.count})` : '' }}
        </button>
        <span class="oc__add">+</span>
      </nav>
      <div class="oc__status">
        <span>준비</span>
        <span class="oc__sum">평균: 0 &nbsp; 개수: 3 &nbsp; 합계: 0</span>
        <button type="button" class="oc__exit" title="보통 화면 (Ctrl+Shift+E)" @click="setOffice(false)">▦ 기본 보기</button>
        <span>100%</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.oc {
  font-family: 'Malgun Gothic', '맑은 고딕', 'Segoe UI', sans-serif;
  font-size: 12px;
  color: #262626;
}
.oc__top {
  position: fixed;
  inset: 0 0 auto 0;
  z-index: 1500;
  background: #fff;
}
.oc__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 30px;
  padding: 0 10px;
  background: #217346;
  color: #fff;
}
.oc__qa {
  display: flex;
  gap: 10px;
}
.oc__qa i {
  font-size: 14px;
  color: #fff;
}
.oc__doc {
  font-size: 12px;
}
.oc__user {
  font-size: 12px;
  opacity: 0.9;
}
.oc__ribbon-tabs {
  display: flex;
  gap: 2px;
  height: 26px;
  align-items: stretch;
  padding: 0 6px;
  background: #217346;
  color: #fff;
  overflow: hidden;
}
.oc__ribbon-tabs span {
  display: grid;
  place-items: center;
  padding: 0 12px;
  white-space: nowrap;
  flex-shrink: 0;
}
.oc__ribbon-tabs span.is-on {
  background: #f3f3f3;
  color: #217346;
}
.oc__ribbon {
  display: flex;
  gap: 2px;
  height: 34px;
  align-items: center;
  padding: 0 8px;
  background: #f3f3f3;
  border-bottom: 1px solid #d4d4d4;
  overflow: hidden;
  white-space: nowrap;
}
.oc__grp {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 0 12px;
  border-right: 1px solid #d4d4d4;
}
.oc__grp i {
  font-size: 14px;
  color: #444;
}
.oc__font,
.oc__size {
  padding: 1px 6px;
  border: 1px solid #c8c8c8;
  background: #fff;
}
.oc__font {
  min-width: 80px;
}
.oc__fbar {
  display: flex;
  align-items: center;
  height: 24px;
  border-bottom: 1px solid #d4d4d4;
  background: #fff;
}
.oc__name {
  width: 80px;
  padding-left: 6px;
  border-right: 1px solid #d4d4d4;
}
.oc__fx {
  width: 34px;
  text-align: center;
  font-style: italic;
  color: #777;
  border-right: 1px solid #d4d4d4;
}
.oc__formula {
  padding-left: 8px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.oc__cols {
  display: flex;
  height: 20px;
  background: #f3f3f3;
  border-bottom: 1px solid #c8c8c8;
  overflow: hidden;
}
.oc__corner {
  flex: none;
  width: 36px !important;
  border-right: 1px solid #c8c8c8;
}
.oc__cols span {
  flex: none;
  display: grid;
  place-items: center;
  width: 72px;
  border-right: 1px solid #dadada;
  color: #555;
}
.oc__rows {
  position: fixed;
  top: 134px;
  bottom: 48px;
  left: 0;
  z-index: 1400;
  width: 36px;
  overflow: hidden;
  background: #f3f3f3;
  border-right: 1px solid #c8c8c8;
}
.oc__rows span {
  display: grid;
  place-items: center;
  height: 20px;
  border-bottom: 1px solid #dadada;
  color: #555;
  font-size: 11px;
}
.oc__bottom {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 1500;
  background: #fff;
}
.oc__sheets {
  display: flex;
  align-items: stretch;
  height: 26px;
  padding-left: 6px;
  border-top: 1px solid #c8c8c8;
  background: #f3f3f3;
  overflow-x: auto;
}
.oc__nav {
  display: grid;
  place-items: center;
  padding: 0 10px;
  color: #999;
}
.oc__sheet {
  padding: 0 16px;
  border: 0;
  border-right: 1px solid #d4d4d4;
  background: transparent;
  color: #333;
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.oc__sheet.is-on {
  background: #fff;
  color: #217346;
  font-weight: 700;
  box-shadow: inset 0 -2px 0 #217346;
}
.oc__add {
  display: grid;
  place-items: center;
  padding: 0 12px;
  color: #777;
}
.oc__status {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 22px;
  padding: 0 10px;
  background: #217346;
  color: #fff;
  font-size: 11px;
}
.oc__sum {
  margin-left: auto;
}
.oc__exit {
  border: 0;
  background: transparent;
  color: #fff;
  font: inherit;
  cursor: pointer;
  opacity: 0.85;
}
.oc__exit:hover {
  opacity: 1;
  text-decoration: underline;
}
@media (max-width: 700px) {
  .oc__hide-sm {
    display: none;
  }
}
</style>
