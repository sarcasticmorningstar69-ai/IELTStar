-- ==============================================================================
-- IELTStar Speaking Lab: Database Schema
-- Run this script in your Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. PROFILES TABLE (Stores user settings, target scores, and Google metadata)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  name text,
  avatar_url text,
  target_band numeric(2,1) default 7.5,
  test_date text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Trigger: Automatically create a profile row when a user signs in with Google or Email
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, avatar_url, target_band)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'Student'),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    7.5
  )
  on conflict (id) do update set
    email = excluded.email,
    name = coalesce(excluded.name, public.profiles.name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if exists and recreate
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. STELLA CONVERSATIONS TABLE (Grouped chat sessions)
create table if not exists public.stella_conversations (
  id text primary key,
  user_id uuid references auth.users on delete cascade not null,
  scope_key text not null default 'general',
  title text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.stella_conversations enable row level security;

create policy "Users can view own conversations"
  on public.stella_conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert own conversations"
  on public.stella_conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own conversations"
  on public.stella_conversations for update
  using (auth.uid() = user_id);

create policy "Users can delete own conversations"
  on public.stella_conversations for delete
  using (auth.uid() = user_id);

create index if not exists idx_stella_conversations_user
  on public.stella_conversations(user_id, updated_at desc);

-- 3. STELLA MESSAGES TABLE (Individual conversation turns)
create table if not exists public.stella_messages (
  id text primary key,
  conversation_id text references public.stella_conversations(id) on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  sender text not null check (sender in ('stella', 'user')),
  text text not null,
  timestamp text not null,
  created_at timestamptz default now()
);

alter table public.stella_messages enable row level security;

create policy "Users can view own messages"
  on public.stella_messages for select
  using (auth.uid() = user_id);

create policy "Users can insert own messages"
  on public.stella_messages for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own messages"
  on public.stella_messages for delete
  using (auth.uid() = user_id);

create index if not exists idx_stella_messages_conversation
  on public.stella_messages(conversation_id, created_at asc);

-- 4. USER PROGRESS & SESSIONS TABLE (Speaking scores and audio keys)
create table if not exists public.user_progress (
  id text primary key,
  user_id uuid references auth.users on delete cascade not null,
  kind text not null,
  overall_band numeric(2,1),
  scores jsonb default '{}'::jsonb,
  recording_ids text[] default array[]::text[],
  r2_audio_keys text[] default array[]::text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.user_progress enable row level security;

create policy "Users can view own progress"
  on public.user_progress for select
  using (auth.uid() = user_id);

create policy "Users can insert own progress"
  on public.user_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update own progress"
  on public.user_progress for update
  using (auth.uid() = user_id);

create policy "Users can delete own progress"
  on public.user_progress for delete
  using (auth.uid() = user_id);

create index if not exists idx_user_progress_user
  on public.user_progress(user_id, updated_at desc);
