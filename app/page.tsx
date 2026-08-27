"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, ChevronRight, CircleUserRound, Clock3, History, LockKeyhole, MapPin, Plus, ReceiptText, Trophy, Users, Trash2
} from "lucide-react";
import { isValidPin, PIN_LENGTH } from "../lib/admin";
import {
  formatDayMonth, formatDayMonthYear, formatMonthYear, localDateKey, localMonthKey,
  parseDateKeyNoon, parseMonthKey, rangeBounds, rangeLabel, shiftDateKey, shiftMonthKey
} from "../lib/dates";
import { money, sumBy } from "../lib/format";
import { isVoided, matchNumber, teamNames, teamOf, winnerOf, winnerScores } from "../lib/matches";
import { groupSelect } from "../lib/queries";
import { toggleSelection } from "../lib/selection";
import { supabase } from "../lib/supabase";
import type { Attendance, Expense, Match, Player, StatsRange, Team } from "../lib/types";
import { MatchCard } from "./components/MatchCard";
import { Modal } from "./components/Modal";
import { PlayerChipGrid } from "./components/PlayerChipGrid";
import { WinnerSelect } from "./components/WinnerSelect";

const CODE = "RALLY365";
const LIVE_TABLES = ["matches", "attendance", "expenses"];

const STATS_RANGES: { value: StatsRange; label: string }[] = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
];

type Tab = "today" | "stats" | "money" | "players";

const TABS: { value: Tab; label: string; Icon: typeof History }[] = [
  { value: "today", label: "Today", Icon: History },
  { value: "stats", label: "Stats", Icon: BarChart3 },
  { value: "money", label: "Money", Icon: ReceiptText },
  { value: "players", label: "Players", Icon: Users },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("today");
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [winnerTeam, setWinnerTeam] = useState<Team | "">("");
  const [modal, setModal] = useState<null | "match" | "edit" | "remove" | "pin" | "fine" | "expense">(null);
  const [targetMatch, setTargetMatch] = useState<Match | null>(null);
  const [pin, setPin] = useState(""); const [verifiedEditPin, setVerifiedEditPin] = useState(""); const verifiedEditPinRef = useRef(""); const [pinAction, setPinAction] = useState<"edit" | "money">("money"); const [moneyAction, setMoneyAction] = useState<"fine" | "expense">("fine");
  const [adminOK, setAdminOK] = useState(false); const [fineDetailsPlayer, setFineDetailsPlayer] = useState<string | null>(null); const [reportMonth, setReportMonth] = useState(localMonthKey()); const [statsRange, setStatsRange] = useState<StatsRange>("DAILY");
  const [statsDate, setStatsDate] = useState(localDateKey);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [finePlayer, setFinePlayer] = useState(""); const [fineType, setFineType] = useState<"late" | "missed">("late"); const [minutes, setMinutes] = useState("");
  const [fineDate, setFineDate] = useState(localDateKey);
  const [expenseCategory, setExpenseCategory] = useState("SHUTTLES"); const [expenseAmount, setExpenseAmount] = useState(""); const [expenseDesc, setExpenseDesc] = useState(""); const [split, setSplit] = useState<string[]>([]);
  const [lateRate, setLateRate] = useState("1"); const [missedRate, setMissedRate] = useState("10");

  const applyRows = useCallback(<T,>(
    result: { data: unknown; error: { message: string } | null },
    apply: (rows: T[]) => void
  ) => {
    if (result.error) setError(result.error.message);
    else apply((result.data || []) as T[]);
  }, []);

  const load = useCallback(async () => {
    setError("");
    const { data: g, error: ge } = await supabase.from("groups").select("id,name,join_code").eq("join_code", CODE).single();
    if (ge || !g) { setError(ge?.message || "Group not found"); setLoading(false); return }
    setGroupId(g.id);
    const [p, m, e, a, r] = await Promise.all([
      groupSelect(g.id, "players", "id,name", "name", true),
      groupSelect(g.id, "matches", "id,group_id,team_a_score,team_b_score,played_at,status,edit_count,last_edited_at,match_players(player_id,team)", "played_at"),
      groupSelect(g.id, "expenses", "id,expense_date,category,amount,description", "expense_date"),
      groupSelect(g.id, "attendance", "id,player_id,attendance_date,status,late_minutes,fine_amount", "attendance_date"),
      supabase.from("group_rates").select("late_per_minute,missed_day_fine").eq("group_id", g.id).single()
    ]);
    applyRows<Player>(p, setPlayers);
    applyRows<Match>(m, setMatches);
    applyRows<Expense>(e, setExpenses);
    applyRows<Attendance>(a, setAttendance);
    if (!r.error && r.data) { setLateRate(String(r.data.late_per_minute)); setMissedRate(String(r.data.missed_day_fine)) }
    setLoading(false);
  }, [applyRows]);

  useEffect(() => { load() }, [load]);
  useEffect(() => {
    if (!groupId) return;
    const ch = LIVE_TABLES.reduce(
      (channel, table) => channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `group_id=eq.${groupId}` },
        load
      ),
      supabase.channel("rally365-live")
    ).subscribe();
    return () => { supabase.removeChannel(ch) }
  }, [groupId, load]);

  const name = (id: string) => players.find(p => p.id === id)?.name || "?";
  const team = (m: Match, t: Team) => teamNames(m, t, name);

  const validMatches = useMemo(() => matches.filter(m => !isVoided(m)), [matches]);

  const filteredMatches = useMemo(() => {
    const { start, end } = rangeBounds(statsDate, statsRange);
    return validMatches.filter(m => {
      const played = new Date(m.played_at);
      return played >= start && played < end;
    });
  }, [validMatches, statsRange, statsDate]);

  const selectorLabel = useMemo(() => rangeLabel(statsDate, statsRange), [statsRange, statsDate]);

  const moveStatsPeriod = (direction: number) => setStatsDate(shiftDateKey(statsDate, statsRange, direction));

  const finesFor = useCallback((playerId: string) => attendance.filter(a => a.player_id === playerId), [attendance]);

  const stats = useMemo(() => players.map(p => {
    const ms = filteredMatches.filter(m => m.match_players.some(x => x.player_id === p.id));
    const w = ms.filter(m => teamOf(m, p.id) === winnerOf(m)).length;
    return {
      ...p,
      played: ms.length,
      w,
      l: ms.length - w,
      winRate: ms.length ? Math.round(w / ms.length * 100) : 0,
      fines: sumBy(finesFor(p.id), a => a.fine_amount),
      owedExpenses: 0
    };
  }).sort((a, b) => b.w - a.w || b.winRate - a.winRate), [players, filteredMatches, finesFor]);

  const finePlayerStats = useMemo(() => players.map(p => {
    const rows = finesFor(p.id);
    return {
      ...p,
      entries: rows.length,
      total: sumBy(rows, a => a.fine_amount),
      late: sumBy(rows.filter(a => a.status !== "MISSED"), a => a.fine_amount),
      missed: sumBy(rows.filter(a => a.status === "MISSED"), a => a.fine_amount),
      latest: rows[0]?.attendance_date || null
    };
  }).sort((a, b) => b.total - a.total || b.entries - a.entries), [players, finesFor]);

  const monthlyExpenses = useMemo(
    () => expenses.filter(e => e.expense_date.slice(0, 7) === reportMonth),
    [expenses, reportMonth]
  );

  const monthlyAttendance = useMemo(() => attendance.filter(a => a.attendance_date.slice(0, 7) === reportMonth), [attendance, reportMonth]);
  const monthlyFineStats = useMemo(() => players.map(p => {
    const rows = monthlyAttendance.filter(a => a.player_id === p.id);
    const lateRows = rows.filter(a => a.status === "PRESENT");
    const missedRows = rows.filter(a => a.status === "MISSED");
    const late = sumBy(lateRows, a => a.fine_amount);
    const missed = sumBy(missedRows, a => a.fine_amount);
    return { ...p, late, missed, total: late + missed, lateCount: lateRows.length, missedCount: missedRows.length };
  }).sort((a, b) => b.total - a.total), [players, monthlyAttendance]);
  const monthTotal = sumBy(monthlyFineStats, p => p.total);
  const monthLate = sumBy(monthlyFineStats, p => p.late);
  const monthMissed = sumBy(monthlyFineStats, p => p.missed);
  const monthEntries = sumBy(monthlyFineStats, p => p.lateCount + p.missedCount);

  const totalExpenses = sumBy(expenses, e => e.amount);
  const totalFines = sumBy(attendance, a => a.fine_amount);

  const saveMatch = async () => {
    if (!groupId || selected.length !== 4 || !winnerTeam) return;

    const { data: m, error: me } = await supabase
      .from("matches")
      .insert({ group_id: groupId, ...winnerScores(winnerTeam) })
      .select("id")
      .single();

    if (me || !m) {
      setError(me?.message || "Could not save");
      return;
    }

    const rows = [
      ...selected.slice(0, 2).map(player_id => ({ match_id: m.id, player_id, team: "A" as const })),
      ...selected.slice(2, 4).map(player_id => ({ match_id: m.id, player_id, team: "B" as const }))
    ];

    const { error: pe } = await supabase.from("match_players").insert(rows);
    if (pe) {
      setError(pe.message);
      return;
    }

    setSelected([]);
    setWinnerTeam("");
    setModal(null);
    await load();
  };

  const verify = async () => {
    if (!groupId || !isValidPin(pin)) {
      setError(`Admin PIN must be exactly ${PIN_LENGTH} digits`);
      return;
    }

    if (pinAction === "edit" && targetMatch) {
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

      verifiedEditPinRef.current = enteredPin;
      setVerifiedEditPin(enteredPin);
      setPin("");
      setAdminOK(true);
      setError("");
      setModal("edit");
      return;
    }

    setAdminOK(true);
    setPin("");
    setError("");
    setModal(moneyAction);
  };

  const addFine = async () => {
    if (!groupId || !adminOK || !finePlayer || !fineDate) return;

    const mins = fineType === "late" ? Number(minutes) : 0;
    if (fineType === "late" && (!Number.isInteger(mins) || mins <= 0)) {
      setError("Enter valid minutes late.");
      return;
    }

    const amount = fineType === "late" ? mins * Number(lateRate) : Number(missedRate);

    const { error } = await supabase.from("attendance").insert({
      group_id: groupId,
      player_id: finePlayer,
      attendance_date: fineDate,
      status: fineType === "late" ? "PRESENT" : "MISSED",
      late_minutes: mins,
      fine_amount: amount,
    });

    if (error) {
      if (error.code === "23505") {
        setError(
          fineType === "late"
            ? "A late fine is already recorded for this player on this date."
            : "A missed-day fine is already recorded for this player on this date."
        );
      } else {
        setError(error.message);
      }
      return;
    }

    setAdminOK(false);
    setModal(null);
    setMinutes("");
    setFineDate(localDateKey());
    await load();
  };

  const addExpense = async () => {
    if (!groupId || !adminOK || !expenseAmount || !split.length) return;
    const amount = Number(expenseAmount), { data: e, error: ee } = await supabase.from("expenses").insert({ group_id: groupId, expense_date: localDateKey(), category: expenseCategory, amount, description: expenseDesc || null }).select("id").single();
    if (ee || !e) { setError(ee?.message || "Could not save expense"); return }
    const share = Math.round(amount / split.length * 100) / 100;
    const { error: se } = await supabase.from("expense_splits").insert(split.map(player_id => ({ expense_id: e.id, player_id, share_amount: share })));
    if (se) { setError(se.message); return }
    setAdminOK(false); setModal(null); setExpenseAmount(""); setExpenseDesc(""); load();
  };

  const clearAdminSession = () => {
    verifiedEditPinRef.current = "";
    setVerifiedEditPin("");
    setPin("");
    setTargetMatch(null);
    setWinnerTeam("");
    setPinAction("money");
    setAdminOK(false);
    setModal(null);
    setError("");
  };

  /** Returns the PIN verified for the current admin session, or `null` when it is missing. */
  const verifiedSessionPin = () => {
    const sessionPin = verifiedEditPinRef.current || verifiedEditPin;
    if (!groupId || !targetMatch || !adminOK || !isValidPin(sessionPin)) {
      setError("Admin PIN verification required.");
      return null;
    }
    return sessionPin;
  };

  const runMatchRpc = async (fn: string, sessionPin: string, args: Record<string, unknown> = {}) => {
    if (!groupId || !targetMatch) return;

    const { error } = await supabase.rpc(fn, {
      p_group_id: groupId,
      p_match_id: targetMatch.id,
      p_pin: sessionPin,
      ...args,
    });

    if (error) {
      setError(error.message);
      return;
    }

    clearAdminSession();
    await load();
  };

  const saveEditedMatch = async () => {
    const sessionPin = verifiedSessionPin();
    if (!sessionPin) return;

    if (!winnerTeam) {
      setError("Select the winning team.");
      return;
    }

    const { team_a_score, team_b_score } = winnerScores(winnerTeam);
    await runMatchRpc("edit_match_with_pin", sessionPin, { p_team_a_score: team_a_score, p_team_b_score: team_b_score });
  };

  const removeMatch = async () => {
    const sessionPin = verifiedSessionPin();
    if (!sessionPin) return;
    await runMatchRpc("void_match_with_pin", sessionPin);
  };

  const openAdmin = (action: "edit" | "money") => { setPinAction(action); setPin(""); setModal("pin") };
  const openEdit = (match: Match) => {
    setError("");
    verifiedEditPinRef.current = "";
    setTargetMatch(match);
    setWinnerTeam(winnerOf(match));
    setPinAction("edit");
    setPin("");
    setVerifiedEditPin("");
    setAdminOK(false);
    setModal("pin");
  };

  const renderMatchCard = (m: Match, options: { variant?: "history" | "stats"; onEdit?: (match: Match) => void } = {}) =>
    <MatchCard
      key={m.id}
      match={m}
      number={matchNumber(matches, m.id)}
      teamA={team(m, "A")}
      teamB={team(m, "B")}
      {...options}
    />;

  if (loading) return <main className="center">Loading Rally365…</main>;

  return <main className="app-shell">
    <header className="topbar"><div><div className="brand">Rally<span>365</span></div><div className="subtitle">Everyday badminton</div></div><div className="group-pill"><MapPin size={15} /> Vega Badminton</div></header>
    <section className="content">
      {error && <div className="error-banner">{error}<button onClick={() => setError("")}>×</button></div>}

      {tab === "today" && <><div className="hero-card"><div><div className="eyebrow">TODAY</div><h1>Today's games</h1><p>{players.length} players · {validMatches.length} valid matches</p></div><Trophy size={42} /></div>
        <button className="primary-button" onClick={() => setModal("match")}><Plus size={21} /> New match</button>
        <div className="section-title"><span>Match history</span><span>{matches.length}</span></div>
        <div className="match-list">
          {matches.length === 0 && <div className="empty-card">No matches yet.</div>}
          {matches.map(m => renderMatchCard(m, { onEdit: openEdit }))}
        </div></>}

      {tab === "stats" && <>
        <div className="page-heading"><div className="eyebrow">PERFORMANCE</div><h1>Leaderboard</h1><p>Performance for the selected period.</p></div>

        <div className="range-toggle three">
          {STATS_RANGES.map(({ value, label }) => <button
            key={value}
            className={statsRange === value ? "active" : ""}
            onClick={() => setStatsRange(value)}
          >{label}</button>)}
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
            {filteredMatches.map(m => renderMatchCard(m, { variant: "stats" }))}
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
          <button onClick={() => setReportMonth(shiftMonthKey(reportMonth, -1))}>‹</button>
          <b>{formatMonthYear(parseMonthKey(reportMonth))}</b>
          <button onClick={() => setReportMonth(shiftMonthKey(reportMonth, 1))}>›</button>
        </div>

        <div className="money-grid four">
          <div><b>{money(monthTotal)}</b><small>Total fines</small></div>
          <div><b>{money(monthLate)}</b><small>Late fines</small></div>
          <div><b>{money(monthMissed)}</b><small>Missed fines</small></div>
          <div><b>{monthEntries}</b><small>Entries</small></div>
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
                {s.latest ? ` · Last ${formatDayMonth(parseDateKeyNoon(s.latest))}` : " · No fines"}
              </small>
            </span>
            <span className="fine-breakdown"><small><b>L</b> {money(s.late)} · <b>M</b> {money(s.missed)}</small><strong>{money(s.total)}</strong></span>
            <ChevronRight size={17} />
          </button>)}
        </div>
      </>}

      {tab === "players" && <><div className="page-heading"><div className="eyebrow">ROSTER</div><h1>Players</h1><p>Names are fixed to protect historical statistics.</p></div><div className="player-grid">{players.map(p => { const s = stats.find(x => x.id === p.id)!; return <div className="player-card" key={p.id}><div className="avatar">{p.name.slice(0, 1)}</div><div><b>{p.name}</b><small>{s.w}W · {s.l}L · {s.winRate}%</small></div><CircleUserRound size={19} className="muted" /></div> })}</div></>}
    </section>
    <nav className="bottom-nav">
      {TABS.map(({ value, label, Icon }) => <button
        key={value}
        className={tab === value ? "active" : ""}
        onClick={() => setTab(value)}
      ><Icon /><span>{label}</span></button>)}
    </nav>

    {modal === "match" && <Modal title="New match" close={() => setModal(null)}>
      <p className="helper">First two selected = Team A. Next two = Team B.</p>
      <PlayerChipGrid players={players} selected={selected} toggle={id => setSelected(x => toggleSelection(x, id, 4))} showOrder />
      <div className="match-preview"><b>{selected.slice(0, 2).map(name).join(" + ") || "—"}</b><span>vs</span><b>{selected.slice(2, 4).map(name).join(" + ") || "—"}</b></div>
      {selected.length === 4 && <WinnerSelect
        labels={{
          A: `Team A · ${selected.slice(0, 2).map(name).join(" & ")}`,
          B: `Team B · ${selected.slice(2, 4).map(name).join(" & ")}`
        }}
        winner={winnerTeam}
        select={setWinnerTeam}
      />}
      <button className="primary-button" disabled={selected.length !== 4 || !winnerTeam} onClick={saveMatch}>Save match</button>
    </Modal>}

    {modal === "pin" && <Modal title="Admin verification" close={() => setModal(null)}><div className="pin-box"><LockKeyhole size={28} /><p>Enter the {PIN_LENGTH}-digit admin PIN.</p><input autoFocus maxLength={PIN_LENGTH} inputMode="numeric" pattern={`[0-9]{${PIN_LENGTH}}`} type="password" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))} placeholder="••••••" />
      <button className="primary-button" disabled={pin.length !== PIN_LENGTH} onClick={verify}>Verify</button></div></Modal>}

    {modal === "edit" && targetMatch && <Modal title="Edit Match" close={() => {
      setPin("");
      setVerifiedEditPin("");
      setAdminOK(false);
      setTargetMatch(null);
      setModal(null);
    }}>
      <p className="helper">Admin verified. The match ID remains unchanged.</p>
      <div className="match-preview"><b>{team(targetMatch, "A")}</b><span>vs</span><b>{team(targetMatch, "B")}</b></div>
      <WinnerSelect
        labels={{ A: `Team A · ${team(targetMatch, "A")}`, B: `Team B · ${team(targetMatch, "B")}` }}
        winner={winnerTeam}
        select={setWinnerTeam}
      />

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

    {modal === "fine" && <Modal title="Add fine" close={() => setModal(null)}>
      <select value={finePlayer} onChange={e => setFinePlayer(e.target.value)}>
        <option value="">Select player</option>
        {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <select value={fineType} onChange={e => setFineType(e.target.value as "late" | "missed")}>
        <option value="late">Late arrival · ₹{lateRate}/min</option>
        <option value="missed">Missed day · ₹{missedRate}</option>
      </select>

      <label className="fine-date-field">
        <span>Fine date</span>
        <input type="date" value={fineDate} onChange={e => setFineDate(e.target.value)} />
      </label>

      {fineType === "late" && <input inputMode="numeric" placeholder="Minutes late" value={minutes} onChange={e => setMinutes(e.target.value.replace(/\D/g, ""))} />}

      <div className="helper">{fineType === "missed" ? "Choose the date the player missed." : "Choose the date the player arrived late."}</div>
      <button className="primary-button" onClick={addFine}>Save fine</button>
    </Modal>}

    {modal === "expense" && <Modal title="Add expense" close={() => setModal(null)}>
      <select value={expenseCategory} onChange={e => setExpenseCategory(e.target.value)}><option value="SHUTTLES">🏸 Shuttles</option><option value="BREAKFAST">🍳 Breakfast</option><option value="COFFEE">☕ Coffee</option><option value="OTHER">Other</option></select>
      <input inputMode="decimal" placeholder="Amount ₹" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} />
      <input placeholder="Description (optional)" value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)} />
      <p className="helper">Split among</p>
      <PlayerChipGrid players={players} selected={split} toggle={id => setSplit(x => toggleSelection(x, id))} />
      {split.length > 0 && <div className="split-preview">{money(Number(expenseAmount || 0) / split.length)} each · {split.length} people</div>}
      <button className="primary-button" onClick={addExpense}>Save expense</button>
    </Modal>}

    {fineDetailsPlayer && <Modal title={`${name(fineDetailsPlayer)} · Fine history`} close={() => setFineDetailsPlayer(null)}>
      <div className="fine-history">
        {finesFor(fineDetailsPlayer).length === 0 && <div className="empty-card">No fines recorded.</div>}
        {finesFor(fineDetailsPlayer).map(a => <div className="fine-history-row" key={a.id}>
          <div><b>{a.status === "MISSED" ? "Missed day" : "Late arrival"}</b><small>{formatDayMonthYear(parseDateKeyNoon(a.attendance_date))}{a.status === "PRESENT" && a.late_minutes ? ` · ${a.late_minutes} min late` : ""}</small></div>
          <strong>{money(Number(a.fine_amount))}</strong>
        </div>)}
      </div>
    </Modal>}
  </main>
}
