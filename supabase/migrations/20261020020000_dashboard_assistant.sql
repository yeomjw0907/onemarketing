-- Chat/device state is private and never included in the generic records API.
create table if not exists assistant_devices (
  id uuid primary key,
  owner text not null,
  token_hash text unique not null,
  name text not null,
  last_seen bigint not null default 0,
  status text not null default 'starting',
  revoked boolean not null default false
);
create table if not exists assistant_pairings (
  token_hash text primary key,
  owner text not null,
  expires bigint not null
);
create table if not exists assistant_threads (
  id uuid primary key,
  owner text not null,
  title text not null,
  created_at bigint not null
);
create table if not exists assistant_turns (
  id uuid primary key,
  thread_id uuid not null references assistant_threads(id),
  owner text not null,
  request_id uuid not null,
  input text not null,
  status text not null,
  created_at bigint not null,
  device_id uuid,
  lease_hash text,
  lease_until bigint,
  reply text,
  proposal jsonb,
  proposal_status text,
  save_result jsonb,
  unique(owner, request_id)
);
create index if not exists assistant_turns_queue on assistant_turns(owner,status,created_at);
alter table assistant_devices enable row level security;
alter table assistant_pairings enable row level security;
alter table assistant_threads enable row level security;
alter table assistant_turns enable row level security;
do $$ declare r text; begin
  foreach r in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=r) then
      execute format('revoke all on table assistant_devices,assistant_pairings,assistant_threads,assistant_turns from %I',r);
    end if;
  end loop;
end $$;
