-- IELTStar: exact submission counters for Stella analysis.
--
-- Run AFTER 0001_security_and_quotas.sql and 0002_launch_quota_limits.sql.
-- Safe to run more than once.
--
-- Adds, per student per UTC day:
--   * 20 recording-analysis submissions
--   * 3 full-mock submissions
-- while keeping the existing 60 transcription minutes, 40 chat messages, and
-- the global daily transcription ceiling.

-- ---------------------------------------------------------------------------
-- Limits
-- ---------------------------------------------------------------------------
alter table public.ai_limits
  add column if not exists daily_analysis_requests integer not null default 20;

alter table public.ai_limits
  add column if not exists daily_full_mock_submissions integer not null default 3;

update public.ai_limits
   set daily_analysis_requests = 20,
       daily_full_mock_submissions = 3,
       updated_at = now()
 where id = true;

-- ---------------------------------------------------------------------------
-- Usage counters
-- ---------------------------------------------------------------------------
alter table public.ai_usage_daily
  add column if not exists analysis_requests integer not null default 0;

alter table public.ai_usage_daily
  add column if not exists full_mock_submissions integer not null default 0;

-- ---------------------------------------------------------------------------
-- Idempotent reservations
--
-- A double click, a dropped connection, or a retry of only the failed provider
-- step must not charge a student twice. The client sends one stable
-- analysisRequestId per submission attempt; the first reservation wins and
-- later calls with the same key are free.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_quota_reservations (
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text not null,
  usage_date date not null default ((now() at time zone 'utc')::date),
  seconds integer not null default 0,
  messages integer not null default 0,
  analysis_requests integer not null default 0,
  full_mock_submissions integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);

create index if not exists ai_quota_reservations_date_idx
  on public.ai_quota_reservations (usage_date);

-- No policies are created, so with RLS enabled no student key can read or
-- write reservations. Only the service role and security-definer functions can.
alter table public.ai_quota_reservations enable row level security;

-- ---------------------------------------------------------------------------
-- Atomic quota reservation, version 2
-- ---------------------------------------------------------------------------
create or replace function public.consume_ai_quota_v2(
  p_user_id uuid,
  p_seconds integer default 0,
  p_messages integer default 0,
  p_analyses integer default 0,
  p_full_mocks integer default 0,
  p_idempotency_key text default null
)
returns table (
  allowed boolean,
  reason text,
  seconds_used integer,
  seconds_limit integer,
  messages_used integer,
  messages_limit integer,
  analyses_used integer,
  analyses_limit integer,
  full_mocks_used integer,
  full_mocks_limit integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limits public.ai_limits;
  v_today date := (now() at time zone 'utc')::date;
  v_seconds integer := 0;
  v_messages integer := 0;
  v_analyses integer := 0;
  v_mocks integer := 0;
  v_global integer := 0;
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_seen boolean := false;
begin
  select * into v_limits from public.ai_limits where id;

  insert into public.ai_usage_daily (user_id, usage_date)
  values (p_user_id, v_today)
  on conflict (user_id, usage_date) do nothing;

  -- Already reserved under this key: report success without charging again.
  if v_key is not null then
    perform 1 from public.ai_quota_reservations
      where user_id = p_user_id and idempotency_key = v_key;
    v_seen := found;

    if v_seen then
      select transcription_seconds, chat_messages, analysis_requests,
             full_mock_submissions
        into v_seconds, v_messages, v_analyses, v_mocks
        from public.ai_usage_daily
       where user_id = p_user_id and usage_date = v_today;

      return query select true, 'ALREADY_RESERVED',
        coalesce(v_seconds, 0), v_limits.daily_transcription_seconds,
        coalesce(v_messages, 0), v_limits.daily_chat_messages,
        coalesce(v_analyses, 0), v_limits.daily_analysis_requests,
        coalesce(v_mocks, 0), v_limits.daily_full_mock_submissions;
      return;
    end if;
  end if;

  select transcription_seconds, chat_messages, analysis_requests,
         full_mock_submissions
    into v_seconds, v_messages, v_analyses, v_mocks
    from public.ai_usage_daily
   where user_id = p_user_id and usage_date = v_today
     for update;

  if v_seconds + p_seconds > v_limits.daily_transcription_seconds then
    return query select false, 'DAILY_MINUTES_EXCEEDED',
      v_seconds, v_limits.daily_transcription_seconds,
      v_messages, v_limits.daily_chat_messages,
      v_analyses, v_limits.daily_analysis_requests,
      v_mocks, v_limits.daily_full_mock_submissions;
    return;
  end if;

  if v_messages + p_messages > v_limits.daily_chat_messages then
    return query select false, 'DAILY_MESSAGES_EXCEEDED',
      v_seconds, v_limits.daily_transcription_seconds,
      v_messages, v_limits.daily_chat_messages,
      v_analyses, v_limits.daily_analysis_requests,
      v_mocks, v_limits.daily_full_mock_submissions;
    return;
  end if;

  if v_analyses + p_analyses > v_limits.daily_analysis_requests then
    return query select false, 'DAILY_ANALYSES_EXCEEDED',
      v_seconds, v_limits.daily_transcription_seconds,
      v_messages, v_limits.daily_chat_messages,
      v_analyses, v_limits.daily_analysis_requests,
      v_mocks, v_limits.daily_full_mock_submissions;
    return;
  end if;

  if v_mocks + p_full_mocks > v_limits.daily_full_mock_submissions then
    return query select false, 'DAILY_FULL_MOCKS_EXCEEDED',
      v_seconds, v_limits.daily_transcription_seconds,
      v_messages, v_limits.daily_chat_messages,
      v_analyses, v_limits.daily_analysis_requests,
      v_mocks, v_limits.daily_full_mock_submissions;
    return;
  end if;

  select coalesce(sum(transcription_seconds), 0) into v_global
    from public.ai_usage_daily where usage_date = v_today;

  if v_global + p_seconds > v_limits.global_daily_transcription_seconds then
    return query select false, 'GLOBAL_DAILY_LIMIT',
      v_seconds, v_limits.daily_transcription_seconds,
      v_messages, v_limits.daily_chat_messages,
      v_analyses, v_limits.daily_analysis_requests,
      v_mocks, v_limits.daily_full_mock_submissions;
    return;
  end if;

  update public.ai_usage_daily
     set transcription_seconds = transcription_seconds + p_seconds,
         chat_messages = chat_messages + p_messages,
         analysis_requests = analysis_requests + p_analyses,
         full_mock_submissions = full_mock_submissions + p_full_mocks,
         updated_at = now()
   where user_id = p_user_id and usage_date = v_today
   returning transcription_seconds, chat_messages, analysis_requests,
             full_mock_submissions
      into v_seconds, v_messages, v_analyses, v_mocks;

  if v_key is not null then
    insert into public.ai_quota_reservations (
      user_id, idempotency_key, usage_date, seconds, messages,
      analysis_requests, full_mock_submissions
    ) values (
      p_user_id, v_key, v_today, p_seconds, p_messages,
      p_analyses, p_full_mocks
    ) on conflict (user_id, idempotency_key) do nothing;
  end if;

  return query select true, 'OK',
    v_seconds, v_limits.daily_transcription_seconds,
    v_messages, v_limits.daily_chat_messages,
    v_analyses, v_limits.daily_analysis_requests,
    v_mocks, v_limits.daily_full_mock_submissions;
end;
$$;

-- Only the server (service role) may spend quota.
revoke all on function public.consume_ai_quota_v2(
  uuid, integer, integer, integer, integer, text
) from public, anon, authenticated;
