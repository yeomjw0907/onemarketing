# 서비스·상품·캠페인 구조화 데이터 점검

## 발견과 수정

| 대상 | 기존 상태 | 수정 |
| --- | --- | --- |
| 서비스 소개 | 일반 AboutPage와 조직 참조만 존재 | 조직/사이트를 동일한 ID로 연결하고 실제 서비스 3개의 설명·목록·BreadcrumbList 추가 |
| 마케팅 상품 | 가격 비공개인 서비스 목록인데 구체적인 목록 설명 없음 | CollectionPage + ItemList + Service로 셀프 모집·콘텐츠 제작·운영 옵션을 표현. 로그인된 견적 화면에는 공개 서비스 목록 스키마를 출력하지 않음 |
| 캠페인 목록 | 클라이언트 API 조회 뒤 목록 표시. API는 robots.txt에서 수집 제한 | 공개 목록을 서버 HTML에 렌더링. 화면의 기본 정렬·첫 9건과 일치하는 ItemList와 경로 추가 |
| 캠페인 상세 | 모든 상세가 noindex이고 서버에는 개별 제목·요약 없음 | 공개 요약만 서버 렌더링. 개별 제목·설명·대표 URL·공유 메타데이터·BreadcrumbList 제공. 공개 모집 중인 건만 index 허용 |
| 사이트맵 | 고정 공개 페이지 7개만 포함 | 7개 기본 페이지 + 실제 공개 모집 중인 캠페인을 동적으로 포함 |
| 종료·비공개·잘못된 주소 | 상세 경로 자체가 일반 화면을 반환 | 종료 캠페인은 noindex 유지. 미결제·미리보기·비공개/존재하지 않는 캠페인은 404와 noindex. 다시 캠페인을 찾는 안내 제공 |
| 필터 검색 URL | 대표 목록과 같은 검색 허용 상태 | 대표 URL은 `/campaigns`로 통일하고 쿼리 변형은 noindex/follow. 개인 관심 목록이나 필터 결과에 기본 목록 스키마를 잘못 붙이지 않음 |

서비스 설명은 화면과 JSON-LD가 같은 `service-offerings.ts`를 사용한다. 경로도 화면에 실제로 표시한다. 목록의 가격·평점·리뷰를 만들지 않았고, 참여 리워드를 상품 판매 가격으로 표현하지 않았다. 캠페인을 채용 공고나 행사로 표시하지 않았다. 원래 공개 요약에 포함된 제목·브랜드·일정·혜택만 서버로 전달하며 가이드·제품 상세·개인 지원·계좌 정보는 공개 스키마/초기 데이터에 추가하지 않는다.

## 검증

- 전체 테스트 339개 통과. 공개 SEO/캠페인 공개 범위/기존 주문·정산 관련 15개를 집중 검증했다.
- 타입 검사, 운영 빌드, `git diff --check` 통과.
- 격리 DB와 운영 빌드에서 실제 주문 접수·가상 입금 확인으로 공개/미리보기/미결제/완료 캠페인을 만들고 HTTP로 검증했다. 운영에 가짜 캠페인·주문을 만들지 않았다.
- 공개 상세 200/index, 완료 상세 200/noindex, 미결제·미리보기·잘못된 ID 404/noindex, 쿼리 목록 noindex/canonical, 사이트맵 선별을 확인했다.
- 익명 HTML에는 비공개 가이드·제품 상세가 없으며 익명 상세 API도 `details:null`이다. 인증된 참여자의 기존 API 가이드 접근은 유지되는 것을 확인했다.
- Yeti User-Agent 요청에서 제목·대표 URL이 초기 `<head>`에 들어가는 것을 확인했다.
- 서비스·상품·공개 상세 화면과 모바일 화면을 확인했다. 390px 캠페인 상세에서 페이지 가로 넘침이 없었다.
- Schema.org 공식 검사기에 서비스 소개의 실제 JSON-LD 코드를 제출해 오류 0개·경고 0개를 확인했다. Google URL 기반 리치 결과 검사는 배포 후 별도 확인한다.

운영의 익명 캠페인 목록은 점검 당시 0건이었다. 실제 모집 캠페인이 생기면 같은 공개 판정으로 목록·상세·사이트맵에 반영된다. 가짜 목록 항목이나 현재 시각을 이용한 허위 수정일을 생성하지 않는다. 홈페이지의 조직/사이트 정보와 기존 비공개 페이지의 noindex·인증 설정은 유지한다.

## 검색 결과 해석

`Service`와 일반 `ItemList`는 서비스/목록 의미를 설명하는 구조화 데이터다. 이를 추가했다고 Google 상품 리치 결과 대상이 되지는 않는다. 이번에 Google의 지원 대상에 맞춰 추가한 검색 표현은 경로(`BreadcrumbList`)다. 기술 검증 통과와 실제 색인/검색 표현 노출은 별개이며 재수집과 검색엔진 판단이 필요하다.

근거: [Google 구조화 데이터 정책](https://developers.google.com/search/docs/appearance/structured-data/sd-policies), [경로 구조화 데이터](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb), [상품 스니펫의 단일 상품 조건](https://developers.google.com/search/docs/appearance/structured-data/product-snippet), [Schema.org Service](https://schema.org/Service), [ItemList](https://schema.org/ItemList).
