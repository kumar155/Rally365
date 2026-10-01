"use client";

import { useEffect } from "react";

/**
 * Keeps the legacy id-qualified /tournaments URL compatible while making the
 * overview Tournament Table card open the actual tournament standings/table.
 */
export default function TournamentTableRoute() {
  useEffect(() => {
    const path = window.location.pathname;
    const id = new URLSearchParams(window.location.search).get("id");

    if (path === "/tournaments" && id) {
      window.location.replace(`/tournaments/standings?id=${encodeURIComponent(id)}`);
      return;
    }

    // The manage page owns the card markup. Keep the visible navigation target
    // and supporting label aligned with the actual tournament-table destination.
    if (path !== "/tournaments/manage" || !id) return;

    const card = document.querySelector<HTMLAnchorElement>('a[aria-label="Open tournament table"]');
    if (!card) return;

    card.href = `/tournaments/standings?id=${encodeURIComponent(id)}`;
    const label = card.querySelector<HTMLElement>(".overviewLabelRef");
    if (label) label.textContent = "View tournament standings";
  }, []);

  return null;
}
