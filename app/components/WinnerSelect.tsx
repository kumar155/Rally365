"use client";

import type { Team } from "../../lib/types";

type Props = {
  /** Team label for each option, e.g. `{ A: "Team A · Ana & Bo" }`. */
  labels: Record<Team, string>;
  winner: Team | "";
  select: (team: Team) => void;
};

const TEAMS: Team[] = ["A", "B"];

export function WinnerSelect({ labels, winner, select }: Props) {
  return <div className="winner-select">
    <div className="helper">Who won?</div>
    <div className="winner-options">
      {TEAMS.map(team => <button
        key={team}
        type="button"
        className={winner === team ? "winner-option selected" : "winner-option"}
        onClick={() => select(team)}
      >
        <span>{labels[team]}</span>
        {winner === team && <b>W</b>}
      </button>)}
    </div>
  </div>;
}
