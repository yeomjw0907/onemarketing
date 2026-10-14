# One Marketing

운영자용 마케팅 제작·배포 관리 대시보드. 고객·제품 DB, 유동 견적, 계약·월별 슬롯, 기획·제작·검수, 승인본 ZIP, 전달·게시 확인, 비용·지급을 관리합니다.

## 실행

Node.js 22 이상. 단일 서버의 영속 디스크가 필요합니다.

```powershell
npm ci
Copy-Item .env.example .env.local
# .env.local에 API 키와 APP_URL 설정
npm run setup-admins
npm run dev -- --hostname 127.0.0.1 --port 3107
# 별도 터미널
npm run worker
```

관리자 초기화는 ADMIN_OWNER_PASSWORD, ADMIN_SECOND_PASSWORD를 프로세스 환경변수로 주입한 뒤 실행합니다. 계정 ID는 `yeomjw0907@onecation.co.kr`, `admin@gmail.com`입니다. 비밀번호 원문은 코드에 없습니다. 초기화 후 환경변수는 제거하세요. 이미 생성된 .env.local을 예제 파일로 덮어쓰지 마세요.

`APP_URL`을 실제 브라우저 접속 주소와 일치시키세요. HTTPS 운영에서는 `COOKIE_SECURE=true`를 설정합니다. 이 작업 공간은 `http://127.0.0.1:3107`을 사용합니다.

## AI 설정

`.env.example`의 Anthropic·fal 키를 입력합니다. 모델명은 계정에서 지원하는 모델에 맞춰 변경할 수 있습니다. 웹 구독과 API 결제는 구분하며, Claude Max에서 받은 API 크레딧은 연결된 Console 조직의 키로 사용합니다. 검색 도구 비용과 토큰 사용량은 공급사 청구에서 확인합니다. 키 상태는 설정 화면에서 확인할 수 있지만 실제 호출 성공과는 다릅니다. 서버와 worker를 재시작해야 변경이 적용됩니다.

Claude는 웹 검색·출처 수집·분석·기획·원고를 담당합니다. 조사 호출에만 웹 검색 도구를 제공하며 요청당 검색 최대 5회, 한 실행에서 pause_turn 이어받기 최대 3회로 제한합니다. 검색 출처가 없거나 도구 오류가 나면 기획 진행을 막습니다. Console 조직에서 웹 검색을 허용해야 합니다. fal을 통해 GPT Image 기준 사진 편집과 Seedance 2.5 영상 생성을 처리합니다. `FAL_KEY`, `FAL_IMAGE_MODEL`, `FAL_VIDEO_MODEL`을 사용하며 이미지·영상 요청 ID를 저장해 재조회합니다. 로컬 FFmpeg 슬라이드·혼합형 편집도 유지합니다. FFmpeg는 패키지 설치 시 제공되며 별도 설치본을 쓰려면 FFMPEG_PATH를 지정합니다.

프로젝트에서 자료를 등록하고 기획 단계로 이동한 뒤 조사 생성 → 기획 검수 → 기획 승인 → 결과물 생성·승인 순서로 진행합니다. 이미지 생성은 한 요청당 한 장입니다. 클립도 먼저 필요한 이미지를 등록할 수 있습니다. 원고·이미지·영상은 외부에서 만든 파일을 수동 등록할 수도 있습니다.

## 비용과 완료 상태

AI 요청 전 입력한 예상 비용으로 예산을 예약합니다. 이 상한은 추정에 기반하며 공급사 실제 청구액의 강제 제한을 보장하지 않습니다. 생성 후 비용은 잠정값으로 기록되므로 공급사 청구 내역을 확인해 금액을 확정해야 합니다. 미지급 보수도 원가에 포함합니다. VAT 포함 판매가는 공급가액으로 환산합니다. 공통 인건비·구독료는 입력하지 않으면 제외됩니다.

승인본 ZIP 다운로드는 전달 기록과 다릅니다. 실제 전달 후 전달 기록을 남기고, 게시 링크 등록 후 내용을 직접 확인해야 게시 확인이 완료됩니다. 정산은 운영 완료와 별도로 마감합니다.

외부 응답 유실은 확인 필요 상태로 남깁니다. 영상 요청 ID가 저장된 경우 기존 요청을 재조회할 수 있습니다. 이미지·영상 모두 기존 fal 요청을 먼저 조회하며, 접수 여부가 불명확한 요청은 자동 재생성하지 마세요. 공급사 실행·청구 내역을 확인한 뒤 새 요청 여부를 판단합니다.

## 저장·배포·백업

초기 저장소는 SQLite WAL과 `.data/files`입니다. `.data`와 `.env.local`은 Git 제외이며 GitHub에 push해도 운영 데이터와 계정은 복제되지 않습니다. 다른 환경에는 관리자를 별도로 초기화합니다.

이 구성은 단일 서버 + worker를 전제로 합니다. Vercel 같은 일시 파일 시스템에 그대로 배포하지 마세요. 다중 서버에서는 PostgreSQL·객체 저장소로 전환해야 합니다. 배포는 별도이며 현재 GitHub push가 서비스 배포를 뜻하지 않습니다.

백업은 SQLite backup API로 DB를 복사하고 동일 시점의 파일 디렉터리를 함께 보관합니다. 정산 마감/납품 전 백업을 권장합니다. `.env.local`은 별도 비밀 저장소에서 관리하세요. 삭제·보존 정책은 실제 고객 계약에 맞춰 설정해야 합니다.

## 검증

```powershell
npm run typecheck
npm test
npm run build
npm run format:check
```

테스트는 임시 DB를 사용하며 실제 API 키를 호출하지 않습니다. 승인·단가 스냅샷·예산·중복 실행·파일·ZIP 구성·게시/정산과 실제 FFmpeg 렌더링을 확인합니다. 실 API 품질·청구 검증은 별도입니다.

HTTP 인수 검증은 테스트 전용 DATA_DIR와 SMOKE_URL의 서버를 사용하고 SMOKE_ADMIN_EMAIL, SMOKE_ADMIN_PASSWORD를 프로세스 환경에 주입한 뒤 `npm run smoke`를 실행하세요. 실제 운영 DB에 실행하지 마세요.

## 범위

현재 최초 A 범위인 Phase 1A~1C를 구현합니다. 게시자 포털(Phase 2), SNS 승인 후 예약 게시(Phase 3), 제한적 자동 운영(Phase 4)은 후속 범위입니다. wiki는 별도 운영합니다.

설계: [명세서](docs/product-spec-v0.1.md), [개발 기록](docs/implementation-progress.md).
