import type { SupabaseClient } from "@supabase/supabase-js";

export const RALLY365_SCHEMA = `Rally365 tables available to the read-only query tool:
players(id, group_id, name, created_at)
matches(id, group_id, team_a_score, team_b_score, played_at, status, edit_count, last_edited_at)
match_players(match_id, player_id, team)
attendance(id, group_id, player_id, attendance_date, status, late_minutes, fine_amount)
expenses(id, group_id, expense_date, category, amount, description)
expense_splits(expense_id, player_id, share_amount)
duo_schedules(id, group_id, schedule_date, status, created_at, published_at)
duo_schedule_matches(id, schedule_id, match_no, team_a_player_ids, team_b_player_ids, status, recorded_match_id)

Relationships: matches.id = match_players.match_id; players.id = match_players.player_id. Always use group_id for group-owned tables. Match status VOIDED should normally be excluded from statistics.`;

function stripSql(sql: string) {
  return sql.replace(/```sql|```/gi, "").trim().replace(/;\s*$/, "");
}

export async function queryRally365(supabase: SupabaseClient, groupId: string, rawSql: string) {
  const sql = stripSql(rawSql);
  if (!/^select\b/i.test(sql) || /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|merge)\b/i.test(sql) || /\b(pg_|information_schema|auth\.)/i.test(sql)) {
    throw new Error("Only safe SELECT queries against Rally365 data are allowed.");
  }
  if (!/\b(group_id)\b/i.test(sql)) throw new Error("Rally365 queries must be group-scoped.");
  if (!/limit\s+\d+/i.test(sql)) return { error: "Query must include a LIMIT." };
  const limited = sql.replace(/limit\s+(\d+)/i, (_, n) => `LIMIT ${Math.min(Number(n), 500)}`);
  const scoped = limited.replace(/\bgroup_id\s*=\s*['"][^'"]+['"]/gi, `group_id = '${groupId}'`);
  const { data, error } = await supabase.rpc("rally365_readonly_query", { p_sql: scoped });
  if (error) throw new Error(`Database query failed: ${error.message}`);
  return data;
}
