-- Bullet Journal: canonical tasks, immutable daily plans, and execution logs.
-- Run through the Supabase CLI (`supabase db push`) or paste into the SQL editor.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 500),
  due_date date,
  status text not null default 'open' check (status in ('open', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  journal_date date not null,
  scheduled_hour smallint not null check (scheduled_hour between 0 and 23),
  title_snapshot text not null check (length(trim(title_snapshot)) between 1 and 500),
  status text not null default 'planned' check (status in ('planned', 'cancelled')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique (id, user_id),
  constraint plans_task_owner_fk
    foreign key (task_id, user_id) references public.tasks(id, user_id) on delete restrict,
  constraint plans_cancelled_state_check check (
    (status = 'planned' and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null)
  )
);

create table if not exists public.executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid,
  plan_id uuid,
  journal_date date not null,
  executed_at timestamptz not null,
  title_snapshot text not null check (length(trim(title_snapshot)) between 1 and 500),
  source text not null check (source in ('plan', 'manual')),
  status text not null default 'recorded' check (status in ('recorded', 'voided')),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  constraint executions_task_owner_fk
    foreign key (task_id, user_id) references public.tasks(id, user_id) on delete restrict,
  constraint executions_plan_owner_fk
    foreign key (plan_id, user_id) references public.plans(id, user_id) on delete restrict,
  constraint executions_source_relation_check check (
    (source = 'plan' and plan_id is not null and task_id is not null)
    or (source = 'manual' and plan_id is null)
  ),
  constraint executions_voided_state_check check (
    (status = 'recorded' and voided_at is null)
    or (status = 'voided' and voided_at is not null)
  )
);

create index if not exists tasks_user_status_idx on public.tasks (user_id, status, due_date);
create index if not exists plans_user_date_idx on public.plans (user_id, journal_date, scheduled_hour);
create index if not exists executions_user_date_idx on public.executions (user_id, journal_date, executed_at);

-- A task can occupy only one active plan slot per day. Cancelled plans remain as history.
create unique index if not exists plans_one_active_task_per_day_idx
  on public.plans (user_id, task_id, journal_date)
  where status = 'planned';

-- Checking a plan creates at most one active execution. Voiding it permits another attempt.
create unique index if not exists executions_one_active_per_plan_idx
  on public.executions (user_id, plan_id)
  where plan_id is not null and status = 'recorded';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;
alter table public.plans enable row level security;
alter table public.executions enable row level security;

revoke all on public.tasks from anon, authenticated;
revoke all on public.plans from anon, authenticated;
revoke all on public.executions from anon, authenticated;

grant select, insert on public.tasks to authenticated;
grant update (title, due_date, status) on public.tasks to authenticated;
grant select, insert on public.plans to authenticated;
grant update (status, cancelled_at) on public.plans to authenticated;
grant select, insert on public.executions to authenticated;
grant update (status, voided_at) on public.executions to authenticated;

drop policy if exists "users select own tasks" on public.tasks;
create policy "users select own tasks"
on public.tasks for select to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "users insert own tasks" on public.tasks;
create policy "users insert own tasks"
on public.tasks for insert to authenticated
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "users update own tasks" on public.tasks;
create policy "users update own tasks"
on public.tasks for update to authenticated
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "users select own plans" on public.plans;
create policy "users select own plans"
on public.plans for select to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "users insert own plans" on public.plans;
create policy "users insert own plans"
on public.plans for insert to authenticated
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "users update own plans" on public.plans;
create policy "users update own plans"
on public.plans for update to authenticated
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "users select own executions" on public.executions;
create policy "users select own executions"
on public.executions for select to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "users insert own executions" on public.executions;
create policy "users insert own executions"
on public.executions for insert to authenticated
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "users update own executions" on public.executions;
create policy "users update own executions"
on public.executions for update to authenticated
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);
