"use client";

import { Pencil } from "lucide-react";
import { isVoided, winnerOf } from "../../lib/matches";
import type { Match } from "../../lib/types";

/** `history` is the plain list on the Today tab; `stats` adds W/L badges. */
const VARIANTS = {
  history: { won: "home-team-win", lost: "home-team-loss", badges: false },
  stats: { won: "winning-team", lost: "losing-team", badges: true },
};

type Props = {
  match: Match;
  number: number;
  teamA: string;
  teamB: string;
  variant?: keyof typeof VARIANTS;
  onEdit?: (match: Match) => void;
};

export function MatchCard({ match, number, teamA, teamB, variant = "history", onEdit }: Props) {
  const { won, lost, badges } = VARIANTS[variant];
  const voided = isVoided(match);
  const teams: { name: string; isWinner: boolean }[] = [
    { name: teamA, isWinner: winnerOf(match) === "A" },
    { name: teamB, isWinner: winnerOf(match) === "B" },
  ];

  return <div className={voided ? "match-card voided" : "match-card"}>
    <div className="match-number">M{number}</div>
    <div className="teams">
      {teams.map(({ name, isWinner }, i) => <div key={i}>
        <strong className={isWinner ? won : lost}>{name}</strong>
        {badges && <span className={`match-result-circle ${isWinner ? "match-result-win" : "match-result-loss"}`}>{isWinner ? "W" : "L"}</span>}
      </div>)}
      {voided ? <small>VOIDED</small> : match.edit_count > 0 ? <small>Edited · {match.edit_count}x</small> : null}
    </div>
    {onEdit && !voided && <button
      className="edit-link"
      title="Edit match"
      aria-label="Edit match"
      onClick={() => onEdit(match)}
    >
      <Pencil size={16} />
    </button>}
  </div>;
}
