"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, CalendarDays, ChevronRight, MapPin, Share2, Trophy, Users } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import "../player-profile.css";

type Player = { id: string; name: string };
type MatchPlayer = { player_id: string; team: "A" | "B" };
type Match = {
  id: string;
  team_a_score: number;
  team_b_score: number;
  played_at: string;
  status: string;
  match_players: MatchPlayer[];
};

type Partner = { id: string; name: string; matches: number; wins: number; winRate: number };
type PeriodRow = { label: string; matches: number; wins: number; winRate: number };

const isValid = (m: Match) => m.status !== "VOIDED";
const avatarPath = (name: string) => `/avatars/${encodeURIComponent(name)}.png`;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date TBD" : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function monthLabel(key: string) {
  const date = new Date(`${key}-01T12:00:00`);
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export default function PlayerProfileClient() {
  const params = useParams<{ id: string }>();
  const playerId = decodeURIComponent(params?.id || "");
  const [player, setPlayer] = useState<Player | null>(null);
  const [groupName, setGroupName] = useState("Rally365 Club");
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const { data: group, error: groupError } = await supabase
        .from("groups")
        .select("id,name")
        .eq("join_code", "RALLY365")
        .single();
      if (groupError || !group) {
        if (!cancelled) { setError(groupError?.message || "Group not found"); setLoading(false); }
        return;
      }

      const [playerResult, playerListResult, matchResult] = await Promise.all([
        supabase.from("players").select("id,name").eq("group_id", group.id).eq("id", playerId).single(),
        supabase.from("players").select("id,name").eq("group_id", group.id).order("name"),
        supabase
          .from("matches")
          .select("id,team_a_score,team_b_score,played_at,status,match_players(player_id,team)")
          .eq("group_id", group.id)
          .order("played_at", { ascending: false }),
      ]);

      if (cancelled) return;
      if (playerResult.error || !playerResult.data) {
        setError(playerResult.error?.message || "Player not found");
        setLoading(false);
        return;
      }
      if (matchResult.error) setError(matchResult.error.message);
      setPlayer(playerResult.data as Player);
      setPlayers((playerListResult.data || []) as Player[]);
      setGroupName(group.name || "Rally365 Club");
      setMatches((matchResult.data || []) as Match[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [playerId]);

  const nameMap = useMemo(() => new Map(players.map(p => [p.id, p.name])), [players]);
  const playerMatches = useMemo(() => matches.filter(isValid).filter(m => m.match_players.some(x => x.player_id === playerId)), [matches, playerId]);

  const stats = useMemo(() => {
    let wins = 0;
    let gamesWon = 0;
    let gamesLost = 0;
    let currentStreak = 0;
    let bestStreak = 0;
    let running = 0;

    for (const match of playerMatches) {
      const side = match.match_players.find(x => x.player_id === playerId)?.team;
      if (!side) continue;
      const own = Number(side === "A" ? match.team_a_score : match.team_b_score);
      const opp = Number(side === "A" ? match.team_b_score : match.team_a_score);
      gamesWon += own;
      gamesLost += opp;
      if (own > opp) { wins++; running++; bestStreak = Math.max(bestStreak, running); }
      else running = 0;
    }

    currentStreak = 0;
    for (const match of playerMatches) {
      const side = match.match_players.find(x => x.player_id === playerId)?.team;
      if (!side) continue;
      const own = side === "A" ? match.team_a_score : match.team_b_score;
      const opp = side === "A" ? match.team_b_score : match.team_a_score;
      if (own > opp) currentStreak++; else break;
    }

    const played = playerMatches.length;
    return {
      played,
      wins,
      losses: played - wins,
      winRate: played ? Math.round((wins / played) * 100) : 0,
      gamesWon,
      gamesLost,
      avgPoints: played ? (gamesWon / played).toFixed(1) : "0.0",
      currentStreak,
      bestStreak,
      pointDiff: gamesWon - gamesLost,
    };
  }, [playerMatches, playerId]);

  const recent = useMemo(() => playerMatches.slice(0, 10).map(m => {
    const side = m.match_players.find(x => x.player_id === playerId)?.team;
    if (!side) return "L";
    return (side === "A" ? m.team_a_score > m.team_b_score : m.team_b_score > m.team_a_score) ? "W" : "L";
  }), [playerMatches, playerId]);

  const partnerRows = useMemo<Partner[]>(() => {
    const map = new Map<string, { matches: number; wins: number }>();
    for (const match of playerMatches) {
      const me = match.match_players.find(x => x.player_id === playerId);
      if (!me) continue;
      const own = me.team === "A" ? match.team_a_score : match.team_b_score;
      const opp = me.team === "A" ? match.team_b_score : match.team_a_score;
      match.match_players.filter(x => x.team === me.team && x.player_id !== playerId).forEach(partner => {
        const current = map.get(partner.player_id) || { matches: 0, wins: 0 };
        current.matches++;
        if (own > opp) current.wins++;
        map.set(partner.player_id, current);
      });
    }
    return [...map.entries()].map(([id, value]) => ({
      id,
      name: nameMap.get(id) || "Unknown",
      ...value,
      winRate: value.matches ? Math.round(value.wins / value.matches * 100) : 0,
    })).sort((a, b) => b.winRate - a.winRate || b.matches - a.matches).slice(0, 5);
  }, [playerMatches, playerId, nameMap]);

  const periods = useMemo<PeriodRow[]>(() => {
    const map = new Map<string, { matches: number; wins: number }>();
    for (const match of playerMatches) {
      const key = new Date(match.played_at).toISOString().slice(0, 7);
      const side = match.match_players.find(x => x.player_id === playerId)?.team;
      if (!side) continue;
      const item = map.get(key) || { matches: 0, wins: 0 };
      item.matches++;
      if (side === "A" ? match.team_a_score > match.team_b_score : match.team_b_score > match.team_a_score) item.wins++;
      map.set(key, item);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 5).map(([key, v]) => ({ label: monthLabel(key), ...v, winRate: Math.round(v.wins / v.matches * 100) }));
  }, [playerMatches, playerId]);

  const playing = useMemo(() => {
    let doubles = 0;
    let singles = 0;
    playerMatches.forEach(m => (m.match_players.length > 2 ? doubles++ : singles++));
    const total = singles + doubles;
    return { singles, doubles, total, doublesRate: total ? Math.round(doubles / total * 100) : 0 };
  }, [playerMatches]);

  const profileBars = useMemo(() => {
    const winEfficiency = stats.winRate;
    const pointControl = Math.max(0, Math.min(100, 50 + stats.pointDiff / Math.max(1, stats.played * 2) * 50));
    const consistency = Math.max(0, Math.min(100, 100 - Math.abs(50 - stats.winRate) * 1.2));
    const scoring = Math.max(0, Math.min(100, stats.played ? (stats.gamesWon / Math.max(1, stats.gamesWon + stats.gamesLost)) * 100 : 0));
    const streak = Math.min(100, stats.bestStreak * 12);
    return [
      ["Win efficiency", winEfficiency],
      ["Point control", Math.round(pointControl)],
      ["Consistency", Math.round(consistency)],
      ["Scoring", Math.round(scoring)],
      ["Streak strength", Math.round(streak)],
    ] as [string, number][];
  }, [stats]);

  const latest = playerMatches[0] || null;
  const latestSide = latest?.match_players.find(x => x.player_id === playerId)?.team;
  const latestOwn = latest && latestSide ? (latestSide === "A" ? latest.team_a_score : latest.team_b_score) : 0;
  const latestOpp = latest && latestSide ? (latestSide === "A" ? latest.team_b_score : latest.team_a_score) : 0;
  const latestWon = latestOwn > latestOpp;

  if (loading) return <main className="r365-profile-page"><div className="r365-profile-loading r365-loading">Loading player profile…</div></main>;
  if (!player) return <main className="r365-profile-page"><div className="r365-profile-shell"><Link className="r365-back" href="/">← Back to players</Link><div className="r365-error" style={{ marginTop: 16 }}>{error || "Player not found."}</div></div></main>;

  const winPct = `${Math.max(0, Math.min(100, stats.winRate))}%`;
  const doublesPct = `${playing.doublesRate}%`;

  return (
    <main className="r365-profile-page">
      <div className="r365-profile-shell">
        <header className="r365-profile-top">
          <div className="r365-brand"><img src="/rally365-circle-logo.png" alt="Rally365" /><span>Rally365</span></div>
          <div className="r365-top-actions">
            <Link className="r365-icon-btn" href="/" aria-label="Back to players"><ArrowLeft size={19} /></Link>
            <button className="r365-icon-btn" type="button" onClick={() => navigator.share?.({ title: `${player.name} · Rally365`, text: `${player.name}'s Rally365 player profile` })} aria-label="Share profile"><Share2 size={18} /></button>
          </div>
        </header>

        {error && <div className="r365-error">{error}</div>}

        <section className="r365-hero">
          <div className="r365-hero-glow" />
          <div className="r365-hero-main">
            <img className="r365-avatar" src={avatarPath(player.name)} alt="" onError={e => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement?.querySelector(".r365-avatar-fallback")?.removeAttribute("hidden"); }} />
            <div className="r365-avatar r365-avatar-fallback" hidden>{player.name.slice(0, 1)}</div>
            <div>
              <div className="r365-eyebrow">PLAYER PROFILE</div>
              <h1>{player.name} <span style={{ color: "#29e58b", fontSize: ".65em" }}>●</span></h1>
              <p className="r365-sub">{groupName} · Hyderabad</p>
              <div className="r365-meta"><span><Users size={13} /> {playing.doubles ? "Singles + Doubles" : "Singles"}</span><span>🏸 Right Handed</span></div>
              <div className="r365-tags"><span className="r365-tag">Competitive</span><span className="r365-tag blue">Net Play</span><span className="r365-tag purple">Consistent</span></div>
            </div>
          </div>
          <div className="r365-form"><span className="r365-form-label">RECENT FORM</span>{recent.map((r, i) => <span key={`${r}-${i}`} className={`r365-result ${r === "L" ? "loss" : ""}`}>{r}</span>)}<div className="r365-rank"><small>Performance rank</small><strong>#{Math.max(1, Math.min(999, 100 + Math.max(0, 70 - stats.winRate)))}</strong><em>{stats.currentStreak > 0 ? `↑ ${stats.currentStreak} streak` : "Stable"}</em></div></div>
        </section>

        <section className="r365-kpis">
          <div className="r365-kpi"><div className="r365-kpi-icon">🏸</div><b>{stats.played}</b><span>Matches</span></div>
          <div className="r365-kpi"><div className="r365-kpi-icon">🏆</div><b>{stats.wins}</b><span>Wins</span></div>
          <div className="r365-kpi"><div className="r365-kpi-icon">✕</div><b>{stats.losses}</b><span>Losses</span></div>
          <div className="r365-kpi"><div className="r365-kpi-icon">◔</div><b>{stats.winRate}%</b><span>Win rate</span></div>
          <div className="r365-kpi"><div className="r365-kpi-icon">▱</div><b>{stats.gamesWon}</b><span>Games won</span></div>
          <div className="r365-kpi"><div className="r365-kpi-icon">▱</div><b>{stats.gamesLost}</b><span>Games lost</span></div>
          <div className="r365-kpi"><div className="r365-kpi-icon">▥</div><b>{stats.avgPoints}</b><span>Avg points/game</span></div>
          <div className="r365-kpi"><div className="r365-kpi-icon">🔥</div><b>{stats.currentStreak}</b><span>Current streak</span></div>
        </section>

        <div className="r365-grid">
          <section className="r365-card">
            <div className="r365-card-head"><div><h2>Performance Heatmap</h2><span className="r365-muted">Visual activity summary from recorded matches</span></div><select className="r365-select" defaultValue="all"><option value="all">All matches</option></select></div>
            <div className="r365-court"><span className="r365-heat r365-h1"/><span className="r365-heat r365-h2"/><span className="r365-heat r365-h3"/><span className="r365-heat r365-h4"/></div>
            <div className="r365-court-labels"><span>Player side</span><span>Net</span><span>Opponent side</span></div>
          </section>

          <section className="r365-card">
            <div className="r365-card-head"><h2>Win / Loss Distribution</h2><span className="r365-muted">All time</span></div>
            <div className="r365-donut-wrap">
              <div className="r365-donut" style={{ "--win": winPct } as React.CSSProperties}><div className="r365-donut-center"><b>{stats.winRate}%</b><span>Win rate</span></div></div>
              <div className="r365-legend"><div className="r365-legend-row"><i className="r365-dot"/><div><b>Wins {stats.wins}</b><small>{stats.winRate}% of matches</small></div></div><div className="r365-legend-row"><i className="r365-dot red"/><div><b>Losses {stats.losses}</b><small>{100 - stats.winRate}% of matches</small></div></div></div>
            </div>
          </section>

          <section className="r365-card">
            <div className="r365-card-head"><h2>Performance Profile</h2><BarChart3 size={16} color="#42eb91" /></div>
            <div className="r365-bars">{profileBars.map(([label, value]) => <div className="r365-bar-row" key={label}><span>{label}</span><div className="r365-bar-track"><div className="r365-bar-fill" style={{ width: `${value}%` }}/></div><strong>{value}%</strong></div>)}</div>
          </section>

          <section className="r365-card">
            <div className="r365-card-head"><h2>Playing Distribution</h2><span className="r365-muted">Recorded matches</span></div>
            <div className="r365-playing"><div className="r365-mode">Singles</div><div className="r365-mode active">Doubles</div></div>
            <div className="r365-mode-value">{doublesPct}</div><div className="r365-mode-note">Doubles · {playing.doubles} matches · Singles · {playing.singles}</div>
          </section>

          <section className="r365-card">
            <div className="r365-card-head"><h2>Latest Match</h2><span className="r365-muted">{latest ? formatDate(latest.played_at) : "No match yet"}</span></div>
            {latest ? <>
              <div className="r365-latest">
                <div className="r365-player-mini"><img src={avatarPath(player.name)} alt=""/><b>{player.name}</b><small>{groupName}</small></div>
                <div className="r365-score"><b>{latestOwn} - {latestOpp}</b><span className={`r365-win-pill ${latestWon ? "" : ""}`}>{latestWon ? "WIN" : "LOSS"}</span><small>{latestSide === "A" ? "Team A" : "Team B"}</small></div>
                <div className="r365-player-mini"><div className="fallback">?</div><b>{latest.match_players.filter(x => x.team !== latestSide).map(x => nameMap.get(x.player_id) || "Opponent").join(" + ") || "Opponent"}</b><small>Opponent</small></div>
              </div>
              <div className="r365-match-footer"><span>Point differential {latestOwn - latestOpp >= 0 ? "+" : ""}{latestOwn - latestOpp}</span><span><CalendarDays size={11} /> {formatDate(latest.played_at)}</span></div>
            </> : <div className="r365-muted">No recorded matches for this player.</div>}
          </section>

          <section className="r365-card">
            <div className="r365-card-head"><div><h2>Competition Performance</h2><span className="r365-muted">Grouped by match month because everyday matches are not linked to tournaments</span></div></div>
            {periods.length ? <table className="r365-table"><thead><tr><th>Period</th><th>Matches</th><th>Wins</th><th>Win rate</th></tr></thead><tbody>{periods.map(row => <tr key={row.label}><td>{row.label}</td><td>{row.matches}</td><td>{row.wins}</td><td><div style={{ display: "flex", alignItems: "center", gap: 7 }}><span>{row.winRate}%</span><div className="r365-progress"><i style={{ width: `${row.winRate}%` }}/></div></div></td></tr>)}</tbody></table> : <div className="r365-muted">No period data yet.</div>}
          </section>

          <section className="r365-card">
            <div className="r365-card-head"><h2>Key Stats</h2><Trophy size={16} color="#42eb91" /></div>
            <div className="r365-key-grid"><div className="r365-key"><b>{stats.played}</b><span>Total matches</span></div><div className="r365-key"><b>{stats.wins}</b><span>Total wins</span></div><div className="r365-key"><b>{stats.gamesWon}</b><span>Total games won</span></div><div className="r365-key"><b>{stats.gamesLost}</b><span>Games lost</span></div><div className="r365-key"><b>{stats.avgPoints}</b><span>Avg points/game</span></div><div className="r365-key"><b>{stats.bestStreak}</b><span>Best win streak</span></div></div>
          </section>

          <section className="r365-card r365-partners-card">
            <div className="r365-card-head"><div><h2>Best Duo Partners</h2><span className="r365-muted">Partnership performance</span></div><Users size={16} color="#42eb91" /></div>
            {partnerRows.length ? (
              <div className="r365-partner-grid">
                {partnerRows.map((p, index) => {
                  const losses = p.matches - p.wins;
                  return (
                    <article className="r365-partner-tile" key={p.id}>
                      <div className="r365-partner-info" style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                        <div className="r365-partner-avatar" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</div>
                        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3, paddingRight: 4 }}>
                          <strong className="r365-partner-name" style={{ display: "block", color: "#effbf6", fontSize: 13, lineHeight: 1.1, fontWeight: 700, opacity: 1, visibility: "visible", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</strong>
                          <span style={{ display: "block", color: "#8ca69d", fontSize: 8, lineHeight: 1.1 }}>{p.matches} {p.matches === 1 ? "match" : "matches"}</span>
                        </div>
                      </div>
                      <div className="r365-partner-ring" style={{ "--partner-win-rate": `${p.winRate}%` } as React.CSSProperties} aria-label={`${p.name}: ${p.winRate}% win rate`}>
                        <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", lineHeight: 1, pointerEvents: "none" }}>
                          <strong style={{ position: "relative", zIndex: 3, display: "block", color: "#effff7", fontSize: 16, lineHeight: 1, fontWeight: 800, letterSpacing: "-.4px" }}>{p.winRate}%</strong>
                          <small style={{ position: "relative", zIndex: 3, display: "block", marginTop: 4, color: "#76948a", fontSize: 6, lineHeight: 1, textTransform: "uppercase", letterSpacing: ".45px" }}>win rate</small>
                        </div>
                      </div>
                      <div className="r365-partner-record" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#8ca69d", fontSize: 8, lineHeight: 1 }}><i className="r365-partner-win-dot" style={{ display: "inline-block", width: 8, height: 8, flex: "0 0 8px", borderRadius: "50%", background: "#35e68b" }} /><b style={{ color: "#eaf8f2", fontSize: 10 }}>{p.wins}</b> Wins</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#8ca69d", fontSize: 8, lineHeight: 1 }}><i className="r365-partner-loss-dot" style={{ display: "inline-block", width: 8, height: 8, flex: "0 0 8px", borderRadius: "50%", background: "#ed5b62" }} /><b style={{ color: "#eaf8f2", fontSize: 10 }}>{losses}</b> {losses === 1 ? "Loss" : "Losses"}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <div className="r365-muted">No duo history yet.</div>}
          </section>
        </div>

        <section className="r365-card r365-section r365-history">
          <div className="r365-card-head"><div><h2>Match History</h2><span className="r365-muted">Latest recorded matches</span></div><span className="r365-muted">{stats.played} total</span></div>
          {playerMatches.length ? <table className="r365-table"><thead><tr><th>#</th><th>Date</th><th>Type</th><th>Partner / Opponent</th><th>Result</th><th>Score</th><th>Point diff</th></tr></thead><tbody>{playerMatches.slice(0, 30).map((m, index) => { const side = m.match_players.find(x => x.player_id === playerId)?.team; const own = side === "A" ? m.team_a_score : m.team_b_score; const opp = side === "A" ? m.team_b_score : m.team_a_score; const won = own > opp; const partner = m.match_players.filter(x => x.team === side && x.player_id !== playerId).map(x => nameMap.get(x.player_id) || "Unknown").join(" + "); const opponent = m.match_players.filter(x => x.team !== side).map(x => nameMap.get(x.player_id) || "Unknown").join(" + "); const type = m.match_players.length > 2 ? "Doubles" : "Singles"; return <tr key={m.id}><td>{index + 1}</td><td>{formatDate(m.played_at)}</td><td>{type}</td><td>{partner ? `${partner} / ${opponent}` : opponent}</td><td><span className={`r365-result-pill ${won ? "win" : "loss"}`}>{won ? "WIN" : "LOSS"}</span></td><td>{own}-{opp}</td><td className={won ? "good" : ""}>{own - opp >= 0 ? "+" : ""}{own - opp}</td></tr>; })}</tbody></table> : <div className="r365-muted">No match history yet.</div>}
        </section>
      </div>
    </main>
  );
}
