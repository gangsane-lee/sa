<script setup>
/**
 * 개인정보 처리 안내 — 신청서 동의 화면에서 링크.
 * 문구 확정 전 사내 정보보호·개인정보 담당 부서 검토 필요 (초안)
 */
</script>

<template>
  <div class="privacy">
    <div class="container">
      <article class="doc">
        <p class="eyebrow">사緣 · 개인정보 처리 안내</p>
        <h1 class="display">내 정보는 이렇게 다뤄져요</h1>
        <p class="lead">사緣은 사내 소개팅을 위해 꼭 필요한 정보만 받고, 다른 신청자에게는 최소한만 보여줘요.</p>

        <section>
          <h2>1. 받는 정보</h2>
          <table>
            <thead>
              <tr><th scope="col">구분</th><th scope="col">항목</th><th scope="col">어디서</th></tr>
            </thead>
            <tbody>
              <tr><td>필수</td><td>사번, 이름, 사업부·팀</td><td>사내 인사정보(직접 입력 아님, 수정 불가)</td></tr>
              <tr><td>필수</td><td>성별, 생년월일, 키 구간, 체형, 얼굴상, 외모(자기 평가), MBTI, 취미, 음주, 흡연, 선호 나이, 선호 우선순위</td><td>신청서</td></tr>
              <tr><td>선택</td><td>태어난 시간, 캠퍼스·건물, 사는 곳, 코멘트, 그 밖의 선호 항목</td><td>신청서</td></tr>
              <tr><td>선택(민감정보)</td><td>종교 — 별도 동의한 경우에만</td><td>신청서</td></tr>
              <tr><td>이용 중 생성</td><td>하트·매칭 내역, 쪽지, 후기(만남 결과·평가·코멘트), 개선의 소리</td><td>서비스 이용</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>2. 누가 무엇을 보나요</h2>
          <ul>
            <li><b>다른 신청자</b>: 이름 초성(ㄱㅎㄴ), 만 나이, 사업부, 캠퍼스, 키·체형·얼굴상, MBTI, 음주·흡연, 취미 3개, 코멘트 앞부분만 봐요.</li>
            <li><b>보이지 않는 것</b>: 이름 원문, 사번, 팀, 건물, 생년월일·시간, 외모, 종교, 사는 곳, 내가 받은 평가.</li>
            <li><b>나 자신</b>: 신청 후에는 내 이름도 초성으로 보여요. 상태는 '매칭 대기 중 / 매칭 중 / 커플 성사' 세 가지만 보여요. (검토·보류·거절 같은 내부 상태는 보이지 않아요)</li>
            <li><b>매칭 담당자</b>: 매칭 업무를 위해 이름을 포함한 신청서 전체와 후기를 볼 수 있어요. 상세 열람·수정·삭제·내려받기는 모두 기록이 남고, 그 기록은 고치거나 지울 수 없어요.</li>
            <li><b>쪽지</b>: 매칭 상대와 주고받은 쪽지는 신고 대응·운영을 위해 매칭 담당자가 열람할 수 있고, 열람할 때마다 기록이 남아요.</li>
            <li><b>후기의 평가·코멘트</b>는 담당자만 보고, 상대에게는 어떤 형태로도 전하지 않아요.</li>
          </ul>
        </section>

        <section>
          <h2>3. 이용 목적</h2>
          <p>후보 추천과 매칭, 매칭 결과 안내(사내 메일), 서비스 품질 관리(후기·싫어요 제재), 서비스 개선(개선의 소리)에만 써요. 인사 평가·조직 관리 등 다른 목적에는 쓰지 않아요.</p>
        </section>

        <section>
          <h2>4. 제3자 제공</h2>
          <p>하지 않아요. 사내 다른 시스템이나 소속 조직, 외부 업체에 전달하지 않아요.</p>
        </section>

        <section>
          <h2>5. 보관과 파기</h2>
          <ul>
            <li>신청을 철회하면 신청서·하트·매칭·쪽지·후기 내역을 <b>즉시</b> 지워요.</li>
            <li>매칭이 끝난 뒤 6개월이 지나면 파기해요.</li>
            <li>싫어요 제재는 재가입으로 피할 수 없도록 <b>횟수만</b> 사번 기준으로 6개월 보관해요. 후기 내용은 남기지 않아요.</li>
            <li>개선의 소리는 서비스 개선 기록으로 남기되, 철회하면 작성자와의 연결을 끊어요.</li>
          </ul>
        </section>

        <section>
          <h2>6. 안전 조치</h2>
          <ul>
            <li>사내 계정(AD)으로만 로그인하고 비밀번호는 저장하지 않아요.</li>
            <li>이름은 암호화해 저장하고, 전 구간 암호화 통신(TLS)을 써요. 외부 CDN을 쓰지 않아요.</li>
            <li>관리자는 별도 비밀번호로 한 번 더 확인하고, 30분 동안 활동이 없으면 자동으로 나가요.</li>
            <li>일반 임직원의 방문 사실은 관리자 화면에 남기지 않아요.</li>
          </ul>
        </section>

        <section>
          <h2>7. 나의 권리</h2>
          <p>언제든 신청서를 고치거나(매칭 중에는 대기 중으로 바뀐 뒤) 철회할 수 있어요. 동의하지 않을 수 있지만, 필수 항목에 동의하지 않으면 신청할 수 없어요. 궁금한 점은 '개선의 소리'로 남겨주세요.</p>
        </section>

        <p class="draft">이 안내는 초안이에요. 운영 전 사내 정보보호·개인정보 담당 부서의 검토를 거쳐 확정해요.</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.privacy {
  padding: clamp(24px, 4vw, 48px) 0 72px;
}
.doc {
  max-width: 820px;
  margin: 0 auto;
  padding: clamp(20px, 4vw, 44px);
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
  font-size: clamp(24px, 3vw, 34px);
  color: var(--c-indigo);
}
.lead {
  margin-top: 8px;
  color: var(--c-ink-2);
}
section {
  margin-top: 28px;
}
h2 {
  font-size: 17px;
  color: var(--c-indigo);
  margin-bottom: 8px;
}
p,
li {
  color: var(--c-ink-2);
  font-size: 14.5px;
}
ul {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 1.2em;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
th,
td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--c-line);
  text-align: left;
  vertical-align: top;
}
th {
  color: var(--c-mute);
  font-weight: 600;
  font-size: 13px;
}
td:first-child {
  white-space: nowrap;
  font-weight: 600;
}
.draft {
  margin-top: 28px;
  padding: 10px 14px;
  border-radius: var(--r-md);
  background: #f6edd6;
  color: var(--c-moon-ink);
  font-size: 13px;
}
@media (max-width: 560px) {
  table,
  thead,
  tbody,
  tr,
  td,
  th {
    display: block;
  }
  thead {
    display: none;
  }
  tr {
    padding: 8px 0;
    border-bottom: 1px solid var(--c-line);
  }
  td {
    border: 0;
    padding: 2px 0;
  }
}
</style>
