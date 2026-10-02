"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Share2, Users } from "lucide-react";
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

const isValid = (m: Match) => m.status !== "VOIDED";
const avatarPath = (name: string) => `/avatars/${encodeURIComponent(name)}.png`;
const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date TBD" : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export default function PlayerProfileClient() {
  const searchParams = useSearchParams();
  const playerKey = searchParams.get("id") || "";
  const [player, setPlayer] = useState<Player | null>(null);
  const [groupName, setGroupName] = useState("Rally365 Club");
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerKey) {
      setError("Player was not specified.");
      setLoading(false);
      return;
    }
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

      // The profile URL may contain either the player's UUID or their name.
      // Never send a non-UUID value to the UUID `id` column: Postgres rejects
      // values such as "Kartik" before the OR filter can evaluate the name.
      const playerQuery = isUuid(playerKey)
        ? supabase.from("players").select("id,name").eq("group_id", group.id).eq("id", playerKey).maybeSingle()
        : supabase.from("players").select("id,name").eq("group_id", group.id).eq("name", playerKey).maybeSingle();

      const [playerResult, playerListResult, matchResult] = await Promise.all([
        playerQuery,
        supabase.from("players").select("id,name").eq("group_id", group.id).order("name"),
        supabase.from("matches").select("id,team_a_score,team_b_score,played_at,status,match_players(player_id,team)").eq("group_id", group.id).order("played_at", { ascending: false }),
      ]);

      if (cancelled) return;
      if (playerResult.error || !playerResult.data) {
        setError(playerResult.error?.message || "Player not found");
        setLoading(false);
        return;
      }
      setPlayer(playerResult.data as Player);
      setPlayers((playerListResult.data || []) as Player[]);
      setGroupName(group.name || "Rally365 Club");
      setMatches((matchResult.data || []) as Match[]);
      if (matchResult.error) setError(matchResult.error.message);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [playerKey]);

  const playerId = player?.id || "";
  const nameMap = useMemo(() => new Map(players.map(p => [p.id, p.name])), [players]);
  const playerMatches = useMemo(() => matches.filter(isValid).filter(m => m.match_players.some(x => x.player_id === playerId)), [matches, playerId]);

  const stats = useMemo(() => {
    let wins = 0;
    let gamesWon = 0;
    let gamesLost = 0;
    let bestStreak = 0;
    let running = 0;
    for (const match of playerMatches) {
      const side = match.match_players.find(x => x.player_id === playerId)?.team;
      if (!side) continue;
      const own = Number(side === "A" ? match.team_a_score : match.team_b_score);
      const opp = Number(side === "A" ? match.team_b_score : match.team_a_score);
      gamesWon += own;
      gamesLost += opp;
      if (own > opp) { wins++; running++; bestStreak = Math.max(bestStreak, running); } else running = 0;
    }
    let currentStreak = 0;
    for (const match of playerMatches) {
      const side = match.match_players.find(x => x.player_id === playerId)?.team;
      if (!side) continue;
      const own = side === "A" ? match.team_a_score : match.team_b_score;
      const opp = side === "A" ? match.team_b_score : match.team_a_score;
      if (own > opp) currentStreak++; else break;
    }
    const played = playerMatches.length;
    return { played, wins, losses: played - wins, winRate: played ? Math.round(wins / played * 100) : 0, gamesWon, gamesLost, avgPoints: played ? (gamesWon / played).toFixed(1) : "0.0", currentStreak, bestStreak, pointDiff: gamesWon - gamesLost };
  }, [playerMatches, playerId]);

  const recent = useMemo(() => playerMatches.slice(0, 8).map(m => {
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
      for (const partner of match.match_players.filter(x => x.team === me.team && x.player_id !== playerId)) {
        const value = map.get(partner.player_id) || { matches: 0, wins: 0 };
        value.matches++;
        if (own > opp) value.wins++;
        map.set(partner.player_id, value);
      }
    }
    return [...map.entries()].map(([id, value]) => ({ id, name: nameMap.get(id) || "Unknown", ...value, winRate: value.matches ? Math.round(value.wins / value.matches * 100) : 0 })).sort((a, b) => b.winRate - a.winRate || b.matches - a.matches).slice(0, 5);
  }, [playerMatches, playerId, nameMap]);

  if (loading) return <main className="r365-profile-page"><div className="r365-profile-loading r365-loading">Loading player profile…</div></main>;
  if (!player) return <main className="r365-profile-page"><div className="r365-profile-shell"><Link className="r365-back" href="/">← Back to players</Link><div className="r365-error" style={{ marginTop: 16 }}>{error || "Player not found."}</div></div></main>;

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
              <div className="r365-meta"><span><Users size={13} /> Badminton</span><span>🏸 Player</span></div>
              <div className="r365-tags"><span className="r365-tag">Competitive</span><span className="r365-tag blue">Performance</span></div>
            </div>
          </div>
          <div className="r365-form"><span className="r365-form-label">RECENT FORM</span>{recent.map((r, i) => <span key={`${r}-${i}`} className={`r365-result ${r === "L" ? "loss" : ""}`}>{r}</span>)}<div className="r365-rank"><small>Win rate</small><strong>{stats.winRate}%</strong><em>{stats.currentStreak > 0 ? `↑ ${stats.currentStreak} streak` : "Stable"}</em></div></div>
        </section>

        <section className="r365-kpis">
          <div className="r365-kpi"><div className="r365-kpi-icon">🏸</div><b>{stats.played}</b><span>Matches</span></div>
          <div className="r365-kpi"><div className="r365-kpi-icon">🏆</div><b>{stats.wins}</b><span>Wins</span></div>
          <div className="r365-kpi"><div className="r365-kpi-icon">✕</div><b>{stats.losses}</b><span>Losses</span></div>
          <div className="r365-kpi"><div className="r365-kpi-icon">◔</div><b>{stats.winRate}%</b><span>Win rate</span></div>
          <div className="r365-kpi"><div className="r365-kpi-icon">▱</div><b>{stats.gamesWon}</b><span>Points won</span></div>
          <div className="r365-kpi"><div className="r365-kpi-icon">▱</div><b>{stats.gamesLost}</b><span>Points lost</span></div>
          <div className="r365-kpi"><div className="r365-kpi-icon">▥</div><b>{stats.avgPoints}</b><span>Avg points/game</span></div>
          <div className="r365-kpi"><div className="r365-kpi-icon">🔥</div><b>{stats.currentStreak}</b><span>Current streak</span></div>
        </section>

        <div className="r365-grid">
          <section className="r365-card">
            <div className="r365-card-head"><div><h2>Performance Overview</h2><span className="r365-muted">Recorded match performance</span></div></div>
            <div className="r365-profile-bars">
              {[["Win rate", stats.winRate], ["Point control", Math.max(0, Math.min(100, Math.round(50 + stats.pointDiff / Math.max(1, stats.played * 2) * 50)))], ["Scoring", stats.gamesWon + stats.gamesLost ? Math.round(stats.gamesWon / (stats.gamesWon + stats.gamesLost) * 100) : 0], ["Streak strength", Math.min(100, stats.bestStreak * 12)]].map(([label, value]) => <div className="r365-profile-bar" key={label as string}><div><span>{label}</span><b>{value}%</b></div><i><em style={{ width: `${value}%` }} /></i></div>)}
            </div>
          </section>

          <section className="r365-card">
            <div className="r365-card-head"><h2>Best Duo Partners</h2><span className="r365-muted">Recorded matches</span></div>
            {partnerRows.length === 0 ? <div className="r365-empty">No doubles partner data available yet.</div> : <div className="r365-list">{partnerRows.map(partner => <div className="r365-list-row" key={partner.id}><div className="r365-list-avatar">{partner.name.slice(0, 1)}</div><div className="r365-list-copy"><b>{partner.name}</b><span>{partner.matches} matches · {partner.wins} wins</span></div><strong>{partner.winRate}%</strong></div>)}</div>}
          </section>

          <section className="r365-card r365-card-wide">
            <div className="r365-card-head"><div><h2>Match History</h2><span className="r365-muted">Latest recorded matches</span></div></div>
            {playerMatches.length === 0 ? <div className="r365-empty">No recorded matches for this player yet.</div> : <div className="r365-match-history">{playerMatches.slice(0, 20).map(match => { const side = match.match_players.find(x => x.player_id === playerId)?.team; const own = side === "A" ? match.team_a_score : match.team_b_score; const opp = side === "A" ? match.team_b_score : match.team_a_score; const won = own > opp; const opponents = match.match_players.filter(x => x.team !== side).map(x => nameMap.get(x.player_id) || "Opponent").join(" / "); return <div className="r365-match-row" key={match.id}><div className={`r365-match-result ${won ? "win" : "loss"}`}>{won ? "W" : "L"}</div><div className="r365-match-main"><b>vs {opponents || "Opponent"}</b><span>{formatDate(match.played_at)}</span></div><strong>{own} – {opp}</strong></div>; })}</div>}
          </section>
        </div>
      </div>
    </main>
  );
}
