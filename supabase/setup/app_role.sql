-- 앱 전용 DB 역할. 비밀번호는 여기 적지 않고 생성 시점에 별도로 지정한다 (DATABASE_URL에만 보관).
-- 2026-10-14 운영 프로젝트에 적용. postgres 역할(Supabase MCP/SQL Editor)로 실행한다.
--
--   create role onemarketing_app login password '<secret>' nosuperuser nocreatedb nocreaterole inherit;
--
-- postgres가 이 역할의 멤버가 되어 테이블을 계속 관리할 수 있고, 앱 역할은 테이블 소유자이므로 정책 없는 RLS 아래에서도 동작한다.
grant onemarketing_app to postgres;
grant connect, create on database postgres to onemarketing_app; -- create: 테스트·인수 검증용 일회성 스키마
grant usage, create on schema public to onemarketing_app;
alter table public.records owner to onemarketing_app;
alter table public.sessions owner to onemarketing_app;
alter table public.login_attempts owner to onemarketing_app;
alter table public.commands owner to onemarketing_app;
alter table public.leases owner to onemarketing_app;
alter table public.app_schema_migrations owner to onemarketing_app;
alter default privileges for role onemarketing_app in schema public revoke all on tables from anon, authenticated;
