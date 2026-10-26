# 3D 브랜드 오브젝트 배치

동일 이미지를 모든 배너에 반복하지 않는다. 파랑·크롬의 재질과 조명을 공유하고, 의미에 맞는 다른 형태를 배치한다.

| 위치 | 이미지 | 역할 |
| --- | --- | --- |
| 메인 | linked-rings-v1.webp | 브랜드와 체험단의 연결 |
| 서비스 소개 히어로 | about-ribbon-v1.webp | 준비부터 게시까지 이어지는 흐름 |
| 상품 안내 히어로 | product-blocks-v1.webp | 필요한 상품의 선택과 조합 |
| 셀프 모집 설명 | recruit-orbs-v1.webp | 참여자가 모이는 모습, 작은 포인트 |
| 콘텐츠 패키지 설명 | content-pages-v1.webp | 콘텐츠 제작, 작은 포인트 |
| 운영 대행 설명 | managed-check-v1.webp | 진행과 완료 확인, 작은 포인트 |
| AI 연결 안내·문서 제목 옆 | ai-connector-v1.webp | AI와 플랫폼의 도구 연결 |

파일은 모두 `public/images/brand/`에 있다. 메인 링은 승인 시안을 유지한다. 새 이미지 6개는 내장 이미지 생성 도구로 투명 배경에 생성하고 WebP로 최적화했다. 히어로는 960px, 작은 포인트는 320px 원본을 사용한다. 작은 포인트는 지연 로드한다. 실제 캠페인 사진·데이터 표·작성 폼에는 장식 이미지를 넣지 않는다.

검증: 프로덕션 빌드와 격리 DB의 실제 HTTP 역할·주문·지원·검수·환불·MCP 검증 통과. 320/390/768/1440px에서 메인·소개·상품·AI 문서 16개 조합의 이미지 로드, 용도별 다른 이미지 배치, 작은 상품 포인트 세 종류, 가로 넘침·문구 겹침 없음, 페이지당 h1 하나, 상품 구성 앵커 이동을 확인했다.

프롬프트 공통 조건: isolated premium 3D object, transparent background, glossy brand blue #3182f6 and deep cobalt, polished mirror silver, restrained cyan reflections, soft controlled studio lighting, precise beveled edges, square centered frame with transparent padding. No text, logo, UI, people, robot, watermark or ground plane.

개별 피사체 프롬프트:

- about-ribbon: one continuous broad metallic ribbon folded into an open rising asymmetric sculptural loop with three elegant architectural folds. A single clean ribbon, not a torus, not an interlocking ring. Conveys the flow from creating content to publishing.
- product-blocks: a carefully composed stack of three rounded beveled rectangular modules, offset horizontally as if choosing and assembling a custom set. Two blue modules and one silver module, substantial thickness, precise industrial geometry.
- recruit-orbs: a compact cluster of three polished spheres of different sizes, one large cobalt sphere at the back and two smaller silver-blue spheres in front. Abstract people coming together. No literal faces.
- content-pages: three thin rectangular sheets fanning apart slightly, like content pages or image prints, floating as a compact single stack. Top sheet polished blue with a simple embossed raised geometric triangle on its face, inner sheets silver. Three-quarter tilted view. No writing.
- managed-check: one thick sculptural check mark, gently beveled rounded ends, cobalt-blue front face and mirror silver side walls, tilted slightly in three-quarter view. No surrounding disc or badge.
- ai-connector: two abstract chunky machined connector blocks approaching each other with a small visible gap between matching ends. One cobalt blue and one mirror silver with blue side faces, each has two short square teeth that would interlock. Diagonal horizontal composition, no cables.
