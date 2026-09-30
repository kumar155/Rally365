"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {CalendarDays,ChevronRight,Home,MapPin,Trophy,UsersRound} from "lucide-react";
import {supabase} from "../../lib/supabase";
import s from "./tournament.module.css";
type T={id:string;name:string;start_date:string|null;venue:string|null;format:string;status:string};
type MatchStatus={tournament_id:string;status:string};
const formatLabel=(v:string)=>({KNOCKOUT:"Doubles Knockout",ROUND_ROBIN:"Round Robin",GROUPS_KNOCKOUT:"Groups + Knockout",RANDOM_ROUNDS:"Random Rounds"}as Record<string,string>)[v]||v.replaceAll("_"," ");
const dateLabel=(v:string|null)=>v?new Date(v).toLocaleDateString("en-IN",{month:"short",day:"numeric",year:"numeric"}):"Date TBD";
const stateLabel=(v:string)=>v==="COMPLETED"||v==="FINISHED"?"COMPLETED":v==="LIVE"||v==="IN_PROGRESS"?"LIVE":"UPCOMING";
const deriveState=(matches:MatchStatus[])=>{
  if(!matches.length)return "UPCOMING";
  if(matches.every(m=>["COMPLETED","WALKOVER","CANCELLED"].includes(m.status)))return "COMPLETED";
  if(matches.some(m=>m.status==="LIVE"||m.status==="IN_PROGRESS"||["COMPLETED","WALKOVER"].includes(m.status)))return "LIVE";
  return "UPCOMING";
};
export default function TournamentsPage(){
 const[items,setItems]=useState<T[]>([]);const[filter,setFilter]=useState("ALL");const[loading,setLoading]=useState(true);const[error,setError]=useState("");
 useEffect(()=>{(async()=>{
   const{data,error}=await supabase.from("tournaments").select("id,name,start_date,venue,format,status").order("created_at",{ascending:false});
   if(error){setError(error.message);setItems([]);setLoading(false);return;}
   const rows=(data||[])as T[];
   const ids=rows.map(t=>t.id);
   const {data:matchRows}=ids.length?await supabase.from("tournament_matches").select("tournament_id,status").in("tournament_id",ids):{data:[] as MatchStatus[]};
   const grouped=new Map<string,MatchStatus[]>();
   ((matchRows||[])as MatchStatus[]).forEach(m=>{const list=grouped.get(m.tournament_id)||[];list.push(m);grouped.set(m.tournament_id,list)});
   const reconciled=rows.map(t=>({...t,status:deriveState(grouped.get(t.id)||[])}));
   setItems(reconciled);
   setLoading(false);
   // Persist the derived lifecycle so other tournament screens see the same state.
   await Promise.all(reconciled.filter((t,i)=>t.status!==stateLabel(rows[i].status)).map(t=>supabase.from("tournaments").update({status:t.status}).eq("id",t.id)));
 })()},[]);
 const visible=items.filter(t=>filter==="ALL"||filter===stateLabel(t.status));
 return <main className={s.page}><div className={s.shell}>
  <div className={s.mobileTournamentHeader}>
    <Link href="/" aria-label="Go to Rally365 home" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",color:"#09251c",textDecoration:"none"}}><Home size={20} strokeWidth={1.8}/></Link>
    <strong>RALLY365</strong>
    <Link href="/tournaments/create" className={s.menuDots} aria-label="Create tournament">＋</Link>
  </div>
  <div className={s.top}><div><div className={s.brand}>RALLY365</div><h1 className={s.title}>Tournaments</h1><p className={s.sub}>Run every Rally365 competition in one place.</p></div><Link className={s.button} href="/tournaments/create">+ Create</Link></div>
  <div className={s.filterTabs}>{[["ALL","All"],["UPCOMING","Upcoming"],["LIVE","Live"],["COMPLETED","Completed"]].map(([v,l])=><button key={v} className={`${s.filterTab} ${filter===v?s.filterActive:""}`} onClick={()=>setFilter(v)}>{l}</button>)}</div>
  {error&&<div className={s.error}>{error}</div>}
  {loading?<div className={s.card}>Loading tournaments…</div>:!visible.length?<div className={s.hero}><h2>No tournaments here yet</h2><p>Create the first Rally365 tournament and add players, partners and a draw.</p><Link className={s.button} href="/tournaments/create" style={{marginTop:14}}>Create tournament</Link></div>:<div className={s.list}>{visible.map(t=>{
    const state=stateLabel(t.status);
    // Match the Today card's compact tag treatment: consistent shape, border,
    // spacing and a single neutral palette — no multicolor metadata pills.
    const tag={display:"inline-flex",alignItems:"center",justifyContent:"center",gap:7,padding:"8px 13px",borderRadius:999,border:"1px solid rgba(255,255,255,.95)",background:"rgba(255,255,255,.72)",color:"#526c62",fontSize:12,lineHeight:1.1,fontWeight:600,whiteSpace:"nowrap" as const,flex:"0 0 auto",boxSizing:"border-box" as const};
    return <Link key={t.id} href={`/tournaments/manage?id=${encodeURIComponent(t.id)}`} style={{textDecoration:"none",color:"inherit"}}>
      <article className={`${s.card} hero-card`} style={{padding:"22px",borderRadius:24,display:"block",position:"relative",boxShadow:"none",background:"linear-gradient(135deg,#dff5e9,#edf8f3)",border:"1px solid #cbe9d8"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:14}}>
          <div style={{minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:8,flexWrap:"wrap"}}>
              <span style={{...tag,fontWeight:700}}>{state}</span>
              <span style={tag}>{formatLabel(t.format)}</span>
            </div>
            <h2 style={{fontSize:29,lineHeight:1.05,margin:"5px 0 6px",letterSpacing:"-1px"}}>{t.name}</h2>
          </div>
          <div style={{width:58,height:58,borderRadius:18,background:"rgba(255,255,255,.72)",display:"flex",alignItems:"center",justifyContent:"center",flex:"0 0 auto",color:"#1a9b60"}}><Trophy size={32} strokeWidth={1.7}/></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"nowrap",minWidth:0,marginTop:18,paddingTop:13,borderTop:"1px solid rgba(87,125,109,.18)"}}>
          <span style={tag}><CalendarDays size={15} strokeWidth={1.9}/> {dateLabel(t.start_date)}</span>
          <span style={tag}><MapPin size={15} strokeWidth={1.9}/> {t.venue||"Venue TBD"}</span>
          <span style={tag}><UsersRound size={15} strokeWidth={1.9}/> Rally365</span>
          <ChevronRight size={21} strokeWidth={2} style={{marginLeft:"auto",flex:"0 0 auto",color:"#078b5c"}}/>
        </div>
      </article>
    </Link>
  })}</div>}
 </div></main>;
}
