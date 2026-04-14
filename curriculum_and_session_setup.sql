-- curriculum_and_session_setup.sql
-- Creates curriculum, subject, and session tables with RLS

create extension if not exists pgcrypto;

-- Curriculum Table
create table if not exists public.curriculum (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_curriculum_school on public.curriculum(school_id);

-- Subject Table (linked to Curriculum)
create table if not exists public.subject (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  curriculum_id uuid not null references public.curriculum(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subject_school on public.subject(school_id);
create index if not exists idx_subject_curriculum on public.subject(curriculum_id);

-- Session Table
create table if not exists public.session (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  session_value text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_session_school on public.session(school_id);

-- Update trigger for curriculum
create or replace function public.set_updated_at_curriculum()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_curriculum on public.curriculum;
create trigger trg_set_updated_at_curriculum
before update on public.curriculum
for each row execute function public.set_updated_at_curriculum();

-- Update trigger for subject
create or replace function public.set_updated_at_subject()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_subject on public.subject;
create trigger trg_set_updated_at_subject
before update on public.subject
for each row execute function public.set_updated_at_subject();

-- Update trigger for session
create or replace function public.set_updated_at_session()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_session on public.session;
create trigger trg_set_updated_at_session
before update on public.session
for each row execute function public.set_updated_at_session();

-- Enable RLS
alter table public.curriculum enable row level security;
alter table public.subject enable row level security;
alter table public.session enable row level security;

-- Drop old policies
drop policy if exists curriculum_select_school on public.curriculum;
drop policy if exists curriculum_insert_school on public.curriculum;
drop policy if exists curriculum_update_school on public.curriculum;
drop policy if exists curriculum_delete_school on public.curriculum;

drop policy if exists subject_select_school on public.subject;
drop policy if exists subject_insert_school on public.subject;
drop policy if exists subject_update_school on public.subject;
drop policy if exists subject_delete_school on public.subject;

drop policy if exists session_select_school on public.session;
drop policy if exists session_insert_school on public.session;
drop policy if exists session_update_school on public.session;
drop policy if exists session_delete_school on public.session;

-- Curriculum Policies
create policy curriculum_select_school on public.curriculum for select
to authenticated using (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = curriculum.school_id
  )
);

create policy curriculum_insert_school on public.curriculum for insert
to authenticated with check (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = curriculum.school_id
  )
);

create policy curriculum_update_school on public.curriculum for update
to authenticated using (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = curriculum.school_id
  )
)
with check (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = curriculum.school_id
  )
);

create policy curriculum_delete_school on public.curriculum for delete
to authenticated using (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = curriculum.school_id
  )
);

-- Subject Policies
create policy subject_select_school on public.subject for select
to authenticated using (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = subject.school_id
  )
);

create policy subject_insert_school on public.subject for insert
to authenticated with check (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = subject.school_id
  )
);

create policy subject_update_school on public.subject for update
to authenticated using (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = subject.school_id
  )
)
with check (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = subject.school_id
  )
);

create policy subject_delete_school on public.subject for delete
to authenticated using (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = subject.school_id
  )
);

-- Session Policies
create policy session_select_school on public.session for select
to authenticated using (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = session.school_id
  )
);

create policy session_insert_school on public.session for insert
to authenticated with check (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = session.school_id
  )
);

create policy session_update_school on public.session for update
to authenticated using (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = session.school_id
  )
)
with check (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = session.school_id
  )
);

create policy session_delete_school on public.session for delete
to authenticated using (
  school_id is null or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.school_id = session.school_id
  )
);
