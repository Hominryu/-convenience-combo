-- Additive migration: preserve legacy promotion rows while separating catalog facts.
alter table products add column if not exists store_code text;
alter table products add column if not exists source_product_id text;
alter table products add column if not exists original_name text;
alter table products add column if not exists brand_name text;
alter table products add column if not exists capacity text;
alter table products add column if not exists source_url text;
alter table products add column if not exists is_active boolean not null default true;
alter table products add column if not exists last_seen_run_id uuid;
alter table products add column if not exists last_seen_at timestamptz;
alter table products alter column retailer_id drop not null;
alter table products alter column external_key drop not null;
alter table products alter column name drop not null;
alter table products alter column category drop not null;
update products p set store_code=upper(r.code), source_product_id=p.external_key,
 original_name=p.name, is_active=p.active, last_seen_at=p.updated_at from retailers r
 where p.retailer_id=r.id and p.store_code is null and r.code in ('cu','gs25','emart24');
alter table products add constraint products_store_code_check check (store_code in ('CU','GS25','EMART24')) not valid;
create unique index if not exists products_source_identity on products(store_code,source_product_id) where source_product_id is not null;
create unique index if not exists products_name_capacity_identity on products(store_code,normalized_name,coalesce(capacity,''));

alter table promotions add column if not exists promotion_price integer check (promotion_price>=0);
alter table promotions add column if not exists is_active boolean not null default true;
alter table promotions add column if not exists last_seen_run_id uuid;
alter table promotions add column if not exists last_seen_at timestamptz;
alter table promotions add column if not exists created_at timestamptz not null default now();
alter table promotions add column if not exists updated_at timestamptz not null default now();
update promotions set promotion_type=case promotion_type when '1+1' then 'ONE_PLUS_ONE' when '2+1' then 'TWO_PLUS_ONE' else promotion_type end,
 promotion_price=coalesce(discount_price,(select price from products where products.id=promotions.product_id)), last_seen_at=collected_at;
create unique index if not exists promotions_identity on promotions(product_id,promotion_type,start_date,end_date);

alter table crawler_runs add column if not exists store_code text;
alter table crawler_runs add column if not exists crawl_type text;
alter table crawler_runs add column if not exists collected_count integer not null default 0;
alter table crawler_runs add column if not exists inserted_count integer not null default 0;
alter table crawler_runs add column if not exists updated_count integer not null default 0;
alter table crawler_runs add column if not exists deactivated_count integer not null default 0;
alter table crawler_runs alter column finished_at drop not null;
update crawler_runs set store_code=upper(retailer_code),crawl_type='PROMOTION',collected_count=fetched_count,inserted_count=saved_products
 where store_code is null and retailer_code in ('cu','gs25','emart24');
alter table crawler_runs add constraint crawl_runs_store_check check (store_code in ('CU','GS25','EMART24')) not valid;
alter table crawler_runs add constraint crawl_runs_type_check check (crawl_type in ('GENERAL','PROMOTION')) not valid;
alter table crawler_runs add constraint crawl_runs_status_check check (upper(status) in ('RUNNING','SUCCESS','PARTIAL_FAILURE','FAILED')) not valid;
alter table products add constraint products_last_seen_run_fk foreign key(last_seen_run_id) references crawler_runs(id) not valid;
alter table promotions add constraint promotions_last_seen_run_fk foreign key(last_seen_run_id) references crawler_runs(id) not valid;
-- Seven-Eleven historical data is retained, but excluded from this release.
update products set is_active=false,active=false where store_code is null;
