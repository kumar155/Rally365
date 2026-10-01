import { supabase } from "./supabase";

type Round = { id: string; round_number: number; round_type: string; name: string };
type Match = {
  id: string;
  round_id: string;
  match_number: number;
  group_id: string | null;
  team_a_duo_id: string | null;
  team_b_duo_id: string | null;
  winner_duo_id: string | null;
  status: string;
  team_a_source_match_id: string | null;
  team_a_source_result: "WINNER" | "LOSER" | null;
  team_b_source_match_id: string | null;
  team_b_source_result: "WINNER" | "LOSER" | null;
};

async function syncTournamentStatus(tournamentId: string, matches: Match[]) {
  const terminal = new Set(["COMPLETED", "WALKOVER", "CANCELLED"]);
  const hasMatches = matches.length > 0;
  const allTerminal = hasMatches && matches.every((m) => terminal.has(m.status));
  const inProgress = matches.some((m) => m.status === "LIVE") || matches.some((m) => terminal.has(m.status));
  const nextStatus = allTerminal ? "COMPLETED" : inProgress ? "LIVE" : "UPCOMING";

  await supabase
    .from("tournaments")
    .update({ status: nextStatus })
    .eq("id", tournamentId)
    .neq("status", "CANCELLED");
}

function sourceTeam(source: Match, result: "WINNER" | "LOSER") {
  if (source.status !== "COMPLETED" && source.status !== "WALKOVER") return null;
  const winner = source.winner_duo_id;
  if (!winner) return null;
  if (result === "WINNER") return winner;
  if (winner === source.team_a_duo_id) return source.team_b_duo_id;
  if (winner === source.team_b_duo_id) return source.team_a_duo_id;
  return null;
}

/**
 * Progress confirmed knockout matches and explicit qualification sources.
 * A target slot can now reference either the winner or loser of another match.
 * Explicit sources take precedence over the legacy winner-to-next-round rule.
 */
export async function syncTournamentProgression(tournamentId: string) {
  const [{ data: tournament }, { data: rounds }, { data: matches }] = await Promise.all([
    supabase
      .from("tournaments")
      .select("format")
      .eq("id", tournamentId)
      .single(),
    supabase
      .from("tournament_rounds")
      .select("id,round_number,round_type,name")
      .eq("tournament_id", tournamentId)
      .order("round_number"),
    supabase
      .from("tournament_matches")
      .select("id,round_id,match_number,group_id,team_a_duo_id,team_b_duo_id,winner_duo_id,status,team_a_source_match_id,team_a_source_result,team_b_source_match_id,team_b_source_result")
      .eq("tournament_id", tournamentId)
      .order("match_number"),
  ]);

  if (!tournament || !rounds || !matches) return;

  const roundRows = rounds as Round[];
  const matchRows = matches as Match[];
  const byId = new Map(matchRows.map((m) => [m.id, m]));

  await syncTournamentStatus(tournamentId, matchRows);

  if (tournament.format === "GROUPS_KNOCKOUT") {
    const groupRounds = roundRows.filter((r) => r.round_type === "GROUP");
    if (groupRounds.length) {
      const { data: groups } = await supabase
        .from("tournament_groups")
        .select("id,qualification_confirmed")
        .eq("tournament_id", tournamentId);
      if ((groups || []).some((g) => !g.qualification_confirmed)) return;
    }
  }

  const knockoutRounds = roundRows
    .filter((r) => r.round_type !== "GROUP")
    .sort((a, b) => a.round_number - b.round_number);

  // First resolve explicit sources. This supports winner/loser brackets,
  // eliminators and 3rd-place matches, including sources in the same round.
  for (const target of matchRows.filter((m) => m.round_id && (m.team_a_source_match_id || m.team_b_source_match_id))) {
    const patch: Record<string, string | null> = {};
    if (target.team_a_source_match_id && target.team_a_source_result) {
      patch.team_a_duo_id = sourceTeam(byId.get(target.team_a_source_match_id) as Match, target.team_a_source_result);
    }
    if (target.team_b_source_match_id && target.team_b_source_result) {
      patch.team_b_duo_id = sourceTeam(byId.get(target.team_b_source_match_id) as Match, target.team_b_source_result);
    }
    if (Object.keys(patch).length) {
      await supabase.from("tournament_matches").update(patch).eq("id", target.id);
      Object.assign(target, patch);
    }
  }

  // Preserve the existing automatic winner progression for slots that do not
  // have an explicit source configured.
  for (let i = 0; i < knockoutRounds.length - 1; i++) {
    const current = knockoutRounds[i];
    const next = knockoutRounds[i + 1];
    const currentMatches = matchRows
      .filter((m) => m.round_id === current.id)
      .sort((a, b) => a.match_number - b.match_number);
    const nextMatches = matchRows
      .filter((m) => m.round_id === next.id)
      .sort((a, b) => a.match_number - b.match_number);

    for (let index = 0; index < currentMatches.length; index++) {
      const winner = currentMatches[index].winner_duo_id;
      const target = nextMatches[Math.floor(index / 2)];
      if (!winner || !target) continue;
      const field = index % 2 === 0 ? "team_a_duo_id" : "team_b_duo_id";
      const sourceField = index % 2 === 0 ? "team_a_source_match_id" : "team_b_source_match_id";
      if (target[sourceField]) continue;
      await supabase
        .from("tournament_matches")
        .update({ [field]: winner })
        .eq("id", target.id);
      target[field] = winner;
    }
  }
}
