"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import s from "./tournament.module.css";

type T = { id: string; name: string; start_date: string | null; venue: string | null; format: string; status: string };

const formatLabel = (v: string) => ({ KNOCKOUT: "Doubles Knockout", ROUND_ROBIN: "Round Robin", GROUPS_KNOCKOUT: "Groups + Knockout", RANDOM_ROUNDS: "Random Rounds" } as Record<string,string>)[v] || v.replaceAll("_", " ");
const dateLabel = (v: string | null) => v ? new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Date TBD";

export default function TournamentsPage() {
  const [items, setItems] = useState<T[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("tournaments").select("id,name,start_date,venue,format,status").order("created_at", { ascending: false });
      if (error) setError(error.message);
      setItems((data || []) as T[]);
      setLoading(false);
    })();
  }, []);

  const visible = items.filter(t => filter === "ALL" || (filter === "UPCOMING" ? ["UPCOMING","READY"].includes(t.status) : filter === "LIVE" ? ["LIVE","IN_PROGRESS"].includes(t.status) : ["COMPLETED","FINISHED"].includes(t.status)));

  return <main className={s.page}>
    <div className={s.shell}>
      <div className={s.top}>
        <div><div className={s.brand}>RALLY365</div><h1 className={s.title}>Tournaments</h1><p className={s.sub}>Discover, run and follow every Rally365 competition.</p></div>
        <Link className={s.button} href="/tournaments/create">+ Create tournament</Link>
      </div>
      <div className={s.filterTabs}>{[["ALL","All"],["UPCOMING","Upcoming"],["LIVE","Live"],["COMPLETED","Completed"]].map(([v,l]) => <button key={v} className={`${s.filterTab} ${filter===v?s.filterActive:""}`} onClick={()=>setFilter(v)}>{l}</button>)}</div>
      {error && <div className={s.error}>{error}</div>}
      {loading ? <div className={s.card}>Loading tournaments…</div> : !visible.length ? <div className={s.hero}><h2>No tournaments here yet</h2><p>Create the first Rally365 tournament and add players, partners and a draw.</p><Link className={s.button} href="/tournaments/create" style={{marginTop:16,background:"#fff",color:"#08754f"}}>Create tournament</Link></div> : <div className={s.list}>
        {visible.map(t => <Link key={t.id} href={`/tournaments/manage?id=${encodeURIComponent(t.id)}`} style={{textDecoration:"none",color:"inherit"}}>
          <article className={s.card} style={{padding:0,overflow:"hidden"}}>
            <div className={s.tournamentHero}><div><span className={s.pill} style={{background:"#f5d34e",color:"#173c2c"}}>{t.status === "COMPLETED" ? "COMPLETED" : t.status === "LIVE" || t.status === "IN_PROGRESS" ? "LIVE" : "UPCOMING"}</span><h2>{t.name}</h2><p>{formatLabel(t.format)}</p></div></div>
            <div style={{padding:14}}><div className={s.tournamentMeta}><div className={s.metaBox}><strong>📅 {dateLabel(t.start_date)}</strong><span>Date</span></div><div className={s.metaBox}><strong>📍 {t.venue || "Venue TBD"}</strong><span>Venue</span></div><div className={s.metaBox}><strong>🏸 Rally365</strong><span>Organiser</span></div></div></div>
          </article>
        </Link>)}
      </div>}
    </div>
  </main>;
}
