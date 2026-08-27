"use client";

import type { Team } from "../../lib/types";

type Props = {
  /** Team label for each option, e.g. `{ A: "Team A · Ana & Bo" }`. */
  labels: Record<Team, string>;
  winner: Team | "";
  select: (team: Team) => void;
};

const TEAMS: Team[] = ["A", "B"];

const optionClass = (team: Team, winner: Team | "") => {
  if (!winner) return "winner-option";
  return winner === team ? "winner-option selected" : "winner-option loser-selected";
};

export function WinnerSelect({ labels, winner, select }: Props) {
  return <div className="winner-select">
    <div className="helper">Who won?</div>
    <div className="winner-options">
      {TEAMS.map(team => <button
        key={team}
        type="button"
        className={optionClass(team, winner)}
        onClick={() => select(team)}
      >
        <span>{labels[team]}</span>
        {winner && <b className={winner === team ? "result-win" : "result-loss"}>{winner === team ? "W" : "L"}</b>}
      </button>)}
    </div>
  </div>;
}
