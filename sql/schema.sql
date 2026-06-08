-- Family Board schema
create table if not exists public.cards (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,
  column_key  text not null default 'ideas' check (column_key in ('ideas','todo','doing','done')),
  author      text,
  position    double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- key/value store for shared settings (people names, column labels)
create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);

alter table public.cards    enable row level security;
alter table public.settings enable row level security;

-- Family board: anon key + app passcode is the gate. Allow anon full access.
drop policy if exists "anon all cards" on public.cards;
create policy "anon all cards" on public.cards for all using (true) with check (true);
drop policy if exists "anon all settings" on public.settings;
create policy "anon all settings" on public.settings for all using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table public.cards;
alter publication supabase_realtime add table public.settings;
