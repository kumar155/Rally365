"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import s from "../tournament.module.css";

type Tournament = { id: string; name: string; start_date: string | null };
type Round = { id: string; name: string | null; round_number: number | null; round_type: string | null };
type Duo = { id: string; name: string | null };
type Match = {
  id: string;
  round_id: string | null;
  match_number: number | null;
  court: number | null;
  scheduled_at: string | null;
  status: string | null;
  team_a_duo_id: string | null;
  team_b_duo_id: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  winner_duo_id: string | null;
  best_of: number | null;
};

export default function TournamentSchedulePage() {
  const params = useSearchParams();
  const tournamentId = params.get("id");
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [duos, setDuos] = useState<Duo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tournamentId) {
      setError("Tournament id is missing.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      const [t, r, m, d] = await Promise.all([
        supabase.from("tournaments").select("id,name,start_date").eq("id", tournamentId).single(),
        supabase.from("tournament_rounds").select("id,name,round_number,round_type").eq("tournament_id", tournamentId).order("round_number", { ascending: true }),
        supabase.from("tournament_matches").select("id,round_id,match_number,court,scheduled_at,status,team_a_duo_id,team_b_duo_id,team_a_score,team_b_score,winner_duo_id,best_of").eq("tournament_id", tournamentId).order("match_number", { ascending: true }),
        supabase.from("tournament_duos").select("id,name").eq("tournament_id", tournamentId),
      ]);

      if (cancelled) return;
      const firstError = t.error || r.error || m.error || d.error;
      if (firstError) setError(firstError.message);
      setTournament(t.data ?? null);
      setRounds(r.data ?? []);
      setMatches(m.data ?? []);
      setDuos(d.data ?? []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [tournamentId]);

  const duoName = useMemo(() => new Map(duos.map((d) => [d.id, d.name || "TBD"])), [duos]);
  const roundName = (round: Round) => round.name || `${round.round_type || "Round"}${round.round_number ? ` ${round.round_number}` : ""}`;
  const grouped = rounds.map((round) => ({ round, matches: matches.filter((m) => m.round_id === round.id) })).filter((x) => x.matches.length);
  const ungrouped = matches.filter((m) => !m.round_id);
  const formatTime = (value: string | null) => value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Time TBD";

  if (loading) return <main className={s.page}><p>Loading tournament schedule…</p></main>;

  return (
    <main className={s.page}>
      <div className={s.eyebrow}>RALLY365 · TOURNAMENTS</div>
      <div className={s.headerRow}>
        <div>
          <h1>Tournament schedule</h1>
          <p>{tournament?.name || "Tournament"}{tournament?.start_date ? ` · ${new Date(tournament.start_date).toLocaleDateString()}` : ""}</p>
        </div>
        <Link className={s.secondaryButton} href={`/tournaments/manage?id=${tournamentId}`}>← Tournament</Link>
      </div>

      {error && <div className={s.error}>{error}</div>}
      {!error && matches.length === 0 && <section className={s.card}><p>No matches have been generated yet. Create the draw first.</p></section>}

      {grouped.map(({ round, matches: roundMatches }) => (
        <section className={s.card} key={round.id}>
          <div className={s.sectionHeader}><div><div className={s.eyebrow}>ROUND {round.round_number ?? ""}</div><h2>{roundName(round)}</h2></div><span>{roundMatches.length} match{roundMatches.length === 1 ? "" : "es"}</span></div>
          <div className={s.list}>
            {roundMatches.map((match) => (
              <Link className={s.listRow} key={match.id} href={`/tournaments/match?id=${match.id}`}>
                <div><strong>Match {match.match_number ?? "—"}</strong><small>{match.scheduled_at ? formatTime(match.scheduled_at) : "Time TBD"}{match.court != null ? ` · Court ${match.court}` : ""}</small></div>
                <div><strong>{duoName.get(match.team_a_duo_id || "") || "TBD"}</strong><span> vs </span><strong>{duoName.get(match.team_b_duo_id || "") || "TBD"}</strong></div>
                <div className={s.status}>{match.status || "SCHEDULED"}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {ungrouped.length > 0 && <section className={s.card}><div className={s.sectionHeader}><h2>Matches</h2><span>{ungrouped.length}</span></div><div className={s.list}>{ungrouped.map((match) => <Link className={s.listRow} key={match.id} href={`/tournaments/match?id=${match.id}`}><div><strong>Match {match.match_number ?? "—"}</strong><small>{match.scheduled_at ? formatTime(match.scheduled_at) : "Time TBD"}</small></div><div><strong>{duoName.get(match.team_a_duo_id || "") || "TBD"}</strong> vs <strong>{duoName.get(match.team_b_duo_id || "") || "TBD"}</strong></div><div className={s.status}>{match.status || "SCHEDULED"}</div></Link>)}</div></section>}
    </main>
  );
}
