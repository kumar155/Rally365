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
};

/**
 * Progress only already-confirmed knockout matches.
 * Group qualification is intentionally manual: the organiser selects the
 * qualifying teams and explicitly confirms them before the first knockout
 * round is populated.
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
      .select("id,round_id,match_number,group_id,team_a_duo_id,team_b_duo_id,winner_duo_id,status")
      .eq("tournament_id", tournamentId)
      .order("match_number"),
  ]);

  if (!tournament || !rounds || !matches) return;

  const roundRows = rounds as Round[];
  const matchRows = matches as Match[];

  // Never auto-select group qualifiers. The organiser must explicitly confirm
  // them from the standings/qualification screen first.
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

  // Knockout -> knockout: the winner of match N advances to the matching
  // slot in the next round. Later rounds therefore populate automatically
  // only after an actual result has been recorded.
  const knockoutRounds = roundRows
    .filter((r) => r.round_type !== "GROUP")
    .sort((a, b) => a.round_number - b.round_number);

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
      await supabase
        .from("tournament_matches")
        .update({ [field]: winner })
        .eq("id", target.id);
    }
  }

  // Tournament lifecycle is derived from match progress:
  // - LIVE once a match is live or at least one match has been completed.
  // - COMPLETED once every generated match is terminal.
  // - UPCOMING while no match has started.
  // This keeps the tournament list in sync automatically whenever a score is saved.
  const terminal = new Set(["COMPLETED", "WALKOVER", "CANCELLED"]);
  const hasMatches = matchRows.length > 0;
  const allTerminal = hasMatches && matchRows.every((m) => terminal.has(m.status));
  const inProgress = matchRows.some((m) => m.status === "LIVE") || matchRows.some((m) => terminal.has(m.status));
  const nextStatus = allTerminal ? "COMPLETED" : inProgress ? "LIVE" : "UPCOMING";

  await supabase
    .from("tournaments")
    .update({ status: nextStatus })
    .eq("id", tournamentId)
    .neq("status", "CANCELLED");
}
