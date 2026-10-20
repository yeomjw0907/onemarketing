# GitHub 자동 검사

`Verify`는 main push 및 PR에서 의존성 설치, 타입 검사, 전체 테스트, 프로덕션 빌드, 운영 의존성 보안 감사를 실행한다.

## 테스트 Secrets

저장소 Settings → Secrets and variables → Actions에 다음 값을 등록한다. 값은 저장소 파일이나 로그에 출력하지 않는다.

- `TEST_SUPABASE_URL`: Supabase 프로젝트 URL
- `TEST_SUPABASE_SERVICE_ROLE_KEY`: 서버 전용 Storage 접근 키
- `TEST_SUPABASE_STORAGE_BUCKET`: 비공개 Storage 버킷 이름

DB는 각 GitHub 작업에 포함된 일회용 PostgreSQL 16 서비스 컨테이너를 사용한다. 연결 URL·사용자는 컨테이너 전용이며 운영 DB 연결 정보는 전달하지 않는다. Storage는 로컬 검증과 같은 Supabase 프로젝트·버킷을 사용한다. 테스트 파일마다 `tests/helpers.ts`가 무작위 `test_<id>` 스키마와 동일한 Storage 접두어를 생성하고 종료 훅에서 삭제한다. 별도 테스트 Storage 프로젝트를 준비하면 위 Secrets만 교체할 수 있다.

Secrets는 테스트 단계에만 전달한다. AI 생성·메시지 발송용 운영 API 키는 전달하지 않는다. AI 로그 테스트는 모의 요청과 명시적인 가짜 키를 사용한다. Node의 `--test-shard`로 전체 테스트를 3개 작업에 나누고, 각 작업의 동시 파일 수와 DB 풀 크기는 2로 제한한다. 설정 누락 시 테스트 시작 전에 누락된 변수 이름만 출력하고 실패한다.

Fork PR에는 GitHub가 저장소 Secrets를 전달하지 않으므로 DB 통합 테스트가 실행되지 않고 설정 누락 오류로 실패한다. 검사 통과를 위해 테스트를 생략하거나 `pull_request_target`으로 권한을 확대하지 않는다. 신뢰할 수 있는 저장소 브랜치에서 검증해야 한다.

수동 강제 취소나 실행 시간 초과는 Node 종료 훅을 실행하지 못할 수 있다. DB는 작업 종료 시 컨테이너와 함께 폐기된다. Storage에 잔여 파일이 있으면 테스트 접두어에 해당하는 파일만 확인하여 정리한다.
