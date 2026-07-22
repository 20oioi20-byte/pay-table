-- 자료 조회 비밀번호 설정 테이블 (기존 프로젝트에 추가 실행)
create table if not exists public.pay_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.pay_settings enable row level security;

drop policy if exists "pay_settings_select_all" on public.pay_settings;
drop policy if exists "pay_settings_insert_all" on public.pay_settings;
drop policy if exists "pay_settings_update_all" on public.pay_settings;
-- 개방 정책 없음 — 서버 service_role 만 접근 (rls-lockdown.sql 참고)

insert into public.pay_settings (key, value)
values ('library_password', '000000')
on conflict (key) do nothing;
