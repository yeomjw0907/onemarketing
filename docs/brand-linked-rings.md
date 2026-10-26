# 연결된 링 비주얼

사용자가 선택한 1번 시안의 파란색·크롬 링을 메인, 서비스 소개, 공개 상품 안내에 공통 적용한다. 운영 화면과 캠페인 목록 자체에는 장식 이미지를 추가하지 않는다.

- 이미지: `public/images/brand/linked-rings-v1.webp`
- 내장 이미지 생성 도구로 승인 시안에서 글자와 배경을 제거한 투명 PNG를 생성했다. Sharp로 960×960 WebP로 변환했다. 알파 채널 유지, 파일 크기 137,122바이트.
- 배너 문구와 버튼은 실제 HTML이다. 장식 이미지는 빈 대체 텍스트를 사용하며 스크린리더에서 제외한다.
- Next Image의 반응형 이미지 최적화와 명시적인 크기를 사용한다. 첫 화면 이미지에 높은 로드 우선순위를 준다.
- 기존 파랑 #3182f6, 글꼴, 버튼 라디우스 8px, 배너 라디우스 15px를 유지한다. 모바일에서는 그림과 배너 높이를 축소하고 캠페인 탐색을 이어간다.
- 소개 페이지에서는 별도 소개 제목과 홍보 배너를 중복해서 쌓지 않고 하나의 히어로로 합친다.

검증: Next 프로덕션 빌드·타입 검사 통과. 격리 DB의 HTTP 검증에서 주문·입금 확인·지원·검수·환불·MCP와 가격 공개 정책을 확인했다. 실제 브라우저에서 320/390/768/1440px × 메인/소개/상품의 12개 조합을 확인했다. 이미지 로드, 가로 넘침 없음, 문구와 이미지 겹침 없음, 페이지당 h1 하나, CTA 높이 44px 이상, 링크 이동을 검증했다. 모바일 메인 배너 높이는 184~188px다.

최종 이미지 편집 프롬프트:

> Edit the supplied approved banner into a reusable isolated website art asset. KEEP the two interlocking blue/chrome rings, same orientation, proportions, highly polished cobalt #3182f6 and mirror-silver material, subtle cyan highlights and beautiful reflective dimensionality. REMOVE all text, brand name, button, and the entire blue background. Output ONLY the ring sculpture centered and fully visible against genuinely TRANSPARENT background including transparency through both holes. Tight square framing with 6 percent padding around the sculpture, no clipping. No new objects, no text, no watermark, no ground plane. Preserve the reference ring design faithfully. Production quality cutout with clean anti-aliased alpha edges. Avoid recoloring the sculpture or redesigning into ribbon.
