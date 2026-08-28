"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, ChevronRight, CircleUserRound, Clock3, History, LockOpen, Pencil, LockKeyhole,
  MapPin, Plus, ReceiptText, Trophy, Users, X, Trash2, UserMinus, UserPlus, Shuffle, RotateCw
} from "lucide-react";
import { supabase } from "../lib/supabase";

type Player = { id: string; name: string };
type Match = { id: string; group_id: string; team_a_score: number; team_b_score: number; played_at: string; status: string; edit_count: number; last_edited_at: string | null; match_players: { player_id: string; team: "A" | "B" }[] };
type Expense = { id: string; expense_date: string; category: string; amount: number; description: string | null };
type Attendance = { id: string; player_id: string; attendance_date: string; status: string; late_minutes: number; fine_amount: number };

const CODE = "RALLY365";
const money = (n: number) => `₹${Number(n || 0).toFixed(0)}`;

export default function Home() {
  const [tab, setTab] = useState<"today" | "stats" | "money" | "players" | "duos">("today");
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [duoPlayers, setDuoPlayers] = useState<string[]>([]);
  const [duoMatches, setDuoMatches] = useState<{ id: number; teamA: string[]; teamB: string[] }[]>([]);
  const [duoSpinning, setDuoSpinning] = useState(false);
  const [scheduledMatchToRecord, setScheduledMatchToRecord] = useState<{ id: string; teamA: string[]; teamB: string[] } | null>(null);
  const [homeSchedule, setHomeSchedule] = useState<{ id: string; matchNo: number; teamA: string[]; teamB: string[]; status: "PLANNED" | "RECORDED"; recordedMatchId: string | null }[]>([]);
  const [duoGenerated, setDuoGenerated] = useState(false);
  const [scoreA, setScoreA] = useState(""); const [scoreB, setScoreB] = useState("");
  const [winnerTeam, setWinnerTeam] = useState<"A" | "B" | "">("");
  const [modal, setModal] = useState<null | "match" | "edit" | "remove" | "pin" | "fine" | "expense">(null);
  const [targetMatch, setTargetMatch] = useState<Match | null>(null);
  const [pin, setPin] = useState(""); const [verifiedEditPin, setVerifiedEditPin] = useState(""); const verifiedEditPinRef = useRef(""); const [pinAction, setPinAction] = useState<"edit" | "money" | "duos">("money"); const [moneyAction, setMoneyAction] = useState<"fine" | "expense">("fine");
  const [adminOK, setAdminOK] = useState(false); const [fineDetailsPlayer, setFineDetailsPlayer] = useState<string | null>(null); const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7)); const [statsRange, setStatsRange] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("DAILY");
  const [statsDate, setStatsDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [homeDate, setHomeDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [finePlayer, setFinePlayer] = useState(""); const [fineType, setFineType] = useState<"late" | "missed">("late"); const [minutes, setMinutes] = useState("");
  const [fineDate, setFineDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
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

    const now = new Date();
    const todayScheduleDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const { data: ds, error: dse } = await supabase
      .from("duo_schedules")
      .select("id")
      .eq("group_id", g.id)
      .eq("schedule_date", todayScheduleDate)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dse) {
      setError(dse.message);
    } else if (ds) {
      const { data: dsm, error: dsme } = await supabase
        .from("duo_schedule_matches")
        .select("id,match_no,team_a_player_1,team_a_player_2,team_b_player_1,team_b_player_2,status,recorded_match_id")
        .eq("schedule_id", ds.id)
        .order("match_no");

      if (dsme) {
        setError(dsme.message);
      } else {
        setHomeSchedule((dsm || []).map(x => ({
          id: x.id,
          matchNo: x.match_no,
          teamA: [x.team_a_player_1, x.team_a_player_2],
          teamB: [x.team_b_player_1, x.team_b_player_2],
          status: x.status as "PLANNED" | "RECORDED",
          recordedMatchId: x.recorded_match_id
        })));
      }
    } else {
      setHomeSchedule([]);
    }

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

  const localDateKey = (date: Date) => {
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  };

  const homeMatches = useMemo(
    () => matches.filter(m => localDateKey(new Date(m.played_at)) === homeDate),
    [matches, homeDate]
  );

  const moveHomeDate = (direction: number) => {
    const d = new Date(`${homeDate}T12:00:00`);
    d.setDate(d.getDate() + direction);
    setHomeDate(localDateKey(d));
  };

  const validMatches = useMemo(
    () => matches.filter(m => m.status !== "VOIDED"),
    [matches]
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
    const anchor = new Date(`${statsDate}T12:00:00`);

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
    const d = new Date(`${statsDate}T12:00:00`);

    if (statsRange === "DAILY") {
      d.setDate(d.getDate() + direction);
    } else if (statsRange === "WEEKLY") {
      d.setDate(d.getDate() + direction * 7);
    } else {
      d.setMonth(d.getMonth() + direction);
    }

    const nextDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setStatsDate(nextDate);
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
  const duoName = (ids: string[]) => ids.map(name).join(" & ");

  const generateDuoSchedule = (ids: string[]) => {
    const unique = [...new Set(ids)];
    if (unique.length < 4) return [];

    type DuoMatch = { id: number; teamA: string[]; teamB: string[] };

    const pairKey = (a: string, b: string) => [a, b].sort().join("|");
    const shuffle = <T,>(items: T[]) => {
      const a = [...items];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const appearances = new Map<string, number>();
    const consecutive = new Map<string, number>();
    const partnerCount = new Map<string, number>();
    const opponentCount = new Map<string, number>();

    unique.forEach(id => {
      appearances.set(id, 0);
      consecutive.set(id, 0);
    });

    const recordMatch = (teamA: string[], teamB: string[]) => {
      const playing = new Set([...teamA, ...teamB]);

      unique.forEach(id => {
        consecutive.set(id, playing.has(id) ? (consecutive.get(id) || 0) + 1 : 0);
      });

      for (const team of [teamA, teamB]) {
        const key = pairKey(team[0], team[1]);
        partnerCount.set(key, (partnerCount.get(key) || 0) + 1);
        team.forEach(id => appearances.set(id, (appearances.get(id) || 0) + 1));
      }

      for (const a of teamA) {
        for (const b of teamB) {
          const key = pairKey(a, b);
          opponentCount.set(key, (opponentCount.get(key) || 0) + 1);
        }
      }
    };

    const scoreFour = (four: string[], previous: DuoMatch | null) => {
      let score = Math.random() * 4;

      for (const id of four) {
        const c = consecutive.get(id) || 0;
        if (c >= 2) return Infinity; // hard rule: never create a 3rd straight match
        score += c * 25;
        score += (appearances.get(id) || 0) * 4;
      }

      const maxApp = Math.max(...unique.map(id => appearances.get(id) || 0));
      const minApp = Math.min(...unique.map(id => appearances.get(id) || 0));
      score += (maxApp - minApp) * 20;

      if (previous) {
        const previousPlayers = new Set([...previous.teamA, ...previous.teamB]);
        const carried = four.filter(id => previousPlayers.has(id)).length;
        score += Math.max(0, carried - 2) * 10;
        // Prefer some continuity, but do not force it.
        if (carried === 2) score -= 8;
      }

      return score;
    };

    const scoreSplit = (teamA: string[], teamB: string[]) => {
      let score = Math.random() * 2;
      score += (partnerCount.get(pairKey(teamA[0], teamA[1])) || 0) * 50;
      score += (partnerCount.get(pairKey(teamB[0], teamB[1])) || 0) * 50;

      for (const a of teamA) {
        for (const b of teamB) {
          score += (opponentCount.get(pairKey(a, b)) || 0) * 8;
        }
      }
      return score;
    };

    const combinations = <T,>(arr: T[], k: number) => {
      const out: T[][] = [];
      const walk = (start: number, current: T[]) => {
        if (current.length === k) {
          out.push([...current]);
          return;
        }
        for (let i = start; i < arr.length; i++) {
          current.push(arr[i]);
          walk(i + 1, current);
          current.pop();
        }
      };
      walk(0, []);
      return out;
    };

    const splitBest = (four: string[]) => {
      const [a, b, c, d] = four;
      const options: [string[], string[]][] = [
        [[a, b], [c, d]],
        [[a, c], [b, d]],
        [[a, d], [b, c]],
      ];
      options.sort((x, y) => scoreSplit(x[0], x[1]) - scoreSplit(y[0], y[1]));
      return options[0];
    };

    // First two matches have an explicit coverage rule:
    // for 4,5,6 and 8 selected players, every selected player must appear
    // at least once across M1 + M2. For 7, normal rotation starts immediately.
    const firstTwoNeedCoverage = unique.length !== 7 && unique.length <= 8;

    const schedule: DuoMatch[] = [];

    // ---------- Match 1 ----------
    let firstFour: string[];
    if (firstTwoNeedCoverage && unique.length > 4) {
      firstFour = shuffle(unique).slice(0, 4);
    } else {
      firstFour = shuffle(unique).slice(0, 4);
    }

    let [teamA, teamB] = splitBest(firstFour);
    schedule.push({ id: 1, teamA, teamB });
    recordMatch(teamA, teamB);

    // ---------- Match 2 ----------
    let secondFour: string[] = [];

    if (firstTwoNeedCoverage) {
      const remaining = unique.filter(id => !firstFour.includes(id));

      // Cover every remaining player first. Fill the remaining slots from M1.
      // n=4 -> all four return.
      // n=5 -> one new + three return.
      // n=6 -> two new + two return.
      // n=8 -> four new, so M2 is fully fresh.
      const neededFresh = Math.min(4, remaining.length);
      const fresh = shuffle(remaining).slice(0, neededFresh);

      const requiredReturnSlots = 4 - fresh.length;
      const returnCandidates = shuffle(firstFour)
        .filter(id => (consecutive.get(id) || 0) < 2)
        .slice(0, requiredReturnSlots);

      secondFour = [...fresh, ...returnCandidates];

      // For 5/6 players every remaining player must be covered. In the rare
      // 4-player case, all four necessarily play again; that's unavoidable.
      if (secondFour.length < 4) {
        const fallback = shuffle(unique)
          .filter(id => !secondFour.includes(id))
          .filter(id => (consecutive.get(id) || 0) < 2);
        secondFour.push(...fallback.slice(0, 4 - secondFour.length));
      }

      // If we only have 4 selected players, a third-consecutive break is
      // mathematically impossible; keep the game playable rather than failing.
      if (unique.length === 4 && secondFour.length < 4) {
        secondFour = [...unique];
      }
    } else {
      // 7 players: rotate the rest immediately. Prefer two fresh/rested players
      // from outside M1 and two carry-over players, but never a third straight.
      const eligible = shuffle(unique).filter(id => (consecutive.get(id) || 0) < 2);
      secondFour = eligible.slice(0, 4);

      // If the feasible pool is larger, prefer at most 2 M1 carry-over players.
      const notInFirst = eligible.filter(id => !firstFour.includes(id));
      const inFirst = eligible.filter(id => firstFour.includes(id));
      if (notInFirst.length >= 2) {
        secondFour = [
          ...notInFirst.slice(0, 2),
          ...inFirst.slice(0, 2),
        ];
      }
      secondFour = shuffle(secondFour);
    }

    [teamA, teamB] = splitBest(secondFour);
    schedule.push({ id: 2, teamA, teamB });
    recordMatch(teamA, teamB);

    // ---------- Matches 3-6 ----------
    for (let round = 3; round <= 6; round++) {
      const previous = schedule[schedule.length - 1];

      // Hard eligibility: anybody already at 2 consecutive must rest now.
      const eligible = unique.filter(id => (consecutive.get(id) || 0) < 2);

      // With 4 players, everyone has to play. There is no mathematical way to
      // satisfy the 2-consecutive maximum; preserve a playable schedule.
      let pool = unique.length === 4 ? unique : eligible;

      if (pool.length < 4) {
        // This should only happen for very small groups. Use the least-used
        // eligible players and keep the hard cap whenever mathematically possible.
        pool = [...eligible].sort((a, b) => {
          const ca = consecutive.get(a) || 0;
          const cb = consecutive.get(b) || 0;
          if (ca !== cb) return ca - cb;
          return (appearances.get(a) || 0) - (appearances.get(b) || 0);
        });

        if (pool.length < 4 && unique.length === 4) pool = unique;
      }

      // Generate candidate four-player groups and choose one that:
      // 1) respects the consecutive rule
      // 2) balances appearances
      // 3) prefers two carry-over players from the previous match
      // 4) minimizes partner/opponent repeats
      const candidates: { four: string[]; score: number }[] = [];
      for (const four of combinations(pool, 4)) {
        const score = scoreFour(four, previous);
        if (score !== Infinity) candidates.push({ four, score });
      }

      // If feasible candidates exist, take the best randomized candidate.
      // Otherwise only the 4-player case can reach here legitimately.
      let chosen = candidates.sort((a, b) => a.score - b.score)[0]?.four;

      if (!chosen) {
        if (unique.length === 4) {
          chosen = [...unique];
        } else {
          // Defensive fallback: never intentionally schedule a 3rd consecutive
          // game when a valid alternative exists.
          chosen = [...pool]
            .sort((a, b) => {
              const ca = consecutive.get(a) || 0;
              const cb = consecutive.get(b) || 0;
              if (ca !== cb) return ca - cb;
              return (appearances.get(a) || 0) - (appearances.get(b) || 0);
            })
            .slice(0, 4);
        }
      }

      [teamA, teamB] = splitBest(chosen);
      schedule.push({ id: round, teamA, teamB });
      recordMatch(teamA, teamB);
    }

    return schedule;
  };

  const exportScheduleToHome = () => {
    const validMatches = duoMatches.filter(match =>
      match.teamA.length === 2 &&
      match.teamB.length === 2 &&
      [...match.teamA, ...match.teamB].every(id => id && id !== "?")
    );

    if (validMatches.length === 0) {
      setError("No valid 2-vs-2 duos are available to export.");
      return;
    }

    setPinAction("duos");
    setPin("");
    setError("");
    setModal("pin");
  };

  const recordScheduledMatch = (scheduled: { id: string; teamA: string[]; teamB: string[] }) => {
    setScheduledMatchToRecord(scheduled);
    setTab("today");
    setSelected([...scheduled.teamA, ...scheduled.teamB]);
    setWinnerTeam("");
    setScoreA("");
    setScoreB("");
    setModal("match");
  };

  const generateDuosForToday = () => {
    if (duoPlayers.length < 4) {
      setError("Select at least 4 players to generate duos.");
      return;
    }

    setError("");
    setDuoSpinning(true);
    setDuoGenerated(false);

    // Give the wheel a short physical spin before revealing the schedule.
    window.setTimeout(() => {
      setDuoMatches(generateDuoSchedule(duoPlayers));
      setDuoGenerated(true);
      setDuoSpinning(false);
    }, 1100);
  };

  const saveMatch = async () => {
    if (!groupId || selected.length !== 4 || !winnerTeam) return;

    // The database still uses its existing score columns for compatibility,
    // but the UI treats them only as internal W/L placeholders.
    const teamAScore = winnerTeam === "A" ? 1 : 0;
    const teamBScore = winnerTeam === "B" ? 1 : 0;

    const { data: m, error: me } = await supabase
      .from("matches")
      .insert({
        group_id: groupId,
        team_a_score: teamAScore,
        team_b_score: teamBScore,
      })
      .select("id")
      .single();

    if (me || !m) {
      setError(me?.message || "Could not save");
      return;
    }

    const rows: {
      match_id: string;
      player_id: string;
      team: "A" | "B";
    }[] = [
      ...selected.slice(0, 2).map(player_id => ({
        match_id: m.id,
        player_id,
        team: "A" as const
      })),
      ...selected.slice(2, 4).map(player_id => ({
        match_id: m.id,
        player_id,
        team: "B" as const
      }))
    ];

    const { error: pe } = await supabase.from("match_players").insert(rows);
    if (pe) {
      setError(pe.message);
      return;
    }

    if (scheduledMatchToRecord) {
      const { error: scheduleError } = await supabase
        .from("duo_schedule_matches")
        .update({ status: "RECORDED", recorded_match_id: m.id })
        .eq("id", scheduledMatchToRecord.id);

      if (scheduleError) {
        setError(scheduleError.message);
        return;
      }
    }

    setSelected([]);
    setScoreA("");
    setScoreB("");
    setWinnerTeam("");
    setScheduledMatchToRecord(null);
    setModal(null);
    await load();
  };


  const verify = async () => {
    if (!groupId || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      setError("Admin PIN must be exactly 6 digits");
      return;
    }

    if (pinAction === "duos") {
      const validMatches = duoMatches.filter(match =>
        match.teamA.length === 2 &&
        match.teamB.length === 2 &&
        [...match.teamA, ...match.teamB].every(id => id && id !== "?")
      );

      if (validMatches.length === 0) {
        setError("No valid 2-vs-2 duos are available to export.");
        return;
      }

      const d = new Date();
      const scheduleDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      const payload = validMatches.map((match, index) => ({
        match_no: index + 1,
        teamA: match.teamA,
        teamB: match.teamB
      }));

      const { data, error: publishError } = await supabase.rpc("publish_duo_schedule_with_pin", {
        p_group_id: groupId,
        p_pin: pin,
        p_schedule_date: scheduleDate,
        p_matches: payload
      });

      if (publishError) {
        setError(publishError.message);
        return;
      }

      if (!data) {
        setError("Could not publish today's schedule.");
        return;
      }

      setPin("");
      setError("");
      setModal(null);
      setTab("today");
      await load();
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

    const amount =
      fineType === "late"
        ? mins * Number(lateRate)
        : Number(missedRate);

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
    setFineDate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    await load();
  };

  const addExpense = async () => {
    if (!groupId || !adminOK || !expenseAmount || !split.length) return;
    const amount = Number(expenseAmount), { data: e, error: ee } = await supabase.from("expenses").insert({ group_id: groupId, expense_date: new Date().toISOString().slice(0, 10), category: expenseCategory, amount, description: expenseDesc || null }).select("id").single();
    if (ee || !e) { setError(ee?.message || "Could not save expense"); return }
    const share = Math.round(amount / split.length * 100) / 100;
    const { error: se } = await supabase.from("expense_splits").insert(split.map(player_id => ({ expense_id: e.id, player_id, share_amount: share })));
    if (se) { setError(se.message); return }
    setAdminOK(false); setModal(null); setExpenseAmount(""); setExpenseDesc(""); load();
  };
  const saveEditedMatch = async () => {
    const sessionPin = verifiedEditPinRef.current || verifiedEditPin;

    if (!groupId || !targetMatch || !adminOK || !/^\d{6}$/.test(sessionPin)) {
      setError("Admin PIN verification required.");
      return;
    }

    if (!winnerTeam) {
      setError("Select the winning team.");
      return;
    }

    const na = winnerTeam === "A" ? 1 : 0;
    const nb = winnerTeam === "B" ? 1 : 0;

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

    verifiedEditPinRef.current = "";
    setVerifiedEditPin("");
    setPin("");
    setTargetMatch(null);
    setScoreA("");
    setScoreB("");
    setWinnerTeam("");
    setPinAction("money");
    setAdminOK(false);
    setModal(null);
    setError("");
    await load();
  };


  const removeMatch = async () => {
    const sessionPin = verifiedEditPinRef.current || verifiedEditPin;

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

    verifiedEditPinRef.current = "";
    setVerifiedEditPin("");
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

  const openAdmin = (action: "edit" | "money") => { setPinAction(action); setPin(""); setModal("pin") };
  const openEdit = (match: Match) => {
    setError("");
    verifiedEditPinRef.current = "";
    setTargetMatch(match);
    setScoreA("");
    setScoreB("");
    setWinnerTeam(match.team_a_score > match.team_b_score ? "A" : "B");
    setPinAction("edit");
    setPin("");
    setVerifiedEditPin("");
    setAdminOK(false);
    setModal("pin");
  };

  if (loading) return <main className="center">Loading Rally365…</main>;

  return <main className="app-shell">
    <header className="topbar"><div><div className="brand">Rally<span>365</span></div><div className="subtitle">Everyday badminton</div></div><div className="group-pill"><MapPin size={15} /> Vega Badminton</div></header>
    <section className="content">
      {error && <div className="error-banner">{error}<button onClick={() => setError("")}>×</button></div>}

      {tab === "today" && <><div className="hero-card"><div><div className="eyebrow">{homeDate === localDateKey(new Date()) ? "TODAY" : "MATCH DAY"}</div><h1>{homeDate === localDateKey(new Date()) ? "Today's games" : "Games"}</h1><p>{new Set(homeMatches.filter(m => m.status !== "VOIDED").flatMap(m => m.match_players.map(x => x.player_id))).size} players · {homeMatches.filter(m => m.status !== "VOIDED").length} valid matches</p></div><Trophy size={42} /></div>
        <button className="primary-button" onClick={() => { setScheduledMatchToRecord(null); setWinnerTeam(""); setSelected([]); setModal("match"); }}><Plus size={21} /> New match</button>
        <div className="home-date-filter">
          <button type="button" className="period-arrow" onClick={() => moveHomeDate(-1)} aria-label="Previous date">‹</button>
          <label className="date-picker-control">
            <span>DATE</span>
            <input type="date" value={homeDate} onChange={e => e.target.value && setHomeDate(e.target.value)} />
          </label>
          <button type="button" className="period-arrow" onClick={() => moveHomeDate(1)} aria-label="Next date">›</button>
        </div>
        {homeDate === localDateKey(new Date()) && homeSchedule.length > 0 && <div className="home-schedule-export">
          <div className="section-title">
            <span>Today's scheduled duos</span>
            <span>{homeSchedule.length} matches</span>
          </div>
          <div className="match-list">
            {homeSchedule.map(m => <button
              key={m.id}
              type="button"
              className="match-card home-schedule-card"
              disabled={m.status === "RECORDED"}
              onClick={() => m.status === "PLANNED" && recordScheduledMatch(m)}
            >
              <div className="match-number">M{m.matchNo}</div>
              <div className="teams">
                <div><strong className="scheduled-team-name">{duoName(m.teamA)}</strong></div>
                <div><strong className="scheduled-team-name">{duoName(m.teamB)}</strong></div>
              </div>
              <span className="scheduled-record-label">{m.status === "RECORDED" ? "Recorded" : "Record"}</span>
            </button>)}
          </div>
        </div>}

        <div className="section-title"><span>Match history</span><span>{homeMatches.length}</span></div>
        <div className="match-list">{homeMatches.length === 0 && <div className="empty-card">No matches for this date.</div>}
          {homeMatches.map((m, i) => <div className={`match-card ${m.status === "VOIDED" ? "voided" : ""}`} key={m.id}><div className="match-number">M{homeMatches.length - i}</div><div className="teams">
                <div><strong className={m.team_a_score > m.team_b_score ? "home-team-win" : "home-team-loss"}>{team(m, "A")}</strong></div>
                <div><strong className={m.team_b_score > m.team_a_score ? "home-team-win" : "home-team-loss"}>{team(m, "B")}</strong></div>
                {m.status === "VOIDED" ? <small>VOIDED</small> : m.edit_count > 0 ? <small>Edited · {m.edit_count}x</small> : null}
              </div>{m.status !== "VOIDED" && <button
                  className="edit-link"
                  title="Edit match"
                  aria-label="Edit match"
                  onClick={() => openEdit(m)}
                >
                  <Pencil size={16} />
                </button>}</div>)}
        </div></>}

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
                    <span className={aWon ? "match-result-circle match-result-win" : "match-result-circle match-result-loss"}>{aWon ? "W" : "L"}</span>
                  </div>
                  <div>
                    <strong className={!aWon ? "winning-team" : "losing-team"}>{team(m, "B")}</strong>
                    <span className={!aWon ? "match-result-circle match-result-win" : "match-result-circle match-result-loss"}>{!aWon ? "W" : "L"}</span>
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
          <div className="fine-player-header">
            <span>#</span>
            <span>PLAYER</span>
            <span>L</span>
            <span>M</span>
            <span>TOTAL</span>
            <span></span>
          </div>
          {finePlayerStats.map((s, i) => <button className="fine-player-row" key={s.id} onClick={() => setFineDetailsPlayer(s.id)}>
            <span className="rank">{i + 1}</span>
            <span className="player-name">
              <b>{s.name}</b>
              <small>
                {s.entries} {s.entries === 1 ? "entry" : "entries"}
                {s.latest ? ` · Last ${new Date(`${s.latest}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : " · No fines"}
              </small>
            </span>
            <span className="fine-value">{money(s.late)}</span>
            <span className="fine-value">{money(s.missed)}</span>
            <span className="fine-total">{money(s.total)}</span>
            <ChevronRight size={17} />
          </button>)}
        </div>
      </>}

      {tab === "duos" && <>
        <div className="page-heading">
          <div className="eyebrow">DAILY DRAW</div>
          <h1>Generate duos</h1>
          <p>Pick today's players and let Rally365 balance the doubles schedule.</p>
        </div>

        <div className="duos-layout">
          <div className="duos-panel">
            <div className="section-title"><span>1 · All players</span><span>{players.length}</span></div>
            <div className="duo-player-list">
              {players.map(p => {
                const added = duoPlayers.includes(p.id);
                return <button
                  key={p.id}
                  className={`duo-player-row ${added ? "added" : ""}`}
                  onClick={() => {
                    setDuoPlayers(current =>
                      current.includes(p.id)
                        ? current.filter(id => id !== p.id)
                        : [...current, p.id]
                    );
                    setDuoGenerated(false);
                  }}
                >
                  <span className="avatar small">{p.name.slice(0, 1)}</span>
                  <span className="duo-player-name">{p.name}</span>
                  <span className="duo-add-icon">{added ? <UserMinus size={16} /> : <UserPlus size={16} />}</span>
                </button>
              })}
            </div>
          </div>

          <div className="duos-panel">
            <div className="section-title"><span>2 · Today's draw</span><span>{duoPlayers.length} selected</span></div>
            <div className="duo-selected-list">
              {duoPlayers.length === 0
                ? <div className="empty-card">Select players from the list.</div>
                : duoPlayers.map((id, index) => <div className="duo-selected-row" key={id}>
                    <span className="duo-order">{index + 1}</span>
                    <span>{name(id)}</span>
                    <button aria-label={`Remove ${name(id)}`} onClick={() => {
                      setDuoPlayers(current => current.filter(x => x !== id));
                      setDuoGenerated(false);
                    }}><UserMinus size={14} /></button>
                  </div>)}
            </div>
          </div>
        </div>

        <div className={`spin-wheel-wrap ${duoSpinning ? "spinning" : ""} ${duoGenerated ? "wheel-ready" : ""}`}>
          <div className="spin-pointer"></div>
          <div
            className="spin-wheel"
            style={{
              ["--slice-count" as string]: Math.max(1, duoPlayers.length),
              ["--wheel-angle" as string]: `${duoPlayers.length ? 360 / duoPlayers.length : 360}deg`
            }}
          >
            {duoPlayers.length === 0 ? (
              <div className="wheel-empty">Add players<br />to the draw</div>
            ) : (
              duoPlayers.map((id, index) => {
                const angle = (360 / duoPlayers.length) * index + (180 / duoPlayers.length);
                return <div
                  className="wheel-label"
                  key={id}
                  style={{ ["--label-angle" as string]: `${angle}deg` }}
                >
                  <span>{name(id)}</span>
                </div>
              })
            )}
            <div className="wheel-center"><Shuffle size={20} /><span>DUOS</span></div>
          </div>
        </div>

        <button
          className="primary-button duo-generate-button"
          disabled={duoPlayers.length < 4 || duoSpinning}
          onClick={generateDuosForToday}
        >
          <RotateCw size={18} className={duoSpinning ? "spin-icon" : ""} />
          {duoSpinning ? "Shuffling players…" : "Generate Duos for today"}
        </button>

        {duoPlayers.length > 0 && duoPlayers.length < 4 &&
          <div className="duo-note">Select at least 4 players. No player is scheduled for more than 2 matches in a row. With 4–6 or 8 players, everyone is covered within the first 2 matches; with 7, the rotation starts immediately.</div>
        }

        {duoGenerated && <div className="duo-schedule">
          <div className="section-title">
            <span>Today's 6-match schedule</span>
            <span>{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
          </div>
          <div className="duo-note">Rotation rule: a player can play up to 2 matches consecutively, but never a third. The generator also rotates partners and opponents where possible.</div>

          <div className="duo-schedule-list">
            {duoMatches.map((match, index) => <button
              className="duo-match-card"
              key={match.id}
              type="button"
            >
              <div className="duo-match-number">M{index + 1}</div>
              <div className="duo-match-team">
                <span>{duoName(match.teamA)}</span>
              </div>
              <div className="duo-vs">vs</div>
              <div className="duo-match-team right">
                <span>{duoName(match.teamB)}</span>
              </div>
            </button>)}
          </div>

          <button className="primary-button duo-home-button" onClick={exportScheduleToHome}>
            <History size={18} />
            Send valid duos to Today's Matches
          </button>
        </div>}
      </>}

      {tab === "players" && <><div className="page-heading"><div className="eyebrow">ROSTER</div><h1>Players</h1><p>Names are fixed to protect historical statistics.</p></div><div className="player-grid">{players.map(p => { const s = stats.find(x => x.id === p.id)!; return <div className="player-card" key={p.id}><div className="avatar">{p.name.slice(0, 1)}</div><div><b>{p.name}</b><small>{s.w}W · {s.l}L · {s.winRate}%</small></div><CircleUserRound size={19} className="muted" /></div> })}</div></>}
    </section>
    <nav className="bottom-nav" style={{
      display: "grid",
      gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
      width: "100%",
      minWidth: 0
    }}><button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}><History /><span>Today</span></button><button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")}><BarChart3 /><span>Stats</span></button><button className={tab === "money" ? "active" : ""} onClick={() => setTab("money")}><ReceiptText /><span>Money</span></button><button className={tab === "duos" ? "active" : ""} onClick={() => setTab("duos")}><Shuffle /><span>Duos</span></button><button className={tab === "players" ? "active" : ""} onClick={() => setTab("players")}><Users /><span>Players</span></button></nav>

    {modal === "match" && <Modal title="New match" close={() => setModal(null)}><p className="helper">First two selected = Team A. Next two = Team B.</p>
      {scheduledMatchToRecord && <div className="scheduled-record-banner">
        <b>Scheduled match</b>
        <span>Select the winner and save the result. You can also close this and create a different match.</span>
      </div>}<div className="selection-grid">{players.map(p => <button key={p.id} className={`player-chip ${selected.includes(p.id) ? "selected" : ""}`} onClick={() => setSelected(x => x.includes(p.id) ? x.filter(y => y !== p.id) : x.length < 4 ? [...x, p.id] : x)}>{p.name}{selected.includes(p.id) && <small>{selected.indexOf(p.id) + 1}</small>}</button>)}</div><div className="match-preview"><b>{selected.slice(0, 2).map(name).join(" + ") || "—"}</b><span>vs</span><b>{selected.slice(2, 4).map(name).join(" + ") || "—"}</b></div>{selected.length === 4 && <div className="winner-select">
        <div className="helper">Who won?</div>
        <div className="winner-options">
          <button
            type="button"
            className={winnerTeam === "A" ? "winner-option selected" : winnerTeam === "B" ? "winner-option loser-selected" : "winner-option"}
            style={winnerTeam === "B" ? { borderColor: "#e4b8b8", background: "#fff4f4", color: "#a63e3e" } : undefined}
            onClick={() => setWinnerTeam("A")}
          >
            <span>Team A · {selected.slice(0, 2).map(name).join(" & ")}</span>
            {winnerTeam === "A" && <b className="result-win" style={{ background: "#15985c", color: "#fff" }}>W</b>}
            {winnerTeam === "B" && <b className="result-loss" style={{ background: "#d94d4d", color: "#fff" }}>L</b>}
          </button>

          <button
            type="button"
            className={winnerTeam === "B" ? "winner-option selected" : winnerTeam === "A" ? "winner-option loser-selected" : "winner-option"}
            style={winnerTeam === "A" ? { borderColor: "#e4b8b8", background: "#fff4f4", color: "#a63e3e" } : undefined}
            onClick={() => setWinnerTeam("B")}
          >
            <span>Team B · {selected.slice(2, 4).map(name).join(" & ")}</span>
            {winnerTeam === "B" && <b className="result-win" style={{ background: "#15985c", color: "#fff" }}>W</b>}
            {winnerTeam === "A" && <b className="result-loss" style={{ background: "#d94d4d", color: "#fff" }}>L</b>}
          </button>
        </div>
      </div>}
      <button className="primary-button" disabled={selected.length !== 4 || !winnerTeam} onClick={saveMatch}>Save match</button></Modal>}

    {modal === "pin" && <Modal title="Admin verification" close={() => setModal(null)}><div className="pin-box"><LockKeyhole size={28} /><p>Enter the 6-digit admin PIN.</p><input autoFocus maxLength={6} inputMode="numeric" pattern="[0-9]{6}" type="password" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" />
      <button className="primary-button" disabled={pin.length !== 6} onClick={verify}>Verify</button></div></Modal>}

    {modal === "edit" && targetMatch && <Modal title="Edit Match" close={() => {
      setPin("");
      setVerifiedEditPin("");
      setAdminOK(false);
      setTargetMatch(null);
      setModal(null);
    }}>
      <p className="helper">Admin verified. The match ID remains unchanged.</p>
      <div className="match-preview"><b>{team(targetMatch, "A")}</b><span>vs</span><b>{team(targetMatch, "B")}</b></div>
      <div className="winner-select">
        <div className="helper">Who won?</div>
        <div className="winner-options">
          <button
            type="button"
            className={winnerTeam === "A" ? "winner-option selected" : winnerTeam === "B" ? "winner-option loser-selected" : "winner-option"}
            style={winnerTeam === "B" ? { borderColor: "#e4b8b8", background: "#fff4f4", color: "#a63e3e" } : undefined}
            onClick={() => setWinnerTeam("A")}
          >
            <span>Team A · {team(targetMatch, "A")}</span>
            {winnerTeam === "A" && <b className="result-win" style={{ background: "#15985c", color: "#fff" }}>W</b>}
            {winnerTeam === "B" && <b className="result-loss" style={{ background: "#d94d4d", color: "#fff" }}>L</b>}
          </button>

          <button
            type="button"
            className={winnerTeam === "B" ? "winner-option selected" : winnerTeam === "A" ? "winner-option loser-selected" : "winner-option"}
            style={winnerTeam === "A" ? { borderColor: "#e4b8b8", background: "#fff4f4", color: "#a63e3e" } : undefined}
            onClick={() => setWinnerTeam("B")}
          >
            <span>Team B · {team(targetMatch, "B")}</span>
            {winnerTeam === "B" && <b className="result-win" style={{ background: "#15985c", color: "#fff" }}>W</b>}
            {winnerTeam === "A" && <b className="result-loss" style={{ background: "#d94d4d", color: "#fff" }}>L</b>}
          </button>
        </div>
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

    {modal === "expense" && <Modal title="Add expense" close={() => setModal(null)}><select value={expenseCategory} onChange={e => setExpenseCategory(e.target.value)}><option value="SHUTTLES">🏸 Shuttles</option><option value="BREAKFAST">🍳 Breakfast</option><option value="COFFEE">☕ Coffee</option><option value="OTHER">Other</option></select><input inputMode="decimal" placeholder="Amount ₹" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} /><input placeholder="Description (optional)" value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)} /><p className="helper">Split among</p><div className="selection-grid">{players.map(p => <button key={p.id} className={`player-chip ${split.includes(p.id) ? "selected" : ""}`} onClick={() => setSplit(x => x.includes(p.id) ? x.filter(y => y !== p.id) : [...x, p.id])}>{p.name}</button>)}</div>{split.length > 0 && <div className="split-preview">{money(Number(expenseAmount || 0) / split.length)} each · {split.length} people</div>}<button className="primary-button" onClick={addExpense}>Save expense</button></Modal>}


    {fineDetailsPlayer && <Modal title={`${name(fineDetailsPlayer)} · Fine history`} close={() => setFineDetailsPlayer(null)}>
      <div className="fine-history">
        {attendance.filter(a => a.player_id === fineDetailsPlayer).length === 0 && <div className="empty-card">No fines recorded.</div>}
        {attendance.filter(a => a.player_id === fineDetailsPlayer).map(a => <div className="fine-history-row" key={a.id}>
          <div><b>{a.status === "MISSED" ? "Missed day" : "Late arrival"}</b><small>{new Date(`${a.attendance_date}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}{a.status === "PRESENT" && a.late_minutes ? ` · ${a.late_minutes} min late` : ""}</small></div>
          <strong>{money(Number(a.fine_amount))}</strong>
        </div>)}
      </div>
    </Modal>}
  </main>
}

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" onClick={close}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><div><div className="eyebrow">RALLY365</div><h2>{title}</h2></div><button className="icon-button" onClick={close}><X /></button></div>{children}</div></div> }
