"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Lock, Trash2, Plus, Pencil, Check } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { shuffle, knockoutSize, knockoutRoundName, knockoutRoundType } from "../../../lib/tournament";
import { syncTournamentProgression } from "../../../lib/tournamentProgression";
import s from "../tournament.module.css";
import ds from "./draw.module.css";

type D = { id: string; name: string };
type T = { id: string; name: string; format: string; rounds: number | null; group_count: number | null; qualifiers_per_group: number | null; is_locked: boolean };
type G = { id: string; name: string; group_number: number; qualifying_teams: number; qualification_confirmed: boolean };
type GD = { group_id: string; duo_id: string; qualified: boolean };
type R = { id: string; round_number: number; name: string; round_type: string; status?: string | null };
type M = { id: string; round_id: string; match_number: number; group_id: string | null; team_a_duo_id: string | null; team_b_duo_id: string | null; team_a_score: number | null; team_b_score: number | null; status: string; winner_duo_id?: string | null };
type Row = D & { played: number; wins: number; losses: number; points: number; diff: number };
type CustomPair = { a: string; b: string };
const CUSTOM_TBD = "__TBD__";
const completed = (status: string) => status === "COMPLETED" || status === "WALKOVER";

function standingsForGroup(duos: D[], memberships: GD[], matches: M[], groupId: string): Row[] {
  const ids = new Set(memberships.filter((x) => x.group_id === groupId).map((x) => x.duo_id));
  const rows = new Map<string, Row>();
  for (const duo of duos) if (ids.has(duo.id)) rows.set(duo.id, { ...duo, played: 0, wins: 0, losses: 0, points: 0, diff: 0 });
  for (const match of matches.filter((m) => m.group_id === groupId && completed(m.status))) {
    const a = match.team_a_duo_id ? rows.get(match.team_a_duo_id) : null; const b = match.team_b_duo_id ? rows.get(match.team_b_duo_id) : null; if (!a || !b) continue;
    const sa = Number(match.team_a_score ?? 0), sb = Number(match.team_b_score ?? 0); a.played++; b.played++; a.diff += sa - sb; b.diff += sb - sa;
    if (sa > sb) { a.wins++; a.points++; b.losses++; } else if (sb > sa) { b.wins++; b.points++; a.losses++; }
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || b.diff - a.diff || a.name.localeCompare(b.name));
}

export default function Draw() {
  const [id, setId] = useState(""); const [t, setT] = useState<T | null>(null); const [duos, setDuos] = useState<D[]>([]); const [groups, setGroups] = useState<G[]>([]); const [groupDuos, setGroupDuos] = useState<GD[]>([]); const [rounds, setRounds] = useState<R[]>([]); const [matches, setMatches] = useState<M[]>([]);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(""); const [selectedGroup, setSelectedGroup] = useState(""); const [drawView, setDrawView] = useState<"groups" | "final">("groups"); const [selectedFinalRound, setSelectedFinalRound] = useState(0); const [selectedQualifiers, setSelectedQualifiers] = useState<Record<string, string[]>>({});
  const [nextStageMode, setNextStageMode] = useState<"auto" | "custom">("auto"); const [customPairs, setCustomPairs] = useState<CustomPair[]>([]);
  const [nextActionRoundId, setNextActionRoundId] = useState("");
  const autoGenerateRef = useRef(false);
  useEffect(() => setId(new URLSearchParams(window.location.search).get("id") || ""), []);

  async function load() {
    if (!id) return;
    const [{ data: tournament, error: te }, { data: teams, error: de }, { data: gs, error: ge }, { data: r, error: re }, { data: m, error: me }] = await Promise.all([
      supabase.from("tournaments").select("id,name,format,rounds,group_count,qualifiers_per_group,is_locked").eq("id", id).single(),
      supabase.from("tournament_duos").select("id,name").eq("tournament_id", id).eq("status", "ACTIVE").order("created_at"),
      supabase.from("tournament_groups").select("id,name,group_number,qualifying_teams,qualification_confirmed").eq("tournament_id", id).order("group_number"),
      supabase.from("tournament_rounds").select("id,round_number,name,round_type,status").eq("tournament_id", id).order("round_number"),
      supabase.from("tournament_matches").select("id,round_id,match_number,group_id,team_a_duo_id,team_b_duo_id,team_a_score,team_b_score,status,winner_duo_id").eq("tournament_id", id).order("match_number")
    ]);
    const groupIds = (gs || []).map((g) => g.id); const { data: gds, error: gde } = groupIds.length ? await supabase.from("tournament_group_duos").select("group_id,duo_id,qualified").in("group_id", groupIds) : { data: [], error: null };
    const e = te || de || ge || gde || re || me; if (e) { setError(e.message); return; }
    setT(tournament); setDuos(teams || []); setGroups(gs || []); setGroupDuos(gds || []); setRounds(r || []); setMatches(m || []);
    if ((gs || []).length && !selectedGroup) setSelectedGroup((gs || [])[0].id);
    const finalRounds = (r || []).filter((x) => x.round_type !== "GROUP"); if (finalRounds.length && !selectedFinalRound) setSelectedFinalRound(finalRounds[0].round_number);
    const next: Record<string, string[]> = {}; for (const g of gs || []) next[g.id] = (gds || []).filter((x) => x.group_id === g.id && x.qualified).map((x) => x.duo_id); setSelectedQualifiers(next);
  }
  useEffect(() => { load(); }, [id]);

  async function reset() {
    if (t?.is_locked) throw new Error("Tournament is locked. Draw regeneration is disabled.");
    const { error: me } = await supabase.from("tournament_matches").delete().eq("tournament_id", id); if (me) throw me;
    const { data: existingGroups, error: ge } = await supabase.from("tournament_groups").select("id").eq("tournament_id", id); if (ge) throw ge;
    if (existingGroups?.length) { const { error } = await supabase.from("tournament_group_duos").delete().in("group_id", existingGroups.map((g) => g.id)); if (error) throw error; }
    const { error: gde } = await supabase.from("tournament_groups").delete().eq("tournament_id", id); if (gde) throw gde;
    const { error: re } = await supabase.from("tournament_rounds").delete().eq("tournament_id", id); if (re) throw re;
  }
  async function addMatch(v: Record<string, unknown>) { if (t?.is_locked) throw new Error("Tournament is locked. Draw changes are disabled."); const { error } = await supabase.from("tournament_matches").insert(v); if (error) throw error; }
  async function generate() {
    if (!t) return; if (t.is_locked) return setError("Tournament is locked. Unlock it from the tournament dashboard to change the draw."); if (duos.length < 2) return setError("Create at least two partner teams first.");
    setBusy(true); setError(""); setDone("");
    try {
      await reset(); let no = 1;
      if (t.format === "ROUND_ROBIN") {
        const { data: r, error } = await supabase.from("tournament_rounds").insert({ tournament_id: id, round_number: 1, name: "Round Robin", round_type: "GROUP", status: "LIVE" }).select("id").single(); if (error) throw error;
        for (let i = 0; i < duos.length; i++) for (let j = i + 1; j < duos.length; j++) await addMatch({ tournament_id: id, round_id: r.id, match_number: no++, team_a_duo_id: duos[i].id, team_b_duo_id: duos[j].id, best_of: 1, status: "SCHEDULED" });
      } else if (t.format === "KNOCKOUT") {
        const size = knockoutSize(duos.length), count = Math.log2(size), ids: string[] = []; for (let r = 1; r <= count; r++) { const roundSize = size / 2 ** (r - 1); const { data, error } = await supabase.from("tournament_rounds").insert({ tournament_id: id, round_number: r, name: knockoutRoundName(roundSize), round_type: knockoutRoundType(roundSize), status: r === 1 ? "LIVE" : "UPCOMING" }).select("id").single(); if (error) throw error; ids.push(data.id); }
        const seeded = [...duos] as D[]; while (seeded.length < size) seeded.push({ id: "", name: "BYE" }); for (let i = 0; i < size; i += 2) { const a = seeded[i].id || null, b = seeded[i + 1].id || null; await addMatch({ tournament_id: id, round_id: ids[0], match_number: no++, team_a_duo_id: a, team_b_duo_id: b, best_of: 3, status: a && b ? "SCHEDULED" : "COMPLETED", winner_duo_id: a && !b ? a : !a && b ? b : null }); }
        for (let r = 1; r < count; r++) { const mc = size / 2 ** (r + 1); for (let i = 0; i < mc; i++) await addMatch({ tournament_id: id, round_id: ids[r], match_number: no++, team_a_duo_id: null, team_b_duo_id: null, best_of: 3, status: "SCHEDULED" }); }
      } else if (t.format === "GROUPS_KNOCKOUT") {
        const gc = Math.max(1, t.group_count || 2), qpg = Math.max(1, t.qualifiers_per_group || 1); const { data: groupRound, error: re } = await supabase.from("tournament_rounds").insert({ tournament_id: id, round_number: 1, name: "Group Stage", round_type: "GROUP", status: "LIVE" }).select("id").single(); if (re) throw re;
        const createdGroups: G[] = []; for (let i = 0; i < gc; i++) { const { data, error } = await supabase.from("tournament_groups").insert({ tournament_id: id, name: `Group ${String.fromCharCode(65 + i)}`, group_number: i + 1, qualifying_teams: qpg, qualification_confirmed: false }).select("id,name,group_number,qualifying_teams,qualification_confirmed").single(); if (error) throw error; createdGroups.push(data); }
        const shuffled = shuffle(duos); const memberships: { group_id: string; duo_id: string; seed: number; qualified: boolean }[] = []; for (let i = 0; i < shuffled.length; i++) memberships.push({ group_id: createdGroups[i % createdGroups.length].id, duo_id: shuffled[i].id, seed: i + 1, qualified: false }); const { error: membershipError } = await supabase.from("tournament_group_duos").insert(memberships); if (membershipError) throw membershipError;
        for (const g of createdGroups) { const members = memberships.filter((x) => x.group_id === g.id).map((x) => shuffled.find((d) => d.id === x.duo_id)!).filter(Boolean); for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) await addMatch({ tournament_id: id, round_id: groupRound.id, group_id: g.id, match_number: no++, team_a_duo_id: members[i].id, team_b_duo_id: members[j].id, best_of: 1, status: "SCHEDULED" }); }
        const qualifiers = gc * qpg, size = knockoutSize(qualifiers), knockoutRounds = Math.log2(size); for (let r = 0; r < knockoutRounds; r++) { const roundSize = size / 2 ** r; const { data: kr, error } = await supabase.from("tournament_rounds").insert({ tournament_id: id, round_number: r + 2, name: knockoutRoundName(roundSize), round_type: knockoutRoundType(roundSize), status: "UPCOMING" }).select("id").single(); if (error) throw error; for (let i = 0; i < roundSize / 2; i++) await addMatch({ tournament_id: id, round_id: kr.id, match_number: no++, team_a_duo_id: null, team_b_duo_id: null, best_of: 3, status: "SCHEDULED" }); }
      }
      const { error: se } = await supabase.from("tournaments").update({ status: "READY" }).eq("id", id); if (se) throw se; setDone(t.format === "GROUPS_KNOCKOUT" ? "Teams distributed and group matches scheduled." : "Draw generated successfully."); await load();
    } catch (e: any) { setError(e?.message || "Could not generate draw"); } finally { setBusy(false); }
  }

  useEffect(() => {
    if (!id || !t || t.is_locked || duos.length < 2 || autoGenerateRef.current) return;
    const hasExistingDraw = groups.length > 0 || rounds.length > 0 || matches.length > 0;
    if (hasExistingDraw) return;
    autoGenerateRef.current = true;
    void generate();
  }, [id, t, duos.length, groups.length, rounds.length, matches.length]);

  function toggleQualifier(groupId: string, duoId: string, limit: number) { const current = selectedQualifiers[groupId] || []; if (current.includes(duoId)) { setSelectedQualifiers({ ...selectedQualifiers, [groupId]: current.filter((x) => x !== duoId) }); return; } if (current.length >= limit) return; setSelectedQualifiers({ ...selectedQualifiers, [groupId]: [...current, duoId] }); }
  const groupMatches = matches.filter((m) => m.group_id); const allGroupMatchesComplete = groups.length > 0 && groupMatches.length > 0 && groupMatches.every((m) => completed(m.status)); const allQualificationsConfirmed = groups.length > 0 && groups.every((g) => g.qualification_confirmed); const firstKnockoutRound = rounds.find((r) => r.round_type !== "GROUP"); const knockoutSeeded = !!firstKnockoutRound && matches.some((m) => m.round_id === firstKnockoutRound.id && (m.team_a_duo_id || m.team_b_duo_id)); const names = new Map(duos.map((d) => [d.id, d.name])); const path = (p: string) => `/tournaments/${p}?id=${encodeURIComponent(id)}`; const isGroupsKnockout = t?.format === "GROUPS_KNOCKOUT"; const finalRounds = rounds.filter((r) => r.round_type !== "GROUP").sort((a, b) => a.round_number - b.round_number); const displayRounds = isGroupsKnockout ? finalRounds : rounds; const activeFinalRound = displayRounds.find((r) => r.round_number === selectedFinalRound) || displayRounds[0]; const selectedGroupData = groups.find((g) => g.id === selectedGroup); const groupMatchesFor = (groupId: string) => matches.filter((m) => m.group_id === groupId); const finalMatchesFor = (roundId: string) => matches.filter((m) => m.round_id === roundId).sort((a, b) => a.match_number - b.match_number); const duoParts = (name: string) => name.split(/\s*&\s*/).map((x) => x.trim()).filter(Boolean).slice(0, 2);
  const knockoutSlots = matches.filter((m) => m.round_id === firstKnockoutRound?.id).sort((a, b) => a.match_number - b.match_number);
  const qualifiedIds = groups.flatMap((group) => standingsForGroup(duos, groupDuos, matches, group.id).filter((row) => groupDuos.some((x) => x.group_id === group.id && x.duo_id === row.id && x.qualified)).map((row) => row.id));
  const qualifiedNames = new Map(duos.filter((d) => qualifiedIds.includes(d.id)).map((d) => [d.id, d.name]));

  function roundMatches(roundId: string) { return matches.filter((m) => m.round_id === roundId); }
  function isRoundComplete(roundId: string) { const stageMatches = roundMatches(roundId); return stageMatches.length > 0 && stageMatches.every((m) => completed(m.status)); }
  function isRoundMarkedComplete(round: R) { return round.status === "COMPLETED"; }
  function nextRound(round: R) { return displayRounds.find((r) => r.round_number === round.round_number + 1); }

  async function completeStage(round: R) {
    if (t?.is_locked) return setError("Tournament is locked. Stage changes are disabled.");
    if (isRoundMarkedComplete(round)) return;
    if (!isRoundComplete(round.id)) return setError(`Complete all matches in ${round.name} before completing the stage.`);
    setBusy(true); setError(""); setDone("");
    try {
      const { error } = await supabase.from("tournament_rounds").update({ status: "COMPLETED" }).eq("id", round.id);
      if (error) throw error;
      setDone(`${round.name} completed. Choose what to do next.`);
      setNextActionRoundId(round.id);
      await syncTournamentProgression(id);
      await load();
    } catch (e: any) { setError(e?.message || "Could not complete the stage"); } finally { setBusy(false); }
  }

  function stageActions(round: R) {
    const completeNow = isRoundComplete(round.id); const marked = isRoundMarkedComplete(round); const following = nextRound(round); const showActions = marked && (nextActionRoundId === round.id || !nextActionRoundId);
    return <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(16,45,37,.10)" }}>
      {!marked && <><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}><span style={{ fontSize: 10, color: "#71857d" }}>{completeNow ? `${roundMatches(round.id).length} of ${roundMatches(round.id).length} matches completed` : `${roundMatches(round.id).filter((m) => completed(m.status)).length} of ${roundMatches(round.id).length} matches completed`}</span><span style={{ fontSize: 9, color: completeNow ? "#078b5c" : "#8a9a94", fontWeight: 700 }}>{completeNow ? "Ready to complete" : "Finish all matches first"}</span></div><button type="button" onClick={() => completeStage(round)} disabled={busy || !completeNow || t?.is_locked} className={s.button} style={{ width: "100%", background: completeNow && !t?.is_locked ? "#078b5c" : "#b8d8cb", color: "#fff", border: "1px solid transparent" }}>{busy ? "Completing…" : `✓ Complete ${round.name}`}</button></>}
      {marked && <div><div style={{ display: "flex", alignItems: "center", gap: 7, color: "#078b5c", fontSize: 11, fontWeight: 700 }}><span style={{ width: 22, height: 22, borderRadius: 999, background: "#e6f7ef", display: "grid", placeItems: "center" }}><Check size={13} /></span>{round.name} completed</div>{showActions && <div style={{ marginTop: 14 }}><div className={s.eyebrow}>WHAT DO YOU WANT TO DO NEXT?</div><div className={s.grid2} style={{ marginTop: 10 }}>
        {round.round_type === "GROUP" ? <button type="button" className={s.button} onClick={() => { setDrawView("groups"); setDone("Select the qualified teams to continue."); }} disabled={busy}>{allQualificationsConfirmed ? "Review qualified teams" : "Select qualified teams"}</button> : following ? <button type="button" className={s.button} onClick={() => { setSelectedFinalRound(following.round_number); setDrawView("final"); setDone(`Continue with ${following.name}.`); }} disabled={busy}>Continue to {following.name}</button> : <button type="button" className={s.button} onClick={() => setDone("This is the final stage. Finish the tournament when ready.")} disabled={busy}>Finish tournament</button>}
        {firstKnockoutRound && qualifiedIds.length > 0 && <button type="button" className={s.button} style={{ background: "#edf7f2", color: "#078b5c", border: "1px solid #cfe5dc" }} onClick={openCustomSchedule} disabled={busy || t?.is_locked}><Pencil size={14} style={{ verticalAlign: "-2px", marginRight: 5 }} />Custom match mapping</button>}
      </div><div style={{ marginTop: 8 }}><button type="button" className={s.secondary} style={{ width: "100%", borderRadius: 12, padding: "10px 12px", border: "1px solid #cfe5dc", background: "#f7fbf9", color: "#078b5c", fontWeight: 700, fontSize: 11 }} onClick={() => setDone("Additional / consolation matches can be mapped from the custom schedule.")}>Additional / consolation matches</button></div></div>}</div>}
    </div>;
  }

  function openCustomSchedule() {
    if (!firstKnockoutRound || !qualifiedIds.length) return setError("Confirm qualified teams before creating a custom schedule.");
    const existing = knockoutSlots.map((m) => ({ a: m.team_a_duo_id || "", b: m.team_b_duo_id || "" })); const hasMapped = existing.some((p) => p.a || p.b);
    if (hasMapped) setCustomPairs(existing); else { const initial: CustomPair[] = []; for (let i = 0; i < Math.ceil(qualifiedIds.length / 2); i++) initial.push({ a: qualifiedIds[i * 2] || "", b: qualifiedIds[i * 2 + 1] || "" }); setCustomPairs(initial); }
    setNextStageMode("custom"); setError(""); setDone(""); setDrawView("final");
  }
  function resetCustomSchedule() { const initial: CustomPair[] = []; for (let i = 0; i < Math.ceil(qualifiedIds.length / 2); i++) initial.push({ a: qualifiedIds[i * 2] || "", b: qualifiedIds[i * 2 + 1] || "" }); setCustomPairs(initial); setError(""); setDone(""); }
  function updateCustomPair(index: number, side: "a" | "b", value: string) { setCustomPairs((current) => current.map((pair, i) => i === index ? { ...pair, [side]: value } : pair)); setError(""); setDone(""); }
  function addCustomMatch() { if (customPairs.length >= knockoutSlots.length) return; setCustomPairs((current) => [...current, { a: "", b: "" }]); }
  function removeCustomMatch(index: number) { setCustomPairs((current) => current.filter((_, i) => i !== index)); }

  async function createCustomKnockoutSchedule() {
    if (t?.is_locked) return setError("Tournament is locked. Final draw changes are disabled.");
    if (!firstKnockoutRound) return setError("The knockout round is not ready yet.");
    const used = new Set<string>(); let mappedCount = 0; let hasTbd = false;
    for (const pair of customPairs) {
      if (!pair.a && !pair.b) continue;
      if (!pair.a) return setError("A match must have a team in the first position, or remove the empty match.");
      if (pair.a === pair.b) return setError("A team cannot play itself.");
      if (!qualifiedIds.includes(pair.a) || (pair.b && pair.b !== CUSTOM_TBD && !qualifiedIds.includes(pair.b))) return setError("Only qualified teams can be placed in the knockout schedule.");
      if (used.has(pair.a)) return setError("Each qualified team can appear only once in the first knockout round.");
      if (pair.b && pair.b !== CUSTOM_TBD && used.has(pair.b)) return setError("Each qualified team can appear only once in the first knockout round.");
      if (pair.b === CUSTOM_TBD) hasTbd = true;
      used.add(pair.a); if (pair.b && pair.b !== CUSTOM_TBD) used.add(pair.b); mappedCount++;
    }
    if (!hasTbd && used.size !== qualifiedIds.length) return setError(`Map all ${qualifiedIds.length} qualified teams before creating the schedule, or use TBD for an unresolved opponent.`);
    if (mappedCount > knockoutSlots.length) return setError("There are not enough knockout match slots for this schedule.");
    setBusy(true); setError(""); setDone("");
    try {
      for (let i = 0; i < knockoutSlots.length; i++) {
        const pair = customPairs[i] || { a: "", b: "" }; const a = pair.a || null; const isTbd = pair.b === CUSTOM_TBD; const b = pair.b && !isTbd ? pair.b : null; const bye = !!a && !pair.b; const empty = !a && !pair.b;
        const { error } = await supabase.from("tournament_matches").update({ team_a_duo_id: a, team_b_duo_id: b, status: empty ? "SCHEDULED" : bye ? "COMPLETED" : "SCHEDULED", winner_duo_id: bye ? a : null }).eq("id", knockoutSlots[i].id); if (error) throw error;
      }
      await syncTournamentProgression(id); setDone("Custom knockout schedule created. TBD opponents will be resolved when their source is known."); setDrawView("final"); setNextStageMode("auto"); await load();
    } catch (e: any) { setError(e?.message || "Could not create custom knockout schedule"); } finally { setBusy(false); }
  }

  async function confirmQualifications() { if (t?.is_locked) return setError("Tournament is locked. Qualification changes are disabled."); if (!allGroupMatchesComplete) return; setBusy(true); setError(""); setDone(""); try { for (const group of groups) { const selected = selectedQualifiers[group.id] || []; if (selected.length !== group.qualifying_teams) throw new Error(`${group.name}: select exactly ${group.qualifying_teams} qualified team${group.qualifying_teams > 1 ? "s" : ""}.`); for (const duo of groupDuos.filter((x) => x.group_id === group.id)) { const { error } = await supabase.from("tournament_group_duos").update({ qualified: selected.includes(duo.duo_id) }).eq("group_id", group.id).eq("duo_id", duo.duo_id); if (error) throw error; } const { error } = await supabase.from("tournament_groups").update({ qualification_confirmed: true }).eq("id", group.id); if (error) throw error; } await syncTournamentProgression(id); setDone("Qualified teams confirmed."); await load(); } catch (e: any) { setError(e?.message || "Could not confirm qualification"); } finally { setBusy(false); } }
  async function createKnockoutDraw() { if (t?.is_locked) return setError("Tournament is locked. Final draw changes are disabled."); if (!allQualificationsConfirmed || !firstKnockoutRound) return; setBusy(true); setError(""); setDone(""); try { const ordered: string[] = [], rankedGroups = groups.slice().sort((a, b) => a.group_number - b.group_number); const ranked = rankedGroups.map((group) => standingsForGroup(duos, groupDuos, matches, group.id).filter((row) => groupDuos.some((x) => x.group_id === group.id && x.duo_id === row.id && x.qualified))); const maxSlots = Math.max(...ranked.map((x) => x.length), 0); for (let position = 0; position < maxSlots; position++) for (const groupRows of ranked) if (groupRows[position]) ordered.push(groupRows[position].id); const knockoutMatches = matches.filter((m) => m.round_id === firstKnockoutRound.id).sort((a, b) => a.match_number - b.match_number); for (let i = 0; i < knockoutMatches.length; i++) { const a = ordered[i * 2] || null, b = ordered[i * 2 + 1] || null, bye = !!a !== !!b, winner = bye ? (a || b) : null; const { error } = await supabase.from("tournament_matches").update({ team_a_duo_id: a, team_b_duo_id: b, status: bye ? "COMPLETED" : "SCHEDULED", winner_duo_id: winner }).eq("id", knockoutMatches[i].id); if (error) throw error; } await syncTournamentProgression(id); setDone("Knockout draw created from the confirmed qualifiers."); await load(); setSelectedFinalRound(firstKnockoutRound.round_number); setDrawView("final"); } catch (e: any) { setError(e?.message || "Could not create knockout draw"); } finally { setBusy(false); } }
  const matchCard = (m: M, roundName: string, groupName?: string) => { const a = names.get(m.team_a_duo_id || "") || "TBD", b = names.get(m.team_b_duo_id || "") || "TBD", ap = duoParts(a), bp = duoParts(b), prefix = /quarter/i.test(roundName) ? "QF" : /semi/i.test(roundName) ? "SF" : /final/i.test(roundName) ? "F" : "Match"; return <Link key={m.id} href={`/tournaments/match?id=${m.id}`} className={ds.drawMatch}><div className={ds.drawMatchMeta}><span>{prefix} {m.match_number}</span><span>{groupName || (m.status === "COMPLETED" ? (b ? "Completed" : "Bye") : "Court TBD")}</span></div><div className={`${ds.drawTeam} ${ds.drawTeamA}`}><span className={ds.drawTeamPeople}><span className={ds.miniAvatars}>{ap.map((p, i) => <span key={i} className={ds.miniAvatar}>{p[0]}</span>)}</span><strong>{a}</strong></span><strong className={ds.drawScore}>{m.team_a_score ?? 0}</strong></div><div className={`${ds.drawTeam} ${ds.drawTeamB}`}><span className={ds.drawTeamPeople}><span className={ds.miniAvatars}>{bp.map((p, i) => <span key={i} className={ds.miniAvatar}>{p[0]}</span>)}</span><strong>{b}</strong></span><strong className={ds.drawScore}>{m.team_b_score ?? 0}</strong></div></Link>; };

  if (!id) return <main className={s.page}><div className={s.shell}><div className={s.card}>Tournament ID is missing.</div></div></main>;
  const drawEmpty = !!t && duos.length >= 2 && groups.length === 0 && rounds.length === 0 && matches.length === 0;
  return <main className={s.page}><div className={s.shell}>
    <div className={ds.mobileHeader}><Link href={path("manage")} className={ds.back}>‹</Link><strong>{t?.name || "Rally365 Open"}</strong><span className={ds.menu}>⋮</span></div>
    <div className={ds.drawTop}><div><div className={s.brand}>RALLY365 OPEN</div><h1 className={ds.drawTitle}>Draw</h1><p className={s.sub}>{t?.name || "Tournament"}</p></div><Link href={path("manage")} className={s.secondaryButton}>Overview</Link></div>
    <nav className={s.tabs}><Link className={s.tab} href={path("manage")}>Overview</Link><Link className={`${s.tab} ${s.tabActive}`} href={path("draw")}>Draw</Link><Link className={s.tab} href={path("matches")}>Matches</Link><Link className={s.tab} href={path("standings")}>Standings</Link><Link className={s.tab} href={path("players")}>Players</Link></nav>
    {t?.is_locked && <div className={s.card} style={{ marginBottom: 12, padding: 12, background: "#fffaf2", borderColor: "#f0d7ae", display: "flex", alignItems: "center", gap: 9 }}><Lock size={16} color="#a16207" /><div><strong style={{ fontSize: 11, color: "#713f12" }}>Tournament locked</strong><div style={{ fontSize: 9, color: "#8a6b3d" }}>Draw generation and setup changes are disabled.</div></div></div>}
    {error && <div className={s.error}>{error}</div>}{done && <div className={s.success}>{done}</div>}
    {drawEmpty && <section className={s.card} style={{ marginBottom: 14, textAlign: "center" }}><div className={s.eyebrow}>DRAW READY</div><h2>{busy ? "Generating draw…" : "No draw generated yet"}</h2><p className={s.sub}>{busy ? "The partner teams were found. Group distribution and matches are being created." : "Partner teams are ready. Generate the group distribution and matches to continue."}</p>{!busy && !t?.is_locked && <button className={s.button} style={{ marginTop: 12 }} onClick={() => { autoGenerateRef.current = true; void generate(); }}>Generate draw →</button>}</section>}
    {isGroupsKnockout && <div className={s.standingSwitch}><button type="button" className={`${s.switchButton} ${drawView === "groups" ? s.switchActive : ""}`} onClick={() => setDrawView("groups")}>Group Stage</button><button type="button" className={`${s.switchButton} ${drawView === "final" ? s.switchActive : ""}`} onClick={() => setDrawView("final")} disabled={!displayRounds.length}>Final</button></div>}
    {drawView === "groups" && groups.length > 0 && <><div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 12, paddingBottom: 2 }}>{groups.map((g) => { const active = g.id === selectedGroup; const count = groupMatchesFor(g.id).length; const teamCount = groupDuos.filter((x) => x.group_id === g.id).length; return <button key={g.id} type="button" onClick={() => setSelectedGroup(g.id)} style={{ flex: "1 0 0", minWidth: 130, border: `1px solid ${active ? "#078b5c" : "#dce7e2"}`, borderRadius: 14, background: active ? "#078b5c" : "#fff", color: active ? "#fff" : "#17352a", padding: "11px 12px", textAlign: "left", boxShadow: active ? "0 4px 12px rgba(7,139,92,.15)" : "none" }}><strong style={{ display: "block", fontSize: 11 }}>{g.name}</strong><small style={{ display: "block", marginTop: 3, fontSize: 8, color: active ? "#d1fae5" : "#71857d" }}>{count} matches · {teamCount} teams</small></button>; })}</div>{selectedGroupData && <section className={ds.bracketStage}><div className={ds.bracketHeading}><div><span className={s.eyebrow}>{selectedGroupData.name.toUpperCase()}</span><h2>Group Stage</h2></div><span>{groupMatchesFor(selectedGroup).length} matches</span></div><div className={ds.groupSummary}><strong>{groupDuos.filter((x) => x.group_id === selectedGroup).length} partner teams</strong><span>{selectedGroupData.qualifying_teams} qualifier{selectedGroupData.qualifying_teams === 1 ? "" : "s"}</span><span>{groupMatches.length} total group matches</span></div><div className={ds.bracketGrid}>{groupMatchesFor(selectedGroup).map((m) => matchCard(m, "Group Stage", selectedGroupData.name))}</div>{rounds.find((r) => r.round_type === "GROUP") && stageActions(rounds.find((r) => r.round_type === "GROUP")!)}</section>}</>}
    {((isGroupsKnockout && drawView === "final") || !isGroupsKnockout) && <><div className={ds.drawRoundTabs}>{displayRounds.map((r) => <button key={r.id} className={`${ds.drawRoundTab} ${r.round_number === activeFinalRound?.round_number ? ds.drawRoundTabActive : ""}`} onClick={() => setSelectedFinalRound(r.round_number)}>{r.status === "COMPLETED" ? "✓ " : ""}{r.name}</button>)}</div>{activeFinalRound ? <section className={ds.bracketStage}><div className={ds.bracketHeading}><div><span className={s.eyebrow}>FINAL</span><h2>{activeFinalRound.name}</h2></div><span>{finalMatchesFor(activeFinalRound.id).length} matches</span></div><div className={ds.bracketGrid}>{finalMatchesFor(activeFinalRound.id).map((m) => matchCard(m, activeFinalRound.name))}</div>{stageActions(activeFinalRound)}</section> : <section className={s.card}><h2>Final draw not ready</h2><p className={s.sub}>Confirm the qualified teams first, then create the final draw.</p></section>}</>}
    {isGroupsKnockout && groups.length > 0 && allGroupMatchesComplete && !allQualificationsConfirmed && <section className={s.card} style={{ marginTop: 14 }}><div className={s.eyebrow}>GROUP STAGE COMPLETE</div><h2 style={{ marginBottom: 6 }}>Select qualified teams</h2><p className={s.sub}>All group matches are recorded. Select the teams that move to the next round.</p>{groups.map((group) => { const rows = standingsForGroup(duos, groupDuos, matches, group.id), selected = selectedQualifiers[group.id] || []; return <div key={group.id} style={{ marginTop: 18 }}><div className={s.sectionHeader}><div><div className={s.eyebrow}>{group.name}</div><h3 style={{ margin: "4px 0 0" }}>{group.qualifying_teams} qualifier{group.qualifying_teams === 1 ? "" : "s"}</h3></div><span>{selected.length}/{group.qualifying_teams} selected</span></div><div className={s.standingTable}><div className={s.standingHead}><span>Select</span><span>Team</span><span>P</span><span>W</span><span>L</span><span>Pts</span></div>{rows.map((row, index) => <label key={row.id} className={s.standingRow} style={{ cursor: t?.is_locked ? "not-allowed" : "pointer", opacity: t?.is_locked ? .55 : 1 }}><input type="checkbox" disabled={t?.is_locked} checked={selected.includes(row.id)} onChange={() => toggleQualifier(group.id, row.id, group.qualifying_teams)} style={{ width: 18, height: 18 }} /><div className={s.standingTeam}><div className={s.duoAvatar}>{index + 1}</div><div><span className={s.teamName}>{row.name}</span><small>{row.played} played · {row.wins} won · {row.losses} lost</small></div></div><span>{row.played}</span><span>{row.wins}</span><span>{row.losses}</span><span className={s.points}>{row.points}</span></label>)}</div></div>; })}<div className={s.actions} style={{ marginTop: 20 }}><button className={s.button} onClick={confirmQualifications} disabled={busy || t?.is_locked}>{busy ? "Saving…" : t?.is_locked ? "Tournament locked" : "Confirm qualified teams"}</button></div></section>}
    {isGroupsKnockout && allQualificationsConfirmed && <section className={s.card} style={{ marginTop: 14 }}><div className={s.eyebrow}>QUALIFIED TEAMS</div><h2>Next stage</h2><p className={s.sub}>Qualification is locked. Review the selected teams and choose what to do next.</p><div className={s.standingTable} style={{ marginTop: 14 }}><div className={s.standingHead}><span>Group</span><span>Qualified team</span><span>P</span><span>W</span><span>L</span><span>Pts</span></div>{groups.flatMap((group) => standingsForGroup(duos, groupDuos, matches, group.id).filter((row) => groupDuos.some((x) => x.group_id === group.id && x.duo_id === row.id && x.qualified)).map((row) => <div className={s.standingRow} key={`${group.id}-${row.id}`}><span>{group.name}</span><div className={s.standingTeam}><div className={s.duoAvatar}>✓</div><span className={s.teamName}>{row.name}</span></div><span>{row.played}</span><span>{row.wins}</span><span>{row.losses}</span><span className={s.points}>{row.points}</span></div>))}</div><div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid rgba(16,45,37,.10)" }}><div className={s.eyebrow}>WHAT DO YOU WANT TO DO NEXT?</div><div className={s.grid2} style={{ marginTop: 12 }}><button className={s.button} style={{ background: nextStageMode === "auto" ? "#078b5c" : "#edf7f2", color: nextStageMode === "auto" ? "#fff" : "#078b5c", border: nextStageMode === "auto" ? "1px solid #078b5c" : "1px solid #cfe5dc" }} onClick={() => { setNextStageMode("auto"); setError(""); }} disabled={busy || knockoutSeeded || t?.is_locked}>{knockoutSeeded ? "Knockout draw created" : "Generate knockout draw automatically"}</button><button type="button" className={s.button} style={{ background: nextStageMode === "custom" ? "#078b5c" : "#edf7f2", color: nextStageMode === "custom" ? "#fff" : "#078b5c", border: nextStageMode === "custom" ? "1px solid #078b5c" : "1px solid #cfe5dc" }} onClick={openCustomSchedule} disabled={busy || !firstKnockoutRound || t?.is_locked}><Pencil size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />Select teams & create custom schedule</button></div>
      {nextStageMode === "auto" && <div style={{ marginTop: 10, display: "grid", gap: 8 }}><p className={s.sub} style={{ margin: 0 }}>Let Rally365 place the qualified teams into the next knockout round. If the bracket is not balanced, byes are assigned automatically.</p><button className={`${s.button} ${s.secondary}`} onClick={createKnockoutDraw} disabled={busy || knockoutSeeded || t?.is_locked}>{knockoutSeeded ? "Knockout draw created" : t?.is_locked ? "Tournament locked" : busy ? "Creating…" : "Create knockout draw →"}</button></div>}
      {nextStageMode === "custom" && <div style={{ marginTop: 12, padding: 14, border: "1px solid #dce7e2", borderRadius: 16, background: "#fbfdfc" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}><div><strong style={{ display: "block", fontSize: 14, color: "#102d25" }}>Create knockout schedule</strong><span style={{ display: "block", marginTop: 4, fontSize: 11, color: "#71857d", lineHeight: 1.45 }}>Map every qualified team. Use Bye when a team advances without an opponent, or TBD when the opponent will be determined later.</span></div><button type="button" onClick={resetCustomSchedule} disabled={busy} style={{ border: "1px solid #cfe5dc", background: "#fff", color: "#078b5c", borderRadius: 10, padding: "7px 10px", fontSize: 10, fontWeight: 700 }}>Reset</button></div>
        <div style={{ display: "grid", gap: 8 }}>{customPairs.map((pair, index) => <div key={index} style={{ display: "grid", gridTemplateColumns: "54px minmax(0,1fr) 20px minmax(0,1fr) 34px", alignItems: "center", gap: 6, padding: "9px 0", borderTop: index ? "1px solid #edf2ef" : undefined }}><div><strong style={{ display: "block", fontSize: 11, color: "#17352a" }}>Match {index + 1}</strong><small style={{ display: "block", marginTop: 2, color: "#8a9a94", fontSize: 8 }}>{pair.a && !pair.b ? "Bye" : pair.b === CUSTOM_TBD ? "Opponent TBD" : `Slot ${index + 1}`}</small></div><select value={pair.a} onChange={(e) => updateCustomPair(index, "a", e.target.value)} disabled={busy} style={{ minWidth: 0, width: "100%", border: "1px solid #dce7e2", borderRadius: 10, background: "#fff", color: "#17352a", padding: "9px 7px", fontSize: 10, outline: "none" }}><option value="">Select team</option>{qualifiedIds.map((teamId) => <option key={teamId} value={teamId}>{qualifiedNames.get(teamId)}</option>)}</select><span style={{ textAlign: "center", color: "#8a9a94", fontSize: 10 }}>VS</span><select value={pair.b} onChange={(e) => updateCustomPair(index, "b", e.target.value)} disabled={busy} style={{ minWidth: 0, width: "100%", border: "1px solid #dce7e2", borderRadius: 10, background: pair.b && pair.b !== CUSTOM_TBD ? "#fff" : "#f2f8f5", color: pair.b && pair.b !== CUSTOM_TBD ? "#17352a" : "#71857d", padding: "9px 7px", fontSize: 10, outline: "none" }}><option value="">Bye</option><option value={CUSTOM_TBD}>TBD</option>{qualifiedIds.map((teamId) => <option key={teamId} value={teamId}>{qualifiedNames.get(teamId)}</option>)}</select><button type="button" aria-label={`Remove match ${index + 1}`} onClick={() => removeCustomMatch(index)} disabled={busy || customPairs.length <= 1} style={{ width: 30, height: 30, border: "1px solid #dce7e2", borderRadius: 9, background: "#fff", color: "#7a8b85", display: "grid", placeItems: "center" }}><Trash2 size={13} /></button></div>)}</div>
        <button type="button" onClick={addCustomMatch} disabled={busy || customPairs.length >= knockoutSlots.length} style={{ width: "100%", marginTop: 10, border: "1px solid #078b5c", borderRadius: 11, background: "#f2faf6", color: "#078b5c", padding: "10px 12px", fontSize: 11, fontWeight: 700 }}><Plus size={14} style={{ verticalAlign: "-3px", marginRight: 5 }} />Add another match</button>
        <button type="button" onClick={createCustomKnockoutSchedule} disabled={busy || t?.is_locked} className={s.button} style={{ width: "100%", marginTop: 10 }}>{busy ? "Creating…" : "Create knockout schedule"}</button>
      </div>}
    </div></section>}
  </div></main>;
}
