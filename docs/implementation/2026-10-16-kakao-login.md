# 카카오 기본 로그인 및 참여자 계정 연결 (2026-10-16)

- 참여자 기본 진입: /participants/portal. 알림톡의 기존 공통 버튼 주소 유지.
- 서버 OAuth code 교환, 클라이언트 시크릿 사용, HttpOnly/Secure/Lax state 쿠키와 DB 10분 state 단일 사용 검증.
- 사용자 ID로 연결. 이름·닉네임·개인 접속 링크만으로 로그인하거나 기존 참여자에 자동 연결하지 않음.
- 기존 참여자: 카카오 로그인 → 등록 이름/번호로 연결 요청 → 관리자 체험단 관리 첫 화면의 '카카오 계정 연결 요청'에서 기존 연락처 확인 근거를 남기고 승인.
- 신규 참여자: 카카오 로그인 상태에서 체험단 신청 → 서버가 신뢰한 카카오 ID를 신청에 보관 → 신청 승인 시 계정 연결. 클라이언트가 보낸 ID는 무시.
- 카카오 계정 하나당 참여자 한 명, 참여자 한 명당 카카오 계정 하나. DB 트랜잭션과 공유 잠금으로 동시 연결 충돌 방지.
- 로그인 세션 30일. 개인 링크와 세션은 별도 난수이며 DB에는 해시만 저장. 로그아웃/링크 재발급/활동 중단/전화번호 변경 시 세션 차단.
- 개인 링크 재발급은 카카오 영구 연결을 지우지 않음. 다음 카카오 로그인으로 새 세션 발급.
- 채널 추가 관련 plusfriends는 선택 동의. 채널 추가 여부를 로그인 자격이나 서비스 내 광고 수신동의와 동일하게 취급하지 않음.
- 기존 비즈 앱 1056843의 원케이션 대표 채널 연결 사용. 전용 REST 키 onemarketing-participants와 클라이언트 시크릿 생성. 기존 키/대표 키는 변경하지 않음.
- 환경변수 KAKAO_LOGIN_ENABLED, KAKAO_CLIENT_ID, KAKAO_CLIENT_SECRET, APP_URL. 서버 비밀값은 Vercel production에만 저장.
- 콜백 https://www.onemarketing.kr/api/auth/kakao/callback.
- 연결 해제 웹훅 POST /api/auth/kakao/unlink: 대표 어드민 키와 app_id 검증, 연결·미완료 사용자 정보 제거, 기존 세션 접근 차단. 업무/정산 기록은 유지. KAKAO_WEBHOOK_ADMIN_KEY, KAKAO_APP_ID 설정 필요.
- 기존 SMS 인증 코드는 별도 보조 경로로 유지하며 SMS 설정이 없으면 통과시키지 않음. 기본 카카오/관리자 확인 흐름에는 SMS 등록 불필요.
- 알림톡 검수 자동 확인 및 자동 테스트는 사용자 요청으로 중지된 상태 유지.

## 검증
- 관련 33개 테스트: OAuth 변조/만료/재사용, 연결 요청·거절·승인, 중복 연결 동시성, 연결 해제, 신규 신청 수정 후 승인 연결, 클라이언트 ID 위조, 기존 작업·정산·추천료, OTP 보조 경로.
- production build 및 타입 검사 통과.
- 격리된 QA DB와 카카오 API 모의 응답으로 브라우저에서 로그인 → 연결 요청 → 관리자 승인 → 내 작업 → 새로고침 → 로그아웃 → 카카오 재로그인 확인.
- 참여자 화면 1440/390/360px 확인, 가로 넘침 없음. 실제 카카오 OAuth 확인은 production 배포 후 별도 진행.

공식 문서:
- https://developers.kakao.com/docs/ko/kakaologin/rest-api
- https://developers.kakao.com/docs/ko/kakaotalk-channel/common
- https://developers.kakao.com/docs/ko/kakaologin/callback
