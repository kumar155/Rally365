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
  const value = name.trim().toLowerCase();
  return value === "guest" || /^guest\d+$/.test(value) || value.startsWith("guest ");
};

const localDateKey = (value: Date) => {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const sideWon = (match: Match, playerId: string) => {
  const row = match.match_players.find(item => item.player_id === playerId);
  if (!row) return false;
  return row.team === "A"
    ? Number(match.team_a_score) > Number(match.team_b_score)
    : Number(match.team_b_score) > Number(match.team_a_score);
};

const teamPlayers = (match: Match, team: "A" | "B") =>
  match.match_players.filter(item => item.team === team).map(item => item.player_id);

const marginForPlayer = (match: Match, playerId: string) => {
  const row = match.match_players.find(item => item.player_id === playerId);
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
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `group_id=eq.${group.id}`,
        }, load)
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
    const realPlayers = players.filter(player => !isGuest(player.name));
    const name = (id: string) => players.find(player => player.id === id)?.name || "Player";
    const todayKey = localDateKey(new Date());
    const valid = matches
      .filter(match =>
        match.status !== "VOIDED" &&
        Number(match.team_a_score) !== Number(match.team_b_score) &&
        match.match_players?.length
      )
      .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime());

    if (!valid.length) return [] as Insight[];

    const todayMatches = valid.filter(match => localDateKey(new Date(match.played_at)) === todayKey);
    const candidates: Insight[] = [];
    const add = (candidate: Omit<Insight, "score"> & { score: number }) => candidates.push(candidate);

    // Daily signals are based on today's actual games, so new games can change the cards immediately.
    if (todayMatches.length) {
      const todayPlayerStats = realPlayers.map(player => {
        const games = todayMatches.filter(match => match.match_players.some(item => item.player_id === player.id));
        const wins = games.filter(match => sideWon(match, player.id)).length;
        const margin = games.reduce((sum, match) => sum + marginForPlayer(match, player.id), 0);
        return { player, games, wins, margin };
      }).filter(row => row.games.length > 0);

      const standout = [...todayPlayerStats]
        .sort((a, b) => b.wins - a.wins || b.margin - a.margin || b.games.length - a.games.length)[0];
      if (standout && standout.games.length >= 2) {
        add({
          icon: "🎯",
          title: "Today's standout",
          tone: "blue",
          category: "today-standout",
          text: `${standout.player.name} is ${standout.wins}-${standout.games.length - standout.wins} today across ${standout.games.length} matches.`,
          score: 125 + standout.wins * 5 + standout.games.length,
        });
      }

      const close = [...todayMatches]
        .map(match => ({ match, margin: Math.abs(Number(match.team_a_score) - Number(match.team_b_score)) }))
        .filter(row => row.margin <= 2)
        .sort((a, b) => a.margin - b.margin)[0];
      if (close) {
        const winner = close.match.team_a_score > close.match.team_b_score ? "A" : "B";
        add({
          icon: "🔥",
          title: "Today's nail-biter",
          tone: "warm",
          category: "today-close",
          text: `${teamPlayers(close.match, winner).map(name).join(" & ")} edged a ${close.margin}-point game today.`,
          score: 122 - close.margin,
        });
      }

      const todayPairs = new Map<string, { ids: string[]; games: Match[] }>();
      for (const match of todayMatches) {
        for (const side of ["A", "B"] as const) {
          const ids = teamPlayers(match, side).filter(id => realPlayers.some(player => player.id === id));
          if (ids.length !== 2) continue;
          const key = [...ids].sort().join("|");
          const row = todayPairs.get(key) || { ids: [...ids], games: [] };
          row.games.push(match);
          todayPairs.set(key, row);
        }
      }
      const bestPair = [...todayPairs.values()]
        .map(pair => ({ ...pair, wins: pair.games.filter(game => sideWon(game, pair.ids[0])).length }))
        .filter(pair => pair.games.length >= 2)
        .sort((a, b) => b.wins - a.wins || b.games.length - a.games.length)[0];
      if (bestPair) {
        add({
          icon: "🤝",
          title: "Today's winning duo",
          tone: "green",
          category: "today-duo",
          text: `${name(bestPair.ids[0])} & ${name(bestPair.ids[1])} are ${bestPair.wins}-${bestPair.games.length - bestPair.wins} together today.`,
          score: 118 + bestPair.wins * 6 + bestPair.games.length,
        });
      }

      const strongest = [...todayPlayerStats].sort((a, b) => b.margin - a.margin)[0];
      if (strongest && strongest.margin >= 6) {
        add({
          icon: "💥",
          title: "Today's scoring edge",
          tone: "purple",
          category: "today-margin",
          text: `${strongest.player.name} has a +${strongest.margin} combined scoring margin today.`,
          score: 110 + Math.min(strongest.margin, 15),
        });
      }
    }

    // Form shift: compare the latest three results with the previous three.
    for (const player of realPlayers) {
      const games = valid.filter(match => match.match_players.some(item => item.player_id === player.id));
      if (games.length < 6) continue;
      const recent = games.slice(0, 3);
      const previous = games.slice(3, 6);
      const recentRate = recent.filter(match => sideWon(match, player.id)).length / 3;
      const previousRate = previous.filter(match => sideWon(match, player.id)).length / 3;
      const delta = Math.round((recentRate - previousRate) * 100);
      if (Math.abs(delta) < 34) continue;
      add({
        icon: delta > 0 ? "📈" : "📉",
        title: delta > 0 ? "Form rising" : "Form slipping",
        tone: delta > 0 ? "blue" : "warm",
        category: delta > 0 ? "form-rise" : "form-drop",
        text: `${player.name} moved from ${Math.round(previousRate * 100)}% to ${Math.round(recentRate * 100)}% wins across the last 3 matches.`,
        score: 96 + Math.abs(delta),
      });
    }

    // Current streak, using all valid history but ignoring voided games.
    for (const player of realPlayers) {
      const games = valid.filter(match => match.match_players.some(item => item.player_id === player.id));
      let streak = 0;
      for (const match of games) {
        if (!sideWon(match, player.id)) break;
        streak++;
      }
      if (streak >= 3) {
        add({
          icon: "⚡",
          title: "Hot streak",
          tone: "purple",
          category: "streak",
          text: `${player.name} has won ${streak} straight matches — the streak is still alive.`,
          score: 88 + Math.min(streak, 8),
        });
      }
    }

    // Recent partnership strength, limited to the latest 30 valid games.
    const pairStats = new Map<string, { ids: string[]; games: Match[] }>();
    for (const match of valid.slice(0, 30)) {
      for (const side of ["A", "B"] as const) {
        const ids = teamPlayers(match, side).filter(id => realPlayers.some(player => player.id === id));
        if (ids.length !== 2) continue;
        const key = [...ids].sort().join("|");
        const row = pairStats.get(key) || { ids: [...ids], games: [] };
        row.games.push(match);
        pairStats.set(key, row);
      }
    }
    for (const pair of pairStats.values()) {
      if (pair.games.length < 3) continue;
      const wins = pair.games.filter(match => sideWon(match, pair.ids[0])).length;
      const rate = wins / pair.games.length;
      if (rate < 0.67) continue;
      const ageDays = Math.max(0, (Date.now() - new Date(pair.games[0].played_at).getTime()) / 86400000);
      add({
        icon: "🤝",
        title: "Partnership edge",
        tone: "green",
        category: "partnership",
        text: `${name(pair.ids[0])} & ${name(pair.ids[1])} won ${wins} of their last ${pair.games.length} together.`,
        score: 72 + Math.round(rate * 15) + Math.max(0, 12 - ageDays),
      });
    }

    // Recent upset based on pre-match win rates.
    const wins = new Map<string, number>();
    const played = new Map<string, number>();
    const orderedAsc = [...valid].sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime());
    const recentUpsets: { label: string; gap: number; ageDays: number }[] = [];
    for (const match of orderedAsc) {
      const a = teamPlayers(match, "A");
      const b = teamPlayers(match, "B");
      if (!a.length || !b.length) continue;
      const strength = (ids: string[]) => ids.reduce((sum, id) => sum + ((wins.get(id) || 0) / Math.max(1, played.get(id) || 1)), 0) / ids.length;
      const aStrength = strength(a);
      const bStrength = strength(b);
      const winnerTeam = Number(match.team_a_score) > Number(match.team_b_score) ? "A" : "B";
      const winnerStrength = winnerTeam === "A" ? aStrength : bStrength;
      const loserStrength = winnerTeam === "A" ? bStrength : aStrength;
      if (loserStrength - winnerStrength >= 0.18) {
        const winnerIds = winnerTeam === "A" ? a : b;
        const loserIds = winnerTeam === "A" ? b : a;
        const ageDays = Math.max(0, (Date.now() - new Date(match.played_at).getTime()) / 86400000);
        recentUpsets.push({
          label: `${winnerIds.map(name).join(" & ")} beat ${loserIds.map(name).join(" & ")}`,
          gap: loserStrength - winnerStrength,
          ageDays,
        });
      }
      for (const id of [...a, ...b]) {
        played.set(id, (played.get(id) || 0) + 1);
        const team = a.includes(id) ? "A" : "B";
        if (team === winnerTeam) wins.set(id, (wins.get(id) || 0) + 1);
      }
    }
    const upset = recentUpsets.sort((a, b) => a.ageDays - b.ageDays || b.gap - a.gap)[0];
    if (upset) {
      add({
        icon: "😈",
        title: "Giant killer",
        tone: "warm",
        category: "upset",
        text: `${upset.label} — a recent upset against the side with the stronger pre-match record.`,
        score: 100 - Math.min(35, upset.ageDays * 2) + upset.gap * 20,
      });
    }

    // Margin trend detects a real scoring change rather than repeating win rate.
    for (const player of realPlayers) {
      const games = valid.filter(match => match.match_players.some(item => item.player_id === player.id));
      if (games.length < 6) continue;
      const recent = games.slice(0, 3).map(match => marginForPlayer(match, player.id));
      const previous = games.slice(3, 6).map(match => marginForPlayer(match, player.id));
      const recentAvg = recent.reduce((a, b) => a + b, 0) / 3;
      const previousAvg = previous.reduce((a, b) => a + b, 0) / 3;
      const change = recentAvg - previousAvg;
      if (Math.abs(change) < 2.5) continue;
      add({
        icon: change > 0 ? "📊" : "📉",
        title: change > 0 ? "Margin improving" : "Margin tightening",
        tone: change > 0 ? "blue" : "warm",
        category: "margin",
        text: `${player.name}'s average scoring margin moved from ${previousAvg.toFixed(1)} to ${recentAvg.toFixed(1)} points across the last 3 matches.`,
        score: 70 + Math.abs(change) * 5,
      });
    }

    // Latest-game signal gives the cards immediate freshness after a new result.
    const latest = valid[0];
    const latestMargin = Math.abs(Number(latest.team_a_score) - Number(latest.team_b_score));
    const latestAgeHours = Math.max(0, (Date.now() - new Date(latest.played_at).getTime()) / 3600000);
    if (latestMargin <= 2) {
      const winner = latest.team_a_score > latest.team_b_score ? "A" : "B";
      add({
        icon: "🔥",
        title: "Latest nail-biter",
        tone: "warm",
        category: "latest-shape",
        text: `${teamPlayers(latest, winner).map(name).join(" & ")} edged the latest game by ${latestMargin} point${latestMargin === 1 ? "" : "s"}.`,
        score: 90 - latestAgeHours / 6,
      });
    } else if (latestMargin >= 8) {
      const winner = latest.team_a_score > latest.team_b_score ? "A" : "B";
      add({
        icon: "💥",
        title: "Latest statement",
        tone: "green",
        category: "latest-shape",
        text: `${teamPlayers(latest, winner).map(name).join(" & ")} won the latest game by ${latestMargin} points.`,
        score: 88 - latestAgeHours / 6,
      });
    }

    // Milestones are only shown when someone is genuinely close.
    for (const player of realPlayers) {
      const games = valid.filter(match => match.match_players.some(item => item.player_id === player.id));
      const playerWins = games.filter(match => sideWon(match, player.id)).length;
      const target = [10, 25, 50].find(value => playerWins < value && value - playerWins <= 2);
      if (!target) continue;
      const remaining = target - playerWins;
      add({
        icon: "🏆",
        title: "Milestone close",
        tone: "blue",
        category: "milestone",
        text: `${player.name} needs just ${remaining} more win${remaining === 1 ? "" : "s"} to reach ${target} career wins.`,
        score: 68 + (3 - remaining) * 8,
      });
    }

    // Small deterministic daily tie-break prevents the same historical cards from winning every day.
    const daySeed = Number(todayKey.replace(/-/g, "")) || 0;
    candidates.forEach((candidate, index) => {
      candidate.score += ((daySeed + index * 17) % 7) * 0.05;
    });
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
      <button type="button" className="smart-insights-heading" onClick={() => setOpen(value => !value)} aria-expanded={open}>
        <div>
          <div className="eyebrow">RALLY365 INTELLIGENCE</div>
          <h2>Smart insights</h2>
        </div>
        <span className="smart-insights-toggle"><span aria-hidden="true">✦</span><span aria-hidden="true">⌄</span></span>
      </button>
      {open && (
        <>
          <div className="smart-insights-grid">
            {insights.map((insight, index) => (
              <div className={`smart-insight smart-insight-${insight.tone}`} key={`${insight.category}-${index}`}>
                <span className="smart-insight-icon">{insight.icon}</span>
                <div><strong>{insight.title}</strong><p>{insight.text}</p></div>
              </div>
            ))}
          </div>
          <small className="smart-insights-note">Insights are recalculated from the latest results, today's games and your Rally365 history.</small>
        </>
      )}
    </section>,
    mountNode
  );
}

export default SmartInsightsLive;
