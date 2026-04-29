-- Obscribe synced AI provider vaults
-- Run this in Supabase SQL Editor before enabling account-wide API key sync.

create table if not exists public.user_ai_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'google', 'xai')),
  encrypted_vault jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_ai_vaults enable row level security;

drop policy if exists "Users can read their own AI vault" on public.user_ai_vaults;
create policy "Users can read their own AI vault"
  on public.user_ai_vaults for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own AI vault" on public.user_ai_vaults;
create policy "Users can insert their own AI vault"
  on public.user_ai_vaults for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own AI vault" on public.user_ai_vaults;
create policy "Users can update their own AI vault"
  on public.user_ai_vaults for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own AI vault" on public.user_ai_vaults;
create policy "Users can delete their own AI vault"
  on public.user_ai_vaults for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_ai_vaults to authenticated;
