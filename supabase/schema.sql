create table if not exists public.app_state (id uuid primary key references auth.users(id) on delete cascade,data jsonb not null default '{}'::jsonb,updated_at timestamptz not null default now());
alter table public.app_state enable row level security;
create policy "read own app state" on public.app_state for select using (auth.uid() = id);
create policy "insert own app state" on public.app_state for insert with check (auth.uid() = id);
create policy "update own app state" on public.app_state for update using (auth.uid() = id) with check (auth.uid() = id);