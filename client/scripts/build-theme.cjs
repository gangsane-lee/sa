/**
 * DevExtreme 커스텀 테마 생성 스크립트
 * - 기준 테마: Fluent SaaS Light
 * - 브랜드 색(홍실 #C8243F)과 본문 서체를 반영해 src/styles/dx.sayeon.css 를 만든다.
 * 실행: npm run theme   (색을 바꿀 때만 다시 실행하면 됨. 결과 CSS는 커밋한다)
 */
const fs = require('fs');
const path = require('path');
const { buildTheme } = require('devextreme-themebuilder');

const OUT = path.join(__dirname, '..', 'src', 'styles', 'dx.sayeon.css');

buildTheme({
  command: 'build-theme',
  baseTheme: 'fluent.saas.light',
  outputColorScheme: 'sayeon',
  items: [
    { key: '$base-accent', value: '#C8243F' },
    { key: '$base-text-color', value: '#1B1B24' },
    { key: '$base-font-family', value: "'IBM Plex Sans KR', 'Malgun Gothic', sans-serif" },
  ],
})
  .then((result) => {
    fs.writeFileSync(OUT, result.css);
    // 테마 CSS가 참조하는 아이콘 폰트(icons/dxiconsfluent.*)를 함께 복사
    const iconSrc = path.join(path.dirname(require.resolve('devextreme/package.json')), 'dist', 'css', 'icons');
    const iconDst = path.join(path.dirname(OUT), 'icons');
    fs.mkdirSync(iconDst, { recursive: true });
    for (const f of fs.readdirSync(iconSrc).filter((n) => n.startsWith('dxiconsfluent'))) {
      fs.copyFileSync(path.join(iconSrc, f), path.join(iconDst, f));
    }
    console.log(`[theme] ${path.relative(process.cwd(), OUT)} (${(result.css.length / 1024).toFixed(0)} KB)`);
  })
  .catch((err) => {
    console.error('[theme] 생성 실패', err);
    process.exit(1);
  });
