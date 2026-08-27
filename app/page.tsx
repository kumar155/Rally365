"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, ChevronRight, CircleUserRound, Clock3, History, LockOpen, Pencil, LockKeyhole, MapPin, Plus, ReceiptText, Trophy, Users, X, Trash2
} from "lucide-react";
import { supabase } from "../lib/supabase";

type Player = { id: string; name: string };
type Match = { id: string; group_id: string; team_a_score: number; team_b_score: number; played_at: string; status: string; edit_count: number; last_edited_at: string | null; match_players: { player_id: string; team: "A" | "B" }[] };
type Expense = { id: string; expense_date: string; category: string; amount: number; description: string | null };
type Attendance = { id: string; player_id: string; attendance_date: string; status: string; late_minutes: number; fine_amount: number };

const CODE = "RALLY365";
const money = (n: number) => `₹${Number(n || 0).toFixed(0)}`;

export default function Home() {
  const [tab, setTab] = useState<"today" | "stats" | "money" | "players">("today");
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [scoreA, setScoreA] = useState(""); const [scoreB, setScoreB] = useState("");
  const [modal, setModal] = useState<null | "match" | "edit" | "remove" | "pin" | "fine" | "expense">(null);
  const [targetMatch, setTargetMatch] = useState<Match | null>(null);
  const [pin, setPin] = useState(""); const verifiedAdminPinRef = useRef(""); const [pinAction, setPinAction] = useState<"edit" | "money">("money"); const [moneyAction, setMoneyAction] = useState<"fine" | "expense">("fine");
  const [adminOK, setAdminOK] = useState(false); const [fineDetailsPlayer, setFineDetailsPlayer] = useState<string | null>(null); const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7)); const [statsRange, setStatsRange] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("DAILY");
  const [statsDate, setStatsDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [finePlayer, setFinePlayer] = useState(""); const [fineType, setFineType] = useState<"late" | "missed">("late"); const [minutes, setMinutes] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("SHUTTLES"); const [expenseAmount, setExpenseAmount] = useState(""); const [expenseDesc, setExpenseDesc] = useState(""); const [split, setSplit] = useState<string[]>([]);
  const [lateRate, setLateRate] = useState("1"); const [missedRate, setMissedRate] = useState("10");

  const load = useCallback(async () => {
    setError("");
    const { data: g, error: ge } = await supabase.from("groups").select("id,name,join_code").eq("join_code", CODE).single();
    if (ge || !g) { setError(ge?.message || "Group not found"); setLoading(false); return }
    setGroupId(g.id);
    const [p, m, e, a, r] = await Promise.all([
      supabase.from("players").select("id,name").eq("group_id", g.id).order("name"),
      supabase.from("matches").select("id,group_id,team_a_score,team_b_score,played_at,status,edit_count,last_edited_at,match_players(player_id,team)").eq("group_id", g.id).order("played_at", { ascending: false }),
      supabase.from("expenses").select("id,expense_date,category,amount,description").eq("group_id", g.id).order("expense_date", { ascending: false }),
      supabase.from("attendance").select("id,player_id,attendance_date,status,late_minutes,fine_amount").eq("group_id", g.id).order("attendance_date", { ascending: false }),
      supabase.from("group_rates").select("late_per_minute,missed_day_fine").eq("group_id", g.id).single()
    ]);
    if (p.error) setError(p.error.message); else setPlayers(p.data || []);
    if (m.error) setError(m.error.message); else setMatches((m.data || []) as Match[]);
    if (e.error) setError(e.error.message); else setExpenses((e.data || []) as Expense[]);
    if (a.error) setError(a.error.message); else setAttendance((a.data || []) as Attendance[]);
    if (!r.error && r.data) { setLateRate(String(r.data.late_per_minute)); setMissedRate(String(r.data.missed_day_fine)) }
    setLoading(false);
  }, []);

  useEffect(() => { load() }, [load]);
  useEffect(() => {
    if (!groupId) return;
    const ch = supabase.channel("rally365-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `group_id=eq.${groupId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance", filter: `group_id=eq.${groupId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `group_id=eq.${groupId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch) }
  }, [groupId, load]);

  const name = (id: string) => players.find(p => p.id === id)?.name || "?";
  const team = (m: Match, t: "A" | "B") => m.match_players.filter(x => x.team === t).map(x => name(x.player_id)).join(" & ");

  const validMatches = useMemo(
    () => matches.filter(m => m.status !== "VOIDED"),
    [matches]
  );

  const localDateKey = (date = new Date()) => {
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  };

  const todayKey = localDateKey();

  const todayMatches = useMemo(
    () => matches.filter(m => localDateKey(new Date(m.played_at)) === todayKey),
    [matches, todayKey]
  );

  const todayValidMatches = useMemo(
    () => todayMatches.filter(m => m.status !== "VOIDED"),
    [todayMatches]
  );

  const filteredMatches = useMemo(() => {
    const anchor = new Date(`${statsDate}T00:00:00`);
    const start = new Date(anchor);
    const end = new Date(anchor);

    if (statsRange === "DAILY") {
      end.setDate(end.getDate() + 1);
    } else if (statsRange === "WEEKLY") {
      const day = start.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      start.setDate(start.getDate() + mondayOffset);
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 7);
    } else {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(start.getMonth() + 1, 1);
      end.setHours(0, 0, 0, 0);
    }

    return validMatches.filter(m => {
      const played = new Date(m.played_at);
      return played >= start && played < end;
    });
  }, [validMatches, statsRange, statsDate]);

  const selectorLabel = useMemo(() => {
    const anchor = new Date(`${statsDate}T00:00:00`);

    if (statsRange === "DAILY") {
      return anchor.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    }

    if (statsRange === "WEEKLY") {
      const start = new Date(anchor);
      const day = start.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      start.setDate(start.getDate() + mondayOffset);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);

      return `${start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
    }

    return anchor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }, [statsRange, statsDate]);

  const moveStatsPeriod = (direction: number) => {
    const d = new Date(`${statsDate}T00:00:00`);
    if (statsRange === "DAILY") d.setDate(d.getDate() + direction);
    else if (statsRange === "WEEKLY") d.setDate(d.getDate() + direction * 7);
    else d.setMonth(d.getMonth() + direction);
    setStatsDate(d.toISOString().slice(0, 10));
  };

  const stats = useMemo(() => players.map(p => {
    const ms = filteredMatches.filter(m => m.status !== "VOIDED" && m.match_players.some(x => x.player_id === p.id));
    let w = 0, pf = 0, pa = 0; ms.forEach(m => { const t = m.match_players.find(x => x.player_id === p.id)?.team; const own = t === "A" ? m.team_a_score : m.team_b_score; const opp = t === "A" ? m.team_b_score : m.team_a_score; pf += own; pa += opp; if (own > opp) w++ });
    const fines = attendance.filter(a => a.player_id === p.id).reduce((s, a) => s + Number(a.fine_amount), 0);
    return { ...p, played: ms.length, w, l: ms.length - w, winRate: ms.length ? Math.round(w / ms.length * 100) : 0, diff: pf - pa, fines, owedExpenses: 0 };
  }).sort((a, b) => b.w - a.w || b.winRate - a.winRate), [players, filteredMatches, attendance]);

  const finePlayerStats = useMemo(() => players.map(p => {
    const rows = attendance.filter(a => a.player_id === p.id);
    const total = rows.reduce((sum, a) => sum + Number(a.fine_amount || 0), 0);
    const late = rows
      .filter(a => a.status !== "MISSED")
      .reduce((sum, a) => sum + Number(a.fine_amount || 0), 0);
    const missed = rows
      .filter(a => a.status === "MISSED")
      .reduce((sum, a) => sum + Number(a.fine_amount || 0), 0);
    const latest = rows[0]?.attendance_date || null;
    return { ...p, entries: rows.length, total, late, missed, latest };
  }).sort((a, b) => b.total - a.total || b.entries - a.entries), [players, attendance]);

  const monthlyExpenses = useMemo(
    () => expenses.filter(e => e.expense_date.slice(0, 7) === reportMonth),
    [expenses, reportMonth]
  );

  const monthlyAttendance = useMemo(() => attendance.filter(a => a.attendance_date.slice(0, 7) === reportMonth), [attendance, reportMonth]);
  const monthlyFineStats = useMemo(() => players.map(p => {
    const rows = monthlyAttendance.filter(a => a.player_id === p.id);
    const late = rows.filter(a => a.status === "PRESENT").reduce((s, a) => s + Number(a.fine_amount), 0);
    const missed = rows.filter(a => a.status === "MISSED").reduce((s, a) => s + Number(a.fine_amount), 0);
    return { ...p, late, missed, total: late + missed, lateCount: rows.filter(a => a.status === "PRESENT").length, missedCount: rows.filter(a => a.status === "MISSED").length };
  }).sort((a, b) => b.total - a.total), [players, monthlyAttendance]);
  const monthTotal = monthlyFineStats.reduce((s, p) => s + p.total, 0);
  const monthLate = monthlyFineStats.reduce((s, p) => s + p.late, 0);
  const monthMissed = monthlyFineStats.reduce((s, p) => s + p.missed, 0);
  const monthLateCount = monthlyFineStats.reduce((s, p) => s + p.lateCount, 0);
  const monthMissedCount = monthlyFineStats.reduce((s, p) => s + p.missedCount, 0);

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalFines = attendance.reduce((s, a) => s + Number(a.fine_amount), 0);

  const saveMatch = async () => {
    if (!groupId || selected.length !== 4) return;
    const a = Number(scoreA), b = Number(scoreB); if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || a < 0 || b < 0) { setError("Enter two different final scores"); return }
    const { data: m, error: me } = await supabase.from("matches").insert({ group_id: groupId, team_a_score: a, team_b_score: b }).select("id").single();
    if (me || !m) { setError(me?.message || "Could not save"); return }
    const rows = selected.slice(0, 2).map(player_id => ({ match_id: m.id, player_id, team: "A" })).concat(selected.slice(2, 4).map(player_id => ({ match_id: m.id, player_id, team: "B" })));
    const { error: pe } = await supabase.from("match_players").insert(rows); if (pe) { setError(pe.message); return }
    setSelected([]); setScoreA(""); setScoreB(""); setModal(null); load();
  };
  const verify = async () => {
    if (!groupId || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      setError("Admin PIN must be exactly 6 digits");
      return;
    }

    const enteredPin = pin;
    const { data: pinValid, error: pinError } = await supabase.rpc("verify_admin_pin", {
      p_group_id: groupId,
      p_pin: enteredPin,
    });

    if (pinError) {
      setError(pinError.message);
      return;
    }

    if (!pinValid) {
      setError("Invalid admin PIN");
      return;
    }

    verifiedAdminPinRef.current = enteredPin;
    setAdminOK(true);
    setPin("");
    setError("");
    setModal(pinAction === "edit" && targetMatch ? "edit" : moneyAction);
  };


  const addFine = async () => {
    const sessionPin = verifiedAdminPinRef.current;
    const mins = fineType === "late" ? Number(minutes) : 0;

    if (!groupId || !adminOK || !finePlayer || !/^\d{6}$/.test(sessionPin)) {
      setError("Admin PIN verification required.");
      return;
    }

    if (!Number.isInteger(mins) || mins < 0 || mins > 1440 || (fineType === "late" && mins === 0)) {
      setError("Enter valid minutes late");
      return;
    }

    const { error } = await supabase.rpc("add_attendance_fine_with_pin", {
      p_group_id: groupId,
      p_player_id: finePlayer,
      p_pin: sessionPin,
      p_attendance_date: new Date().toISOString().slice(0, 10),
      p_status: fineType === "late" ? "PRESENT" : "MISSED",
      p_late_minutes: mins,
    });

    if (error) {
      setError(error.message);
      return;
    }

    verifiedAdminPinRef.current = "";
    setAdminOK(false);
    setModal(null);
    setMinutes("");
    await load();
  };

  const addExpense = async () => {
    const sessionPin = verifiedAdminPinRef.current;
    const amount = Number(expenseAmount);

    if (!groupId || !adminOK || !split.length || !/^\d{6}$/.test(sessionPin)) {
      setError("Admin PIN verification required.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      setError("Enter a valid expense amount");
      return;
    }

    if (expenseDesc.trim().length > 500) {
      setError("Description must be 500 characters or fewer");
      return;
    }

    const { error } = await supabase.rpc("add_expense_with_pin", {
      p_group_id: groupId,
      p_pin: sessionPin,
      p_expense_date: new Date().toISOString().slice(0, 10),
      p_category: expenseCategory,
      p_amount: amount,
      p_description: expenseDesc.trim() || null,
      p_player_ids: split,
    });

    if (error) {
      setError(error.message);
      return;
    }

    verifiedAdminPinRef.current = "";
    setAdminOK(false);
    setModal(null);
    setExpenseAmount("");
    setExpenseDesc("");
    await load();
  };
  const saveEditedMatch = async () => {
    const sessionPin = verifiedAdminPinRef.current;

    if (!groupId || !targetMatch || !adminOK || !/^\d{6}$/.test(sessionPin)) {
      setError("Admin PIN verification required.");
      return;
    }

    const na = Number(scoreA);
    const nb = Number(scoreB);

    if (!Number.isInteger(na) || !Number.isInteger(nb) || na < 0 || nb < 0 || na === nb) {
      setError("Enter two different final scores");
      return;
    }

    const { error } = await supabase.rpc("edit_match_with_pin", {
      p_group_id: groupId,
      p_match_id: targetMatch.id,
      p_pin: sessionPin,
      p_team_a_score: na,
      p_team_b_score: nb,
    });

    if (error) {
      setError(error.message);
      return;
    }

    verifiedAdminPinRef.current = "";
    setPin("");
    setTargetMatch(null);
    setScoreA("");
    setScoreB("");
    setPinAction("money");
    setAdminOK(false);
    setModal(null);
    setError("");
    await load();
  };
  const removeMatch = async () => {
    const sessionPin = verifiedAdminPinRef.current;

    if (!groupId || !targetMatch || !adminOK || !/^\d{6}$/.test(sessionPin)) {
      setError("Admin PIN verification required.");
      return;
    }

    const { error } = await supabase.rpc("void_match_with_pin", {
      p_group_id: groupId,
      p_match_id: targetMatch.id,
      p_pin: sessionPin,
    });

    if (error) {
      setError(error.message);
      return;
    }

    verifiedAdminPinRef.current = "";
    setPin("");
    setTargetMatch(null);
    setScoreA("");
    setScoreB("");
    setPinAction("money");
    setAdminOK(false);
    setModal(null);
    setError("");
    await load();
  };

  const openAdmin = (action: "edit" | "money") => {
    verifiedAdminPinRef.current = "";
    setAdminOK(false);
    setPinAction(action);
    setPin("");
    setModal("pin");
  };
  const openEdit = (match: Match) => {
    setError("");
    verifiedAdminPinRef.current = "";
    setTargetMatch(match);
    setScoreA(String(match.team_a_score));
    setScoreB(String(match.team_b_score));
    setPinAction("edit");
    setPin("");
    setAdminOK(false);
    setModal("pin");
  };

  if (loading) return <main className="center">Loading Rally365…</main>;

  return <main className="app-shell">
    <header className="topbar"><div><div className="brand">Rally<span>365</span></div><div className="subtitle">Everyday badminton</div></div><div className="group-pill"><MapPin size={15} /> Vega Badminton</div></header>
    <section className="content">
      {error && <div className="error-banner">{error}<button onClick={() => setError("")}>×</button></div>}

      {tab === "today" && <>
        <div className="hero-card">
          <div>
            <div className="eyebrow">TODAY · {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
            <h1>Today's games</h1>
            <p>{new Set(todayValidMatches.flatMap(m => m.match_players.map(x => x.player_id))).size} players · {todayValidMatches.length} valid matches</p>
          </div>
          <Trophy size={42} />
        </div>

        <button className="primary-button" onClick={() => setModal("match")}><Plus size={21} /> New match</button>

        <div className="section-title"><span>Today's match history</span><span>{todayMatches.length}</span></div>

        {todayMatches.length === 0 ? (
          <div className="empty-rally-card">
            <div className="rally-illustration rally-illustration-image" aria-hidden="true">
              <img src="/badminton-court-clean.png" alt="" />
            </div>
            <div className="empty-rally-title">No games today!</div>
            <div className="empty-rally-text">Hit the court and add a new match.</div>
            <div className="empty-rally-date">📅 {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
          </div>
        ) : (
          <div className="match-list">
            {todayMatches.map((m) => {
              const aWon = m.team_a_score > m.team_b_score;
              return <div className={`match-card ${m.status === "VOIDED" ? "voided" : ""}`} key={m.id}>
                <div className="match-number">M{matches.length - matches.findIndex(x => x.id === m.id)}</div>
                <div className="teams">
                  <div><strong>{team(m, "A")}</strong><span className={aWon ? "score-more" : "score-less"}>{m.team_a_score}</span></div>
                  <div><strong>{team(m, "B")}</strong><span className={!aWon ? "score-more" : "score-less"}>{m.team_b_score}</span></div>
                  {m.status === "VOIDED" ? <small>VOIDED</small> : m.edit_count > 0 ? <small>Edited · {m.edit_count}x</small> : null}
                </div>
                {m.status !== "VOIDED" && <button
                  className="edit-link"
                  title="Edit match"
                  aria-label="Edit match"
                  onClick={() => openEdit(m)}
                >
                  <Pencil size={16} />
                </button>}
              </div>
            })}
          </div>
        )}
      </>}

      {tab === "stats" && <>
        <div className="page-heading"><div className="eyebrow">PERFORMANCE</div><h1>Leaderboard</h1><p>Performance for the selected period.</p></div>

        <div className="range-toggle three">
          <button className={statsRange === "DAILY" ? "active" : ""} onClick={() => setStatsRange("DAILY")}>Daily</button>
          <button className={statsRange === "WEEKLY" ? "active" : ""} onClick={() => setStatsRange("WEEKLY")}>Weekly</button>
          <button className={statsRange === "MONTHLY" ? "active" : ""} onClick={() => setStatsRange("MONTHLY")}>Monthly</button>
        </div>

        <div className="period-selector">
          <button className="period-arrow" onClick={() => moveStatsPeriod(-1)} aria-label="Previous period">‹</button>

          {statsRange === "DAILY" ? (
            <label className="date-picker-control">
              <span>DATE</span>
              <input
                type="date"
                value={statsDate}
                onChange={e => setStatsDate(e.target.value)}
              />
            </label>
          ) : (
            <div className="period-label">
              <span>{statsRange === "WEEKLY" ? "WEEK" : "MONTH"}</span>
              <b>{selectorLabel}</b>
            </div>
          )}

          <button className="period-arrow" onClick={() => moveStatsPeriod(1)} aria-label="Next period">›</button>
        </div>

        <div className="stats-table">
          <div className="table-head"><span>#</span><span>PLAYER</span><span>P</span><span>W</span><span>L</span><span>WIN%</span></div>
          {stats.map((s, i) => <div className="table-row" key={s.id}>
            <span className="rank">{i + 1}</span>
            <span className="player-name"><b>{s.name}</b></span>
            <span>{s.played}</span><span>{s.w}</span><span>{s.l}</span><span>{s.winRate}%</span>
          </div>)}
        </div>

        {statsRange === "DAILY" && <>
          <div className="section-title"><span>Match history</span><span>{filteredMatches.length}</span></div>
          <div className="match-list">
            {filteredMatches.length === 0 && <div className="empty-card">No matches today.</div>}
            {filteredMatches.map((m, i) => {
              const matchNumber = matches.length - matches.findIndex(x => x.id === m.id);
              const aWon = m.team_a_score > m.team_b_score;
              return <div className="match-card" key={m.id}>
                <div className="match-number">M{matchNumber}</div>
                <div className="teams">
                  <div>
                    <strong className={aWon ? "winning-team" : "losing-team"}>{team(m, "A")}</strong>
                    <span className={aWon ? "score-more" : "score-less"}>{m.team_a_score}</span>
                  </div>
                  <div>
                    <strong className={!aWon ? "winning-team" : "losing-team"}>{team(m, "B")}</strong>
                    <span className={!aWon ? "score-more" : "score-less"}>{m.team_b_score}</span>
                  </div>
                  {m.edit_count > 0 && <small>Edited · {m.edit_count}x</small>}
                </div>
              </div>
            })}
          </div>
        </>}
      </>}

      {tab === "money" && <>
        <div className="page-heading">
          <div className="eyebrow">GROUP LEDGER</div>
          <h1>Money</h1>
          <p>Fines and shared group expenses.</p>
        </div>

        <div className="money-grid">
          <div><b>{money(totalFines)}</b><small>Fines</small></div>
          <div><b>{money(totalExpenses)}</b><small>Expenses</small></div>
        </div>

        <div className="section-title"><span>Admin actions</span><LockKeyhole size={14} /></div>
        <div className="admin-actions">
          <button onClick={() => { setMoneyAction("fine"); openAdmin("money") }}><Clock3 /> Add fine</button>
          <button onClick={() => { setMoneyAction("expense"); openAdmin("money") }}><ReceiptText /> Add expense</button>
        </div>

        <div className="section-title"><span>Monthly fine report</span><span>Fines only</span></div>
        <div className="month-picker">
          <button onClick={() => {
            const d = new Date(`${reportMonth}-01T12:00:00`);
            d.setMonth(d.getMonth() - 1);
            setReportMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
          }}>‹</button>
          <b>{new Date(`${reportMonth}-01T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</b>
          <button onClick={() => {
            const d = new Date(`${reportMonth}-01T12:00:00`);
            d.setMonth(d.getMonth() + 1);
            setReportMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
          }}>›</button>
        </div>

        <div className="money-grid four">
          <div><b>{money(monthTotal)}</b><small>Total fines</small></div>
          <div><b>{money(monthLate)}</b><small>Late fines</small></div>
          <div><b>{money(monthMissed)}</b><small>Missed fines</small></div>
          <div><b>{monthLateCount + monthMissedCount}</b><small>Entries</small></div>
        </div>

        <div className="stats-table monthly-fines">
          <div className="table-head"><span>#</span><span>PLAYER</span><span>LATE</span><span>MISSED</span><span>TOTAL</span><span></span></div>
          {monthlyFineStats.map((s, i) => <button className="monthly-row" key={s.id} onClick={() => setFineDetailsPlayer(s.id)}>
            <span className="rank">{i + 1}</span>
            <span className="player-name"><b>{s.name}</b><small>{s.lateCount} late · {s.missedCount} missed</small></span>
            <span>{money(s.late)}</span>
            <span>{money(s.missed)}</span>
            <strong>{money(s.total)}</strong>
            <ChevronRight size={16} />
          </button>)}
        </div>

        <div className="section-title"><span>Expenses for selected month</span><span>{monthlyExpenses.length}</span></div>
        <div className="match-list">
          {monthlyExpenses.length === 0 && <div className="empty-card">No expenses recorded for this month.</div>}
          {monthlyExpenses.map(e => <div className="match-card" key={e.id}>
            <div className="expense-icon">₹</div>
            <div className="teams">
              <div><strong>{e.category}</strong><span>{money(Number(e.amount))}</span></div>
              <small>{e.description || e.expense_date}</small>
            </div>
          </div>)}
        </div>

        <div className="section-title"><span>Fines by player</span><span>Tap for history</span></div>
        <div className="stats-table">
          {finePlayerStats.map((s, i) => <button className="fine-player-row" key={s.id} onClick={() => setFineDetailsPlayer(s.id)}>
            <span className="rank">{i + 1}</span>
            <span className="player-name">
              <b>{s.name}</b>
              <small>
                {s.entries} {s.entries === 1 ? "entry" : "entries"}
                {s.latest ? ` · Last ${new Date(`${s.latest}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : " · No fines"}
              </small>
            </span>
            <span className="fine-breakdown"><small>Late {money(s.late)} · Missed {money(s.missed)}</small><strong>{money(s.total)}</strong></span>
            <ChevronRight size={17} />
          </button>)}
        </div>
      </>}

      {tab === "players" && <><div className="page-heading"><div className="eyebrow">ROSTER</div><h1>Players</h1><p>Names are fixed to protect historical statistics.</p></div><div className="player-grid">{players.map(p => { const s = stats.find(x => x.id === p.id)!; return <div className="player-card" key={p.id}><div className="avatar">{p.name.slice(0, 1)}</div><div><b>{p.name}</b><small>{s.w}W · {s.l}L · {s.winRate}%</small></div><CircleUserRound size={19} className="muted" /></div> })}</div></>}
    </section>
    <nav className="bottom-nav"><button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}><History /><span>Today</span></button><button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")}><BarChart3 /><span>Stats</span></button><button className={tab === "money" ? "active" : ""} onClick={() => setTab("money")}><ReceiptText /><span>Money</span></button><button className={tab === "players" ? "active" : ""} onClick={() => setTab("players")}><Users /><span>Players</span></button></nav>

    {modal === "match" && <Modal title="New match" close={() => setModal(null)}><p className="helper">First two selected = Team A. Next two = Team B.</p><div className="selection-grid">{players.map(p => <button key={p.id} className={`player-chip ${selected.includes(p.id) ? "selected" : ""}`} onClick={() => setSelected(x => x.includes(p.id) ? x.filter(y => y !== p.id) : x.length < 4 ? [...x, p.id] : x)}>{p.name}{selected.includes(p.id) && <small>{selected.indexOf(p.id) + 1}</small>}</button>)}</div><div className="match-preview"><b>{selected.slice(0, 2).map(name).join(" + ") || "—"}</b><span>vs</span><b>{selected.slice(2, 4).map(name).join(" + ") || "—"}</b></div><div className="score-inputs"><input inputMode="numeric" value={scoreA} placeholder="Team A" onChange={e => setScoreA(e.target.value)} /><span>:</span><input inputMode="numeric" value={scoreB} placeholder="Team B" onChange={e => setScoreB(e.target.value)} /></div><button className="primary-button" disabled={selected.length !== 4 || !scoreA || !scoreB} onClick={saveMatch}>Save match</button></Modal>}

    {modal === "pin" && <Modal title="Admin verification" close={() => setModal(null)}><div className="pin-box"><LockKeyhole size={28} /><p>Enter the 6-digit admin PIN.</p><input autoFocus maxLength={6} inputMode="numeric" pattern="[0-9]{6}" type="password" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" />
      <button className="primary-button" disabled={pin.length !== 6} onClick={verify}>Verify</button></div></Modal>}

    {modal === "edit" && targetMatch && <Modal title="Edit Match" close={() => {
      verifiedAdminPinRef.current = "";
      setPin("");
      setAdminOK(false);
      setTargetMatch(null);
      setModal(null);
    }}>
      <p className="helper">Admin verified. The match ID remains unchanged.</p>
      <div className="match-preview"><b>{team(targetMatch, "A")}</b><span>vs</span><b>{team(targetMatch, "B")}</b></div>
      <div className="score-inputs">
        <input value={scoreA} onChange={e => setScoreA(e.target.value)} />
        <span>:</span>
        <input value={scoreB} onChange={e => setScoreB(e.target.value)} />
      </div>

      <div className="edit-modal-actions">
        <button className="primary-button edit-save-button" onClick={saveEditedMatch}>
          Save corrected score
        </button>
        <button className="danger-button delete-match-button" onClick={removeMatch}>
          <Trash2 size={16} />
          Delete match
        </button>
      </div>
    </Modal>}
    

    {modal === "fine" && <Modal title="Add fine" close={() => { verifiedAdminPinRef.current = ""; setAdminOK(false); setModal(null) }}><select value={finePlayer} onChange={e => setFinePlayer(e.target.value)}><option value="">Select player</option>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select value={fineType} onChange={e => setFineType(e.target.value as "late" | "missed")}><option value="late">Late arrival · ₹{lateRate}/min</option><option value="missed">Missed day · ₹{missedRate}</option></select>{fineType === "late" && <input inputMode="numeric" placeholder="Minutes late" value={minutes} onChange={e => setMinutes(e.target.value)} />}<button className="primary-button" onClick={addFine}>Save fine</button></Modal>}

    {modal === "expense" && <Modal title="Add expense" close={() => { verifiedAdminPinRef.current = ""; setAdminOK(false); setModal(null) }}><select value={expenseCategory} onChange={e => setExpenseCategory(e.target.value)}><option value="SHUTTLES">🏸 Shuttles</option><option value="BREAKFAST">🍳 Breakfast</option><option value="COFFEE">☕ Coffee</option><option value="OTHER">Other</option></select><input inputMode="decimal" placeholder="Amount ₹" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} /><input maxLength={500} placeholder="Description (optional)" value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)} /><p className="helper">Split among</p><div className="selection-grid">{players.map(p => <button key={p.id} className={`player-chip ${split.includes(p.id) ? "selected" : ""}`} onClick={() => setSplit(x => x.includes(p.id) ? x.filter(y => y !== p.id) : [...x, p.id])}>{p.name}</button>)}</div>{split.length > 0 && <div className="split-preview">{money(Number(expenseAmount || 0) / split.length)} each · {split.length} people</div>}<button className="primary-button" onClick={addExpense}>Save expense</button></Modal>}


    {fineDetailsPlayer && <Modal title={`${name(fineDetailsPlayer)} · Fine history`} close={() => setFineDetailsPlayer(null)}>
      <div className="fine-history">
        {attendance.filter(a => a.player_id === fineDetailsPlayer).length === 0 && <div className="empty-card">No fines recorded.</div>}
        {attendance.filter(a => a.player_id === fineDetailsPlayer).map(a => <div className="fine-history-row" key={a.id}>
          <div><b>{a.status === "MISSED" ? "Missed day" : "Late arrival"}</b><small>{a.attendance_date}{a.status === "PRESENT" && a.late_minutes ? ` · ${a.late_minutes} min late` : ""}</small></div>
          <strong>{money(Number(a.fine_amount))}</strong>
        </div>)}
      </div>
    </Modal>}
  </main>
}

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" onClick={close}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><div><div className="eyebrow">RALLY365</div><h2>{title}</h2></div><button className="icon-button" onClick={close}><X /></button></div>{children}</div></div> }
