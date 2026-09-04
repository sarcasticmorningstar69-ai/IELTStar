-- Launch budget guardrails. Run after 0001_security_and_quotas.sql.
-- 60 minutes/student/day, 40 chat messages/student/day, 600 transcription minutes/day globally.
update public.ai_limits
set daily_transcription_seconds = 3600,
    daily_chat_messages = 40,
    global_daily_transcription_seconds = 36000,
    updated_at = now()
where id = true;
