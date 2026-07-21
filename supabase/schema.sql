-- 깡비서 급여조견표 아카이브 (Supabase SQL Editor에서 실행)
-- 공개 링크 접근: 링크를 아는 누구나 읽기/쓰기 가능 (의도된 설정)

-- 1) 메타데이터 테이블
create table if not exists public.pay_archives (
  id uuid primary key default gen_random_uuid(),
  center_name text not null,
  original_filename text,
  excel_path text,
  zip_path text,
  job_count integer default 0,
  png_count integer default 0,
  sheet_name text,
  search_text text default '',
  created_at timestamptz not null default now()
);

create index if not exists pay_archives_center_idx
  on public.pay_archives (center_name);

create index if not exists pay_archives_created_idx
  on public.pay_archives (created_at desc);

create index if not exists pay_archives_search_idx
  on public.pay_archives using gin (to_tsvector('simple', coalesce(search_text, '')));

-- 2) RLS (공개)
alter table public.pay_archives enable row level security;

drop policy if exists "pay_archives_select_all" on public.pay_archives;
drop policy if exists "pay_archives_insert_all" on public.pay_archives;
drop policy if exists "pay_archives_update_all" on public.pay_archives;
drop policy if exists "pay_archives_delete_all" on public.pay_archives;

create policy "pay_archives_select_all" on public.pay_archives
  for select using (true);
create policy "pay_archives_insert_all" on public.pay_archives
  for insert with check (true);
create policy "pay_archives_update_all" on public.pay_archives
  for update using (true);
create policy "pay_archives_delete_all" on public.pay_archives
  for delete using (true);

-- 3) Storage 버킷 (대시보드에서 만들어도 됨)
insert into storage.buckets (id, name, public, file_size_limit)
values ('pay-archives', 'pay-archives', true, 52428800)
on conflict (id) do update set public = true;

-- 4) Storage 정책 (공개 읽기/쓰기)
drop policy if exists "pay_archives_storage_select" on storage.objects;
drop policy if exists "pay_archives_storage_insert" on storage.objects;
drop policy if exists "pay_archives_storage_update" on storage.objects;
drop policy if exists "pay_archives_storage_delete" on storage.objects;

create policy "pay_archives_storage_select" on storage.objects
  for select using (bucket_id = 'pay-archives');
create policy "pay_archives_storage_insert" on storage.objects
  for insert with check (bucket_id = 'pay-archives');
create policy "pay_archives_storage_update" on storage.objects
  for update using (bucket_id = 'pay-archives');
create policy "pay_archives_storage_delete" on storage.objects
  for delete using (bucket_id = 'pay-archives');

-- 5) 설정 (자료 조회 비밀번호 등)
create table if not exists public.pay_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.pay_settings enable row level security;

drop policy if exists "pay_settings_select_all" on public.pay_settings;
drop policy if exists "pay_settings_upsert_all" on public.pay_settings;
drop policy if exists "pay_settings_update_all" on public.pay_settings;
drop policy if exists "pay_settings_insert_all" on public.pay_settings;

create policy "pay_settings_select_all" on public.pay_settings
  for select using (true);
create policy "pay_settings_insert_all" on public.pay_settings
  for insert with check (true);
create policy "pay_settings_update_all" on public.pay_settings
  for update using (true);

insert into public.pay_settings (key, value)
values ('library_password', '000000')
on conflict (key) do nothing;
