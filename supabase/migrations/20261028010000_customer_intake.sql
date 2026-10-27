-- Private customer intake requests and immutable submitted revisions.
create table if not exists workflow_items (
 id uuid primary key,
 kind text not null check(kind in ('payment_request','intake','intake_revision','allocation','campaign_plan','preferences','scene_plan','assistant_review','intake_upload')),
 owner_id text not null,
 project_id uuid,
 data jsonb not null,
 version integer not null default 1 check(version > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists workflow_items_owner on workflow_items(kind,owner_id,created_at desc);
create index if not exists workflow_items_project on workflow_items(kind,project_id);
alter table workflow_items enable row level security;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=r) then
   execute format('revoke all on workflow_items from %I',r);
  end if;
 end loop;
end $$;
