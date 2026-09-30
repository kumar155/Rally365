"use client";

import { useEffect } from "react";

const isGuestRow = (row: Element) =>
  /^guest/i.test(row.querySelector(".player-name b")?.textContent?.trim() || "");

export default function LeaderboardGuestOrder() {
  useEffect(() => {
    const reorder = () => {
      document.querySelectorAll(".stats-table").forEach((table) => {
        const rows = Array.from(table.querySelectorAll(".table-row"));
        if (rows.length < 2) return;

        let seenGuest = false;
        let realAfterGuest = false;
        for (const row of rows) {
          if (isGuestRow(row)) seenGuest = true;
          else if (seenGuest) {
            realAfterGuest = true;
            break;
          }
        }

        if (!realAfterGuest) return;
        rows.filter(isGuestRow).forEach((row) => table.appendChild(row));
      });
    };

    reorder();
    const observer = new MutationObserver(reorder);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
