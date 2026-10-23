create table if not exists commerce_orders (
 id uuid primary key, advertiser_id uuid not null references advertiser_accounts(id),
 request_hash text not null, data jsonb not null, version integer not null default 1,
 created_at timestamptz not null default now()
);
create index if not exists commerce_orders_owner on commerce_orders(advertiser_id,created_at);
create table if not exists commerce_campaigns (
 id uuid primary key, order_id uuid not null references commerce_orders(id),
 data jsonb not null, version integer not null default 1,
 created_at timestamptz not null default now()
);
create table if not exists commerce_applications (
 id uuid primary key, campaign_id uuid not null references commerce_campaigns(id),
 participant_id text not null references records(id), data jsonb not null,
 version integer not null default 1, created_at timestamptz not null default now(),
 unique(campaign_id,participant_id)
);
create index if not exists commerce_applications_member on commerce_applications(participant_id);
create table if not exists commerce_settings (key text primary key,data jsonb not null);
create table if not exists advertiser_api_keys (
 id uuid primary key,advertiser_id uuid not null references advertiser_accounts(id),
 token_hash text not null unique,label text not null,expires_at timestamptz not null,
 revoked_at timestamptz,created_at timestamptz not null default now()
);
alter table commerce_orders enable row level security;
alter table commerce_campaigns enable row level security;
alter table commerce_applications enable row level security;
alter table commerce_settings enable row level security;
alter table advertiser_api_keys enable row level security;
do $$ declare r text; begin
 foreach r in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=r) then
   execute format('revoke all on commerce_orders,commerce_campaigns,commerce_applications,commerce_settings,advertiser_api_keys from %I',r);
  end if;
 end loop;
end $$;
