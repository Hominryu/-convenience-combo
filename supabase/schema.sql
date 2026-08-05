-- Reset only this app schema. Running this file deletes existing convenience-combo data.
-- Use this before production only when you intentionally want a clean database.

-- Drop app objects in dependency order.
drop table if exists combo_history cascade;
drop table if exists favorites cascade;
drop table if exists promotions cascade;
drop table if exists products cascade;
drop table if exists crawl_runs cascade;
drop function if exists set_updated_at() cascade;
drop type if exists promotion_type cascade;
drop type if exists product_category cascade;
drop type if exists crawl_status cascade;
drop type if exists crawl_type cascade;
drop type if exists store_code cascade;

create extension if not exists "pgcrypto";

-- Canonical schema for CU, GS25, and EMART24.
-- Paste this whole file into the Supabase SQL Editor to reset the app DB.

create type store_code as enum ('CU', 'GS25', 'EMART24');
create type crawl_type as enum ('GENERAL', 'PROMOTION');
create type crawl_status as enum ('RUNNING', 'SUCCESS', 'PARTIAL_FAILURE', 'FAILED');
create type product_category as enum ('MAIN_MEAL', 'RAMEN', 'RICE', 'SANDWICH', 'SIDE', 'SNACK', 'DRINK', 'COFFEE', 'DESSERT', 'ALCOHOL_SIDE', 'ETC');
create type promotion_type as enum ('NONE', 'ONE_PLUS_ONE', 'TWO_PLUS_ONE', 'THREE_PLUS_ONE', 'SALE', 'GIFT', 'NEW');

create table crawl_runs (
  id uuid primary key default gen_random_uuid(),
  store_code store_code not null,
  crawl_type crawl_type not null,
  status crawl_status not null default 'RUNNING',
  collected_count integer not null default 0 check (collected_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  deactivated_count integer not null default 0 check (deactivated_count >= 0),
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table products (
  id uuid primary key default gen_random_uuid(),
  store_code store_code not null,
  source_product_id text,
  original_name text not null,
  normalized_name text not null,
  brand_name text,
  capacity text,
  category product_category not null default 'ETC',
  price integer not null check (price >= 0),
  image_url text,
  source_url text,
  is_active boolean not null default true,
  last_seen_run_id uuid references crawl_runs(id),
  last_seen_at timestamptz not null default now(),
  last_seen_general_at timestamptz,
  last_seen_promotion_at timestamptz,
  price_verified_at timestamptz,
  promotion_end_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index products_source_identity
  on products(store_code, source_product_id);

create index products_name_capacity_lookup
  on products(store_code, normalized_name, coalesce(capacity, ''));

create index products_store_active_idx on products(store_code, is_active, original_name);
create index products_seen_general_idx on products(store_code, last_seen_general_at desc);
create index products_seen_promotion_idx on products(store_code, last_seen_promotion_at desc);
create index products_promotion_end_idx on products(store_code, promotion_end_at desc);
create index products_category_idx on products(category);

create table promotions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  promotion_type promotion_type not null,
  purchase_quantity integer not null default 1 check (purchase_quantity > 0),
  reward_quantity integer not null default 1 check (reward_quantity > 0),
  promotion_price integer check (promotion_price >= 0),
  start_date date,
  end_date date,
  is_active boolean not null default true,
  last_seen_run_id uuid references crawl_runs(id),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, promotion_type, start_date, end_date)
);

create index promotions_product_active_idx on promotions(product_id, is_active, last_seen_at desc);
create index promotions_end_active_idx on promotions(is_active, end_date desc);

create table favorites (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_key, product_id)
);

create table combo_history (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  store_code store_code not null,
  budget integer not null check (budget > 0),
  purpose text not null,
  result_json jsonb not null,
  created_at timestamptz not null default now()
);

create function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_set_updated_at
before update on products
for each row execute function set_updated_at();

create trigger promotions_set_updated_at
before update on promotions
for each row execute function set_updated_at();


