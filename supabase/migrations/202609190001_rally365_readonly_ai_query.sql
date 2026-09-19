-- Rally365 AI: controlled read-only SQL gateway.
-- Apply this migration in Supabase before enabling OPENAI_API_KEY.
create or replace function public.rally365_readonly_query(p_sql text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sql text := btrim(p_sql);
  v_result jsonb;
begin
  if v_sql is null or v_sql = '' then
    raise exception 'Query is required';
  end if;

  -- The application performs additional validation, but the database must enforce
  -- the same boundary because this function executes dynamic SQL.
  if v_sql !~* '^select\\s' then
    raise exception 'Only SELECT queries are allowed';
  end if;
  if v_sql ~* '\\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|merge|call|do|copy)\\b' then
    raise exception 'Write or procedural SQL is not allowed';
  end if;
  if v_sql ~* '(pg_catalog|information_schema|pg_|\\bauth\\.)' then
    raise exception 'System catalog access is not allowed';
  end if;
  if v_sql !~* '\\b(limit)\\s+[0-9]+' then
    raise exception 'A LIMIT clause is required';
  end if;

  execute format('select coalesce(jsonb_agg(to_jsonb(q)), ''[]''::jsonb) from (%s) q', v_sql)
    into v_result;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.rally365_readonly_query(text) from public;
revoke all on function public.rally365_readonly_query(text) from anon;
revoke all on function public.rally365_readonly_query(text) from authenticated;
grant execute on function public.rally365_readonly_query(text) to service_role;
