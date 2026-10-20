# GitHub 자동 검사

`Verify`는 main push 및 PR에서 의존성 설치, 타입 검사, 전체 테스트, 프로덕션 빌드, 운영 의존성 보안 감사를 실행한다.

## 테스트 Secrets

저장소 Settings → Secrets and variables → Actions에 다음 값을 등록한다. 값은 저장소 파일이나 로그에 출력하지 않는다.

- `TEST_DATABASE_URL`: 테스트 스키마 생성·삭제가 가능한 PostgreSQL 연결 문자열
- `TEST_SUPABASE_URL`: Supabase 프로젝트 URL
- `TEST_SUPABASE_SERVICE_ROLE_KEY`: 서버 전용 Storage 접근 키
- `TEST_SUPABASE_STORAGE_BUCKET`: 비공개 Storage 버킷 이름

현재는 로컬 검증과 같은 Supabase 프로젝트·버킷을 사용한다. 테스트 파일마다 `tests/helpers.ts`가 무작위 `test_<id>` 스키마와 동일한 Storage 접두어를 생성하고 종료 훅에서 삭제한다. 운영 public 스키마와 운영 파일 경로를 변경하지 않는다. 별도 테스트 Supabase 프로젝트를 준비하면 위 Secrets만 교체할 수 있다.

Secrets는 테스트 단계에만 전달한다. AI 생성·메시지 발송용 운영 API 키는 전달하지 않는다. 동시 테스트 파일 수와 각 DB 풀 크기를 2로 제한하여 연결 상한 초과를 방지한다. 설정 누락 시 테스트 시작 전에 누락된 변수 이름만 출력하고 실패한다.

Fork PR에는 GitHub가 저장소 Secrets를 전달하지 않으므로 DB 통합 테스트가 실행되지 않고 설정 누락 오류로 실패한다. 검사 통과를 위해 테스트를 생략하거나 `pull_request_target`으로 권한을 확대하지 않는다. 신뢰할 수 있는 저장소 브랜치에서 검증해야 한다.

수동 강제 취소나 실행 시간 초과는 Node 종료 훅을 실행하지 못할 수 있다. 이 경우 테스트 접두어에 해당하는 잔여 스키마·파일만 확인하여 정리한다.
