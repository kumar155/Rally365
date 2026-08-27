"use client";

import type { Team } from "../../lib/types";

type Props = {
  /** Team label for each option, e.g. `{ A: "Team A · Ana & Bo" }`. */
  labels: Record<Team, string>;
  winner: Team | "";
  select: (team: Team) => void;
};

const TEAMS: Team[] = ["A", "B"];

const LOSER_STYLE = { borderColor: "#e4b8b8", background: "#fff4f4", color: "#a63e3e" };
const WIN_MARKER_STYLE = { background: "#15985c", color: "#fff" };
const LOSS_MARKER_STYLE = { background: "#d94d4d", color: "#fff" };

const optionClass = (team: Team, winner: Team | "") => {
  if (!winner) return "winner-option";
  return winner === team ? "winner-option selected" : "winner-option loser-selected";
};

export function WinnerSelect({ labels, winner, select }: Props) {
  return <div className="winner-select">
    <div className="helper">Who won?</div>
    <div className="winner-options">
      {TEAMS.map(team => {
        const won = winner === team;
        return <button
          key={team}
          type="button"
          className={optionClass(team, winner)}
          style={winner && !won ? LOSER_STYLE : undefined}
          onClick={() => select(team)}
        >
          <span>{labels[team]}</span>
          {winner && <b
            className={won ? "result-win" : "result-loss"}
            style={won ? WIN_MARKER_STYLE : LOSS_MARKER_STYLE}
          >{won ? "W" : "L"}</b>}
        </button>;
      })}
    </div>
  </div>;
}
