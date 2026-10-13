/**
 * DevExtreme 차트 테마 — 본문 서체와 차분한 축/격자 색을 맞춘다.
 * 계열 색: 남색(#3B3F7A) · 장미색(#D9677E). 명도 차이가 커서 색각이상이어도 구분되며,
 * 항상 범례·수치 라벨·표와 함께 쓴다(색만으로 구분하지 않음).
 */
import { registerTheme } from 'devextreme/viz/themes';

export const VIZ_THEME = 'sayeon.viz';
export const SERIES = { male: '#3B3F7A', female: '#D9677E', single: '#3B3F7A' };
/** 사업부 비율(도넛) — 명도 차이가 큰 순서로. 라벨에 이름·%를 함께 써서 색에만 기대지 않는다 */
export const PIE_PALETTE = ['#1428A0', '#C8243F', '#7E82C2', '#E8A0AE', '#8A8FA3', '#B07D12'];

registerTheme(
  {
    name: VIZ_THEME,
    font: { family: "'IBM Plex Sans KR', 'Malgun Gothic', sans-serif", color: '#3F3F52', size: 12 },
    backgroundColor: '#FFFFFF',
    chart: {
      commonAxisSettings: {
        color: '#E3E2EC',
        grid: { color: '#EEEDF3', width: 1 },
        tick: { visible: false },
        label: { font: { color: '#66667A' } },
      },
    },
    legend: { font: { color: '#3F3F52', size: 12 } },
    tooltip: { font: { color: '#1B1B24', size: 12 }, border: { color: '#E3E2EC' }, shadow: { opacity: 0.08 } },
  },
  'generic.light',
);
