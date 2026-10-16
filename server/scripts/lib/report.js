/**
 * 점검·준비 스크립트 공용 출력 — ✔ 정상 / ⚠ 권장 / ✖ 고쳐야 함 + 원인·해결
 */
export function createReport() {
  const counts = { ok: 0, warn: 0, fail: 0 };
  let n = 0;
  const detail = ({ reason, fix } = {}) => {
    if (reason) console.log(`      원인: ${reason}`);
    for (const f of [fix ?? []].flat()) console.log(`      해결: ${f}`);
  };
  return {
    counts,
    section(title) {
      console.log(`\n[${++n}] ${title}`);
    },
    ok(msg) {
      counts.ok += 1;
      console.log(`  ✔ ${msg}`);
    },
    info(msg) {
      console.log(`    · ${msg}`);
    },
    warn(msg, more) {
      counts.warn += 1;
      console.log(`  ⚠ ${msg}`);
      detail(more);
    },
    fail(msg, more) {
      counts.fail += 1;
      console.log(`  ✖ ${msg}`);
      detail(more);
    },
    /** explainDbError 결과를 그대로 ✖ 로 */
    failDb(info) {
      this.fail(info.title, { reason: info.reason, fix: info.fix });
    },
    summary({ okText, failText }) {
      const { ok, warn, fail } = counts;
      console.log(`\n────────────────────────────────────────`);
      console.log(`  ✔ ${ok}   ⚠ ${warn}   ✖ ${fail}`);
      console.log(fail ? `  ${failText}` : `  ${okText}`);
      if (warn && !fail) console.log('  (⚠ 항목은 지금 막히지는 않지만 운영 전에 정리하는 것을 권장해요)');
      console.log('');
      return fail ? 1 : 0;
    },
  };
}
