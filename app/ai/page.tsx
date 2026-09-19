"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bot, Send, Sparkles, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type Player = { id: string; name: string };
type Match = {
  id: string;
  team_a_score: number;
  team_b_score: number;
  played_at: string;
  status: string;
  match_players: { player_id: string; team: "A" | "B" }[];
};

const CODE = "RALLY365";

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

export default function RallyAiPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<{ role: "ai" | "user"; text: string }[]>([
    { role: "ai", text: "Ask me anything about your Rally365 games, players, partnerships or rivalries." },
  ]);
  const [loading, setLoading] = useState(true);
  const [answering, setAnswering] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: group } = await supabase.from("groups").select("id").eq("join_code", CODE).single();
      if (!group) { setLoading(false); return; }
      setGroupId(group.id);
      const [p, m] = await Promise.all([
        supabase.from("players").select("id,name").eq("group_id", group.id).order("name"),
        supabase.from("matches").select("id,team_a_score,team_b_score,played_at,status,match_players(player_id,team)").eq("group_id", group.id).order("played_at", { ascending: false }),
      ]);
      setPlayers(p.data || []);
      setMatches((m.data || []) as Match[]);
      setLoading(false);
    };
    load();
  }, []);

  const nameById = useMemo(() => new Map(players.map(p => [p.id, p.name])), [players]);
  const validMatches = useMemo(() => matches.filter(m => m.status !== "VOIDED"), [matches]);

  const playerStats = (player: Player) => {
    let wins = 0;
    let losses = 0;
    validMatches.forEach(m => {
      const row = m.match_players.find(x => x.player_id === player.id);
      if (!row) return;
      const own = row.team === "A" ? m.team_a_score : m.team_b_score;
      const opp = row.team === "A" ? m.team_b_score : m.team_a_score;
      if (own > opp) wins++; else if (own < opp) losses++;
    });
    return { matches: wins + losses, wins, losses, winRate: wins + losses ? Math.round(wins / (wins + losses) * 100) : 0 };
  };

  const bestPartner = (playerId: string) => {
    const pairs = new Map<string, { matches: number; wins: number }>();
    validMatches.forEach(m => {
      const row = m.match_players.find(x => x.player_id === playerId);
      if (!row) return;
      const partner = m.match_players.find(x => x.team === row.team && x.player_id !== playerId);
      if (!partner) return;
      const item = pairs.get(partner.player_id) || { matches: 0, wins: 0 };
      item.matches++;
      const own = row.team === "A" ? m.team_a_score : m.team_b_score;
      const opp = row.team === "A" ? m.team_b_score : m.team_a_score;
      if (own > opp) item.wins++;
      pairs.set(partner.player_id, item);
    });
    return [...pairs.entries()].sort((a, b) => b[1].wins - a[1].wins || b[1].matches - a[1].matches)[0];
  };

  const streak = (playerId: string) => {
    let count = 0;
    for (const m of validMatches) {
      const row = m.match_players.find(x => x.player_id === playerId);
      if (!row) continue;
      const own = row.team === "A" ? m.team_a_score : m.team_b_score;
      const opp = row.team === "A" ? m.team_b_score : m.team_a_score;
      if (own > opp) count++; else break;
    }
    return count;
  };

  const answerQuery = (raw: string) => {
    const q = normalize(raw);
    if (!q) return "Try asking something like “How am I doing?”, “Who is the best partner for Ravi?”, “Who has the most wins?” or “Show me recent matches.”";

    // Resolve every player explicitly mentioned in the question. When two players
    // are named, keep both names as context instead of falling back to a single
    // player's generic insight.
    const mentionedPlayers = players.filter(p => q.includes(normalize(p.name)));
    const mentioned = mentionedPlayers[0];
    const subject = mentioned || players[0];

    const playerMatches = (playerId: string) =>
      validMatches.filter(m => m.match_players.some(x => x.player_id === playerId));

    const describeMatch = (m: Match) => {
      const a = m.match_players.filter(x => x.team === "A").map(x => nameById.get(x.player_id) || "?").join(" & ");
      const b = m.match_players.filter(x => x.team === "B").map(x => nameById.get(x.player_id) || "?").join(" & ");
      const winner = m.team_a_score > m.team_b_score ? a : b;
      const loser = m.team_a_score > m.team_b_score ? b : a;
      return `${a} ${m.team_a_score}–${m.team_b_score} ${b} · ${winner} won`;
    };

    const statsForMatches = (playerId: string, scopedMatches: Match[]) => {
      let wins = 0;
      let losses = 0;
      scopedMatches.forEach(m => {
        const row = m.match_players.find(x => x.player_id === playerId);
        if (!row) return;
        const own = row.team === "A" ? m.team_a_score : m.team_b_score;
        const opp = row.team === "A" ? m.team_b_score : m.team_a_score;
        if (own > opp) wins++;
        else if (own < opp) losses++;
      });
      const total = wins + losses;
      return { matches: total, wins, losses, winRate: total ? Math.round(wins / total * 100) : 0 };
    };

    const pairStats = (firstId: string, secondId: string) => {
      let matchesTogether = 0;
      let wins = 0;
      let losses = 0;

      validMatches.forEach(m => {
        const first = m.match_players.find(x => x.player_id === firstId);
        const second = m.match_players.find(x => x.player_id === secondId);
        if (!first || !second || first.team !== second.team) return;
        matchesTogether++;
        const own = first.team === "A" ? m.team_a_score : m.team_b_score;
        const opp = first.team === "A" ? m.team_b_score : m.team_a_score;
        if (own > opp) wins++;
        else if (own < opp) losses++;
      });
      return { matchesTogether, wins, losses };
    };

    // Handle an explicitly requested window first. This prevents phrases such as
    // “last 10 matches stats” from falling through to the all-time stats branch.
    const requestedCountMatch = q.match(/\b(?:last|recent)\s+(\d+)\b/);
    const requestedCount = requestedCountMatch ? Math.max(1, Number(requestedCountMatch[1])) : null;
    const asksStats = /(stats|statistics|record|performance|win rate|wins|losses)/.test(q);
    const asksRecent = /(recent|latest|last|most recent)/.test(q);

    if (requestedCount && subject && asksRecent && asksStats) {
      const scoped = playerMatches(subject.id).slice(0, requestedCount);
      if (!scoped.length) return `${subject.name} has no completed matches in the recorded Rally365 history.`;
      const s = statsForMatches(subject.id, scoped);
      return `${subject.name}'s last ${scoped.length} matches: ${s.wins} wins, ${s.losses} losses (${s.winRate}% win rate).`;
    }

    if (asksRecent && subject && /(match|game)/.test(q) && !asksStats) {
      const count = requestedCount || 5;
      const recent = playerMatches(subject.id).slice(0, count);
      if (!recent.length) return `${subject.name} has no completed matches in the recorded Rally365 history.`;
      return `${subject.name}'s ${recent.length} most recent matches:\n` + recent.map((m, i) => `M${validMatches.indexOf(m) >= 0 ? validMatches.length - validMatches.indexOf(m) : "?"}: ${describeMatch(m)}`).join("\n");
    }

    if (/(partnership|partners|partner|duo|pair)/.test(q) && mentionedPlayers.length >= 2) {
      const first = mentionedPlayers[0];
      const second = mentionedPlayers[1];
      const pair = pairStats(first.id, second.id);
      const rate = pair.matchesTogether ? Math.round(pair.wins / pair.matchesTogether * 100) : 0;
      if (!pair.matchesTogether) {
        return `${first.name} and ${second.name} have not played together as a partnership in the recorded Rally365 match history.`;
      }
      return `${first.name} and ${second.name} have played together ${pair.matchesTogether} ${pair.matchesTogether === 1 ? "match" : "matches"}: ${pair.wins} wins and ${pair.losses} losses (${rate}% win rate).`;
    }

    if (/(best partner|best duo|partner|pair)/.test(q) && subject) {
      const result = bestPartner(subject.id);
      if (!result) return `${subject.name} does not have enough team history yet for a partner insight.`;
      const partner = nameById.get(result[0]) || "Unknown";
      const rate = result[1].matches ? Math.round(result[1].wins / result[1].matches * 100) : 0;
      return `${subject.name}'s strongest historical partner is ${partner}: ${result[1].wins} wins in ${result[1].matches} matches together (${rate}% win rate).`;
    }

    if (/(most wins|highest wins|top player|leader|leaderboard)/.test(q)) {
      const ranked = players.map(p => ({ p, ...playerStats(p) })).sort((a, b) => b.wins - a.wins || b.winRate - a.winRate);
      const top = ranked[0];
      return top ? `${top.p.name} currently has the most wins with ${top.wins} wins from ${top.matches} matches (${top.winRate}% win rate).` : "There are no completed matches yet.";
    }

    if (/(streak|winning streak|form)/.test(q) && subject) {
      const s = streak(subject.id);
      return s ? `${subject.name} is currently on a ${s}-match winning streak.` : `${subject.name} does not currently have a winning streak.`;
    }

    if (/(win rate|performance|how am i|how is|doing|stats|record)/.test(q) && subject) {
      const s = playerStats(subject);
      return `${subject.name} has played ${s.matches} matches: ${s.wins} wins, ${s.losses} losses, with a ${s.winRate}% win rate.`;
    }

    if (asksRecent && /(match|game)/.test(q)) {
      const recent = validMatches.slice(0, requestedCount || 5);
      if (!recent.length) return "There are no completed matches yet.";
      return recent.map((m, i) => `M${validMatches.length - i}: ${describeMatch(m)}`).join("\n");
    }

    if (/(who|compare|versus|vs|rival|beat|opponent)/.test(q) && mentioned) {
      const opponents = new Map<string, { matches: number; wins: number }>();
      validMatches.forEach(m => {
        const row = m.match_players.find(x => x.player_id === mentioned.id);
        if (!row) return;
        m.match_players.filter(x => x.team !== row.team).forEach(op => {
          const item = opponents.get(op.player_id) || { matches: 0, wins: 0 };
          item.matches++;
          const own = row.team === "A" ? m.team_a_score : m.team_b_score;
          const opp = row.team === "A" ? m.team_b_score : m.team_a_score;
          if (own > opp) item.wins++;
          opponents.set(op.player_id, item);
        });
      });
      const rival = [...opponents.entries()].sort((a, b) => b[1].matches - a[1].matches)[0];
      if (rival) return `${mentioned.name} has faced ${nameById.get(rival[0]) || "that opponent"} ${rival[1].matches} times and won ${rival[1].wins} of those matches.`;
    }

    if (/(how many|total|number of).*(match|game)/.test(q)) return `Rally365 has ${validMatches.length} completed matches in the current group history.`;

    return "I can answer questions about player performance, wins and losses, winning streaks, partners, opponents, recent matches and match history. Try asking a specific player name with your question.";
  };
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const value = query.trim();
    if (!value || answering) return;
    setMessages(current => [...current, { role: "user", text: value }]);
    setQuery("");
    setAnswering(true);
    window.setTimeout(() => {
      setMessages(current => [...current, { role: "ai", text: answerQuery(value) }]);
      setAnswering(false);
    }, 250);
  };

  const quick = ["How am I doing?", "Who is my best partner?", "Who has the most wins?", "Show me recent matches."];

  return <main className="ai-page">
    <style>{`
      .ai-page {
        min-height: 100dvh;
        height: 100dvh;
        max-height: 100dvh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-sizing: border-box;
        padding-bottom: env(safe-area-inset-bottom);
      }
      .ai-header { flex: 0 0 auto; }
      .ai-content {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 12px;
      }
      .ai-input-bar {
        position: relative;
        flex: 0 0 auto;
        width: 100%;
        box-sizing: border-box;
        padding: 10px max(16px, env(safe-area-inset-left)) calc(10px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-right));
        margin: 0;
        background: rgba(255,255,255,.98);
        z-index: 5;
      }
      .ai-input-bar input { min-width: 0; box-sizing: border-box; }
      @media (max-width: 600px) {
        .ai-page { width: 100%; max-width: 100vw; }
        .ai-header { padding-left: 14px; padding-right: 14px; }
        .ai-content { padding-left: 12px; padding-right: 12px; }
        .ai-input-bar { gap: 8px; padding-left: 12px; padding-right: 12px; }
        .ai-input-bar input { font-size: 16px; }
        .ai-input-bar button { flex: 0 0 44px; width: 44px; height: 44px; }
      }
      @media (max-width: 380px) {
        .ai-header h1 { font-size: 21px; }
        .ai-header p { font-size: 12px; }
        .ai-content { padding-left: 8px; padding-right: 8px; }
        .ai-input-bar { padding-left: 8px; padding-right: 8px; }
      }
    `}</style>
    <header className="ai-header">
      <button type="button" className="icon-button" onClick={() => router.back()} aria-label="Back"><ArrowLeft size={20} /></button>
      <div><div className="eyebrow">RALLY365</div><h1><Sparkles size={20} /> Rally365 AI</h1><p>Ask questions about your games</p></div>
    </header>

    <section className="ai-content">
      <div className="ai-hero"><div className="ai-avatar"><Bot size={22} /></div><div><strong>Natural-language insights</strong><p>Ask in your own words. I’ll use your Rally365 match history to answer.</p></div></div>

      {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`ai-message-row ${message.role}`}>
        {message.role === "ai" && <span className="ai-message-icon"><Bot size={15} /></span>}
        <div className="ai-message">{message.text.split("\n").map((line, i) => <div key={i}>{line}</div>)}</div>
        {message.role === "user" && <span className="ai-message-icon"><UserRound size={15} /></span>}
      </div>)}

      {answering && <div className="ai-message-row ai"><span className="ai-message-icon"><Bot size={15} /></span><div className="ai-message ai-thinking">Thinking…</div></div>}

      {!loading && messages.length === 1 && <div className="ai-quick-list"><span>Try asking</span>{quick.map(item => <button key={item} type="button" onClick={() => { setQuery(item); window.setTimeout(() => submit(), 0); }}>{item}<span>›</span></button>)}</div>}
      {loading && <div className="ai-loading">Loading your Rally365 history…</div>}
    </section>

    <form className="ai-input-bar" onSubmit={submit}>
      <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onFocus={() => window.setTimeout(() => inputRef.current?.scrollIntoView({ block: "nearest" }), 100)} placeholder="Ask anything about Rally365…" aria-label="Ask Rally365 AI" />
      <button type="submit" disabled={!query.trim() || answering} aria-label="Send"><Send size={18} /></button>
    </form>
  </main>;
}
