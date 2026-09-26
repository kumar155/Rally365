"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "../../lib/supabase";
import s from "./tournament.module.css";
type T={id:string;name:string;start_date:string|null;venue:string|null;format:string;status:string};
const formatLabel=(v:string)=>({KNOCKOUT:"Doubles Knockout",ROUND_ROBIN:"Round Robin",GROUPS_KNOCKOUT:"Groups + Knockout",RANDOM_ROUNDS:"Random Rounds"}as Record<string,string>)[v]||v.replaceAll("_"," ");
const dateLabel=(v:string|null)=>v?new Date(v).toLocaleDateString("en-IN",{month:"short",day:"numeric",year:"numeric"}):"Date TBD";
const stateLabel=(v:string)=>v==="COMPLETED"||v==="FINISHED"?"COMPLETED":v==="LIVE"||v==="IN_PROGRESS"?"LIVE":"UPCOMING";
export default function TournamentsPage(){
 const[items,setItems]=useState<T[]>([]);const[filter,setFilter]=useState("ALL");const[loading,setLoading]=useState(true);const[error,setError]=useState("");
 useEffect(()=>{(async()=>{const{data,error}=await supabase.from("tournaments").select("id,name,start_date,venue,format,status").order("created_at",{ascending:false});if(error)setError(error.message);setItems((data||[])as T[]);setLoading(false)})()},[]);
 const visible=items.filter(t=>filter==="ALL"||filter===stateLabel(t.status));
 return <main className={s.page}><div className={s.shell}>
  <div className={s.mobileTournamentHeader}><span>⌂</span><strong>RALLY365</strong><Link href="/tournaments/create" className={s.menuDots}>＋</Link></div>
  <div className={s.top}><div><div className={s.brand}>RALLY365</div><h1 className={s.title}>Tournaments</h1><p className={s.sub}>Run every Rally365 competition in one place.</p></div><Link className={s.button} href="/tournaments/create">+ Create</Link></div>
  <div className={s.filterTabs}>{[["ALL","All"],["UPCOMING","Upcoming"],["LIVE","Live"],["COMPLETED","Completed"]].map(([v,l])=><button key={v} className={`${s.filterTab} ${filter===v?s.filterActive:""}`} onClick={()=>setFilter(v)}>{l}</button>)}</div>
  {error&&<div className={s.error}>{error}</div>}
  {loading?<div className={s.card}>Loading tournaments…</div>:!visible.length?<div className={s.hero}><h2>No tournaments here yet</h2><p>Create the first Rally365 tournament and add players, partners and a draw.</p><Link className={s.button} href="/tournaments/create" style={{marginTop:14}}>Create tournament</Link></div>:<div className={s.list}>{visible.map(t=><Link key={t.id} href={`/tournaments/manage?id=${encodeURIComponent(t.id)}`} style={{textDecoration:"none",color:"inherit"}}><article className={s.card} style={{padding:0,overflow:"hidden"}}><div className={s.tournamentHero}><div><span className={s.pill} style={{background:stateLabel(t.status)==="LIVE"?"#ef4444":"#f6d44d",color:stateLabel(t.status)==="LIVE"?"#fff":"#173c2c"}}>{stateLabel(t.status)}</span><h2>{t.name}</h2><p>{formatLabel(t.format)}</p></div></div><div style={{padding:12}}><div className={s.tournamentMeta}><div className={s.metaBox}><strong>📅 {dateLabel(t.start_date)}</strong><span>Date</span></div><div className={s.metaBox}><strong>📍 {t.venue||"Venue TBD"}</strong><span>Venue</span></div><div className={s.metaBox}><strong>👥 Rally365</strong><span>Organizer</span></div></div></div></article></Link>)}</div>}
 </div></main>;
}
