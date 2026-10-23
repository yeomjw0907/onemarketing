-- Advertiser consent and tokens are isolated from administrator grants.
create table if not exists advertiser_oauth (
 key text primary key, kind text not null, data jsonb not null, expires bigint not null
);
create index if not exists advertiser_oauth_expiry on advertiser_oauth(expires);
alter table advertiser_oauth enable row level security;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=r) then
   execute format('revoke all on table advertiser_oauth from %I',r);
  end if;
 end loop;
end $$;
