create table if not exists advertiser_accounts (
 id uuid primary key, email text not null unique, password_hash text not null,
 name text not null, phone text not null, customer_id text unique references records(id),
 created_at timestamptz not null default now(), consented_at timestamptz not null default now()
);
create table if not exists advertiser_sessions (
 token_hash text primary key, advertiser_id uuid not null references advertiser_accounts(id),
 expires_at timestamptz not null
);
create table if not exists market_entries (
 id uuid primary key,
 kind text not null check(kind in ('catalog','request','campaign','application')),
 owner_id text, data jsonb not null,
 version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists market_owner on market_entries(kind,owner_id);
create unique index if not exists market_campaign_project on market_entries((data->>'projectId')) where kind='campaign';
create unique index if not exists market_application_member on market_entries((data->>'campaignId'),owner_id) where kind='application';
alter table advertiser_accounts enable row level security;
alter table advertiser_sessions enable row level security;
alter table market_entries enable row level security;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=r) then
   execute format('revoke all on advertiser_accounts,advertiser_sessions,market_entries from %I',r);
  end if;
 end loop;
end $$;
