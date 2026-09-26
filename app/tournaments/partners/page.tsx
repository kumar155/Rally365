"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { randomPairs } from "../../../lib/tournament";
import s from "../tournament.module.css";

type P = { id: string; display_name: string };
type D = {
  id: string;
  name: string;
  player_one_id: string;
  player_two_id: string;
  seed: number | null;
  status: string;
};

export default function Partners() {
  const [id, setId] = useState("");
  const [players, setPlayers] = useState<P[]>([]);
  const [duos, setDuos] = useState<D[]>([]);
  const [mode, setMode] = useState("RANDOM");
  const [fixed, setFixed] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id") || "");
  }, []);

  async function load() {
    if (!id) return;
    const [{ data: p, error: pe }, { data: d, error: de }] = await Promise.all([
      supabase
        .from("tournament_players")
        .select("id,display_name")
        .eq("tournament_id", id)
        .eq("status", "ACTIVE")
        .order("display_name"),
      supabase
        .from("tournament_duos")
        .select("id,name,player_one_id,player_two_id,seed,status")
        .eq("tournament_id", id)
        .order("created_at"),
    ]);

    if (pe || de) setError(pe?.message || de?.message || "Could not load partners.");
    setPlayers((p as P[]) || []);
    setDuos((d as D[]) || []);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function clearDraft() {
    if (!duos.length) return;
    const { error } = await supabase
      .from("tournament_duos")
      .delete()
      .eq("tournament_id", id)
      .eq("status", "ACTIVE");
    if (error) throw error;
  }

  async function generateRandom() {
    if (players.length < 2) return setError("Add at least two players.");
    setBusy(true);
    setError("");
    try {
      await clearDraft();
      const pairs = randomPairs(players);
      if (pairs.some((pair) => pair.length !== 2)) {
        throw new Error("The number of players must be even to generate all partners.");
      }
      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        const { error } = await supabase.from("tournament_duos").insert({
          tournament_id: id,
          name: pair.map((p) => p.display_name).join(" + "),
          player_one_id: pair[0].id,
          player_two_id: pair[1].id,
          seed: i + 1,
          status: "ACTIVE",
        });
        if (error) throw error;
      }
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not create random partners.");
    } finally {
      setBusy(false);
    }
  }

  async function addFixed() {
    if (fixed.length !== 2) return setError("Select exactly two players.");
    setBusy(true);
    setError("");
    try {
      const pair = fixed.map((x) => players.find((p) => p.id === x)).filter(Boolean) as P[];
      const { error } = await supabase.from("tournament_duos").insert({
        tournament_id: id,
        name: pair.map((p) => p.display_name).join(" + "),
        player_one_id: pair[0].id,
        player_two_id: pair[1].id,
        seed: duos.length + 1,
        status: "ACTIVE",
      });
      if (error) throw error;
      setFixed([]);
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not create fixed pair.");
    } finally {
      setBusy(false);
    }
  }

  const playerName = (playerId: string) =>
    players.find((p) => p.id === playerId)?.display_name || "Unknown player";

  const path = (p: string) => `/tournaments/${p}?id=${encodeURIComponent(id)}`;

  if (!id)
    return <main className={s.page}><div className={s.shell}><div className={s.card}>Tournament ID is missing.</div></div></main>;

  return (
    <main className={s.page}>
      <div className={s.shell}>
        <div className={s.brand}>PARTNERS</div>
        <h1 className={s.title}>Build tournament pairs</h1>
        <p className={s.sub}>Choose random partners or create already-fixed pairs.</p>

        <div className={s.tabs}>
          <button className={s.tab + (mode === "RANDOM" ? " " + s.tabActive : "")} onClick={() => setMode("RANDOM")}>Random partners</button>
          <button className={s.tab + (mode === "FIXED" ? " " + s.tabActive : "")} onClick={() => setMode("FIXED")}>Already fixed partners</button>
        </div>

        {mode === "RANDOM" ? (
          <div className={s.card}>
            <h2>Generate random partners</h2>
            <p className={s.muted}>Players are shuffled and paired. An odd player count must be resolved before continuing.</p>
            <button className={s.button} disabled={busy} onClick={generateRandom}>{busy ? "Generating…" : "Generate / regenerate pairs"}</button>
          </div>
        ) : (
          <div className={s.card}>
            <h2>Create a fixed pair</h2>
            <div className={s.grid2}>
              <div className={s.list}>
                {players.map((p) => (
                  <label className={s.check} key={p.id}>
                    <input type="checkbox" checked={fixed.includes(p.id)} disabled={fixed.length === 2 && !fixed.includes(p.id)} onChange={(e) => setFixed((v) => e.target.checked ? [...v, p.id] : v.filter((x) => x !== p.id))}/>
                    {p.display_name}
                  </label>
                ))}
              </div>
              <div><div className={s.hero}><div className={s.metric}>{fixed.length}/2</div><div className={s.muted}>selected</div></div><button className={s.button} disabled={busy || fixed.length !== 2} onClick={addFixed}>Add fixed pair</button></div>
            </div>
          </div>
        )}

        {error && <div className={s.error}>{error}</div>}

        <div className={s.card} style={{ marginTop: 18 }}>
          <div className={s.row}><h2>Current pairs</h2><span className={s.pill}>{duos.length}</span></div>
          <div className={s.list}>
            {duos.map((d, i) => <div className={s.item} key={d.id}><div><strong>{i + 1}. {d.name}</strong><div className={s.muted}>{playerName(d.player_one_id)} + {playerName(d.player_two_id)} · {d.status}</div></div></div>)}
            {!duos.length && <p className={s.muted}>No pairs created yet.</p>}
          </div>
        </div>

        <div className={s.footerActions}>
          <Link href={path("players")} className={s.button + " " + s.secondary}>Back</Link>
          <Link href={path("draw")} className={s.button}>Continue to draw →</Link>
        </div>
      </div>
    </main>
  );
}
