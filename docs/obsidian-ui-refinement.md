# Obsidian UI 적용과 모션 기준

## 적용 범위

- [Discover Button](https://www.obsidianui.dev/docs/discover-button): 공개 registry의 버튼 TSX/CSS를 실제로 가져와 수정했다. Next Link, 기존 lucide 아이콘, 파랑 #3182f6, 8px 라디우스, 44px 이상 높이로 맞췄다. 배너와 견적 진입에 사용한다. 기존 큰 원형·66px 버튼 스타일은 사용하지 않는다.
- [Dashboard Shell](https://www.obsidianui.dev/docs/dashboard-shell): 선택된 탭의 옅은 배경, 명확한 필터 그룹, 낮은 대비의 표 헤더와 구분선 처리를 참고했다. 기존 광고주·관리자·체험단 화면의 업무 흐름을 유지하며 스타일을 정돈했다. 샘플 대시보드나 가상 통계는 가져오지 않는다.
- 원본 라이선스와 소스 주소는 `THIRD_PARTY_NOTICES.md`에 보존했다. Obsidian 패키지나 Tailwind 전체, 별도 애니메이션 라이브러리를 추가하지 않았다.

## 화면과 모션

기존 파랑·글꼴·라디우스와 충분한 여백을 유지하고, 반복 장식보다 선택 상태와 행동의 구분을 명확히 한다. 공개 안내 → 상품 구성 → 견적 진입의 흐름을 유지한다.

1. 배너 문구는 540ms, 오브젝트는 800ms의 짧은 등장으로 시선을 정리한다. 계속 떠다니거나 회전하지 않는다.
2. 소개·문서의 주요 섹션은 뷰포트에 들어올 때 한 번만 420ms 동안 가볍게 등장한다. CSS 기본 상태는 항상 보이며 JS가 없어도 본문이 숨겨지지 않는다.
3. 버튼과 필터는 약 160ms 상태 변화, Discover CTA는 320ms 채움 효과를 사용한다. 터치에서는 hover 효과를 강제하지 않고, 키보드 focus-visible도 지원한다.

작성 폼, 결제, 작업 큐와 캠페인 결과 목록 전체는 스크롤 등장 대상으로 삼지 않는다. 포커스나 입력 때 폼을 다시 마운트하지 않는다. 페이지 이동과 unmount 시 observer·실행 중인 애니메이션을 정리한다.

`prefers-reduced-motion`에서는 CSS 모션과 전환을 끄고, Web Animations 실행을 생략한다. 실행 중 설정을 바꾸는 경우에도 활성 애니메이션을 취소한다.

## 검증

프로덕션 빌드, 타입 검사, 의존성 audit(취약점 0), 격리 DB의 실제 HTTP 주문·입금·지원·검수·환불·MCP 검증 통과. 브라우저에서는 320/390/768/1440px의 메인·소개·상품·AI·로그인 20개 조합, 세 역할의 모바일 마이페이지, 선택 탭의 aria-pressed 상태, Discover 호버의 실제 채움 폭·텍스트 대비, 섹션 1회 재생, reduced-motion의 CSS/JS 효과 해제, JavaScript 없는 본문 노출을 확인했다.
