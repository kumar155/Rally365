"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import s from "../tournament.module.css";

export default function CreateTournament() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !venue.trim() || !date) return setError("Tournament name, venue and date are required.");
    setBusy(true);
    setError("");

    const payload = {
      name: name.trim(),
      venue: venue.trim(),
      start_date: `${date}T00:00:00+05:30`,
      partner_mode: "RANDOM",
      format: "KNOCKOUT",
      rounds: null,
      group_count: null,
      qualifiers_per_group: null,
      games_per_match: 1,
      status: "UPCOMING",
      courts: 1,
      entry_fee: 0,
    };

    const { data, error } = await supabase.from("tournaments").insert(payload).select("id").single();
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push(`/tournaments/players?id=${encodeURIComponent(data.id)}`);
  }

  return (
    <main className={s.page}>
      <div className={s.shell}>
        <div className={s.top}>
          <div>
            <div className={s.brand}>RALLY365 · TOURNAMENTS</div>
            <h1 className={s.title}>Create tournament</h1>
            <p className={s.sub}>Set the tournament identity first. Competition controls can be changed from the dashboard.</p>
          </div>
        </div>
        <form className={s.card} onSubmit={submit}>
          <div className={s.field}>
            <label>Tournament name</label>
            <input className={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="Rally365 Open" />
          </div>
          <div className={s.field}>
            <label>Venue</label>
            <input className={s.input} value={venue} onChange={e => setVenue(e.target.value)} placeholder="Vega Badminton Hall" />
          </div>
          <div className={s.field}>
            <label>Date</label>
            <input className={s.input} type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          {error && <div className={s.error}>{error}</div>}
          <div className={s.footerActions}>
            <a href="/tournaments" className={`${s.button} ${s.secondary}`}>Cancel</a>
            <button className={s.button} disabled={busy}>{busy ? "Creating…" : "Continue to players →"}</button>
          </div>
        </form>
      </div>
    </main>
  );
}
