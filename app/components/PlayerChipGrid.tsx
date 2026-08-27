"use client";

import type { Player } from "../../lib/types";

type Props = {
  players: Player[];
  selected: string[];
  toggle: (playerId: string) => void;
  /** Shows the 1-based selection order on each selected chip. */
  showOrder?: boolean;
};

export function PlayerChipGrid({ players, selected, toggle, showOrder = false }: Props) {
  return <div className="selection-grid">
    {players.map(p => {
      const isSelected = selected.includes(p.id);
      return <button
        key={p.id}
        className={`player-chip ${isSelected ? "selected" : ""}`}
        onClick={() => toggle(p.id)}
      >
        {p.name}
        {showOrder && isSelected && <small>{selected.indexOf(p.id) + 1}</small>}
      </button>;
    })}
  </div>;
}
