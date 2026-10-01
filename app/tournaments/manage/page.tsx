"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coins,
  Gamepad2,
  DatabaseZap,
  Home,
  Lock,
  MapPin,
  Pencil,
  Play,
  Search,
  Save,
  ShieldCheck,
  Table2,
  Trophy,
  Unlock,
  Users,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";
import s from "../tournament.module.css";

type Tournament = {
  id: string;
  name: string;
  venue: string | null;
  start_date: string | null;
  format: string;
  partner_mode: string;
  status: string;
  rounds: number | null;
  group_count: number | null;
  qualifiers_per_group: number | null;
  games_per_match: number | null;
  is_locked: boolean;
};
type Match = {
  id: string;
  match_number: number;
  scheduled_at: string | null;
  court: number | null;
  status: string;
  team_a_score: number | null;
  team_b_score: number | null;
  team_a_duo_id: string | null;
  team_b_duo_id: string | null;
  team_a: { name: string } | null;
  team_b: { name: string } | null;
};
type Player = { id: string; display_name: string; avatar_url: string | null; status: string };
type Duo = { id: string; name: string };
type Tab = "overview" | "matches" | "standings" | "players";
type LockDialog = "lock" | "unlock" | null;
type Standing = { id: string; name: string; played: number; wins: number; losses: number; points: number };

const formatLabel = (value: string) =>
  ({ KNOCKOUT: "Single Elimination", ROUND_ROBIN: "Round Robin", GROUPS_KNOCKOUT: "Groups → Final" } as Record<string, string>)[value] || value.replaceAll("_", " ");
const dateLabel = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Date TBD";
const timeLabel = (value: string | null) =>
  value ? new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "Schedule TBD";
const statusLabel = (value: string) =>
  value === "COMPLETED" ? "COMPLETED" : value === "LIVE" || value === "IN_PROGRESS" ? "LIVE" : "SCHEDULED";

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
    if (tr.error) {
      setError(tr.error.message);
      return;
    }
    const next = tr.data as Tournament;
    setTournament(next);
    setPartnerMode(next.partner_mode || "RANDOM");
    setFormat(next.format || "KNOCKOUT");
    setGames(String(next.games_per_match || 1));
    setGroups(String(next.group_count || 2));
    setQualifiers(String(next.qualifiers_per_group || 1));
    setMatches((mr.data || []) as unknown as Match[]);
    setPlayers((pr.data || []) as Player[]);
    setDuos((dr.data || []) as Duo[]);
    setDirty(false);
    if (mr.error || pr.error || dr.error) setError(mr.error?.message || pr.error?.message || dr.error?.message || "Could not load tournament data.");
  }

  useEffect(() => {
    load();
  }, [id]);

  const locked = !!tournament?.is_locked;
  const completed = matches.filter((m) => statusLabel(m.status) === "COMPLETED").length;
  const live = matches.some((m) => statusLabel(m.status) === "LIVE");
  const progress = matches.length ? Math.round((completed / matches.length) * 100) : 0;
  const displayStatus = locked ? "LOCKED" : live ? "LIVE" : matches.length && completed === matches.length ? "COMPLETED" : matches.length ? "LIVE" : "UPCOMING";

  const standings = useMemo<Standing[]>(() => {
    const map = new Map<string, Standing>();
    duos.forEach((d) => map.set(d.id, { id: d.id, name: d.name, played: 0, wins: 0, losses: 0, points: 0 }));
    matches.forEach((m) => {
      if (m.status !== "COMPLETED" || !m.team_a_duo_id || !m.team_b_duo_id || m.team_a_score == null || m.team_b_score == null) return;
      const a = map.get(m.team_a_duo_id);
      const b = map.get(m.team_b_duo_id);
      if (!a || !b) return;
      a.played++;
      b.played++;
      if (m.team_a_score > m.team_b_score) {
        a.wins++;
        a.points += 2;
        b.losses++;
      } else if (m.team_b_score > m.team_a_score) {
        b.wins++;
        b.points += 2;
        a.losses++;
      }
    });
    return [...map.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
  }, [duos, matches]);

  const filteredPlayers = players.filter((p) => p.display_name.toLowerCase().includes(search.toLowerCase()));
  const markDirty = () => {
    if (!locked) {
      setDirty(true);
      setSuccess("");
    }
  };

  async function saveConfig() {
    if (!id || locked) return;
    setSaving(true);
    setError("");
    setSuccess("");
    const payload = {
      partner_mode: partnerMode,
      format,
      games_per_match: Number(games) || 1,
      rounds: null,
      group_count: format === "GROUPS_KNOCKOUT" ? Number(groups) || 1 : null,
      qualifiers_per_group: format === "GROUPS_KNOCKOUT" ? Number(qualifiers) || 1 : null,
    };
    const { data, error: saveError } = await supabase
      .from("tournaments")
      .update(payload)
      .eq("id", id)
      .select("id,name,venue,start_date,format,partner_mode,status,rounds,group_count,qualifiers_per_group,games_per_match,is_locked")
      .single();
    if (saveError) setError(saveError.message);
    else {
      setTournament(data as Tournament);
      setDirty(false);
      setSuccess("Tournament settings saved.");
    }
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
    setLocking(true);
    setError("");
    setSuccess("");
    const action = lockDialog === "lock" ? "LOCK" : "UNLOCK";
    const { error: lockError } = await supabase.rpc("admin_lock_tournament", { p_tournament_id: id, p_pin: pin, p_action: action });
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

  return (
    <main className={s.page} style={{ padding: "8px 12px 90px", background: "#f7faf8" }}>
      <div className={s.shell} style={{ maxWidth: 440 }}>
        <header className="tournamentMobileHeader">
          <Link href="/tournaments" aria-label="Home" className="roundIcon"><Home size={18} /></Link>
          <div className="tournamentHeaderTitle">{tournament?.name || "Tournament"}</div>
          <button type="button" aria-label={locked ? "Unlock tournament" : "Lock tournament"} onClick={openLockDialog} disabled={locking} className="roundIcon">
            {locked ? <Unlock size={17} /> : <Lock size={17} />}
          </button>
        </header>

        <section className="tournamentHeroRef">
          <div className="heroDecor racket">🏸</div>
          <div className="heroDecor trophy"><Trophy size={105} /></div>
          <div className="heroTopRow">
            <span className="livePill"><span className={displayStatus === "LOCKED" ? "statusDot locked" : "statusDot"} />{displayStatus}</span>
            <span className="clubPill"><ShieldCheck size={13} /> Vega Club</span>
          </div>
          <div className="heroContent">
            <h1>{tournament?.name || "Tournament"}</h1>
            <p className="heroSubtitle">Badminton Tournament</p>
            <div className="heroMeta">
              <span><CalendarDays size={14} />{dateLabel(tournament?.start_date || null)}</span>
              <span>•</span>
              <span><MapPin size={14} />{tournament?.venue || "Vega Club"}</span>
            </div>
            <div className="progressLabel"><strong>Tournament Progress</strong><strong>{progress}% Completed</strong></div>
            <div className="progressTrack"><div style={{ width: `${progress}%` }} /></div>
            <div className="progressFoot">{completed} of {matches.length} matches completed <span>•</span> Next: {completed < matches.length ? "Next Match" : "Tournament Complete"}</div>
          </div>
        </section>

        <nav className="tournamentNavRef" aria-label="Tournament navigation">
          {([["overview", "Overview"], ["matches", "Matches"], ["standings", "Standings"], ["players", "Players"]] as [Tab, string][]).map(([value, label]) => (
            <button key={value} type="button" className={`tNavItem ${tab === value ? "active" : ""}`} onClick={() => setTab(value)}>
              {value === "overview" && <Trophy size={19} />}
              {value === "matches" && <Gamepad2 size={19} />}
              {value === "standings" && <Trophy size={19} />}
              {value === "players" && <Users size={19} />}
              <span>{label}</span>
              {(value === "matches" && matches.length > 0) || (value === "players" && players.length > 0) ? <em>{value === "matches" ? matches.length : players.length}</em> : null}
            </button>
          ))}
          <Link href={`/tournaments/draw?id=${encodeURIComponent(id)}`} className={`tNavItem drawNav ${locked ? "disabled" : ""}`} aria-disabled={locked} onClick={(e) => locked && e.preventDefault()}>
            <Trophy size={19} />
            <span>Draw</span>
          </Link>
        </nav>

        {error && <div className={s.error}>{error}</div>}
        {success && <div className={s.success}>{success}</div>}

        {tab === "overview" && (
          <div className="overviewRef">
            <div className="overviewGridRef">
              <Link href={`/tournaments/standings?id=${encodeURIComponent(id)}`} className="overviewCardRef tone-green overviewNavCard" aria-label="Open tournament table">
                <div className="overviewIconRef"><Table2 /></div>
                <div className="overviewValueRef">Table</div>
                <div className="overviewLabelRef">View all stats</div>
                <ChevronRight className="overviewNavArrow" />
              </Link>
              <OverviewCard icon={<Users />} value={String(duos.length)} label="Duos / Teams" tone="green" />
              <Link href={`/tournaments/matches?id=${encodeURIComponent(id)}`} className="overviewCardRef tone-green overviewNavCard" aria-label="Open match schedule">
                <div className="overviewIconRef"><CalendarClock /></div>
                <div className="overviewValueRef">{completed} / {matches.length}</div>
                <div className="overviewLabelRef">Match Schedule</div>
                <ChevronRight className="overviewNavArrow" />
              </Link>
              <OverviewCard icon={<Trophy />} value={String(matches.length)} label="Total Matches" tone="green" />
            </div>

            <section className="configRef">
              <div className="sectionEyebrow">TOURNAMENT RULES</div>
              <div className="configTitleRow">
                <div>
                  <h2>Tournament configuration</h2>
                </div>
                {!locked && <button type="button" className="editButton" onClick={() => setSheet("format")}><Pencil size={14} /> Edit</button>}
              </div>

              {locked && (
                <div className="lockedRefCard">
                  <div>
                    <strong>Tournament is locked</strong>
                    <span>No one can change configuration, players, draw or scores while the tournament is locked.</span>
                  </div>
                  <button type="button" onClick={openLockDialog} disabled={locking}><Lock size={17} /> Admin unlock</button>
                </div>
              )}

              <div className="configRows">
                <button type="button" className="configRowRef" disabled={locked} onClick={() => setSheet("partner")}>
                  <div className="configIcon"><Users size={23} /></div>
                  <div className="configText"><small>PARTNER MODE</small><strong>{partnerMode === "RANDOM" ? "Random Partners (Auto-assigned)" : "Already fixed partners"}</strong><span>{partnerMode === "RANDOM" ? "Partners will be assigned randomly by the system" : "Partners are already fixed"}</span></div>
                  <ChevronRight size={20} />
                </button>
                <button type="button" className="configRowRef" disabled={locked} onClick={() => setSheet("format")}>
                  <div className="configIcon"><ShieldCheck size={23} /></div>
                  <div className="configText"><small>FORMAT MODE</small><strong>{formatLabel(format)}</strong><span>{format === "KNOCKOUT" ? "Knockout format – one loss and you're out" : format === "GROUPS_KNOCKOUT" ? "Group stage followed by final rounds" : "Everyone plays the configured schedule"}</span></div>
                  <ChevronRight size={20} />
                </button>
                <div className="configRowRef gameRow">
                  <div className="configIcon"><Gamepad2 size={23} /></div>
                  <div className="configText full"><small>GAMES PER MATCH</small>
                    <div className="gameSegmentRef">
                      {["1", "3", "5"].map((v) => <button key={v} type="button" disabled={locked} className={games === v ? "selected" : ""} onClick={() => { setGames(v); markDirty(); }}>{v === "1" ? "1 Game" : `Best of ${v}`}</button>)}
                    </div>
                  </div>
                </div>
                {format === "GROUPS_KNOCKOUT" && <div className="counterGridRef"><Counter label="Groups" value={groups} onChange={(v) => { setGroups(v); markDirty(); }} /><Counter label="Qualifiers" value={qualifiers} onChange={(v) => { setQualifiers(v); markDirty(); }} /></div>}
              </div>
            </section>

            {!locked && dirty && <button type="button" className="saveRef" onClick={saveConfig} disabled={saving}><Save size={16} />{saving ? "Saving…" : "Save Configuration Changes"}</button>}
          </div>
        )}

        {tab === "matches" && <section className="contentRef"><div className="contentHeading"><div className="sectionEyebrow">MATCHES</div><h2>Match schedule</h2><p>{matches.length} matches · {completed} completed</p></div><div className="matchGridRef">{matches.map((m) => <MatchTile key={m.id} match={m} />)}</div>{!matches.length && <div className={s.card}>No matches scheduled yet.</div>}</section>}

        {tab === "standings" && <section className="contentRef"><div className="contentHeading"><div className="sectionEyebrow">STANDINGS</div><h2>Tournament standings</h2><p>Live ranking from completed tournament matches.</p></div><div className="standingRefTable"><div className="standingRefHead"><span>#</span><span>TEAM</span><span>P</span><span>W</span><span>L</span><span>PTS</span></div>{standings.map((row, i) => <div className={`standingRefRow ${i === 0 ? "leader" : ""}`} key={row.id}><b>{i + 1}</b><div className="standingTeamRef"><span>{row.name.slice(0, 2).toUpperCase()}</span><div><strong>{row.name}</strong><small>{row.played} played · {row.wins} won · {row.losses} lost</small></div></div><span>{row.played}</span><span>{row.wins}</span><span>{row.losses}</span><b>{row.points}</b></div>)}</div>{!standings.length && <div className={s.card}>No standings yet.</div>}</section>}

        {tab === "players" && <section className="contentRef"><div className="contentHeading"><div className="sectionEyebrow">PLAYERS</div><h2>Tournament players</h2><p>{locked ? "Player changes are disabled while the tournament is locked." : "Manage tournament participants."}</p></div><div className="searchRef"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search players..." /></div><div className={s.playerList}>{filteredPlayers.map((p) => <div className={s.playerRow} key={p.id}><div className={s.playerRowIdentity}><div className={s.avatar}>{p.avatar_url ? <img src={p.avatar_url} alt="" /> : p.display_name.charAt(0).toUpperCase()}</div><div><strong>{p.display_name}</strong><span>Active in tournament</span></div></div><ChevronRight size={16} color="#94a29b" /></div>)}</div><Link href={`/tournaments/players?id=${encodeURIComponent(id)}`} className={s.button} style={{ textDecoration: "none", textAlign: "center", opacity: locked ? .55 : 1, pointerEvents: locked ? "none" : "auto" }}>Manage Players</Link></section>}

        {sheet && !locked && <div role="dialog" aria-modal="true" className="sheetOverlayRef" onClick={() => setSheet(null)}><div className="sheetRef" onClick={(e) => e.stopPropagation()}><div className="sheetHandleRef" /><div className="sheetTitleRef"><h3>{sheet === "partner" ? "Select Partner Mode" : "Select Tournament Format"}</h3><button type="button" onClick={() => setSheet(null)}>×</button></div>{(sheet === "partner" ? [["RANDOM", "Random Partners (Auto-assigned)"], ["FIXED", "Already fixed partners"]] : [["KNOCKOUT", "Single Elimination"], ["ROUND_ROBIN", "Round Robin"], ["GROUPS_KNOCKOUT", "Groups → Final"]]).map(([value, label]) => <button key={value} type="button" className="sheetOptionRef" onClick={() => { if (sheet === "partner") setPartnerMode(value); else setFormat(value); markDirty(); setSheet(null); }}>{label}{((sheet === "partner" ? partnerMode : format) === value) && <span>✓</span>}</button>)}</div></div>}

        {lockDialog && <div role="dialog" aria-modal="true" className="sheetOverlayRef" onClick={() => !locking && setLockDialog(null)}><div className="sheetRef" onClick={(e) => e.stopPropagation()}><div className="sheetHandleRef" /><div className="lockTitleRef"><div className="lockIconRef">{lockDialog === "lock" ? <Lock size={20} /> : <Unlock size={20} />}</div><div><h3>{lockDialog === "lock" ? "Lock tournament" : "Admin unlock"}</h3><p>{lockDialog === "lock" ? "Set a 6-digit admin PIN. It will be required to unlock the tournament." : "Enter the 6-digit admin PIN to enable tournament changes."}</p></div></div><label className="pinLabelRef">ADMIN PIN</label><input autoFocus inputMode="numeric" maxLength={6} type="password" value={adminPin} onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, "").slice(0, 6))} className={s.input} placeholder="6-digit PIN" style={{ letterSpacing: ".28em", fontWeight: 900, textAlign: "center" }} />{lockDialog === "lock" && <><label className="pinLabelRef second">CONFIRM PIN</label><input inputMode="numeric" maxLength={6} type="password" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))} className={s.input} placeholder="Repeat PIN" style={{ letterSpacing: ".28em", fontWeight: 900, textAlign: "center" }} /></>}{error && <div className={s.error}>{error}</div>}<div className="lockActionsRef"><button type="button" className="cancelRef" disabled={locking} onClick={() => setLockDialog(null)}>Cancel</button><button type="button" className="confirmRef" disabled={locking} onClick={submitLockAction}>{locking ? "Checking…" : lockDialog === "lock" ? "Lock tournament" : "Unlock tournament"}</button></div></div></div>}
      </div>

      <style jsx>{`
        .tournamentMobileHeader{height:52px;display:grid;grid-template-columns:42px 1fr 42px;align-items:center;text-align:center;margin-bottom:5px}
        .roundIcon{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#fff;border:1px solid #dfe9e4;color:#17352a;text-decoration:none}
        .tournamentHeaderTitle{font-size:15px;font-weight:600;color:#17352a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .tournamentHeroRef{position:relative;min-height:270px;overflow:hidden;border-radius:25px;padding:20px;background:linear-gradient(135deg,#03a86c 0%,#087e5a 48%,#0c4b63 100%);color:#fff;box-shadow:0 8px 24px rgba(9,79,57,.15)}
        .tournamentHeroRef:after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 84% 12%,rgba(255,255,255,.18),transparent 25%),linear-gradient(145deg,transparent 45%,rgba(0,43,59,.2));pointer-events:none}
        .heroTopRow{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:center}
        .livePill,.clubPill{display:inline-flex;align-items:center;gap:7px;padding:8px 11px;border-radius:14px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.13);font-size:11px;font-weight:800;backdrop-filter:blur(6px)}
        .statusDot{width:8px;height:8px;border-radius:50%;background:#43f5b4;box-shadow:0 0 0 3px rgba(67,245,180,.1)}
        .statusDot.locked{background:#fbbf24}.clubPill{background:rgba(3,38,46,.3)}
        .heroContent{position:relative;z-index:2;margin-top:30px}.heroContent h1{margin:0;font-size:31px;line-height:1.02;letter-spacing:-.045em}.heroSubtitle{margin:4px 0 16px;font-size:18px;font-weight:600;color:#ecfff7}.heroMeta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#f0fff9;font-size:11px;font-weight:700}.heroMeta span{display:inline-flex;align-items:center;gap:5px}.progressLabel{display:flex;justify-content:space-between;gap:12px;margin-top:29px;font-size:10px;color:#effff9}.progressTrack{height:10px;background:rgba(0,32,34,.45);border-radius:999px;overflow:hidden;margin-top:7px}.progressTrack div{height:100%;border-radius:999px;background:#17df99;box-shadow:0 0 8px rgba(23,223,153,.25)}.progressFoot{margin-top:9px;font-size:10px;color:#9ff5d2}.progressFoot span{margin:0 7px}.heroDecor{position:absolute;z-index:1;pointer-events:none}.heroDecor.racket{right:92px;top:72px;font-size:68px;opacity:.72;transform:rotate(-24deg);filter:drop-shadow(0 8px 8px rgba(0,0,0,.1))}.heroDecor.trophy{right:-15px;bottom:-25px;color:#d7fff0;opacity:.16;transform:rotate(-5deg)}
        .tournamentNavRef{display:grid;grid-template-columns:1.15fr 1fr 1fr 1fr .95fr;gap:0;align-items:stretch;margin:10px 0 14px;padding:5px;border:1px solid #dce7e2;border-radius:25px;background:#edf2f0;box-shadow:0 3px 10px rgba(13,50,37,.05)}
        .tNavItem{min-width:0;display:flex;align-items:center;justify-content:center;gap:6px;border:0;border-right:1px solid #d2ddd8;background:transparent;color:#687b73;text-decoration:none;font-size:10px;font-weight:800;padding:11px 5px;cursor:pointer}.tNavItem:last-child{border-right:0}.tNavItem.active{background:#119963;color:#fff;border-radius:18px;box-shadow:0 3px 8px rgba(8,139,92,.18)}.tNavItem em{font-style:normal;background:#dfe5e2;color:#687b73;border-radius:99px;padding:2px 6px;font-size:8px}.tNavItem.active em{background:rgba(255,255,255,.18);color:#fff}.tNavItem.disabled{opacity:.45;pointer-events:none}
        .overviewRef{display:grid;gap:13px}.overviewGridRef{display:grid;grid-template-columns:1fr 1fr;gap:10px}.overviewCardRef{position:relative;overflow:hidden;min-height:120px;padding:15px 14px;border:1px solid;border-radius:20px;text-decoration:none;display:block}.overviewCardRef:after{content:"";position:absolute;width:100px;height:100px;border-radius:50%;right:-28px;bottom:-30px;background:currentColor;opacity:.06}.overviewNavCard{cursor:pointer}.overviewNavArrow{position:absolute;right:13px;top:13px;width:18px;height:18px;opacity:.7}.overviewIconRef{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:rgba(255,255,255,.58)}.overviewValueRef{position:relative;z-index:1;margin-top:8px;font-size:23px;font-weight:900;letter-spacing:-.03em}.overviewLabelRef{position:relative;z-index:1;margin-top:3px;font-size:11px;color:#63756e;font-weight:650}.tone-blue{background:linear-gradient(135deg,#f2f7ff,#eaf3ff);border-color:#cbdff7;color:#2379e8}.tone-green{background:linear-gradient(135deg,#effcf6,#e5f8ef);border-color:#c7ead9;color:#119963}.tone-purple{background:linear-gradient(135deg,#faf4ff,#f6edff);border-color:#e2d2f4;color:#712bd3}.tone-orange{background:linear-gradient(135deg,#fff9ef,#fff2df);border-color:#f2dbb5;color:#d8750a}
        .configRef{padding:16px;border:1px solid #dfe9e4;border-radius:22px;background:#fff;box-shadow:0 5px 16px rgba(10,50,35,.035)}.sectionEyebrow{font-size:9px;letter-spacing:.22em;color:#0b9a63;font-weight:900}.configTitleRow{display:flex;align-items:center;justify-content:space-between;gap:12px}.configTitleRow h2{margin:5px 0 12px;font-size:21px;letter-spacing:-.03em}.editButton{border:0;background:#e8faf2;color:#128b5b;border-radius:12px;padding:9px 12px;display:inline-flex;align-items:center;gap:6px;font-weight:900;font-size:11px}.configRows{display:grid;gap:8px}.configRowRef{width:100%;min-width:0;border:1px solid #e1e9e5;background:linear-gradient(135deg,#f9fbfa,#f3f7f5);border-radius:17px;padding:13px 11px;display:grid;grid-template-columns:38px minmax(0,1fr) 20px;align-items:center;gap:10px;text-align:left;color:#31483f}.configRowRef:disabled{cursor:default}.configIcon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;color:#29483d}.configText{min-width:0}.configText.full{grid-column:2 / 4}.configText small{display:block;color:#788982;font-size:8px;font-weight:900;letter-spacing:.14em;margin-bottom:3px}.configText strong{display:block;color:#2185df;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.configText span{display:block;margin-top:3px;color:#788982;font-size:9px;line-height:1.35}.gameRow{align-items:start}.gameSegmentRef{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:3px;background:#e6ebe9;border-radius:12px;margin-top:7px}.gameSegmentRef button{border:0;background:transparent;border-radius:10px;padding:8px 4px;color:#65766f;font-size:9px;font-weight:900}.gameSegmentRef button.selected{background:#079b68;color:#fff;box-shadow:0 2px 6px rgba(0,139,92,.18)}.counterGridRef{display:grid;grid-template-columns:1fr 1fr;gap:8px}.lockedRefCard{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px;padding:12px;border:1px solid #efd1d1;background:#fff7f7;border-radius:16px}.lockedRefCard strong{display:block;color:#a43f3f;font-size:12px}.lockedRefCard span{display:block;color:#7c7777;font-size:9px;line-height:1.35;margin-top:4px}.lockedRefCard button{border:1px solid #e5c7c7;background:#fff;color:#a43f3f;border-radius:12px;padding:9px 10px;display:flex;align-items:center;gap:5px;font-size:9px;font-weight:900;white-space:nowrap}.saveRef{width:100%;min-height:47px;border-radius:17px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;font-weight:900;text-decoration:none;border:0;background:#078b5c;color:#fff;box-shadow:0 8px 20px rgba(8,139,92,.2)}
        .contentRef{display:grid;gap:11px}.contentHeading{padding:4px 4px 2px}.contentHeading h2{margin:4px 0;font-size:21px}.contentHeading p{margin:0;color:#72867e;font-size:11px}.matchGridRef{display:grid;gap:10px}.matchCardRef{padding:12px;border:1px solid #dfe9e4;border-radius:17px;background:#fff}.matchTopRef{display:flex;justify-content:space-between;color:#71837c;font-size:9px;font-weight:800}.matchTeamRef{display:flex;justify-content:space-between;align-items:center;padding:9px 7px;border-bottom:1px solid #edf2ef;font-size:12px}.matchTeamRef:nth-child(odd){background:#f6faf8}.matchTeamRef:last-of-type{border-bottom:0}.matchTeamRef strong{font-size:20px}.matchStatusRef{margin-top:7px;color:#72867e;font-size:9px;font-weight:800}
        .standingRefTable{overflow:hidden;border:1px solid #dfe9e4;border-radius:17px;background:#fff}.standingRefHead,.standingRefRow{display:grid;grid-template-columns:24px minmax(0,1fr) 22px 22px 22px 28px;gap:5px;align-items:center}.standingRefHead{padding:10px;background:#f0f5f2;color:#73857e;font-size:8px;font-weight:900}.standingRefRow{padding:11px 9px;border-top:1px solid #e8efec;font-size:9px}.standingRefRow.leader{background:#f4fbf7}.standingTeamRef{display:flex;align-items:center;gap:7px;min-width:0}.standingTeamRef>span{width:29px;height:29px;border-radius:50%;display:grid;place-items:center;background:#ffe4a4;color:#197050;font-weight:900;font-size:8px}.standingTeamRef strong,.standingTeamRef small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.standingTeamRef strong{font-size:10px}.standingTeamRef small{color:#84958e;font-size:7px;margin-top:2px}.standingRefRow>b:last-child{color:#087f56;font-size:11px}
        .searchRef{display:flex;align-items:center;gap:8px;padding:11px 12px;border:1px solid #dfe9e4;background:#fff;border-radius:15px}.searchRef svg{color:#8a9a94}.searchRef input{border:0;outline:0;width:100%;font:inherit;font-size:11px;color:#17352a;background:transparent}.sheetOverlayRef{position:fixed;inset:0;z-index:80;background:rgba(15,23,42,.46);backdrop-filter:blur(3px);display:flex;align-items:flex-end;justify-content:center}.sheetRef{width:min(440px,100%);background:#fff;border-radius:26px 26px 0 0;padding:20px;box-shadow:0 -14px 40px rgba(0,0,0,.16)}.sheetHandleRef{width:48px;height:5px;background:#d7dfdb;border-radius:99px;margin:-3px auto 17px}.sheetTitleRef{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.sheetTitleRef h3{margin:0;font-size:17px}.sheetTitleRef button{border:0;background:#eef3f1;width:32px;height:32px;border-radius:99px;font-size:18px;color:#587069}.sheetOptionRef{width:100%;border:1px solid #dfe9e4;background:#f8faf9;border-radius:14px;padding:13px;margin-top:7px;text-align:left;font-size:11px;font-weight:850;color:#17352a}.sheetOptionRef span{float:right;color:#0b9a63}.lockTitleRef{display:flex;gap:11px;align-items:center;margin-bottom:14px}.lockTitleRef h3{margin:0;font-size:17px}.lockTitleRef p{margin:4px 0 0;font-size:10px;color:#72867e;line-height:1.4}.lockIconRef{width:43px;height:43px;border-radius:14px;background:#eaf8f1;color:#0b9a63;display:grid;place-items:center}.pinLabelRef{display:block;font-size:9px;font-weight:900;color:#61736b;letter-spacing:.08em;margin-bottom:6px}.pinLabelRef.second{margin-top:12px}.lockActionsRef{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.cancelRef,.confirmRef{border:0;border-radius:13px;padding:12px;font-size:11px;font-weight:900}.cancelRef{background:#edf7f2;color:#147a54}.confirmRef{background:#078b5c;color:#fff}
        @media(min-width:801px){.tournamentMobileHeader{display:none}.overviewGridRef{grid-template-columns:repeat(4,1fr)}.matchGridRef{grid-template-columns:1fr 1fr}.tournamentNavRef{max-width:720px;margin-left:auto;margin-right:auto}}
        @media(max-width:370px){.tournamentNavRef{grid-template-columns:repeat(5,1fr)}.tNavItem{font-size:8px;padding-left:2px;padding-right:2px}.tNavItem svg{display:none}.heroContent h1{font-size:28px}.heroSubtitle{font-size:16px}.heroDecor.racket{right:70px}.configText strong{font-size:11px}}
      `}</style>
    </main>
  );
}

function OverviewCard({ icon, value, label, tone }: { icon: React.ReactNode; value: string; label: string; tone: string }) {
  return <div className={`overviewCardRef tone-${tone}`}><div className="overviewIconRef">{icon}</div><div className="overviewValueRef">{value}</div><div className="overviewLabelRef">{label}</div></div>;
}

function Counter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const current = Math.max(1, Number(value) || 1);
  return <div style={{ padding: 11, background: "#f7faf8", border: "1px solid #e0e9e5", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}><div><small style={{ display: "block", color: "#81918b", fontSize: 8, fontWeight: 900 }}>{label}</small><b style={{ fontSize: 12 }}>{current}</b></div><div style={{ display: "flex", gap: 4 }}><button type="button" onClick={() => onChange(String(Math.max(1, current - 1)))} style={{ width: 27, height: 27, border: 0, borderRadius: 8, background: "#e3e9e6", fontWeight: 900 }}>−</button><button type="button" onClick={() => onChange(String(current + 1))} style={{ width: 27, height: 27, border: 0, borderRadius: 8, background: "#e3e9e6", fontWeight: 900 }}>+</button></div></div>;
}

function MatchTile({ match }: { match: Match }) {
  const status = statusLabel(match.status);
  return <article className="matchCardRef"><div className="matchTopRef"><span>Match {match.match_number}</span><span>{match.court ? `Court ${match.court}` : timeLabel(match.scheduled_at)}</span></div><div className="matchTeamRef"><span>{match.team_a?.name || "Team A"}</span><strong>{match.team_a_score ?? "–"}</strong></div><div className="matchTeamRef"><span>{match.team_b?.name || "Team B"}</span><strong>{match.team_b_score ?? "–"}</strong></div><div className="matchStatusRef">{status === "COMPLETED" ? "✓ Completed" : status === "LIVE" ? "• Live" : "○ Scheduled"}</div></article>;
}
