# Supabase DB·Storage 전환과 서버리스 작업 실행

- 작업일: 2026-10-14 (Asia/Seoul)
- Supabase 프로젝트: `jyleynqxweqccptukvkn` (ap-northeast-2, PostgreSQL 17)
- 범위: SQLite(`.data/marketing.sqlite`)·로컬 파일(`.data/files`) → Supabase PostgreSQL + 비공개 Storage 버킷 `onemarketing-assets`. 별도 worker 전제를 없애고 Vercel 서버리스에서 생성 작업이 이어지도록 실행 방식을 바꿨다.

## 구성 요약

| 항목             | 이전                          | 현재                                                                     |
| ---------------- | ----------------------------- | ------------------------------------------------------------------------ |
| 레코드 저장      | SQLite `records`(JSON 텍스트) | PostgreSQL `records`(jsonb). ID·version·createdAt·관계를 그대로 유지     |
| 세션·로그인 제한 | SQLite 테이블                 | PostgreSQL `sessions`, `login_attempts` (서버 인스턴스 간 공유)          |
| 명령 중복 방지   | SQLite 트랜잭션 + `commands`  | `commands` + `pg_advisory_xact_lock` (동시 요청도 하나만 실행)           |
| 트랜잭션         | better-sqlite3 동기 트랜잭션  | `transaction()` + AsyncLocalStorage, 중첩은 savepoint                    |
| 작업 큐 lease    | worker 1개 전역 lease         | 작업별 lease(`leases.key = job:<id>`), 서버리스·worker 혼용 가능         |
| 파일             | `.data/files/<uuid>.<ext>`    | Storage `onemarketing-assets/<uuid>.<ext>` (비공개, service role만 접근) |
| 파일 조회        | 로컬 파일 읽기                | 관리자 세션 확인 후 서버가 service role로 다운로드해 전달                |

## 코드 위치

- `src/lib/db.ts`: pg Pool, `query/execute/transaction/lock/once`, 레코드 CRUD. `DATABASE_URL`, `DB_SCHEMA`(기본 public), `DATABASE_SSL`, `DATABASE_CA_CERT`.
- `src/lib/storage.ts`: supabase-js service role 클라이언트. `putObject`(upsert 금지)·`getObject`·`objectExists`·`removeObjects`. `SUPABASE_STORAGE_PREFIX`로 테스트 데이터 분리.
- `src/lib/assets.ts`: 업로드 성공 후에만 DB 기록, DB 실패 시 올린 객체 정리. 중복 이미지·유사 이미지 검사 유지. ffmpeg용 `localCopy`.
- `src/lib/jobs.ts`: 예산 예약·중복 실행 방지 유지. 작업별 lease `claimJob/renewLease/releaseLease`, 재개 가능 판단 `resumable`.
- `src/lib/worker.ts`: 실행기 공통 로직 `processJob/runJobs`, 제한 시간 `ensureTime`·`Yield`.
- `src/lib/trigger.ts`: 서버리스 트리거(`after`), 연쇄 호출 `/api/jobs/run`.
- `src/lib/providers.ts`: Claude 조사·기획·원고, fal 이미지·영상. fal 접수 직후 request ID 저장, 결과 수집 실패는 uncertain으로 남기고 재개 시 새 생성 없이 같은 요청 ID로 수집.
- `src/lib/migrate.ts`, `scripts/db-migrate.ts`: `supabase/migrations/*.sql` 적용(`app_schema_migrations` 추적).
- `scripts/migrate-sqlite-to-supabase.ts`: 기존 SQLite·파일 이전(재실행 안전, 원본 보존).

## Migration 파일

`supabase/migrations/`

1. `20261014100000_initial_schema.sql`: `records`, `sessions`, `login_attempts`, `commands`, `leases` + 인덱스. 모든 테이블 RLS 활성화, `anon`/`authenticated` 권한 회수(정책 없음 → PostgREST/브라우저 접근 불가). 앱은 `DATABASE_URL`의 `onemarketing_app` 역할(테이블 소유자, postgres는 멤버)로 접속한다.
2. `supabase/setup/private_storage_bucket.sql`: 비공개 버킷 `onemarketing-assets`(파일 110MB 제한). Storage 정책을 만들지 않으므로 anon/authenticated 키로는 객체에 접근할 수 없다. `storage.buckets`는 앱 역할이 쓸 수 없으므로 migration 폴더가 아닌 setup 폴더에 두고 postgres 역할(MCP/SQL Editor)로 한 번만 적용한다.
3. `supabase/setup/app_role.sql`: 앱 전용 역할 `onemarketing_app`(로그인, 테이블 소유자, postgres가 멤버). 앱과 테스트는 이 역할의 세션 풀러 URI를 `DATABASE_URL`로 사용한다. 비밀번호는 저장소에 없다.

운영 public 스키마에는 2026-10-14 Supabase MCP로 적용했고 `app_schema_migrations`에 `20261014100000_initial_schema.sql`을 기록했다. 버킷과 앱 역할은 같은 날 setup SQL로 적용했다. 새 migration은 파일을 추가한 뒤 `npm run db:migrate`(DATABASE_URL 필요) 또는 Supabase MCP/CLI로 적용하고 `app_schema_migrations`에 반영한다.

## 실행 방법

```powershell
# .env.local: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET, CRON_SECRET, APP_URL
npm ci
npm run db:migrate              # 스키마 확인(이미 적용되어 있으면 up to date)
npm run db:import-sqlite        # 기존 .data → Supabase (백업 후, 재실행 안전, 원본 보존)
npm run dev -- --hostname 127.0.0.1 --port 3107
# 로컬 전용 worker가 필요하면: JOB_RUNNER=worker 로 두고 npm run worker
```

`npm run db:import-sqlite`는 `.data/acceptance` 같은 테스트 경로를 거부한다(`--allow-test-data`). 파일을 먼저 올리고 레코드를 한 트랜잭션으로 넣으며, 이미 있는 행·객체는 건너뛰고 덮어쓰지 않는다. 원본 파일은 삭제하지 않는다.

## 서버리스 작업 실행 (Vercel)

별도 worker 프로세스는 Vercel에서 상시 실행되지 않는다. 대신:

1. `POST /api/jobs`(등록)·`resume-job`·`GET /api/data`(화면 새로고침)에서 `after()`로 같은 함수 실행 안에 작업 처리를 예약한다. 브라우저가 닫혀도 함수는 `maxDuration`(300초)까지 계속 돈다.
2. 한 실행은 `JOB_TICK_BUDGET_MS`(기본 240초) 안에서 가능한 작업을 처리하고, Claude 호출 전·fal 대기 중 남은 시간이 부족하면 작업을 `pending`으로 돌려보낸다(Yield). 저장한 request ID·체크포인트로 다음 실행에서 이어간다. 새 비용을 만들지 않는다.
3. 남은 작업이 있으면 `/api/jobs/run`을 `Authorization: Bearer CRON_SECRET`으로 다시 호출해 연쇄 실행한다(`APP_URL`, `CRON_SECRET` 필요). Vercel 배포 보호(SSO)가 켜져 있으면 `VERCEL_AUTOMATION_BYPASS_SECRET`이 있어야 자기 호출이 통과한다(프로젝트 설정 → Deployment Protection → Protection Bypass for Automation).
4. `vercel.json`의 Cron(`*/10 * * * *`, `GET /api/jobs/run`)이 안전망이다(Vercel Pro 플랜). 연쇄 호출·화면 새로고침 트리거가 주 경로이며, Cron은 연쇄가 끊긴 작업을 10분 안에 다시 집는다.
5. 작업별 lease로 중복 처리를 막는다. lease가 만료된 running 작업은 request ID·체크포인트가 있으면 재개하고, 없으면 `uncertain`(공급사 비용 확인 필요)으로 남긴다.

`JOB_RUNNER=worker`로 두면 서버리스 트리거를 끄고 `npm run worker`만 사용한다(전용 서버 배포용).

## 환경변수

| 이름                              | 위치                        | 설명                                                                                               |
| --------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                    | 로컬·Vercel(Sensitive)      | Supabase 연결 문자열. 세션 풀러(5432) 권장. 트랜잭션 풀러(6543)는 `DB_SCHEMA`가 public일 때만 사용 |
| `SUPABASE_URL`                    | 로컬·Vercel                 | `https://jyleynqxweqccptukvkn.supabase.co`                                                         |
| `SUPABASE_SERVICE_ROLE_KEY`       | 로컬·Vercel(Sensitive)      | 서버 전용. 클라이언트에 전달하지 않음                                                              |
| `SUPABASE_STORAGE_BUCKET`         | 로컬·Vercel                 | `onemarketing-assets`                                                                              |
| `CRON_SECRET`                     | Vercel(Sensitive)·로컬 선택 | Cron·연쇄 호출 인증. 32자 이상 임의 문자열                                                         |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Vercel 자동                 | Protection Bypass for Automation 활성화 시 자동 주입                                               |
| `APP_URL`                         | 로컬·Vercel                 | 실제 접속 주소. 연쇄 호출 대상                                                                     |
| `DB_SCHEMA`                       | 테스트·인수 검증만          | 운영은 설정하지 않음(public)                                                                       |

Vercel MCP 토큰에는 환경변수 조회·생성 권한이 없어(403) Supabase 변수와 `CRON_SECRET`은 Vercel 대시보드에서 직접 등록해야 한다. 등록 후 운영 재배포가 필요하다.

## 테스트 데이터 분리

- `npm test`: 파일마다 일회용 스키마 `test_<무작위>`와 Storage 접두어 `test_<무작위>/`를 만들어 같은 migration 파일을 적용하고 끝나면 스키마·객체를 삭제한다. 운영 public 스키마와 운영 파일은 건드리지 않는다. `TEST_DATABASE_URL`로 다른 DB를 지정할 수 있다.
- `npm run acceptance`: `acceptance` 스키마·`acceptance/` 접두어로 격리 서버(3108)를 띄운다. `npm run smoke`는 이 서버에 실행한다.
- 과거 `.data/acceptance`는 테스트 데이터이므로 운영 DB에 이전하지 않았다.

## 검증 결과 (2026-10-14)

- 통과: TypeScript, Prettier, `next build`, Vercel 운영 배포(main 자동 배포, READY).
- 통과(실제 Supabase 일회용 스키마·접두어, `npm test` 22개): 트랜잭션 롤백·savepoint, 버전 충돌, 명령 중복 방지(동시 3건 중 1건 실행), 작업별 lease·만료 후 재개, 로그인 시도 제한·세션, 가격 스냅샷·슬롯·정산, 참여자 등록·배정·이력, 비공개 버킷 저장·업로드 실패 시 DB 미기록, 승인본 ZIP·전달·게시·정산, 중복 이미지 차단, 예산·중복 실행 방지, 실제 ffmpeg 편집, fal 수집 실패 후 같은 요청 ID로 재수집(새 생성 0회), 서버리스 제한 시간 Yield 후 재개, 이전 공급사 요청 중복 제출 차단, Seedance 요청 형식, Claude 웹 검색 pause_turn·출처·도구 오류 처리.
- 통과(격리 서버 `npm run acceptance` + `npm run smoke`, acceptance 스키마): 로그인·CSRF·고객/제품/단가/계약/프로젝트·참여자 등록·배정·게시 작업 편집·이미지 업로드·인증 다운로드·비로그인 404·ZIP·전달 기록·게시 확인·지급·협업 이력·정산 마감·추천·로그아웃.
- 통과(운영 배포 HTTP): 비로그인 `/api/data` 401, 비로그인 파일 접근 404, `/api/jobs/run` 비밀 없이 401, 잘못된 로그인 401 후 `login_attempts` 1건 기록(확인 후 삭제).
- 실행: `npm run db:import-sqlite` (운영 `.data`). 레코드·파일 0건, 유효 세션 2건 이전, 백업 `.data/backups/`. 원본 보존.
- 미실행: 유료 API(Claude·fal) 실제 생성 검증. 소량 검증 비용 추정 약 $0.5~1.2, 기본 구성 1회 약 $2~5. 지시가 있을 때만 실행한다.
- 보안 메모: service role 키가 채팅으로 공유되었으므로 검증이 끝나면 Supabase 대시보드에서 키를 재발급하고 `.env.local`·Vercel 값을 교체하는 것을 권장한다.
