-- IELTStar: row level security, student data tables, and AI usage quotas.
--
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- It is safe to run more than once.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text,
  target_band numeric(2, 1) default 7.5,
  test_date date,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Create a profile row automatically for every new account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Recording metadata (the audio itself lives in Cloudflare R2)
-- ---------------------------------------------------------------------------
create table if not exists public.recordings (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  r2_key text,
  part text,
  topic_id text,
  session_id text,
  mock_id text,
  duration_seconds integer,
  byte_size integer,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists recordings_user_created_idx
  on public.recordings (user_id, created_at desc);

alter table public.recordings enable row level security;

drop policy if exists recordings_select_own on public.recordings;
create policy recordings_select_own on public.recordings
  for select using (auth.uid() = user_id);

drop policy if exists recordings_insert_own on public.recordings;
create policy recordings_insert_own on public.recordings
  for insert with check (auth.uid() = user_id);

drop policy if exists recordings_update_own on public.recordings;
create policy recordings_update_own on public.recordings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists recordings_delete_own on public.recordings;
create policy recordings_delete_own on public.recordings
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Practice sessions
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  kind text,
  title text,
  total_seconds integer default 0,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.sessions enable row level security;

drop policy if exists sessions_select_own on public.sessions;
create policy sessions_select_own on public.sessions
  for select using (auth.uid() = user_id);

drop policy if exists sessions_insert_own on public.sessions;
create policy sessions_insert_own on public.sessions
  for insert with check (auth.uid() = user_id);

drop policy if exists sessions_update_own on public.sessions;
create policy sessions_update_own on public.sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sessions_delete_own on public.sessions;
create policy sessions_delete_own on public.sessions
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- AI limits and usage
-- ---------------------------------------------------------------------------

-- Single-row config table so limits can be tuned from the dashboard without a
-- redeploy. Defaults are deliberately generous: 60 minutes of transcription a
-- day is roughly double a hard-working student's usage.
create table if not exists public.ai_limits (
  id boolean primary key default true,
  daily_transcription_seconds integer not null default 3600,
  daily_chat_messages integer not null default 40,
  global_daily_transcription_seconds integer not null default 120000,
  updated_at timestamptz not null default now(),
  constraint ai_limits_single_row check (id)
);

insert into public.ai_limits (id) values (true) on conflict (id) do nothing;

-- No policies are created, so with RLS enabled no client key can read or write
-- this table. Only the service role and security-definer functions can.
alter table public.ai_limits enable row level security;

create table if not exists public.ai_usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null default ((now() at time zone 'utc')::date),
  transcription_seconds integer not null default 0,
  chat_messages integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create index if not exists ai_usage_daily_date_idx
  on public.ai_usage_daily (usage_date);

alter table public.ai_usage_daily enable row level security;

-- Students may read their own usage so the UI can show "45 of 60 minutes",
-- but there is no insert or update policy: all writes go through
-- consume_ai_quota() so usage counters cannot be tampered with.
drop policy if exists ai_usage_select_own on public.ai_usage_daily;
create policy ai_usage_select_own on public.ai_usage_daily
  for select using (auth.uid() = user_id);

-- Atomically reserve quota. Checking and incrementing in one transaction stops
-- two concurrent requests from both passing the check.
create or replace function public.consume_ai_quota(
  p_user_id uuid,
  p_seconds integer default 0,
  p_messages integer default 0
)
returns table (
  allowed boolean,
  reason text,
  seconds_used integer,
  seconds_limit integer,
  messages_used integer,
  messages_limit integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limits public.ai_limits;
  v_today date := (now() at time zone 'utc')::date;
  v_seconds integer;
  v_messages integer;
  v_global integer;
begin
  select * into v_limits from public.ai_limits where id;

  insert into public.ai_usage_daily (user_id, usage_date)
  values (p_user_id, v_today)
  on conflict (user_id, usage_date) do nothing;

  select transcription_seconds, chat_messages
    into v_seconds, v_messages
    from public.ai_usage_daily
   where user_id = p_user_id and usage_date = v_today
     for update;

  if v_seconds + p_seconds > v_limits.daily_transcription_seconds then
    return query select false, 'DAILY_MINUTES_EXCEEDED', v_seconds,
      v_limits.daily_transcription_seconds, v_messages,
      v_limits.daily_chat_messages;
    return;
  end if;

  if v_messages + p_messages > v_limits.daily_chat_messages then
    return query select false, 'DAILY_MESSAGES_EXCEEDED', v_seconds,
      v_limits.daily_transcription_seconds, v_messages,
      v_limits.daily_chat_messages;
    return;
  end if;

  select coalesce(sum(transcription_seconds), 0) into v_global
    from public.ai_usage_daily where usage_date = v_today;

  if v_global + p_seconds > v_limits.global_daily_transcription_seconds then
    return query select false, 'GLOBAL_DAILY_LIMIT', v_seconds,
      v_limits.daily_transcription_seconds, v_messages,
      v_limits.daily_chat_messages;
    return;
  end if;

  update public.ai_usage_daily
     set transcription_seconds = transcription_seconds + p_seconds,
         chat_messages = chat_messages + p_messages,
         updated_at = now()
   where user_id = p_user_id and usage_date = v_today
   returning transcription_seconds, chat_messages
      into v_seconds, v_messages;

  return query select true, 'OK', v_seconds,
    v_limits.daily_transcription_seconds, v_messages,
    v_limits.daily_chat_messages;
end;
$$;

-- Only the server (service role) may spend quota.
revoke all on function public.consume_ai_quota(uuid, integer, integer)
  from public, anon, authenticated;
