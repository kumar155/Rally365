"use client";

import { useEffect } from "react";

const isGuestRow = (row: Element) =>
  /^guest/i.test(row.querySelector(".player-name b")?.textContent?.trim() || "");

const winRate = (row: Element) => {
  const match = row.textContent?.match(/(\d+)\s*%/);
  return match ? Number(match[1]) : 0;
};

export default function LeaderboardGuestOrder() {
  useEffect(() => {
    const reorder = () => {
      document.querySelectorAll(".stats-table").forEach((table) => {
        const rows = Array.from(table.querySelectorAll(".table-row"));
        if (rows.length < 2) return;

        const realPlayers = rows
          .filter((row) => !isGuestRow(row))
          .sort((a, b) => winRate(b) - winRate(a));
        const guests = rows
          .filter(isGuestRow)
          .sort((a, b) => winRate(b) - winRate(a));
        const ordered = [...realPlayers, ...guests];

        ordered.forEach((row, index) => {
          const rank = row.querySelector(".rank");
          if (rank) rank.textContent = String(index + 1);
          table.appendChild(row);
        });
      });
    };

    reorder();
    const observer = new MutationObserver(reorder);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
