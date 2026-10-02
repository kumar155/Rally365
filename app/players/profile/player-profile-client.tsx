"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowLeft, Share2 } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import "../player-profile.css";
import "./player-profile-trend.css";

type Player = { id: string; name: string };
type MatchPlayer = { player_id: string; team: "A" | "B" };
type Match = { id: string; team_a_score: number; team_b_score: number; played_at: string; status: string; match_players: MatchPlayer[] };
type Partner = { id: string; name: string; matches: number; wins: number; winRate: number };
type TrendPoint = { label: string; date: string; week: string; month: string; result: "W" | "L"; own: number; opp: number; winRate: number; avgPoints: number };
type Frequency = "all" | "weekly" | "monthly";
type PerformanceBar = { key: string; label: string; period: string; matches: number; wins: number; winRate: number; points: number };

const isValid = (m: Match) => m.status !== "VOIDED";
const formatDate = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Date TBD" : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); };
const monthLabel = (date: Date) => date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const isoWeek = (date: Date) => { const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); const day = copy.getUTCDay() || 7; copy.setUTCDate(copy.getUTCDate() + 4 - day); const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1)); return Math.ceil((((copy.getTime() - yearStart.getTime()) / 86400000) + 1) / 7); };
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export default function PlayerProfileClient() {
  const searchParams = useSearchParams();
  const playerKey = searchParams.get("id") || "";
  const [player, setPlayer] = useState<Player | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [selectedTrendIndex, setSelectedTrendIndex] = useState<number | null>(null);
  const [selectedBarKey, setSelectedBarKey] = useState<string | null>(null);

  useEffect(() => {
    if (!playerKey) { setError("Player was not specified."); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true); setError("");
      const { data: group, error: groupError } = await supabase.from("groups").select("id").eq("join_code", "RALLY365").single();
      if (groupError || !group) { if (!cancelled) { setError(groupError?.message || "Group not found"); setLoading(false); } return; }
      const playerQuery = isUuid(playerKey)
        ? supabase.from("players").select("id,name").eq("group_id", group.id).eq("id", playerKey).maybeSingle()
        : supabase.from("players").select("id,name").eq("group_id", group.id).eq("name", playerKey).maybeSingle();
      const [playerResult, playerListResult, matchResult] = await Promise.all([
        playerQuery,
        supabase.from("players").select("id,name").eq("group_id", group.id).order("name"),
        supabase.from("matches").select("id,team_a_score,team_b_score,played_at,status,match_players(player_id,team)").eq("group_id", group.id).order("played_at", { ascending: false }),
      ]);
      if (cancelled) return;
      if (playerResult.error || !playerResult.data) { setError(playerResult.error?.message || "Player not found"); setLoading(false); return; }
      setPlayer(playerResult.data as Player); setPlayers((playerListResult.data || []) as Player[]); setMatches((matchResult.data || []) as Match[]);
      if (matchResult.error) setError(matchResult.error.message);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [playerKey]);

  const playerId = player?.id || "";
  const nameMap = useMemo(() => new Map(players.map(p => [p.id, p.name])), [players]);
  const playerMatches = useMemo(() => matches.filter(isValid).filter(m => m.match_players.some(x => x.player_id === playerId)), [matches, playerId]);

  const stats = useMemo(() => {
    let wins = 0, gamesWon = 0, gamesLost = 0, bestStreak = 0, running = 0;
    for (const match of playerMatches) {
      const side = match.match_players.find(x => x.player_id === playerId)?.team; if (!side) continue;
      const own = Number(side === "A" ? match.team_a_score : match.team_b_score); const opp = Number(side === "A" ? match.team_b_score : match.team_a_score);
      gamesWon += own; gamesLost += opp;
      if (own > opp) { wins++; running++; bestStreak = Math.max(bestStreak, running); } else running = 0;
    }
    let currentStreak = 0;
    for (const match of playerMatches) {
      const side = match.match_players.find(x => x.player_id === playerId)?.team; if (!side) continue;
      const own = side === "A" ? match.team_a_score : match.team_b_score; const opp = side === "A" ? match.team_b_score : match.team_a_score;
      if (own > opp) currentStreak++; else break;
    }
    const played = playerMatches.length;
    return { played, wins, losses: played - wins, winRate: played ? Math.round((wins / played) * 100) : 0, gamesWon, gamesLost, avgPoints: played ? (gamesWon / played).toFixed(1) : "0.0", currentStreak, bestStreak, pointDiff: gamesWon - gamesLost };
  }, [playerMatches, playerId]);

  const trend = useMemo<TrendPoint[]>(() => {
    const chronological = [...playerMatches].reverse(); let wins = 0, points = 0;
    return chronological.map((match, index) => {
      const side = match.match_players.find(x => x.player_id === playerId)?.team; const date = new Date(match.played_at);
      if (!side || Number.isNaN(date.getTime())) return { label: `${index + 1}`, date: formatDate(match.played_at), week: "Week TBD", month: "Month TBD", result: "L", own: 0, opp: 0, winRate: 0, avgPoints: 0 };
      const own = Number(side === "A" ? match.team_a_score : match.team_b_score); const opp = Number(side === "A" ? match.team_b_score : match.team_a_score); const won = own > opp;
      if (won) wins++; points += own;
      return { label: `${index + 1}`, date: formatDate(match.played_at), week: `Week ${isoWeek(date)}`, month: monthLabel(date), result: won ? "W" : "L", own, opp, winRate: Math.round((wins / (index + 1)) * 100), avgPoints: Number((points / (index + 1)).toFixed(1)) };
    });
  }, [playerMatches, playerId]);

  useEffect(() => { setSelectedTrendIndex(null); setSelectedBarKey(null); }, [playerId]);

  const recent = useMemo(() => playerMatches.slice(0, 12).map(match => {
    const side = match.match_players.find(x => x.player_id === playerId)?.team; if (!side) return "L";
    return (side === "A" ? match.team_a_score > match.team_b_score : match.team_b_score > match.team_a_score) ? "W" : "L";
  }), [playerMatches, playerId]);

  const performanceBars = useMemo<PerformanceBar[]>(() => {
    const chronological = [...playerMatches].reverse(); const bucketMode: "weekly" | "monthly" = frequency === "weekly" ? "weekly" : "monthly";
    const buckets = new Map<string, { date: Date; matches: number; wins: number; points: number }>();
    for (const match of chronological) {
      const side = match.match_players.find(x => x.player_id === playerId)?.team; if (!side) continue;
      const date = new Date(match.played_at); if (Number.isNaN(date.getTime())) continue;
      let key: string; let bucketDate: Date;
      if (bucketMode === "weekly") { const day = date.getDay(); const mondayOffset = day === 0 ? -6 : 1 - day; bucketDate = new Date(date); bucketDate.setDate(date.getDate() + mondayOffset); bucketDate.setHours(0, 0, 0, 0); key = bucketDate.toISOString().slice(0, 10); }
      else { bucketDate = new Date(date.getFullYear(), date.getMonth(), 1); key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
      const own = Number(side === "A" ? match.team_a_score : match.team_b_score); const opp = Number(side === "A" ? match.team_b_score : match.team_a_score);
      const bucket = buckets.get(key) || { date: bucketDate, matches: 0, wins: 0, points: 0 }; bucket.matches++; bucket.points += own; if (own > opp) bucket.wins++; buckets.set(key, bucket);
    }
    const values = [...buckets.values()]; const visible = frequency === "all" ? values : values.slice(-12);
    return visible.map(bucket => { const label = bucketMode === "weekly" ? `W${isoWeek(bucket.date)}` : bucket.date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }); const period = bucketMode === "weekly" ? `Week ${isoWeek(bucket.date)} · ${bucket.date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : bucket.date.toLocaleDateString("en-IN", { month: "long", year: "numeric" }); return { key: `${frequency}-${bucket.date.toISOString()}`, label, period, matches: bucket.matches, wins: bucket.wins, winRate: bucket.matches ? Math.round((bucket.wins / bucket.matches) * 100) : 0, points: bucket.points }; });
  }, [playerMatches, playerId, frequency]);

  const partnerRows = useMemo<Partner[]>(() => {
    const map = new Map<string, { matches: number; wins: number }>();
    for (const match of playerMatches) {
      const me = match.match_players.find(x => x.player_id === playerId); if (!me) continue;
      const own = me.team === "A" ? match.team_a_score : match.team_b_score; const opp = me.team === "A" ? match.team_b_score : match.team_a_score;
      for (const partner of match.match_players.filter(x => x.team === me.team && x.player_id !== playerId)) { const value = map.get(partner.player_id) || { matches: 0, wins: 0 }; value.matches++; if (own > opp) value.wins++; map.set(partner.player_id, value); }
    }
    return [...map.entries()].map(([id, value]) => ({ id, name: nameMap.get(id) || "Unknown", ...value, winRate: value.matches ? Math.round((value.wins / value.matches) * 100) : 0 })).sort((a, b) => b.winRate - a.winRate || b.matches - a.matches).slice(0, 5);
  }, [playerMatches, playerId, nameMap]);

  const trendPoints = useMemo(() => { const width = 360, height = 112, padX = 8, padY = 10; const source = trend.length ? trend : [{ label: "1", date: "Date TBD", week: "Week TBD", month: "Month TBD", result: "L" as const, own: 0, opp: 0, winRate: 0, avgPoints: 0 }]; const step = source.length > 1 ? (width - padX * 2) / (source.length - 1) : 0; return source.map((point, index) => ({ ...point, x: padX + step * index, y: height - padY - (point.winRate / 100) * (height - padY * 2) })); }, [trend]);
  const trendLine = trendPoints.map(point => `${point.x},${point.y}`).join(" ");
  const trendArea = trendPoints.length ? `${trendPoints[0].x},102 ${trendLine} ${trendPoints[trendPoints.length - 1].x},102` : "";
  const trendCurrent = trend.at(-1)?.winRate ?? stats.winRate;
  const selectedPoint = selectedTrendIndex === null ? null : trendPoints[selectedTrendIndex] || null;
  const tooltipLeft = selectedPoint ? Math.min(84, Math.max(16, (selectedPoint.x / 360) * 100)) : 50;
  const tooltipBelow = selectedPoint ? selectedPoint.y < 48 : false;
  const tooltipTop = selectedPoint ? (tooltipBelow ? selectedPoint.y + 10 : selectedPoint.y - 8) : 0;

  if (loading) return <main className="r365-profile-page"><div className="r365-profile-loading r365-loading">Loading player profile…</div></main>;
  if (!player) return <main className="r365-profile-page"><div className="r365-profile-shell"><Link className="r365-back" href="/">← Back to players</Link><div className="r365-error" style={{ marginTop: 16 }}>{error || "Player not found."}</div></div></main>;

  return <main className="r365-profile-page"><div className="r365-profile-shell">
    <header className="r365-profile-top"><div className="r365-brand"><img src="/rally365-circle-logo.png" alt="Rally365" /><span>Rally365</span></div><div className="r365-top-actions"><Link className="r365-icon-btn" href="/" aria-label="Back to players"><ArrowLeft size={19} /></Link><button className="r365-icon-btn" type="button" onClick={() => navigator.share?.({ title: `${player.name} · Rally365`, text: `${player.name}'s Rally365 player profile` })} aria-label="Share profile"><Share2 size={18} /></button></div></header>
    {error && <div className="r365-error">{error}</div>}
    <section className="r365-hero"><div className="r365-hero-glow" /><div className="r365-hero-main"><div className="r365-player-identity"><h1>{player.name}</h1></div>
      <div className="r365-trend-panel"><div className="r365-trend-head"><div><div className="r365-trend-title">Performance trend</div><div className="r365-trend-subtitle">Cumulative win rate · all {stats.played} recorded matches</div></div><div className="r365-trend-current"><b>{trendCurrent}%</b><span>current win rate</span></div></div>
        <div className="r365-trend-chart" aria-label="Player win rate trend across all recorded matches"><svg viewBox="0 0 360 112" role="img" aria-label="Touch a point to see match date, week and month"><defs><linearGradient id="r365TrendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#42eb91" stopOpacity=".24" /><stop offset="100%" stopColor="#42eb91" stopOpacity="0" /></linearGradient></defs>{[25,50,75].map(value => <line key={value} className="r365-trend-grid" x1="8" x2="352" y1={102-(value/100)*92} y2={102-(value/100)*92} />)}<polygon className="r365-trend-area" points={trendArea} /><polyline className="r365-trend-line" points={trendLine} />{trendPoints.map((point,index)=><circle key={`hit-${point.label}-${index}`} className="r365-trend-hit" cx={point.x} cy={point.y} r={9} tabIndex={0} role="button" aria-label={`Match ${point.label}, ${point.date}, ${point.week}, ${point.month}, ${point.result}`} onPointerDown={()=>setSelectedTrendIndex(index)} onFocus={()=>setSelectedTrendIndex(index)} />)}{trendPoints.map((point,index)=>{const showDot=trendPoints.length<=24||index===trendPoints.length-1||index%Math.ceil(trendPoints.length/20)===0;return showDot?<circle key={`dot-${point.label}-${index}`} className={`r365-trend-dot ${selectedTrendIndex===index?"selected":""}`} cx={point.x} cy={point.y} r={selectedTrendIndex===index||index===trendPoints.length-1?4:2.5}/>:null;})}</svg>{selectedPoint&&<div className={`r365-trend-tooltip ${tooltipBelow?"below":"above"}`} style={{left:`${tooltipLeft}%`,top:`${tooltipTop}px`}} role="status"><b>Match {selectedPoint.label} · {selectedPoint.result}</b><span>{selectedPoint.date}</span><span>{selectedPoint.week} · {selectedPoint.month}</span><strong>{selectedPoint.winRate}% cumulative win rate</strong><small>{selectedPoint.own} – {selectedPoint.opp}</small></div>}</div>
        <div className="r365-trend-axis"><span>Match 1</span><span>Match {Math.max(1,stats.played)}</span></div><div className="r365-trend-kpis"><div className="r365-trend-kpi"><b>{stats.winRate}%</b><span>Overall win rate</span></div><div className="r365-trend-kpi"><b>{stats.avgPoints}</b><span>Avg points/game</span></div><div className="r365-trend-kpi"><b>{stats.pointDiff>0?"+":""}{stats.pointDiff}</b><span>Point diff</span></div></div>
        <div className="r365-frequency-head"><div><strong>Performance by frequency</strong><span>{frequency === "all" ? "Full history · monthly buckets" : "Win rate and match volume"}</span></div><div className="r365-frequency-toggle" role="tablist" aria-label="Performance frequency"><button type="button" className={frequency === "all" ? "active" : ""} onClick={()=>setFrequency("all")}>All</button><button type="button" className={frequency === "weekly" ? "active" : ""} onClick={()=>setFrequency("weekly")}>Weekly</button><button type="button" className={frequency === "monthly" ? "active" : ""} onClick={()=>setFrequency("monthly")}>Monthly</button></div></div>
        <div className="r365-performance-bars">{performanceBars.length===0?<div className="r365-chart-empty">No recorded performance yet.</div>:performanceBars.map(bar=><div className={`r365-performance-bar ${selectedBarKey===bar.key?"selected":""}`} key={bar.key} tabIndex={0} role="button" aria-label={`${bar.period}: ${bar.matches} matches, ${bar.wins} wins, ${bar.winRate}% win rate`} onPointerEnter={()=>setSelectedBarKey(bar.key)} onFocus={()=>setSelectedBarKey(bar.key)} onPointerDown={()=>setSelectedBarKey(bar.key)}><div className="r365-performance-bar-detail" aria-hidden="true"><b>{bar.period}</b><span>{bar.matches} matches · {bar.wins} wins</span><strong>{bar.winRate}% win rate</strong></div><div className="r365-performance-bar-value">{bar.matches}</div><div className="r365-performance-bar-fill" style={{height:`${Math.max(8,bar.winRate)}%`}}><span>{bar.winRate}%</span></div><small>{bar.label}</small></div>)}</div><div className="r365-trend-legend"><i /> Touch or hover a point/bar for period details</div>
      </div></div></section>

    <section className="r365-win-distribution" aria-label="Win and loss distribution"><div className="r365-win-distribution-head"><div><h2>Win percentage</h2><span>Recorded match results</span></div><strong>{stats.played} matches</strong></div><div className="r365-win-distribution-body"><div className="r365-win-donut" style={{"--r365-win-rate":`${stats.winRate}%`} as CSSProperties}><div><b>{stats.winRate}%</b><span>Win rate</span></div></div><div className="r365-win-legend"><div><i className="win" /><span>Wins</span><b>{stats.wins}</b><em>{stats.winRate}%</em></div><div><i className="loss" /><span>Losses</span><b>{stats.losses}</b><em>{100-stats.winRate}%</em></div><div className="r365-win-summary"><span>Point differential</span><b>{stats.pointDiff>0?"+":""}{stats.pointDiff}</b><small>{stats.avgPoints} avg points/game</small></div></div></div></section>

    <section className="r365-recent-form-card"><span className="r365-form-label">RECENT FORM</span><div className="r365-form-results">{recent.map((r,i)=><span key={`${r}-${i}`} className={`r365-result ${r==="L"?"loss":""}`}>{r}</span>)}</div><div className="r365-rank"><small>Win rate</small><strong>{stats.winRate}%</strong><em>{stats.currentStreak>0?`↑ ${stats.currentStreak} streak`:"Stable"}</em></div></section>
    <div className="r365-grid"><section className="r365-card"><div className="r365-card-head"><div><h2>Performance Overview</h2><span className="r365-muted">Recorded match performance</span></div></div><div className="r365-profile-bars">{[["Win rate",stats.winRate],["Point control",Math.max(0,Math.min(100,Math.round(50+stats.pointDiff/Math.max(1,stats.played*2)*50)))],["Scoring",stats.gamesWon+stats.gamesLost?Math.round(stats.gamesWon/(stats.gamesWon+stats.gamesLost)*100):0],["Streak strength",Math.min(100,stats.bestStreak*12)]].map(([label,value])=><div className="r365-profile-bar" key={label as string}><div><span>{label}</span><b>{value}%</b></div><i><em style={{width:`${value}%`}} /></i></div>)}</div></section>
      <section className="r365-card r365-partners-card"><div className="r365-card-head"><div><h2>Best Duo Partners</h2><span className="r365-muted">Partnership performance</span></div></div>{partnerRows.length===0?<div className="r365-empty">No doubles partner data available yet.</div>:<div className="r365-partner-grid">{partnerRows.map((partner,index)=><div className="r365-partner-tile" key={partner.id} style={{"--partner-win-rate":`${partner.winRate}%`} as CSSProperties}><div className="r365-partner-rank">{String.fromCharCode(65+index)}</div><div className="r365-partner-info"><div className="r365-partner-avatar">{partner.name.trim().slice(0,1).toUpperCase()}</div><div><b className="r365-partner-name">{partner.name}</b><span>{partner.matches} matches</span></div></div><div className="r365-partner-ring" aria-label={`${partner.winRate}% win rate with ${partner.name}`}><strong>{partner.winRate}%</strong><small>Win rate</small></div><div className="r365-partner-stats"><div><i className="win" /><b>{partner.wins}</b><span>Wins</span></div><div><i className="loss" /><b>{partner.matches - partner.wins}</b><span>Losses</span></div></div></div>)}</div>}</section>
      <section className="r365-card r365-card-wide"><div className="r365-card-head"><div><h2>Match History</h2><span className="r365-muted">Latest recorded matches</span></div></div>{playerMatches.length===0?<div className="r365-empty">No recorded matches for this player yet.</div>:<div className="r365-match-history">{playerMatches.slice(0,20).map(match=>{const side=match.match_players.find(x=>x.player_id===playerId)?.team;const own=side==="A"?match.team_a_score:match.team_b_score;const opp=side==="A"?match.team_b_score:match.team_a_score;const won=own>opp;const opponents=match.match_players.filter(x=>x.team!==side).map(x=>nameMap.get(x.player_id)||"Opponent").join(" / ");return <div className="r365-match-row" key={match.id}><div className={`r365-match-result ${won?"win":"loss"}`}>{won?"W":"L"}</div><div className="r365-match-main"><b>vs {opponents||"Opponent"}</b><span>{formatDate(match.played_at)}</span></div><strong>{own} – {opp}</strong></div>;})}</div>}</section>
    </div>
  </div></main>;
}
