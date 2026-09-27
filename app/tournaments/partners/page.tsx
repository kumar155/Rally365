"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { randomPairs } from "../../../lib/tournament";
import s from "../tournament.module.css";

type CommonPlayer = { id: string; name: string; group_id: string };
type TournamentPlayer = { id: string; display_name: string; avatar_url: string | null; seed: number | null; status: string };
type Duo = { id: string; name: string; player_one_id: string; player_two_id: string; seed: number | null; status: string; source?: string };

export default function Partners() {
  const [id, setId] = useState("");
  const [commonPlayers, setCommonPlayers] = useState<CommonPlayer[]>([]);
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [duos, setDuos] = useState<Duo[]>([]);
  const [mode, setMode] = useState("RANDOM");
  const [fixed, setFixed] = useState<string[]>([]);
  const [newPlayer, setNewPlayer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);

  useEffect(() => setId(new URLSearchParams(window.location.search).get("id") || ""), []);

  async function load() {
    if (!id) return;
    setError("");

    const [{ data: cp, error: cpe }, { data: p, error: pe }, { data: d, error: de }] = await Promise.all([
      supabase.from("players").select("id,name,group_id").order("name"),
      supabase.from("tournament_players").select("id,display_name,avatar_url,seed,status").eq("tournament_id", id).eq("status", "ACTIVE").order("display_name"),
      supabase.from("tournament_duos").select("id,name,player_one_id,player_two_id,seed,status,source").eq("tournament_id", id).order("created_at"),
    ]);

    if (cpe || pe || de) {
      setError(cpe?.message || pe?.message || de?.message || "Could not load players.");
      return;
    }

    setCommonPlayers((cp as CommonPlayer[]) || []);
    setPlayers((p as TournamentPlayer[]) || []);
    setDuos((d as Duo[]) || []);
  }

  useEffect(() => { load(); }, [id]);

  const pairedTournamentPlayerIds = useMemo(() => {
    const result = new Set<string>();
    duos.filter(d => d.status === "ACTIVE").forEach(d => {
      result.add(d.player_one_id);
      result.add(d.player_two_id);
    });
    return result;
  }, [duos]);

  const tournamentPlayerByName = useMemo(() => {
    const result = new Map<string, TournamentPlayer>();
    players.forEach(p => result.set(p.display_name.trim().toLowerCase(), p));
    return result;
  }, [players]);

  const availableFixedPlayers = useMemo(() => commonPlayers.filter(p => {
    const tournamentPlayer = tournamentPlayerByName.get(p.name.trim().toLowerCase());
    return !tournamentPlayer || !pairedTournamentPlayerIds.has(tournamentPlayer.id);
  }), [commonPlayers, pairedTournamentPlayerIds, tournamentPlayerByName]);

  async function ensureTournamentPlayer(player: CommonPlayer) {
    const existing = tournamentPlayerByName.get(player.name.trim().toLowerCase());
    if (existing) return existing;

    const { data, error } = await supabase.from("tournament_players").insert({
      tournament_id: id,
      display_name: player.name,
      status: "ACTIVE",
    }).select("id,display_name,avatar_url,seed,status").single();

    if (error) throw error;
    return data as TournamentPlayer;
  }

  async function addNewPlayer() {
    const name = newPlayer.trim();
    if (!name || !id) return;

    setAddingPlayer(true);
    setError("");
    try {
      const { data: groups, error: groupError } = await supabase.from("groups").select("id").order("created_at").limit(1);
      if (groupError) throw groupError;
      const groupId = groups?.[0]?.id;
      if (!groupId) throw new Error("No player group is available.");

      const { data: existing, error: existingError } = await supabase.from("players").select("id,name,group_id").eq("group_id", groupId).ilike("name", name).maybeSingle();
      if (existingError) throw existingError;

      let player = existing as CommonPlayer | null;
      if (!player) {
        const { data, error: insertError } = await supabase.from("players").insert({ group_id: groupId, name }).select("id,name,group_id").single();
        if (insertError) throw insertError;
        player = data as CommonPlayer;
      }

      await ensureTournamentPlayer(player);
      setNewPlayer("");
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not add player.");
    } finally {
      setAddingPlayer(false);
    }
  }

  async function addCommonPlayerToTournament(player: CommonPlayer) {
    setBusy(true);
    setError("");
    try {
      await ensureTournamentPlayer(player);
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not add player to this tournament.");
    } finally {
      setBusy(false);
    }
  }

  async function clearDraft() {
    if (!duos.length) return;
    const { error } = await supabase.from("tournament_duos").delete().eq("tournament_id", id).eq("status", "ACTIVE");
    if (error) throw error;
  }

  async function generateRandom() {
    if (players.length < 2) return setError("Add at least two players to this tournament.");
    if (players.length % 2) return setError("Add one more player so everyone can be paired.");
    setBusy(true);
    setError("");
    try {
      await clearDraft();
      const pairs = randomPairs(players);
      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        const { error } = await supabase.from("tournament_duos").insert({
          tournament_id: id,
          name: pair.map(p => p.display_name).join(" + "),
          player_one_id: pair[0].id,
          player_two_id: pair[1].id,
          seed: i + 1,
          status: "ACTIVE",
          source: "RANDOM",
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
      const selected = fixed.map(playerId => commonPlayers.find(p => p.id === playerId)).filter(Boolean) as CommonPlayer[];
      const pair = await Promise.all(selected.map(ensureTournamentPlayer));
      const { error } = await supabase.from("tournament_duos").insert({
        tournament_id: id,
        name: pair.map(p => p.display_name).join(" + "),
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

  const path = (p: string) => `/tournaments/${p}?id=${encodeURIComponent(id)}`;

  if (!id) return <main className={s.page}><div className={s.shell}><div className={s.card}>Tournament ID is missing.</div></div></main>;

  return <main className={s.page}>
    <div className={s.shell}>
      <div className={s.mobileTournamentHeader}><Link href={path("manage")} className={s.iconBack}>‹</Link><span>Rally365 Open</span><span className={s.menuDots}>⋮</span></div>
      <nav className={s.tabs}>
        <Link className={s.tab} href={path("manage")}>Overview</Link>
        <Link className={s.tab} href={path("draw")}>Draw</Link>
        <Link className={s.tab} href={path("matches")}>Matches</Link>
        <Link className={s.tab} href={path("standings")}>Standings</Link>
        <Link className={s.tab} href={path("players")}>Players</Link>
      </nav>

      {error && <div className={s.error}>{error}</div>}

      <div className={s.tabs} style={{ marginTop: 8 }}>
        <button className={`${s.tab} ${mode === "RANDOM" ? s.tabActive : ""}`} onClick={() => setMode("RANDOM")}>Random partners</button>
        <button className={`${s.tab} ${mode === "FIXED" ? s.tabActive : ""}`} onClick={() => setMode("FIXED")}>Already fixed</button>
      </div>

      {mode === "RANDOM" ? <section className={s.hero}>
        <h2 style={{ fontWeight: 400 }}>Random partners</h2>
        <p>Shuffle the players currently added to this tournament and create two-player teams.</p>
        <button className={s.button} style={{ marginTop: 14, background: "#fff", color: "#08754f" }} disabled={busy} onClick={generateRandom}>{busy ? "Generating…" : "Generate random partners"}</button>
      </section> : <section className={s.card}>
        <div className={s.eyebrow}>ALREADY FIXED</div>
        <h2 style={{ fontWeight: 400, marginBottom: 8 }}>Fixed partners</h2>
        <p className={s.sub}>Select two individuals to make a fixed team. Players already in a team are removed from this list.</p>

        <div className={s.playerGrid} style={{ marginTop: 18 }}>
          {availableFixedPlayers.map(player => {
            const selected = fixed.includes(player.id);
            return <label className={s.playerCard} key={player.id} style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={selected} disabled={fixed.length === 2 && !selected} onChange={e => setFixed(v => e.target.checked ? [...v, player.id] : v.filter(x => x !== player.id))} />
              <div className={s.avatar} style={{ marginTop: 8 }}>{player.name.charAt(0).toUpperCase()}</div>
              <span style={{ fontWeight: 400 }}>{player.name}</span>
            </label>;
          })}
        </div>

        {!availableFixedPlayers.length && <p className={s.sub} style={{ marginTop: 16 }}>All available players are already assigned to teams.</p>}

        <div className={s.footerActions} style={{ marginTop: 18 }}>
          <button className={s.button} disabled={busy || fixed.length !== 2} onClick={addFixed}>Add fixed pair</button>
        </div>

        <div className={s.card} style={{ marginTop: 18, background: "#f7faf8" }}>
          <div className={s.eyebrow}>NEW PLAYER</div>
          <p className={s.sub}>Add a player here and they will be saved to the common player directory and this tournament.</p>
          <div className={s.row} style={{ gap: 10, marginTop: 10 }}>
            <input className={s.input} value={newPlayer} onChange={e => setNewPlayer(e.target.value)} placeholder="Player name" />
            <button className={s.button} disabled={addingPlayer || !newPlayer.trim()} onClick={addNewPlayer}>{addingPlayer ? "Adding…" : "Add player"}</button>
          </div>
        </div>
      </section>}

      <section className={s.card} style={{ marginTop: 14 }}>
        <div className={s.sectionHeader}>
          <div><div className={s.eyebrow}>TEAMS</div><h2 style={{ fontWeight: 400 }}>{duos.length} pairs ready</h2></div>
          <Link href={path("draw")} className={s.secondaryButton}>Draw →</Link>
        </div>
        <div className={s.grid2}>{duos.map((d, i) => <div className={s.matchTile} key={d.id}><div className={s.matchTileTop}><span>Team {i + 1}</span><span>{d.source === "FIXED" ? "FIXED" : d.status}</span></div><h3 style={{ margin: "10px 0 0", fontWeight: 400 }}>{d.name}</h3></div>)}</div>
        {!duos.length && <p className={s.sub}>No pairs created yet.</p>}
      </section>
    </div>
  </main>;
}
