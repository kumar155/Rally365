"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { syncTournamentProgression } from "../../../lib/tournamentProgression";
import s from "../tournament.module.css";
import sb from "./schedule.module.css";

type Tournament = { id: string; name: string; start_date: string | null; format: string };
type Round = { id: string; name: string | null; round_number: number | null; round_type: string | null };
type Group = { id: string; name: string; group_number: number };
type Duo = { id: string; name: string | null };
type Match = {
  id: string;
  round_id: string | null;
  group_id: string | null;
  match_number: number | null;
  court: number | null;
  scheduled_at: string | null;
  status: string | null;
  team_a_duo_id: string | null;
  team_b_duo_id: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  winner_duo_id: string | null;
};
type Result = "WIN" | "LOSE" | null;

const dateLabel = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    : "Date TBD";

const timeLabel = (value: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
    : "Time TBD";

const isCompleted = (m: Match) => (m.status || "").toUpperCase() === "COMPLETED";

function resultFor(m: Match, side: "A" | "B"): Result {
  if (m.winner_duo_id) {
    return side === "A"
      ? m.winner_duo_id === m.team_a_duo_id ? "WIN" : "LOSE"
      : m.winner_duo_id === m.team_b_duo_id ? "WIN" : "LOSE";
  }
  if (!isCompleted(m)) return null;
  const a = Number(m.team_a_score ?? 0);
  const b = Number(m.team_b_score ?? 0);
  if (a === b) return null;
  return side === "A" ? (a > b ? "WIN" : "LOSE") : (b > a ? "WIN" : "LOSE");
}

function ResultButton({ result, value, selected, onClick, disabled }: {
  result: Result;
  value: "WIN" | "LOSE";
  selected: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  if (result === null && disabled) return null;
  return (
    <button
      type="button"
      className={`${sb.resultButton} ${selected ? (value === "WIN" ? sb.resultButtonWin : sb.resultButtonLose) : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {value}
    </button>
  );
}

function MatchRow({
  match,
  duoName,
  onOpen,
}: {
  match: Match;
  duoName: Map<string, string>;
  onOpen: (m: Match) => void;
}) {
  const a = duoName.get(match.team_a_duo_id || "") || "TBD";
  const b = duoName.get(match.team_b_duo_id || "") || "TBD";
  const completed = isCompleted(match);
  const resultA = resultFor(match, "A");
  const resultB = resultFor(match, "B");

  return (
    <button type="button" className={sb.matchRow} onClick={() => onOpen(match)} aria-label={`Open match ${match.match_number ?? ""}`}>
      <div className={sb.matchMeta}>
        <strong>{match.match_number ?? "—"}</strong>
        <span>{dateLabel(match.scheduled_at)}</span>
        <span>{timeLabel(match.scheduled_at)}</span>
      </div>
      <div className={sb.courtCell}>{match.court ? `Court ${match.court}` : "TBD"}</div>
      <div className={sb.teamsCell}>
        <div><span className={sb.teamAvatar}>A</span><span>{a}</span></div>
        <div><span className={sb.teamAvatar}>B</span><span>{b}</span></div>
      </div>
      <div className={sb.scoreCell}>
        <div><span className={sb.listScore}>{completed ? Number(match.team_a_score ?? 0) : 0}</span>{completed && <span className={`${sb.listResult} ${resultA === "WIN" ? sb.listResultWin : sb.listResultLose}`}>{resultA}</span>}</div>
        <div><span className={sb.listScore}>{completed ? Number(match.team_b_score ?? 0) : 0}</span>{completed && <span className={`${sb.listResult} ${resultB === "WIN" ? sb.listResultWin : sb.listResultLose}`}>{resultB}</span>}</div>
      </div>
      <span className={sb.rowChevron}>›</span>
    </button>
  );
}

function ScoreSheet({
  match,
  duoName,
  locked,
  busy,
  onClose,
  onSave,
}: {
  match: Match;
  duoName: Map<string, string>;
  locked: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (a: number, b: number, winner: "A" | "B") => void;
}) {
  const [a, setA] = useState(String(match.team_a_score ?? 0));
  const [b, setB] = useState(String(match.team_b_score ?? 0));
  const initialWinner = resultFor(match, "A") === "WIN" ? "A" : resultFor(match, "B") === "WIN" ? "B" : "";
  const [winner, setWinner] = useState<"A" | "B" | "">(initialWinner);
  const nameA = duoName.get(match.team_a_duo_id || "") || "TBD";
  const nameB = duoName.get(match.team_b_duo_id || "") || "TBD";

  const choose = (side: "A" | "B") => {
    if (locked) return;
    setWinner(side);
  };

  const canSave = !locked && !busy && Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && !!winner;

  return (
    <div className={sb.sheetBackdrop} onMouseDown={onClose}>
      <section className={sb.scoreSheet} role="dialog" aria-modal="true" aria-label={`Match ${match.match_number} score`} onMouseDown={e => e.stopPropagation()}>
        <div className={sb.sheetHandle} />
        <div className={sb.sheetHeader}>
          <h2>Match {match.match_number ?? "—"} · {match.court ? `Court ${match.court}` : "Court TBD"}</h2>
          <span className={sb.completedPill}>{isCompleted(match) ? "COMPLETED" : "SCHEDULED"}</span>
        </div>
        <div className={sb.sheetTeamRow}>
          <span className={sb.sheetTeamIdentity}><span className={sb.sheetAvatar}>A</span><span>{nameA}</span></span>
          <input className={sb.sheetScore} value={a} inputMode="numeric" type="number" min="0" disabled={locked} onChange={e => setA(e.target.value)} aria-label="Team A score" />
          <div className={sb.sheetResults}>
            <ResultButton result={winner === "A" ? "WIN" : winner === "B" ? "LOSE" : null} value="WIN" selected={winner === "A"} onClick={() => choose("A")} disabled={locked} />
            <ResultButton result={winner === "B" ? "WIN" : winner === "A" ? "LOSE" : null} value="LOSE" selected={winner === "B"} onClick={() => choose("B")} disabled={locked} />
          </div>
        </div>
        <div className={sb.sheetTeamRowAlt}>
          <span className={sb.sheetTeamIdentity}><span className={sb.sheetAvatar}>B</span><span>{nameB}</span></span>
          <input className={sb.sheetScore} value={b} inputMode="numeric" type="number" min="0" disabled={locked} onChange={e => setB(e.target.value)} aria-label="Team B score" />
          <div className={sb.sheetResults}>
            <ResultButton result={winner === "B" ? "WIN" : winner === "A" ? "LOSE" : null} value="WIN" selected={winner === "B"} onClick={() => choose("B")} disabled={locked} />
            <ResultButton result={winner === "A" ? "WIN" : winner === "B" ? "LOSE" : null} value="LOSE" selected={winner === "A"} onClick={() => choose("A")} disabled={locked} />
          </div>
        </div>
        <div className={sb.sheetActions}>
          <button type="button" className={sb.cancelButton} onClick={onClose}>Cancel</button>
          <button type="button" className={sb.saveButton} disabled={!canSave} onClick={() => onSave(Number(a), Number(b), winner as "A" | "B")}>{busy ? "Saving…" : "Save Score"}</button>
        </div>
      </section>
    </div>
  );
}

function ScheduleContent() {
  const params = useSearchParams();
  const tournamentId = params.get("id") || "";
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [duos, setDuos] = useState<Duo[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "COMPLETED">("ALL");
  const [openMatch, setOpenMatch] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);

  const load = async () => {
    if (!tournamentId) return;
    setLoading(true);
    setError("");
    try { await syncTournamentProgression(tournamentId); } catch (e: any) { setError(e?.message || "Could not sync tournament progression"); }
    const [t, r, m, d, g] = await Promise.all([
      supabase.from("tournaments").select("id,name,start_date,format,is_locked").eq("id", tournamentId).single(),
      supabase.from("tournament_rounds").select("id,name,round_number,round_type").eq("tournament_id", tournamentId).order("round_number"),
      supabase.from("tournament_matches").select("id,round_id,group_id,match_number,court,scheduled_at,status,team_a_duo_id,team_b_duo_id,team_a_score,team_b_score,winner_duo_id").eq("tournament_id", tournamentId).order("match_number"),
      supabase.from("tournament_duos").select("id,name").eq("tournament_id", tournamentId),
      supabase.from("tournament_groups").select("id,name,group_number").eq("tournament_id", tournamentId).order("group_number"),
    ]);
    const firstError = t.error || r.error || m.error || d.error || g.error;
    if (firstError) setError(firstError.message);
    setTournament(t.data as Tournament | null);
    setRounds(r.data || []);
    setMatches(m.data || []);
    setDuos(d.data || []);
    setGroups(g.data || []);
    setLocked(!!t.data?.is_locked);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tournamentId]);

  const duoName = useMemo(() => new Map(duos.map(d => [d.id, d.name || "TBD"])), [duos]);
  const completedCount = matches.filter(isCompleted).length;
  const pendingCount = matches.length - completedCount;
  const visibleMatches = matches.filter(m => filter === "ALL" || (filter === "COMPLETED" ? isCompleted(m) : !isCompleted(m)));
  const path = (p: string) => `/tournaments/${p}?id=${encodeURIComponent(tournamentId)}`;

  async function saveMatchScore(match: Match, teamAScore: number, teamBScore: number, winner: "A" | "B") {
    if (locked) return;
    setBusy(true);
    setError("");
    const winnerId = winner === "A" ? match.team_a_duo_id : match.team_b_duo_id;
    const { error: saveError } = await supabase.from("tournament_matches").update({
      team_a_score: teamAScore,
      team_b_score: teamBScore,
      status: "COMPLETED",
      winner_duo_id: winnerId,
    }).eq("id", match.id);
    if (saveError) {
      setError(saveError.message);
    } else {
      setOpenMatch(null);
      try { await syncTournamentProgression(tournamentId); } catch (e: any) { setError(e?.message || "Score saved, but progression could not be updated."); }
      await load();
    }
    setBusy(false);
  }

  if (!tournamentId) return <main className={s.page}><div className={s.shell}><div className={s.card}>Tournament id is missing.</div></div></main>;
  if (loading) return <main className={s.page}><div className={s.shell}><div className={s.card}>Loading schedule…</div></div></main>;

  const groupRounds = rounds.filter(r => r.round_type === "GROUP" || r.name === "Group Stage");
  const knockoutRounds = rounds.filter(r => r.round_type !== "GROUP");
  const orderedMatches = [...visibleMatches].sort((a, b) => (a.match_number || 0) - (b.match_number || 0));

  return (
    <main className={sb.page}>
      <div className={sb.shell}>
        <nav className={sb.topNav} aria-label="Tournament navigation">
          <Link className={sb.navHome} href={path("manage")} aria-label="Overview">⌂</Link>
          <Link className={sb.navItem} href={path("manage")}>Overview</Link>
          <Link className={`${sb.navItem} ${sb.navActive}`} href={path("schedule")}>Matches <span>{matches.length}</span></Link>
          <Link className={sb.navItem} href={path("standings")}>Standings</Link>
          <Link className={sb.navItem} href={path("players")}>Players</Link>
          <Link className={sb.navItem} href={path("draw")}>Draw</Link>
        </nav>

        <header className={sb.pageHeader}>
          <div>
            <div className={sb.eyebrow}>MATCHES</div>
            <h1>Match schedule</h1>
            <p>{matches.length} matches · {completedCount} completed</p>
          </div>
          <div className={sb.filters} role="tablist" aria-label="Match status">
            <button className={filter === "ALL" ? sb.filterActive : sb.filterButton} onClick={() => setFilter("ALL")}>All <b>{matches.length}</b></button>
            <button className={filter === "PENDING" ? sb.filterActive : sb.filterButton} onClick={() => setFilter("PENDING")}>Pending <b>{pendingCount}</b></button>
            <button className={filter === "COMPLETED" ? sb.filterActive : sb.filterButton} onClick={() => setFilter("COMPLETED")}>Completed <b>{completedCount}</b></button>
          </div>
        </header>

        {error && <div className={s.error}>{error}</div>}

        {orderedMatches.length > 0 ? (
          <section className={sb.scheduleTable} aria-label="Match schedule">
            <div className={sb.scheduleTableHead}><span>#</span><span>Court</span><span>Teams</span><span>Score &amp; Result</span><span /></div>
            {orderedMatches.map(match => <MatchRow key={match.id} match={match} duoName={duoName} onOpen={setOpenMatch} />)}
          </section>
        ) : (
          <section className={sb.emptyState}><h2>No matches {filter === "PENDING" ? "pending" : filter === "COMPLETED" ? "completed" : "available"}.</h2><p>{filter === "ALL" ? "Generate the draw first." : "Try another filter."}</p></section>
        )}

        {(groupRounds.length || knockoutRounds.length) > 0 && (
          <div className={sb.roundSummary} aria-label="Rounds">
            {groupRounds.map(r => <span key={r.id}>{r.name || `Round ${r.round_number}`}</span>)}
            {knockoutRounds.map(r => <span key={r.id}>{r.name || `Round ${r.round_number}`}</span>)}
          </div>
        )}
      </div>

      {openMatch && <ScoreSheet match={openMatch} duoName={duoName} locked={locked} busy={busy} onClose={() => setOpenMatch(null)} onSave={(a, b, winner) => saveMatchScore(openMatch, a, b, winner)} />}
    </main>
  );
}

export default function TournamentSchedulePage() {
  return <Suspense fallback={<main className={sb.page}><div className={sb.shell}><div className={s.card}>Loading schedule…</div></div></main>}><ScheduleContent /></Suspense>;
}
