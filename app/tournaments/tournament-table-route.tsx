"use client";

import { useEffect } from "react";

/**
 * The overview's Tournament Table tile historically pointed at the tournament
 * list route. Keep that URL backward-compatible, but route an id-qualified
 * request to the actual tournament table/standings screen.
 */
export default function TournamentTableRoute() {
  useEffect(() => {
    if (window.location.pathname !== "/tournaments") return;

    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;

    window.location.replace(`/tournaments/standings?id=${encodeURIComponent(id)}`);
  }, []);

  return null;
}
