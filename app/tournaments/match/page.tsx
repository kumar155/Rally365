"use client";
import Link from "next/link";import {useEffect,useState} from "react";import {useSearchParams} from "next/navigation";import {supabase} from "../../../lib/supabase";import s from "../tournament.module.css";
type M={id:string;tournament_id:string;match_number:number;team_a_score:number;team_b_score:number;status:string;scheduled_at:string|null;court:number|null;team_a_duo_id:string|null;team_b_duo_id:string|null;winner_duo_id:string|null;team_a:{name:string}|null;team_b:{name:string}|null};
type G={id:string;group_number:number;qualifying_teams:number|null};
type GD={group_id:string;duo_id:string;seed:number|null};
type GM={group_id:string|null;team_a_duo_id:string|null;team_b_duo_id:string|null;team_a_score:number|null;team_b_score:number|null;status:string};

async function advanceGroupQualifiers(tournamentId:string){
  const {data:tournament,error:te}=await supabase.from("tournaments").select("format").eq("id",tournamentId).single();
  if(te||tournament?.format!=="GROUPS_KNOCKOUT") return;
  const [{data:groups,error:ge},{data:matches,error:me},{data:rounds,error:re}]=await Promise.all([
    supabase.from("tournament_groups").select("id,group_number,qualifying_teams").eq("tournament_id",tournamentId).order("group_number"),
    supabase.from("tournament_matches").select("group_id,team_a_duo_id,team_b_duo_id,team_a_score,team_b_score,status").eq("tournament_id",tournamentId),
    supabase.from("tournament_rounds").select("id,round_number,name,round_type").eq("tournament_id",tournamentId).order("round_number")
  ]);
  if(ge||me||re||!groups?.length) return;
  const groupIds=groups.map((g:G)=>g.id);
  const {data:members,error:mde}=await supabase.from("tournament_group_duos").select("group_id,duo_id,seed").in("group_id",groupIds);
  if(mde) return;
  const finalRound=(rounds||[]).find((r:any)=>String(r.round_type).toUpperCase()==="FINAL"||/final/i.test(r.name||""));
  if(!finalRound) return;
  const {data:finals,error:fe}=await supabase.from("tournament_matches").select("id,status,team_a_duo_id,team_b_duo_id").eq("tournament_id",tournamentId).eq("round_id",finalRound.id).order("match_number").limit(1);
  if(fe) return;
  let finalMatch=finals?.[0] as any;
  if(!finalMatch){
    const {data:created,error:ce}=await supabase.from("tournament_matches").insert({tournament_id:tournamentId,round_id:finalRound.id,match_number:1,best_of:3,status:"SCHEDULED"}).select("id,status,team_a_duo_id,team_b_duo_id").single();
    if(ce) return; finalMatch=created;
  }
  if(["COMPLETED","WALKOVER"].includes(finalMatch.status)) return;

  const qualifiers:{groupNumber:number;duoId:string}[]=[];
  for(const group of groups as G[]){
    const groupMembers=(members||[]).filter((x:GD)=>x.group_id===group.id);
    const groupMatches=(matches||[]).filter((x:GM)=>x.group_id===group.id);
    const playable=groupMatches.filter((x:GM)=>x.team_a_duo_id&&x.team_b_duo_id);
    const completed=playable.filter((x:GM)=>x.status==="COMPLETED"||x.status==="WALKOVER");
    // Do not advance a group until every scheduled group match has a result.
    if(!playable.length||completed.length<playable.length) continue;
    const rows=new Map<string,{id:string;points:number;wins:number;gf:number;ga:number;seed:number}>();
    for(const member of groupMembers) rows.set(member.duo_id,{id:member.duo_id,points:0,wins:0,gf:0,ga:0,seed:member.seed??999});
    for(const m of completed){
      const a=rows.get(m.team_a_duo_id!);const b=rows.get(m.team_b_duo_id!);if(!a||!b) continue;
      const sa=Number(m.team_a_score??0),sb=Number(m.team_b_score??0);a.gf+=sa;a.ga+=sb;b.gf+=sb;b.ga+=sa;
      if(sa>sb){a.wins++;a.points++;}else if(sb>sa){b.wins++;b.points++;}
    }
    const sorted=[...rows.values()].sort((a,b)=>b.points-a.points||b.wins-a.wins||((b.gf-b.ga)-(a.gf-a.ga))||b.gf-a.gf||a.seed-b.seed);
    const count=Math.max(1,group.qualifying_teams||1);
    for(const row of sorted.slice(0,count)) qualifiers.push({groupNumber:group.group_number,duoId:row.id});
  }
  // Current format: two groups, one qualifier from each group -> Final.
  const byGroup=[...qualifiers].sort((a,b)=>a.groupNumber-b.groupNumber);
  if(byGroup.length<2) return;
  const a=byGroup[0].duoId,b=byGroup[1].duoId;
  await supabase.from("tournament_matches").update({team_a_duo_id:a,team_b_duo_id:b,status:"SCHEDULED",winner_duo_id:null}).eq("id",finalMatch.id);
}

export default function MatchDetail(){const q=useSearchParams();const queryId=q.get("id")||"";const legacy=q.get("matchId")||"";const[matchId,setMatchId]=useState(legacy||queryId);const[tournamentId,setTournamentId]=useState("");const[m,setM]=useState<M|null>(null);const[a,setA]=useState("0");const[b,setB]=useState("0");const[error,setError]=useState("");const[busy,setBusy]=useState(false);useEffect(()=>setMatchId(legacy||queryId),[queryId,legacy]);useEffect(()=>{if(!matchId)return;let cancelled=false;(async()=>{setError("");const{data,error}=await supabase.from("tournament_matches").select("id,tournament_id,match_number,team_a_score,team_b_score,status,scheduled_at,court,team_a_duo_id,team_b_duo_id,winner_duo_id,team_a:tournament_duos!tournament_matches_team_a_duo_id_fkey(name),team_b:tournament_duos!tournament_matches_team_b_duo_id_fkey(name)").eq("id",matchId).single();if(cancelled)return;if(error){setError(error.message);return}const x=data as unknown as M;setM(x);setTournamentId(x.tournament_id);setA(String(x.team_a_score??0));setB(String(x.team_b_score??0))})();return()=>{cancelled=true}},[matchId]);async function save(status:string){if(!m)return;setBusy(true);setError("");const na=Number(a),nb=Number(b);const winnerId=status==="COMPLETED"?(na>nb?m.team_a_duo_id:na<nb?m.team_b_duo_id:null):null;const{error}=await supabase.from("tournament_matches").update({team_a_score:na,team_b_score:nb,status,winner_duo_id:winnerId}).eq("id",m.id);if(error)setError(error.message);else{setM({...m,team_a_score:na,team_b_score:nb,status,winner_duo_id:winnerId});if(status==="COMPLETED"||status==="WALKOVER") await advanceGroupQualifiers(m.tournament_id)}setBusy(false)}if(!matchId)return <main className={s.page}><div className={s.shell}><div className={s.card}>Match information is missing.</div></div></main>;return <main className={s.page}><div className={s.shell}>{error?<div className={s.error}>{error}</div>:!m?<div className={s.card}>Loading match…</div>:<><div className={s.top}><Link href={tournamentId?`/tournaments/schedule?id=${tournamentId}`:"/tournaments"} className={s.secondaryButton}>← Schedule</Link><span className={s.pill}>{m.status}</span></div><div className={s.liveHeader}><div className={s.row}><div><div className={s.brand} style={{color:"#d9d07a"}}>RALLY365 OPEN</div><h1 style={{margin:"6px 0 0",fontSize:26}}>Quarter Final {m.match_number}</h1></div><span>🏸 Court {m.court||"TBD"}</span></div><p style={{margin:"10px 0 0",opacity:.85}}>{m.scheduled_at?new Date(m.scheduled_at).toLocaleString("en-IN"):"Time TBD"}</p></div><section className={s.liveScore}><div className={s.teamLine}><span className={s.teamIdentity}><span className={s.avatar}>A</span><span className={s.teamName}>{m.team_a?.name||"TBD"}</span></span><input className={s.scoreInput} type="number" min="0" value={a} onChange={e=>setA(e.target.value)}/></div><div className={s.teamLine}><span className={s.teamIdentity}><span className={s.avatar}>B</span><span className={s.teamName}>{m.team_b?.name||"TBD"}</span></span><input className={s.scoreInput} type="number" min="0" value={b} onChange={e=>setB(e.target.value)}/></div><div className={s.actions} style={{marginTop:18}}><button className={s.button} disabled={busy||!m.team_a_duo_id||!m.team_b_duo_id} onClick={()=>save("COMPLETED")}>{busy?"Saving…":"Save score"}</button><button className={s.button+" "+s.secondary} disabled={busy} onClick={()=>save("LIVE")}>Mark live</button><button className={s.button+" "+s.danger} disabled={busy} onClick={()=>save("CANCELLED")}>Cancel</button></div></section></>}</div></main>}
