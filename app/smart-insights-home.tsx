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

const dateKey = (value: Date) => {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const playersOn = (match: Match, team: "A" | "B") =>
  match.match_players.filter(row => row.team === team).map(row => row.player_id);

const won = (match: Match, playerId: string) => {
  const row = match.match_players.find(item => item.player_id === playerId);
  if (!row) return false;
  return row.team === "A"
    ? Number(match.team_a_score) > Number(match.team_b_score)
    : Number(match.team_b_score) > Number(match.team_a_score);
};

const margin = (match: Match, playerId: string) => {
  const row = match.match_players.find(item => item.player_id === playerId);
  if (!row) return 0;
  return row.team === "A"
    ? Number(match.team_a_score) - Number(match.team_b_score)
    : Number(match.team_b_score) - Number(match.team_a_score);
};

export default function SmartInsightsHome() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(true);
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
    void load();

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
        .channel("rally365-smart-insights-home")
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `group_id=eq.${group.id}`,
        }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "match_players" }, load)
        .subscribe();
    };
    void connect();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    if (!mounted) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const syncMount = () => {
      const hero = document.querySelector<HTMLElement>(".home-mvp-section");
      const fallback = document.querySelector<HTMLElement>(".home-today-card")?.parentElement;
      const anchor = hero || fallback;
      if (!anchor) {
        setMountNode(null);
        return;
      }

      let node = document.querySelector<HTMLElement>(".smart-insights-home-mount");
      if (!node) {
        node = document.createElement("div");
        node.className = "smart-insights-home-mount";
        anchor.parentElement?.insertBefore(node, anchor.nextSibling);
      }
      setMountNode(node);
    };

    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(syncMount, 60);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    syncMount();

    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      document.querySelector(".smart-insights-home-mount")?.remove();
    };
  }, [mounted]);

  const insights = useMemo(() => {
    const realPlayers = players.filter(player => !isGuest(player.name));
    const name = (id: string) => players.find(player => player.id === id)?.name || "Player";
    const today = dateKey(new Date());
    const valid = matches
      .filter(match =>
        match.status !== "VOIDED" &&
        Number(match.team_a_score) !== Number(match.team_b_score) &&
        match.match_players?.length
      )
      .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime());

    if (!valid.length || !realPlayers.length) return [] as Insight[];

    const candidates: Insight[] = [];
    const add = (value: Insight) => candidates.push(value);
    const todayMatches = valid.filter(match => dateKey(new Date(match.played_at)) === today);

    if (todayMatches.length) {
      const stats = realPlayers
        .map(player => {
          const games = todayMatches.filter(match => match.match_players.some(row => row.player_id === player.id));
          const wins = games.filter(match => won(match, player.id)).length;
          const points = games.reduce((sum, match) => sum + margin(match, player.id), 0);
          return { player, games, wins, points };
        })
        .filter(row => row.games.length);

      const standout = [...stats].sort((a, b) => b.wins - a.wins || b.points - a.points)[0];
      if (standout && standout.games.length >= 2) {
        add({
          icon: "🎯",
          title: "Today's standout",
          tone: "blue",
          category: "today-standout",
          text: `${standout.player.name} is ${standout.wins}-${standout.games.length - standout.wins} today across ${standout.games.length} matches.`,
          score: 130 + standout.wins * 6,
        });
      }

      const close = [...todayMatches]
        .map(match => ({ match, gap: Math.abs(Number(match.team_a_score) - Number(match.team_b_score)) }))
        .sort((a, b) => a.gap - b.gap)[0];
      if (close && close.gap <= 2) {
        const team = Number(close.match.team_a_score) > Number(close.match.team_b_score) ? "A" : "B";
        add({
          icon: "🔥",
          title: "Today's nail-biter",
          tone: "warm",
          category: "today-close",
          text: `${playersOn(close.match, team).map(name).join(" & ")} edged a ${close.gap}-point game today.`,
          score: 125 - close.gap,
        });
      }
    }

    for (const player of realPlayers) {
      const games = valid.filter(match => match.match_players.some(row => row.player_id === player.id));
      if (games.length >= 6) {
        const recent = games.slice(0, 3);
        const previous = games.slice(3, 6);
        const recentRate = recent.filter(match => won(match, player.id)).length / 3;
        const previousRate = previous.filter(match => won(match, player.id)).length / 3;
        const delta = Math.round((recentRate - previousRate) * 100);
        if (Math.abs(delta) >= 34) {
          add({
            icon: delta > 0 ? "📈" : "📉",
            title: delta > 0 ? "Form rising" : "Form slipping",
            tone: delta > 0 ? "blue" : "warm",
            category: delta > 0 ? "form-rise" : "form-drop",
            text: `${player.name} moved from ${Math.round(previousRate * 100)}% to ${Math.round(recentRate * 100)}% wins across the last 3 matches.`,
            score: 105 + Math.abs(delta),
          });
        }

        const recentMargin = recent.reduce((sum, match) => sum + margin(match, player.id), 0) / 3;
        const previousMargin = previous.reduce((sum, match) => sum + margin(match, player.id), 0) / 3;
        const marginChange = recentMargin - previousMargin;
        if (Math.abs(marginChange) >= 2.5) {
          add({
            icon: marginChange > 0 ? "📊" : "📉",
            title: marginChange > 0 ? "Margin improving" : "Margin tightening",
            tone: marginChange > 0 ? "green" : "warm",
            category: "margin",
            text: `${player.name}'s average scoring margin moved from ${previousMargin.toFixed(1)} to ${recentMargin.toFixed(1)} points.`,
            score: 90 + Math.abs(marginChange) * 4,
          });
        }
      }

      let streak = 0;
      for (const match of games) {
        if (!won(match, player.id)) break;
        streak += 1;
      }
      if (streak >= 3) {
        add({
          icon: "⚡",
          title: "Hot streak",
          tone: "purple",
          category: "streak",
          text: `${player.name} has won ${streak} straight matches — the streak is still alive.`,
          score: 88 + Math.min(streak, 10),
        });
      }
    }

    const latest = valid[0];
    if (latest) {
      const gap = Math.abs(Number(latest.team_a_score) - Number(latest.team_b_score));
      const team = Number(latest.team_a_score) > Number(latest.team_b_score) ? "A" : "B";
      add({
        icon: gap <= 2 ? "🔥" : "💥",
        title: gap <= 2 ? "Latest nail-biter" : "Latest result",
        tone: gap <= 2 ? "warm" : "green",
        category: "latest",
        text: `${playersOn(latest, team).map(name).join(" & ")} won the latest game by ${gap} point${gap === 1 ? "" : "s"}.`,
        score: 82,
      });
    }

    const pairStats = new Map<string, { ids: string[]; games: Match[] }>();
    for (const match of valid.slice(0, 30)) {
      for (const team of ["A", "B"] as const) {
        const ids = playersOn(match, team).filter(id => realPlayers.some(player => player.id === id));
        if (ids.length !== 2) continue;
        const key = [...ids].sort().join("|");
        const row = pairStats.get(key) || { ids, games: [] };
        row.games.push(match);
        pairStats.set(key, row);
      }
    }
    for (const pair of pairStats.values()) {
      if (pair.games.length < 3) continue;
      const wins = pair.games.filter(match => won(match, pair.ids[0])).length;
      const rate = wins / pair.games.length;
      if (rate < 0.67) continue;
      add({
        icon: "🤝",
        title: "Partnership edge",
        tone: "green",
        category: "partnership",
        text: `${name(pair.ids[0])} & ${name(pair.ids[1])} won ${wins} of their last ${pair.games.length} together.`,
        score: 75 + rate * 20,
      });
    }

    const daySeed = Number(today.replace(/-/g, "")) || 0;
    candidates.forEach((candidate, index) => {
      candidate.score += ((daySeed + index * 17) % 7) * 0.05;
    });
    candidates.sort((a, b) => b.score - a.score);

    const selected: Insight[] = [];
    const categories = new Set<string>();
    for (const candidate of candidates) {
      if (categories.has(candidate.category)) continue;
      selected.push(candidate);
      categories.add(candidate.category);
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
          <small className="smart-insights-note">Insights recalculate from today's games, the latest result and your Rally365 history.</small>
        </>
      )}
    </section>,
    mountNode
  );
}
