"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import s from "../tournament.module.css";

type Duo = { id: string; name: string };
type Match = {
  team_a_duo_id: string | null;
  team_b_duo_id: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  status: string;
};
type Row = Duo & {
  played: number;
  wins: number;
  losses: number;
  gf: number;
  ga: number;
  points: number;
};

function initials(name: string) {
  return name
    .split("+")
    .map((part) => part.trim()[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function Standings() {
  const [id, setId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id") || "");
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: d, error: de }, { data: m, error: me }] = await Promise.all([
        supabase.from("tournament_duos").select("id,name").eq("tournament_id", id).order("created_at"),
        supabase.from("tournament_matches").select("team_a_duo_id,team_b_duo_id,team_a_score,team_b_score,status").eq("tournament_id", id),
      ]);

      if (de || me) {
        setError(de?.message || me?.message || "Could not load standings");
        return;
      }

      const map = new Map<string, Row>(
        (d || []).map((x) => [x.id, { ...x, played: 0, wins: 0, losses: 0, gf: 0, ga: 0, points: 0 }])
      );

      for (const x of (m || []) as Match[]) {
        if (x.status !== "COMPLETED" && x.status !== "WALKOVER") continue;
        const a = x.team_a_duo_id ? map.get(x.team_a_duo_id) : null;
        const b = x.team_b_duo_id ? map.get(x.team_b_duo_id) : null;
        if (!a || !b) continue;
        const sa = Number(x.team_a_score ?? 0);
        const sb = Number(x.team_b_score ?? 0);
        a.played++;
        b.played++;
        a.gf += sa;
        a.ga += sb;
        b.gf += sb;
        b.ga += sa;
        if (sa > sb) {
          a.wins++;
          a.points += 1;
          b.losses++;
        } else if (sb > sa) {
          b.wins++;
          b.points += 1;
          a.losses++;
        }
      }

      setRows(
        [...map.values()].sort(
          (a, b) => b.points - a.points || b.wins - a.wins || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf
        )
      );
    })();
  }, [id]);

  const path = (p: string) => `/tournaments/${p}?id=${encodeURIComponent(id)}`;

  if (!id) {
    return (
      <main className={s.page}>
        <div className={s.shell}>
          <div className={s.card}>Tournament ID is missing.</div>
        </div>
      </main>
    );
  }

  return (
    <main className={s.page}>
      <div className={s.shell}>
        <div className={s.mobileTournamentHeader}>
          <Link href={path("manage")} className={s.iconBack} aria-label="Back">‹</Link>
          <strong>Rally365 Open</strong>
          <span className={s.menuDots}>⋮</span>
        </div>

        <div className={s.top}>
          <div>
            <div className={s.brand}>RALLY365 OPEN</div>
            <h1 className={s.title}>Standings</h1>
            <p className={s.sub}>Live ranking from completed tournament matches.</p>
          </div>
          <Link href={path("manage")} className={s.secondaryButton}>← Overview</Link>
        </div>

        <nav className={s.tabs}>
          <Link className={s.tab} href={path("manage")}>Overview</Link>
          <Link className={s.tab} href={path("draw")}>Draw</Link>
          <Link className={s.tab} href={path("matches")}>Matches</Link>
          <Link className={`${s.tab} ${s.tabActive}`} href={path("standings")}>Standings</Link>
          <Link className={s.tab} href={path("players")}>Players</Link>
        </nav>

        {error && <div className={s.error}>{error}</div>}

        <section className={s.leaderboardCard}>
          <div className={s.leaderboardHeader}>
            <div>
              <div className={s.eyebrow}>STANDINGS</div>
              <h2>Tournament table</h2>
              <p>Live ranking from completed tournament matches</p>
            </div>
            <span className={s.teamCount}>{rows.length} teams</span>
          </div>

          <div className={s.standingSwitch}>
            <button className={`${s.switchButton} ${s.switchActive}`}>Group / Knockout</button>
            <button className={s.switchButton}>Points (if group)</button>
          </div>

          <div className={s.standingTable}>
            <div className={s.standingHead}>
              <span>#</span>
              <span>Team</span>
              <span>P</span>
              <span>W</span>
              <span>L</span>
              <span>Pts</span>
            </div>

            {rows.map((r, i) => (
              <div className={`${s.standingRow} ${i === 0 ? s.standingLeader : ""}`} key={r.id}>
                <span className={s.rank}>{i + 1}</span>
                <div className={s.standingTeam}>
                  <div className={s.duoAvatar} aria-hidden="true">{initials(r.name)}</div>
                  <div>
                    <strong>{r.name}</strong>
                    <small>{r.played} played · {r.wins} won · {r.losses} lost</small>
                  </div>
                </div>
                <span>{r.played}</span>
                <span>{r.wins}</span>
                <span>{r.losses}</span>
                <strong className={s.points}>{r.points}</strong>
              </div>
            ))}
          </div>

          {!rows.length && <p className={s.sub}>No teams yet.</p>}
        </section>
      </div>
    </main>
  );
}
