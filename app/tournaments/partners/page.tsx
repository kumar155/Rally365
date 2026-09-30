"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { randomPairs } from "../../../lib/tournament";
import s from "../tournament.module.css";

type P = { id: string; display_name: string };
type D = { id: string; name: string; player_one_id: string; player_two_id: string; seed: number | null; status: string };

export default function Partners() {
  const [id, setId] = useState("");
  const [players, setPlayers] = useState<P[]>([]);
  const [duos, setDuos] = useState<D[]>([]);
  const [mode, setMode] = useState("RANDOM");
  const [fixed, setFixed] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setId(new URLSearchParams(window.location.search).get("id") || ""), []);

  async function loadPlayers() {
    if (!id) return [] as P[];
    const { data, error } = await supabase
      .from("tournament_players")
      .select("id,display_name")
      .eq("tournament_id", id)
      .eq("status", "ACTIVE")
      .order("display_name");
    if (error) throw error;
    return (data as P[]) || [];
  }

  async function load() {
    if (!id) return;
    const [{ data: p, error: pe }, { data: d, error: de }] = await Promise.all([
      supabase.from("tournament_players").select("id,display_name").eq("tournament_id", id).eq("status", "ACTIVE").order("display_name"),
      supabase.from("tournament_duos").select("id,name,player_one_id,player_two_id,seed,status").eq("tournament_id", id).order("created_at"),
    ]);
    if (pe || de) setError(pe?.message || de?.message || "Could not load partners.");
    setPlayers((p as P[]) || []);
    setDuos((d as D[]) || []);
  }

  useEffect(() => { load(); }, [id]);

  async function clearDraft() {
    if (!duos.length) return;
    const { error } = await supabase.from("tournament_duos").delete().eq("tournament_id", id).eq("status", "ACTIVE");
    if (error) throw error;
  }

  async function generateRandom() {
    setBusy(true);
    setError("");
    try {
      // Re-read the tournament roster immediately before generating. This avoids
      // using a stale player count after returning from the Players screen.
      const freshPlayers = await loadPlayers();
      setPlayers(freshPlayers);

      if (freshPlayers.length < 2) {
        throw new Error(`Only ${freshPlayers.length} active player${freshPlayers.length === 1 ? " is" : "s are"} selected. Add at least two players.`);
      }
      if (freshPlayers.length % 2) {
        const needed = 1;
        throw new Error(`You have ${freshPlayers.length} active players selected. Add ${needed} more player so everyone can be paired.`);
      }

      await clearDraft();
      const pairs = randomPairs(freshPlayers);
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
      if (pair.length !== 2) throw new Error("Selected players are no longer available.");
      const { error } = await supabase.from("tournament_duos").insert({
        tournament_id: id,
        name: pair.map((p) => p.display_name).join(" + "),
        player_one_id: pair[0].id,
        player_two_id: pair[1].id,
        seed: duos.length + 1,
        status: "ACTIVE",
        source: "FIXED",
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

  const pairedIds = useMemo(() => {
    const ids = new Set<string>();
    duos.filter((d) => d.status === "ACTIVE").forEach((d) => {
      ids.add(d.player_one_id);
      ids.add(d.player_two_id);
    });
    return ids;
  }, [duos]);

  const availableForFixed = players.filter((p) => !pairedIds.has(p.id));
  const path = (p: string) => `/tournaments/${p}?id=${encodeURIComponent(id)}`;

  if (!id) return <main className={s.page}><div className={s.shell}><div className={s.card}>Tournament ID is missing.</div></div></main>;

  return (
    <main className={s.page}>
      <div className={s.shell}>
        <div className={s.top}>
          <div><div className={s.brand}>RALLY365 OPEN</div><h1 className={s.title}>Partners</h1><p className={s.sub}>Build the teams that will enter the draw.</p></div>
          <Link href={path("players")} className={s.secondaryButton}>← Players</Link>
        </div>

        <div className={s.tabs}>
          <button className={`${s.tab} ${mode === "RANDOM" ? s.tabActive : ""}`} onClick={() => setMode("RANDOM")}>Random partners</button>
          <button className={`${s.tab} ${mode === "FIXED" ? s.tabActive : ""}`} onClick={() => setMode("FIXED")}>Already fixed</button>
        </div>

        {error && <div className={s.error}>{error}</div>}

        {mode === "RANDOM" ? (
          <section className={s.hero}>
            <h2>Random draw</h2>
            <p>Shuffle all tournament players and create two-player teams. Regenerating replaces the current active pairs.</p>
            <div className={s.sub} style={{ marginTop: 10 }}><strong>{players.length} active players selected</strong>{players.length % 2 ? " · 1 more player required" : ` · ${players.length / 2} pairs possible`}</div>
            <button className={s.button} style={{ marginTop: 14, background: "#fff", color: "#08754f" }} disabled={busy} onClick={generateRandom}>{busy ? "Generating…" : "Generate random partners"}</button>
          </section>
        ) : (
          <section className={s.card}>
            <h2>Fixed partners</h2>
            <p className={s.sub}>Select two available individuals to make a fixed team. Players already assigned to a team are hidden.</p>
            <div className={s.playerGrid} style={{ marginTop: 14 }}>
              {availableForFixed.map((p) => (
                <label className={s.playerCard} key={p.id}>
                  <input type="checkbox" checked={fixed.includes(p.id)} disabled={fixed.length === 2 && !fixed.includes(p.id)} onChange={(e) => setFixed((v) => e.target.checked ? [...v, p.id] : v.filter((x) => x !== p.id))} />
                  <div className={s.avatar} style={{ marginTop: 8 }}>{p.display_name.charAt(0)}</div>
                  <strong>{p.display_name}</strong>
                </label>
              ))}
            </div>
            {!availableForFixed.length && <p className={s.sub}>All tournament players are already assigned to fixed teams.</p>}
            <button className={s.button} style={{ marginTop: 14 }} disabled={busy || fixed.length !== 2} onClick={addFixed}>Add fixed pair</button>
          </section>
        )}

        <section className={s.card} style={{ marginTop: 14 }}>
          <div className={s.sectionHeader}><div><div className={s.eyebrow}>TEAMS</div><h2>{duos.length} pairs ready</h2></div><Link href={path("draw")} className={s.secondaryButton}>Draw →</Link></div>
          <div className={s.grid2}>{duos.map((d, i) => <div className={s.matchTile} key={d.id}><div className={s.matchTileTop}><span>Team {i + 1}</span><span>{d.status}</span></div><h3 style={{ margin: "10px 0 0" }}>{d.name}</h3></div>)}</div>
          {!duos.length && <p className={s.sub}>No pairs created yet.</p>}
        </section>
      </div>
    </main>
  );
}
