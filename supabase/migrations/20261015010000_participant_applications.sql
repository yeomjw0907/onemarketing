create table if not exists participant_applications (
  id uuid primary key,
  version integer not null default 1,
  status text not null default 'new' check (status in ('new', 'approved', 'rejected')),
  data jsonb not null,
  participant_id text references records(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists participant_applications_created on participant_applications (created_at desc);
alter table participant_applications enable row level security;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table participant_applications from %I', r);
    end if;
  end loop;
end $$;
