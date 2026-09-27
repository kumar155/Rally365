"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import s from "../tournament.module.css";

type CommonPlayer = { id: string; name: string; group_id: string };
type TournamentPlayer = { id: string; display_name: string; avatar_url: string | null; seed: number | null; status: string };

export default function Players() {
  const [id, setId] = useState("");
  const [commonPlayers, setCommonPlayers] = useState<CommonPlayer[]>([]);
  const [tournamentPlayers, setTournamentPlayers] = useState<TournamentPlayer[]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => setId(new URLSearchParams(window.location.search).get("id") || ""), []);

  async function load() {
    if (!id) return;
    const [{ data: cp, error: cpe }, { data: tp, error: tpe }] = await Promise.all([
      supabase.from("players").select("id,name,group_id").order("name"),
      supabase.from("tournament_players").select("id,display_name,avatar_url,seed,status").eq("tournament_id", id).order("created_at"),
    ]);
    if (cpe || tpe) {
      setError(cpe?.message || tpe?.message || "Could not load players.");
      return;
    }
    setCommonPlayers((cp as CommonPlayer[]) || []);
    setTournamentPlayers((tp as TournamentPlayer[]) || []);
  }

  useEffect(() => { load(); }, [id]);

  const tournamentNames = useMemo(() => new Set(tournamentPlayers.map(p => p.display_name.trim().toLowerCase())), [tournamentPlayers]);
  const filtered = commonPlayers.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  async function addCommonPlayerToTournament(player: CommonPlayer) {
    if (!id || tournamentNames.has(player.name.trim().toLowerCase())) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.from("tournament_players").insert({ tournament_id: id, display_name: player.name, status: "ACTIVE" });
      if (error) throw error;
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not add player to this tournament.");
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const playerName = name.trim();
    if (!id || !playerName) return;
    setBusy(true);
    setError("");
    try {
      const { data: groups, error: groupError } = await supabase.from("groups").select("id").order("created_at").limit(1);
      if (groupError) throw groupError;
      const groupId = groups?.[0]?.id;
      if (!groupId) throw new Error("No player group is available.");

      const { data: existing, error: existingError } = await supabase.from("players").select("id,name,group_id").eq("group_id", groupId).ilike("name", playerName).maybeSingle();
      if (existingError) throw existingError;

      let commonPlayer = existing as CommonPlayer | null;
      if (!commonPlayer) {
        const { data, error: insertError } = await supabase.from("players").insert({ group_id: groupId, name: playerName }).select("id,name,group_id").single();
        if (insertError) throw insertError;
        commonPlayer = data as CommonPlayer;
      }

      await addCommonPlayerToTournament(commonPlayer);
      setName("");
      setShowAdd(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not add player.");
    } finally {
      setBusy(false);
    }
  }

  async function removeFromTournament(pid: string) {
    const { error } = await supabase.from("tournament_players").delete().eq("id", pid).eq("tournament_id", id);
    if (error) setError(error.message); else await load();
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
        <Link className={`${s.tab} ${s.tabActive}`} href={path("players")}>Players</Link>
      </nav>

      {error && <div className={s.error}>{error}</div>}

      <div className={s.row}>
        <div><div className={s.eyebrow}>PLAYER DIRECTORY</div><h1 className={s.title} style={{ fontWeight: 400 }}>Players</h1><p className={s.sub}>This is the shared player list. Players added here can be reused in any tournament.</p></div>
        <button className={s.button} onClick={() => setShowAdd(v => !v)}>+ Add player</button>
      </div>

      {showAdd && <form className={s.card} style={{ margin: "12px 0" }} onSubmit={add}>
        <div className={s.field}><label>New player</label><input className={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="Player name" autoFocus /></div>
        <div className={s.actions}><button className={`${s.button} ${s.secondary}`} type="button" onClick={() => setShowAdd(false)}>Cancel</button><button className={s.button} disabled={busy || !name.trim()}>{busy ? "Adding…" : "Add to directory + tournament"}</button></div>
      </form>}

      <input className={s.input} style={{ margin: "10px 0 12px" }} value={search} onChange={e => setSearch(e.target.value)} placeholder="⌕  Search players…" />

      <section className={s.card}>
        <div className={s.sectionHeader}>
          <div><div className={s.eyebrow}>AVAILABLE PLAYERS</div><h2 style={{ fontWeight: 400 }}>{filtered.length} players</h2></div>
          <span className={s.sub}>{tournamentPlayers.length} in this tournament</span>
        </div>

        <div className={s.playerGrid}>
          {filtered.map(player => {
            const inTournament = tournamentNames.has(player.name.trim().toLowerCase());
            return <article className={s.playerCard} key={player.id}>
              <div className={s.avatar}>{player.name.charAt(0).toUpperCase()}</div>
              <span style={{ fontWeight: 400 }}>{player.name}</span>
              <span>{inTournament ? "Added to tournament" : "Available"}</span>
              {inTournament ? <button type="button" className={`${s.button} ${s.secondary}`} style={{ marginTop: 8, width: "100%", padding: "7px", fontSize: 11 }} onClick={() => {
                const tournamentPlayer = tournamentPlayers.find(p => p.display_name.trim().toLowerCase() === player.name.trim().toLowerCase());
                if (tournamentPlayer) removeFromTournament(tournamentPlayer.id);
              }}>Remove from tournament</button> : <button type="button" className={s.button} style={{ marginTop: 8, width: "100%", padding: "7px", fontSize: 11 }} disabled={busy} onClick={() => addCommonPlayerToTournament(player)}>Add to tournament</button>}
            </article>;
          })}
        </div>
        {!filtered.length && <p className={s.sub}>No players found.</p>}
      </section>
    </div>
  </main>;
}
