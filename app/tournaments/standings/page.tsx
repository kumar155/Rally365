"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import s from "../tournament.module.css";

type D = { id: string; name: string };
type M = {
  team_a_duo_id: string | null;
  team_b_duo_id: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  status: string;
};
type Row = D & {
  played: number;
  wins: number;
  losses: number;
  gf: number;
  ga: number;
  points: number;
};

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
        supabase
          .from("tournament_duos")
          .select("id,name")
          .eq("tournament_id", id)
          .order("created_at"),
        supabase
          .from("tournament_matches")
          .select("team_a_duo_id,team_b_duo_id,team_a_score,team_b_score,status")
          .eq("tournament_id", id),
      ]);

      if (de || me) {
        setError(de?.message || me?.message || "Could not load standings");
        return;
      }

      const map = new Map<string, Row>(
        (d || []).map((x) => [
          x.id,
          {
            ...x,
            played: 0,
            wins: 0,
            losses: 0,
            gf: 0,
            ga: 0,
            points: 0,
          },
        ])
      );

      for (const x of (m || []) as M[]) {
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
          (a, b) =>
            b.points - a.points ||
            b.wins - a.wins ||
            (b.gf - b.ga) - (a.gf - a.ga) ||
            b.gf - a.gf
        )
      );
    })();
  }, [id]);

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
        <div className={s.brand}>STANDINGS</div>
        <h1 className={s.title}>Tournament table</h1>
        <p className={s.sub}>Live ranking from completed tournament matches.</p>

        {error && <div className={s.error}>{error}</div>}

        <div className={s.card}>
          <div className={s.list}>
            {rows.map((r, i) => (
              <div className={s.item} key={r.id}>
                <div>
                  <strong>{i + 1}. {r.name}</strong>
                  <div className={s.muted}>
                    {r.played} played · {r.wins} wins · {r.losses} losses · {r.gf}-{r.ga}
                  </div>
                </div>
                <div className={s.metric}>{r.points}</div>
              </div>
            ))}
            {!rows.length && <p className={s.muted}>No teams yet.</p>}
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <Link
            href={`/tournaments/manage?id=${encodeURIComponent(id)}`}
            className={s.button + " " + s.secondary}
          >
            ← Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
