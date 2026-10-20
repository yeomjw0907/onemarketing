-- Kept outside records so OAuth credentials never enter /api/data or reports.
create table if not exists mcp_oauth (
  key text primary key,
  kind text not null,
  data jsonb not null,
  expires bigint not null
);
create index if not exists mcp_oauth_expiry on mcp_oauth (expires);
create table if not exists mcp_rate_limits (
  key text primary key,
  count integer not null,
  expires bigint not null
);
alter table mcp_oauth enable row level security;
alter table mcp_rate_limits enable row level security;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table mcp_oauth, mcp_rate_limits from %I', r);
    end if;
  end loop;
end $$;
