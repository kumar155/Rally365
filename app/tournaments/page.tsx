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
const deriveState=(stored:string,matches:MatchStatus[])=>{
  if(stored==="CANCELLED") return "UPCOMING";
  if(matches.length>0 && matches.every(m=>["COMPLETED","WALKOVER","CANCELLED"].includes(m.status))) return "COMPLETED";
  if(stored==="COMPLETED") return "COMPLETED";
  if(stored==="LIVE"||matches.some(m=>m.status==="LIVE")||matches.some(m=>["COMPLETED","WALKOVER"].includes(m.status))) return "LIVE";
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
   const reconciled=rows.map(t=>({...t,status:deriveState(t.status,grouped.get(t.id)||[])}));
   setItems(reconciled);
   setLoading(false);
   await Promise.all(reconciled.filter((t,i)=>t.status!==rows[i].status&&rows[i].status!=="CANCELLED").map(t=>supabase.from("tournaments").update({status:t.status}).eq("id",t.id)));
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
    const metaTag={display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:"7px 12px",borderRadius:999,border:"1px solid rgba(255,255,255,.95)",fontSize:11,lineHeight:1.1,fontWeight:600,whiteSpace:"nowrap" as const,flex:"0 0 auto",boxSizing:"border-box" as const};
    const cardBackground="linear-gradient(135deg,#dff5e9,#edf8f3)";
    const statusChip={...metaTag,background:"#fff3c4",color:"#6d5710"};
    const formatChip={...metaTag,background:"rgba(232,222,251,.78)",color:"#70569b"};
    const dateChip={...metaTag,background:"rgba(215,235,255,.76)",color:"#4b6e8c"};
    const venueChip={...metaTag,background:"rgba(211,245,227,.8)",color:"#27815b"};
    const organizerChip={...metaTag,background:"rgba(232,222,251,.78)",color:"#70569b"};
    if(state==="LIVE"){statusChip.background="#ffe1e1";statusChip.color="#a33b3b";}
    if(state==="COMPLETED"){statusChip.background="#e7f0ec";statusChip.color="#60736b";}
    return <Link key={t.id} href={`/tournaments/manage?id=${encodeURIComponent(t.id)}`} style={{textDecoration:"none",color:"inherit"}}>
      <article className={`${s.card} hero-card`} style={{padding:"22px",borderRadius:24,display:"block",position:"relative",boxShadow:"none",background:cardBackground,border:"1px solid #cbe9d8"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:14}}>
          <div style={{minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:8,flexWrap:"wrap"}}>
              <span style={statusChip}>{state}</span>
              <span style={formatChip}>{formatLabel(t.format)}</span>
            </div>
            <h2 style={{fontSize:29,lineHeight:1.05,margin:"5px 0 6px",letterSpacing:"-1px"}}>{t.name}</h2>
          </div>
          <div style={{width:58,height:58,borderRadius:18,background:"rgba(255,255,255,.72)",display:"flex",alignItems:"center",justifyContent:"center",flex:"0 0 auto",color:"#1a9b60"}}><Trophy size={32} strokeWidth={1.7}/></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"nowrap",minWidth:0,marginTop:18,paddingTop:13,borderTop:"1px solid rgba(87,125,109,.18)"}}>
          <span style={dateChip}><CalendarDays size={14} strokeWidth={1.9}/> {dateLabel(t.start_date)}</span>
          <span style={venueChip}><MapPin size={14} strokeWidth={1.9}/> {t.venue||"Venue TBD"}</span>
          <span style={organizerChip}><UsersRound size={14} strokeWidth={1.9}/> Rally365</span>
          <ChevronRight size={20} strokeWidth={2} style={{marginLeft:"auto",flex:"0 0 auto",color:"#078b5c"}}/>
        </div>
      </article>
    </Link>
  })}</div>}
 </div></main>;
}
