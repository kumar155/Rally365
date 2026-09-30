"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import s from "../tournament.module.css";

type DirectoryPlayer = { id: string; display_name: string; avatar_url: string | null };
type TournamentPlayer = { id: string; directory_player_id: string; display_name: string; avatar_url: string | null; seed: number | null; status: string };

export default function Players() {
  const [id, setId] = useState(""); const [directory, setDirectory] = useState<DirectoryPlayer[]>([]); const [members, setMembers] = useState<TournamentPlayer[]>([]); const [name, setName] = useState(""); const [search, setSearch] = useState(""); const [error, setError] = useState(""); const [busyId, setBusyId] = useState<string | null>(null); const [showAdd, setShowAdd] = useState(false); const [locked, setLocked] = useState(false);
  useEffect(() => setId(new URLSearchParams(window.location.search).get("id") || ""), []);
  async function load() {
    if (!id) return; setError("");
    const [{ data: allPlayers, error: directoryError }, { data: tournamentPlayers, error: memberError }, { data: tournament, error: tournamentError }] = await Promise.all([
      supabase.from("tournament_player_directory").select("id,display_name,avatar_url").order("display_name"),
      supabase.from("tournament_players").select("id,directory_player_id,display_name,avatar_url,seed,status").eq("tournament_id", id).eq("status", "ACTIVE").order("created_at"),
      supabase.from("tournaments").select("is_locked").eq("id", id).single(),
    ]);
    if (directoryError || memberError || tournamentError) setError(directoryError?.message || memberError?.message || tournamentError?.message || "Could not load tournament players.");
    setDirectory((allPlayers as DirectoryPlayer[]) || []); setMembers((tournamentPlayers as TournamentPlayer[]) || []); setLocked(!!tournament?.is_locked);
  }
  useEffect(() => { load(); }, [id]);
  async function addExisting(player: DirectoryPlayer) { if (!id || locked) return; setBusyId(player.id); setError(""); const { error: insertError } = await supabase.from("tournament_players").insert({ tournament_id: id, directory_player_id: player.id, display_name: player.display_name, avatar_url: player.avatar_url, status: "ACTIVE" }); if (insertError && insertError.code !== "23505") setError(insertError.message); await load(); setBusyId(null); }
  async function addNew(e: React.FormEvent) { e.preventDefault(); const displayName = name.trim(); if (!id || !displayName || locked) return; setBusyId("new"); setError(""); try { const { data: directoryPlayer, error: directoryError } = await supabase.from("tournament_player_directory").upsert({ display_name: displayName }, { onConflict: "display_name" }).select("id,display_name,avatar_url").single(); if (directoryError || !directoryPlayer) throw directoryError || new Error("Could not create player."); const { error: membershipError } = await supabase.from("tournament_players").upsert({ tournament_id: id, directory_player_id: directoryPlayer.id, display_name: directoryPlayer.display_name, avatar_url: directoryPlayer.avatar_url, status: "ACTIVE" }, { onConflict: "tournament_id,directory_player_id" }); if (membershipError) throw membershipError; setName(""); setShowAdd(false); await load(); } catch (e: any) { setError(e?.message || "Could not add player."); } finally { setBusyId(null); } }
  async function removeFromTournament(player: TournamentPlayer) { if (!id || locked) return; setBusyId(player.directory_player_id); setError(""); const { error: removeError } = await supabase.from("tournament_players").delete().eq("id", player.id).eq("tournament_id", id); if (removeError) setError(removeError.message); await load(); setBusyId(null); }
  const memberIds = useMemo(() => new Set(members.map((p) => p.directory_player_id)), [members]); const filtered = directory.filter((p) => p.display_name.toLowerCase().includes(search.toLowerCase())); const path = (p: string) => `/tournaments/${p}?id=${encodeURIComponent(id)}`;
  if (!id) return <main className={s.page}><div className={s.shell}><div className={s.card}>Tournament ID is missing.</div></div></main>;
  return <main className={s.page}><div className={s.shell}>
    <div className={s.mobileTournamentHeader}><Link href={path("manage")} className={s.iconBack}>‹</Link><strong>Rally365 Open</strong><span className={s.menuDots}>⋮</span></div>
    <nav className={s.tabs}><Link className={s.tab} href={path("manage")}>Overview</Link><Link className={s.tab} href={path("draw")}>Draw</Link><Link className={s.tab} href={path("matches")}>Matches</Link><Link className={s.tab} href={path("standings")}>Standings</Link><Link className={`${s.tab} ${s.tabActive}`} href={path("players")}>Players</Link></nav>
    {locked && <div className={s.card} style={{ marginBottom: 12, padding: 12, background: "#fffaf2", borderColor: "#f0d7ae", display: "flex", alignItems: "center", gap: 9 }}><Lock size={16} color="#a16207" /><div><strong style={{ fontSize: 11, color: "#713f12" }}>Tournament locked</strong><div style={{ fontSize: 9, color: "#8a6b3d" }}>Players cannot be added or removed until an admin unlocks the tournament.</div></div></div>}
    {error && <div className={s.error}>{error}</div>}
    <div className={s.filterTabs}><button className={`${s.filterTab} ${s.filterActive}`}>Available ({directory.length})</button><Link className={s.filterTab} href={path("partners")}>Duos ({Math.floor(members.length / 2)})</Link></div>
    <div className={s.row}><div><div className={s.eyebrow}>TOURNAMENT PLAYERS</div><h1 className={s.title}>Player directory</h1><p className={s.sub}>Players here belong to the Tournament module.</p></div><button className={s.button} disabled={locked} onClick={() => setShowAdd((v) => !v)} style={{ opacity: locked ? .55 : 1 }}>{locked ? "Locked" : "+ Add player"}</button></div>
    {showAdd && !locked && <form className={s.card} style={{ margin: "12px 0" }} onSubmit={addNew}><div className={s.field}><label>New player</label><input className={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Player name" autoFocus /></div><div className={s.actions}><button className={`${s.button} ${s.secondary}`} type="button" onClick={() => setShowAdd(false)}>Cancel</button><button className={s.button} disabled={busyId === "new" || !name.trim()}>{busyId === "new" ? "Adding…" : "Add and use"}</button></div></form>}
    <input className={s.input} style={{ margin: "10px 0 12px" }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="⌕  Search tournament players…" />
    <div className={s.playerList}>{filtered.map((p) => { const added = memberIds.has(p.id); const member = members.find((m) => m.directory_player_id === p.id); return <article className={s.playerRow} key={p.id}><div className={s.playerRowIdentity}><div className={s.avatar}>{p.avatar_url ? <img src={p.avatar_url} alt="" /> : p.display_name.charAt(0).toUpperCase()}</div><div><strong>{p.display_name}</strong><span>{added ? "In this tournament" : "Available"}</span></div></div><div className={s.playerRowAction}>{added ? <button type="button" className={`${s.button} ${s.secondary}`} disabled={locked || busyId === p.id} onClick={() => member && removeFromTournament(member)}>{locked ? "Locked" : busyId === p.id ? "Removing…" : "Remove"}</button> : <button type="button" className={s.button} disabled={locked || busyId === p.id} onClick={() => addExisting(p)}>{locked ? "Locked" : busyId === p.id ? "Adding…" : "Add to tournament"}</button>}</div></article>; })}</div>
    {!filtered.length && <div className={s.card}>No tournament players found.</div>}
  </div></main>;
}
