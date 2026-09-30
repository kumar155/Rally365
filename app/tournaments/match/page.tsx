"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { syncTournamentProgression } from "../../../lib/tournamentProgression";
import s from "../tournament.module.css";

type Result = "WIN" | "LOSE" | null;

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
  team_a: { name: string } | null;
  team_b: { name: string } | null;
};

type Round = {
  id: string;
  name: string;
  round_number: number;
  round_type: string;
};

function MatchDetailContent() {
  const q = useSearchParams();
  const queryId = q.get("id") || "";
  const legacy = q.get("matchId") || "";
  const [matchId, setMatchId] = useState(legacy || queryId);
  const [tournamentId, setTournamentId] = useState("");
  const [tournamentLocked, setTournamentLocked] = useState(false);
  const [m, setM] = useState<M | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [a, setA] = useState("0");
  const [b, setB] = useState("0");
  const [resultA, setResultA] = useState<Result>(null);
  const [resultB, setResultB] = useState<Result>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [adminPin, setAdminPin] = useState("");

  useEffect(() => setMatchId(legacy || queryId), [queryId, legacy]);

  async function loadMatch() {
    if (!matchId) return;
    setError("");
    setRound(null);

    const { data, error: matchError } = await supabase
      .from("tournament_matches")
      .select(
        "id,tournament_id,round_id,match_number,team_a_score,team_b_score,status,scheduled_at,court,team_a_duo_id,team_b_duo_id,winner_duo_id,team_a:tournament_duos!tournament_matches_team_a_duo_id_fkey(name),team_b:tournament_duos!tournament_matches_team_b_duo_id_fkey(name)"
      )
      .eq("id", matchId)
      .single();

    if (matchError) {
      setError(matchError.message);
      return;
    }

    const x = data as unknown as M;
    setM(x);
    setTournamentId(x.tournament_id);
    setA(String(x.team_a_score ?? 0));
    setB(String(x.team_b_score ?? 0));

    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("is_locked")
      .eq("id", x.tournament_id)
      .single();
    if (tournamentError) setError(tournamentError.message);
    else setTournamentLocked(!!tournament?.is_locked);

    // Restore the explicit result when available. Older completed matches
    // may only have scores, so use the score as a backwards-compatible fallback.
    if (x.winner_duo_id && x.winner_duo_id === x.team_a_duo_id) {
      setResultA("WIN");
      setResultB("LOSE");
    } else if (x.winner_duo_id && x.winner_duo_id === x.team_b_duo_id) {
      setResultA("LOSE");
      setResultB("WIN");
    } else if (x.status === "COMPLETED") {
      const sa = Number(x.team_a_score ?? 0);
      const sb = Number(x.team_b_score ?? 0);
      if (sa > sb) {
        setResultA("WIN");
        setResultB("LOSE");
      } else if (sb > sa) {
        setResultA("LOSE");
        setResultB("WIN");
      } else {
        setResultA(null);
        setResultB(null);
      }
    } else {
      setResultA(null);
      setResultB(null);
    }

    if (x.round_id) {
      const { data: roundData, error: roundError } = await supabase
        .from("tournament_rounds")
        .select("id,name,round_number,round_type")
        .eq("id", x.round_id)
        .single();

      if (roundError) setError(roundError.message);
      else setRound(roundData as Round);
    }
  }

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    (async () => {
      await loadMatch();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [matchId]);

  function chooseResult(side: "A" | "B", result: Exclude<Result, null>) {
    if (m?.status === "COMPLETED" || tournamentLocked) return;
    if (side === "A") {
      setResultA(result);
      setResultB(result === "WIN" ? "LOSE" : "WIN");
    } else {
      setResultB(result);
      setResultA(result === "WIN" ? "LOSE" : "WIN");
    }
    setError("");
  }

  async function save(status: string) {
    if (!m || m.status === "COMPLETED" || tournamentLocked) return;
    setBusy(true);
    setError("");

    const na = Number(a);
    const nb = Number(b);

    if (status === "COMPLETED" && (!resultA || !resultB || resultA === resultB)) {
      setError("Select Win/Lose for the match before saving the completed score.");
      setBusy(false);
      return;
    }

    const winnerId =
      status === "COMPLETED"
        ? resultA === "WIN"
          ? m.team_a_duo_id
          : resultB === "WIN"
            ? m.team_b_duo_id
            : null
        : null;

    const { error: saveError } = await supabase
      .from("tournament_matches")
      .update({
        team_a_score: na,
        team_b_score: nb,
        status,
        winner_duo_id: winnerId,
      })
      .eq("id", m.id);

    if (saveError) {
      setError(saveError.message);
    } else {
      setM({
        ...m,
        team_a_score: na,
        team_b_score: nb,
        status,
        winner_duo_id: winnerId,
      });

      // Recalculate group qualifiers and/or advance this winner into the
      // next knockout slot. This removes manual TBD handling from the flow.
      try {
        await syncTournamentProgression(m.tournament_id);
      } catch (e: any) {
        setError(e?.message || "Score saved, but progression could not be updated.");
      }
    }

    setBusy(false);
  }

  async function correctCompletedScore() {
    if (!m || m.status !== "COMPLETED") return;
    const pin = adminPin.trim();
    if (!/^\d{6}$/.test(pin)) {
      setError("Admin PIN must be exactly 6 digits.");
      return;
    }
    if (tournamentLocked) {
      setError("Tournament is locked. Unlock the tournament before correcting a score.");
      return;
    }

    const winnerId = resultA === "WIN" ? m.team_a_duo_id : resultB === "WIN" ? m.team_b_duo_id : null;
    if (!winnerId) {
      setError("Select the winning team before correcting the score.");
      return;
    }

    setBusy(true);
    setError("");
    const { error: correctionError } = await supabase.rpc("admin_correct_match_score", {
      p_match_id: m.id,
      p_pin: pin,
      p_team_a_score: Number(a),
      p_team_b_score: Number(b),
      p_winner_duo_id: winnerId,
    });

    if (correctionError) {
      setError(correctionError.message);
    } else {
      setCorrectionOpen(false);
      setAdminPin("");
      await syncTournamentProgression(m.tournament_id);
      await loadMatch();
    }
    setBusy(false);
  }

  if (!matchId)
    return (
      <main className={s.page}>
        <div className={s.shell}>
          <div className={s.card}>Match information is missing.</div>
        </div>
      </main>
    );

  const roundTitle = round?.name || "Match";
  const matchLocked = m?.status === "COMPLETED";
  const inputsDisabled = busy || matchLocked || tournamentLocked;

  const outcomeButtonStyle = (selected: boolean, type: "WIN" | "LOSE") => ({
    border: selected ? `1.5px solid ${type === "WIN" ? "#078b5c" : "#c84a4a"}` : "1px solid #d9e5e0",
    background: selected ? (type === "WIN" ? "#e8f7f1" : "#fff0f0") : "#fff",
    color: selected ? (type === "WIN" ? "#078b5c" : "#b73b3b") : "#71857d",
    fontWeight: 850,
    fontSize: 10,
    borderRadius: 8,
    padding: "7px 8px",
    minWidth: 43,
    lineHeight: 1,
    cursor: inputsDisabled ? "not-allowed" : "pointer",
    opacity: inputsDisabled && !selected ? .55 : 1,
  });

  return (
    <main className={s.page}>
      <div className={s.shell}>
        {error ? (
          <div className={s.error}>{error}</div>
        ) : !m ? (
          <div className={s.card}>Loading match…</div>
        ) : (
          <>
            <div className={s.top}>
              <Link
                href={
                  tournamentId
                    ? `/tournaments/schedule?id=${tournamentId}`
                    : "/tournaments"
                }
                className={s.secondaryButton}
              >
                ← Schedule
              </Link>
              <span className={s.pill}>{m.status}</span>
            </div>

            <div className={s.liveHeader}>
              <div className={s.row}>
                <div>
                  <div className={s.brand} style={{ color: "#d9d07a" }}>
                    RALLY365 OPEN
                  </div>
                  <h1 style={{ margin: "6px 0 0", fontSize: 26 }}>
                    {roundTitle} {m.match_number}
                  </h1>
                </div>
                <span>🏸 Court {m.court || "TBD"}</span>
              </div>
              <p style={{ margin: "10px 0 0", opacity: 0.85 }}>
                {m.scheduled_at
                  ? new Date(m.scheduled_at).toLocaleString("en-IN")
                  : "Time TBD"}
              </p>
            </div>

            {tournamentLocked && <div className={s.error} style={{ marginTop: 10 }}>Tournament is locked. Match changes are disabled until an admin unlocks it.</div>}
            {matchLocked && !tournamentLocked && <div className={s.success} style={{ marginTop: 10 }}>Score saved and locked. Admin PIN is required for corrections.</div>}

            <section className={s.liveScore}>
              <div className={s.teamLine} style={{ minHeight: 74, padding: "12px 8px" }}>
                <span className={s.teamIdentity} style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <span className={s.avatar}>A</span>
                  <span className={s.teamName}>{m.team_a?.name || "TBD"}</span>
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 7, flex: "0 0 auto" }}>
                  <input
                    className={s.scoreInput}
                    type="number"
                    min="0"
                    value={a}
                    disabled={inputsDisabled}
                    onChange={(e) => setA(e.target.value)}
                    aria-label="Team A score"
                    style={{ width: 72, minWidth: 72, padding: "4px 2px", fontSize: 34, opacity: inputsDisabled ? .65 : 1 }}
                  />
                  <div style={{ display: "flex", gap: 4 }}>
                    <button type="button" disabled={inputsDisabled} onClick={() => chooseResult("A", "WIN")} style={outcomeButtonStyle(resultA === "WIN", "WIN")}>Win</button>
                    <button type="button" disabled={inputsDisabled} onClick={() => chooseResult("A", "LOSE")} style={outcomeButtonStyle(resultA === "LOSE", "LOSE")}>Lose</button>
                  </div>
                </div>
              </div>

              <div className={s.teamLine} style={{ minHeight: 74, padding: "12px 8px" }}>
                <span className={s.teamIdentity} style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <span className={s.avatar}>B</span>
                  <span className={s.teamName}>{m.team_b?.name || "TBD"}</span>
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 7, flex: "0 0 auto" }}>
                  <input
                    className={s.scoreInput}
                    type="number"
                    min="0"
                    value={b}
                    disabled={inputsDisabled}
                    onChange={(e) => setB(e.target.value)}
                    aria-label="Team B score"
                    style={{ width: 72, minWidth: 72, padding: "4px 2px", fontSize: 34, opacity: inputsDisabled ? .65 : 1 }}
                  />
                  <div style={{ display: "flex", gap: 4 }}>
                    <button type="button" disabled={inputsDisabled} onClick={() => chooseResult("B", "WIN")} style={outcomeButtonStyle(resultB === "WIN", "WIN")}>Win</button>
                    <button type="button" disabled={inputsDisabled} onClick={() => chooseResult("B", "LOSE")} style={outcomeButtonStyle(resultB === "LOSE", "LOSE")}>Lose</button>
                  </div>
                </div>
              </div>

              <div className={s.actions} style={{ marginTop: 18 }}>
                {matchLocked ? (
                  <button
                    className={s.button}
                    disabled={busy || tournamentLocked}
                    onClick={() => { setAdminPin(""); setCorrectionOpen(true); setError(""); }}
                  >
                    {tournamentLocked ? "Tournament locked" : "Admin correct score"}
                  </button>
                ) : (
                  <button
                    className={s.button}
                    disabled={busy || !m.team_a_duo_id || !m.team_b_duo_id || tournamentLocked}
                    onClick={() => save("COMPLETED")}
                  >
                    {busy ? "Saving…" : "Save score"}
                  </button>
                )}
                {!matchLocked && <>
                  <button
                    className={s.button + " " + s.secondary}
                    disabled={busy || tournamentLocked}
                    onClick={() => save("LIVE")}
                  >
                    Mark live
                  </button>
                  <button
                    className={s.button + " " + s.danger}
                    disabled={busy || tournamentLocked}
                    onClick={() => save("CANCELLED")}
                  >
                    Cancel
                  </button>
                </>}
              </div>
            </section>

            {correctionOpen && <div role="dialog" aria-modal="true" onClick={() => !busy && setCorrectionOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.48)", backdropFilter: "blur(3px)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}><div onClick={e => e.stopPropagation()} style={{ width: "min(440px,100%)", background: "#fff", borderRadius: "26px 26px 0 0", padding: 20, boxShadow: "0 -12px 35px rgba(0,0,0,.16)" }}><div style={{ width: 48, height: 5, background: "#d7dfdb", borderRadius: 99, margin: "-3px auto 16px" }} /><h3 style={{ margin: 0, fontSize: 17 }}>Admin score correction</h3><p style={{ margin: "6px 0 14px", fontSize: 10, color: "#72867e" }}>This completed match is locked. Enter the tournament's 6-digit admin PIN to edit the saved score.</p><label style={{ display: "block", fontSize: 9, fontWeight: 900, color: "#61736b", letterSpacing: ".08em", marginBottom: 6 }}>ADMIN PIN</label><input autoFocus inputMode="numeric" maxLength={6} type="password" value={adminPin} onChange={e => setAdminPin(e.target.value.replace(/\D/g, "").slice(0, 6))} className={s.input} placeholder="6-digit PIN" style={{ letterSpacing: ".28em", fontWeight: 900, textAlign: "center" }} />{error && <div className={s.error} style={{ marginTop: 10 }}>{error}</div>}<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}><button type="button" disabled={busy} onClick={() => setCorrectionOpen(false)} className={`${s.button} ${s.secondary}`}>Cancel</button><button type="button" disabled={busy} onClick={correctCompletedScore} className={s.button}>{busy ? "Checking…" : "Save correction"}</button></div></div></div>}
          </>
        )}
      </div>
    </main>
  );
}

export default function MatchDetail() {
  return (
    <Suspense
      fallback={
        <main className={s.page}>
          <div className={s.shell}>
            <div className={s.card}>Loading match…</div>
          </div>
        </main>
      }
    >
      <MatchDetailContent />
    </Suspense>
  );
}
