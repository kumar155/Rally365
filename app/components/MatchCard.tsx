"use client";

import { Pencil } from "lucide-react";
import { isVoided } from "../../lib/matches";
import type { Match } from "../../lib/types";

type Props = {
  match: Match;
  number: number;
  teamA: string;
  teamB: string;
  /** Adds winning/losing classes to the team names. */
  highlightWinner?: boolean;
  onEdit?: (match: Match) => void;
};

export function MatchCard({ match, number, teamA, teamB, highlightWinner = false, onEdit }: Props) {
  const aWon = match.team_a_score > match.team_b_score;
  const voided = isVoided(match);
  const teamClass = (won: boolean) => (highlightWinner ? (won ? "winning-team" : "losing-team") : undefined);

  return <div className={voided ? "match-card voided" : "match-card"}>
    <div className="match-number">M{number}</div>
    <div className="teams">
      <div>
        <strong className={teamClass(aWon)}>{teamA}</strong>
        <span className={aWon ? "score-more" : "score-less"}>{match.team_a_score}</span>
      </div>
      <div>
        <strong className={teamClass(!aWon)}>{teamB}</strong>
        <span className={!aWon ? "score-more" : "score-less"}>{match.team_b_score}</span>
      </div>
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
