create table if not exists account_state (
 owner_role text not null check(owner_role in ('advertiser','participant','admin')),
 owner_id text not null,
 section text not null check(section in ('builder','favorites')),
 data jsonb not null,
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now(),
 primary key(owner_role,owner_id,section)
);
alter table account_state enable row level security;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=r) then
   execute format('revoke all on account_state from %I',r);
  end if;
 end loop;
end $$;
