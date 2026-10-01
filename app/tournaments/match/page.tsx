"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { syncTournamentProgression } from "../../../lib/tournamentProgression";
import s from "../tournament.module.css";

type Result = "WIN" | "LOSE" | null;
type SourceResult = "WINNER" | "LOSER";

type Team = { id: string; name: string };
type SourceMatch = {
  id: string;
  match_number: number;
  round_id: string;
  round_number: number;
  round_name: string;
  status: string;
  team_a_duo_id: string | null;
  team_b_duo_id: string | null;
  winner_duo_id: string | null;
  team_a: { name: string } | null;
  team_b: { name: string } | null;
};

type M = {
  id: string;
  tournament_id: string;
  round_id: string;
  match_number: number;
  team_a_score: number;
  team_b_score: number;
  status: string;
  scheduled_at: string | null;
  court: number | null;
  team_a_duo_id: string | null;
  team_b_duo_id: string | null;
  winner_duo_id: string | null;
  team_a_source_match_id: string | null;
  team_a_source_result: SourceResult | null;
  team_b_source_match_id: string | null;
  team_b_source_result: SourceResult | null;
  team_a: { name: string } | null;
  team_b: { name: string } | null;
};

type Round = { id: string; name: string; round_number: number; round_type: string };

function MatchDetailContent() {
  const q = useSearchParams();
  const queryId = q.get("id") || "";
  const legacy = q.get("matchId") || "";
  const [matchId, setMatchId] = useState(legacy || queryId);
  const [tournamentId, setTournamentId] = useState("");
  const [tournamentLocked, setTournamentLocked] = useState(false);
  const [m, setM] = useState<M | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [sourceMatches, setSourceMatches] = useState<SourceMatch[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [sourceSide, setSourceSide] = useState<"A" | "B" | null>(null);
  const [a, setA] = useState("0");
  const [b, setB] = useState("0");
  const [resultA, setResultA] = useState<Result>(null);
  const [resultB, setResultB] = useState<Result>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [verifiedAdminPin, setVerifiedAdminPin] = useState("");
  const [adminEditAuthorized, setAdminEditAuthorized] = useState(false);

  useEffect(() => setMatchId(legacy || queryId), [queryId, legacy]);

  async function loadMatch() {
    if (!matchId) return;
    setError("");
    setRound(null);

    const { data, error: matchError } = await supabase
      .from("tournament_matches")
      .select("id,tournament_id,round_id,match_number,team_a_score,team_b_score,status,scheduled_at,court,team_a_duo_id,team_b_duo_id,winner_duo_id,team_a_source_match_id,team_a_source_result,team_b_source_match_id,team_b_source_result,team_a:tournament_duos!tournament_matches_team_a_duo_id_fkey(name),team_b:tournament_duos!tournament_matches_team_b_duo_id_fkey(name)")
      .eq("id", matchId)
      .single();
    if (matchError) { setError(matchError.message); return; }

    const x = data as unknown as M;
    setM(x);
    setTournamentId(x.tournament_id);
    setA(String(x.team_a_score ?? 0));
    setB(String(x.team_b_score ?? 0));

    const [{ data: tournament, error: tournamentError }, { data: roundRows, error: roundsError }, { data: allMatches, error: allMatchesError }, { data: teamRows, error: teamsError }] = await Promise.all([
      supabase.from("tournaments").select("is_locked").eq("id", x.tournament_id).single(),
      supabase.from("tournament_rounds").select("id,name,round_number,round_type").eq("tournament_id", x.tournament_id).order("round_number"),
      supabase.from("tournament_matches").select("id,match_number,round_id,status,team_a_duo_id,team_b_duo_id,winner_duo_id,team_a:tournament_duos!tournament_matches_team_a_duo_id_fkey(name),team_b:tournament_duos!tournament_matches_team_b_duo_id_fkey(name)").eq("tournament_id", x.tournament_id).order("match_number"),
      supabase.from("tournament_duos").select("id,name").eq("tournament_id", x.tournament_id).eq("status", "ACTIVE").order("created_at"),
    ]);

    const combinedError = tournamentError || roundsError || allMatchesError || teamsError;
    if (combinedError) setError(combinedError.message);
    else {
      setTournamentLocked(!!tournament?.is_locked);
      setRounds((roundRows || []) as Round[]);
      setTeams((teamRows || []) as Team[]);
      const roundMap = new Map((roundRows || []).map((r: any) => [r.id, r]));
      const enriched = (allMatches || []).map((row: any) => ({ ...row, round_number: roundMap.get(row.round_id)?.round_number ?? 0, round_name: roundMap.get(row.round_id)?.name || "Match" }));
      setSourceMatches(enriched as SourceMatch[]);
      const currentRound = roundMap.get(x.round_id);
      if (currentRound) setRound(currentRound as Round);
    }

    if (x.winner_duo_id && x.winner_duo_id === x.team_a_duo_id) {
      setResultA("WIN"); setResultB("LOSE");
    } else if (x.winner_duo_id && x.winner_duo_id === x.team_b_duo_id) {
      setResultA("LOSE"); setResultB("WIN");
    } else if (x.status === "COMPLETED") {
      const sa = Number(x.team_a_score ?? 0), sb = Number(x.team_b_score ?? 0);
      if (sa > sb) { setResultA("WIN"); setResultB("LOSE"); }
      else if (sb > sa) { setResultA("LOSE"); setResultB("WIN"); }
      else { setResultA(null); setResultB(null); }
    } else { setResultA(null); setResultB(null); }
  }

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    (async () => { await loadMatch(); if (cancelled) return; })();
    return () => { cancelled = true; };
  }, [matchId]);

  const eligibleSourceMatches = useMemo(() => {
    if (!m || !round) return [];
    return sourceMatches.filter((candidate) => {
      if (candidate.id === m.id) return false;
      return candidate.round_number < round.round_number || (candidate.round_number === round.round_number && candidate.match_number < m.match_number);
    });
  }, [m, round, sourceMatches]);

  const sourceLabel = (side: "A" | "B") => {
    if (!m) return "";
    const sourceId = side === "A" ? m.team_a_source_match_id : m.team_b_source_match_id;
    const sourceResult = side === "A" ? m.team_a_source_result : m.team_b_source_result;
    if (!sourceId || !sourceResult) return "";
    const source = sourceMatches.find((x) => x.id === sourceId);
    return source ? `${sourceResult === "WINNER" ? "Winner" : "Loser"} · Match ${source.match_number}` : "Qualification source";
  };

  function chooseResult(side: "A" | "B", result: Exclude<Result, null>) {
    if ((m?.status === "COMPLETED" && !adminEditAuthorized) || tournamentLocked) return;
    if (side === "A") { setResultA(result); setResultB(result === "WIN" ? "LOSE" : "WIN"); }
    else { setResultB(result); setResultA(result === "WIN" ? "LOSE" : "WIN"); }
    setError("");
  }

  async function selectSource(result: SourceResult, sourceMatchId: string) {
    if (!m || !sourceSide || tournamentLocked || m.status === "COMPLETED") return;
    const source = sourceMatches.find((x) => x.id === sourceMatchId);
    if (!source) return;
    const resolvedTeam = source.status === "COMPLETED" || source.status === "WALKOVER"
      ? result === "WINNER"
        ? source.winner_duo_id
        : source.winner_duo_id === source.team_a_duo_id ? source.team_b_duo_id : source.winner_duo_id === source.team_b_duo_id ? source.team_a_duo_id : null
      : null;
    const patch = sourceSide === "A"
      ? { team_a_source_match_id: sourceMatchId, team_a_source_result: result, team_a_duo_id: resolvedTeam }
      : { team_b_source_match_id: sourceMatchId, team_b_source_result: result, team_b_duo_id: resolvedTeam };
    setBusy(true); setError("");
    const { error: updateError } = await supabase.from("tournament_matches").update(patch).eq("id", m.id);
    if (updateError) setError(updateError.message);
    else { setM({ ...m, ...patch } as M); setSourceSide(null); await syncTournamentProgression(m.tournament_id); await loadMatch(); }
    setBusy(false);
  }

  async function selectManualTeam(teamId: string) {
    if (!m || !sourceSide || tournamentLocked || m.status === "COMPLETED") return;
    const patch = sourceSide === "A"
      ? { team_a_source_match_id: null, team_a_source_result: null, team_a_duo_id: teamId }
      : { team_b_source_match_id: null, team_b_source_result: null, team_b_duo_id: teamId };
    setBusy(true); setError("");
    const { error: updateError } = await supabase.from("tournament_matches").update(patch).eq("id", m.id);
    if (updateError) setError(updateError.message);
    else { setM({ ...m, ...patch } as M); setSourceSide(null); }
    setBusy(false);
  }

  async function clearSource(side: "A" | "B") {
    if (!m || tournamentLocked || m.status === "COMPLETED") return;
    const patch = side === "A"
      ? { team_a_source_match_id: null, team_a_source_result: null, team_a_duo_id: null }
      : { team_b_source_match_id: null, team_b_source_result: null, team_b_duo_id: null };
    setBusy(true);
    const { error: updateError } = await supabase.from("tournament_matches").update(patch).eq("id", m.id);
    if (updateError) setError(updateError.message);
    else setM({ ...m, ...patch } as M);
    setBusy(false);
  }

  async function save(status: string) {
    if (!m || m.status === "COMPLETED" || tournamentLocked) return;
    setBusy(true); setError("");
    const na = Number(a), nb = Number(b);
    if (status === "COMPLETED" && (!m.team_a_duo_id || !m.team_b_duo_id)) { setError("Both teams must be assigned before saving the completed score."); setBusy(false); return; }
    if (status === "COMPLETED" && (!resultA || !resultB || resultA === resultB)) { setError("Select Win/Lose for the match before saving the completed score."); setBusy(false); return; }
    const winnerId = status === "COMPLETED" ? resultA === "WIN" ? m.team_a_duo_id : resultB === "WIN" ? m.team_b_duo_id : null : null;
    const { error: saveError } = await supabase.from("tournament_matches").update({ team_a_score: na, team_b_score: nb, status, winner_duo_id: winnerId }).eq("id", m.id);
    if (saveError) setError(saveError.message);
    else { setM({ ...m, team_a_score: na, team_b_score: nb, status, winner_duo_id: winnerId }); try { await syncTournamentProgression(m.tournament_id); } catch (e: any) { setError(e?.message || "Score saved, but progression could not be updated."); } }
    setBusy(false);
  }

  async function verifyAdminPin() {
    if (!m || m.status !== "COMPLETED") return;
    const pin = adminPin.trim();
    if (!/^\d{6}$/.test(pin)) { setError("Admin PIN must be exactly 6 digits."); return; }
    if (tournamentLocked) { setError("Tournament is locked. Unlock the tournament before correcting a score."); return; }
    setBusy(true); setError("");
    const { error: verifyError } = await supabase.rpc("verify_match_admin_pin", { p_match_id: m.id, p_pin: pin });
    if (verifyError) setError(verifyError.message);
    else { setVerifiedAdminPin(pin); setAdminEditAuthorized(true); setCorrectionOpen(false); setAdminPin(""); setError(""); }
    setBusy(false);
  }

  async function correctCompletedScore() {
    if (!m || m.status !== "COMPLETED" || !adminEditAuthorized) return;
    if (tournamentLocked) { setError("Tournament is locked. Unlock the tournament before correcting a score."); return; }
    const winnerId = resultA === "WIN" ? m.team_a_duo_id : resultB === "WIN" ? m.team_b_duo_id : null;
    if (!winnerId) { setError("Select the winning team before correcting the score."); return; }
    setBusy(true); setError("");
    const { error: correctionError } = await supabase.rpc("admin_correct_match_score", { p_match_id: m.id, p_pin: verifiedAdminPin, p_team_a_score: Number(a), p_team_b_score: Number(b), p_winner_duo_id: winnerId });
    if (correctionError) setError(correctionError.message);
    else { setAdminEditAuthorized(false); setVerifiedAdminPin(""); await syncTournamentProgression(m.tournament_id); await loadMatch(); }
    setBusy(false);
  }

  if (!matchId) return <main className={s.page}><div className={s.shell}><div className={s.card}>Match information is missing.</div></div></main>;

  const roundTitle = round?.name || "Match";
  const matchLocked = m?.status === "COMPLETED";
  const inputsDisabled = busy || tournamentLocked || (matchLocked && !adminEditAuthorized);
  const outcomeButtonStyle = (selected: boolean, type: "WIN" | "LOSE") => ({
    border: selected ? `1.5px solid ${type === "WIN" ? "#078b5c" : "#c84a4a"}` : "1px solid #d9e5e0",
    background: selected ? (type === "WIN" ? "#e8f7f1" : "#fff0f0") : "#fff",
    color: selected ? (type === "WIN" ? "#078b5c" : "#b73b3b") : "#71857d",
    fontWeight: 850, fontSize: 10, borderRadius: 8, padding: "7px 8px", minWidth: 43, lineHeight: 1,
    cursor: inputsDisabled ? "not-allowed" : "pointer", opacity: inputsDisabled && !selected ? .55 : 1,
  });

  const teamRow = (side: "A" | "B") => {
    if (!m) return null;
    const team = side === "A" ? m.team_a : m.team_b;
    const teamId = side === "A" ? m.team_a_duo_id : m.team_b_duo_id;
    const source = sourceLabel(side);
    const score = side === "A" ? a : b;
    const result = side === "A" ? resultA : resultB;
    const setScore = side === "A" ? setA : setB;
    return <div className={s.teamLine} style={{ minHeight: 74, padding: "12px 8px" }}>
      <span className={s.teamIdentity} style={{ flex: "1 1 auto", minWidth: 0 }}>
        <span className={s.avatar}>{side}</span>
        <span style={{ minWidth: 0 }}>
          <span className={s.teamName}>{team?.name || "TBD"}</span>
          {!teamId && source && <span style={{ display: "block", marginTop: 3, color: "#078b5c", fontSize: 9, fontWeight: 750 }}>{source}</span>}
          {!teamId && !matchLocked && <button type="button" disabled={busy || tournamentLocked} onClick={() => setSourceSide(side)} style={{ marginTop: 5, border: "1px solid #cfe5dc", background: "#edf8f3", color: "#078b5c", borderRadius: 8, padding: "5px 8px", fontSize: 9, fontWeight: 800 }}>Select source ›</button>}
          {!teamId && source && !matchLocked && <button type="button" disabled={busy || tournamentLocked} onClick={() => clearSource(side)} style={{ marginLeft: 5, border: "0", background: "transparent", color: "#8a9a94", fontSize: 8 }}>Clear</button>}
        </span>
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flex: "0 0 auto" }}>
        <input className={s.scoreInput} type="number" min="0" value={score} disabled={inputsDisabled || !teamId} onChange={(e) => setScore(e.target.value)} aria-label={`Team ${side} score`} style={{ width: 72, minWidth: 72, padding: "4px 2px", fontSize: 34, opacity: inputsDisabled || !teamId ? .65 : 1 }} />
        <div style={{ display: "flex", gap: 4 }}>
          <button type="button" disabled={inputsDisabled || !teamId} onClick={() => chooseResult(side, "WIN")} style={outcomeButtonStyle(result === "WIN", "WIN")}>Win</button>
          <button type="button" disabled={inputsDisabled || !teamId} onClick={() => chooseResult(side, "LOSE")} style={outcomeButtonStyle(result === "LOSE", "LOSE")}>Lose</button>
        </div>
      </div>
    </div>;
  };

  return <main className={s.page}><div className={s.shell}>
    {error ? <div className={s.error}>{error}</div> : !m ? <div className={s.card}>Loading match…</div> : <>
      <div className={s.top}><Link href={tournamentId ? `/tournaments/matches?id=${tournamentId}` : "/tournaments"} className={s.secondaryButton}>← Schedule</Link><span className={s.pill}>{m.status}</span></div>
      <div className={s.liveHeader}><div className={s.row}><div><div className={s.brand} style={{ color: "#d9d07a" }}>RALLY365 OPEN</div><h1 style={{ margin: "6px 0 0", fontSize: 26 }}>{roundTitle} {m.match_number}</h1></div><span>🏸 Court {m.court || "TBD"}</span></div><p style={{ margin: "10px 0 0", opacity: 0.85 }}>{m.scheduled_at ? new Date(m.scheduled_at).toLocaleString("en-IN") : "Time TBD"}</p></div>
      {tournamentLocked && <div className={s.error} style={{ marginTop: 10 }}>Tournament is locked. Match changes are disabled until an admin unlocks it.</div>}
      {matchLocked && !tournamentLocked && !adminEditAuthorized && <div className={s.success} style={{ marginTop: 10 }}>Score saved and locked. Admin PIN is required for corrections.</div>}
      {adminEditAuthorized && <div className={s.success} style={{ marginTop: 10 }}>Admin correction mode enabled. Update the score/result, then save the correction.</div>}

      <section className={s.liveScore}>
        {teamRow("A")}{teamRow("B")}
        <div className={s.actions} style={{ marginTop: 18 }}>
          {matchLocked ? (adminEditAuthorized ? <><button className={s.button} disabled={busy} onClick={correctCompletedScore}>{busy ? "Saving…" : "Save correction"}</button><button className={s.button + " " + s.secondary} disabled={busy} onClick={() => { setAdminEditAuthorized(false); setVerifiedAdminPin(""); setError(""); loadMatch(); }}>Cancel correction</button></> : <button className={s.button} disabled={busy || tournamentLocked} onClick={() => { setAdminPin(""); setCorrectionOpen(true); setError(""); }}>{tournamentLocked ? "Tournament locked" : "Admin correct score"}</button>) : <button className={s.button} disabled={busy || !m.team_a_duo_id || !m.team_b_duo_id || tournamentLocked} onClick={() => save("COMPLETED")}>{busy ? "Saving…" : "Save score"}</button>}
          {!matchLocked && <><button className={s.button + " " + s.secondary} disabled={busy || tournamentLocked} onClick={() => save("LIVE")}>Mark live</button><button className={s.button + " " + s.danger} disabled={busy || tournamentLocked} onClick={() => save("CANCELLED")}>Cancel</button></>}
        </div>
      </section>

      {sourceSide && <div role="dialog" aria-modal="true" onClick={() => !busy && setSourceSide(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.48)", backdropFilter: "blur(3px)", zIndex: 70, display: "flex", alignItems: "flex-end", justifyContent: "center" }}><div onClick={e => e.stopPropagation()} style={{ width: "min(440px,100%)", maxHeight: "78vh", overflow: "auto", background: "#fff", borderRadius: "26px 26px 0 0", padding: 20, boxShadow: "0 -12px 35px rgba(0,0,0,.16)" }}><div style={{ width: 48, height: 5, background: "#d7dfdb", borderRadius: 99, margin: "-3px auto 16px" }} /><h3 style={{ margin: 0, fontSize: 18 }}>Select qualification source</h3><p style={{ margin: "6px 0 14px", fontSize: 10, color: "#72867e", lineHeight: 1.5 }}>Choose where Team {sourceSide} comes from. This can be a previous match winner or loser, or a specific team.</p>
        <div style={{ display: "grid", gap: 8 }}>{eligibleSourceMatches.map((source) => <div key={source.id} style={{ border: "1px solid #dce7e2", borderRadius: 12, padding: 10, background: "#fbfdfc" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}><strong style={{ fontSize: 11, color: "#17352a" }}>Match {source.match_number} · {source.round_name}</strong><span style={{ fontSize: 8, color: "#7a8b85" }}>{source.status}</span></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}><button type="button" disabled={busy} onClick={() => selectSource("WINNER", source.id)} style={{ border: "1px solid #cfe5dc", background: "#edf8f3", color: "#078b5c", borderRadius: 9, padding: "9px 7px", fontSize: 9, fontWeight: 800 }}>Winner{source.winner_duo_id ? ` · ${source.winner_duo_id === source.team_a_duo_id ? source.team_a?.name : source.team_b?.name}` : ""}</button><button type="button" disabled={busy} onClick={() => selectSource("LOSER", source.id)} style={{ border: "1px solid #e5e9e7", background: "#fff", color: "#63756d", borderRadius: 9, padding: "9px 7px", fontSize: 9, fontWeight: 800 }}>Loser</button></div></div>)}</div>
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #edf2ef" }}><div style={{ fontSize: 9, fontWeight: 900, letterSpacing: ".12em", color: "#078b5c", marginBottom: 8 }}>MANUAL TEAM</div><div style={{ display: "grid", gap: 6 }}>{teams.filter(team => team.id !== (sourceSide === "A" ? m?.team_b_duo_id : m?.team_a_duo_id)).map(team => <button key={team.id} type="button" disabled={busy} onClick={() => selectManualTeam(team.id)} style={{ border: "1px solid #dce7e2", background: "#fff", color: "#17352a", borderRadius: 9, padding: "10px 11px", textAlign: "left", fontSize: 10 }}>{team.name}<span style={{ float: "right", color: "#078b5c" }}>Select ›</span></button>)}</div></div>
        <button type="button" className={`${s.button} ${s.secondary}`} style={{ width: "100%", marginTop: 12 }} onClick={() => setSourceSide(null)}>Cancel</button>
      </div></div>}

      {correctionOpen && <div role="dialog" aria-modal="true" onClick={() => !busy && setCorrectionOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.48)", backdropFilter: "blur(3px)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}><div onClick={e => e.stopPropagation()} style={{ width: "min(440px,100%)", background: "#fff", borderRadius: "26px 26px 0 0", padding: 20, boxShadow: "0 -12px 35px rgba(0,0,0,.16)" }}><div style={{ width: 48, height: 5, background: "#d7dfdb", borderRadius: 99, margin: "-3px auto 16px" }} /><h3 style={{ margin: 0, fontSize: 17 }}>Admin score correction</h3><p style={{ margin: "6px 0 14px", fontSize: 10, color: "#72867e" }}>This completed match is locked. Enter the tournament's 6-digit admin PIN to edit the saved score.</p><label style={{ display: "block", fontSize: 9, fontWeight: 900, color: "#61736b", letterSpacing: ".08em", marginBottom: 6 }}>ADMIN PIN</label><input autoFocus inputMode="numeric" maxLength={6} type="password" value={adminPin} onChange={e => setAdminPin(e.target.value.replace(/\D/g, "").slice(0, 6))} className={s.input} placeholder="6-digit PIN" style={{ letterSpacing: ".28em", fontWeight: 900, textAlign: "center" }} />{error && <div className={s.error} style={{ marginTop: 10 }}>{error}</div>}<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}><button type="button" disabled={busy} onClick={() => setCorrectionOpen(false)} className={`${s.button} ${s.secondary}`}>Cancel</button><button type="button" disabled={busy} onClick={verifyAdminPin} className={s.button}>{busy ? "Checking…" : "Verify PIN & edit"}</button></div></div></div>}
    </>}
  </div></main>;
}

export default function MatchDetail() { return <Suspense fallback={<main className={s.page}><div className={s.shell}><div className={s.card}>Loading match…</div></div></main>}><MatchDetailContent /></Suspense>; }
