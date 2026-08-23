"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  ChevronRight,
  CircleUserRound,
  History,
  Plus,
  Trophy,
  Users,
  X
} from "lucide-react";

type Player = { id: string; name: string };
type Match = {
  id: number;
  teamA: string[];
  teamB: string[];
  scoreA: number;
  scoreB: number;
};

const initialPlayers: Player[] = [
  { id: "A", name: "A" },
  { id: "B", name: "B" },
  { id: "C", name: "C" },
  { id: "D", name: "D" },
  { id: "E", name: "E" },
  { id: "F", name: "F" }
];

const initialMatches: Match[] = [
  { id: 1, teamA: ["A", "C"], teamB: ["B", "D"], scoreA: 21, scoreB: 18 },
  { id: 2, teamA: ["A", "B"], teamB: ["D", "E"], scoreA: 15, scoreB: 21 },
  { id: 3, teamA: ["B", "C"], teamB: ["D", "E"], scoreA: 21, scoreB: 17 },
  { id: 4, teamA: ["A", "F"], teamB: ["B", "C"], scoreA: 21, scoreB: 19 }
];

export default function Home() {
  const [tab, setTab] = useState<"today" | "stats" | "players">("today");
  const [players] = useState(initialPlayers);
  const [matches, setMatches] = useState(initialMatches);
  const [showNewMatch, setShowNewMatch] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");

  const stats = useMemo(() => {
    return players.map((p) => {
      const played = matches.filter(m => [...m.teamA, ...m.teamB].includes(p.id));
      let wins = 0;
      let pointsFor = 0;
      let pointsAgainst = 0;

      played.forEach(m => {
        const inA = m.teamA.includes(p.id);
        const own = inA ? m.scoreA : m.scoreB;
        const opp = inA ? m.scoreB : m.scoreA;
        pointsFor += own;
        pointsAgainst += opp;
        if (own > opp) wins++;
      });

      return {
        ...p,
        played: played.length,
        wins,
        losses: played.length - wins,
        winRate: played.length ? Math.round((wins / played.length) * 100) : 0,
        points: wins,
        diff: pointsFor - pointsAgainst
      };
    }).sort((a, b) => b.points - a.points || b.winRate - a.winRate);
  }, [players, matches]);

  const togglePlayer = (id: string) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const saveMatch = () => {
    const a = selected.slice(0, 2);
    const b = selected.slice(2, 4);
    const sa = Number(scoreA);
    const sb = Number(scoreB);
    if (a.length !== 2 || b.length !== 2 || !Number.isFinite(sa) || !Number.isFinite(sb) || sa === sb) return;

    setMatches(prev => [
      ...prev,
      { id: prev.length + 1, teamA: a, teamB: b, scoreA: sa, scoreB: sb }
    ]);
    setSelected([]);
    setScoreA("");
    setScoreB("");
    setShowNewMatch(false);
  };

  const label = (ids: string[]) => ids.join("");

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">Rally<span>365</span></div>
          <div className="subtitle">Everyday badminton</div>
        </div>
        <div className="group-pill"><Users size={15}/> Rally365 Court</div>
      </header>

      <section className="content">
        {tab === "today" && (
          <>
            <div className="hero-card">
              <div>
                <div className="eyebrow">SUNDAY · AUG 23</div>
                <h1>Today&apos;s games</h1>
                <p>{players.length} players · {matches.length} matches recorded</p>
              </div>
              <Trophy size={42} strokeWidth={1.5}/>
            </div>

            <button className="primary-button" onClick={() => setShowNewMatch(true)}>
              <Plus size={21}/> New match
            </button>

            <div className="section-title">
              <span>Match history</span><span>{matches.length}</span>
            </div>

            <div className="match-list">
              {matches.slice().reverse().map(m => (
                <div className="match-card" key={m.id}>
                  <div className="match-number">M{m.id}</div>
                  <div className="teams">
                    <div><strong>{label(m.teamA)}</strong> <span className={m.scoreA > m.scoreB ? "win" : ""}>{m.scoreA}</span></div>
                    <div><strong>{label(m.teamB)}</strong> <span className={m.scoreB > m.scoreA ? "win" : ""}>{m.scoreB}</span></div>
                  </div>
                  <ChevronRight size={18} className="muted"/>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "stats" && (
          <>
            <div className="page-heading">
              <div className="eyebrow">TODAY</div>
              <h1>Leaderboard</h1>
              <p>Player performance from all recorded matches.</p>
            </div>
            <div className="stats-table">
              <div className="table-head"><span>#</span><span>PLAYER</span><span>P</span><span>W</span><span>L</span><span>WIN%</span></div>
              {stats.map((s, i) => (
                <div className="table-row" key={s.id}>
                  <span className="rank">{i + 1}</span>
                  <span className="player-name"><b>{s.name}</b></span>
                  <span>{s.played}</span><span>{s.wins}</span><span>{s.losses}</span><span>{s.winRate}%</span>
                </div>
              ))}
            </div>
            <div className="insight-card">
              <BarChart3 size={22}/>
              <div><b>Top performer</b><p>{stats[0]?.name} leads today with {stats[0]?.points} win points.</p></div>
            </div>
          </>
        )}

        {tab === "players" && (
          <>
            <div className="page-heading">
              <div className="eyebrow">GROUP</div>
              <h1>Players</h1>
              <p>Rally365 Court · 6 regular players</p>
            </div>
            <div className="player-grid">
              {players.map(p => {
                const s = stats.find(x => x.id === p.id)!;
                return <div className="player-card" key={p.id}>
                  <div className="avatar">{p.name}</div>
                  <div><b>Player {p.name}</b><small>{s.wins}W · {s.losses}L · {s.winRate}%</small></div>
                  <CircleUserRound size={19} className="muted"/>
                </div>;
              })}
            </div>
          </>
        )}
      </section>

      <nav className="bottom-nav">
        <button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}><History/><span>Today</span></button>
        <button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")}><BarChart3/><span>Stats</span></button>
        <button className={tab === "players" ? "active" : ""} onClick={() => setTab("players")}><Users/><span>Players</span></button>
      </nav>

      {showNewMatch && (
        <div className="modal-backdrop" onClick={() => setShowNewMatch(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div><div className="eyebrow">NEW MATCH</div><h2>Choose 4 players</h2></div>
              <button className="icon-button" onClick={() => setShowNewMatch(false)}><X/></button>
            </div>
            <p className="helper">First two selected = Team A. Next two = Team B.</p>
            <div className="selection-grid">
              {players.map(p => (
                <button key={p.id} onClick={() => togglePlayer(p.id)} className={`player-chip ${selected.includes(p.id) ? "selected" : ""}`}>
                  <span>{p.name}</span>{selected.includes(p.id) && <small>{selected.indexOf(p.id) + 1}</small>}
                </button>
              ))}
            </div>
            <div className="match-preview">
              <b>{label(selected.slice(0,2)) || "—"}</b>
              <span>vs</span>
              <b>{label(selected.slice(2,4)) || "—"}</b>
            </div>
            <div className="score-inputs">
              <input inputMode="numeric" placeholder="Team A" value={scoreA} onChange={e => setScoreA(e.target.value)}/>
              <span>:</span>
              <input inputMode="numeric" placeholder="Team B" value={scoreB} onChange={e => setScoreB(e.target.value)}/>
            </div>
            <button className="primary-button" disabled={selected.length !== 4 || !scoreA || !scoreB || scoreA === scoreB} onClick={saveMatch}>Save match</button>
          </div>
        </div>
      )}
    </main>
  );
}