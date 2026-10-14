-- One Marketing: 운영 DB 초기 스키마 (SQLite -> Supabase PostgreSQL 이전)
-- 테이블 이름은 스키마를 붙이지 않는다. 운영은 public, 테스트·인수 검증은 별도 스키마에 같은 파일을 적용한다.

create table if not exists records (
  id text primary key,
  kind text not null,
  version integer not null,
  data jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index if not exists records_kind_created on records (kind, created_at desc);
create index if not exists records_project on records ((data ->> 'projectId'));
create index if not exists records_task on records ((data ->> 'taskId'));

-- 관리자 세션. 토큰은 sha256 해시만 저장한다.
create table if not exists sessions (
  token_hash text primary key,
  email text not null,
  expires bigint not null
);
create index if not exists sessions_expires on sessions (expires);

-- 로그인 시도 제한. key는 이메일 해시.
create table if not exists login_attempts (
  key text primary key,
  count integer not null,
  until_time bigint not null
);

-- 명령 중복 방지(idempotency). result는 처음 실행 결과.
create table if not exists commands (
  key text primary key,
  result jsonb,
  created_at timestamptz not null default now()
);

-- 작업 큐 worker lease.
create table if not exists leases (
  key text primary key,
  owner text not null,
  expires bigint not null
);

-- 브라우저(anon/authenticated, PostgREST)에서 내부 테이블에 접근하지 못하도록 차단.
-- 앱 서버는 DATABASE_URL(postgres 역할)로 접속하며 RLS 정책 없이도 소유자 권한으로 동작한다.
alter table records enable row level security;
alter table sessions enable row level security;
alter table login_attempts enable row level security;
alter table commands enable row level security;
alter table leases enable row level security;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table records, sessions, login_attempts, commands, leases from %I', r);
    end if;
  end loop;
end $$;
