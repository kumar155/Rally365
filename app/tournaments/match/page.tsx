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
  const [m, setM] = useState<M | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [a, setA] = useState("0");
  const [b, setB] = useState("0");
  const [resultA, setResultA] = useState<Result>(null);
  const [resultB, setResultB] = useState<Result>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setMatchId(legacy || queryId), [queryId, legacy]);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;

    (async () => {
      setError("");
      setRound(null);

      const { data, error } = await supabase
        .from("tournament_matches")
        .select(
          "id,tournament_id,round_id,match_number,team_a_score,team_b_score,status,scheduled_at,court,team_a_duo_id,team_b_duo_id,winner_duo_id,team_a:tournament_duos!tournament_matches_team_a_duo_id_fkey(name),team_b:tournament_duos!tournament_matches_team_b_duo_id_fkey(name)"
        )
        .eq("id", matchId)
        .single();

      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }

      const x = data as unknown as M;
      setM(x);
      setTournamentId(x.tournament_id);
      setA(String(x.team_a_score ?? 0));
      setB(String(x.team_b_score ?? 0));

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

        if (!cancelled) {
          if (roundError) setError(roundError.message);
          else setRound(roundData as Round);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [matchId]);

  function chooseResult(side: "A" | "B", result: Exclude<Result, null>) {
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
    if (!m) return;
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

    const { error } = await supabase
      .from("tournament_matches")
      .update({
        team_a_score: na,
        team_b_score: nb,
        status,
        winner_duo_id: winnerId,
      })
      .eq("id", m.id);

    if (error) {
      setError(error.message);
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

  if (!matchId)
    return (
      <main className={s.page}>
        <div className={s.shell}>
          <div className={s.card}>Match information is missing.</div>
        </div>
      </main>
    );

  const roundTitle = round?.name || "Match";

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
    cursor: "pointer",
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
                    onChange={(e) => setA(e.target.value)}
                    aria-label="Team A score"
                    style={{ width: 72, minWidth: 72, padding: "4px 2px", fontSize: 34 }}
                  />
                  <div style={{ display: "flex", gap: 4 }}>
                    <button type="button" onClick={() => chooseResult("A", "WIN")} style={outcomeButtonStyle(resultA === "WIN", "WIN")}>Win</button>
                    <button type="button" onClick={() => chooseResult("A", "LOSE")} style={outcomeButtonStyle(resultA === "LOSE", "LOSE")}>Lose</button>
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
                    onChange={(e) => setB(e.target.value)}
                    aria-label="Team B score"
                    style={{ width: 72, minWidth: 72, padding: "4px 2px", fontSize: 34 }}
                  />
                  <div style={{ display: "flex", gap: 4 }}>
                    <button type="button" onClick={() => chooseResult("B", "WIN")} style={outcomeButtonStyle(resultB === "WIN", "WIN")}>Win</button>
                    <button type="button" onClick={() => chooseResult("B", "LOSE")} style={outcomeButtonStyle(resultB === "LOSE", "LOSE")}>Lose</button>
                  </div>
                </div>
              </div>

              <div className={s.actions} style={{ marginTop: 18 }}>
                <button
                  className={s.button}
                  disabled={busy || !m.team_a_duo_id || !m.team_b_duo_id}
                  onClick={() => save("COMPLETED")}
                >
                  {busy ? "Saving…" : "Save score"}
                </button>
                <button
                  className={s.button + " " + s.secondary}
                  disabled={busy}
                  onClick={() => save("LIVE")}
                >
                  Mark live
                </button>
                <button
                  className={s.button + " " + s.danger}
                  disabled={busy}
                  onClick={() => save("CANCELLED")}
                >
                  Cancel
                </button>
              </div>
            </section>
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
