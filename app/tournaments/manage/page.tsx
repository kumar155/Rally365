"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, ChevronLeft, ChevronRight, Lock, MapPin, Search, Save, ShieldCheck, Stamp, Trophy, Unlock, Users } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import s from "../tournament.module.css";

type Tournament = {
  id: string; name: string; venue: string | null; start_date: string | null;
  format: string; partner_mode: string; status: string; rounds: number | null;
  group_count: number | null; qualifiers_per_group: number | null; games_per_match: number | null;
  is_locked: boolean;
};
type Match = { id: string; match_number: number; scheduled_at: string | null; court: number | null; status: string; team_a_score: number | null; team_b_score: number | null; team_a_duo_id: string | null; team_b_duo_id: string | null; team_a: { name: string } | null; team_b: { name: string } | null };
type Player = { id: string; display_name: string; avatar_url: string | null; status: string };
type Duo = { id: string; name: string };
type Tab = "overview" | "matches" | "standings" | "players";
type LockDialog = "lock" | "unlock" | null;

type Standing = { id: string; name: string; played: number; wins: number; losses: number; points: number };
const formatLabel = (value: string) => ({ KNOCKOUT: "Single Elimination", ROUND_ROBIN: "Round Robin", GROUPS_KNOCKOUT: "Groups → Final" } as Record<string, string>)[value] || value.replaceAll("_", " ");
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Date TBD";
const timeLabel = (value: string | null) => value ? new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "Schedule TBD";
const statusLabel = (value: string) => value === "COMPLETED" ? "COMPLETED" : value === "LIVE" || value === "IN_PROGRESS" ? "LIVE" : "SCHEDULED";

export default function TournamentManagePage() {
  const [id, setId] = useState("");
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [duos, setDuos] = useState<Duo[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState<"partner" | "format" | null>(null);
  const [partnerMode, setPartnerMode] = useState("RANDOM");
  const [format, setFormat] = useState("KNOCKOUT");
  const [games, setGames] = useState("1");
  const [groups, setGroups] = useState("2");
  const [qualifiers, setQualifiers] = useState("1");
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lockDialog, setLockDialog] = useState<LockDialog>(null);
  const [adminPin, setAdminPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  useEffect(() => setId(new URLSearchParams(window.location.search).get("id") || ""), []);
  async function load() {
    if (!id) return;
    setError("");
    const [tr, mr, pr, dr] = await Promise.all([
      supabase.from("tournaments").select("id,name,venue,start_date,format,partner_mode,status,rounds,group_count,qualifiers_per_group,games_per_match,is_locked").eq("id", id).single(),
      supabase.from("tournament_matches").select("id,match_number,scheduled_at,court,status,team_a_score,team_b_score,team_a_duo_id,team_b_duo_id,team_a:tournament_duos!tournament_matches_team_a_duo_id_fkey(name),team_b:tournament_duos!tournament_matches_team_b_duo_id_fkey(name)").eq("tournament_id", id).order("match_number"),
      supabase.from("tournament_players").select("id,display_name,avatar_url,status").eq("tournament_id", id).eq("status", "ACTIVE").order("created_at"),
      supabase.from("tournament_duos").select("id,name").eq("tournament_id", id).order("created_at"),
    ]);
    if (tr.error) { setError(tr.error.message); return; }
    const next = tr.data as Tournament;
    setTournament(next); setPartnerMode(next.partner_mode || "RANDOM"); setFormat(next.format || "KNOCKOUT"); setGames(String(next.games_per_match || 1)); setGroups(String(next.group_count || 2)); setQualifiers(String(next.qualifiers_per_group || 1));
    setMatches((mr.data || []) as unknown as Match[]); setPlayers((pr.data || []) as Player[]); setDuos((dr.data || []) as Duo[]); setDirty(false);
    if (mr.error || pr.error || dr.error) setError(mr.error?.message || pr.error?.message || dr.error?.message || "Could not load tournament data.");
  }
  useEffect(() => { load(); }, [id]);

  const locked = !!tournament?.is_locked;
  const completed = matches.filter((m) => statusLabel(m.status) === "COMPLETED").length;
  const progress = matches.length ? Math.round((completed / matches.length) * 100) : 0;
  const standings = useMemo<Standing[]>(() => {
    const map = new Map<string, Standing>();
    duos.forEach((d) => map.set(d.id, { id: d.id, name: d.name, played: 0, wins: 0, losses: 0, points: 0 }));
    matches.forEach((m) => {
      if (m.status !== "COMPLETED" || !m.team_a_duo_id || !m.team_b_duo_id || m.team_a_score == null || m.team_b_score == null) return;
      const a = map.get(m.team_a_duo_id); const b = map.get(m.team_b_duo_id); if (!a || !b) return;
      a.played++; b.played++;
      if (m.team_a_score > m.team_b_score) { a.wins++; a.points += 2; b.losses++; }
      else if (m.team_b_score > m.team_a_score) { b.wins++; b.points += 2; a.losses++; }
    });
    return [...map.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
  }, [duos, matches]);
  const filteredPlayers = players.filter((p) => p.display_name.toLowerCase().includes(search.toLowerCase()));
  const markDirty = () => { if (!locked) { setDirty(true); setSuccess(""); } };

  async function saveConfig() {
    if (!id || locked) return;
    setSaving(true); setError(""); setSuccess("");
    const payload = { partner_mode: partnerMode, format, games_per_match: Number(games) || 1, rounds: null, group_count: format === "GROUPS_KNOCKOUT" ? Number(groups) || 1 : null, qualifiers_per_group: format === "GROUPS_KNOCKOUT" ? Number(qualifiers) || 1 : null };
    const { data, error: saveError } = await supabase.from("tournaments").update(payload).eq("id", id).select("id,name,venue,start_date,format,partner_mode,status,rounds,group_count,qualifiers_per_group,games_per_match,is_locked").single();
    if (saveError) setError(saveError.message); else { setTournament(data as Tournament); setDirty(false); setSuccess("Tournament settings saved."); }
    setSaving(false);
  }

  function openLockDialog() {
    setError("");
    setSuccess("");
    setAdminPin("");
    setConfirmPin("");
    setLockDialog(locked ? "unlock" : "lock");
  }

  async function submitLockAction() {
    if (!id) return;
    const pin = adminPin.trim();
    if (!/^\d{6}$/.test(pin)) {
      setError("Admin PIN must be exactly 6 digits.");
      return;
    }
    if (lockDialog === "lock" && pin !== confirmPin.trim()) {
      setError("PIN and confirmation PIN do not match.");
      return;
    }

    setLocking(true); setError(""); setSuccess("");
    const action = lockDialog === "lock" ? "LOCK" : "UNLOCK";
    const { error: lockError } = await supabase.rpc("admin_lock_tournament", {
      p_tournament_id: id,
      p_pin: pin,
      p_action: action,
    });

    if (lockError) {
      setError(lockError.message);
      setLocking(false);
      return;
    }

    setLockDialog(null);
    setAdminPin("");
    setConfirmPin("");
    setDirty(false);
    setSuccess(action === "LOCK" ? "Tournament locked. Configuration, players, draw and score changes are now disabled." : "Tournament unlocked with admin PIN. Protected tournament changes are enabled again.");
    await load();
    setLocking(false);
  }

  if (!id) return <main className={s.page}><div className={s.shell}><div className={s.card}>Tournament ID is missing.</div></div></main>;
  if (error && !tournament) return <main className={s.page}><div className={s.shell}><div className={s.error}>{error}</div></div></main>;

  return <main className={s.page} style={{ paddingTop: 8 }}><div className={s.shell} style={{ maxWidth: 440 }}>
    <header style={{ height: 48, display: "grid", gridTemplateColumns: "40px 1fr 40px", alignItems: "center", textAlign: "center", marginBottom: 2 }}>
      <Link href="/tournaments" aria-label="Back" style={{ width: 40, height: 40, borderRadius: 20, background: "#fff", border: "1px solid #e2ebe7", display: "flex", alignItems: "center", justifyContent: "center", color: "#17352a" }}><ChevronLeft size={18} /></Link>
      <div><div className={s.eyebrow} style={{ fontSize: 8 }}>RALLY365 OPEN</div><strong style={{ fontSize: 13 }}>{tournament?.name || "Tournament"}</strong></div>
      <button type="button" aria-label={locked ? "Unlock tournament" : "Lock tournament"} onClick={openLockDialog} disabled={locking} style={{ width: 40, height: 40, borderRadius: 20, background: locked ? "#fff7ed" : "#fff", border: `1px solid ${locked ? "#f2d4aa" : "#e2ebe7"}`, display: "flex", alignItems: "center", justifyContent: "center", color: locked ? "#b45309" : "#17352a" }}>{locked ? <Unlock size={17} /> : <Lock size={17} />}</button>
    </header>

    <section style={{ background: "linear-gradient(135deg,#166534 0%,#14532d 52%,#0f172a 100%)", color: "#fff", borderRadius: 24, padding: 20, position: "relative", overflow: "hidden", boxShadow: "0 8px 24px rgba(8,45,28,.16)" }}>
      <Trophy size={110} style={{ position: "absolute", right: -16, bottom: -25, opacity: .07 }} />
      <div style={{ position: "relative", zIndex: 1 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.22)", fontSize: 9, fontWeight: 900 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: locked ? "#fbbf24" : "#86efac" }} />{locked ? "LOCKED" : tournament?.status || "UPCOMING"}</span>
        <span style={{ padding: "6px 9px", borderRadius: 9, background: "rgba(0,0,0,.2)", color: "#bbf7d0", fontSize: 9, fontWeight: 800 }}><ShieldCheck size={11} style={{ verticalAlign: -2 }} /> Vega Club</span>
      </div><h1 style={{ fontSize: 27, lineHeight: 1, margin: "18px 0 8px", letterSpacing: "-.04em" }}>{tournament?.name || "Tournament"}</h1><div style={{ display: "flex", gap: 9, flexWrap: "wrap", color: "#d1fae5", fontSize: 10, fontWeight: 700 }}><span><CalendarCheck2 size={12} style={{ verticalAlign: -2, marginRight: 4 }} />{dateLabel(tournament?.start_date || null)}</span><span>•</span><span><MapPin size={12} style={{ verticalAlign: -2, marginRight: 4 }} />{tournament?.venue || "Venue TBD"}</span></div>
      <div style={{ marginTop: 18 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 800, color: "#bbf7d0", marginBottom: 5 }}><span>Tournament Progress</span><span>{progress}% Completed</span></div><div style={{ height: 7, borderRadius: 99, background: "rgba(0,0,0,.35)", overflow: "hidden" }}><div style={{ width: `${progress}%`, height: "100%", borderRadius: 99, background: "#34d399" }} /></div></div></div>
    </section>

    <div style={{ margin: "10px 0 12px", background: "#e9eeeb", border: "1px solid #dce5e0", borderRadius: 18, padding: 5, display: "flex", gap: 4, overflowX: "auto" }}>
      {([["overview", "Overview"], ["matches", `Matches${matches.length ? ` · ${matches.length}` : ""}`], ["standings", "Standings"], ["players", `Players${players.length ? ` · ${players.length}` : ""}`]] as [Tab, string][]).map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} style={{ flex: "1 0 auto", border: 0, borderRadius: 13, padding: "9px 11px", background: tab === value ? "#fff" : "transparent", color: tab === value ? "#15985c" : "#61736b", fontSize: 10, fontWeight: 900, boxShadow: tab === value ? "0 2px 7px rgba(20,60,42,.08)" : "none" }}>{label}</button>)}
      <Link href={`/tournaments/draw?id=${encodeURIComponent(id)}`} style={{ flex: "1 0 auto", borderRadius: 13, padding: "9px 11px", color: "#61736b", fontSize: 10, fontWeight: 900, textDecoration: "none", textAlign: "center", pointerEvents: locked ? "none" : "auto", opacity: locked ? .45 : 1 }}>Draw</Link>
    </div>
    {error && <div className={s.error}>{error}</div>}{success && <div className={s.success}>{success}</div>}

    {tab === "overview" && <div style={{ display: "grid", gap: 12 }}>
      <div className={s.overviewStats}><div className={s.overviewStat} style={{ background: "#eff6ff", borderColor: "#c7def7" }}><Stamp size={18} color="#2563eb" /><strong style={{ fontSize: 12, marginTop: 6 }}>{formatLabel(tournament?.format || "")}</strong><span>Format</span></div><div className={s.overviewStat} style={{ background: "#ecfdf5", borderColor: "#b9ead2" }}><Users size={18} color="#15985c" /><strong>{duos.length}</strong><span>Duos</span></div><div className={s.overviewStat} style={{ background: "#faf5ff", borderColor: "#dfc8f5" }}><strong style={{ fontSize: 16 }}>₹0</strong><span>Entry</span></div><div className={s.overviewStat} style={{ background: "#fff7ed", borderColor: "#f3d7ad" }}><Trophy size={18} color="#b45309" /><strong>{matches.length}</strong><span>Matches</span></div></div>
      <section className={s.card} style={{ padding: 14 }}>
        <div>
          <div className={s.eyebrow}>TOURNAMENT RULES</div>
          <h2 style={{ fontSize: 16, margin: "4px 0 0" }}>Tournament configuration</h2>
        </div>
        {locked && <section style={{ marginTop: 14, padding: 15, background: "#fff9f9", border: "1px solid #ead4d4", borderRadius: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 42, height: 42, borderRadius: 14, background: "#fff1f1", border: "1px solid #efdada", color: "#9f3f3f", display: "grid", placeItems: "center", flex: "0 0 auto" }}><Lock size={19} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: "block", fontSize: 15, lineHeight: 1.2, color: "#9f3f3f" }}>Tournament is locked</strong>
              <span style={{ display: "block", marginTop: 5, fontSize: 10.5, lineHeight: 1.45, color: "#7d7777" }}>No one can change configuration, players, draw or scores while the tournament is locked.</span>
            </div>
            <button type="button" onClick={openLockDialog} disabled={locking} style={{ flex: "0 0 auto", border: "1px solid #e1caca", background: "#fff", color: "#9f3f3f", borderRadius: 13, padding: "10px 12px", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 900, whiteSpace: "nowrap" }}><Unlock size={14} />{locking ? "…" : "Admin unlock"}</button>
          </div>
        </section>}
        {!locked && <div style={{ marginTop: 14, display: "grid", gap: 8 }}><button type="button" onClick={() => setSheet("partner")} style={{ border: "1px solid #e0e9e5", background: "#f7faf8", borderRadius: 14, padding: 12, display: "flex", justifyContent: "space-between", textAlign: "left" }}><span><small style={{ display: "block", color: "#81918b", fontSize: 8, fontWeight: 900, letterSpacing: ".12em" }}>PARTNER MODE</small><b style={{ fontSize: 11 }}>{partnerMode === "RANDOM" ? "Random Partners (Auto-assigned)" : "Already fixed partners"}</b></span><ChevronRight size={16} color="#94a29b" /></button><button type="button" onClick={() => setSheet("format")} style={{ border: "1px solid #e0e9e5", background: "#f7faf8", borderRadius: 14, padding: 12, display: "flex", justifyContent: "space-between", textAlign: "left" }}><span><small style={{ display: "block", color: "#81918b", fontSize: 8, fontWeight: 900, letterSpacing: ".12em" }}>FORMAT MODE</small><b style={{ fontSize: 11 }}>{formatLabel(format)}</b></span><ChevronRight size={16} color="#94a29b" /></button><div style={{ border: "1px solid #e0e9e5", background: "#f7faf8", borderRadius: 14, padding: 12 }}><small style={{ display: "block", color: "#81918b", fontSize: 8, fontWeight: 900, letterSpacing: ".12em", marginBottom: 7 }}>GAMES PER MATCH</small><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4, background: "#e7ece9", borderRadius: 10, padding: 4 }}>{["1", "3", "5"].map(v => <button key={v} type="button" onClick={() => { setGames(v); markDirty(); }} style={{ border: 0, borderRadius: 8, padding: "7px 3px", background: games === v ? "#fff" : "transparent", color: games === v ? "#15985c" : "#65766f", fontSize: 9, fontWeight: 900 }}>{v === "1" ? "1 Game" : `Best of ${v}`}</button>)}</div></div>{format === "GROUPS_KNOCKOUT" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><Counter label="Groups" value={groups} onChange={(v) => { setGroups(v); markDirty(); }} /><Counter label="Qualifiers" value={qualifiers} onChange={(v) => { setQualifiers(v); markDirty(); }} /></div>}</div>}
      </section>
      {!locked && dirty && <div style={{ position: "sticky", bottom: 8, zIndex: 5 }}><button type="button" className={s.button} onClick={saveConfig} disabled={saving} style={{ width: "100%", borderRadius: 15, boxShadow: "0 10px 25px rgba(8,139,92,.25)" }}><Save size={15} />{saving ? "Saving…" : "Save Configuration Changes"}</button></div>}
    </div>}

    {tab === "matches" && <section style={{ display: "grid", gap: 9 }}><div style={{ padding: "0 2px" }}><div className={s.eyebrow}>MATCHES</div><h2 style={{ fontSize: 18, margin: "4px 0" }}>Match schedule</h2><p className={s.sub}>{matches.length} matches · {completed} completed</p></div>{matches.map(m => <MatchTile key={m.id} match={m} />)}{!matches.length && <div className={s.card}>No matches scheduled yet.</div>}</section>}
    {tab === "standings" && <section style={{ display: "grid", gap: 10 }}><div style={{ padding: "0 2px" }}><div className={s.eyebrow}>STANDINGS</div><h2 style={{ fontSize: 18, margin: "4px 0" }}>Leaderboard</h2><p className={s.sub}>Points and match results from recorded scores.</p></div><div className={s.leaderboardCard} style={{ padding: 0, overflow: "hidden" }}><div style={{ background: "#f2f7f4", padding: "9px 10px", display: "grid", gridTemplateColumns: "25px 1fr 35px 35px 35px", color: "#72867e", fontSize: 8, fontWeight: 900 }}><span>#</span><span>DUO</span><span>P</span><span>W</span><span>PTS</span></div>{standings.map((row, i) => <div key={row.id} style={{ display: "grid", gridTemplateColumns: "25px 1fr 35px 35px 35px", alignItems: "center", padding: "10px", borderTop: "1px solid #e7efec", background: i === 0 ? "#f4fbf7" : "#fff", fontSize: 10 }}><b style={{ color: i === 0 ? "#15985c" : "#72867e" }}>{i + 1}</b><strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</strong><span>{row.played}</span><span>{row.wins}</span><b style={{ color: "#006a47" }}>{row.points}</b></div>)}</div></section>}
    {tab === "players" && <section style={{ display: "grid", gap: 9 }}><div style={{ padding: "0 2px" }}><div className={s.eyebrow}>PLAYERS</div><h2 style={{ fontSize: 18, margin: "4px 0" }}>Tournament players</h2><p className={s.sub}>{locked ? "Player changes are disabled while the tournament is locked." : "Manage tournament participants."}</p></div><div style={{ position: "relative" }}><Search size={14} color="#94a29b" style={{ position: "absolute", left: 12, top: 13 }} /><input className={s.input} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players..." style={{ paddingLeft: 34, borderRadius: 15 }} /></div><div className={s.playerList}>{filteredPlayers.map(p => <div className={s.playerRow} key={p.id}><div className={s.playerRowIdentity}><div className={s.avatar}>{p.avatar_url ? <img src={p.avatar_url} alt="" /> : p.display_name.charAt(0).toUpperCase()}</div><div><strong>{p.display_name}</strong><span>Active in tournament</span></div></div><ChevronRight size={16} color="#94a29b" /></div>)}</div><Link href={`/tournaments/players?id=${encodeURIComponent(id)}`} className={s.button} style={{ textDecoration: "none", textAlign: "center", opacity: locked ? .55 : 1, pointerEvents: locked ? "none" : "auto" }}>Manage Players</Link></section>}

    {sheet && !locked && <div role="dialog" aria-modal="true" onClick={() => setSheet(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.48)", backdropFilter: "blur(3px)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}><div onClick={e => e.stopPropagation()} style={{ width: "min(440px,100%)", background: "#fff", borderRadius: "26px 26px 0 0", padding: 20, boxShadow: "0 -12px 35px rgba(0,0,0,.16)" }}><div style={{ width: 48, height: 5, background: "#d7dfdb", borderRadius: 99, margin: "-3px auto 16px" }} /><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><h3 style={{ margin: 0, fontSize: 16 }}>{sheet === "partner" ? "Select Partner Mode" : "Select Tournament Format"}</h3><button type="button" onClick={() => setSheet(null)} style={{ border: 0, background: "#eef3f1", width: 32, height: 32, borderRadius: 99 }}>×</button></div>{(sheet === "partner" ? [["RANDOM", "Random Partners (Auto-assigned)"], ["FIXED", "Already fixed partners"]] : [["KNOCKOUT", "Single Elimination"], ["ROUND_ROBIN", "Round Robin"], ["GROUPS_KNOCKOUT", "Groups → Final"]]).map(([value, label]) => <button key={value} type="button" onClick={() => { if (sheet === "partner") setPartnerMode(value); else setFormat(value); markDirty(); setSheet(null); }} style={{ width: "100%", border: "1px solid #e0e9e5", background: ((sheet === "partner" ? partnerMode : format) === value) ? "#eaf8f1" : "#f8faf9", borderRadius: 14, padding: 13, marginTop: 7, textAlign: "left", fontSize: 11, fontWeight: 800, color: "#17352a" }}>{label}{((sheet === "partner" ? partnerMode : format) === value) && <span style={{ float: "right", color: "#15985c" }}>✓</span>}</button>)}</div></div>}

    {lockDialog && <div role="dialog" aria-modal="true" onClick={() => !locking && setLockDialog(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.48)", backdropFilter: "blur(3px)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}><div onClick={e => e.stopPropagation()} style={{ width: "min(440px,100%)", background: "#fff", borderRadius: "26px 26px 0 0", padding: 20, boxShadow: "0 -12px 35px rgba(0,0,0,.16)" }}><div style={{ width: 48, height: 5, background: "#d7dfdb", borderRadius: 99, margin: "-3px auto 16px" }} /><div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}><div style={{ width: 42, height: 42, borderRadius: 14, background: lockDialog === "lock" ? "#eef8f3" : "#fff3df", color: lockDialog === "lock" ? "#15985c" : "#a16207", display: "grid", placeItems: "center" }}>{lockDialog === "lock" ? <Lock size={19} /> : <Unlock size={19} />}</div><div><h3 style={{ margin: 0, fontSize: 17 }}>{lockDialog === "lock" ? "Lock tournament" : "Admin unlock"}</h3><p style={{ margin: "4px 0 0", fontSize: 10, color: "#72867e" }}>{lockDialog === "lock" ? "Set or confirm the 6-digit admin PIN. This PIN is required to unlock the tournament." : "Enter the 6-digit admin PIN to enable tournament changes."}</p></div></div><label style={{ display: "block", fontSize: 9, fontWeight: 900, color: "#61736b", letterSpacing: ".08em", marginBottom: 6 }}>ADMIN PIN</label><input autoFocus inputMode="numeric" maxLength={6} type="password" value={adminPin} onChange={e => setAdminPin(e.target.value.replace(/\D/g, "").slice(0, 6))} className={s.input} placeholder="6-digit PIN" style={{ letterSpacing: ".28em", fontWeight: 900, textAlign: "center" }} />{lockDialog === "lock" && <><label style={{ display: "block", fontSize: 9, fontWeight: 900, color: "#61736b", letterSpacing: ".08em", margin: "12px 0 6px" }}>CONFIRM PIN</label><input inputMode="numeric" maxLength={6} type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))} className={s.input} placeholder="Repeat PIN" style={{ letterSpacing: ".28em", fontWeight: 900, textAlign: "center" }} /></>}{error && <div className={s.error} style={{ marginTop: 10 }}>{error}</div>}<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}><button type="button" disabled={locking} onClick={() => setLockDialog(null)} className={`${s.button} ${s.secondary}`}>Cancel</button><button type="button" disabled={locking} onClick={submitLockAction} className={s.button}>{locking ? "Checking…" : lockDialog === "lock" ? "Lock tournament" : "Unlock tournament"}</button></div></div></div>}
  </div></main>;
}

function Counter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { const current = Math.max(1, Number(value) || 1); return <div style={{ padding: 11, background: "#f7faf8", border: "1px solid #e0e9e5", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}><div><small style={{ display: "block", color: "#81918b", fontSize: 8, fontWeight: 900 }}>{label}</small><b style={{ fontSize: 12 }}>{current}</b></div><div style={{ display: "flex", gap: 4 }}><button type="button" onClick={() => onChange(String(Math.max(1, current - 1)))} style={{ width: 27, height: 27, border: 0, borderRadius: 8, background: "#e3e9e6", fontWeight: 900 }}>−</button><button type="button" onClick={() => onChange(String(current + 1))} style={{ width: 27, height: 27, border: 0, borderRadius: 8, background: "#e3e9e6", fontWeight: 900 }}>+</button></div></div>; }
function MatchTile({ match }: { match: Match }) { const status = statusLabel(match.status); return <article className={s.matchTile}><div className={s.matchTileTop}><span>MATCH {match.match_number}</span><span>{match.court ? `Court ${match.court}` : timeLabel(match.scheduled_at)}</span></div><div className={s.teamLine}><span className={s.teamName}>{match.team_a?.name || "Team A"}</span><strong className={s.teamScore}>{match.team_a_score ?? "–"}</strong></div><div className={s.teamLine}><span className={s.teamName}>{match.team_b?.name || "Team B"}</span><strong className={s.teamScore}>{match.team_b_score ?? "–"}</strong></div><div className={s.matchTileBottom}><span className={`${s.matchStatusIcon} ${status === "COMPLETED" ? s.completed : status === "LIVE" ? s.live : s.scheduled}`}>{status === "COMPLETED" ? "✓" : status === "LIVE" ? "•" : "○"}</span><span>{status}</span><ChevronRight className={s.chevron} size={15} /></div></article>; }
