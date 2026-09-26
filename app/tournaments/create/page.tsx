"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import s from "../tournament.module.css";

export default function CreateTournament() {
  const router = useRouter();
  const [name, setName] = useState(""); const [venue, setVenue] = useState(""); const [date, setDate] = useState("");
  const [partnerMode, setPartnerMode] = useState("RANDOM"); const [format, setFormat] = useState("KNOCKOUT"); const [rounds, setRounds] = useState("5"); const [groups, setGroups] = useState("2"); const [qualifiers, setQualifiers] = useState("2"); const [games, setGames] = useState("1");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!name.trim() || !venue.trim() || !date) return setError("Tournament name, venue and date are required.");
    setBusy(true); setError("");
    const payload = { name: name.trim(), venue: venue.trim(), start_date: `${date}T00:00:00+05:30`, partner_mode: partnerMode, format, rounds: format === "RANDOM_ROUNDS" ? Number(rounds) : null, group_count: format === "GROUPS_KNOCKOUT" ? Number(groups) : null, qualifiers_per_group: format === "GROUPS_KNOCKOUT" ? Number(qualifiers) : null, games_per_match: Number(games) || 1, status: "UPCOMING", courts: 1, entry_fee: 0 };
    const { data, error } = await supabase.from("tournaments").insert(payload).select("id").single();
    if (error) { setError(error.message); setBusy(false); return; }
    router.push(`/tournaments/players?id=${encodeURIComponent(data.id)}`);
  }

  return <main className={s.page}><div className={s.shell}>
    <div className={s.top}><div><div className={s.brand}>RALLY365 · TOURNAMENTS</div><h1 className={s.title}>Create tournament</h1><p className={s.sub}>Set the competition rules first. Players and partners come next.</p></div></div>
    <form className={s.card} onSubmit={submit}>
      <div className={s.grid2}>
        <div className={s.field}><label>Tournament name</label><input className={s.input} value={name} onChange={e=>setName(e.target.value)} placeholder="Rally365 Open" /></div>
        <div className={s.field}><label>Venue</label><input className={s.input} value={venue} onChange={e=>setVenue(e.target.value)} placeholder="Vega Badminton Hall" /></div>
        <div className={s.field}><label>Date</label><input className={s.input} type="date" value={date} onChange={e=>setDate(e.target.value)} /></div>
        <div className={s.field}><label>Partner mode</label><select className={s.select} value={partnerMode} onChange={e=>setPartnerMode(e.target.value)}><option value="RANDOM">Random partners</option><option value="FIXED">Already fixed partners</option></select></div>
        <div className={s.field}><label>Competition format</label><select className={s.select} value={format} onChange={e=>setFormat(e.target.value)}><option value="KNOCKOUT">All knockout → final</option><option value="ROUND_ROBIN">Round robin</option><option value="GROUPS_KNOCKOUT">Groups → knockout</option><option value="RANDOM_ROUNDS">Random matches by rounds</option></select></div>
        <div className={s.field}><label>Games per match</label><select className={s.select} value={games} onChange={e=>setGames(e.target.value)}><option value="1">1 game</option><option value="3">Best of 3</option></select></div>
        {format === "RANDOM_ROUNDS" && <div className={s.field}><label>Number of rounds</label><input className={s.input} type="number" min="1" value={rounds} onChange={e=>setRounds(e.target.value)} /></div>}
        {format === "GROUPS_KNOCKOUT" && <><div className={s.field}><label>Number of groups</label><input className={s.input} type="number" min="1" value={groups} onChange={e=>setGroups(e.target.value)} /></div><div className={s.field}><label>Qualifiers per group</label><input className={s.input} type="number" min="1" value={qualifiers} onChange={e=>setQualifiers(e.target.value)} /></div></>}
      </div>
      {error && <div className={s.error}>{error}</div>}
      <div className={s.footerActions}><a href="/tournaments" className={`${s.button} ${s.secondary}`}>Cancel</a><button className={s.button} disabled={busy}>{busy ? "Creating…" : "Continue to players →"}</button></div>
    </form>
  </div></main>;
}
