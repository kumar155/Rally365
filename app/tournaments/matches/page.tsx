"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import s from "./matches.module.css";

type Match = {
  id: string;
  match_number: number;
  scheduled_at: string | null;
  court: number | null;
  team_a_score: number | null;
  team_b_score: number | null;
  status: string;
  team_a_duo_id: string | null;
  team_b_duo_id: string | null;
  team_a: { name: string } | null;
  team_b: { name: string } | null;
};

type Winner = "A" | "B" | null;
type Filter = "ALL" | "PENDING" | "COMPLETED";

const isCompleted = (m: Match) => m.status?.toUpperCase() === "COMPLETED";
const hasRecordedScore = (m: Match) =>
  m.team_a_score !== null || m.team_b_score !== null || isCompleted(m);

function inferredWinner(m: Match): Winner {
  if (m.team_a_score == null || m.team_b_score == null) return null;
  if (m.team_a_score === m.team_b_score) return null;
  return m.team_a_score > m.team_b_score ? "A" : "B";
}

function resultFor(m: Match, side: "A" | "B"): "WIN" | "LOSE" | null {
  const winner = inferredWinner(m);
  if (!winner) return null;
  return winner === side ? "WIN" : "LOSE";
}

function ResultButton({
  label,
  selected,
  lose,
  onClick,
}: {
  label: "WIN" | "LOSE";
  selected: boolean;
  lose?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${s.resultButton} ${selected ? (lose ? s.resultLoseSelected : s.resultWinSelected) : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function MatchCard({
  match,
  busy,
  onSave,
}: {
  match: Match;
  busy: boolean;
  onSave: (match: Match, a: number, b: number, winner: Winner) => void;
}) {
  const [a, setA] = useState(String(match.team_a_score ?? 0));
  const [b, setB] = useState(String(match.team_b_score ?? 0));
  const [winner, setWinner] = useState<Winner>(inferredWinner(match));
  const recorded = hasRecordedScore(match);

  useEffect(() => {
    setA(String(match.team_a_score ?? 0));
    setB(String(match.team_b_score ?? 0));
    setWinner(inferredWinner(match));
  }, [match.team_a_score, match.team_b_score, match.status]);

  const setResult = (side: "A" | "B") => setWinner(side);
  const teamAResult = winner === "A" ? "WIN" : winner === "B" ? "LOSE" : resultFor(match, "A");
  const teamBResult = winner === "B" ? "WIN" : winner === "A" ? "LOSE" : resultFor(match, "B");

  return (
    <article className={s.matchCard}>
      <div className={s.matchHeader}>
        <span className={s.matchStatus}>{isCompleted(match) ? "COMPLETED" : (match.status || "SCHEDULED")}</span>
        <span className={s.matchMeta}>
          Match {match.match_number} · {match.court ? `Court ${match.court}` : "Court TBD"}
        </span>
      </div>

      <div className={s.teamRow}>
        <div className={s.teamIdentity}>
          <span className={s.avatar}>A</span>
          <span className={s.teamName}>{match.team_a?.name || "TBD"}</span>
        </div>
        <input
          className={s.scoreInput}
          aria-label={`Match ${match.match_number} team A score`}
          type="number"
          min="0"
          value={a}
          onChange={(e) => setA(e.target.value)}
        />
        {recorded && (
          <div className={s.resultGroup}>
            <ResultButton label="WIN" selected={teamAResult === "WIN"} onClick={() => setResult("A")} />
            <ResultButton label="LOSE" lose selected={teamAResult === "LOSE"} onClick={() => setResult("B")} />
          </div>
        )}
      </div>

      <div className={`${s.teamRow} ${s.teamRowAlt}`}>
        <div className={s.teamIdentity}>
          <span className={s.avatar}>B</span>
          <span className={s.teamName}>{match.team_b?.name || "TBD"}</span>
        </div>
        <input
          className={s.scoreInput}
          aria-label={`Match ${match.match_number} team B score`}
          type="number"
          min="0"
          value={b}
          onChange={(e) => setB(e.target.value)}
        />
        {recorded && (
          <div className={s.resultGroup}>
            <ResultButton label="WIN" selected={teamBResult === "WIN"} onClick={() => setResult("B")} />
            <ResultButton label="LOSE" lose selected={teamBResult === "LOSE"} onClick={() => setResult("A")} />
          </div>
        )}
      </div>

      <div className={s.actions}>
        <Link href={`/tournaments/match?id=${match.id}`} className={s.openButton}>
          Open
        </Link>
        <button
          type="button"
          className={s.saveButton}
          disabled={busy || !match.team_a_duo_id || !match.team_b_duo_id || !winner}
          onClick={() => onSave(match, Number(a) || 0, Number(b) || 0, winner)}
        >
          {busy ? "Saving…" : "Save score"}
        </button>
      </div>
    </article>
  );
}

export default function Matches() {
  const [id, setId] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id") || "");
  }, []);

  async function load() {
    if (!id) return;
    const { data, error: loadError } = await supabase
      .from("tournament_matches")
      .select(
        "id,match_number,scheduled_at,court,team_a_score,team_b_score,status,team_a_duo_id,team_b_duo_id,team_a:tournament_duos!tournament_matches_team_a_duo_id_fkey(name),team_b:tournament_duos!tournament_matches_team_b_duo_id_fkey(name)"
      )
      .eq("tournament_id", id)
      .order("match_number");

    if (loadError) setError(loadError.message);
    setMatches((data || []) as unknown as Match[]);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function save(match: Match, a: number, b: number, winner: Winner) {
    if (!winner) return;
    setBusy(match.id);
    setError("");

    const winnerId = winner === "A" ? match.team_a_duo_id : match.team_b_duo_id;
    const { error: saveError } = await supabase
      .from("tournament_matches")
      .update({
        team_a_score: a,
        team_b_score: b,
        status: "COMPLETED",
        winner_duo_id: winnerId,
      })
      .eq("id", match.id);

    if (saveError) setError(saveError.message);
    else await load();
    setBusy(null);
  }

  const completed = useMemo(() => matches.filter(isCompleted).length, [matches]);
  const pending = matches.length - completed;
  const visibleMatches = useMemo(() => {
    if (filter === "COMPLETED") return matches.filter(isCompleted);
    if (filter === "PENDING") return matches.filter((m) => !isCompleted(m));
    return matches;
  }, [filter, matches]);

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

        <section className={s.content}>
          <div className={s.eyebrow}>MATCHES</div>
          <h1 className={s.heading}>Match schedule</h1>
          <p className={s.summary}>{matches.length} matches · {completed} completed</p>

          {matches.length > 0 && (
            <div className={s.filterBar} aria-label="Match filters">
              <div className={s.filters}>
                <button type="button" className={`${s.filter} ${filter === "ALL" ? s.filterActive : ""}`} onClick={() => setFilter("ALL")}>
                  All <span className={s.filterCount}>{matches.length}</span>
                </button>
                <button type="button" className={`${s.filter} ${filter === "PENDING" ? s.filterActive : ""}`} onClick={() => setFilter("PENDING")}>
                  Pending <span className={s.filterCount}>{pending}</span>
                </button>
                <button type="button" className={`${s.filter} ${filter === "COMPLETED" ? s.filterActive : ""}`} onClick={() => setFilter("COMPLETED")}>
                  Completed <span className={s.filterCount}>{completed}</span>
                </button>
              </div>
            </div>
          )}

          {error && <div className={s.error}>{error}</div>}

          {!matches.length ? (
            <div className={s.empty}>No matches yet. Generate the draw first.</div>
          ) : (
            <div className={s.matchList}>
              {visibleMatches.map((match) => (
                <MatchCard key={match.id} match={match} busy={busy === match.id} onSave={save} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
