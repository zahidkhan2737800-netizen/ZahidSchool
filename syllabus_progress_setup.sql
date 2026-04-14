-- syllabus_progress_setup.sql
-- Creates syllabus progress table + RLS without relying on get_my_school_id().

create extension if not exists pgcrypto;

create table if not exists public.syllabus_progress (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  month_key text not null default 'default',
  columns_json jsonb not null default '[]'::jsonb,
  rows_json jsonb not null default '[]'::jsonb,
  updated_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_syllabus_progress_school on public.syllabus_progress(school_id);
create index if not exists idx_syllabus_progress_class on public.syllabus_progress(class_id);
create index if not exists idx_syllabus_progress_month on public.syllabus_progress(month_key);

-- Unique per school+class+session
drop constraint if exists uq_syllabus_progress_school_class on public.syllabus_progress;
drop index if exists uq_syllabus_progress_scope;
alter table public.syllabus_progress add constraint uq_syllabus_progress_school_class_session unique (school_id, class_id, month_key);

create or replace function public.set_updated_at_syllabus_progress()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_syllabus_progress on public.syllabus_progress;
create trigger trg_set_updated_at_syllabus_progress
before update on public.syllabus_progress
for each row execute function public.set_updated_at_syllabus_progress();

alter table public.syllabus_progress enable row level security;

-- Remove old policies if they exist
drop policy if exists syllabus_progress_select_school on public.syllabus_progress;
drop policy if exists syllabus_progress_insert_school on public.syllabus_progress;
drop policy if exists syllabus_progress_update_school on public.syllabus_progress;
drop policy if exists syllabus_progress_delete_school on public.syllabus_progress;

-- Read only rows for current user's school
create policy syllabus_progress_select_school
on public.syllabus_progress
for select
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.school_id = syllabus_progress.school_id
  )
);

-- Insert only into current user's school
create policy syllabus_progress_insert_school
on public.syllabus_progress
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.school_id = syllabus_progress.school_id
  )
);

-- Update only rows for current user's school
create policy syllabus_progress_update_school
on public.syllabus_progress
for update
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.school_id = syllabus_progress.school_id
  )
)
with check (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.school_id = syllabus_progress.school_id
  )
);

-- Delete only rows for current user's school
create policy syllabus_progress_delete_school
on public.syllabus_progress
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.school_id = syllabus_progress.school_id
  )
);
