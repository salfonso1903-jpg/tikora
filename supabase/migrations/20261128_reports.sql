-- TIKORA şikâyet kayıtları. Supabase SQL Editor'da bir kez çalıştırın.
create table if not exists public.reports (id uuid primary key default gen_random_uuid(), reporter_id uuid not null references auth.users(id) on delete cascade, target_type text not null check (target_type in ('post','user')), target_id uuid not null, reason text not null, status text not null default 'pending', created_at timestamptz not null default now());
alter table public.reports enable row level security;
drop policy if exists "Users can submit reports" on public.reports;
create policy "Users can submit reports" on public.reports for insert to authenticated with check (auth.uid() = reporter_id);
drop policy if exists "Users can view own reports" on public.reports;
create policy "Users can view own reports" on public.reports for select to authenticated using (auth.uid() = reporter_id);
