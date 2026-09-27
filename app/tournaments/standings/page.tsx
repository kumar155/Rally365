"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import s from "../tournament.module.css";

type Duo = { id: string; name: string };
type Group = { id: string; name: string; group_number: number; qualifying_teams: number | null };
type GroupDuo = { group_id: string; duo_id: string; seed: number | null };
type Match = { group_id: string | null; team_a_duo_id: string | null; team_b_duo_id: string | null; team_a_score: number | null; team_b_score: number | null; status: string };
type Row = Duo & { played: number; wins: number; losses: number; gf: number; ga: number; points: number };
type Mode = "GROUP_KNOCKOUT" | "POINTS";

function initials(name: string) { return name.split(/\s*&\s*|\s*\+\s*/).map((part) => part.trim()[0] || "").join("").slice(0, 2).toUpperCase(); }

function buildRows(duos: Duo[], groupDuos: GroupDuo[], matches: Match[], groupId: string | null) {
  const memberIds = groupId ? new Set(groupDuos.filter((x) => x.group_id === groupId).map((x) => x.duo_id)) : null;
  const map = new Map<string, Row>();
  for (const duo of duos) if (!memberIds || memberIds.has(duo.id)) map.set(duo.id, { ...duo, played: 0, wins: 0, losses: 0, gf: 0, ga: 0, points: 0 });
  const duoGroup = new Map(groupDuos.map((x) => [x.duo_id, x.group_id]));
  for (const x of matches) {
    if (x.status !== "COMPLETED" && x.status !== "WALKOVER") continue;
    const aId = x.team_a_duo_id; const bId = x.team_b_duo_id;
    if (!aId || !bId) continue;
    const inferredGroup = x.group_id || (duoGroup.get(aId) === duoGroup.get(bId) ? duoGroup.get(aId) : null);
    if (groupId && inferredGroup !== groupId) continue;
    const a = map.get(aId); const b = map.get(bId);
    if (!a || !b) continue;
    const sa = Number(x.team_a_score ?? 0); const sb = Number(x.team_b_score ?? 0);
    a.played++; b.played++; a.gf += sa; a.ga += sb; b.gf += sb; b.ga += sa;
    if (sa > sb) { a.wins++; a.points += 1; b.losses++; } else if (sb > sa) { b.wins++; b.points += 1; a.losses++; }
  }
  return [...map.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
}

function Table({ rows, showRecord = true, groupNames }: { rows: Row[]; showRecord?: boolean; groupNames?: Map<string, string> }) {
  return <div className={s.standingTable}>
    <div className={s.standingHead}><span>#</span><span>Team</span>{showRecord && <><span>P</span><span>W</span><span>L</span></>}<span>Pts</span></div>
    {rows.map((r, i) => <div className={`${s.standingRow} ${i === 0 ? s.standingLeader : ""}`} key={r.id}>
      <span className={s.rank}>{i + 1}</span>
      <div className={s.standingTeam}><div className={s.duoAvatar} aria-hidden="true">{initials(r.name)}</div><div><strong>{r.name}</strong><small>{groupNames?.get(r.id) || (showRecord ? `${r.played} played · ${r.wins} won · ${r.losses} lost` : "Points ranking")}</small></div></div>
      {showRecord && <><span>{r.played}</span><span>{r.wins}</span><span>{r.losses}</span></>}
      <strong className={s.points}>{r.points}</strong>
    </div>)}
    {!rows.length && <p className={s.sub}>No teams yet.</p>}
  </div>;
}

export default function Standings() {
  const [id, setId] = useState(""); const [duos, setDuos] = useState<Duo[]>([]); const [groups, setGroups] = useState<Group[]>([]); const [groupDuos, setGroupDuos] = useState<GroupDuo[]>([]); const [matches, setMatches] = useState<Match[]>([]); const [format, setFormat] = useState(""); const [selectedGroupId, setSelectedGroupId] = useState("ALL"); const [mode, setMode] = useState<Mode>("GROUP_KNOCKOUT"); const [error, setError] = useState("");
  useEffect(() => { setId(new URLSearchParams(window.location.search).get("id") || ""); }, []);
  useEffect(() => {
    if (!id) return;
    (async () => {
      setError("");
      const [{ data: tournament, error: te }, { data: d, error: de }, { data: g, error: ge }, { data: m, error: me }] = await Promise.all([
        supabase.from("tournaments").select("format").eq("id", id).single(),
        supabase.from("tournament_duos").select("id,name").eq("tournament_id", id).order("created_at"),
        supabase.from("tournament_groups").select("id,name,group_number,qualifying_teams").eq("tournament_id", id).order("group_number"),
        supabase.from("tournament_matches").select("group_id,team_a_duo_id,team_b_duo_id,team_a_score,team_b_score,status").eq("tournament_id", id),
      ]);
      if (te || de || ge || me) { setError(te?.message || de?.message || ge?.message || me?.message || "Could not load standings"); return; }
      const loadedGroups = (g || []) as Group[];
      let loadedGroupDuos: GroupDuo[] = [];
      if (loadedGroups.length) {
        const { data, error: gde } = await supabase.from("tournament_group_duos").select("group_id,duo_id,seed").in("group_id", loadedGroups.map((x) => x.id));
        if (gde) { setError(gde.message); return; }
        loadedGroupDuos = (data || []) as GroupDuo[];
      }
      setFormat(tournament?.format || ""); setDuos((d || []) as Duo[]); setGroups(loadedGroups); setGroupDuos(loadedGroupDuos); setMatches((m || []) as Match[]); setSelectedGroupId("ALL");
      setMode("GROUP_KNOCKOUT");
    })();
  }, [id]);
  const path = (p: string) => `/tournaments/${p}?id=${encodeURIComponent(id)}`;
  const isGrouped = format === "GROUPS_KNOCKOUT" && groups.length > 0;
  const activeGroupId = selectedGroupId === "ALL" ? null : selectedGroupId;
  const rows = useMemo(() => buildRows(duos, groupDuos, matches, activeGroupId), [duos, groupDuos, matches, activeGroupId]);
  const allRows = useMemo(() => buildRows(duos, groupDuos, matches, null), [duos, groupDuos, matches]);
  const groupNames = useMemo(() => {
    const names = new Map(groups.map((g) => [g.id, g.name]));
    return new Map(groupDuos.map((gd) => [gd.duo_id, names.get(gd.group_id) || ""]));
  }, [groups, groupDuos]);
  const pointsRows = useMemo(() => [...allRows].sort((a, b) => b.points - a.points || b.wins - a.wins || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf), [allRows]);
  if (!id) return <main className={s.page}><div className={s.shell}><div className={s.card}>Tournament ID is missing.</div></div></main>;
  return <main className={s.page}><div className={s.shell}>
    <div className={s.mobileTournamentHeader}><Link href={path("manage")} className={s.iconBack} aria-label="Back">‹</Link><strong>Rally365 Open</strong><span className={s.menuDots}>⋮</span></div>
    <div className={s.top}><div><div className={s.brand}>RALLY365 OPEN</div><h1 className={s.title}>Standings</h1><p className={s.sub}>Live ranking from completed tournament matches.</p></div><Link href={path("manage")} className={s.secondaryButton}>← Overview</Link></div>
    <nav className={s.tabs}><Link className={s.tab} href={path("manage")}>Overview</Link><Link className={s.tab} href={path("draw")}>Draw</Link><Link className={s.tab} href={path("matches")}>Matches</Link><Link className={`${s.tab} ${s.tabActive}`} href={path("standings")}>Standings</Link><Link className={s.tab} href={path("players")}>Players</Link></nav>
    {error && <div className={s.error}>{error}</div>}
    <section className={s.leaderboardCard}>
      <div className={s.leaderboardHeader}><div><div className={s.eyebrow}>STANDINGS</div><h2>{mode === "POINTS" ? "Points table" : isGrouped && activeGroupId ? groups.find((g) => g.id === activeGroupId)?.name : isGrouped ? "Group standings" : "Tournament table"}</h2><p>{mode === "POINTS" ? "Overall ranking by points earned in completed matches" : isGrouped ? "Live ranking within the selected group" : "Live ranking from completed tournament matches"}</p></div><span className={s.teamCount}>{mode === "POINTS" ? pointsRows.length : rows.length} teams</span></div>
      <div className={s.standingSwitch}>
        <button type="button" aria-pressed={mode === "GROUP_KNOCKOUT"} className={`${s.switchButton} ${mode === "GROUP_KNOCKOUT" ? s.switchActive : ""}`} onClick={() => setMode("GROUP_KNOCKOUT")}>Group / Knockout</button>
        <button type="button" aria-pressed={mode === "POINTS"} className={`${s.switchButton} ${mode === "POINTS" ? s.switchActive : ""}`} onClick={() => setMode("POINTS")}>Points (if group)</button>
      </div>
      {mode === "POINTS" ? <Table rows={pointsRows} showRecord={false} groupNames={isGrouped ? groupNames : undefined} /> : isGrouped && <div className={s.filterTabs}><button type="button" className={`${s.filterTab} ${selectedGroupId === "ALL" ? s.filterActive : ""}`} onClick={() => setSelectedGroupId("ALL")}>All groups</button>{groups.map((group) => <button type="button" key={group.id} className={`${s.filterTab} ${selectedGroupId === group.id ? s.filterActive : ""}`} onClick={() => setSelectedGroupId(group.id)}>{group.name}</button>)}</div>}
      {mode === "GROUP_KNOCKOUT" && (isGrouped && selectedGroupId === "ALL" ? <div className={s.grid}>{groups.map((group) => { const groupRows = buildRows(duos, groupDuos, matches, group.id); return <section className={s.card} key={group.id}><div className={s.sectionHeader}><div><span className={s.eyebrow}>GROUP {String.fromCharCode(64 + group.group_number)}</span><h2>{group.name}</h2></div><span>{groupRows.length} teams</span></div><Table rows={groupRows} /></section>; })}</div> : <Table rows={rows} />)}
    </section>
  </div></main>;
}