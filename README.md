# 사緣 (사연) · 사내 인연 매칭

삼성전자 DS부문 임직원 전용 비공개 소개팅 매칭 시스템. 설계는 [docs/DESIGN.md](docs/DESIGN.md).

## 실행 (UI + 가짜 데이터)

```bash
cd client
npm install
npm run dev
```

`http://localhost:5173` — 서버 없이 브라우저 안의 가짜 DB로 동작한다(`.env.development`의 `VITE_API_MODE=mock`).

- 테스트 계정·관리자 비밀번호: `client/src/api/mock/seed.js` 상단 (`TEST_ACCOUNTS`, `MOCK_PASSWORD`, `MOCK_ADMIN_PASSWORD`)
- 로그인 화면·관리자 팝업의 "개발 모드" 버튼으로 바로 채울 수 있다
- 가짜 데이터 초기화: 관리자 사이드바 하단 버튼

## DevExtreme 라이선스 등록 (직접 해야 함)

등록 전에는 화면 상단에 평가판 배너가 뜬다.

1. 키를 환경 변수 `DevExpress_License`에 넣거나 `%APPDATA%\DevExpress\DevExpress_License.txt`에 저장
2. `client`에서 `npx devextreme-license --out src/.devextreme/license-key.js` 실행 (이 파일은 `.gitignore` 대상 — 커밋 금지)
3. `src/main.js`에서 `import { licenseKey } from './.devextreme/license-key';` 후 `config({ licenseKey, ... })`
4. 빌드 서버에서도 1번 환경 변수를 설정하고 빌드 전에 2번을 실행

## 운영 빌드

`npm run build` → `.env.production`(`VITE_API_MODE=server`)이 적용되어 mock 코드·테스트 계정은 번들에 포함되지 않는다. `/api`는 `server/`(다음 단계)가 제공한다.

## 사내망 참고

- 폰트까지 전부 npm 번들이라 외부 CDN 접근이 필요 없다
- `npm install`이 막히면 사내 npm 미러(Nexus 등)를 쓰거나, 빌드 산출물(`client/dist`)만 반입한다
- 브랜드 색을 바꾸려면 `scripts/build-theme.cjs`를 고친 뒤 `npm run theme`
