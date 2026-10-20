alter table assistant_turns add column if not exists attachment_ids jsonb not null default '[]'::jsonb;
create table if not exists assistant_attachments (
 id uuid primary key,
 owner text not null,
 thread_id uuid not null references assistant_threads(id),
 name text not null,
 mime text not null,
 storage_name text not null unique,
 size integer not null,
 extracted text,
 note text,
 links jsonb not null default '{}'::jsonb,
 created_at bigint not null
);
create index if not exists assistant_attachments_thread on assistant_attachments(owner,thread_id);
alter table assistant_attachments enable row level security;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on table assistant_attachments from %I',r); end if;
 end loop;
end $$;
