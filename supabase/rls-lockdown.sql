-- ============================================================
-- pay-table RLS 강화 (anon/public 직접 접근 차단)
-- ============================================================
-- 실행 위치: Supabase Dashboard → SQL Editor → Run
--
-- 전제:
--   - Vercel API가 SUPABASE_SERVICE_ROLE_KEY 로만 DB 접근
--   - service_role 은 RLS를 우회하므로 사이트 기능 유지
--   - Storage 버킷 public URL 다운로드는 그대로 둠 (이 스크립트 범위 밖)
--
-- 실행 전 권장: Table Editor에서 pay_archives / pay_settings CSV Export
-- ============================================================

-- 1) RLS 켜기
alter table if exists public.pay_archives enable row level security;
alter table if exists public.pay_settings enable row level security;

-- 2) 기존 "전체 허용" 정책 제거 (있을 때만)
drop policy if exists "pay_archives_select_all" on public.pay_archives;
drop policy if exists "pay_archives_insert_all" on public.pay_archives;
drop policy if exists "pay_archives_update_all" on public.pay_archives;
drop policy if exists "pay_archives_delete_all" on public.pay_archives;

drop policy if exists "pay_settings_select_all" on public.pay_settings;
drop policy if exists "pay_settings_insert_all" on public.pay_settings;
drop policy if exists "pay_settings_update_all" on public.pay_settings;
drop policy if exists "pay_settings_upsert_all" on public.pay_settings;

-- 이름 다른 개방 정책이 있을 수 있어 목록 확인용 (에러 무시하고 수동 drop 가능)
-- select policyname, tablename from pg_policies where tablename in ('pay_archives','pay_settings');

-- 3) anon / authenticated 에 정책 없음 = REST로 테이블 접근 불가
--    (의도적으로 CREATE POLICY 하지 않음)
--    service_role / 서버 시크릿 키만 접근 가능

-- 4) 테이블 권한 정리 (방어적)
revoke all on table public.pay_archives from anon, authenticated;
revoke all on table public.pay_settings from anon, authenticated;

-- PostgREST가 스키마를 볼 수 있게 usage는 유지하는 경우가 많음
-- 데이터 접근은 위 revoke + RLS 로 차단
grant usage on schema public to anon, authenticated;

-- service_role 은 기본적으로 bypass + 권한 보유. 명시 grant (환경에 따라 불필요할 수 있음)
grant all on table public.pay_archives to service_role;
grant all on table public.pay_settings to service_role;

-- 5) 확인 쿼리 (실행 후 결과 확인)
-- 정책 0건이어야 함 (또는 우리가 만든 정책만)
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where tablename in ('pay_archives', 'pay_settings')
order by tablename, policyname;

select relname, relrowsecurity
from pg_class
where relname in ('pay_archives', 'pay_settings');
