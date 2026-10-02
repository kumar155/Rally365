"use client";

import { useEffect } from "react";

/**
 * Keeps the shared Home bottom navigation aligned with the first-class
 * tournament experience. The Home page still owns the nav state; this bridge
 * only replaces the legacy Achievements slot with a direct Tournaments link.
 */
export default function TournamentNavBridge() {
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "rally365-tournament-bottom-nav-style";
    style.textContent = `
      .bottom-nav .tournaments-bottom-nav-link {
        min-width: 0;
        min-height: 58px;
        padding: 7px 2px 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        text-decoration: none;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      .bottom-nav .tournaments-bottom-nav-link svg {
        width: 21px;
        height: 21px;
        flex: 0 0 auto;
      }
      .bottom-nav .tournaments-bottom-nav-link span {
        font-size: 11px;
        line-height: 1.1;
        white-space: nowrap;
      }
      .bottom-nav .tournaments-bottom-nav-link:hover,
      .bottom-nav .tournaments-bottom-nav-link:focus-visible {
        color: #087f4f;
      }
    `;
    if (!document.getElementById(style.id)) document.head.appendChild(style);

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

    // The draw page is a client-state page. When the browser restores it from
    // the back/forward cache after a score was entered, its previous React
    // state can otherwise still contain the old 0-0 score. Force a fresh
    // server/client load for that navigation so the saved tournament_matches
    // values are rendered immediately.
    const handlePageShow = () => {
      if (window.location.pathname !== "/tournaments/draw") return;
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (navigation?.type === "back_forward") window.location.reload();
    };
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("pageshow", handlePageShow);
      document.getElementById(style.id)?.remove();
    };
  }, []);

  return null;
}
