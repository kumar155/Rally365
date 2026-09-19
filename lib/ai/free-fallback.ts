import type { SupabaseClient } from "@supabase/supabase-js";

function norm(s: string) { return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }

export async function runFreeFallback(supabase: SupabaseClient, groupId: string, question: string) {
  const { data: players, error: pe } = await supabase.from("players").select("id,name").eq("group_id", groupId).order("name");
  const { data: matches, error: me } = await supabase.from("matches").select("id,team_a_score,team_b_score,played_at,status,match_players(player_id,team)").eq("group_id", groupId).neq("status", "VOIDED").order("played_at", { ascending: false }).limit(500);
  if (pe || me) throw new Error("Could not load Rally365 match data.");
  const ps = players || []; const ms: any[] = matches || []; const q = norm(question);
  const findPlayer = (text: string) => ps.find(p => norm(text).includes(norm(p.name)));
  const mentioned = ps.filter(p => q.includes(norm(p.name)));
  const fmt = (d: string) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const resultFor = (m: any, pid: string) => { const row = m.match_players?.find((x: any) => x.player_id === pid); if (!row) return null; const own = row.team === "A" ? m.team_a_score : m.team_b_score; const opp = row.team === "A" ? m.team_b_score : m.team_a_score; return own > opp ? "W" : own < opp ? "L" : "D"; };

  if (/last\s+\d+|recent|latest/.test(q) && mentioned.length === 1) {
    const n = Number(q.match(/last\s+(\d+)/)?.[1] || 10); const p = mentioned[0];
    const rows = ms.filter(m => m.match_players?.some((x: any) => x.player_id === p.id)).slice(0, n);
    const w = rows.filter(m => resultFor(m, p.id) === "W").length; const l = rows.filter(m => resultFor(m, p.id) === "L").length;
    return `${p.name}'s last ${rows.length} matches: ${w} wins, ${l} losses, ${rows.length ? Math.round(w / rows.length * 100) : 0}% win rate.\n\n${rows.map((m, i) => `${i + 1}. ${fmt(m.played_at)} — ${resultFor(m, p.id)} — ${m.team_a_score}-${m.team_b_score}`).join("\n")}`;
  }

  if (/partnership|together|pair|duo/.test(q) && mentioned.length >= 2) {
    const [a, b] = mentioned; const rows = ms.filter(m => { const x = m.match_players?.find((r: any) => r.player_id === a.id)?.team; const y = m.match_players?.find((r: any) => r.player_id === b.id)?.team; return x && x === y; });
    const w = rows.filter(m => resultFor(m, a.id) === "W").length; return `${a.name} and ${b.name} have played together ${rows.length} time${rows.length === 1 ? "" : "s"}: ${w} wins, ${rows.length - w} losses, ${rows.length ? Math.round(w / rows.length * 100) : 0}% win rate.`;
  }

  if (mentioned.length === 1 && /most against|played most against|opponent/.test(q)) {
    const p = mentioned[0]; const counts = new Map<string, { name: string; matches: number }>();
    ms.forEach(m => {
      const row = m.match_players?.find((x: any) => x.player_id === p.id); if (!row) return;
      (m.match_players || []).filter((x: any) => x.player_id !== p.id && x.team !== row.team).forEach((x: any) => {
        const op = ps.find((x2: any) => x2.id === x.player_id); if (!op) return;
        const cur = counts.get(op.id) || { name: op.name, matches: 0 }; cur.matches++; counts.set(op.id, cur);
      });
    });
    const rows = [...counts.values()].sort((a, b) => b.matches - a.matches).slice(0, 5);
    return rows.length ? `${p.name}'s most frequent opponents:\n\n${rows.map((x, i) => `${i + 1}. ${x.name} — ${x.matches} matches`).join("\n")}` : `No opponent history found for ${p.name}.`;
  }

  if (mentioned.length === 1) {
    const p = mentioned[0]; const rows = ms.filter(m => m.match_players?.some((x: any) => x.player_id === p.id)); const w = rows.filter(m => resultFor(m, p.id) === "W").length; return `${p.name}: ${rows.length} matches, ${w} wins, ${rows.length - w} losses, ${rows.length ? Math.round(w / rows.length * 100) : 0}% win rate (all recorded non-voided matches).`;
  }

  if (/recent|latest|matches|games/.test(q)) return `There are ${ms.length} recorded non-voided matches in Rally365. The most recent are:\n\n${ms.slice(0, 5).map((m, i) => `${i + 1}. ${fmt(m.played_at)} — ${m.team_a_score}-${m.team_b_score}`).join("\n")}`;
  return "Free mode is active because no OPENAI_API_KEY is configured. I can still answer common Rally365 match, player, recent-match, and partnership questions. Add the API key later to unlock the full LLM database agent.";
}
