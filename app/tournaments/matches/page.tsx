"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import s from "../tournament.module.css";

type M={id:string;match_number:number;scheduled_at:string|null;court:number|null;team_a_score:number;team_b_score:number;status:string;team_a_duo_id:string|null;team_b_duo_id:string|null;team_a:{name:string}|null;team_b:{name:string}|null};

export default function Matches(){
 const[id,setId]=useState("");const[matches,setMatches]=useState<M[]>([]);const[error,setError]=useState("");const[busy,setBusy]=useState<string|null>(null);
 useEffect(()=>setId(new URLSearchParams(window.location.search).get("id")||""),[]);
 async function load(){if(!id)return;const{data,error}=await supabase.from("tournament_matches").select("id,match_number,scheduled_at,court,team_a_score,team_b_score,status,team_a_duo_id,team_b_duo_id,team_a:tournament_duos!tournament_matches_team_a_duo_id_fkey(name),team_b:tournament_duos!tournament_matches_team_b_duo_id_fkey(name)").eq("tournament_id",id).order("match_number");if(error)setError(error.message);setMatches((data||[])as any)}
 useEffect(()=>{load()},[id]);
 async function save(m:M,a:number,b:number,status="COMPLETED"){setBusy(m.id);const winnerId=status==="COMPLETED"?(a>b?m.team_a_duo_id:a<b?m.team_b_duo_id:null):m.team_a_duo_id;const{error}=await supabase.from("tournament_matches").update({team_a_score:a,team_b_score:b,status,winner_duo_id:winnerId}).eq("id",m.id);if(error)setError(error.message);else await load();setBusy(null)}
 const path=(p:string,extra="")=>`/tournaments/${p}?id=${encodeURIComponent(id)}${extra}`;
 if(!id)return <main className={s.page}><div className={s.shell}><div className={s.card}>Tournament ID is missing.</div></div></main>;
 return <main className={s.page}><div className={s.shell}><div className={s.brand}>LIVE MATCHES</div><h1 className={s.title}>Run the tournament</h1><p className={s.sub}>Record results and live match status.</p>{error&&<div className={s.error}>{error}</div>}<div className={s.list}>{matches.map(m=><MatchCard key={m.id} tournamentId={id} m={m} busy={busy===m.id} onSave={save}/>)}</div>{!matches.length&&<div className={s.card}>No matches yet. Generate the draw first.</div>}<div style={{marginTop:22}}><Link href={path("manage")} className={s.button+" "+s.secondary}>← Dashboard</Link></div></div></main>
}

function MatchCard({m,tournamentId,busy,onSave}:{m:M;tournamentId:string;busy:boolean;onSave:(m:M,a:number,b:number,status?:string)=>void}){const[a,setA]=useState(String(m.team_a_score??0));const[b,setB]=useState(String(m.team_b_score??0));return <div className={s.card}><div className={s.row}><div><Link href={`/tournaments/match?id=${encodeURIComponent(tournamentId)}&matchId=${encodeURIComponent(m.id)}`} className={s.pill}>Match {m.match_number}</Link>{m.court&&<span className={s.pill} style={{marginLeft:6}}>Court {m.court}</span>}</div><span className={s.muted}>{m.status}</span></div><div className={s.grid2} style={{marginTop:15}}><div><h3>{m.team_a?.name||"TBD"}</h3><input className={s.input} type="number" min="0" value={a} onChange={e=>setA(e.target.value)}/></div><div><h3>{m.team_b?.name||"TBD"}</h3><input className={s.input} type="number" min="0" value={b} onChange={e=>setB(e.target.value)}/></div></div><div className={s.actions} style={{marginTop:14}}><button className={s.button} disabled={busy||!m.team_a_duo_id||!m.team_b_duo_id} onClick={()=>onSave(m,Number(a),Number(b),"COMPLETED")}>{busy?"Saving…":"Save result"}</button><button className={s.button+" "+s.secondary} disabled={busy||!m.team_a_duo_id} onClick={()=>onSave(m,0,0,"COMPLETED")}>Walkover to {m.team_a?.name||"A"}</button></div></div>}
