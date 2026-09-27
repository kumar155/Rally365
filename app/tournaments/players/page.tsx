"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import s from "../tournament.module.css";

type DirectoryPlayer = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

type TournamentPlayer = {
  id: string;
  directory_player_id: string;
  display_name: string;
  avatar_url: string | null;
  seed: number | null;
  status: string;
};

export default function Players() {
  const [id, setId] = useState("");
  const [directory, setDirectory] = useState<DirectoryPlayer[]>([]);
  const [members, setMembers] = useState<TournamentPlayer[]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id") || "");
  }, []);

  async function load() {
    if (!id) return;
    setError("");

    const [{ data: allPlayers, error: directoryError }, { data: tournamentPlayers, error: memberError }] = await Promise.all([
      supabase
        .from("tournament_player_directory")
        .select("id,display_name,avatar_url")
        .order("display_name"),
      supabase
        .from("tournament_players")
        .select("id,directory_player_id,display_name,avatar_url,seed,status")
        .eq("tournament_id", id)
        .eq("status", "ACTIVE")
        .order("created_at"),
    ]);

    if (directoryError || memberError) {
      setError(directoryError?.message || memberError?.message || "Could not load tournament players.");
    }
    setDirectory((allPlayers as DirectoryPlayer[]) || []);
    setMembers((tournamentPlayers as TournamentPlayer[]) || []);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function addExisting(player: DirectoryPlayer) {
    if (!id) return;
    setBusyId(player.id);
    setError("");

    const { error: insertError } = await supabase.from("tournament_players").insert({
      tournament_id: id,
      directory_player_id: player.id,
      display_name: player.display_name,
      avatar_url: player.avatar_url,
      status: "ACTIVE",
    });

    if (insertError && insertError.code !== "23505") setError(insertError.message);
    await load();
    setBusyId(null);
  }

  async function addNew(e: React.FormEvent) {
    e.preventDefault();
    const displayName = name.trim();
    if (!id || !displayName) return;

    setBusyId("new");
    setError("");
    try {
      const { data: directoryPlayer, error: directoryError } = await supabase
        .from("tournament_player_directory")
        .upsert({ display_name: displayName }, { onConflict: "display_name" })
        .select("id,display_name,avatar_url")
        .single();

      if (directoryError || !directoryPlayer) throw directoryError || new Error("Could not create player.");

      const { error: membershipError } = await supabase.from("tournament_players").upsert(
        {
          tournament_id: id,
          directory_player_id: directoryPlayer.id,
          display_name: directoryPlayer.display_name,
          avatar_url: directoryPlayer.avatar_url,
          status: "ACTIVE",
        },
        { onConflict: "tournament_id,directory_player_id" }
      );

      if (membershipError) throw membershipError;
      setName("");
      setShowAdd(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not add player.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeFromTournament(player: TournamentPlayer) {
    if (!id) return;
    setBusyId(player.directory_player_id);
    setError("");
    const { error: removeError } = await supabase
      .from("tournament_players")
      .delete()
      .eq("id", player.id)
      .eq("tournament_id", id);

    if (removeError) setError(removeError.message);
    await load();
    setBusyId(null);
  }

  const memberIds = useMemo(() => new Set(members.map((p) => p.directory_player_id)), [members]);
  const filtered = directory.filter((p) => p.display_name.toLowerCase().includes(search.toLowerCase()));
  const path = (p: string) => `/tournaments/${p}?id=${encodeURIComponent(id)}`;

  if (!id) {
    return <main className={s.page}><div className={s.shell}><div className={s.card}>Tournament ID is missing.</div></div></main>;
  }

  return (
    <main className={s.page}>
      <div className={s.shell}>
        <div className={s.mobileTournamentHeader}>
          <Link href={path("manage")} className={s.iconBack}>‹</Link>
          <strong>Rally365 Open</strong>
          <span className={s.menuDots}>⋮</span>
        </div>

        <nav className={s.tabs}>
          <Link className={s.tab} href={path("manage")}>Overview</Link>
          <Link className={s.tab} href={path("draw")}>Draw</Link>
          <Link className={s.tab} href={path("matches")}>Matches</Link>
          <Link className={s.tab} href={path("standings")}>Standings</Link>
          <Link className={`${s.tab} ${s.tabActive}`} href={path("players")}>Players</Link>
        </nav>

        {error && <div className={s.error}>{error}</div>}

        <div className={s.filterTabs}>
          <button className={`${s.filterTab} ${s.filterActive}`}>Available ({directory.length})</button>
          <Link className={s.filterTab} href={path("partners")}>Duos ({Math.floor(members.length / 2)})</Link>
        </div>

        <div className={s.row}>
          <div>
            <div className={s.eyebrow}>TOURNAMENT PLAYERS</div>
            <h1 className={s.title}>Player directory</h1>
            <p className={s.sub}>Players here belong to the Tournament module, not the regular badminton app.</p>
          </div>
          <button className={s.button} onClick={() => setShowAdd((v) => !v)}>+ Add player</button>
        </div>

        {showAdd && (
          <form className={s.card} style={{ margin: "12px 0" }} onSubmit={addNew}>
            <div className={s.field}>
              <label>New player</label>
              <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" autoFocus />
            </div>
            <div className={s.actions}>
              <button className={`${s.button} ${s.secondary}`} type="button" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className={s.button} disabled={busyId === "new" || !name.trim()}>{busyId === "new" ? "Adding…" : "Add and use"}</button>
            </div>
          </form>
        )}

        <input className={s.input} style={{ margin: "10px 0 12px" }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="⌕  Search tournament players…" />

        <div className={s.playerGrid}>
          {filtered.map((p) => {
            const added = memberIds.has(p.id);
            const member = members.find((m) => m.directory_player_id === p.id);
            return (
              <article className={s.playerCard} key={p.id}>
                <div className={s.avatar}>{p.avatar_url ? <img src={p.avatar_url} alt="" /> : p.display_name.charAt(0).toUpperCase()}</div>
                <strong>{p.display_name}</strong>
                <span>{added ? "In this tournament" : "Available"}</span>
                {added ? (
                  <button type="button" className={`${s.button} ${s.secondary}`} style={{ marginTop: 8, width: "100%", padding: "6px", fontSize: 10 }} disabled={busyId === p.id} onClick={() => member && removeFromTournament(member)}>
                    {busyId === p.id ? "Removing…" : "Remove from tournament"}
                  </button>
                ) : (
                  <button type="button" className={s.button} style={{ marginTop: 8, width: "100%", padding: "6px", fontSize: 10 }} disabled={busyId === p.id} onClick={() => addExisting(p)}>
                    {busyId === p.id ? "Adding…" : "Add to tournament"}
                  </button>
                )}
              </article>
            );
          })}
        </div>

        {!filtered.length && <div className={s.card}>No tournament players found.</div>}
      </div>
    </main>
  );
}
