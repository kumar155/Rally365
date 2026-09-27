"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { syncTournamentProgression } from "../../../lib/tournamentProgression";
import s from "../tournament.module.css";
import sb from "./schedule.module.css";

type Tournament={id:string;name:string;start_date:string|null;format:string};
type Round={id:string;name:string|null;round_number:number|null;round_type:string|null};
type Group={id:string;name:string;group_number:number};
type Duo={id:string;name:string|null};
type Match={id:string;round_id:string|null;group_id:string|null;match_number:number|null;court:number|null;scheduled_at:string|null;status:string|null;team_a_duo_id:string|null;team_b_duo_id:string|null;team_a_score:number|null;team_b_score:number|null};

const time=(v:string|null)=>v?new Date(v).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}):"Time TBD";
const roundLabel=(name:string|null,number:number|null)=>name||`Round ${number??""}`;

function MatchCard({m,duoName,compact=false}:{m:Match;duoName:Map<string,string>;compact?:boolean}){
 const a=duoName.get(m.team_a_duo_id||"")||"TBD";
 const b=duoName.get(m.team_b_duo_id||"")||"TBD";
 return <Link className={`${sb.scheduleMatch} ${compact?sb.scheduleMatchCompact:""}`} href={`/tournaments/match?id=${m.id}`}>
   <div className={sb.scheduleMatchMeta}><span>Match {m.match_number??"—"}</span><span>{time(m.scheduled_at)} · {m.court?`Court ${m.court}`:"Court TBD"}</span></div>
   <div className={`${sb.scheduleTeam} ${sb.scheduleTeamA}`}><span className={sb.scheduleTeamPeople}><span className={sb.scheduleAvatar}>A</span><span>{a}</span></span><span className={sb.scheduleScore}>{m.team_a_score??0}</span></div>
   <div className={`${sb.scheduleTeam} ${sb.scheduleTeamB}`}><span className={sb.scheduleTeamPeople}><span className={sb.scheduleAvatar}>B</span><span>{b}</span></span><span className={sb.scheduleScore}>{m.team_b_score??0}</span></div>
   <div className={sb.scheduleStatus}>{m.status||"SCHEDULED"}<span>›</span></div>
 </Link>;
}

function KnockoutBracket({rounds,matches,duoName}:{rounds:Round[];matches:Match[];duoName:Map<string,string>}){
 const knockoutRounds=rounds.filter(r=>r.round_type!=="GROUP").sort((a,b)=>(a.round_number||0)-(b.round_number||0));
 if(!knockoutRounds.length)return null;
 return <section className={sb.levelSection}>
   <div className={s.sectionHeader}><div><div className={s.eyebrow}>KNOCKOUT</div><h2>Match schedule</h2></div><span className={s.sub}>Advance through the rounds</span></div>
   <div className={sb.bracketViewport}>
     <div className={sb.bracketLevels}>
       {knockoutRounds.map((r,index)=>{
         const levelMatches=matches.filter(m=>m.round_id===r.id).sort((a,b)=>(a.match_number||0)-(b.match_number||0));
         const step=128;
         const paddingTop=index===0?0:(step*(Math.pow(2,index)-1))/2;
         const gap=index===0?24:step*Math.pow(2,index)-104;
         return <div className={sb.bracketLevel} key={r.id} style={{paddingTop,gap}}>
           <div className={sb.bracketLevelHeader}><span>{r.name||`Round ${r.round_number}`}</span><small>{levelMatches.length} {levelMatches.length===1?"match":"matches"}</small></div>
           {levelMatches.map((m)=><div className={sb.bracketMatchWrap} key={m.id}>
             {index>0&&<><span className={sb.bracketConnectorLeft} aria-hidden="true"/><span className={sb.bracketConnectorVertical} style={{height:128*Math.pow(2,index-1)}} aria-hidden="true"/></>}
             {index<knockoutRounds.length-1&&<span className={sb.bracketConnectorRight} aria-hidden="true"/>}
             <MatchCard m={m} duoName={duoName} compact />
           </div>)}
         </div>;
       })}
     </div>
   </div>
 </section>;
}

function GroupStage({round,matches,groups,duoName}:{round:Round;matches:Match[];groups:Group[];duoName:Map<string,string>}){
 const roundMatches=matches.filter(m=>m.round_id===round.id);
 const grouped=groups.map(g=>({g,m:roundMatches.filter(x=>x.group_id===g.id)})).filter(x=>x.m.length);
 const remaining=roundMatches.filter(m=>!m.group_id);
 return <section className={sb.levelSection}>
   <div className={s.sectionHeader}><div><div className={s.eyebrow}>ROUND {round.round_number??1}</div><h2>{round.name||"Group Stage"}</h2></div><span className={s.sub}>{roundMatches.length} matches</span></div>
   {grouped.map(({g,m})=><div className={sb.groupLevel} key={g.id}>
     <div className={sb.groupLevelHeader}><div><span>{g.name}</span><small>{m.length} matches</small></div></div>
     <div className={sb.scheduleGrid}>{m.map(x=><MatchCard key={x.id} m={x} duoName={duoName}/>)}</div>
   </div>)}
   {remaining.length>0&&<div className={sb.scheduleGrid}>{remaining.map(x=><MatchCard key={x.id} m={x} duoName={duoName}/>)}</div>}
 </section>;
}

function TournamentScheduleContent(){
 const params=useSearchParams(); const tournamentId=params.get("id");
 const[tournament,setTournament]=useState<Tournament|null>(null);const[rounds,setRounds]=useState<Round[]>([]);const[matches,setMatches]=useState<Match[]>([]);const[duos,setDuos]=useState<Duo[]>([]);const[groups,setGroups]=useState<Group[]>([]);const[loading,setLoading]=useState(true);const[error,setError]=useState("");
 useEffect(()=>{if(!tournamentId){setError("Tournament id is missing.");setLoading(false);return}let cancelled=false;(async()=>{try{await syncTournamentProgression(tournamentId)}catch(e:any){if(!cancelled)setError(e?.message||"Could not sync tournament progression")}
   const[t,r,m,d,g]=await Promise.all([
     supabase.from("tournaments").select("id,name,start_date,format").eq("id",tournamentId).single(),
     supabase.from("tournament_rounds").select("id,name,round_number,round_type").eq("tournament_id",tournamentId).order("round_number"),
     supabase.from("tournament_matches").select("id,round_id,group_id,match_number,court,scheduled_at,status,team_a_duo_id,team_b_duo_id,team_a_score,team_b_score").eq("tournament_id",tournamentId).order("match_number"),
     supabase.from("tournament_duos").select("id,name").eq("tournament_id",tournamentId),
     supabase.from("tournament_groups").select("id,name,group_number").eq("tournament_id",tournamentId).order("group_number")
   ]);
   if(cancelled)return;const e=t.error||r.error||m.error||d.error||g.error;if(e)setError(e.message);setTournament(t.data);setRounds(r.data||[]);setMatches(m.data||[]);setDuos(d.data||[]);setGroups(g.data||[]);setLoading(false)})();return()=>{cancelled=true}},[tournamentId]);
 const duoName=useMemo(()=>new Map(duos.map(d=>[d.id,d.name||"TBD"])),[duos]);
 const path=(p:string)=>`/tournaments/${p}?id=${encodeURIComponent(tournamentId||"")}`;
 const groupRounds=rounds.filter(r=>r.round_type==="GROUP"||r.name==="Group Stage");
 const knockoutRounds=rounds.filter(r=>r.round_type!=="GROUP");
 if(loading)return <main className={s.page}><div className={s.shell}><div className={s.card}>Loading schedule…</div></div></main>;
 return <main className={s.page}><div className={s.shell}>
   <div className={s.top}><div><div className={s.brand}>RALLY365 · {tournament?.name||"TOURNAMENT"}</div><h1 className={s.title}>Schedule</h1><p className={s.sub}>{tournament?.start_date?new Date(tournament.start_date).toLocaleDateString():"Date TBD"} · Complete match plan</p></div><Link href={path("manage")} className={s.secondaryButton}>← Overview</Link></div>
   <nav className={s.tabs}><Link className={s.tab} href={path("manage")}>Overview</Link><Link className={`${s.tab} ${s.tabActive}`} href={path("schedule")}>Schedule</Link><Link className={s.tab} href={path("matches")}>Live matches</Link><Link className={s.tab} href={path("standings")}>Standings</Link></nav>
   {error&&<div className={s.error}>{error}</div>}
   {!error&&!matches.length&&<section className={s.card}><h2>No matches yet</h2><p className={s.sub}>Generate the draw first.</p><Link href={path("draw")} className={s.button} style={{marginTop:12}}>Go to Draw</Link></section>}
   {groupRounds.map(r=><GroupStage key={r.id} round={r} matches={matches} groups={groups} duoName={duoName}/>)}
   {knockoutRounds.length>0&&<KnockoutBracket rounds={rounds} matches={matches} duoName={duoName}/>} 
   {!groupRounds.length&&!knockoutRounds.length&&matches.length>0&&<section className={sb.levelSection}><div className={s.sectionHeader}><div><div className={s.eyebrow}>SCHEDULE</div><h2>Match schedule</h2></div></div><div className={s.grid2}>{matches.map(m=><MatchCard key={m.id} m={m} duoName={duoName}/>)}</div></section>}
 </div></main>;
}

export default function TournamentSchedulePage(){
 return <Suspense fallback={<main className={s.page}><div className={s.shell}><div className={s.card}>Loading schedule…</div></div></main>}><TournamentScheduleContent /></Suspense>;
}
