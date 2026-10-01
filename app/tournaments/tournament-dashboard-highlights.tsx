"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, Trophy } from "lucide-react";
import { supabase } from "../../lib/supabase";

type Match = {
  id: string;
  round_id: string | null;
  match_number: number;
  status: string;
  team_a_duo_id: string | null;
  team_b_duo_id: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  winner_duo_id: string | null;
};

type Duo = { id: string; name: string };
type Round = { id: string; round_number: number; round_type: string; name: string };
type TeamStat = { id: string; name: string; played: number; wins: number; losses: number; pointsFor: number; pointsAgainst: number };

const terminal = new Set(["COMPLETED", "WALKOVER"]);

function getInitials(name: string) {
  return name
    .split(/\s*\+\s*|\s+/)
    .map((part) => part.trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("");
}

export default function TournamentDashboardHighlights() {
  const pathname = usePathname();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [id, setId] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [duos, setDuos] = useState<Duo[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);

  useEffect(() => {
    if (pathname !== "/tournaments/manage") {
      setId("");
      setTarget(null);
      return;
    }
    const nextId = new URLSearchParams(window.location.search).get("id") || "";
    setId(nextId);
  }, [pathname]);

  useEffect(() => {
    if (pathname !== "/tournaments/manage") return;

    let cancelled = false;
    let raf = 0;

    const mountTarget = () => {
      const overview = document.querySelector<HTMLElement>(".overviewRef");
      const config = overview?.querySelector<HTMLElement>(".configRef");
      if (!overview || !config) {
        raf = window.requestAnimationFrame(mountTarget);
        return;
      }

      let host = overview.querySelector<HTMLElement>("[data-rally365-dashboard-highlights]");
      if (!host) {
        host = document.createElement("div");
        host.dataset.rally365DashboardHighlights = "true";
        config.insertAdjacentElement("beforebegin", host);
      }
      if (!cancelled) setTarget(host);
    };

    mountTarget();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      setTarget(null);
    };
  }, [pathname]);

  useEffect(() => {
    if (!id || pathname !== "/tournaments/manage") return;
    let cancelled = false;

    async function load() {
      const [{ data: matchRows }, { data: duoRows }, { data: roundRows }] = await Promise.all([
        supabase
          .from("tournament_matches")
          .select("id,round_id,match_number,status,team_a_duo_id,team_b_duo_id,team_a_score,team_b_score,winner_duo_id")
          .eq("tournament_id", id)
          .order("match_number"),
        supabase.from("tournament_duos").select("id,name").eq("tournament_id", id),
        supabase.from("tournament_rounds").select("id,round_number,round_type,name").eq("tournament_id", id).order("round_number"),
      ]);

      if (cancelled) return;
      setMatches((matchRows || []) as Match[]);
      setDuos((duoRows || []) as Duo[]);
      setRounds((roundRows || []) as Round[]);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, pathname]);

  const teamStats = useMemo(() => {
    const map = new Map<string, TeamStat>();
    duos.forEach((duo) => map.set(duo.id, { id: duo.id, name: duo.name, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }));

    matches.forEach((match) => {
      if (!terminal.has(match.status) || !match.team_a_duo_id || !match.team_b_duo_id) return;
      const a = map.get(match.team_a_duo_id);
      const b = map.get(match.team_b_duo_id);
      if (!a || !b) return;

      a.played += 1;
      b.played += 1;
      if (match.team_a_score != null && match.team_b_score != null) {
        a.pointsFor += match.team_a_score;
        a.pointsAgainst += match.team_b_score;
        b.pointsFor += match.team_b_score;
        b.pointsAgainst += match.team_a_score;
      }

      const winner = match.winner_duo_id ||
        (match.team_a_score != null && match.team_b_score != null
          ? match.team_a_score > match.team_b_score ? match.team_a_duo_id : match.team_b_score > match.team_a_score ? match.team_b_duo_id : null
          : null);
      if (winner === a.id) {
        a.wins += 1;
        b.losses += 1;
      } else if (winner === b.id) {
        b.wins += 1;
        a.losses += 1;
      }
    });

    return map;
  }, [duos, matches]);

  const winner = useMemo(() => {
    const finalRounds = rounds.filter((round) => round.round_type === "FINAL" || /^final$/i.test(round.name.trim()));
    const finalIds = new Set(finalRounds.map((round) => round.id));
    const finalMatches = matches
      .filter((match) => terminal.has(match.status) && match.winner_duo_id && finalIds.has(match.round_id || ""))
      .sort((a, b) => b.match_number - a.match_number);

    if (finalMatches[0]?.winner_duo_id) return teamStats.get(finalMatches[0].winner_duo_id) || null;

    const latestRoundNumber = rounds.filter((round) => round.round_type !== "GROUP").reduce((max, round) => Math.max(max, round.round_number), -1);
    const latestRoundIds = new Set(rounds.filter((round) => round.round_number === latestRoundNumber && round.round_type !== "GROUP").map((round) => round.id));
    const latest = matches
      .filter((match) => terminal.has(match.status) && match.winner_duo_id && latestRoundIds.has(match.round_id || ""))
      .sort((a, b) => b.match_number - a.match_number);
    return latest[0]?.winner_duo_id ? teamStats.get(latest[0].winner_duo_id) || null : null;
  }, [matches, rounds, teamStats]);

  const mvpTeam = useMemo(() => {
    const candidates = [...teamStats.values()].filter((team) => team.played > 0);
    candidates.sort((a, b) => {
      const winRateDiff = b.wins / b.played - a.wins / a.played;
      if (Math.abs(winRateDiff) > 0.0001) return winRateDiff;
      if (b.wins !== a.wins) return b.wins - a.wins;
      const pointDiff = (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst);
      if (pointDiff !== 0) return pointDiff;
      return a.name.localeCompare(b.name);
    });
    return candidates[0] || null;
  }, [teamStats]);

  if (!target || !id || (!winner && !mvpTeam)) return null;

  return createPortal(
    <>
      <style jsx global>{`
        .rally365-dashboard-highlights{display:flex;flex-direction:column;gap:10px;margin:14px 0 18px}
        .rally365-winner-card,.rally365-mvp-card{position:relative;display:flex;align-items:center;gap:12px;min-width:0;padding:14px 15px;border-radius:18px;overflow:hidden}
        .rally365-winner-card{border:1px solid #bfe5d1;background:linear-gradient(105deg,#e7f9ef 0%,#f7fcf9 58%,#dff5e9 100%);box-shadow:0 4px 14px rgba(20,110,75,.07)}
        .rally365-highlight-icon{width:48px;height:48px;display:grid;place-items:center;flex:0 0 auto;border-radius:15px;background:#ccefdc;color:#128752}
        .rally365-highlight-copy,.rally365-mvp-copy{min-width:0;flex:1}
        .rally365-highlight-eyebrow,.rally365-mvp-eyebrow{display:block;margin-bottom:2px;font-size:9px;font-weight:800;letter-spacing:1.2px}
        .rally365-highlight-eyebrow{color:#178653}.rally365-mvp-eyebrow{color:#9b6a08}
        .rally365-highlight-copy strong{display:block;color:#123f30;font-size:18px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rally365-highlight-copy p,.rally365-mvp-copy p{margin:4px 0 0;font-size:11px;line-height:1.35}
        .rally365-highlight-copy p{color:#55776a}.rally365-mvp-copy p{color:#7c683b}
        .rally365-highlight-team-mark{width:46px;height:46px;display:grid;place-items:center;flex:0 0 auto;border-radius:50%;background:#f8d98a;color:#17352a;font-size:13px;font-weight:900;border:3px solid rgba(255,255,255,.72)}
        .rally365-mvp-card{border:1px solid #ecd58f;background:linear-gradient(105deg,#fff8df 0%,#fffdf4 58%,#fff1c4 100%);box-shadow:0 4px 14px rgba(126,92,20,.07)}
        .rally365-mvp-badge{width:48px;height:48px;display:grid;place-items:center;flex:0 0 auto;border-radius:15px;background:#ffefb5;font-size:25px}
        .rally365-mvp-copy strong{display:block;color:#5e4308;font-size:18px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .rally365-mvp-stats{display:flex;align-items:center;flex:0 0 auto;padding-left:4px}
        .rally365-mvp-stats>div{min-width:46px;padding:0 7px;text-align:center}.rally365-mvp-stats>div+div{border-left:1px solid #ead58e}
        .rally365-mvp-stats b{display:block;color:#765208;font-size:17px;line-height:1.15}.rally365-mvp-stats span{display:block;margin-top:3px;color:#8b774c;font-size:9px;font-weight:700;line-height:1.1}
        .rally365-mvp-sparkle{position:absolute;right:8px;top:7px;color:#c69a2b;opacity:.45}
        @media(max-width:600px){.rally365-dashboard-highlights{margin:12px 0 16px}.rally365-winner-card,.rally365-mvp-card{gap:10px;padding:12px}.rally365-highlight-icon,.rally365-mvp-badge{width:42px;height:42px;border-radius:13px}.rally365-highlight-icon svg{width:21px;height:21px}.rally365-mvp-badge{font-size:22px}.rally365-highlight-copy strong,.rally365-mvp-copy strong{font-size:16px}.rally365-highlight-copy p,.rally365-mvp-copy p{font-size:10px}.rally365-highlight-team-mark{width:40px;height:40px;font-size:12px}.rally365-mvp-stats{padding-left:5px}.rally365-mvp-stats>div{min-width:40px;padding:0 4px}.rally365-mvp-stats b{font-size:15px}.rally365-mvp-stats span{font-size:8px}}
      `}</style>
      <section className="rally365-dashboard-highlights" aria-label="Tournament highlights">
        {winner && (
          <article className="rally365-winner-card">
            <div className="rally365-highlight-icon"><Trophy size={24} /></div>
            <div className="rally365-highlight-copy">
              <span className="rally365-highlight-eyebrow">TOURNAMENT WINNER</span>
              <strong>{winner.name}</strong>
              <p>Champions · {winner.wins} win{winner.wins === 1 ? "" : "s"} from {winner.played} match{winner.played === 1 ? "" : "es"}.</p>
            </div>
            <div className="rally365-highlight-team-mark">{getInitials(winner.name)}</div>
          </article>
        )}

        {mvpTeam && (
          <article className="rally365-mvp-card">
            <div className="rally365-mvp-badge" aria-hidden="true">👑</div>
            <div className="rally365-mvp-copy">
              <span className="rally365-mvp-eyebrow">MVP TEAM</span>
              <strong>{mvpTeam.name}</strong>
              <p>Top-performing team across completed tournament matches.</p>
            </div>
            <div className="rally365-mvp-stats">
              <div><b>{mvpTeam.wins}</b><span>Wins</span></div>
              <div><b>{mvpTeam.played}</b><span>Matches</span></div>
              <div><b>{Math.round((mvpTeam.wins / mvpTeam.played) * 100)}%</b><span>Win rate</span></div>
            </div>
            <Sparkles className="rally365-mvp-sparkle" size={20} aria-hidden="true" />
          </article>
        )}
      </section>
    </>,
    target,
  );
}
