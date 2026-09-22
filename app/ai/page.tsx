"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bot, Send, Sparkles, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type Player = { id: string; name: string };
type Message = { role: "ai" | "user"; text: string; feedback?: "up" | "down"; feedbackRetry?: boolean; id?: string; sourceQuestion?: string };
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
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", text: "Ask me anything about your Rally365 games, players, partnerships or rivalries.", id: "welcome" },
  ]);
  const [loading, setLoading] = useState(true);
  const [answering, setAnswering] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState<string | null>(null);
  const [pendingPlayerQuestion, setPendingPlayerQuestion] = useState<string | null>(null);
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

  const partnerStats = (playerId: string) => {
    const pairs = new Map<string, { matches: number; wins: number; losses: number }>();
    validMatches.forEach(m => {
      const row = m.match_players.find(x => x.player_id === playerId);
      if (!row) return;
      const partner = m.match_players.find(x => x.team === row.team && x.player_id !== playerId);
      if (!partner) return;
      const item = pairs.get(partner.player_id) || { matches: 0, wins: 0, losses: 0 };
      item.matches++;
      const own = row.team === "A" ? m.team_a_score : m.team_b_score;
      const opp = row.team === "A" ? m.team_b_score : m.team_a_score;
      if (own > opp) item.wins++;
      else if (own < opp) item.losses++;
      pairs.set(partner.player_id, item);
    });
    return [...pairs.entries()];
  };

  const bestPartner = (playerId: string) =>
    partnerStats(playerId).sort((a, b) => b[1].wins - a[1].wins || b[1].matches - a[1].matches)[0];

  const weakestPartner = (playerId: string) =>
    partnerStats(playerId).sort((a, b) => b[1].losses - a[1].losses || a[1].wins - b[1].wins || b[1].matches - a[1].matches)[0];

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
    const subject = mentioned;

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
    const requestedCountMatch = q.match(/\b(?:last|recent)\s+(\d+)\s*(?:matches?|games?|history)?\b/);
    const requestedCount = requestedCountMatch ? Math.max(1, Number(requestedCountMatch[1])) : null;
    const asksStats = /(stats|statistics|record|performance|win rate|wins|losses)/.test(q);
    const asksRecent = /(recent|latest|last|most recent)/.test(q);
    if (/(mvp|most valuable player)/.test(q)) {
      return "Rally365 calculates the MVP for the selected match day from that day's valid matches. Guest players are excluded. Each eligible player's day performance is compared using wins, win rate and number of matches; the result is recalculated whenever the day's match results change. If there are no valid matches for the day, there is no MVP.";
    }

    const needsPlayer =
      /(how am i|how is|how's|doing|performance|win rate|winning streak|streak|strongest partner|best partner|best duo|weakest partner|worst partner|partnership|partner|pair|opponent|rival|recent matches|latest matches|last .* matches|stats|statistics|record)/.test(q) &&
      !/(most wins|highest wins|top player|leader|leaderboard|how many|total|number of)/.test(q);

    if (needsPlayer && !mentioned) {
      setPendingPlayerQuestion(raw);
      return "Which player would you like me to check? Please tell me the player's name.";
    }

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

    if (/(weakest partner|worst partner)/.test(q) && subject) {
      const result = weakestPartner(subject.id);
      if (!result) return `${subject.name} does not have enough team history yet for a partner insight.`;
      const partner = nameById.get(result[0]) || "Unknown";
      const rate = result[1].matches ? Math.round(result[1].wins / result[1].matches * 100) : 0;
      return `${subject.name}'s weakest historical partner is ${partner}: ${result[1].wins} wins and ${result[1].losses} losses in ${result[1].matches} matches together (${rate}% win rate).`;
    }

    if (/(strongest partner|best partner|best duo)/.test(q) && subject) {
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
  const classifyIntent = (raw: string) => {
    const q = normalize(raw);
    if (/(weakest partner|worst partner)/.test(q)) return "weakest_partner";
    if (/(strongest partner|best partner|best duo)/.test(q)) return "strongest_partner";
    if (/(mvp|most valuable player)/.test(q)) return "mvp";
    if (/(last|recent|latest|most recent).*\b\d+\b.*(match|game|history)/.test(q)) return "recent_matches";
    if (/(recent|latest|last|most recent).*(match|game)/.test(q)) return "recent_matches";
    if (/(streak|winning streak|form)/.test(q)) return "streak";
    if (/(win rate|performance|how am i|how is|doing|stats|record)/.test(q)) return "player_stats";
    if (/(partner|partnership|duo|pair)/.test(q)) return "partnership";
    if (/(most wins|highest wins|top player|leader|leaderboard)/.test(q)) return "most_wins";
    return "general";
  };

  const reframeAnswer = (question: string, previousAnswer: string) => {
    const q = normalize(question);
    const mentionedPlayers = players.filter(p => q.includes(normalize(p.name)));
    const subject = mentionedPlayers[0];
    const intent = classifyIntent(question);

    // Re-run the underlying calculation, but deliberately use a fuller response
    // format. This is the free/no-LLM feedback loop: a negative rating triggers
    // a second pass over the same Rally365 data instead of merely repeating text.
    if (intent === "weakest_partner" && subject) {
      const result = weakestPartner(subject.id);
      if (result) {
        const partner = nameById.get(result[0]) || "Unknown";
        const total = result[1].matches;
        const rate = total ? Math.round(result[1].wins / total * 100) : 0;
        return `I re-checked ${subject.name}'s partnership history. ${partner} is the weakest historical partner by the recorded results: ${result[1].wins} wins and ${result[1].losses} losses across ${total} matches together (${rate}% win rate).`;
      }
    }
    if (intent === "strongest_partner" && subject) {
      const result = bestPartner(subject.id);
      if (result) {
        const partner = nameById.get(result[0]) || "Unknown";
        const total = result[1].matches;
        const rate = total ? Math.round(result[1].wins / total * 100) : 0;
        return `I re-checked ${subject.name}'s partnership history. ${partner} is the strongest historical partner: ${result[1].wins} wins in ${total} matches together (${rate}% win rate).`;
      }
    }
    if (intent === "mvp") {
      return "I re-checked the MVP rule: it is calculated independently for the selected match day from valid matches, excluding Guest players. The eligible players are compared using wins, win rate and number of matches, and the result is recalculated when that day's match results change.";
    }
    if (previousAnswer) return `I re-checked the Rally365 data and restructured the answer:\n${previousAnswer}`;
    return answerQuery(question);
  };

  const submitFeedback = async (messageIndex: number, feedback: "up" | "down") => {
    const message = messages[messageIndex];
    if (!message || message.role !== "ai" || feedbackBusy) return;
    setFeedbackBusy(message.id || String(messageIndex));

    setMessages(current => current.map((m, i) => i === messageIndex ? { ...m, feedback } : m));

    let retryText: string | null = null;
    const previousUser = [...messages.slice(0, messageIndex)].reverse().find(m => m.role === "user");
    const sourceQuestion = message.sourceQuestion || previousUser?.text || "";
    if (feedback === "down") {
      if (sourceQuestion) {
        retryText = reframeAnswer(sourceQuestion, message.text);
        setAnswering(true);
        window.setTimeout(() => {
          setMessages(current => [...current, { role: "ai", text: retryText || "I re-checked the answer, but could not produce a better response.", feedbackRetry: true, id: `retry-${Date.now()}`, sourceQuestion }]);
          setAnswering(false);
        }, 300);
      }
    }

    try {
      await fetch("/api/ai/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          question: sourceQuestion,
          response: message.text,
          feedback,
          intent: classifyIntent(sourceQuestion),
          retryResponse: retryText,
        }),
      }).catch(() => undefined);
    } finally {
      setFeedbackBusy(null);
    }
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const value = query.trim();
    if (!value || answering) return;

    const normalizedValue = normalize(value);
    const selectedPlayer = players.find(p => normalizedValue === normalize(p.name) || normalizedValue.includes(normalize(p.name)));
    const questionToAnswer = pendingPlayerQuestion && selectedPlayer ? `${pendingPlayerQuestion} ${selectedPlayer.name}` : value;
    if (pendingPlayerQuestion && selectedPlayer) setPendingPlayerQuestion(null);

    setMessages(current => [...current, { role: "user", text: value, id: `user-${Date.now()}` }]);
    setQuery("");
    setAnswering(true);
    window.setTimeout(() => {
      setMessages(current => [...current, { role: "ai", text: answerQuery(questionToAnswer), id: `ai-${Date.now()}`, sourceQuestion: questionToAnswer }]);
      setAnswering(false);
    }, 250);
  };

  const quick = ["How am I doing?", "Who is my best partner?", "Who has the most wins?", "Show me recent matches."];
  const selectablePlayers = players.filter(p => !/^guest\s*\d*$/i.test(p.name));

  const choosePlayer = (player: Player) => {
    if (!pendingPlayerQuestion || answering) return;
    const questionToAnswer = `${pendingPlayerQuestion} ${player.name}`;
    setPendingPlayerQuestion(null);
    setMessages(current => [...current, { role: "user", text: player.name, id: `user-${Date.now()}` }]);
    setAnswering(true);
    window.setTimeout(() => {
      setMessages(current => [...current, { role: "ai", text: answerQuery(questionToAnswer), id: `ai-${Date.now()}`, sourceQuestion: questionToAnswer }]);
      setAnswering(false);
    }, 250);
  };

  return <main className="ai-page">
    <style>{`
      .ai-page { background:#f3f7f4; color:#10231a; max-width:560px; margin:0 auto; }
      .ai-header {
        height:72px; padding:12px 16px; display:flex; align-items:center; gap:10px;
        background:#fff; border-bottom:1px solid #e2eae5; position:sticky; top:0; z-index:5;
        box-sizing:border-box;
      }
      .ai-header .icon-button {
        width:38px; height:38px; border:0; border-radius:12px; background:#eef4f0;
        color:#476154; display:grid; place-items:center; flex:0 0 auto; cursor:pointer;
      }
      .ai-header > div { min-width:0; flex:1; }
      .ai-header .eyebrow { color:#718078; font-size:10px; font-weight:800; letter-spacing:1px; margin-bottom:2px; }
      .ai-header h1 {
        margin:0; display:flex; align-items:center; gap:7px; font-size:20px; line-height:1.15;
        letter-spacing:-.4px; color:#183027;
      }
      .ai-header h1 svg { color:#15985c; flex:0 0 auto; }
      .ai-header p { margin:3px 0 0; color:#7b8b83; font-size:11px; }
      .ai-content { padding:16px; }
      .ai-hero {
        display:flex; gap:12px; align-items:center; padding:15px;
        background:linear-gradient(135deg,#e2f6eb,#eef8ff);
        border:1px solid #d2e9dc; border-radius:18px; margin-bottom:16px;
      }
      .ai-avatar {
        width:44px; height:44px; border-radius:14px; background:#fff; color:#15985c;
        display:grid; place-items:center; flex:0 0 auto;
      }
      .ai-hero strong { display:block; font-size:13px; color:#183027; }
      .ai-hero p { margin:4px 0 0; color:#6b7d73; font-size:11px; line-height:1.4; }
      .ai-message-row { display:flex; gap:7px; align-items:flex-end; margin:10px 0; }
      .ai-message-row.user { justify-content:flex-end; }
      .ai-message-icon {
        width:25px; height:25px; border-radius:9px; background:#e4f6ec; color:#15985c;
        display:grid; place-items:center; flex:0 0 auto;
      }
      .ai-message {
        max-width:84%; padding:10px 12px; border-radius:15px;
        background:#f2f7f4; color:#53665c; font-size:12px; line-height:1.48;
        box-shadow:0 1px 1px rgba(16,35,26,.03);
      }
      .ai-message-row.user .ai-message {
        background:#15985c; color:#fff; border-bottom-right-radius:5px;
      }
      .ai-message-row.ai .ai-message { border-bottom-left-radius:5px; }
      .ai-thinking { color:#6b7d73; font-style:italic; }
      .ai-quick-list {
        margin-top:16px; display:flex; flex-direction:column; gap:7px;
      }
      .ai-quick-list > span {
        font-size:10px; font-weight:800; letter-spacing:1px; color:#718078; margin:0 2px 1px;
      }
      .ai-quick-list button {
        width:100%; border:1px solid #dce8e0; background:#fff; border-radius:13px;
        padding:11px 12px; text-align:left; color:#183027; font-size:12px;
        display:flex; align-items:center; justify-content:space-between; gap:8px; cursor:pointer;
      }
      .ai-quick-list button:hover { border-color:#b9d9c7; background:#fbfdfc; }
      .ai-quick-list button span { color:#15985c; font-size:18px; line-height:1; }
      .ai-loading { color:#7b8b83; font-size:11px; text-align:center; padding:24px 8px; }
      .ai-input-bar {
        border-top:1px solid #e1ebe5;
        box-shadow:0 -3px 12px rgba(16,35,26,.04);
      }
      .ai-input-bar input {
        height:44px; border:1px solid #dce7df; background:#fff; border-radius:13px;
        padding:0 12px; outline:none; font-size:12px; color:#183027;
      }
      .ai-input-bar input:focus { border-color:#a9cfba; box-shadow:0 0 0 3px rgba(21,152,92,.08); }
      .ai-input-bar button {
        height:44px; width:44px; border:0; border-radius:13px; background:#15985c;
        color:#fff; display:grid; place-items:center; cursor:pointer; flex:0 0 44px;
      }
      .ai-input-bar button:disabled { opacity:.4; cursor:default; }
      @media (max-width:600px) {
        .ai-content { padding-left:12px; padding-right:12px; }
      }

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
        display: flex;
        align-items: center;
        flex: 0 0 auto;
        width: 100%;
        box-sizing: border-box;
        padding: 10px max(16px, env(safe-area-inset-left)) calc(10px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-right));
        margin: 0;
        background: rgba(255,255,255,.98);
        z-index: 5;
      }
      .ai-input-bar input { flex: 1 1 auto; min-width: 0; width: 100%; box-sizing: border-box; }
      .ai-input-bar button { flex: 0 0 auto; }
      .ai-message-wrap { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; max-width: min(88%, 680px); }
      .ai-message-row.user .ai-message-wrap { align-items: flex-end; }
      .ai-feedback { display: flex; gap: 4px; margin: 5px 0 0 6px; }
      .ai-feedback button { border: 0; background: transparent; border-radius: 8px; padding: 3px 5px; font-size: 13px; line-height: 1; cursor: pointer; opacity: .55; }
      .ai-feedback button:hover, .ai-feedback button.selected { background: #e8f5ef; opacity: 1; }
      .ai-feedback button:disabled { cursor: default; opacity: .35; }
      .ai-player-picker { margin: 10px 0 14px 40px; }
      .ai-player-picker-label { display: block; margin-bottom: 8px; font-size: 12px; font-weight: 700; color: #53656a; }
      .ai-player-options { display: flex; flex-wrap: wrap; gap: 8px; }
      .ai-player-option { display: inline-flex; align-items: center; gap: 7px; border: 1px solid #d7e8e2; background: #fff; border-radius: 999px; padding: 6px 11px 6px 6px; color: #21434a; font: inherit; font-size: 13px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
      .ai-player-option:active { transform: scale(.98); }
      .ai-player-option-avatar { position: relative; width: 28px; height: 28px; flex: 0 0 28px; display: grid; place-items: center; overflow: hidden; border-radius: 50%; background: #e6f5ef; color: #159a67; font-size: 11px; font-weight: 700; }
      .ai-player-option-avatar img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
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
        <div className="ai-message-wrap">
          <div className="ai-message">{message.text.split("\n").map((line, i) => <div key={i}>{line}</div>)}</div>
          {message.role === "ai" && index > 0 && (
            <div className="ai-feedback" aria-label="Rate this response">
              <button type="button" className={message.feedback === "up" ? "selected" : ""} onClick={() => submitFeedback(index, "up")} disabled={feedbackBusy === (message.id || String(index))} aria-label="Helpful">👍</button>
              <button type="button" className={message.feedback === "down" ? "selected" : ""} onClick={() => submitFeedback(index, "down")} disabled={feedbackBusy === (message.id || String(index))} aria-label="Not helpful">👎</button>
            </div>
          )}
        </div>
        {message.role === "user" && <span className="ai-message-icon"><UserRound size={15} /></span>}
      </div>)}

      {answering && <div className="ai-message-row ai"><span className="ai-message-icon"><Bot size={15} /></span><div className="ai-message ai-thinking">Thinking…</div></div>}

      {pendingPlayerQuestion && !answering && !loading && (
        <div className="ai-player-picker">
          <span className="ai-player-picker-label">Choose a player</span>
          <div className="ai-player-options">
            {selectablePlayers.map(player => (
              <button key={player.id} type="button" className="ai-player-option" onClick={() => choosePlayer(player)} aria-label={`Choose ${player.name}`}>
                <span className="ai-player-option-avatar">
                  <img src={`/avatars/${encodeURIComponent(player.name)}.png`} alt="" onError={e => { e.currentTarget.style.display = "none"; }} />
                  <span>{player.name.charAt(0).toUpperCase()}</span>
                </span>
                <span>{player.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && messages.length === 1 && !pendingPlayerQuestion && <div className="ai-quick-list"><span>Try asking</span>{quick.map(item => <button key={item} type="button" onClick={() => { setQuery(item); window.setTimeout(() => submit(), 0); }}>{item}<span>›</span></button>)}</div>}
      {loading && <div className="ai-loading">Loading your Rally365 history…</div>}
    </section>

    <form className="ai-input-bar" onSubmit={submit}>
      <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onFocus={() => window.setTimeout(() => inputRef.current?.scrollIntoView({ block: "nearest" }), 100)} placeholder="Ask anything about Rally365…" aria-label="Ask Rally365 AI" />
      <button type="submit" disabled={!query.trim() || answering} aria-label="Send"><Send size={18} /></button>
    </form>
  </main>;
}
