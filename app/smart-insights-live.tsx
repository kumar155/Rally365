"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";

type Player = { id: string; name: string };
type MatchPlayer = { player_id: string; team: "A" | "B" };
type Match = {
  id: string;
  team_a_score: number;
  team_b_score: number;
  played_at: string;
  status: string;
  match_players: MatchPlayer[];
};

type Insight = {
  icon: string;
  title: string;
  text: string;
  tone: "warm" | "green" | "purple" | "blue";
  category: string;
  score: number;
};

const isGuest = (name: string) => {
  const n = name.trim().toLowerCase();
  return n === "guest" || /^guest\d+$/.test(n) || n.startsWith("guest ");
};

const localDateKey = (value: Date) => {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const sideWon = (match: Match, playerId: string) => {
  const row = match.match_players.find(x => x.player_id === playerId);
  if (!row) return false;
  return row.team === "A"
    ? Number(match.team_a_score) > Number(match.team_b_score)
    : Number(match.team_b_score) > Number(match.team_a_score);
};

const teamPlayers = (match: Match, team: "A" | "B") =>
  match.match_players.filter(x => x.team === team).map(x => x.player_id);

const marginForPlayer = (match: Match, playerId: string) => {
  const row = match.match_players.find(x => x.player_id === playerId);
  if (!row) return 0;
  return row.team === "A"
    ? Number(match.team_a_score) - Number(match.team_b_score)
    : Number(match.team_b_score) - Number(match.team_a_score);
};

function SmartInsightsLive() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [open, setOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  const load = useCallback(async () => {
    const { data: group } = await supabase
      .from("groups")
      .select("id")
      .eq("join_code", "RALLY365")
      .single();
    if (!group) return;

    const [{ data: playerRows }, { data: matchRows }] = await Promise.all([
      supabase.from("players").select("id,name").eq("group_id", group.id).order("name"),
      supabase
        .from("matches")
        .select("id,team_a_score,team_b_score,played_at,status,match_players(player_id,team)")
        .eq("group_id", group.id)
        .order("played_at", { ascending: false }),
    ]);

    setPlayers((playerRows || []) as Player[]);
    setMatches((matchRows || []) as Match[]);
  }, []);

  useEffect(() => {
    setMounted(true);
    load();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const connect = async () => {
      const { data: group } = await supabase
        .from("groups")
        .select("id")
        .eq("join_code", "RALLY365")
        .single();
      if (!group || cancelled) return;
      channel = supabase
        .channel("rally365-smart-insights-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `group_id=eq.${group.id}` }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "match_players" }, load)
        .subscribe();
    };
    connect();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    if (!mounted) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const syncDom = () => {
      const legacy = document.querySelector<HTMLElement>(".smart-insights-card");
      const hero = document.querySelector<HTMLElement>(".home-mvp-section");
      const eyebrow = document.querySelector<HTMLElement>(".home-today-card .eyebrow");
      const isToday = eyebrow?.textContent?.trim() === "TODAY";

      if (legacy) legacy.style.display = "none";

      if (!hero || !isToday) {
        setMountNode(null);
        return;
      }

      let node = document.querySelector<HTMLElement>(".smart-insights-live-mount");
      if (!node) {
        node = document.createElement("div");
        node.className = "smart-insights-live-mount";
        hero.parentElement?.insertBefore(node, hero.nextSibling);
      }
      setMountNode(node);
    };

    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(syncDom, 60);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    syncDom();

    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      document.querySelector(".smart-insights-live-mount")?.remove();
    };
  }, [mounted, matches]);

  const insights = useMemo(() => {
    const realPlayers = players.filter(p => !isGuest(p.name));
    const name = (id: string) => players.find(p => p.id === id)?.name || "Player";
    const valid = matches
      .filter(m => m.status !== "VOIDED" && Number(m.team_a_score) !== Number(m.team_b_score) && m.match_players?.length)
      .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime());

    if (!valid.length) return [] as Insight[];

    const candidates: Insight[] = [];
    const add = (candidate: Omit<Insight, "score">) => candidates.push({ ...candidate, score: candidate.score });

    // 1. Form change: compare the last three results with the previous three.
    for (const p of realPlayers) {
      const pm = valid.filter(m => m.match_players.some(x => x.player_id === p.id));
      if (pm.length < 6) continue;
      const recent = pm.slice(0, 3);
      const previous = pm.slice(3, 6);
      const recentRate = recent.filter(m => sideWon(m, p.id)).length / 3;
      const previousRate = previous.filter(m => sideWon(m, p.id)).length / 3;
      const delta = Math.round((recentRate - previousRate) * 100);
      if (Math.abs(delta) < 34) continue;
      if (delta > 0) {
        add({ icon: "📈", title: "Form rising", tone: "blue", category: "form-rise", text: `${p.name} improved from ${Math.round(previousRate * 100)}% to ${Math.round(recentRate * 100)}% wins across the last 3 matches.`, score: 95 + delta });
      } else {
        add({ icon: "📉", title: "Form slipping", tone: "warm", category: "form-drop", text: `${p.name}'s win rate dropped from ${Math.round(previousRate * 100)}% to ${Math.round(recentRate * 100)}% across the last 3 matches.`, score: 92 + Math.abs(delta) });
      }
    }

    // 2. Current streak, but only when it is genuinely meaningful.
    for (const p of realPlayers) {
      const pm = valid.filter(m => m.match_players.some(x => x.player_id === p.id));
      let streak = 0;
      for (const m of pm) {
        if (!sideWon(m, p.id)) break;
        streak++;
      }
      if (streak >= 3) {
        add({ icon: "⚡", title: "Hot streak", tone: "purple", category: "streak", text: `${p.name} has won ${streak} straight matches — the streak is still alive.`, score: 88 + Math.min(streak, 8) });
      }
    }

    // 3. Recent partnership strength, not simply the duo with the most wins ever.
    const pairStats = new Map<string, { ids: string[]; matches: Match[] }>();
    for (const m of valid.slice(0, 30)) {
      for (const side of ["A", "B"] as const) {
        const ids = teamPlayers(m, side).filter(id => realPlayers.some(p => p.id === id));
        if (ids.length !== 2) continue;
        const key = [...ids].sort().join("|");
        const current = pairStats.get(key) || { ids: [...ids], matches: [] };
        current.matches.push(m);
        pairStats.set(key, current);
      }
    }
    for (const pair of pairStats.values()) {
      if (pair.matches.length < 3) continue;
      const wins = pair.matches.filter(m => sideWon(m, pair.ids[0])).length;
      const rate = wins / pair.matches.length;
      if (rate < 0.67) continue;
      const latest = new Date(pair.matches[0].played_at).getTime();
      const ageDays = Math.max(0, (Date.now() - latest) / 86400000);
      add({ icon: "🤝", title: "Partnership edge", tone: "green", category: "partnership", text: `${name(pair.ids[0])} & ${name(pair.ids[1])} won ${wins} of their last ${pair.matches.length} together.`, score: 72 + Math.round(rate * 15) + Math.max(0, 12 - ageDays) });
    }

    // 4. Recent rivalry swing: compare the latest five encounters with the previous five.
    const pairMeetings = new Map<string, { a: string; b: string; results: { winner: string; playedAt: number }[] }>();
    for (const m of valid) {
      const a = teamPlayers(m, "A").filter(id => realPlayers.some(p => p.id === id));
      const b = teamPlayers(m, "B").filter(id => realPlayers.some(p => p.id === id));
      for (const pa of a) for (const pb of b) {
        const key = [pa, pb].sort().join("|");
        const current = pairMeetings.get(key) || { a: pa, b: pb, results: [] };
        current.results.push({ winner: m.team_a_score > m.team_b_score ? "A" : "B", playedAt: new Date(m.played_at).getTime() });
        pairMeetings.set(key, current);
      }
    }
    for (const h2h of pairMeetings.values()) {
      if (h2h.results.length < 6) continue;
      const recent = h2h.results.slice(0, 3);
      const previous = h2h.results.slice(3, 6);
      const winsForA = (rows: typeof recent) => rows.filter(r => r.winner === "A").length;
      const recentA = winsForA(recent) / 3;
      const previousA = winsForA(previous) / 3;
      const delta = Math.round(Math.abs(recentA - previousA) * 100);
      if (delta < 34) continue;
      const leader = recentA > 0.5 ? h2h.a : h2h.b;
      const trailer = recentA > 0.5 ? h2h.b : h2h.a;
      add({ icon: "⚔️", title: "Rivalry shift", tone: "purple", category: "rivalry", text: `${name(leader)} has taken the recent edge over ${name(trailer)} after a ${delta}-point swing in their last 3 vs previous 3 encounters.`, score: 78 + delta / 4 });
    }

    // 5. Recent giant-killer detection uses pre-match win rates, so old upsets do not live forever.
    const wins = new Map<string, number>();
    const played = new Map<string, number>();
    const orderedAsc = [...valid].sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime());
    const recentUpsets: { label: string; gap: number; ageDays: number }[] = [];
    for (const m of orderedAsc) {
      const a = teamPlayers(m, "A");
      const b = teamPlayers(m, "B");
      if (!a.length || !b.length) continue;
      const aStrength = a.reduce((s, id) => s + ((wins.get(id) || 0) / Math.max(1, played.get(id) || 1)), 0) / a.length;
      const bStrength = b.reduce((s, id) => s + ((wins.get(id) || 0) / Math.max(1, played.get(id) || 1)), 0) / b.length;
      const winnerTeam = Number(m.team_a_score) > Number(m.team_b_score) ? "A" : "B";
      const winnerStrength = winnerTeam === "A" ? aStrength : bStrength;
      const loserStrength = winnerTeam === "A" ? bStrength : aStrength;
      if (loserStrength - winnerStrength >= 0.18) {
        const winnerIds = winnerTeam === "A" ? a : b;
        const loserIds = winnerTeam === "A" ? b : a;
        const ageDays = Math.max(0, (Date.now() - new Date(m.played_at).getTime()) / 86400000);
        recentUpsets.push({ label: `${winnerIds.map(name).join(" & ")} beat ${loserIds.map(name).join(" & ")}`, gap: loserStrength - winnerStrength, ageDays });
      }
      for (const id of [...a, ...b]) {
        played.set(id, (played.get(id) || 0) + 1);
        const team = a.includes(id) ? "A" : "B";
        const won = team === winnerTeam;
        if (won) wins.set(id, (wins.get(id) || 0) + 1);
      }
    }
    const upset = recentUpsets.sort((x, y) => x.ageDays - y.ageDays || y.gap - x.gap)[0];
    if (upset) {
      add({ icon: "😈", title: "Giant killer", tone: "warm", category: "upset", text: `${upset.label} — a recent upset against a side with the stronger pre-match record.`, score: 100 - Math.min(35, upset.ageDays * 2) + upset.gap * 20 });
    }

    // 6. Scoring trend: surface a real change in margins instead of repeating win rate.
    for (const p of realPlayers) {
      const pm = valid.filter(m => m.match_players.some(x => x.player_id === p.id));
      if (pm.length < 6) continue;
      const recent = pm.slice(0, 3).map(m => marginForPlayer(m, p.id));
      const previous = pm.slice(3, 6).map(m => marginForPlayer(m, p.id));
      const recentAvg = recent.reduce((a, b) => a + b, 0) / 3;
      const previousAvg = previous.reduce((a, b) => a + b, 0) / 3;
      const change = recentAvg - previousAvg;
      if (Math.abs(change) < 2.5) continue;
      add({ icon: change > 0 ? "📊" : "📉", title: change > 0 ? "Margin improving" : "Margin tightening", tone: change > 0 ? "blue" : "warm", category: "margin", text: `${p.name}'s average scoring margin moved from ${previousAvg.toFixed(1)} to ${recentAvg.toFixed(1)} points across the last 3 matches.`, score: 70 + Math.abs(change) * 5 });
    }

    // 7. A genuinely recent close/dominant match gives the cards another source of novelty.
    const latest = valid[0];
    const latestMargin = Math.abs(Number(latest.team_a_score) - Number(latest.team_b_score));
    const latestAge = Math.max(0, (Date.now() - new Date(latest.played_at).getTime()) / 86400000);
    if (latestMargin <= 2) {
      add({ icon: "🔥", title: "Nail-biter", tone: "warm", category: "match-shape", text: `${teamPlayers(latest, latest.team_a_score > latest.team_b_score ? "A" : "B").map(name).join(" & ")} edged a match by just ${latestMargin} point${latestMargin === 1 ? "" : "s"}.`, score: 88 - latestAge });
    } else if (latestMargin >= 8) {
      const winner = latest.team_a_score > latest.team_b_score ? "A" : "B";
      add({ icon: "💥", title: "Statement win", tone: "green", category: "match-shape", text: `${teamPlayers(latest, winner).map(name).join(" & ")} won the latest match by ${latestMargin} points.`, score: 82 - latestAge });
    }

    // 8. Milestones are only shown when someone is genuinely close; this replaces the old always-on fallback.
    for (const p of realPlayers) {
      const pm = valid.filter(m => m.match_players.some(x => x.player_id === p.id));
      const pWins = pm.filter(m => sideWon(m, p.id)).length;
      const target = [10, 25, 50].find(n => pWins < n && n - pWins <= 2);
      if (target) {
        const remaining = target - pWins;
        add({ icon: "🏆", title: "Milestone close", tone: "blue", category: "milestone", text: `${p.name} needs just ${remaining} more win${remaining === 1 ? "" : "s"} to reach ${target} career wins.`, score: 68 + (3 - remaining) * 8 });
      }
    }

    // Prefer recent and meaningful changes, then enforce category diversity.
    candidates.sort((a, b) => b.score - a.score);
    const selected: Insight[] = [];
    const used = new Set<string>();
    for (const candidate of candidates) {
      if (used.has(candidate.category)) continue;
      selected.push(candidate);
      used.add(candidate.category);
      if (selected.length === 4) break;
    }

    return selected;
  }, [players, matches]);

  if (!mounted || !mountNode || !insights.length) return null;

  return createPortal(
    <section className={`smart-insights-card ${open ? "open" : "collapsed"}`}>
      <button type="button" className="smart-insights-heading" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <div><div className="eyebrow">RALLY365 INTELLIGENCE</div><h2>Smart insights</h2></div>
        <span className="smart-insights-toggle"><span aria-hidden="true">✦</span><span aria-hidden="true">⌄</span></span>
      </button>
      {open && <>
        <div className="smart-insights-grid">
          {insights.map((insight, index) => (
            <div className={`smart-insight smart-insight-${insight.tone}`} key={`${insight.category}-${index}`}>
              <span className="smart-insight-icon">{insight.icon}</span>
              <div><strong>{insight.title}</strong><p>{insight.text}</p></div>
            </div>
          ))}
        </div>
        <small className="smart-insights-note">Insights are recalculated from your latest match results and recent Rally365 history.</small>
      </>}
    </section>,
    mountNode
  );
}

export default SmartInsightsLive;
