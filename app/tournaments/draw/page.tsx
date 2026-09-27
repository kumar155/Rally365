"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { shuffle, knockoutSize, knockoutRoundName, knockoutRoundType } from "../../../lib/tournament";
import s from "../tournament.module.css";
import ds from "./draw.module.css";

type D = { id: string; name: string };
type T = { id: string; name: string; format: string; rounds: number | null; group_count: number | null; qualifiers_per_group: number | null };
type R = { id: string; round_number: number; name: string; round_type: string };
type M = { id: string; round_id: string; group_id: string | null; match_number: number; team_a_duo_id: string | null; team_b_duo_id: string | null; team_a_score: number | null; team_b_score: number | null; status: string };
type G = { id: string; name: string; group_number: number; qualifying_teams: number | null };
type GD = { group_id: string; duo_id: string; seed: number | null };

function initials(name: string) {
  return name.split(/\s*&\s*|\s*\+\s*/).map((x) => x.trim()[0] || "").join("").slice(0, 2).toUpperCase();
}

export default function Draw() {
  const [id, setId] = useState("");
  const [t, setT] = useState<T | null>(null);
  const [duos, setDuos] = useState<D[]>([]);
  const [rounds, setRounds] = useState<R[]>([]);
  const [matches, setMatches] = useState<M[]>([]);
  const [groups, setGroups] = useState<G[]>([]);
  const [groupDuos, setGroupDuos] = useState<GD[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [selectedRound, setSelectedRound] = useState(0);
  const [selectedGroupId, setSelectedGroupId] = useState("ALL");

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id") || "");
  }, []);

  async function load() {
    if (!id) return;
    setError("");

    const [{ data: tournament, error: te }, { data: teams, error: de }, { data: r, error: re }, { data: m, error: me }, { data: g, error: ge }] = await Promise.all([
      supabase.from("tournaments").select("id,name,format,rounds,group_count,qualifiers_per_group").eq("id", id).single(),
      supabase.from("tournament_duos").select("id,name").eq("tournament_id", id).eq("status", "ACTIVE").order("created_at"),
      supabase.from("tournament_rounds").select("id,round_number,name,round_type").eq("tournament_id", id).order("round_number"),
      supabase.from("tournament_matches").select("id,round_id,group_id,match_number,team_a_duo_id,team_b_duo_id,team_a_score,team_b_score,status").eq("tournament_id", id).order("match_number"),
      supabase.from("tournament_groups").select("id,name,group_number,qualifying_teams").eq("tournament_id", id).order("group_number"),
    ]);

    const e = te || de || re || me || ge;
    if (e) { setError(e.message); return; }

    const loadedGroups = (g || []) as G[];
    let loadedGroupDuos: GD[] = [];
    if (loadedGroups.length) {
      const { data, error: gde } = await supabase.from("tournament_group_duos").select("group_id,duo_id,seed").in("group_id", loadedGroups.map((x) => x.id));
      if (gde) { setError(gde.message); return; }
      loadedGroupDuos = (data || []) as GD[];
    }

    setT(tournament);
    setDuos((teams || []) as D[]);
    setRounds((r || []) as R[]);
    setMatches((m || []) as M[]);
    setGroups(loadedGroups);
    setGroupDuos(loadedGroupDuos);
    if ((r || []).length) setSelectedRound((current) => current || (r || [])[0].round_number);
    if (loadedGroups.length && selectedGroupId !== "ALL" && !loadedGroups.some((x) => x.id === selectedGroupId)) setSelectedGroupId("ALL");
  }

  useEffect(() => { load(); }, [id]);

  async function reset() {
    const { error: me } = await supabase.from("tournament_matches").delete().eq("tournament_id", id);
    if (me) throw me;
    const { data: existingGroups, error: ge } = await supabase.from("tournament_groups").select("id").eq("tournament_id", id);
    if (ge) throw ge;
    if (existingGroups?.length) {
      const { error } = await supabase.from("tournament_group_duos").delete().in("group_id", existingGroups.map((g) => g.id));
      if (error) throw error;
    }
    const { error: gde } = await supabase.from("tournament_groups").delete().eq("tournament_id", id);
    if (gde) throw gde;
    const { error: re } = await supabase.from("tournament_rounds").delete().eq("tournament_id", id);
    if (re) throw re;
  }

  async function addMatch(v: Record<string, unknown>) {
    const { error } = await supabase.from("tournament_matches").insert(v);
    if (error) throw error;
  }

  async function generate() {
    if (!t) return;
    if (matches.length > 0) {
      setError("Draw is locked because matches have already been scheduled. Complete the existing matches before continuing the tournament.");
      return;
    }
    if (duos.length < 2) { setError("Create at least two partner teams first."); return; }
    setBusy(true); setError(""); setDone("");
    try {
      // Re-check the database immediately before destructive regeneration. This prevents
      // a stale page from regenerating a draw after another screen has already scheduled it.
      const { count, error: ce } = await supabase
        .from("tournament_matches")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", id);
      if (ce) throw ce;
      if ((count || 0) > 0) {
        setError("Draw is locked because matches have already been scheduled.");
        await load();
        return;
      }

      await reset();
      let no = 1;

      if (t.format === "ROUND_ROBIN") {
        const { data: r, error } = await supabase.from("tournament_rounds").insert({ tournament_id: id, round_number: 1, name: "Round Robin", round_type: "GROUP" }).select("id").single();
        if (error) throw error;
        for (let i = 0; i < duos.length; i++) for (let j = i + 1; j < duos.length; j++) await addMatch({ tournament_id: id, round_id: r.id, match_number: no++, team_a_duo_id: duos[i].id, team_b_duo_id: duos[j].id, best_of: 1, status: "SCHEDULED" });
      } else if (t.format === "KNOCKOUT") {
        const size = knockoutSize(duos.length); const count = Math.log2(size); const ids: string[] = [];
        for (let r = 1; r <= count; r++) {
          const roundSize = size / 2 ** (r - 1);
          const { data, error } = await supabase.from("tournament_rounds").insert({ tournament_id: id, round_number: r, name: knockoutRoundName(roundSize), round_type: knockoutRoundType(roundSize) }).select("id").single();
          if (error) throw error; ids.push(data.id);
        }
        const seeded = [...duos] as D[]; while (seeded.length < size) seeded.push({ id: "", name: "BYE" });
        for (let i = 0; i < size; i += 2) {
          const a = seeded[i].id || null; const b = seeded[i + 1].id || null;
          await addMatch({ tournament_id: id, round_id: ids[0], match_number: no++, team_a_duo_id: a, team_b_duo_id: b, best_of: 3, status: a && b ? "SCHEDULED" : "COMPLETED", winner_duo_id: a && !b ? a : !a && b ? b : null });
        }
        for (let r = 1; r < count; r++) {
          const mc = size / 2 ** (r + 1);
          for (let i = 0; i < mc; i++) await addMatch({ tournament_id: id, round_id: ids[r], match_number: no++, team_a_duo_id: null, team_b_duo_id: null, best_of: 3, status: "SCHEDULED" });
        }
      } else if (t.format === "GROUPS_KNOCKOUT") {
        const gc = Math.max(1, t.group_count || 2);
        const { data: round, error: re } = await supabase.from("tournament_rounds").insert({ tournament_id: id, round_number: 1, name: "Group Stage", round_type: "GROUP" }).select("id").single();
        if (re) throw re;
        const createdGroups: { id: string; group_number: number }[] = [];
        for (let i = 0; i < gc; i++) {
          const { data, error } = await supabase.from("tournament_groups").insert({ tournament_id: id, name: `Group ${String.fromCharCode(65 + i)}`, group_number: i + 1, qualifying_teams: t.qualifiers_per_group || 1 }).select("id,group_number").single();
          if (error) throw error; createdGroups.push(data);
        }
        const shuffled = shuffle(duos);
        for (let i = 0; i < shuffled.length; i++) {
          const group = createdGroups[i % createdGroups.length];
          const { error } = await supabase.from("tournament_group_duos").insert({ group_id: group.id, duo_id: shuffled[i].id, seed: i + 1 });
          if (error) throw error;
        }
        for (const group of createdGroups) {
          const members = shuffled.filter((_, i) => createdGroups[i % createdGroups.length].id === group.id);
          for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) await addMatch({ tournament_id: id, round_id: round.id, group_id: group.id, match_number: no++, team_a_duo_id: members[i].id, team_b_duo_id: members[j].id, best_of: 1, status: "SCHEDULED" });
        }
      } else {
        const count = Math.max(1, t.rounds || 5);
        for (let rn = 1; rn <= count; rn++) {
          const { data: round, error } = await supabase.from("tournament_rounds").insert({ tournament_id: id, round_number: rn, name: `Random Round ${rn}`, round_type: "RANDOM" }).select("id").single();
          if (error) throw error;
          const shuffled = shuffle(duos);
          for (let i = 0; i + 1 < shuffled.length; i += 2) await addMatch({ tournament_id: id, round_id: round.id, match_number: no++, team_a_duo_id: shuffled[i].id, team_b_duo_id: shuffled[i + 1].id, best_of: 1, status: "SCHEDULED" });
        }
      }

      const { error: se } = await supabase.from("tournaments").update({ status: "READY" }).eq("id", id);
      if (se) throw se;
      setSelectedGroupId("ALL"); setDone("Draw generated successfully."); await load();
    } catch (e: any) { setError(e?.message || "Could not generate draw"); }
    finally { setBusy(false); }
  }

  const names = new Map(duos.map((d) => [d.id, d.name]));
  const path = (p: string) => `/tournaments/${p}?id=${encodeURIComponent(id)}`;
  const activeRound = rounds.find((r) => r.round_number === selectedRound) || rounds[0];
  const activeMatches = useMemo(() => activeRound ? matches.filter((m) => m.round_id === activeRound.id) : [], [activeRound, matches]);
  const groupDuoMap = useMemo(() => new Map(groupDuos.map((row) => [row.duo_id, row.group_id])), [groupDuos]);
  const matchesForGroup = (groupId: string) => activeMatches.filter((m) => m.group_id ? m.group_id === groupId : groupDuoMap.get(m.team_a_duo_id || "") === groupId && groupDuoMap.get(m.team_b_duo_id || "") === groupId);
  const duoParts = (name: string) => name.split(/\s*&\s*|\s*\+\s*/).map((x) => x.trim()).filter(Boolean).slice(0, 2);
  const prefixForRound = (name: string) => /quarter/i.test(name) ? "QF" : /semi/i.test(name) ? "SF" : /final/i.test(name) ? "F" : "Match";
  const visibleGroups = selectedGroupId === "ALL" ? groups : groups.filter((group) => group.id === selectedGroupId);
  const drawLocked = matches.length > 0;

  if (!id) return <main className={s.page}><div className={s.shell}><div className={s.card}>Tournament ID is missing.</div></div></main>;

  return (
    <main className={s.page}>
      <div className={ds.drawShell}>
        <div className={ds.mobileHeader}><Link href={path("manage")} className={ds.back}>‹</Link><strong>{t?.name || "Rally365 Open"}</strong><span className={ds.menu}>⋮</span></div>
        <div className={ds.drawTop}><div><div className={s.brand}>RALLY365 OPEN</div><h1 className={ds.drawTitle}>Draw</h1><p className={s.sub}>{t?.name || "Tournament"}</p></div><Link href={path("manage")} className={s.secondaryButton}>Overview</Link></div>

        <nav className={s.tabs}>
          <Link className={s.tab} href={path("manage")}>Overview</Link><Link className={`${s.tab} ${s.tabActive}`} href={path("draw")}>Draw</Link><Link className={s.tab} href={path("matches")}>Matches</Link><Link className={s.tab} href={path("standings")}>Standings</Link><Link className={s.tab} href={path("players")}>Players</Link>
        </nav>

        {error && <div className={s.error}>{error}</div>}{done && <div className={s.success}>{done}</div>}

        <div className={ds.drawRoundTabs}>
          {rounds.map((r) => <button type="button" key={r.id} className={`${ds.drawRoundTab} ${r.round_number === activeRound?.round_number ? ds.drawRoundTabActive : ""}`} onClick={() => setSelectedRound(r.round_number)}>{r.name}</button>)}
        </div>

        {activeRound?.round_type === "GROUP" && groups.length > 0 && (
          <div className={ds.groupTabs} role="tablist" aria-label="Tournament groups">
            <button type="button" className={`${ds.groupTab} ${selectedGroupId === "ALL" ? ds.groupTabActive : ""}`} onClick={() => setSelectedGroupId("ALL")}>All groups</button>
            {groups.map((group) => <button type="button" key={group.id} className={`${ds.groupTab} ${selectedGroupId === group.id ? ds.groupTabActive : ""}`} onClick={() => setSelectedGroupId(group.id)}>{group.name}</button>)}
          </div>
        )}

        {matches.length > 0 && activeRound ? (
          activeRound.round_type === "GROUP" && groups.length > 0 ? (
            <section className={ds.bracketStage}>
              <div className={ds.bracketHeading}><div><span className={s.eyebrow}>ROUND {activeRound.round_number}</span><h2>{activeRound.name}</h2></div><span>{activeMatches.length} matches</span></div>
              <div className={ds.groupsGrid}>
                {visibleGroups.map((group) => {
                  const members = groupDuos.filter((x) => x.group_id === group.id).sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999));
                  const groupMatches = matchesForGroup(group.id);
                  return <section className={ds.groupCard} key={group.id}>
                    <div className={ds.groupCardHeader}><div><span className={s.eyebrow}>GROUP {String.fromCharCode(64 + group.group_number)}</span><h3>{group.name}</h3></div><span>{members.length} teams</span></div>
                    <div className={ds.groupTeams}>{members.map((member) => { const name = names.get(member.duo_id) || "TBD"; return <div className={ds.groupTeam} key={member.duo_id}><span className={ds.groupTeamIdentity}><span className={ds.miniAvatar}>{initials(name)}</span><span>{name}</span></span><span className={ds.groupSeed}>#{member.seed ?? "-"}</span></div>; })}</div>
                    <div className={ds.groupMatchesHeader}><span>Match schedule</span><span>{groupMatches.length} matches</span></div>
                    <div className={ds.groupMatches}>{groupMatches.map((m) => { const a = names.get(m.team_a_duo_id || "") || "TBD"; const b = names.get(m.team_b_duo_id || "") || "TBD"; return <Link key={m.id} href={`/tournaments/match?id=${m.id}`} className={ds.groupMatch}><div className={ds.groupMatchMeta}><span>Match {m.match_number}</span><span>{m.status === "COMPLETED" ? "Completed" : "Scheduled"}</span></div><div className={ds.groupMatchTeam}><span>{a}</span><strong>{m.team_a_score ?? "-"}</strong></div><div className={ds.groupMatchTeam}><span>{b}</span><strong>{m.team_b_score ?? "-"}</strong></div></Link>; })}</div>
                  </section>;
                })}
              </div>
            </section>
          ) : (
            <section className={ds.bracketStage}>
              <div className={ds.bracketHeading}><div><span className={s.eyebrow}>ROUND {activeRound.round_number}</span><h2>{activeRound.name}</h2></div><span>{activeMatches.length} matches</span></div>
              <div className={ds.bracketGrid}>{activeMatches.map((m) => { const a = names.get(m.team_a_duo_id || "") || "TBD"; const b = names.get(m.team_b_duo_id || "") || "TBD"; const ap = duoParts(a); const bp = duoParts(b); const prefix = prefixForRound(activeRound.name); return <Link key={m.id} href={`/tournaments/match?id=${m.id}`} className={ds.drawMatch}><div className={ds.drawMatchMeta}><span>{prefix} {m.match_number}</span><span>Court TBD</span></div><div className={`${ds.drawTeam} ${ds.drawTeamA}`}><span className={ds.drawTeamPeople}><span className={ds.miniAvatars}>{ap.map((p, i) => <span key={i} className={ds.miniAvatar}>{p[0]}</span>)}</span><span>{a}</span></span><span className={ds.drawScore}>{m.team_a_score ?? "-"}</span></div><div className={`${ds.drawTeam} ${ds.drawTeamB}`}><span className={ds.drawTeamPeople}><span className={ds.miniAvatars}>{bp.map((p, i) => <span key={i} className={ds.miniAvatar}>{p[0]}</span>)}</span><span>{b}</span></span><span className={ds.drawScore}>{m.team_b_score ?? "-"}</span></div></Link>; })}</div>
            </section>
          )
        ) : <section className={s.card}><h2>No draw yet</h2><p className={s.sub}>Generate the draw after partners are ready.</p></section>}

        <section className={ds.drawActions}>
          {drawLocked ? (
            <div className={`${s.button} ${s.secondary}`} aria-disabled="true" title="Draw regeneration is locked once matches are scheduled">
              Draw locked · matches scheduled
            </div>
          ) : (
            <button className={s.button} onClick={generate} disabled={busy}>{busy ? "Generating…" : "Generate draw"}</button>
          )}
          <Link href={path("schedule")} className={`${s.button} ${s.secondary}`}>View schedule →</Link>
        </section>
      </div>
    </main>
  );
}
