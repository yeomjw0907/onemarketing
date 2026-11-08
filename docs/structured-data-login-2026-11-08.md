# 공개 검색 정보와 로그인 버튼 점검

## 수정

- 기존 전역 noindex 기본값을 유지하면서 공개 페이지 7곳만 명시적으로 검색 허용: 홈, 캠페인 찾기, 서비스 소개, 마케팅 상품 소개, 이용 가이드, AI·MCP 가이드, 참여 가이드.
- 서비스 소개와 마케팅 상품 소개가 전역 noindex를 상속하던 문제 수정.
- 공개 페이지마다 canonical, 제목·설명, Open Graph·Twitter 메타데이터를 일치시킴. 쿼리·추천 코드가 대표 URL에 포함되지 않음.
- 홈에 Organization·WebSite, 공개 페이지에 WebPage/해당 하위 유형 JSON-LD를 서버에서 렌더링. 실제 서비스명, 기존 브랜드 아이콘, 공개 본문에 있는 설명만 사용.
- 공개 경로 목록을 공유하는 sitemap.xml과 robots.txt 추가. 확인할 수 없는 변경일, 가격·리뷰·별점, 비공개 캠페인·개인 정보는 포함하지 않음.
- 로그인·가입·관리자·개인 포털 등 기존 검색 제외 기본값 유지. robots.txt는 인증 수단이 아니며 개인 정보의 접근 권한을 변경하지 않음.
- 공식 카카오 로그인 리소스의 말풍선 심볼을 원래 비율로 사용. 광고주/참여자/가입 화면에 적용하고 버튼 높이 48px, 간격 12px로 통일. 네이버 비활성 상태 유지.

## 검증

- 구조화 데이터 단위 테스트: 대표 URL/공유 메타데이터/JSON-LD 일치, 홈 조직·웹사이트 식별자, 사이트맵 경로 제한, 스크립트 종료 문자열의 안전한 직렬화.
- 카카오·구글 OAuth 및 추천인 가입→로그아웃→재로그인→첫 캠페인 보상 회귀 테스트.
- TypeScript 검사와 프로덕션 빌드.
- 격리 환경 Googlebot HTTP 검사: 공개 7개 페이지의 canonical·index·설명·JSON-LD, 비공개 4개 페이지의 noindex와 JSON-LD 부재, 사이트맵·robots·이미지 응답.
- 데스크톱과 390px 모바일의 광고주·참여자 화면에서 아이콘 표시, 버튼 높이/간격과 가로 넘침 확인.

## 운영 후 확인 항목

운영 배포가 READY가 된 뒤 같은 HTTP 검사를 다시 실행하고 Schema.org Validator 및 Google Rich Results Test에서 운영 URL을 검사한다. 검색 노출과 검색 결과의 표시 형태는 검색엔진 재수집·정책에 따라 결정되며, 마크업 추가가 노출을 보장하지 않는다.

## 근거

- 설치된 Next.js 16.4.2의 JSON-LD, robots.txt, sitemap.xml 문서
- [Google: Organization](https://developers.google.com/search/docs/appearance/structured-data/organization)
- [Google: 사이트 이름](https://developers.google.com/search/docs/appearance/site-names)
- [카카오 로그인 디자인 가이드](https://developers.kakao.com/docs/ko/kakaologin/design-guide)
- [공식 카카오 로그인 리소스](https://developers.kakao.com/tool/resource/login)
