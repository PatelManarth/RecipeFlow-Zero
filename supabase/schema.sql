create table if not exists public.app_state (
  id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "read own app state" on public.app_state;
drop policy if exists "insert own app state" on public.app_state;
drop policy if exists "update own app state" on public.app_state;
drop policy if exists "delete own app state" on public.app_state;

create policy "read own app state"
on public.app_state for select
to authenticated
using (auth.uid() = id);

create policy "insert own app state"
on public.app_state for insert
to authenticated
with check (auth.uid() = id);

create policy "update own app state"
on public.app_state for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "delete own app state"
on public.app_state for delete
to authenticated
using (auth.uid() = id);

revoke all on table public.app_state from anon;
grant select, insert, update, delete on table public.app_state to authenticated;