"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The existing Players list is rendered inside the main home client page.
 * Keep that page's existing state intact, but route player-card taps to the
 * static profile shell. The player name is passed as a query value so the
 * route does not require a build-time dynamic segment.
 */
export default function PlayerProfileNavigator() {
  const router = useRouter();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const card = target?.closest<HTMLElement>(".player-card");
      if (!card) return;

      const name = card.querySelector<HTMLElement>(".player-card-copy b")?.textContent?.trim();
      if (!name) return;

      event.preventDefault();
      event.stopPropagation();
      router.push(`/players/profile?id=${encodeURIComponent(name)}`);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  return null;
}
