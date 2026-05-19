-- monitoring_archive_setup.sql
-- Creates the table to permanently store (freeze) session data for monitoring.

create table if not exists public.monitoring_archives (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  session_value text not null,
  class_name text not null,
  archive_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id, session_value, class_name)
);

create index if not exists idx_mon_arch_school on public.monitoring_archives(school_id);
create index if not exists idx_mon_arch_sess_cls on public.monitoring_archives(session_value, class_name);

alter table public.monitoring_archives enable row level security;

drop policy if exists mon_arch_select on public.monitoring_archives;
create policy mon_arch_select on public.monitoring_archives for select
to authenticated using (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = monitoring_archives.school_id
  )
);

drop policy if exists mon_arch_insert on public.monitoring_archives;
create policy mon_arch_insert on public.monitoring_archives for insert
to authenticated with check (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = monitoring_archives.school_id
  )
);

drop policy if exists mon_arch_update on public.monitoring_archives;
create policy mon_arch_update on public.monitoring_archives for update
to authenticated using (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = monitoring_archives.school_id
  )
);

drop policy if exists mon_arch_delete on public.monitoring_archives;
create policy mon_arch_delete on public.monitoring_archives for delete
to authenticated using (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = monitoring_archives.school_id
  )
);
