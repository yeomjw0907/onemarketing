# 원케이션 카카오 알림톡 / 네이버클라우드 SENS 설정

## 1. 기존 채널 확인
원케이션 비즈니스 인증 채널을 사용한다. 카카오 채널 관리자에서 홈 공개와 고객센터 전화번호 등록을 확인한다. 채널 표시 이름과 검색용 ID는 다르다. SENS에는 검색용 ID를 입력한다.

## 2. SENS 프로젝트 생성과 채널 연결
네이버클라우드 사업자 계정에서 콘솔 → Services → Application Services → Simple & Easy Notification Service로 이동한다. 프로젝트를 생성하고 Biz Message 사용을 활성화한다. Biz Message → KakaoTalk Channel → 프로젝트 선택 → 채널 등록에서 검색용 ID, 채널 관리자 연락처, 사업자 카테고리를 입력한다. 관리자 카카오톡으로 받은 인증번호로 등록한다. 기존 원케이션 채널은 새로 만들지 않는다.

## 3. API 인증
네이버클라우드 계정의 API 인증키를 발급한다. 가능하면 전용 Sub Account에 SENS에 필요한 권한만 부여한다. Biz Message 서비스 ID, Access Key, Secret Key는 서버 환경변수에 입력한다. Secret Key를 채팅·소스·NEXT_PUBLIC 변수에 넣지 않는다.

```dotenv
SENS_ENABLED=false
NCP_ACCESS_KEY=
NCP_SECRET_KEY=
SENS_SERVICE_ID=ncp:kkobizmsg:kr:...
SENS_CHANNEL_ID=@검색용아이디
APP_URL=https://실제서비스도메인
SENS_TEMPLATE_MATERIALS=
SENS_TEMPLATE_REVISION=
SENS_TEMPLATE_PAYMENT=
SENS_TEMPLATE_REMINDER=
SENS_TEMPLATE_RETENTION=
```

## 4. 템플릿 심사
Biz Message → AlimTalk Template에서 아래 문구를 등록하고 심사를 요청한다. 구현과 승인 문구·띄어쓰기·버튼을 동일하게 맞춘다. 변수명도 그대로 사용한다. 각 템플릿의 버튼은 웹링크(WL), 이름은 `참여자 화면`, 모바일/PC 주소는 모두 `APP_URL/participants/portal`이다. 처음 접속에는 관리자가 발급한 만료형 접속 링크를 별도로 공유해야 한다.

- 자료 준비: `[원케이션] #{name} 게시 자료가 준비되었습니다. 제출 기한: #{deadline}. 참여자 화면에서 자료와 가이드를 확인해주세요.`
- 수정 요청: `[원케이션] #{name} 게시물 수정 요청입니다. 수정 기한: #{deadline}. 수정 내용: #{note}`
- 지급 완료: `[원케이션] #{name} 원고료 지급이 완료되었습니다. 정산 내역은 참여자 화면에서 확인해주세요.`
- 기한 안내: `[원케이션] 진행 중인 게시 작업 #{count}건의 제출 기한이 임박했습니다. 참여자 화면에서 확인해주세요.`
- 유지 확인: `[원케이션] #{name} 게시물 유지 확인이 필요합니다. 담당자가 요청한 내용을 참여자 화면에서 확인해주세요.`

승인된 템플릿 코드를 해당 환경변수에 넣는다. 심사에서 수정 요청이 오면 코드의 notificationTemplates 문구도 함께 수정해야 한다. 승인 이전에는 활성화하지 않는다.

## 5. 운영 전 확인
캠페인 운영 → 알림톡에서 설정 상태 확인 → 본인 테스트 참여자에게만 테스트 → SENS 콘솔과 앱에서 실제 수신 결과 확인. 연결 검증 후 `SENS_ENABLED=true`로 설정한다. HTTP 접수 성공과 실제 수신 성공은 구분된다. 통신 오류는 확인 필요(uncertain)로 남기며 중복 방지를 위해 자동 재전송하지 않는다. 콘솔에서 실제 결과를 확인한다.

Vercel에서는 기존 `/api/jobs/run` Cron이 알림 큐도 처리한다. 별도 worker 실행 시 분당 확인한다. 대기 알림에 대한 자동 발송은 활성화 이후 시작된다. 문자 대체 발송은 코드에서 명시적으로 false이며, 채널 설정에서도 OFF를 유지한다. 이 기능은 은행 송금을 실행하지 않고 운영자의 송금 완료 기록을 알린다.

## 모집 메시지는 별도
알림톡에 신규 모집·참여 권유 광고를 섞지 않는다. SENS 공식 가이드상 비친구 대상 브랜드 메시지 M/N 확대 이용은 친구 5만 명 이상, 사업자/고객센터 정보, 최근 3개월 내 알림톡 성공 이력, 080 수신거부, 광고 수신동의 증적 등의 자격 조건이 있다. 현재 구현은 브랜드 발송을 비활성 상태로 표시한다. 조건을 확인하기 전에는 최초 참여 제안을 직접 공유한다.

## 공식 문서
- 채널 등록: https://guide.ncloud-docs.com/docs/sens-ktchannel
- 알림톡 템플릿: https://guide.ncloud-docs.com/docs/sens-attemplate
- 발송 API: https://api.ncloud-docs.com/docs/sens-alimtalk-send
- 결과 조회: https://api.ncloud-docs.com/docs/sens-alimtalk-get
- 브랜드 메시지 조건: https://guide.ncloud-docs.com/docs/sens-bmoverview

확인일: 2026-10-16. 자격·메뉴·요금은 서비스 정책 변경 시 재확인한다.
