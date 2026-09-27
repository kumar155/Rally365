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
type Group = { id: string; group_number: number; qualifying_teams: number };
type GroupDuo = { group_id: string; duo_id: string };

const completed = (status: string | null | undefined) =>
  status === "COMPLETED" || status === "WALKOVER";

export async function syncTournamentProgression(tournamentId: string) {
  const [{ data: tournament }, { data: rounds }, { data: matches }] = await Promise.all([
    supabase
      .from("tournaments")
      .select("format,group_count,qualifiers_per_group")
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

  // Group -> knockout: once every group match is complete, seed the first
  // knockout round from the actual group standings instead of leaving teams TBD.
  if (tournament.format === "GROUPS_KNOCKOUT") {
    const groupRound = roundRows.find((r) => r.round_type === "GROUP");
    const groupMatches = groupRound
      ? matchRows.filter((m) => m.round_id === groupRound.id)
      : [];

    if (groupRound && groupMatches.length && groupMatches.every((m) => completed(m.status))) {
      const { data: groups } = await supabase
        .from("tournament_groups")
        .select("id,group_number,qualifying_teams")
        .eq("tournament_id", tournamentId)
        .order("group_number");

      const groupIds = (groups || []).map((g) => g.id);
      const { data: memberships } = groupIds.length
        ? await supabase
            .from("tournament_group_duos")
            .select("group_id,duo_id")
            .in("group_id", groupIds)
        : { data: [] as GroupDuo[] };

      const ranked = new Map<string, string[]>();
      for (const g of (groups || []) as Group[]) {
        const ids = (memberships || [])
          .filter((x) => x.group_id === g.id)
          .map((x) => x.duo_id);
        const stats = new Map<string, { wins: number; gf: number; ga: number }>();
        ids.forEach((id) => stats.set(id, { wins: 0, gf: 0, ga: 0 }));

        for (const m of groupMatches.filter((x) => x.group_id === g.id)) {
          if (!m.team_a_duo_id || !m.team_b_duo_id) continue;
          const a = stats.get(m.team_a_duo_id);
          const b = stats.get(m.team_b_duo_id);
          if (!a || !b) continue;
          // Group matches are stored with their scores, but progression only
          // needs the winner. A draw is intentionally not treated as a win.
          if (m.winner_duo_id === m.team_a_duo_id) a.wins += 1;
          if (m.winner_duo_id === m.team_b_duo_id) b.wins += 1;
        }

        ranked.set(
          g.id,
          [...stats.entries()]
            .sort((a, b) => b[1].wins - a[1].wins || a[0].localeCompare(b[0]))
            .map(([id]) => id)
            .slice(0, Math.max(1, g.qualifying_teams || tournament.qualifiers_per_group || 1))
        );
      }

      const orderedGroups = [...((groups || []) as Group[])].sort(
        (a, b) => a.group_number - b.group_number
      );
      const qpg = Math.max(1, tournament.qualifiers_per_group || 1);
      const qualifiers: string[] = [];

      if (orderedGroups.length === 2) {
        for (let seed = 0; seed < qpg; seed++) {
          const first = ranked.get(orderedGroups[0].id)?.[seed];
          const second = ranked.get(orderedGroups[1].id)?.[qpg - 1 - seed];
          if (first) qualifiers.push(first);
          if (second) qualifiers.push(second);
        }
      } else {
        for (const g of orderedGroups) {
          qualifiers.push(...(ranked.get(g.id) || []));
        }
      }

      const firstKnockoutRound = roundRows.find(
        (r) => r.round_number > groupRound.round_number && r.round_type !== "GROUP"
      );
      if (firstKnockoutRound) {
        const knockoutMatches = matchRows
          .filter((m) => m.round_id === firstKnockoutRound.id)
          .sort((a, b) => a.match_number - b.match_number);

        for (let i = 0; i < knockoutMatches.length; i++) {
          const nextA = qualifiers[i * 2] || null;
          const nextB = qualifiers[i * 2 + 1] || null;
          if (!nextA && !nextB) continue;
          await supabase
            .from("tournament_matches")
            .update({ team_a_duo_id: nextA, team_b_duo_id: nextB })
            .eq("id", knockoutMatches[i].id);
        }
      }
    }
  }

  // Knockout -> knockout: the winner of match N advances to the matching
  // slot in the next round. This also makes later finals populate naturally.
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
}
