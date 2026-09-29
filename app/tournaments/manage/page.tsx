"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "../../../lib/supabase";
import s from "../tournament.module.css";

type T={id:string;name:string;venue:string|null;start_date:string|null;format:string;partner_mode:string;status:string;rounds:number|null;group_count:number|null;qualifiers_per_group:number|null;games_per_match:number|null};
type M={id:string;match_number:number;scheduled_at:string|null;court:number|null;status:string;team_a_score:number|null;team_b_score:number|null;team_a_duo_id:string|null;team_b_duo_id:string|null;team_a:{name:string}|null;team_b:{name:string}|null};
const label=(v:string)=>({KNOCKOUT:"Doubles Knockout → final",ROUND_ROBIN:"Round Robin",GROUPS_KNOCKOUT:"Groups → final"}as Record<string,string>)[v]||v.replaceAll("_"," ");
const date=(v:string|null)=>v?new Date(v).toLocaleDateString("en-IN",{month:"short",day:"numeric",year:"numeric"}):"Date TBD";

export default function Dashboard(){
 const[id,setId]=useState("");
 const[t,setT]=useState<T|null>(null);
 const[matches,setMatches]=useState<M[]>([]);
 const[counts,setCounts]=useState({players:0,teams:0,matches:0,completed:0});
 const[error,setError]=useState("");
 const[success,setSuccess]=useState("");
 const[partnerMode,setPartnerMode]=useState("RANDOM");
 const[format,setFormat]=useState("KNOCKOUT");
 const[games,setGames]=useState("1");
 const[groups,setGroups]=useState("2");
 const[qualifiers,setQualifiers]=useState("2");
 const[saving,setSaving]=useState(false);
 const[configOpen,setConfigOpen]=useState(false);

 useEffect(()=>setId(new URLSearchParams(window.location.search).get("id")||""),[]);
 useEffect(()=>{
   if(!id)return;
   (async()=>{
     const[tr,pr,dr,mr]=await Promise.all([
       supabase.from("tournaments").select("id,name,venue,start_date,format,partner_mode,status,rounds,group_count,qualifiers_per_group,games_per_match").eq("id",id).single(),
       supabase.from("tournament_players").select("id",{count:"exact",head:true}).eq("tournament_id",id),
       supabase.from("tournament_duos").select("id",{count:"exact",head:true}).eq("tournament_id",id),
       supabase.from("tournament_matches").select("id,match_number,scheduled_at,court,status,team_a_score,team_b_score,team_a_duo_id,team_b_duo_id,team_a:tournament_duos!tournament_matches_team_a_duo_id_fkey(name),team_b:tournament_duos!tournament_matches_team_b_duo_id_fkey(name)").eq("tournament_id",id).order("match_number")
     ]);
     if(tr.error){setError(tr.error.message);return}
     setT(tr.data as T);
     setPartnerMode(tr.data?.partner_mode||"RANDOM");
     setFormat(tr.data?.format||"KNOCKOUT");
     setGames(String(tr.data?.games_per_match||1));
     setGroups(String(tr.data?.group_count||2));
     setQualifiers(String(tr.data?.qualifiers_per_group||2));
     setCounts({players:pr.count||0,teams:dr.count||0,matches:mr.data?.length||0,completed:(mr.data||[]).filter(x=>x.status==="COMPLETED").length});
     setMatches((mr.data||[])as any);
   })();
 },[id]);

 const path=(p:string)=>`/tournaments/${p}?id=${encodeURIComponent(id)}`;
 const upcoming=matches.filter(m=>m.status!=="COMPLETED").slice(0,4);

 async function saveControls(){
   if(!id)return;
   setSaving(true);setError("");setSuccess("");
   const payload={
     partner_mode:partnerMode,
     format,
     games_per_match:Number(games)||1,
     rounds:null,
     group_count:format==="GROUPS_KNOCKOUT"?Number(groups)||1:null,
     qualifiers_per_group:format==="GROUPS_KNOCKOUT"?Number(qualifiers)||1:null,
   };
   const {data,error:saveError}=await supabase.from("tournaments").update(payload).eq("id",id).select("id,name,venue,start_date,format,partner_mode,status,rounds,group_count,qualifiers_per_group,games_per_match").single();
   if(saveError){setError(saveError.message);setSaving(false);return;}
   setT(data as T);setSuccess("Tournament configuration saved.");setSaving(false);
 }

 if(error&&!t)return <main className={s.page}><div className={s.shell}><div className={s.error}>{error}</div></div></main>;
 if(!id)return <main className={s.page}><div className={s.shell}><div className={s.card}>Loading tournament…</div></div></main>;
 return <main className={s.page}><div className={s.shell}>
  <div className={s.mobileTournamentHeader}><Link href="/tournaments" className={s.iconBack}>‹</Link><strong>{t?.name||"Rally365 Open"}</strong><span className={s.menuDots}>⋮</span></div>
  <section className={s.tournamentHero}><div><div className={s.brand} style={{color:"#d9d07a"}}>RALLY365 OPEN</div><h1>{t?.name||"Rally365 Open"}</h1><p>📅 {date(t?.start_date||null)} &nbsp; · &nbsp; 📍 {t?.venue||"Venue TBD"}</p></div><span className={s.statusBadge}>{t?.status||"UPCOMING"}</span></section>
  <nav className={s.tabs}><Link className={`${s.tab} ${s.tabActive}`} href={path("manage")}>Overview</Link><Link className={s.tab} href={path("draw")}>Plan</Link><Link className={s.tab} href={path("matches")}>Matches</Link><Link className={s.tab} href={path("standings")}>Standings</Link><Link className={s.tab} href={path("players")}>Players</Link></nav>
  <div className={s.overviewStats}><div className={s.overviewStat}><strong>⚙</strong><span>{label(t?.format||"")}</span></div><div className={s.overviewStat}><strong>{counts.teams}</strong><span>Duos</span></div><div className={s.overviewStat}><strong>₹0</strong><span>Entry fee</span></div><div className={s.overviewStat}><strong>🏸</strong><span>Organized by Rally365</span></div></div>

  <section className={s.card} style={{marginTop:14}}>
    <button type="button" onClick={()=>setConfigOpen(v=>!v)} aria-expanded={configOpen} style={{display:"flex",width:"100%",alignItems:"center",justifyContent:"space-between",background:"none",border:0,padding:0,textAlign:"left",cursor:"pointer",color:"inherit"}}>
      <div className={s.sectionHeader} style={{margin:0}}><div><div className={s.eyebrow}>TOURNAMENT CONFIGURATION</div><h2>Tournament configuration</h2></div></div>
      <span aria-hidden="true" style={{fontSize:28,lineHeight:1,transform:configOpen?"rotate(180deg)":"rotate(0deg)",transition:"transform .2s ease",marginLeft:16}}>⌄</span>
    </button>
    {configOpen&&<>
      <p className={s.sub} style={{marginTop:14,marginBottom:14}}>These settings stay editable from the dashboard at any time.</p>
      <div className={s.grid2}>
        <div className={s.field}><label>Partner mode</label><select className={s.select} value={partnerMode} onChange={e=>setPartnerMode(e.target.value)}><option value="RANDOM">Random partners</option><option value="FIXED">Already fixed partners</option></select></div>
        <div className={s.field}><label>Tournament format</label><select className={s.select} value={format} onChange={e=>setFormat(e.target.value)}><option value="KNOCKOUT">All knockout → final</option><option value="ROUND_ROBIN">Round robin</option><option value="GROUPS_KNOCKOUT">Groups → final</option></select></div>
        <div className={s.field}><label>Games per match</label><select className={s.select} value={games} onChange={e=>setGames(e.target.value)}><option value="1">1 game</option><option value="3">Best of 3</option></select></div>
        {format==="GROUPS_KNOCKOUT"&&<><div className={s.field}><label>Number of groups</label><input className={s.input} type="number" min="1" value={groups} onChange={e=>setGroups(e.target.value)}/></div><div className={s.field}><label>Qualifiers per group</label><input className={s.input} type="number" min="1" value={qualifiers} onChange={e=>setQualifiers(e.target.value)}/></div></>}
      </div>
      {error&&<div className={s.error}>{error}</div>}
      {success&&<div className={s.success}>{success}</div>}
      <div className={s.actions}><button className={s.button} onClick={saveControls} disabled={saving}>{saving?"Saving…":"Save tournament configuration"}</button></div>
    </>}
  </section>

  <section className={s.card} style={{marginTop:14}}><div className={s.sectionHeader}><div><div className={s.eyebrow}>NEXT UP</div><h2>Match schedule</h2></div><Link href={path("draw")} className={s.secondaryButton}>View plan →</Link></div><div className={s.grid2}>{upcoming.map(m=><Link key={m.id} href={`/tournaments/match?id=${m.id}`} className={s.matchTile}><div className={s.matchTileTop}><span>Match {m.match_number}</span><span>{m.scheduled_at?new Date(m.scheduled_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}):"Time TBD"}</span></div><div className={s.teamLine}><span className={s.teamIdentity}><span className={s.avatar}>A</span><span className={s.teamName}>{m.team_a?.name||"TBD"}</span></span><strong className={s.teamScore}>{m.team_a_score??"-"}</strong></div><div className={s.teamLine}><span className={s.teamIdentity}><span className={s.avatar}>B</span><span className={s.teamName}>{m.team_b?.name||"TBD"}</span></span><strong className={s.teamScore}>{m.team_b_score??"-"}</strong></div></Link>)}</div>{!upcoming.length&&<p className={s.sub}>No matches generated yet.</p>}</section>
  <div className={s.grid2} style={{marginTop:14}}><Link href={path("draw")} className={s.button}>View plan →</Link><Link href={path("players")} className={`${s.button} ${s.secondary}`}>View players</Link></div>
 </div></main>;
}
