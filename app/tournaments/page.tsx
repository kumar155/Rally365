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
  {loading?<div className={s.card}>Loading tournaments…</div>:!visible.length?<div className={s.hero}><h2>No tournaments here yet</h2><p>Create the first Rally365 tournament and add players, partners and a draw.</p><Link className={s.button} href="/tournaments/create" style={{marginTop:14}}>Create tournament</Link></div>:<div className={s.list}>{visible.map(t=>{
    const state=stateLabel(t.status);
    return <Link key={t.id} href={`/tournaments/manage?id=${encodeURIComponent(t.id)}`} style={{textDecoration:"none",color:"inherit"}}>
      <article className={s.card} style={{padding:"14px 14px 12px"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
          <div style={{minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
              <span className={s.pill} style={{background:state==="LIVE"?"#fee2e2":state==="COMPLETED"?"#edf2f0":"#fff3c4",color:state==="LIVE"?"#b42318":state==="COMPLETED"?"#60736b":"#6d5710"}}>{state}</span>
              <span style={{fontSize:10,color:"#71857d",fontWeight:700}}>{formatLabel(t.format)}</span>
            </div>
            <h2 style={{fontSize:22,lineHeight:1.05,margin:"0 0 4px",letterSpacing:"-.025em"}}>{t.name}</h2>
            <p style={{fontSize:12,color:"#70837b",margin:0}}>{formatLabel(t.format)}</p>
          </div>
          <span style={{fontSize:20,color:"#078b5c",lineHeight:1,paddingTop:2}}>›</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginTop:13,paddingTop:10,borderTop:"1px solid #e8efec"}}>
          <div><strong style={{display:"block",fontSize:11}}>📅 {dateLabel(t.start_date)}</strong><span style={{fontSize:9,color:"#84958e"}}>Date</span></div>
          <div><strong style={{display:"block",fontSize:11,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>📍 {t.venue||"Venue TBD"}</strong><span style={{fontSize:9,color:"#84958e"}}>Venue</span></div>
          <div><strong style={{display:"block",fontSize:11}}>Rally365</strong><span style={{fontSize:9,color:"#84958e"}}>Organizer</span></div>
        </div>
      </article>
    </Link>
  })}</div>}
 </div></main>;
}
