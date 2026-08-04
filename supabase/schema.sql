create extension if not exists "pgcrypto";

create table if not exists retailers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references retailers(id) on delete cascade,
  external_key text not null,
  name text not null,
  normalized_name text,
  price integer not null check (price >= 0),
  category text not null,
  tags text[] not null default '{}',
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (retailer_id, external_key)
);

create table if not exists promotions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  promotion_type text not null,
  purchase_quantity integer not null default 1 check (purchase_quantity > 0),
  reward_quantity integer not null default 1 check (reward_quantity > 0),
  discount_price integer check (discount_price >= 0),
  start_date date,
  end_date date,
  collected_at timestamptz not null default now()
);

create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_key, product_id)
);

create table if not exists combo_history (
  id uuid primary key default gen_random_uuid(),
  user_key text not null,
  retailer_id uuid not null references retailers(id),
  budget integer not null,
  purpose text not null,
  result_json jsonb not null,
  created_at timestamptz not null default now()
);

insert into retailers (code, name)
values
  ('cu', 'CU'),
  ('gs25', 'GS25'),
  ('seven', '세븐일레븐'),
  ('emart24', '이마트24')
on conflict (code) do update set name = excluded.name;
