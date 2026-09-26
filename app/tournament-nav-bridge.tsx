"use client";

import { useEffect } from "react";

/**
 * Keeps the shared Home bottom navigation aligned with the first-class
 * tournament experience. The Home page still owns the nav state; this bridge
 * only replaces the legacy Achievements slot with a direct Tournaments link.
 */
export default function TournamentNavBridge() {
  useEffect(() => {
    const trophySvg = `
      <svg viewBox="0 0 24 24" aria-hidden="true" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 21h8" />
        <path d="M12 17v4" />
        <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
        <path d="M7 6H4v2a4 4 0 0 0 4 4" />
        <path d="M17 6h3v2a4 4 0 0 1-4 4" />
      </svg>`;

    const apply = () => {
      const nav = document.querySelector<HTMLElement>(".bottom-nav");
      if (!nav) return;

      nav.style.gridTemplateColumns = "repeat(6, minmax(0, 1fr))";

      const achievementButton = Array.from(nav.querySelectorAll<HTMLButtonElement>("button"))
        .find(button => button.textContent?.trim().toLowerCase().includes("achievements"));

      if (achievementButton) achievementButton.remove();

      if (!nav.querySelector(".tournaments-bottom-nav-link")) {
        const link = document.createElement("a");
        link.href = "/tournaments";
        link.className = "tournaments-bottom-nav-link";
        link.setAttribute("aria-label", "Tournaments");
        link.innerHTML = `${trophySvg}<span>Tournaments</span>`;
        nav.appendChild(link);
      }
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(apply, 500);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
