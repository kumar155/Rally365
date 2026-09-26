"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {supabase} from "../../../lib/supabase";
import s from "../tournament.module.css";

type Player={id:string;display_name:string;avatar_url:string|null;seed:number|null;status:string};
export default function Players(){
 const[id,setId]=useState("");const[players,setPlayers]=useState<Player[]>([]);const[name,setName]=useState("");const[search,setSearch]=useState("");const[error,setError]=useState("");const[busy,setBusy]=useState(false);const[showAdd,setShowAdd]=useState(false);
 useEffect(()=>setId(new URLSearchParams(window.location.search).get("id")||""),[]);
 async function load(){if(!id)return;const{data,error}=await supabase.from("tournament_players").select("id,display_name,avatar_url,seed,status").eq("tournament_id",id).order("created_at");if(error)setError(error.message);setPlayers((data as Player[])||[])}
 useEffect(()=>{load()},[id]);
 async function add(e:React.FormEvent){e.preventDefault();if(!id||!name.trim())return;setBusy(true);setError("");const{error}=await supabase.from("tournament_players").insert({tournament_id:id,display_name:name.trim()});if(error)setError(error.message);else{setName("");setShowAdd(false);await load()}setBusy(false)}
 async function remove(pid:string){const{error}=await supabase.from("tournament_players").delete().eq("id",pid).eq("tournament_id",id);if(error)setError(error.message);else await load()}
 const filtered=players.filter(p=>p.display_name.toLowerCase().includes(search.toLowerCase()));const path=(p:string)=>`/tournaments/${p}?id=${encodeURIComponent(id)}`;
 if(!id)return <main className={s.page}><div className={s.shell}><div className={s.card}>Tournament ID is missing.</div></div></main>;
 return <main className={s.page}><div className={s.shell}>
  <div className={s.mobileTournamentHeader}><Link href={path("manage")} className={s.iconBack}>‹</Link><strong>Rally365 Open</strong><span className={s.menuDots}>⋮</span></div>
  <nav className={s.tabs}><Link className={s.tab} href={path("manage")}>Overview</Link><Link className={s.tab} href={path("draw")}>Draw</Link><Link className={s.tab} href={path("matches")}>Matches</Link><Link className={s.tab} href={path("standings")}>Standings</Link><Link className={`${s.tab} ${s.tabActive}`} href={path("players")}>Players</Link></nav>
  {error&&<div className={s.error}>{error}</div>}
  <div className={s.filterTabs}><button className={`${s.filterTab} ${s.filterActive}`}>All ({players.length})</button><Link className={s.filterTab} href={path("partners")}>Duos ({Math.floor(players.length/2)})</Link></div>
  <div className={s.row}><div><div className={s.eyebrow}>PLAYERS</div><h1 className={s.title}>Tournament players</h1></div><button className={s.button} onClick={()=>setShowAdd(v=>!v)}>+ Add</button></div>
  {showAdd&&<form className={s.card} style={{margin:"12px 0"}} onSubmit={add}><div className={s.field}><label>Player name</label><input className={s.input} value={name} onChange={e=>setName(e.target.value)} placeholder="Player name" autoFocus/></div><div className={s.actions}><button className={`${s.button} ${s.secondary}`} type="button" onClick={()=>setShowAdd(false)}>Cancel</button><button className={s.button} disabled={busy||!name.trim()}>{busy?"Adding…":"Add player"}</button></div></form>}
  <input className={s.input} style={{margin:"10px 0 12px"}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="⌕  Search players…" />
  <div className={s.playerGrid}>{filtered.map(p=><article className={s.playerCard} key={p.id}><div className={s.avatar}>{p.avatar_url?<img src={p.avatar_url} alt=""/>:p.display_name.charAt(0).toUpperCase()}</div><strong>{p.display_name}</strong><span>{p.seed?`Seed ${p.seed}`:"Tournament player"}</span><button type="button" className={`${s.button} ${s.danger}`} style={{marginTop:8,width:"100%",padding:"6px",fontSize:10}} onClick={()=>remove(p.id)}>Remove</button></article>)}</div>
  {!filtered.length&&<div className={s.card}>No players found.</div>}
 </div></main>;
}
