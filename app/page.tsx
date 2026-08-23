 "use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronRight, CircleUserRound, History, Plus, Trophy, Users, X } from "lucide-react";
import { supabase } from "../lib/supabase";

type Player = { id: string; name: string };
type Match = {
  id: string;
  group_id: string;
  team_a_score: number;
  team_b_score: number;
  played_at: string;
  match_players: { player_id: string; team: "A" | "B" }[];
};

const GROUP_CODE = "RALLY365";

function formatTeam(ids: string[], players: Player[]) {
  const map = new Map(players.map(p => [p.id, p.name]));
  return ids.map(id => map.get(id) ?? "?").join(" + ");
}

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [tab, setTab] = useState<"today" | "stats" | "players">("today");
  const [showNewMatch, setShowNewMatch] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setError("");
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .select("id,name,join_code")
      .eq("join_code", GROUP_CODE)
      .single();

    if (groupError || !group) {
      setError(groupError?.message ?? "Rally365 group not found.");
      setLoading(false);
      return;
    }

    setGroupId(group.id);

    const [playersResult, matchesResult] = await Promise.all([
      supabase.from("players").select("id,name").eq("group_id", group.id).order("name"),
      supabase
        .from("matches")
        .select("id,group_id,team_a_score,team_b_score,played_at,match_players(player_id,team)")
        .eq("group_id", group.id)
        .order("played_at", { ascending: false }),
    ]);

    if (playersResult.error) setError(playersResult.error.message);
    else setPlayers(playersResult.data ?? []);

    if (matchesResult.error) setError(matchesResult.error.message);
    else setMatches((matchesResult.data ?? []) as Match[]);

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!groupId) return;

    const channel = supabase
      .channel(`rally365-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `group_id=eq.${groupId}` }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_players" }, loadData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [groupId, loadData]);

  const stats = useMemo(() => {
    return players.map(player => {
      const played = matches.filter(m => m.match_players.some(mp => mp.player_id === player.id));
      let wins = 0;
      let pointsFor = 0;
      let pointsAgainst = 0;

      for (const m of played) {
        const team = m.match_players.find(mp => mp.player_id === player.id)?.team;
        const own = team === "A" ? m.team_a_score : m.team_b_score;
        const opp = team === "A" ? m.team_b_score : m.team_a_score;
        pointsFor += own;
        pointsAgainst += opp;
        if (own > opp) wins++;
      }

      return {
        ...player,
        played: played.length,
        wins,
        losses: played.length - wins,
        winRate: played.length ? Math.round((wins / played.length) * 100) : 0,
        points: wins,
        diff: pointsFor - pointsAgainst,
      };
    }).sort((a, b) => b.points - a.points || b.winRate - a.winRate || b.diff - a.diff);
  }, [players, matches]);

  const togglePlayer = (id: string) => {
    setSelected(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const saveMatch = async () => {
    if (!groupId || selected.length !== 4) return;
    const a = selected.slice(0, 2);
    const b = selected.slice(2, 4);
    const sa = Number(scoreA);
    const sb = Number(scoreB);

    if (!Number.isInteger(sa) || !Number.isInteger(sb) || sa < 0 || sb < 0 || sa === sb) {
      setError("Enter two different non-negative final scores.");
      return;
    }

    setSaving(true);
    setError("");

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .insert({
        group_id: groupId,
        team_a_score: sa,
        team_b_score: sb,
      })
      .select("id")
      .single();

    if (matchError || !match) {
      setError(matchError?.message ?? "Could not save match.");
      setSaving(false);
      return;
    }

    const rows = [
      ...a.map(player_id => ({ match_id: match.id, player_id, team: "A" as const })),
      ...b.map(player_id => ({ match_id: match.id, player_id, team: "B" as const })),
    ];

    const { error: playersError } = await supabase.from("match_players").insert(rows);

    if (playersError) {
      await supabase.from("matches").delete().eq("id", match.id);
      setError(playersError.message);
      setSaving(false);
      return;
    }

    setSelected([]);
    setScoreA("");
    setScoreB("");
    setShowNewMatch(false);
    setSaving(false);
    await loadData();
  };

  const teamIds = (m: Match, team: "A" | "B") =>
    m.match_players.filter(mp => mp.team === team).map(mp => mp.player_id);

  if (loading) return <main className="center">Loading Rally365…</main>;

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
        {error && <div className="error-banner">{error}</div>}

        {tab === "today" && (
          <>
            <div className="hero-card">
              <div>
                <div className="eyebrow">RALLY365 COURT</div>
                <h1>Today&apos;s games</h1>
                <p>{players.length} players · {matches.length} matches recorded</p>
              </div>
              <Trophy size={42} strokeWidth={1.5}/>
            </div>

            <button className="primary-button" onClick={() => setShowNewMatch(true)}>
              <Plus size={21}/> New match
            </button>

            <div className="section-title"><span>Match history</span><span>{matches.length}</span></div>

            <div className="match-list">
              {matches.length === 0 && <div className="empty-card">No matches yet. Create the first match.</div>}
              {matches.map((m, index) => {
                const a = teamIds(m, "A");
                const b = teamIds(m, "B");
                return (
                  <div className="match-card" key={m.id}>
                    <div className="match-number">M{matches.length - index}</div>
                    <div className="teams">
                      <div><strong>{formatTeam(a, players)}</strong><span className={m.team_a_score > m.team_b_score ? "win" : ""}>{m.team_a_score}</span></div>
                      <div><strong>{formatTeam(b, players)}</strong><span className={m.team_b_score > m.team_a_score ? "win" : ""}>{m.team_b_score}</span></div>
                    </div>
                    <ChevronRight size={18} className="muted"/>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "stats" && (
          <>
            <div className="page-heading">
              <div className="eyebrow">ALL RECORDED MATCHES</div>
              <h1>Leaderboard</h1>
              <p>Calculated directly from Supabase match history.</p>
            </div>
            <div className="stats-table">
              <div className="table-head"><span>#</span><span>PLAYER</span><span>P</span><span>W</span><span>L</span><span>WIN%</span></div>
              {stats.map((s, i) => (
                <div className="table-row" key={s.id}>
                  <span className="rank">{i + 1}</span><span className="player-name"><b>{s.name}</b></span>
                  <span>{s.played}</span><span>{s.wins}</span><span>{s.losses}</span><span>{s.winRate}%</span>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "players" && (
          <>
            <div className="page-heading">
              <div className="eyebrow">GROUP</div>
              <h1>Players</h1>
              <p>Rally365 Court · {players.length} players</p>
            </div>
            <div className="player-grid">
              {players.map(p => {
                const s = stats.find(x => x.id === p.id)!;
                return <div className="player-card" key={p.id}>
                  <div className="avatar">{p.name.slice(0,1)}</div>
                  <div><b>{p.name}</b><small>{s.wins}W · {s.losses}L · {s.winRate}%</small></div>
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
              <b>{formatTeam(selected.slice(0,2), players) || "—"}</b><span>vs</span><b>{formatTeam(selected.slice(2,4), players) || "—"}</b>
            </div>
            <div className="score-inputs">
              <input inputMode="numeric" placeholder="Team A" value={scoreA} onChange={e => setScoreA(e.target.value)}/>
              <span>:</span>
              <input inputMode="numeric" placeholder="Team B" value={scoreB} onChange={e => setScoreB(e.target.value)}/>
            </div>
            <button className="primary-button" disabled={saving || selected.length !== 4 || !scoreA || !scoreB || scoreA === scoreB} onClick={saveMatch}>
              {saving ? "Saving…" : "Save match"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}