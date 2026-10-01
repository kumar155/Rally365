"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import s from "../tournament.module.css";

type Duo = { id: string; name: string };
type Match = { id: string; round_id: string; match_number: number; team_a_duo_id: string | null; team_b_duo_id: string | null; team_a_score: number | null; team_b_score: number | null; status: string; group_id?: string | null };
type Group = { id: string; name: string; group_number: number; qualifying_teams: number };
type GroupDuo = { group_id: string; duo_id: string };
type Round = { id: string; round_number: number; name: string; round_type: string };
type Row = Duo & { played: number; wins: number; losses: number; gf: number; ga: number; points: number };

function initials(name: string) { return name.split("+").map((part) => part.trim()[0] || "").join("").slice(0, 2).toUpperCase(); }
function calculateRows(duos: Duo[], matches: Match[], allowedIds?: Set<string>) {
  const map = new Map<string, Row>();
  for (const duo of duos) if (!allowedIds || allowedIds.has(duo.id)) map.set(duo.id, { ...duo, played: 0, wins: 0, losses: 0, gf: 0, ga: 0, points: 0 });
  for (const x of matches) {
    if (x.status !== "COMPLETED" && x.status !== "WALKOVER") continue;
    const a = x.team_a_duo_id ? map.get(x.team_a_duo_id) : null, b = x.team_b_duo_id ? map.get(x.team_b_duo_id) : null;
    if (!a || !b) continue;
    const sa = Number(x.team_a_score ?? 0), sb = Number(x.team_b_score ?? 0);
    a.played++; b.played++; a.gf += sa; a.ga += sb; b.gf += sb; b.ga += sa;
    if (sa > sb) { a.wins++; a.points++; b.losses++; } else if (sb > sa) { b.wins++; b.points++; a.losses++; }
  }
  return [...map.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.name.localeCompare(b.name));
}

function StandingsTable({ rows }: { rows: Row[] }) {
  return <div className={s.standingTable}>
    <div className={s.standingHead}><span>#</span><span>Team</span><span>P</span><span>W</span><span>L</span><span>Pts</span></div>
    {rows.map((r, i) => <div className={`${s.standingRow} ${i === 0 ? s.standingLeader : ""}`} key={r.id}><span className={s.rank}>{i + 1}</span><div className={s.standingTeam}><div className={s.duoAvatar}>{initials(r.name)}</div><div><span className={s.teamName}>{r.name}</span><small>{r.played} played · {r.wins} won · {r.losses} lost</small></div></div><span>{r.played}</span><span>{r.wins}</span><span>{r.losses}</span><span className={s.points}>{r.points}</span></div>)}
    {!rows.length && <p className={s.sub} style={{ padding: 12 }}>No teams available.</p>}
  </div>;
}

export default function Standings() {
  const [id, setId] = useState("");
  const [duos, setDuos] = useState<Duo[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupRows, setGroupRows] = useState<Record<string, Row[]>>({});
  const [rounds, setRounds] = useState<Round[]>([]);
  const [view, setView] = useState<"groups" | "final">("groups");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedRound, setSelectedRound] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => setId(new URLSearchParams(window.location.search).get("id") || ""), []);
  useEffect(() => {
    if (!id) return;
    (async () => {
      const [duoResult, matchResult, groupResult, roundResult] = await Promise.all([
        supabase.from("tournament_duos").select("id,name").eq("tournament_id", id).order("created_at"),
        supabase.from("tournament_matches").select("id,round_id,match_number,team_a_duo_id,team_b_duo_id,team_a_score,team_b_score,status,group_id").eq("tournament_id", id).order("match_number"),
        supabase.from("tournament_groups").select("id,name,group_number,qualifying_teams").eq("tournament_id", id).order("group_number"),
        supabase.from("tournament_rounds").select("id,round_number,name,round_type").eq("tournament_id", id).order("round_number")
      ]);
      if (duoResult.error || matchResult.error || groupResult.error || roundResult.error) { setError(duoResult.error?.message || matchResult.error?.message || groupResult.error?.message || roundResult.error?.message || "Could not load standings"); return; }
      const loadedDuos = (duoResult.data || []) as Duo[], loadedMatches = (matchResult.data || []) as Match[], loadedGroups = (groupResult.data || []) as Group[], loadedRounds = (roundResult.data || []) as Round[];
      setDuos(loadedDuos); setMatches(loadedMatches); setGroups(loadedGroups); setRounds(loadedRounds);
      if (loadedGroups.length && !selectedGroup) setSelectedGroup(loadedGroups[0].id);
      const finals = loadedRounds.filter((r) => r.round_type !== "GROUP");
      if (finals.length && !selectedRound) setSelectedRound(finals[0].round_number);
      if (loadedGroups.length) {
        const { data: memberships, error: membershipError } = await supabase.from("tournament_group_duos").select("group_id,duo_id").in("group_id", loadedGroups.map((g) => g.id));
        if (membershipError) { setError(membershipError.message); return; }
        const next: Record<string, Row[]> = {};
        for (const group of loadedGroups) {
          const ids = new Set(((memberships || []) as GroupDuo[]).filter((x) => x.group_id === group.id).map((x) => x.duo_id));
          next[group.id] = calculateRows(loadedDuos, loadedMatches.filter((m) => m.group_id === group.id), ids);
        }
        setGroupRows(next);
      }
    })();
  }, [id]);

  const path = (p: string) => `/tournaments/${p}?id=${encodeURIComponent(id)}`;
  const finalRounds = rounds.filter((r) => r.round_type !== "GROUP").sort((a, b) => a.round_number - b.round_number);
  const activeFinalRound = finalRounds.find((r) => r.round_number === selectedRound) || finalRounds[0];
  const selectedGroupData = groups.find((g) => g.id === selectedGroup);
  const selectedGroupMatches = matches.filter((m) => m.group_id === selectedGroup);
  const finalMatches = activeFinalRound ? matches.filter((m) => m.round_id === activeFinalRound.id).sort((a, b) => a.match_number - b.match_number) : [];
  const names = new Map(duos.map((d) => [d.id, d.name]));
  const duoParts = (name: string) => name.split(/\s*&\s*/).map((x) => x.trim()).filter(Boolean).slice(0, 2);
  const matchCard = (m: Match, roundName: string) => {
    const a = names.get(m.team_a_duo_id || "") || "TBD", b = names.get(m.team_b_duo_id || "") || "TBD", ap = duoParts(a), bp = duoParts(b);
    const prefix = /quarter/i.test(roundName) ? "QF" : /semi/i.test(roundName) ? "SF" : /final/i.test(roundName) ? "F" : "Match";
    return <Link key={m.id} href={`/tournaments/match?id=${m.id}`} className={s.matchTile}><div className={s.matchTileTop}><span>{prefix} {m.match_number}</span><span>{m.status === "COMPLETED" || m.status === "WALKOVER" ? "Completed" : "Scheduled"}</span></div><div className={s.teamLine}><span className={s.teamIdentity}><span className={s.avatar}>{ap.map((x) => x[0]).join("")}</span><span className={s.teamName}>{a}</span></span><strong className={s.teamScore}>{m.team_a_score ?? 0}</strong></div><div className={s.teamLine}><span className={s.teamIdentity}><span className={s.avatar}>{bp.map((x) => x[0]).join("")}</span><span className={s.teamName}>{b}</span></span><strong className={s.teamScore}>{m.team_b_score ?? 0}</strong></div></Link>;
  };

  if (!id) return <main className={s.page}><div className={s.shell}><div className={s.card}>Tournament ID is missing.</div></div></main>;
  return <main className={s.page}><div className={s.shell}>
    <div className={s.mobileTournamentHeader}><Link href={path("manage")} className={s.iconBack}>‹</Link><strong>Rally365 Open</strong><span className={s.menuDots}>⋮</span></div>
    <div className={s.top}><div><div className={s.brand}>RALLY365 OPEN</div><h1 className={s.title}>Standings</h1><p className={s.sub}>Live ranking from completed tournament matches.</p></div><Link href={path("manage")} className={s.secondaryButton}>← Overview</Link></div>
    <nav className={s.tabs}><Link className={s.tab} href={path("manage")}>Overview</Link><Link className={s.tab} href={path("draw")}>Draw</Link><Link className={s.tab} href={path("matches")}>Matches</Link><Link className={`${s.tab} ${s.tabActive}`} href={path("standings")}>Standings</Link><Link className={s.tab} href={path("players")}>Players</Link></nav>
    {error && <div className={s.error}>{error}</div>}
    <section className={s.leaderboardCard}>
      <div className={s.leaderboardHeader}><div><div className={s.eyebrow}>STANDINGS</div><h2>Tournament table</h2><p>{view === "groups" ? "Group standings and qualification positions" : "Final-round match distribution and results"}</p></div><span className={s.teamCount}>{duos.length} teams</span></div>
      <div className={s.standingSwitch}><button type="button" className={`${s.switchButton} ${view === "groups" ? s.switchActive : ""}`} onClick={() => setView("groups")}>Group Stage</button><button type="button" className={`${s.switchButton} ${view === "final" ? s.switchActive : ""}`} onClick={() => setView("final")} disabled={!finalRounds.length}>Next stages</button></div>
      {view === "groups" ? <>
        {groups.length > 0 && <div className={s.grid2} style={{ marginBottom: 14 }}>{groups.map((g) => { const active = g.id === selectedGroup; return <button key={g.id} type="button" className={s.item} style={{ textAlign: "left", cursor: "pointer", borderColor: active ? "#078b5c" : undefined, background: active ? "#f1faf6" : "#fff" }} onClick={() => setSelectedGroup(g.id)}><span><strong style={{ display: "block", fontSize: 12 }}>{g.name}</strong><small style={{ color: "#71857d", fontSize: 9 }}>{groupRows[g.id]?.length || 0} teams · {g.qualifying_teams} qualifier{g.qualifying_teams === 1 ? "" : "s"}</small></span><span style={{ color: "#078b5c", fontSize: 18 }}>›</span></button>; })}</div>}
        {selectedGroupData ? <><div className={s.sectionHeader}><div><div className={s.eyebrow}>{selectedGroupData.name}</div><h3>{selectedGroupData.qualifying_teams} qualifier{selectedGroupData.qualifying_teams === 1 ? "" : "s"}</h3></div><span>{selectedGroupMatches.length} matches</span></div><StandingsTable rows={groupRows[selectedGroup] || []} /></> : <StandingsTable rows={calculateRows(duos, matches)} />}
      </> : <>
        {finalRounds.length > 0 && <div className={s.tabs} style={{ borderBottom: 0, marginTop: 10 }}>{finalRounds.map((r) => <button key={r.id} type="button" className={`${s.tab} ${r.round_number === activeFinalRound?.round_number ? s.tabActive : ""}`} onClick={() => setSelectedRound(r.round_number)}>{r.name}</button>)}</div>}
        {activeFinalRound ? <><div className={s.sectionHeader}><div><div className={s.eyebrow}>FINAL</div><h3>{activeFinalRound.name}</h3></div><span>{finalMatches.length} matches</span></div><div className={s.grid2}>{finalMatches.map((m) => matchCard(m, activeFinalRound.name))}</div>{!finalMatches.length && <p className={s.sub}>No final matches have been created yet.</p>}</> : <p className={s.sub}>Final draw is not ready yet.</p>}
      </>}
    </section>
  </div></main>;
}
