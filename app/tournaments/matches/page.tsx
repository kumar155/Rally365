"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import s from "../tournament.module.css";

type Match = {
  id: string;
  match_number: number;
  scheduled_at: string | null;
  court: number | null;
  team_a_score: number | null;
  team_b_score: number | null;
  status: string;
  team_a: { name: string } | null;
  team_b: { name: string } | null;
};

const isCompleted = (m: Match) => m.status?.toUpperCase() === "COMPLETED";

function score(value: number | null) {
  return value == null ? 0 : value;
}

function scheduleLabel(match: Match) {
  if (!match.scheduled_at) return "Schedule TBD";
  const date = new Date(match.scheduled_at);
  if (Number.isNaN(date.getTime())) return "Schedule TBD";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MatchTile({ match }: { match: Match }) {
  const completed = isCompleted(match);

  return (
    <Link className={s.matchTile} href={`/tournaments/match?id=${encodeURIComponent(match.id)}`}>
      <div className={s.matchTileTop}>
        <span>Match {match.match_number}</span>
        <span>{match.court ? `Court ${match.court}` : scheduleLabel(match)}</span>
      </div>

      <div className={s.teamLine}>
        <span className={s.teamName}>{match.team_a?.name || "TBD"}</span>
        <span className={s.teamScore}>{score(match.team_a_score)}</span>
      </div>

      <div className={s.teamLine}>
        <span className={s.teamName}>{match.team_b?.name || "TBD"}</span>
        <span className={s.teamScore}>{score(match.team_b_score)}</span>
      </div>

      <div className={s.matchTileBottom}>
        <span className={`${s.matchStatusIcon} ${completed ? s.completed : s.scheduled}`}>
          {completed ? "✓" : "•"}
        </span>
        <span>{completed ? "Completed" : "Scheduled"}</span>
        <span className={s.chevron}>›</span>
      </div>
    </Link>
  );
}

export default function Matches() {
  const [id, setId] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id") || "");
  }, []);

  async function load() {
    if (!id) return;
    setError("");
    const { data, error: loadError } = await supabase
      .from("tournament_matches")
      .select(
        "id,match_number,scheduled_at,court,team_a_score,team_b_score,status,team_a:tournament_duos!tournament_matches_team_a_duo_id_fkey(name),team_b:tournament_duos!tournament_matches_team_b_duo_id_fkey(name)"
      )
      .eq("tournament_id", id)
      .order("match_number");

    if (loadError) setError(loadError.message);
    setMatches((data || []) as unknown as Match[]);
  }

  useEffect(() => {
    load();
  }, [id]);

  const completed = useMemo(() => matches.filter(isCompleted).length, [matches]);

  if (!id) {
    return <main className={s.page}><div className={s.empty}>Tournament ID is missing.</div></main>;
  }

  return (
    <main className={s.page}>
      <div className={s.shell}>
        <nav className={s.tabs} aria-label="Tournament navigation">
          <Link className={s.tab} href={`/tournaments/manage?id=${encodeURIComponent(id)}`}>Overview</Link>
          <Link className={`${s.tab} ${s.tabActive}`} href={`/tournaments/matches?id=${encodeURIComponent(id)}`}>
            Matches <span className={s.tabCount}>{matches.length}</span>
          </Link>
          <Link className={s.tab} href={`/tournaments/standings?id=${encodeURIComponent(id)}`}>Standings</Link>
          <Link className={s.tab} href={`/tournaments/players?id=${encodeURIComponent(id)}`}>Players</Link>
          <Link className={s.tab} href={`/tournaments/draw?id=${encodeURIComponent(id)}`}>Draw</Link>
        </nav>

        <section style={{ paddingTop: 16 }}>
          <div className={s.eyebrow}>MATCHES</div>
          <h1 className={s.title}>Match schedule</h1>
          <p className={s.sub}>{matches.length} matches · {completed} completed</p>

          {error && <div className={s.error}>{error}</div>}

          {!matches.length ? (
            <div className={s.empty}>No matches yet. Generate the draw first.</div>
          ) : (
            <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
              {matches.map((match) => <MatchTile key={match.id} match={match} />)}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
